<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

/**
 * Auth — inloggen op de server: beheerders, gekoppelde tablets en hun sessies.
 *
 * Er zijn twee soorten toegang:
 *   - een beheerder logt in met e-mailadres en wachtwoord. Van het wachtwoord staat alleen een hash
 *     in de database (Argon2id, of bcrypt als de server dat niet heeft). Na vijf foute pogingen
 *     binnen een kwartier is inloggen voor dat e-mailadres tijdelijk geblokkeerd;
 *   - een tablet wordt één keer door een ingelogde beheerder gekoppeld. De tablet krijgt dan een
 *     eigen sleutel in een cookie en hoort bij een consumptiepunt (de locatie van de tablet). De
 *     beheerder kan een tablet weer intrekken.
 *
 * Een sessie is een willekeurige sleutel van 32 bytes in een cookie. In de database staat alleen de
 * SHA-256 daarvan, zodat iemand die de database leest er niet mee kan inloggen. Bij iedere sessie
 * hoort een tweede sleutel (`csrf`) die de website bij ieder schrijvend verzoek meestuurt.
 *
 * Deze class schrijft nooit een wachtwoord of sleutel naar een logboek.
 */
final class Auth
{
    public const KIND_ADMIN = 'admin';
    public const KIND_DEVICE = 'device';

    /** Een beheerder wordt uitgelogd na een half uur niets doen, en altijd na twaalf uur. */
    public const ADMIN_IDLE_SECONDS = 1800;
    public const ADMIN_MAX_SECONDS = 43200;

    /** Een tablet blijft 400 dagen gekoppeld. Daarna koppelt de beheerder hem opnieuw. */
    public const DEVICE_MAX_SECONDS = 34560000;

    public const MIN_PASSWORD_LENGTH = 12;
    public const MAX_FAILED_PER_EMAIL = 5;
    public const MAX_FAILED_PER_ADDRESS = 30;
    public const ATTEMPT_WINDOW_SECONDS = 900;

    public function __construct(private readonly \PDO $pdo)
    {
    }

    // ------------------------------------------------------------------
    // Beheerders
    // ------------------------------------------------------------------

    public function adminCount(): int
    {
        return (int) $this->pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();
    }

    public function adminExists(string $email): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM admins WHERE email = ?');
        $statement->execute([self::normalizeEmail($email)]);

