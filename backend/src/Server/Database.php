<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

/**
 * Database — maakt de verbinding met de database en zet de tabellen klaar.
 *
 * Standaard is de database één SQLite-bestand (`/data/consumptie.sqlite` in de container). Met
 * `CR_DB_DSN`, `CR_DB_GEBRUIKER` en `CR_DB_WACHTWOORD` kan het ook een PostgreSQL- of MySQL-database
 * zijn. De tabellen gebruiken daarom alleen SQL dat in alle drie werkt.
 *
 * De tabellen:
 *   - `records`: alle gegevens van de app (medewerkers, registraties, producten, bedrijven,
 *     consumptiepunten, logboek, gezichtsinstellingen), één rij per onderdeel, als JSON. Iedere
 *     wijziging krijgt een oplopend volgnummer (`version`), zodat een tablet kan vragen wat er sinds
 *     zijn laatste bezoek is veranderd (zie RecordStore);
 *   - `counters`: de tellers voor die volgnummers;
 *   - `meta`: losse instellingen, zoals het resultaat van de laatste synchronisatie met AFAS;
 *   - `admins`, `devices`, `sessions` en `login_attempts`: inloggen (zie Auth).
 */
final class Database
{
    public const DEFAULT_DSN = 'sqlite:/data/consumptie.sqlite';

    /**
     * De verbinding volgens de omgeving van de server. Het wachtwoord van de database komt alleen uit
     * de omgeving en nooit uit de code.
     *
     * @param array<string, string|false>|null $environment alleen voor tests
     */
    public static function fromEnvironment(?array $environment = null): \PDO
    {
        $read = static function (string $name) use ($environment): string {
            $value = $environment === null ? getenv($name) : ($environment[$name] ?? false);

            return is_string($value) ? trim($value) : '';
        };
        $dsn = $read('CR_DB_DSN');

        return self::connect($dsn === '' ? self::DEFAULT_DSN : $dsn, $read('CR_DB_GEBRUIKER'), $read('CR_DB_WACHTWOORD'));
    }

