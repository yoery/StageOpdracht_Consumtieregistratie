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
                email VARCHAR(190) NOT NULL UNIQUE,
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
    }

    /**
     * Voert `$work` uit in één transactie. Gaat er iets mis, dan wordt alles teruggedraaid.
     *
     * @template T
     * @param \Closure(): T $work
     * @return T
     */
    public static function transaction(\PDO $pdo, \Closure $work): mixed
    {
        if ($pdo->inTransaction()) {
            return $work();
        }
        $pdo->beginTransaction();
        try {
            $result = $work();
            $pdo->commit();

            return $result;
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }
}
