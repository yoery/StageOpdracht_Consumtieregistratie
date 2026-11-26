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
 *   - een nieuwe registratie. De prijs en het werkgevernummer vult de server zelf in vanuit zijn
 *     eigen gegevens, zodat een tablet daar niet mee kan knoeien. Wijzigen of verwijderen mag niet:
 *     corrigeren doet de beheerder;
 *   - de voorraad van een consumptiepunt (alleen het getal `stock`). De rest van het punt blijft;
 *   - een gezichtsinstelling of het antwoord op de vraag daarover, voor een actieve medewerker;
 *   - een nieuwe logboekregel (bijvoorbeeld "Gezichtsherkenning ingesteld").
 * Al het andere wordt geweigerd.
 */
final class Policy
{
    public const ROLE_ADMIN = 'admin';
    public const ROLE_DEVICE = 'device';

    /** Hoe ver een tablet terugkijkt in de registraties. */
    public const DEVICE_REGISTRATION_DAYS = 40;

    private const DEVICE_READ = ['employees', 'products', 'companies', 'points', 'registrations', 'faceEnrollments', 'faceOffers'];
    private const EMPLOYEE_FIELDS_HIDDEN = ['payrollCode', 'personnelNumber', 'employerNumber'];
    private const REGISTRATION_FIELDS = ['id', 'employeeId', 'productId', 'price', 'pointId', 'createdAt', 'employerNumber'];
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
     * regel wordt verwijderd, of false als de wijziging niet mag.
     */
    public function accept(string $role, string $collection, string $id, ?\stdClass $incoming): \stdClass|false|null
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
            'registrations' => $incoming !== null && $existing === null ? $this->newRegistration($incoming) : false,
            'points' => $incoming !== null && $existing !== null ? $this->stockOnly($existing, $incoming) : false,
            'faceEnrollments' => $this->faceEnrollment($incoming, $existing),
            'faceOffers' => $incoming !== null ? $this->faceOffer($incoming) : false,
            'auditLog' => $incoming !== null && $existing === null ? $this->auditEntry($incoming) : false,
            default => false,
        };
    }

    // Een registratie van een tablet: alleen voor een actieve medewerker en een bestaand product. De
    // prijs komt uit het product op de server en het werkgevernummer uit de medewerker of zijn bedrijf.
    private function newRegistration(\stdClass $incoming): \stdClass|false
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

        return $registration;
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

    // Een tablet mag van een consumptiepunt alleen de voorraad (het getal `stock`) wijzigen, en alleen
    // van producten die al bij het punt staan. Naam, bedrijf, aanbod, minimum en telling blijven.
    private function stockOnly(\stdClass $existing, \stdClass $incoming): \stdClass|false
    {
        if (!($existing->products ?? null) instanceof \stdClass || !($incoming->products ?? null) instanceof \stdClass) {
            return false;
        }
        $result = clone $existing;
        $result->products = clone $existing->products;
        foreach (get_object_vars($existing->products) as $productId => $entry) {
            $new = $incoming->products->$productId ?? null;
            if (!$entry instanceof \stdClass || !$new instanceof \stdClass || !property_exists($new, 'stock')) {
                continue;
            }
            $stock = $new->stock;
            if (!is_int($stock) || $stock < -100000 || $stock > 100000) {
                return false;
            }
            $copy = clone $entry;
            $copy->stock = $stock;
            $result->products->$productId = $copy;
        }

        return $result;
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
