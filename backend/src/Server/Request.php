<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

/**
 * Request — één verzoek aan de API, los van de webserver. Zo is de API te testen zonder browser.
 *
 * De namen van de kopregels (headers) staan in kleine letters. `secure` zegt of het verzoek via
 * HTTPS binnenkwam. `address` is het adres van de afzender zoals de webserver het ziet.
 */
final class Request
{
    /** De grootste inhoud die de API aanneemt, in bytes. */
    public const MAX_BODY_BYTES = 4194304;

    /**
     * @param array<string, string> $query
     * @param array<string, string> $headers
     * @param array<string, string> $cookies
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query = [],
        public readonly ?\stdClass $body = null,
        public readonly array $headers = [],
        public readonly array $cookies = [],
        public readonly string $address = '',
        public readonly bool $secure = true,
        public readonly string $host = ''
    ) {
    }

    /**
     * Maakt het verzoek uit wat PHP van de webserver krijgt. Een inhoud die geen JSON-object is, of
     * die te groot is, geeft een verzoek zonder inhoud. De API weigert dat dan zelf.
     */
    public static function fromGlobals(string $prefix = '/api'): self
    {
        $path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
        if (str_starts_with($path, $prefix)) {
            $path = substr($path, strlen($prefix));
        }

        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (is_string($value) && str_starts_with((string) $name, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr((string) $name, 5)))] = $value;
            }
        }

        $body = null;
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($length > 0 && $length <= self::MAX_BODY_BYTES) {
            $raw = file_get_contents('php://input', false, null, 0, self::MAX_BODY_BYTES + 1);
            if (is_string($raw) && strlen($raw) <= self::MAX_BODY_BYTES) {
                try {
                    $decoded = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
                    $body = $decoded instanceof \stdClass ? $decoded : null;
                } catch (\JsonException) {
                    $body = null;
                }
            }
        }

        // Het adres van de afzender, voor de blokkade na te veel foute inlogpogingen (Auth::login). Achter
        // de proxy van Coolify is REMOTE_ADDR altijd de proxy. Die zet het echte adres als laatste in
        // X-Forwarded-For. Alleen dat laatste deel telt: wat ervoor staat, kan de afzender zelf invullen.
        // De container is alleen via de proxy te bereiken (docker-compose.yml heeft geen eigen poort).
        $address = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        $forwarded = trim((string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
        if ($forwarded !== '') {
            $parts = array_map('trim', explode(',', $forwarded));
            $last = (string) end($parts);
            if (filter_var($last, FILTER_VALIDATE_IP) !== false) {
                $address = $last;
            }
        }

        $https = (string) ($_SERVER['HTTPS'] ?? '');
        $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));

        return new self(
            strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            '/' . trim($path, '/'),
            array_map(static fn ($value): string => is_string($value) ? $value : '', $_GET),
            $body,
            $headers,
            array_map(static fn ($value): string => is_string($value) ? $value : '', $_COOKIE),
            $address,
            ($https !== '' && $https !== 'off') || $forwarded === 'https',
            strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''))
        );
    }
}
