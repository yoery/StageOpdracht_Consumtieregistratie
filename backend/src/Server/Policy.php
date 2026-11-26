<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

/**
 * Policy — wie mag wat lezen en schrijven.
 *
 * Er zijn twee rollen:
 *   - de beheerder (ingelogd met e-mailadres en wachtwoord) mag alles lezen en wijzigen;
 *   - een gekoppelde tablet mag alleen wat nodig is om te registreren.
 *
 * Wat een tablet krijgt (dataminimalisatie):
 *   - medewerkers zonder looncode, personeelsnummer en afwijkend werkgevernummer. De tablet heeft
 *     alleen de naam, het bedrijf, het consumptiepunt en het pasnummer nodig;
 *   - producten, bedrijven en consumptiepunten;
 *   - registraties van de laatste 40 dagen (voor "zelfde als vorige keer" en voor wie op deze tablet
 *     het vaakst registreert). Het logboek krijgt een tablet niet.
 *
 * Wat een tablet mag schrijven:
 *   - een nieuwe registratie. De server zet er de id van de tablet bij (`deviceId`), zodat een
 *     tablet kan zien wie er het vaakst op die tablet registreert (FR-97).
 *     De prijs en het werkgevernummer vult de server zelf in vanuit zijn
 *     eigen gegevens, zodat een tablet daar niet mee kan knoeien. Wijzigen of verwijderen mag niet:
 *     corrigeren doet de beheerder. De voorraad van het consumptiepunt gaat op de server zelf met 1
 *     omlaag (`registrationStored`). Zo klopt de voorraad ook als twee tablets tegelijk registreren;
 *   - een wijziging van een consumptiepunt door een tablet wordt stil overgeslagen. De tablet
 *     verlaagt de voorraad wel op het eigen scherm, maar de server telt zelf;
 *   - een gezichtsinstelling of het antwoord op de vraag daarover, voor een actieve medewerker;
 *   - een nieuwe logboekregel (bijvoorbeeld "Gezichtsherkenning ingesteld");
 *   - een pas koppelen aan een actieve medewerker die nog geen pas heeft (Snellere optie instellen,
 *     FR-100). Alleen het pasnummer en het moment van koppelen worden overgenomen, en alleen als die pas
 *     nog bij niemand hoort. De rest van de medewerker blijft zoals hij op de server staat;
 *   - een nieuwe gast (FR-98): alleen een naam en een telefoonnummer. De server maakt de regel zelf,
 *     zonder looncode, personeelsnummer, bedrijf of pas. Het telefoonnummer ziet een tablet daarna
 *     niet meer terug: alleen de beheerder.
 * Al het andere wordt geweigerd.
 */
final class Policy
{
    public const ROLE_ADMIN = 'admin';
    public const ROLE_DEVICE = 'device';

    /** Hoe ver een tablet terugkijkt in de registraties. */
    public const DEVICE_REGISTRATION_DAYS = 40;

    private const DEVICE_READ = ['employees', 'products', 'companies', 'points', 'registrations', 'faceEnrollments', 'faceOffers'];
    private const EMPLOYEE_FIELDS_HIDDEN = ['payrollCode', 'personnelNumber', 'employerNumber', 'phone'];
    private const COLORS = ['#d8f1e8', '#e3eef6', '#f8e9d9', '#e9e0f4', '#e4f0d8'];
    private const FACE_ENROLLMENT_FIELDS = ['id', 'employeeId', 'descriptor', 'enrolledAt', 'consentAt'];
    private const FACE_OFFER_FIELDS = ['id', 'employeeId', 'answer', 'answeredAt'];
    private const AUDIT_FIELDS = ['id', 'action', 'details', 'createdAt'];

    private const ISO_DATE_TIME = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/';

    public function __construct(private readonly RecordStore $store)
    {
    }

