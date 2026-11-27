<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * EmployeeSync — bepaalt wat een synchronisatie verandert (stap 3 tot en met 7 uit het TO,
 * paragraaf Koppeling met AFAS Profit). Deze class slaat zelf niets op: de uitkomst is een SyncPlan.
 *
 * De regels:
 *   - controleren (stap 3): is de lijst leeg, is geen enkele rij geldig of is de lijst veel korter dan
 *     de vorige keer, dan stopt de synchronisatie zonder iets te wijzigen;
 *   - koppelen (stap 4): een medewerker uit AFAS wordt gezocht op personeelsnummer;
 *   - nieuw (stap 5): een personeelsnummer dat nog niet bestaat, wordt een nieuwe, actieve
 *     medewerker. Geeft AFAS geen looncode, dan komt hij zonder looncode binnen en vult de beheerder
 *     die in de app in. Die krijgt het consumptiepunt met dezelfde naam als de werklocatie, als dat bij zijn
 *     bedrijf bestaat. Wie al uit dienst is, wordt niet toegevoegd;
 *   - gewijzigd (stap 6): zijn naam, bedrijf, afdeling of looncode anders, dan worden ze bijgewerkt.
 *     Het consumptiepunt van een bestaande medewerker blijft zoals de beheerder het heeft gekozen.
 *     Heeft hij nog geen punt, dan krijgt hij het punt van zijn afdeling (als de beheerder die afdeling
 *     aan een punt heeft gekoppeld, FR-102). Gaat hij naar een ander bedrijf, dan past het oude punt
 *     niet meer en volgt het punt van de afdeling (of geen punt);
 *   - uit dienst of niet meer in AFAS (stap 7): de medewerker wordt inactief en nooit verwijderd.
 *     Komt iemand weer in dienst, dan wordt hij weer actief;
 *   - een rij die is afgekeurd, verandert niets: die medewerker staat wel in AFAS en blijft zoals hij is.
 *
 * Verbonden met:
 *   - EmployeeMapper: levert de medewerkers uit AFAS (MappedRows);
 *   - SyncRunner: geeft de gegevens van de app mee en laat het plan opslaan.
 */
final class EmployeeSync
{
    /**
     * @param float $minimumShare het deel van de vorige lijst dat er minstens moet zijn. Met 0,5 stopt
     *                            de synchronisatie als AFAS minder dan de helft van de vorige keer geeft.
     */
    public function __construct(private readonly float $minimumShare = 0.5)
    {
    }

    /**
     * Maakt het plan.
     *
     * @param list<StoredEmployee> $current de medewerkers die nu in de app staan
     * @param array<string, string> $companyIds werkgevernummer => id van het bedrijf in de app
     * @param list<array{id: string, companyId: string, name: string}> $points de consumptiepunten
     * @param string $today de dag van vandaag, zoals "2026-11-25"
     * @param int|null $previousCount het aantal rijen van de vorige geslaagde synchronisatie
     */
    public function plan(MappedRows $mapped, array $current, array $companyIds, array $points, string $today, ?int $previousCount): SyncPlan
    {
        $this->check($mapped, $previousCount);

        $fromAfas = $this->byPersonnelNumber($mapped->employees);
        $untouched = array_flip($mapped->invalidNumbers());
        $additions = [];
        $updates = [];
        $notes = [];
        foreach ($mapped->problems as $problem) {
            $notes[] = sprintf('Rij %d afgekeurd: %s.', $problem['row'], $problem['reason']);
        }

        $stored = [];
        foreach ($current as $employee) {
            if ($employee->personnelNumber !== '') {
                $stored[$employee->personnelNumber] = $employee;
            }
        }

        foreach ($fromAfas as $number => $employee) {
            $number = (string) $number;
            if (isset($untouched[$number])) {
                continue;
            }

            $active = $employee->isActiveOn($today);
            $companyId = $companyIds[$employee->employerNumber] ?? null;
            if ($companyId === null) {
                $notes[] = sprintf('Personeelsnummer %s: werkgever %s is niet bekend in de app. Het bedrijf is niet gekoppeld.', $number, $employee->employerNumber);
            }

            $existing = $stored[$number] ?? null;
            if ($existing === null) {
                if (!$active) {
                    $notes[] = sprintf('Personeelsnummer %s is al uit dienst en is niet toegevoegd.', $number);
                    continue;
                }
                if ($employee->payrollCode === null) {
                    $notes[] = sprintf('Personeelsnummer %s is toegevoegd zonder looncode. De beheerder vult de looncode in de app in.', $number);
                }
                $additions[] = [
                    'personnelNumber' => $number,
                    'firstName' => $employee->firstName,
                    'lastName' => $employee->lastName,
                    'payrollCode' => $employee->payrollCode ?? '',
                    'unit' => $employee->workLocation,
                    'companyId' => $companyId,
                    'pointId' => $this->pointFor($employee->workLocation, $companyId, $points),
                    'active' => true,
                ];
                continue;
            }

            $changes = $this->changes($existing, $employee, $companyId, $active, $points);
            if ($changes !== []) {
                $updates[] = ['id' => $existing->id, 'personnelNumber' => $number, 'changes' => $changes];
            }
        }

        foreach ($stored as $number => $existing) {
            $number = (string) $number;
            if ($existing->active && !isset($fromAfas[$number]) && !isset($untouched[$number])) {
                $updates[] = ['id' => $existing->id, 'personnelNumber' => $number, 'changes' => ['active' => false]];
                $notes[] = sprintf('Personeelsnummer %s staat niet meer in AFAS en is inactief gezet.', $number);
            }
        }

        return new SyncPlan($additions, $updates, $notes, $mapped->receivedCount(), count($mapped->problems));
    }