    public static function connect(string $dsn, string $user = '', #[\SensitiveParameter] string $password = ''): \PDO
    {
        // Een SQLite-bestand in een map die nog niet bestaat (bijvoorbeeld backend/data/ de eerste keer
        // op een eigen computer): eerst de map maken, anders kan SQLite het bestand niet aanmaken.
        if (str_starts_with($dsn, 'sqlite:') && !str_contains($dsn, ':memory:')) {
            $directory = dirname(substr($dsn, strlen('sqlite:')));
            if ($directory !== '' && $directory !== '.' && !is_dir($directory)) {
                @mkdir($directory, 0700, true);
            }
        }
        $pdo = new \PDO($dsn, $user === '' ? null : $user, $password === '' ? null : $password, [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        if ($pdo->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            // Wachten als een ander verzoek net schrijft, in plaats van meteen een fout te geven.
            $pdo->exec('PRAGMA busy_timeout = 5000');
            $pdo->exec('PRAGMA foreign_keys = ON');
            if (!str_contains($dsn, ':memory:')) {
                $pdo->exec('PRAGMA journal_mode = WAL');
            }
        }
        self::migrate($pdo);

        return $pdo;
    }

    /** Maakt de tabellen als ze er nog niet zijn. Mag iedere keer worden aangeroepen. */
    public static function migrate(\PDO $pdo): void
    {
        $statements = [
            'CREATE TABLE IF NOT EXISTS counters (name VARCHAR(64) PRIMARY KEY, value BIGINT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS meta (name VARCHAR(64) PRIMARY KEY, value TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS records (
                collection VARCHAR(32) NOT NULL,
                id VARCHAR(64) NOT NULL,
                data TEXT NOT NULL,
                version BIGINT NOT NULL,
                created_seq BIGINT NOT NULL,
                deleted SMALLINT NOT NULL DEFAULT 0,
                updated_at VARCHAR(32) NOT NULL,
                PRIMARY KEY (collection, id)
            )',
            'CREATE INDEX IF NOT EXISTS records_version ON records (version)',
            'CREATE TABLE IF NOT EXISTS admins (
                id VARCHAR(64) PRIMARY KEY,
                username VARCHAR(190) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at VARCHAR(32) NOT NULL
            )',
            'CREATE TABLE IF NOT EXISTS devices (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                point_id VARCHAR(64),
                created_at VARCHAR(32) NOT NULL,
                revoked_at VARCHAR(32)
            )',
            'CREATE TABLE IF NOT EXISTS sessions (
                token_hash VARCHAR(64) PRIMARY KEY,
                kind VARCHAR(16) NOT NULL,
                subject_id VARCHAR(64) NOT NULL,
                csrf VARCHAR(64) NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                last_seen_at VARCHAR(32) NOT NULL,
                expires_at VARCHAR(32) NOT NULL
            )',
            'CREATE TABLE IF NOT EXISTS login_attempts (
                attempt_key VARCHAR(64) NOT NULL,
                attempted_at VARCHAR(32) NOT NULL
            )',
            'CREATE INDEX IF NOT EXISTS login_attempts_key ON login_attempts (attempt_key, attempted_at)',
        ];
        foreach ($statements as $statement) {
            $pdo->exec($statement);
        }
        // Sinds versie 3.35 logt een beheerder in met een gebruikersnaam in plaats van een e-mailadres.
        // Een database van daarvoor heeft de kolom `email`. Die krijgt de nieuwe naam, zodat een
        // bestaande beheerder kan inloggen met zijn oude e-mailadres als gebruikersnaam.
        if (self::hasColumn($pdo, 'admins', 'email')) {
            $pdo->exec('ALTER TABLE admins RENAME COLUMN email TO username');
        }
    }

    private static function hasColumn(\PDO $pdo, string $table, string $column): bool
    {
        try {
            $pdo->query(sprintf('SELECT %s FROM %s WHERE 1 = 0', $column, $table));

            return true;
        } catch (\PDOException) {
            return false;
        }
    }

    /** @var \WeakMap<\PDO, true>|null De verbindingen waarop nu een transactie loopt. */
    private static ?\WeakMap $open = null;

    /**
     * Voert `$work` uit in één transactie. Gaat er iets mis, dan wordt alles teruggedraaid.
     *
     * Een transactie neemt meteen het recht om te schrijven. Anders kan een ander verzoek schrijven
     * tussen het lezen en het schrijven van deze transactie in. SQLite (in WAL-modus) geeft dan meteen
     * "database is locked", ook met busy_timeout, en in PostgreSQL en MySQL zou de transactie verder
     * werken met wat ze eerder las (bijvoorbeeld twee keer dezelfde pas koppelen). Daarom: in SQLite
     * `BEGIN IMMEDIATE` (wacht met busy_timeout tot een ander klaar is), en in PostgreSQL en MySQL eerst
     * een slot op de teller van de volgnummers, die iedere schrijvende transactie toch al ophoogt.
     *
     * @template T
     * @param \Closure(): T $work
     * @return T
     */
    public static function transaction(\PDO $pdo, \Closure $work): mixed
    {
        self::$open ??= new \WeakMap();
        if ($pdo->inTransaction() || isset(self::$open[$pdo])) {
            return $work();
        }
        $sqlite = $pdo->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite';
        if ($sqlite) {
            $pdo->exec('BEGIN IMMEDIATE');
        } else {
            $pdo->beginTransaction();
        }
        self::$open[$pdo] = true;
        try {
            if (!$sqlite) {
                $pdo->exec("UPDATE counters SET value = value WHERE name = 'version'");
            }
            $result = $work();
            if ($sqlite) {
                $pdo->exec('COMMIT');
            } else {
                $pdo->commit();
            }

            return $result;
        } catch (\Throwable $error) {
            if ($sqlite) {
                try {
                    $pdo->exec('ROLLBACK');
                } catch (\PDOException) {
                    // De transactie was al afgebroken.
                }
            } elseif ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        } finally {
            unset(self::$open[$pdo]);
        }
    }
}