    /**
     * De lijsten die deze rol mag lezen.
     *
     * @return list<string>
     */
    public function readable(string $role): array
    {
        return $role === self::ROLE_ADMIN ? RecordStore::COLLECTIONS : self::DEVICE_READ;
    }

    /**
     * De inhoud zoals deze rol hem mag zien. Geeft false als de regel voor deze rol niet bestaat
     * (bijvoorbeeld een oude registratie voor een tablet).
     */
    public function visible(string $role, string $collection, \stdClass $data, \DateTimeImmutable $now): \stdClass|false
    {
        if ($role === self::ROLE_ADMIN) {
            return $data;
        }
        if (!in_array($collection, self::DEVICE_READ, true)) {
            return false;
        }
        if ($collection === 'employees') {
            $copy = clone $data;
            foreach (self::EMPLOYEE_FIELDS_HIDDEN as $field) {
                $copy->$field = '';
            }

            return $copy;
        }
        if ($collection === 'registrations') {
            $created = is_string($data->createdAt ?? null) ? strtotime($data->createdAt) : false;
            $oldest = $now->getTimestamp() - self::DEVICE_REGISTRATION_DAYS * 86400;

            return $created !== false && $created >= $oldest ? $data : false;
        }

        return $data;
    }

    /**
     * Beoordeelt één wijziging. `$incoming` is de nieuwe inhoud, of null als de regel wordt verwijderd.
     * Geeft de inhoud terug die wordt opgeslagen (de server kan velden zelf invullen), null als de
     * regel wordt verwijderd, false als de wijziging niet mag, of true als de wijziging mag maar er
     * niets wordt opgeslagen.
     */
    public function accept(string $role, string $collection, string $id, ?\stdClass $incoming, ?string $deviceId = null): \stdClass|bool|null
    {
        if (!in_array($collection, RecordStore::COLLECTIONS, true) || !RecordStore::isSafeId($id)) {
            return false;
        }
        if ($incoming !== null && ($incoming->id ?? null) !== $id) {
            return false;
        }
        if ($role === self::ROLE_ADMIN) {
            return $incoming;
        }
        if ($role !== self::ROLE_DEVICE) {
            return false;
        }

        $existing = $this->store->get($collection, $id);

        return match ($collection) {
            'registrations' => $incoming !== null && $existing === null ? $this->newRegistration($incoming, $deviceId) : false,
            'employees' => $incoming === null ? false : ($existing === null ? $this->newGuest($incoming) : $this->badgeSelfLink($existing, $incoming)),
            'points' => $incoming !== null && $existing !== null,
            'faceEnrollments' => $this->faceEnrollment($incoming, $existing),
            'faceOffers' => $incoming !== null ? $this->faceOffer($incoming) : false,
            'auditLog' => $incoming !== null && $existing === null ? $this->auditEntry($incoming) : false,
            default => false,
        };
    }

    // Een registratie van een tablet: alleen voor een actieve medewerker en een bestaand product. De
    // prijs komt uit het product op de server en het werkgevernummer uit de medewerker of zijn bedrijf.
    private function newRegistration(\stdClass $incoming, ?string $deviceId): \stdClass|false
    {
        $employeeId = $incoming->employeeId ?? null;
        $productId = $incoming->productId ?? null;
        if (!RecordStore::isSafeId($employeeId) || !RecordStore::isSafeId($productId) || !$this->isDateTime($incoming->createdAt ?? null)) {
            return false;
        }
        $employee = $this->store->get('employees', $employeeId);
        $product = $this->store->get('products', $productId);
        if ($employee === null || ($employee->active ?? false) !== true || $product === null) {
            return false;
        }
        $pointId = $incoming->pointId ?? null;
        if ($pointId !== null && (!RecordStore::isSafeId($pointId) || $this->store->get('points', $pointId) === null)) {
            return false;
        }

        $registration = new \stdClass();
        $registration->id = $incoming->id;
        $registration->employeeId = $employeeId;
        $registration->productId = $productId;
        $registration->price = $product->price ?? 0;
        $registration->pointId = $pointId;
        $registration->createdAt = $incoming->createdAt;
        $employerNumber = $this->employerNumber($employee);
        if ($employerNumber !== '') {
            $registration->employerNumber = $employerNumber;
        }
        if ($deviceId !== null && RecordStore::isSafeId($deviceId)) {
            $registration->deviceId = $deviceId;
        }

        return $registration;
    }

