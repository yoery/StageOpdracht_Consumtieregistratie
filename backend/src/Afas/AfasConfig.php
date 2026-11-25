<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * AfasConfig — de instellingen van de koppeling: het token, het adres van AFAS, de naam van de
 * GetConnector en de grootte van een portie.
 *
 * Verantwoordelijkheid:
 *   - AFAS_TOKEN, AFAS_BASE_URL en AFAS_CONNECTOR lezen uit de omgeving of uit een .env-bestand (de
 *     omgeving gaat voor);
 *   - een duidelijke melding geven als de naam van de GetConnector nog niet is ingevuld
 *     (`connectorName`), in plaats van een verzoek naar een connector zonder naam;
 *   - de waarden controleren voordat er iets naar AFAS gaat: het adres moet https zijn en bij AFAS
 *     horen, en het token moet de Base64-versie van de token-XML zijn;
 *   - het token afschermen. Het is alleen op te vragen als kant-en-klare header
 *     (`authorizationHeader`). Het staat niet in een veld van het object, dus `print_r`, `var_dump`,
 *     `var_export` en `json_encode` tonen het niet, en `serialize` weigert. Het staat ook in geen
 *     enkele foutmelding.
 *
 * Verbonden met:
 *   - EnvFile: leest het .env-bestand;
 *   - AfasClient: gebruikt het adres, de connector, de portiegrootte en de header.
 */
final class AfasConfig
{
    public const DEFAULT_TAKE = 100;

    // Alleen adressen van AFAS zelf, zodat het token door een tikfout nooit naar een andere server gaat.
    private const ALLOWED_HOST_SUFFIX = '.afas.online';
    private const DEFAULT_PATH = '/ProfitRestServices';

    // Het token staat niet in een veld van het object, maar in een aparte lijst per object. Zo komt
    // het niet in een dump van dit object terecht, ook niet bij hulpmiddelen die alle velden tonen.
    /** @var \WeakMap<self, string>|null */
    private static ?\WeakMap $tokens = null;

    private function __construct(
        #[\SensitiveParameter] string $token,
        public readonly string $baseUrl,
        public readonly ?string $connector,
        public readonly int $take
    ) {
        self::$tokens ??= new \WeakMap();
        self::$tokens[$this] = $token;
    }

    /**
     * Leest de instellingen uit de omgeving en uit het .env-bestand. Een waarde uit de omgeving van de
     * server gaat voor een waarde uit het bestand.
     */
    public static function fromEnvironment(string $envFile): self
    {
        $values = EnvFile::read($envFile);
        foreach (['AFAS_TOKEN', 'AFAS_BASE_URL', 'AFAS_CONNECTOR'] as $name) {
            $fromServer = getenv($name);
            if (is_string($fromServer) && trim($fromServer) !== '') {
                $values[$name] = $fromServer;
            }
        }

        return self::fromValues($values);
    }

    /**
     * Maakt de instellingen van een lijst met waarden (AFAS_TOKEN, AFAS_BASE_URL en AFAS_CONNECTOR).
     * AFAS_CONNECTOR mag leeg zijn zolang de naam van de GetConnector niet bekend is. De portiegrootte
     * heeft een standaardwaarde.
     *
     * @param array<string, string> $values
     */
    public static function fromValues(
        #[\SensitiveParameter] array $values,
        int $take = self::DEFAULT_TAKE
    ): self {
        $token = trim((string) ($values['AFAS_TOKEN'] ?? ''));
        $baseUrl = trim((string) ($values['AFAS_BASE_URL'] ?? ''));
        $connector = trim((string) ($values['AFAS_CONNECTOR'] ?? ''));

        if ($token === '') {
            throw new AfasException(AfasException::CONFIG, 'AFAS_TOKEN ontbreekt. Kopieer .env.example naar .env en vul het token in.');
        }
        if ($baseUrl === '') {
            throw new AfasException(AfasException::CONFIG, 'AFAS_BASE_URL ontbreekt. Kopieer .env.example naar .env en vul het adres van AFAS in.');
        }
        self::checkToken($token);
        if ($connector !== '' && preg_match('/^[A-Za-z0-9_]{1,100}$/', $connector) !== 1) {
            throw new AfasException(AfasException::CONFIG, 'AFAS_CONNECTOR mag alleen letters, cijfers en _ bevatten.');
        }
        if ($take < 1 || $take > 1000) {
            throw new AfasException(AfasException::CONFIG, 'De portiegrootte (take) moet tussen 1 en 1000 liggen.');
        }

        return new self($token, self::checkedBaseUrl($baseUrl), $connector === '' ? null : $connector, $take);
    }