        return $statement->fetchColumn() !== false;
    }

    /**
     * Maakt een beheerder. Geeft de reden terug als het e-mailadres of het wachtwoord niet goed is,
     * anders null.
     */
    public function createAdmin(string $email, #[\SensitiveParameter] string $password, \DateTimeImmutable $now): ?string
    {
        $email = self::normalizeEmail($email);
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 190) {
            return 'Het e-mailadres is niet geldig.';
        }
        $problem = self::passwordProblem($password);
        if ($problem !== null) {
            return $problem;
        }
        if ($this->adminExists($email)) {
            return 'Er bestaat al een beheerder met dit e-mailadres.';
        }
        $this->pdo
            ->prepare('INSERT INTO admins (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
            ->execute([self::randomId(), $email, self::hash($password), self::stamp($now)]);

        return null;
    }

    /** Zet een nieuw wachtwoord en beëindigt alle sessies van die beheerder. */
    public function setPassword(string $email, #[\SensitiveParameter] string $password): ?string
    {
        $problem = self::passwordProblem($password);
        if ($problem !== null) {
            return $problem;
        }
        $admin = $this->adminByEmail($email);
        if ($admin === null) {
            return 'Er is geen beheerder met dit e-mailadres.';
        }
        $this->pdo->prepare('UPDATE admins SET password_hash = ? WHERE id = ?')->execute([self::hash($password), $admin['id']]);
        $this->pdo->prepare('DELETE FROM sessions WHERE kind = ? AND subject_id = ?')->execute([self::KIND_ADMIN, $admin['id']]);

        return null;
    }

    public static function passwordProblem(#[\SensitiveParameter] string $password): ?string
    {
        if (strlen($password) < self::MIN_PASSWORD_LENGTH) {
            return sprintf('Het wachtwoord moet minstens %d tekens hebben.', self::MIN_PASSWORD_LENGTH);
        }
        if (strlen($password) > 200) {
            return 'Het wachtwoord is te lang.';
        }

        return null;
    }

    /**
     * Logt een beheerder in. De uitkomst is "ok" (met de sleutels van de sessie), "wrong" (verkeerd
     * e-mailadres of wachtwoord, zonder te zeggen welke van de twee) of "blocked" (te veel pogingen).
     *
     * @return array{status: 'ok', token: string, csrf: string, email: string}|array{status: 'wrong'|'blocked'}
     */
    public function login(string $email, #[\SensitiveParameter] string $password, string $address, \DateTimeImmutable $now): array
    {
        $email = self::normalizeEmail($email);
        $emailKey = hash('sha256', 'email:' . $email);
        $addressKey = hash('sha256', 'adres:' . $address);
        $since = self::stamp($now->modify('-' . self::ATTEMPT_WINDOW_SECONDS . ' seconds'));
        $this->pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < ?')->execute([$since]);

        if ($this->attempts($emailKey) >= self::MAX_FAILED_PER_EMAIL || $this->attempts($addressKey) >= self::MAX_FAILED_PER_ADDRESS) {
            return ['status' => 'blocked'];
        }

        $admin = $this->adminByEmail($email);
        // Ook zonder beheerder wordt een hash gecontroleerd, zodat de duur van het verzoek minder goed
        // verraadt of het e-mailadres bestaat. Dit is de hash van een willekeurige tekst die niemand
        // kent en die daarna is weggegooid. Het is geen wachtwoord van iemand.
        $hash = $admin['password_hash'] ?? '$2y$12$Lq0XUnvZDsxG8xuiZ/UdA.QZ9x4Pa6YczUa4hYDBJf1HzLljwHtz2';
        $valid = password_verify($password, $hash) && $admin !== null;
        if (!$valid) {
            $insert = $this->pdo->prepare('INSERT INTO login_attempts (attempt_key, attempted_at) VALUES (?, ?)');
            $insert->execute([$emailKey, self::stamp($now)]);
            $insert->execute([$addressKey, self::stamp($now)]);

            return ['status' => 'wrong'];
        }

        $this->pdo->prepare('DELETE FROM login_attempts WHERE attempt_key = ?')->execute([$emailKey]);
        if (password_needs_rehash($admin['password_hash'], self::algorithm())) {
            $this->pdo->prepare('UPDATE admins SET password_hash = ? WHERE id = ?')->execute([self::hash($password), $admin['id']]);
        }
        $session = $this->createSession(self::KIND_ADMIN, (string) $admin['id'], $now, self::ADMIN_MAX_SECONDS);

        return ['status' => 'ok', 'token' => $session['token'], 'csrf' => $session['csrf'], 'email' => (string) $admin['email']];
    }

    /** Beëindigt een sessie (uitloggen, of een tablet ontkoppelen vanaf de tablet zelf). */
    public function endSession(#[\SensitiveParameter] ?string $token): void
    {
        if (is_string($token) && $token !== '') {
            $this->pdo->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        }
    }

    /**
     * Zoekt de sessie bij een sleutel uit een cookie. Geeft null als de sleutel onbekend of verlopen
     * is, of als de tablet is ingetrokken. Een geldige sessie van een beheerder schuift mee: de tijd
     * zonder invoer begint opnieuw.
     *
     * @return array{kind: string, subjectId: string, csrf: string}|null
     */
    public function session(#[\SensitiveParameter] ?string $token, string $kind, \DateTimeImmutable $now): ?array
    {
        if (!is_string($token) || preg_match('/^[a-f0-9]{64}$/', $token) !== 1) {
            return null;
        }
        $hash = hash('sha256', $token);
        $statement = $this->pdo->prepare('SELECT kind, subject_id, csrf, last_seen_at, expires_at FROM sessions WHERE token_hash = ? AND kind = ?');
        $statement->execute([$hash, $kind]);
        $row = $statement->fetch();
        if ($row === false) {
            return null;
        }

        $expired = (string) $row['expires_at'] < self::stamp($now);
        $idle = $kind === self::KIND_ADMIN && (string) $row['last_seen_at'] < self::stamp($now->modify('-' . self::ADMIN_IDLE_SECONDS . ' seconds'));
        if ($expired || $idle) {
            $this->pdo->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([$hash]);

            return null;
        }
        if ($kind === self::KIND_DEVICE && $this->device((string) $row['subject_id']) === null) {
            return null;
        }
        // Niet bij ieder verzoek schrijven: één keer per minuut is genoeg om de tijd bij te houden.
        if ((string) $row['last_seen_at'] < self::stamp($now->modify('-60 seconds'))) {
            $this->pdo->prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')->execute([self::stamp($now), $hash]);
        }

        return ['kind' => (string) $row['kind'], 'subjectId' => (string) $row['subject_id'], 'csrf' => (string) $row['csrf']];
    }

    /** Het e-mailadres van een beheerder, voor in het logboek van de app. */
    public function adminEmail(string $id): ?string
    {
        $statement = $this->pdo->prepare('SELECT email FROM admins WHERE id = ?');
        $statement->execute([$id]);
        $email = $statement->fetchColumn();

        return is_string($email) ? $email : null;
    }

    // ------------------------------------------------------------------
    // Tablets
    // ------------------------------------------------------------------

    /**
     * Koppelt een tablet. Geeft de id en de sleutels terug. De sleutel gaat alleen naar de cookie van
     * die tablet en is daarna niet meer op te vragen.
     *
     * @return array{id: string, token: string, csrf: string}
     */
    public function createDevice(string $name, ?string $pointId, \DateTimeImmutable $now): array
    {
        $id = self::randomId();
        $this->pdo
            ->prepare('INSERT INTO devices (id, name, point_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)')
            ->execute([$id, $name, $pointId, self::stamp($now)]);
        $session = $this->createSession(self::KIND_DEVICE, $id, $now, self::DEVICE_MAX_SECONDS);

        return ['id' => $id, 'token' => $session['token'], 'csrf' => $session['csrf']];
    }

    /**
     * De gekoppelde tablets, zonder sleutels.
     *
     * @return list<array{id: string, name: string, pointId: string|null, createdAt: string}>
     */
    public function devices(): array
    {
        $rows = $this->pdo->query('SELECT id, name, point_id, created_at FROM devices WHERE revoked_at IS NULL ORDER BY created_at, id')->fetchAll();

        return array_values(array_map(static fn (array $row): array => [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'pointId' => $row['point_id'] === null ? null : (string) $row['point_id'],
            'createdAt' => (string) $row['created_at'],
        ], $rows));
    }

    /** @return array{id: string, name: string, pointId: string|null, createdAt: string}|null */
    public function device(string $id): ?array
    {
        foreach ($this->devices() as $device) {
            if ($device['id'] === $id) {
                return $device;
            }
        }

        return null;
    }

    /** Wijzigt de naam en de locatie van een tablet. Geeft false als de tablet niet (meer) bestaat. */
    public function updateDevice(string $id, string $name, ?string $pointId): bool
    {
        $statement = $this->pdo->prepare('UPDATE devices SET name = ?, point_id = ? WHERE id = ? AND revoked_at IS NULL');
        $statement->execute([$name, $pointId, $id]);

        return $statement->rowCount() > 0;
    }

    /** Trekt een tablet in: de sleutel werkt meteen niet meer. */
    public function revokeDevice(string $id, \DateTimeImmutable $now): bool
    {
        $statement = $this->pdo->prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL');
        $statement->execute([self::stamp($now), $id]);
        $this->pdo->prepare('DELETE FROM sessions WHERE kind = ? AND subject_id = ?')->execute([self::KIND_DEVICE, $id]);

        return $statement->rowCount() > 0;
    }

    // ------------------------------------------------------------------
    // Hulpfuncties
    // ------------------------------------------------------------------

    /** @return array{token: string, csrf: string} */
    private function createSession(string $kind, string $subjectId, \DateTimeImmutable $now, int $lifetime): array
    {
        $token = bin2hex(random_bytes(32));
        $csrf = bin2hex(random_bytes(24));
        $this->pdo
            ->prepare('INSERT INTO sessions (token_hash, kind, subject_id, csrf, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([hash('sha256', $token), $kind, $subjectId, $csrf, self::stamp($now), self::stamp($now), self::stamp($now->modify("+$lifetime seconds"))]);

        return ['token' => $token, 'csrf' => $csrf];
    }

    private function attempts(string $key): int
    {
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE attempt_key = ?');
        $statement->execute([$key]);

        return (int) $statement->fetchColumn();
    }

    /** @return array{id: string, email: string, password_hash: string}|null */
    private function adminByEmail(string $email): ?array
    {
        $statement = $this->pdo->prepare('SELECT id, email, password_hash FROM admins WHERE email = ?');
        $statement->execute([self::normalizeEmail($email)]);
        $row = $statement->fetch();

        return $row === false ? null : ['id' => (string) $row['id'], 'email' => (string) $row['email'], 'password_hash' => (string) $row['password_hash']];
    }

    private static function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    private static function algorithm(): string|int
    {
        return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    }

    private static function hash(#[\SensitiveParameter] string $password): string
    {
        return password_hash($password, self::algorithm());
    }

    private static function randomId(): string
    {
        return bin2hex(random_bytes(16));
    }

    // Een tijdstip als tekst in UTC. Zo'n tekst is als tekst te vergelijken (eerder is kleiner).
    private static function stamp(\DateTimeImmutable $moment): string
    {
        return $moment->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }
}
