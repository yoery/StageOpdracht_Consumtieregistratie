<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

/**
 * RecordStore — bewaart de gegevens van de app in de database, één rij per onderdeel.
 *
 * De website houdt zijn gegevens bij in lijsten (medewerkers, registraties, enzovoort). Iedere regel
 * uit zo'n lijst is hier één rij: de naam van de lijst (`collection`), de id en de inhoud als JSON.
 *
 * Iedere wijziging krijgt een oplopend volgnummer (`version`). Een tablet onthoudt het hoogste nummer
 * dat hij heeft gezien en vraagt daarna alleen wat er nieuwer is (`changesSince`). Zo zien alle
 * tablets en de computer van de beheerder dezelfde gegevens. Een verwijderde regel blijft als lege rij
 * staan (`deleted`), zodat de andere tablets horen dat hij weg is.
 *
 * `created_seq` is het volgnummer van het moment dat een regel voor het eerst binnenkwam. Daarmee
 * blijft de volgorde van de lijst gelijk op iedere tablet (de volgorde van invoeren).
 *
 * De inhoud wordt gelezen als object (stdClass) en niet als PHP-array. Zo blijft een leeg object
 * (`{}`, bijvoorbeeld een consumptiepunt zonder producten) een object en wordt het geen lege lijst
 * (`[]`): de website keurt zo'n regel anders af.
 *
 * Wie wat mag lezen en schrijven, bepaalt Policy. Deze class controleert alleen de vorm.
 */
final class RecordStore
{
    public const COLLECTIONS = ['employees', 'registrations', 'products', 'companies', 'points', 'auditLog', 'faceEnrollments', 'faceOffers'];

    public const MAX_RECORD_BYTES = 65536;

    private const FORBIDDEN_IDS = ['__proto__', 'constructor', 'prototype'];

    public function __construct(private readonly \PDO $pdo)
    {
    }

