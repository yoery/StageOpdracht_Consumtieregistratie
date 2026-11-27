<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

/**
 * Recognition — herkennen met de camera en de pas op de server (security audit AF-07 en AF-08).
 *
 * De kenmerken van gezichten (biometrische gegevens) en de pasnummers gaan nooit naar een browser,
 * ook niet naar de beheerder. Een tablet stuurt alleen:
 *   - de kenmerken (128 getallen) van het gezicht dat nu voor de camera staat, of
 *   - het nummer van de pas die nu tegen de lezer wordt gehouden,
 * en krijgt de id van de medewerker terug, of null. De rest doet de tablet zelf, net als eerst: twee
 * keer achter elkaar dezelfde uitkomst en de stille controle op een levend gezicht (FaceLiveness).
 *
 * Het vergelijken van gezichten gebeurt hier met dezelfde regel als in de browser
 * (FaceRecognitionDemo.findMatch): de afstand tussen de twee reeksen getallen, en alleen een
 * medewerker onder de drempel telt. Alleen actieve medewerkers (geen gasten) met een gezicht dat
 * korter dan een jaar geleden is ingesteld, doen mee.
 *
 * Een tablet kan zo niet zomaar pasnummers uitproberen: iedere sessie mag hooguit MAX_PER_MINUTE
 * keer per minuut iets laten herkennen.
 */
final class Recognition
{
    /** Gelijk aan FACE_DEMO.matchThreshold in assets/js/config.js (een test controleert dat). */
    public const MATCH_THRESHOLD = 0.5;

    /** Gelijk aan FACE_DEMO.validityDays in assets/js/config.js (een test controleert dat). */
    public const VALIDITY_DAYS = 365;

    /** Hoe vaak een sessie per minuut iets mag laten herkennen. De camera vraagt hooguit een paar keer per seconde. */
    public const MAX_PER_MINUTE = 240;

    public const DESCRIPTOR_LENGTH = 128;
    public const MAX_DESCRIPTOR_VALUE = 10;

    public function __construct(private readonly \PDO $pdo, private readonly RecordStore $store)
    {
    }

    /** Is dit een geldige reeks kenmerken: precies 128 eindige getallen tussen -10 en 10? */
    public static function isDescriptor(mixed $value): bool
    {
        if (!is_array($value) || count($value) !== self::DESCRIPTOR_LENGTH || !array_is_list($value)) {
            return false;
        }
        foreach ($value as $number) {
            if ((!is_int($number) && !is_float($number)) || !is_finite((float) $number) || abs((float) $number) > self::MAX_DESCRIPTOR_VALUE) {
                return false;
            }
        }

        return true;
    }

    /**
     * De actieve medewerker (geen gast) met het gezicht dat het meest lijkt op deze kenmerken, als de
     * afstand onder de drempel ligt. Anders null.
     *
     * @param list<int|float> $descriptor
     */
    public function matchFace(array $descriptor, \DateTimeImmutable $now): ?string
    {
        $active = [];
        foreach ($this->store->all('employees') as $employee) {
            if (($employee->active ?? false) === true && ($employee->guest ?? false) !== true && is_string($employee->id ?? null)) {
                $active[$employee->id] = true;
            }
        }

        $oldest = $now->getTimestamp() - self::VALIDITY_DAYS * 86400;
        $bestId = null;
        $bestDistance = INF;
        foreach ($this->store->all('faceEnrollments') as $entry) {
            $employeeId = $entry->employeeId ?? null;
            $enrolledAt = is_string($entry->enrolledAt ?? null) ? strtotime($entry->enrolledAt) : false;
            // Dezelfde regels als in de browser: niet verlopen, niet meer dan een dag in de toekomst en de
            // toestemming niet na het instellen (Policy::validFaceDates). Een instelling die de browser
            // afkeurt, ziet niemand en kan niemand uitzetten, dus die herkent ook niet.
            if (!is_string($employeeId) || !isset($active[$employeeId]) || $enrolledAt === false || $enrolledAt <= $oldest || !Policy::validFaceDates($entry, $now)) {
                continue;
            }
            $known = $entry->descriptor ?? null;
            if (!self::isDescriptor($known)) {
                continue;
            }
            $distance = self::distance($descriptor, $known);
            if ($distance < $bestDistance) {
                $bestDistance = $distance;
                $bestId = $employeeId;
            }
        }

        return $bestDistance < self::MATCH_THRESHOLD ? $bestId : null;
    }

