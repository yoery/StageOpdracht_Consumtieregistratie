<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

use Tvb\Consumptie\Afas\EmployeeRepository;
use Tvb\Consumptie\Afas\StoredEmployee;
use Tvb\Consumptie\Afas\SyncPlan;

/**
 * RecordEmployeeRepository — de opslag waar de synchronisatie met AFAS mee werkt: de medewerkers,
 * bedrijven en consumptiepunten in de database van de server (RecordStore).
 *
 * `apply` voert een plan uit in één transactie:
 *   - een nieuwe medewerker krijgt een eigen willekeurige id (het personeelsnummer zit daar bewust
 *     niet in, want een tablet ziet de id wel en het personeelsnummer niet), een kleur uit de
 *     huisstijl en nog geen pas;
 *   - bij een wijziging worden alleen de velden uit het plan aangepast. Het pasnummer, de kleur en
 *     een looncode die de beheerder heeft ingevuld, blijven staan;
 *   - wordt een medewerker inactief, dan wordt zijn gezichtsinstelling gewist. Dat doet de website
 *     ook als de beheerder iemand deactiveert;
 *   - er komt één regel in het logboek van de app, alleen met aantallen.
 * Er wordt nooit een medewerker verwijderd.
 */
final class RecordEmployeeRepository implements EmployeeRepository
{
    /** De kleuren van de medewerkerkaarten, gelijk aan COLORS in assets/js/config.js. */
    public const COLORS = ['#d8f1e8', '#e3eef6', '#f8e9d9', '#e9e0f4', '#e4f0d8'];

    public function __construct(private readonly RecordStore $store)
    {
    }

    public function employees(): array
    {
        $employees = [];
        foreach ($this->store->all('employees') as $employee) {
            $employees[] = new StoredEmployee(
                self::text($employee->id ?? ''),
                self::text($employee->personnelNumber ?? ''),
                self::text($employee->firstName ?? ''),
                self::text($employee->lastName ?? ''),
                self::text($employee->payrollCode ?? ''),
                is_string($employee->companyId ?? null) ? $employee->companyId : null,
                is_string($employee->pointId ?? null) ? $employee->pointId : null,
                ($employee->active ?? false) === true,
                self::text($employee->unit ?? '')
            );
        }

        return $employees;
    }

    public function companyIdsByEmployerNumber(): array
    {
        $companies = [];
        foreach ($this->store->all('companies') as $company) {
            $number = self::text($company->employerNumber ?? '');
            if ($number !== '' && is_string($company->id ?? null)) {
                $companies[$number] = $company->id;
            }
        }

        return $companies;
    }

    public function points(): array
    {
        $points = [];
        foreach ($this->store->all('points') as $point) {
            if (is_string($point->id ?? null) && is_string($point->companyId ?? null)) {
                $units = is_array($point->units ?? null) ? array_values(array_filter($point->units, 'is_string')) : [];
                $points[] = ['id' => $point->id, 'companyId' => $point->companyId, 'name' => self::text($point->name ?? ''), 'units' => $units];
            }
        }

        return $points;
    }

    public function lastReceivedCount(): ?int
    {
        $count = $this->store->meta('afas_last_count');

        return $count === null ? null : (int) $count;
    }

    public function apply(SyncPlan $plan, \DateTimeImmutable $now): void
    {
        $this->store->transaction(function () use ($plan, $now): void {
            // Eerst de nieuwe bedrijven, zodat de medewerkers ernaar kunnen verwijzen. Bestaat de id al
            // (de beheerder heeft het bedrijf intussen aangepast), dan blijft het bedrijf zoals het is.
            foreach ($plan->companies as $company) {
                if ($this->store->get('companies', $company['id']) !== null) {
                    continue;
                }
                $record = new \stdClass();
                $record->id = $company['id'];
                $record->name = $company['name'];
                $record->employerNumber = $company['employerNumber'];
                $this->store->put('companies', $record->id, $record, $now);
            }

            $count = count($this->store->all('employees'));
            foreach ($plan->additions as $addition) {
                $employee = new \stdClass();
                $employee->id = self::newId();
                $employee->name = trim($addition['firstName'] . ' ' . $addition['lastName']);
                $employee->firstName = $addition['firstName'];
                $employee->lastName = $addition['lastName'];
                $employee->payrollCode = $addition['payrollCode'];
                $employee->personnelNumber = $addition['personnelNumber'];
                if (($addition['unit'] ?? '') !== '') {
                    $employee->unit = $addition['unit'];
                }
                $employee->employerNumber = '';
                $employee->companyId = $addition['companyId'];
                $employee->pointId = $addition['pointId'];
                $employee->active = $addition['active'];
                $employee->color = self::COLORS[$count % count(self::COLORS)];
                $employee->badgeId = '';
                $this->store->put('employees', $employee->id, $employee, $now);
                $count++;
            }

            foreach ($plan->updates as $update) {
                $employee = $this->store->get('employees', $update['id']);
                if ($employee === null) {
                    continue; // intussen verwijderd door de beheerder
                }
                foreach ($update['changes'] as $field => $value) {
                    $employee->$field = $value;
                }
                $employee->name = trim(self::text($employee->firstName ?? '') . ' ' . self::text($employee->lastName ?? ''));
                $this->store->put('employees', $update['id'], $employee, $now);

                if (($update['changes']['active'] ?? null) === false) {
                    $this->forgetFace($update['id'], $now);
                }
            }

            if (!$plan->isEmpty()) {
                $entry = new \stdClass();
                $entry->id = self::newId();
                $entry->action = 'Gesynchroniseerd uit AFAS';
                $entry->details = ucfirst($plan->summary()) . '.';
                $entry->createdAt = $now->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
                $this->store->put('auditLog', $entry->id, $entry, $now);
            }

            $this->store->setMeta('afas_last_count', (string) $plan->receivedCount);
            $this->store->setMeta('afas_last_success_at', self::stamp($now));
            $this->store->setMeta('afas_last_message', 'Gelukt: ' . $plan->summary() . '.');
        });
    }

    public function recordFailure(string $message, \DateTimeImmutable $now): void
    {
        $this->store->setMeta('afas_last_failure_at', self::stamp($now));
        $this->store->setMeta('afas_last_message', $message);
    }

    // Wist de gezichtsinstelling en het antwoord op de vraag daarover van een medewerker die inactief wordt.
    private function forgetFace(string $employeeId, \DateTimeImmutable $now): void
    {
        foreach (['faceEnrollments', 'faceOffers'] as $collection) {
            foreach ($this->store->all($collection) as $entry) {
                if (($entry->employeeId ?? null) === $employeeId && is_string($entry->id ?? null)) {
                    $this->store->delete($collection, $entry->id, $now);
                }
            }
        }
    }

    // Een id in dezelfde vorm als de website maakt (een willekeurige UUID, versie 4).
    private static function newId(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }

    private static function text(mixed $value): string
    {
        return is_string($value) ? $value : (is_int($value) ? (string) $value : '');
    }

    private static function stamp(\DateTimeImmutable $moment): string
    {
        return $moment->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }
}