    /**
     * De naam van de GetConnector. Is AFAS_CONNECTOR nog niet ingevuld, dan volgt een duidelijke fout
     * in plaats van een verzoek naar een connector zonder naam.
     */
    public function connectorName(): string
    {
        if ($this->connector === null) {
            throw new AfasException(
                AfasException::CONFIG,
                'AFAS_CONNECTOR ontbreekt. Vul in .env de naam van de GetConnector met de medewerkers in. '
                . 'De beschikbare connectors zijn te zien met: php backend/bin/afas-metainfo.php'
            );
        }

        return $this->connector;
    }

    /**
     * De header waarmee AFAS het token krijgt. Het token is al Base64 en gaat er ongewijzigd in.
     */
    public function authorizationHeader(): string
    {
        return 'Authorization: AfasToken ' . self::$tokens[$this];
    }

    /**
     * Het object kan niet worden opgeslagen of gekopieerd: het token blijft alleen in het geheugen.
     *
     * @return array<string, mixed>
     */
    public function __serialize(): array
    {
        throw new \LogicException('AfasConfig kan niet worden opgeslagen. Het token blijft alleen in het geheugen.');
    }

    private function __clone()
    {
    }

    /**
     * Wat `var_dump` en `print_r` van dit object laten zien: alles behalve het token.
     *
     * @return array<string, mixed>
     */
    public function __debugInfo(): array
    {
        return ['baseUrl' => $this->baseUrl, 'connector' => $this->connector, 'take' => $this->take, 'token' => '(verborgen)'];
    }

    // Het token moet de Base64-versie zijn van <token><version>1</version><data>…</data></token>.
    // De foutmelding noemt nooit het token zelf.
    private static function checkToken(#[\SensitiveParameter] string $token): void
    {
        $decoded = preg_match('/^[A-Za-z0-9+\/]+={0,2}$/', $token) === 1 ? base64_decode($token, true) : false;
        if ($decoded === false) {
            throw new AfasException(AfasException::CONFIG, 'AFAS_TOKEN is geen Base64-tekst. Vul de Base64-versie van het token in, zonder spaties of regeleinden.');
        }
        if (!str_contains($decoded, '<token>') || !str_contains($decoded, '</token>')) {
            throw new AfasException(
                AfasException::CONFIG,
                'AFAS_TOKEN bevat geen token van AFAS. Verwacht wordt de Base64-versie van <token><version>1</version><data>…</data></token>, één keer gecodeerd.'
            );
        }
    }

    // Het adres moet https zijn en bij AFAS horen. Zonder pad wordt /ProfitRestServices gebruikt.
    private static function checkedBaseUrl(string $baseUrl): string
    {
        $parts = parse_url($baseUrl);
        if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
            throw new AfasException(AfasException::CONFIG, 'AFAS_BASE_URL is geen geldig adres. Voorbeeld: https://12345.rest.afas.online/ProfitRestServices');
        }
        if (strtolower($parts['scheme']) !== 'https') {
            throw new AfasException(AfasException::CONFIG, 'AFAS_BASE_URL moet met https:// beginnen, zodat het token versleuteld wordt verstuurd.');
        }
        $host = strtolower($parts['host']);
        if (!str_ends_with($host, self::ALLOWED_HOST_SUFFIX)) {
            throw new AfasException(AfasException::CONFIG, 'AFAS_BASE_URL moet een adres van AFAS zijn (eindigt op .afas.online).');
        }
        if (isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || isset($parts['port'])) {
            throw new AfasException(AfasException::CONFIG, 'AFAS_BASE_URL mag geen gebruikersnaam, poort, vraagteken of # bevatten.');
        }

        $path = rtrim($parts['path'] ?? '', '/');

        return 'https://' . $host . ($path === '' ? self::DEFAULT_PATH : $path);
    }
}
