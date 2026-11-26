<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * CurlHttpClient — doet een echt GET-verzoek met de curl-uitbreiding van PHP.
 *
 * Veiligheid:
 *   - het certificaat van de server wordt altijd gecontroleerd;
 *   - een doorverwijzing wordt niet gevolgd, zodat de header met het token nooit naar een ander
 *     adres gaat dan het adres dat is gevraagd;
 *   - er wordt niets gelogd. Een foutmelding bevat alleen de melding van curl, nooit de headers.
 */
final class CurlHttpClient implements HttpClient
{
    public function __construct(private readonly int $connectTimeoutSeconds = 10, private readonly int $timeoutSeconds = 30)
    {
    }

    public function get(string $url, #[\SensitiveParameter] array $headers): HttpResponse
    {
        if (!function_exists('curl_init')) {
            throw new AfasException(AfasException::NETWORK, 'De curl-uitbreiding van PHP staat niet aan.');
        }

        $handle = curl_init();
        $options = [
            CURLOPT_URL => $url,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeoutSeconds,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            // Nooit debuguitvoer: die zou de kopregels, en dus het token, naar het logboek schrijven
            // (security audit 26 november 2026, AF-02). Ook de kopregels van het antwoord worden niet gelezen.
            CURLOPT_VERBOSE => false,
            CURLOPT_HEADER => false,
        ];
        // Op Windows gebruikt curl hiermee de certificaten van het systeem, ook zonder eigen bestand.
        if (defined('CURLSSLOPT_NATIVE_CA')) {
            $options[CURLOPT_SSL_OPTIONS] = CURLSSLOPT_NATIVE_CA;
        }
        curl_setopt_array($handle, $options);

        $body = curl_exec($handle);
        if ($body === false) {
            throw new AfasException(AfasException::NETWORK, 'Geen verbinding met de server: ' . curl_error($handle));
        }

        return new HttpResponse((int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE), (string) $body);
    }
}
