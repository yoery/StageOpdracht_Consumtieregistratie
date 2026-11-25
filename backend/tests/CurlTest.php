<?php

declare(strict_types=1);

// Test voor CurlHttpClient met een echte verbinding, maar alleen naar een nepserver op deze computer
// (de ingebouwde webserver van PHP). Zo is te zien dat de headers echt worden meegestuurd, dat de
// status terugkomt en dat een doorverwijzing niet wordt gevolgd. Er gaat niets naar AFAS.

use Tvb\Consumptie\Afas\CurlHttpClient;

/**
 * Start de nepserver, voert de test uit en stopt de server weer. De server geeft terug welke header
 * en welk adres hij kreeg.
 */
function withLocalServer(callable $body): void
{
    if (!function_exists('curl_init') || !function_exists('proc_open')) {
        skip('curl of proc_open is niet beschikbaar');
    }

    $router = tempnam(sys_get_temp_dir(), 'tvb-nepserver-');
    file_put_contents($router, <<<'PHP'
    <?php
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if ($path === '/geweigerd') { http_response_code(401); exit; }
    if ($path === '/doorverwijzing') { header('Location: /ergens-anders', true, 302); exit; }
    header('Content-Type: application/json');
    echo json_encode(['authorization' => $_SERVER['HTTP_AUTHORIZATION'] ?? null, 'accept' => $_SERVER['HTTP_ACCEPT'] ?? null, 'uri' => $_SERVER['REQUEST_URI']]);
    PHP);

    // Een vrije poort zoeken en de server daarop starten.
    $probe = stream_socket_server('tcp://127.0.0.1:0');
    $port = (int) substr(strrchr((string) stream_socket_get_name($probe, false), ':'), 1);
    fclose($probe);
    $null = DIRECTORY_SEPARATOR === '\\' ? 'NUL' : '/dev/null';
    $process = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", $router], [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $null, 'w']], $pipes);

    try {
        $ready = false;
        for ($attempt = 0; $attempt < 50 && !$ready; $attempt++) {
            $connection = @fsockopen('127.0.0.1', $port, $errorCode, $errorText, 0.2);
            if ($connection !== false) {
                fclose($connection);
                $ready = true;
            } else {
                usleep(100000);
            }
        }
        if (!$ready) {
            skip('de nepserver startte niet');
        }

        $body("http://127.0.0.1:$port");
    } finally {
        proc_terminate($process);
        proc_close($process);
        @unlink($router);
    }
}

test('CurlHttpClient: stuurt de headers mee en geeft status en inhoud terug (nepserver op deze computer)', function (): void {
    withLocalServer(function (string $server): void {
        $response = (new CurlHttpClient(2, 5))->get(
            $server . '/connectors/TVB_Consumptie_Medewerkers?skip=0&take=2&orderbyfieldids=Personeelsnummer',
            ['Authorization: AfasToken ' . fakeToken(), 'Accept: application/json']
        );

        same(200, $response->status);
        $received = json_decode($response->body, true, 8, JSON_THROW_ON_ERROR);
        same('AfasToken ' . fakeToken(), $received['authorization']);
        same('application/json', $received['accept']);
        same('/connectors/TVB_Consumptie_Medewerkers?skip=0&take=2&orderbyfieldids=Personeelsnummer', $received['uri']);
    });
});

test('CurlHttpClient: een foutstatus komt terug als status, en een doorverwijzing wordt niet gevolgd', function (): void {
    withLocalServer(function (string $server): void {
        $client = new CurlHttpClient(2, 5);

        same(401, $client->get($server . '/geweigerd', [])->status);
        same(302, $client->get($server . '/doorverwijzing', ['Authorization: AfasToken ' . fakeToken()])->status);
    });
});

test('CurlHttpClient: lukt de verbinding niet, dan volgt een fout zonder de headers erin', function (): void {
    if (!function_exists('curl_init')) {
        skip('curl is niet beschikbaar');
    }
    // Een poort waar niets op luistert.
    $probe = stream_socket_server('tcp://127.0.0.1:0');
    $port = (int) substr(strrchr((string) stream_socket_get_name($probe, false), ':'), 1);
    fclose($probe);

    $error = throws(\Tvb\Consumptie\Afas\AfasException::class, fn () => (new CurlHttpClient(1, 2))->get("http://127.0.0.1:$port/", ['Authorization: AfasToken ' . fakeToken()]));

    same(\Tvb\Consumptie\Afas\AfasException::NETWORK, $error->kind);
    withoutToken($error->getMessage(), 'de foutmelding');
    withoutToken($error->getTraceAsString(), 'de stacktrace');
});