    /** Is dit een id zoals de website die maakt? Dezelfde regel als in DataStore.js. */
    public static function isSafeId(mixed $id): bool
    {
        return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) === 1 && !in_array($id, self::FORBIDDEN_IDS, true);
    }

    /** Het hoogste volgnummer dat is uitgegeven. Nul betekent: er is nog niets opgeslagen. */
    public function head(): int
    {
        return $this->counter('version');
    }

    /**
     * Alle regels van één lijst die niet zijn verwijderd, in de volgorde van invoeren.
     *
     * @return list<\stdClass>
     */
    public function all(string $collection): array
    {
        $statement = $this->pdo->prepare('SELECT data FROM records WHERE collection = ? AND deleted = 0 ORDER BY created_seq, id');
        $statement->execute([$collection]);

        return array_values(array_map(static fn (array $row): \stdClass => self::decode((string) $row['data']), $statement->fetchAll()));
    }

    public function get(string $collection, string $id): ?\stdClass
    {
        $statement = $this->pdo->prepare('SELECT data FROM records WHERE collection = ? AND id = ? AND deleted = 0');
        $statement->execute([$collection, $id]);
        $data = $statement->fetchColumn();

        return is_string($data) ? self::decode($data) : null;
    }

    /**
     * Wat er sinds een volgnummer is veranderd, in de volgorde van invoeren. Een verwijderde regel
     * heeft `data` null.
     *
     * @param list<string> $collections
     * @return list<array{collection: string, id: string, data: \stdClass|null, version: int}>
     */
    public function changesSince(int $since, array $collections = self::COLLECTIONS): array
    {
        $collections = array_values(array_intersect($collections, self::COLLECTIONS));
        if ($collections === []) {
            return [];
        }
        $marks = implode(', ', array_fill(0, count($collections), '?'));
        // Bij de eerste keer ophalen (since 0) hoeven verwijderde regels niet mee: de tablet kent ze niet.
        $deleted = $since <= 0 ? ' AND deleted = 0' : '';
        $statement = $this->pdo->prepare(
            "SELECT collection, id, data, version, deleted FROM records WHERE version > ? AND collection IN ($marks)$deleted ORDER BY created_seq, version, id"
        );
        $statement->execute([max(0, $since), ...$collections]);

        $changes = [];
        foreach ($statement->fetchAll() as $row) {
            $changes[] = [
                'collection' => (string) $row['collection'],
                'id' => (string) $row['id'],
                'data' => (int) $row['deleted'] === 1 ? null : self::decode((string) $row['data']),
                'version' => (int) $row['version'],
            ];
        }

        return $changes;
    }

    /** Slaat één regel op (nieuw of gewijzigd). De id in de inhoud moet gelijk zijn aan `$id`. */
    public function put(string $collection, string $id, \stdClass $data, ?\DateTimeImmutable $now = null): void
    {
        $this->check($collection, $id);
        if (($data->id ?? null) !== $id) {
            throw new \InvalidArgumentException('De id in de inhoud is anders dan de id van de regel.');
        }
        $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        if (strlen($json) > self::MAX_RECORD_BYTES) {
            throw new \InvalidArgumentException('De regel is te groot.');
        }
        $this->write($collection, $id, $json, 0, $now);
    }

    /** Verwijdert een regel. Bestaat hij niet, dan gebeurt er niets. */
    public function delete(string $collection, string $id, ?\DateTimeImmutable $now = null): void
    {
        $this->check($collection, $id);
        $statement = $this->pdo->prepare('SELECT deleted FROM records WHERE collection = ? AND id = ?');
        $statement->execute([$collection, $id]);
        $deleted = $statement->fetchColumn();
        if ($deleted === false || (int) $deleted === 1) {
            return;
        }
        $this->write($collection, $id, '{}', 1, $now);
    }

    /** Een losse instelling, of null als die er niet is. */
    public function meta(string $name): ?string
    {
        $statement = $this->pdo->prepare('SELECT value FROM meta WHERE name = ?');
        $statement->execute([$name]);
        $value = $statement->fetchColumn();

        return is_string($value) ? $value : null;
    }

    public function setMeta(string $name, string $value): void
    {
        Database::transaction($this->pdo, function () use ($name, $value): void {
            $this->pdo->prepare('DELETE FROM meta WHERE name = ?')->execute([$name]);
            $this->pdo->prepare('INSERT INTO meta (name, value) VALUES (?, ?)')->execute([$name, $value]);
        });
    }

    /**
     * @template T
     * @param \Closure(): T $work
     * @return T
     */
    public function transaction(\Closure $work): mixed
    {
        return Database::transaction($this->pdo, $work);
    }

    private function check(string $collection, string $id): void
    {
        if (!in_array($collection, self::COLLECTIONS, true)) {
            throw new \InvalidArgumentException('Onbekende lijst.');
        }
        if (!self::isSafeId($id)) {
            throw new \InvalidArgumentException('Ongeldige id.');
        }
    }

    private function write(string $collection, string $id, string $json, int $deleted, ?\DateTimeImmutable $now): void
    {
        $moment = ($now ?? new \DateTimeImmutable('now'))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
        Database::transaction($this->pdo, function () use ($collection, $id, $json, $deleted, $moment): void {
            $version = $this->next('version');
            $update = $this->pdo->prepare('UPDATE records SET data = ?, version = ?, deleted = ?, updated_at = ? WHERE collection = ? AND id = ?');
            $update->execute([$json, $version, $deleted, $moment, $collection, $id]);
            if ($update->rowCount() === 0) {
                $this->pdo
                    ->prepare('INSERT INTO records (collection, id, data, version, created_seq, deleted, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$collection, $id, $json, $version, $version, $deleted, $moment]);
            }
        });
    }

    private function counter(string $name): int
    {
        $statement = $this->pdo->prepare('SELECT value FROM counters WHERE name = ?');
        $statement->execute([$name]);
        $value = $statement->fetchColumn();

        return $value === false ? 0 : (int) $value;
    }

    // Het volgende volgnummer. Altijd binnen een transactie, zodat twee verzoeken nooit hetzelfde nummer krijgen.
    private function next(string $name): int
    {
        $update = $this->pdo->prepare('UPDATE counters SET value = value + 1 WHERE name = ?');
        $update->execute([$name]);
        if ($update->rowCount() === 0) {
            $this->pdo->prepare('INSERT INTO counters (name, value) VALUES (?, 1)')->execute([$name]);
        }

        return $this->counter($name);
    }

    private static function decode(string $json): \stdClass
    {
        $data = json_decode($json, false, 32, JSON_THROW_ON_ERROR);

        return $data instanceof \stdClass ? $data : new \stdClass();
    }
}