    // Een nieuwe gast van een tablet. Alleen `guest: true`, een voor- en achternaam en een
    // telefoonnummer worden overgenomen. De rest vult de server zelf in.
    private function newGuest(\stdClass $incoming): \stdClass|false
    {
        $firstName = is_string($incoming->firstName ?? null) ? trim($incoming->firstName) : '';
        $lastName = is_string($incoming->lastName ?? null) ? trim($incoming->lastName) : '';
        $phone = is_string($incoming->phone ?? null) ? trim($incoming->phone) : '';
        $digits = strlen((string) preg_replace('/\D/', '', $phone));
        $validName = static fn (string $name): bool => $name !== '' && strlen($name) <= 100 && preg_match('/[\x00-\x1F\x7F]/', $name) !== 1;
        if (($incoming->guest ?? false) !== true || !$validName($firstName) || !$validName($lastName)
            || preg_match('/^[+0-9 ()-]{8,25}$/', $phone) !== 1 || $digits < 8 || $digits > 15) {
            return false;
        }

        $guest = new \stdClass();
        $guest->id = $incoming->id;
        $guest->name = $firstName . ' ' . $lastName;
        $guest->firstName = $firstName;
        $guest->lastName = $lastName;
        $guest->payrollCode = '';
        $guest->personnelNumber = '';
        $guest->employerNumber = '';
        $guest->companyId = null;
        $guest->pointId = null;
        $guest->active = true;
        $guest->color = in_array($incoming->color ?? null, self::COLORS, true) ? $incoming->color : self::COLORS[0];
        $guest->badgeId = '';
        $guest->guest = true;
        $guest->phone = $phone;

        return $guest;
    }

    // Een tablet koppelt een pas aan een medewerker (Snellere optie instellen). Mag alleen bij een actieve
    // medewerker zonder pas, met een geldig pasnummer dat nog bij niemand hoort.
    private function badgeSelfLink(\stdClass $existing, \stdClass $incoming): \stdClass|false
    {
        $badgeId = $incoming->badgeId ?? null;
        if (($existing->active ?? false) !== true || ($existing->guest ?? false) === true || ($existing->badgeId ?? '') !== ''
            || !is_string($badgeId) || preg_match('/^[A-Z0-9]{4,64}$/', $badgeId) !== 1) {
            return false;
        }
        foreach ($this->store->all('employees') as $other) {
            if (($other->badgeId ?? '') === $badgeId && ($other->id ?? null) !== ($existing->id ?? null)) {
                return false;
            }
        }
        $linked = clone $existing;
        $linked->badgeId = $badgeId;
        $linked->badgeLinkedAt = $this->isDateTime($incoming->badgeLinkedAt ?? null) ? $incoming->badgeLinkedAt : gmdate('Y-m-d\TH:i:s\Z');

        return $linked;
    }

    // Het werkgevernummer van een medewerker: zijn eigen afwijkende nummer, anders dat van zijn bedrijf.
    private function employerNumber(\stdClass $employee): string
    {
        $own = $employee->employerNumber ?? '';
        if (is_string($own) && $own !== '') {
            return $own;
        }
        $companyId = $employee->companyId ?? null;
        $company = RecordStore::isSafeId($companyId) ? $this->store->get('companies', $companyId) : null;
        $number = $company->employerNumber ?? '';

        return is_string($number) ? $number : '';
    }