    /**
     * Een pasnummer in de vaste vorm, zoals BadgeReader.normalize het maakt: spaties, ":" en "-" weg en
     * alles in hoofdletters. Daarna alleen letters en cijfers, 4 tot 64 tekens. Anders null.
     */
    public static function normalizeBadge(mixed $code): ?string
    {
        if (!is_string($code)) {
            return null;
        }
        $normalized = strtoupper((string) preg_replace('/[\s:\-]/', '', $code));

        return preg_match('/^[A-Z0-9]{4,64}$/', $normalized) === 1 ? $normalized : null;
    }

    /** De actieve medewerker met deze pas, of null. */
    public function findByBadge(string $code): ?string
    {
        foreach ($this->store->all('employees') as $employee) {
            if (($employee->badgeId ?? '') === $code && ($employee->active ?? false) === true && is_string($employee->id ?? null)) {
                return $employee->id;
            }
        }

        return null;
    }

    /**
     * Koppelt een pas aan een medewerker (Snellere optie instellen, FR-100). Geeft "ok", "taken" (de pas
     * hoort bij iemand anders), "has-badge" (de medewerker heeft al een pas) of "not-allowed" (geen
     * actieve medewerker, of een gast). Het logboek van de app krijgt de naam, nooit het pasnummer.
     */
    public function linkBadge(string $employeeId, string $code, \DateTimeImmutable $now): string
    {
        return $this->store->transaction(function () use ($employeeId, $code, $now): string {
            $employee = RecordStore::isSafeId($employeeId) ? $this->store->get('employees', $employeeId) : null;
            if ($employee === null || ($employee->active ?? false) !== true || ($employee->guest ?? false) === true) {
                return 'not-allowed';
            }
            if (($employee->badgeId ?? '') !== '') {
                return 'has-badge';
            }
            if ($this->findAnyByBadge($code) !== null) {
                return 'taken';
            }

            $stamp = $now->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
            $employee->badgeId = $code;
            $employee->badgeLinkedAt = $stamp;
            $this->store->put('employees', $employeeId, $employee, $now);

            $entry = new \stdClass();
            $entry->id = bin2hex(random_bytes(16));
            $entry->action = 'Pas gekoppeld door medewerker';
            $entry->details = is_string($employee->name ?? null) ? $employee->name : '';
            $entry->createdAt = $stamp;
            $this->store->put('auditLog', $entry->id, $entry, $now);

            return 'ok';
        });
    }

    /**
     * Mag deze sessie nu iets laten herkennen? Telt de verzoeken van de laatste minuut (in de tabel van
     * de inlogpogingen, met een eigen sleutel). Geeft false boven MAX_PER_MINUTE.
     */
    public function allow(string $subjectId, \DateTimeImmutable $now): bool
    {
        $key = hash('sha256', 'herkennen:' . $subjectId);
        $stamp = static fn (\DateTimeImmutable $moment): string => $moment->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
        $this->pdo->prepare('DELETE FROM login_attempts WHERE attempt_key = ? AND attempted_at < ?')->execute([$key, $stamp($now->modify('-60 seconds'))]);
        $count = $this->pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE attempt_key = ?');
        $count->execute([$key]);
        if ((int) $count->fetchColumn() >= self::MAX_PER_MINUTE) {
            return false;
        }
        $this->pdo->prepare('INSERT INTO login_attempts (attempt_key, attempted_at) VALUES (?, ?)')->execute([$key, $stamp($now)]);

        return true;
    }

    // Iedere medewerker met deze pas, ook een inactieve: een pas hoort bij hooguit één persoon.
    private function findAnyByBadge(string $code): ?string
    {
        foreach ($this->store->all('employees') as $employee) {
            if (($employee->badgeId ?? '') === $code) {
                return (string) $employee->id;
            }
        }

        return null;
    }

    /**
     * @param list<int|float> $a
     * @param list<int|float> $b
     */
    private static function distance(array $a, array $b): float
    {
        $sum = 0.0;
        foreach ($a as $index => $value) {
            $sum += ((float) $value - (float) $b[$index]) ** 2;
        }

        return sqrt($sum);
    }
}