    // Stap 3: een lege, onbruikbare of veel te korte lijst mag nooit medewerkers inactief maken.
    private function check(MappedRows $mapped, ?int $previousCount): void
    {
        $received = $mapped->receivedCount();
        if ($received === 0) {
            throw new AfasException(AfasException::CHECK, 'AFAS gaf een lege lijst. Er is niets gewijzigd.');
        }
        if ($mapped->employees === []) {
            throw new AfasException(AfasException::CHECK, sprintf('Geen van de %d rijen uit AFAS is geldig. Er is niets gewijzigd.', $received));
        }
        if ($previousCount !== null && $received < $previousCount * $this->minimumShare) {
            throw new AfasException(
                AfasException::CHECK,
                sprintf('AFAS gaf %d rijen, de vorige keer waren het er %d. Dat is veel minder, dus er is niets gewijzigd.', $received, $previousCount)
            );
        }
    }

    /**
     * Zet de medewerkers uit AFAS op personeelsnummer. Komt een nummer twee keer voor met dezelfde
     * gegevens (dat kan als de lijst tijdens het ophalen verschuift), dan telt het één keer. Zijn de
     * gegevens verschillend, dan is niet te zeggen welke klopt en stopt de synchronisatie.
     *
     * @param list<AfasEmployee> $employees
     * @return array<string, AfasEmployee>
     */
    private function byPersonnelNumber(array $employees): array
    {
        $byNumber = [];
        foreach ($employees as $employee) {
            $earlier = $byNumber[$employee->personnelNumber] ?? null;
            if ($earlier !== null && $earlier != $employee) {
                throw new AfasException(
                    AfasException::CHECK,
                    sprintf('Personeelsnummer %s komt twee keer voor in AFAS met verschillende gegevens. Er is niets gewijzigd.', $employee->personnelNumber)
                );
            }
            $byNumber[$employee->personnelNumber] = $employee;
        }

        return $byNumber;
    }

    /**
     * Wat er bij een bestaande medewerker verandert. Een lege lijst betekent: niets.
     *
     * @param list<array{id: string, companyId: string, name: string}> $points
     * @return array<string, mixed>
     */
    private function changes(StoredEmployee $existing, AfasEmployee $employee, ?string $companyId, bool $active, array $points): array
    {
        $changes = [];
        if ($existing->firstName !== $employee->firstName) {
            $changes['firstName'] = $employee->firstName;
        }
        if ($existing->lastName !== $employee->lastName) {
            $changes['lastName'] = $employee->lastName;
        }
        // Geeft AFAS geen looncode, dan blijft de looncode die de beheerder in de app heeft ingevuld.
        if ($employee->payrollCode !== null && $existing->payrollCode !== $employee->payrollCode) {
            $changes['payrollCode'] = $employee->payrollCode;
        }
        // Een onbekende werkgever verandert het bedrijf niet. Bij een ander bedrijf hoort het oude
        // consumptiepunt niet meer bij de medewerker.
        if ($existing->unit !== $employee->workLocation) {
            $changes['unit'] = $employee->workLocation;
        }
        if ($companyId !== null && $existing->companyId !== $companyId) {
            $changes['companyId'] = $companyId;
            $changes['pointId'] = $this->pointFor($employee->workLocation, $companyId, $points);
        } elseif ($existing->pointId === null) {
            // Nog geen consumptiepunt: het punt van de afdeling, als die aan een punt is gekoppeld.
            $point = $this->pointFor($employee->workLocation, $existing->companyId, $points);
            if ($point !== null) {
                $changes['pointId'] = $point;
            }
        }
        if ($existing->active !== $active) {
            $changes['active'] = $active;
        }

        return $changes;
    }

    /**
     * Het consumptiepunt van de afdeling (of werklocatie) binnen het bedrijf van de medewerker: eerst een
     * punt waaraan de beheerder deze afdeling heeft gekoppeld (`units`, FR-102), anders een punt met
     * dezelfde naam. Hoofdletters tellen niet mee. Anders null: dan kiest de beheerder later een punt.
     *
     * @param list<array{id: string, companyId: string, name: string, units?: list<string>}> $points
     */
    private function pointFor(string $workLocation, ?string $companyId, array $points): ?string
    {
        if ($workLocation === '' || $companyId === null) {
            return null;
        }
        $wanted = $this->lower($workLocation);
        foreach ($points as $point) {
            $units = array_map(fn (string $unit): string => $this->lower($unit), $point['units'] ?? []);
            if ($point['companyId'] === $companyId && in_array($wanted, $units, true)) {
                return $point['id'];
            }
        }
        foreach ($points as $point) {
            if ($point['companyId'] === $companyId && $this->lower($point['name']) === $wanted) {
                return $point['id'];
            }
        }

        return null;
    }

    private function lower(string $text): string
    {
        $text = trim($text);

        return function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
    }
}