    /**
     * Na het opslaan van een registratie van een tablet: de voorraad van het consumptiepunt gaat met 1
     * omlaag, met dezelfde regel als de website (RegistrationModel.addRegistration). Alleen als het
     * product op dat punt wordt aangeboden, en niet als de registratie van vóór de laatste telling is
     * (die zat dan al in de telling). De voorraad mag onder nul komen: er is dan meer geregistreerd
     * dan geteld.
     */
    public function registrationStored(\stdClass $registration, \DateTimeImmutable $now): void
    {
        $pointId = $registration->pointId ?? null;
        $productId = $registration->productId ?? null;
        $point = RecordStore::isSafeId($pointId) ? $this->store->get('points', $pointId) : null;
        $entry = $point !== null && ($point->products ?? null) instanceof \stdClass && RecordStore::isSafeId($productId) ? ($point->products->$productId ?? null) : null;
        if (!$entry instanceof \stdClass || ($entry->offered ?? false) !== true || (!is_int($entry->stock ?? null) && !is_float($entry->stock ?? null))) {
            return;
        }
        $countedAt = is_string($entry->countedAt ?? null) ? strtotime($entry->countedAt) : false;
        $createdAt = strtotime((string) $registration->createdAt);
        if ($countedAt !== false && $createdAt !== false && $createdAt < $countedAt) {
            return;
        }
        $entry->stock = $entry->stock - 1;
        $this->store->put('points', $pointId, $point, $now);
    }

    // Een gezichtsinstelling: alleen voor een actieve medewerker, met precies 128 getallen. Verwijderen
    // (uitzetten of verlopen) mag ook vanaf een tablet.
    private function faceEnrollment(?\stdClass $incoming, ?\stdClass $existing): \stdClass|false|null
    {
        if ($incoming === null) {
            return $existing === null ? false : null;
        }
        if (!$this->onlyFields($incoming, self::FACE_ENROLLMENT_FIELDS) || !$this->activeEmployee($incoming->employeeId ?? null)) {
            return false;
        }
        $descriptor = $incoming->descriptor ?? null;
        if (!is_array($descriptor) || count($descriptor) !== 128) {
            return false;
        }
        foreach ($descriptor as $value) {
            if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || abs((float) $value) > 10) {
                return false;
            }
        }

        return $this->isDateTime($incoming->enrolledAt ?? null) && $this->isDateTime($incoming->consentAt ?? null) ? $incoming : false;
    }

    private function faceOffer(\stdClass $incoming): \stdClass|false
    {
        $valid = $this->onlyFields($incoming, self::FACE_OFFER_FIELDS)
            && $this->activeEmployee($incoming->employeeId ?? null)
            && is_string($incoming->answer ?? null) && strlen($incoming->answer) <= 32
            && $this->isDateTime($incoming->answeredAt ?? null);

        return $valid ? $incoming : false;
    }

    private function auditEntry(\stdClass $incoming): \stdClass|false
    {
        $valid = $this->onlyFields($incoming, self::AUDIT_FIELDS)
            && $this->isText($incoming->action ?? null) && $this->isText($incoming->details ?? null, true)
            && $this->isDateTime($incoming->createdAt ?? null);

        return $valid ? $incoming : false;
    }

    private function activeEmployee(mixed $employeeId): bool
    {
        $employee = RecordStore::isSafeId($employeeId) ? $this->store->get('employees', $employeeId) : null;

        return $employee !== null && ($employee->active ?? false) === true;
    }

    /** @param list<string> $fields */
    private function onlyFields(\stdClass $data, array $fields): bool
    {
        return array_diff(array_keys(get_object_vars($data)), $fields) === [];
    }

    private function isText(mixed $value, bool $mayBeEmpty = false): bool
    {
        if (!is_string($value) || strlen($value) > 2000 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value) === 1) {
            return false;
        }

        return $mayBeEmpty || $value !== '';
    }

    private function isDateTime(mixed $value): bool
    {
        return is_string($value) && preg_match(self::ISO_DATE_TIME, $value) === 1 && strtotime($value) !== false;
    }
}
