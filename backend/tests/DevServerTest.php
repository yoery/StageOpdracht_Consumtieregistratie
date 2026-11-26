<?php

declare(strict_types=1);

// Test van de API over echt HTTP, met de ontwikkelserver (backend/dev-server.php) op deze computer.
// De server draait op een nagemaakte projectmap in de tijdelijke map, met een nepgeheim in .env en
// een lege database. Zo is te zien dat alleen index.html, assets/ en de API worden uitgeleverd, en
// dat de cookies van het inloggen goed staan. Er gaat niets naar AFAS en de echte .env wordt niet
// gelezen.

use Tvb\Consumptie\Server\Auth;
use Tvb\Consumptie\Server\Database;

/**
 * Start de ontwikkelserver op een nagemaakte projectmap, voert de test uit en ruimt alles op.
 * `$body` krijgt het adres van de server.
 */
function withDevServer(callable $body): void
{
    if (!function_exists('curl_init') || !function_exists('proc_open')) {
        skip('curl of proc_open is niet beschikbaar');
    }

    $root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tvb-devserver-' . bin2hex(random_bytes(6));
    mkdir($root . '/assets/js', 0700, true);
    mkdir($root . '/docker', 0700, true);
    mkdir($root . '/docs', 0700, true);
    file_put_contents($root . '/index.html', '<!doctype html><title>Nep</title>');
    file_put_contents($root . '/assets/js/app.js', 'export const nep = true;');
    file_put_contents($root . '/assets/js/deployment.js', 'export const SERVER_API = "";');
    file_put_contents($root . '/assets/js/geheim.php', '<?php echo "NEPGEHEIM";');
    file_put_contents($root . '/docker/deployment.js', 'export const SERVER_API = "/api";');
    file_put_contents($root . '/.env', "AFAS_TOKEN=NEPGEHEIM\n");
    file_put_contents($root . '/docs/notitie.md', 'NEPGEHEIM');
    $database = $root . DIRECTORY_SEPARATOR . 'test.sqlite';
    $pdo = Database::connect('sqlite:' . $database);
    (new Auth($pdo))->createAdmin(TEST_EMAIL, TEST_PASSWORD, new DateTimeImmutable('now'));
    $pdo = null;

    $probe = stream_socket_server('tcp://127.0.0.1:0');
    $port = (int) substr(strrchr((string) stream_socket_get_name($probe, false), ':'), 1);
    fclose($probe);
    $null = DIRECTORY_SEPARATOR === '\\' ? 'NUL' : '/dev/null';
    // Twee sloten zodat deze test nooit bij AFAS uitkomt: de server leest alleen de .env uit de
    // nagemaakte map (CR_DEV_ROOT), en het adres van AFAS in de omgeving is een nepadres dat de
    // koppeling weigert. De omgeving gaat altijd voor een .env-bestand.
    $environment = array_merge(getenv(), [
        'CR_DEV_ROOT' => $root,
        'CR_DB_DSN' => 'sqlite:' . $database,
        'AFAS_TOKEN' => '',
        'AFAS_BASE_URL' => 'https://nep.voorbeeld.test/ProfitRestServices',
        'AFAS_CONNECTOR' => 'Nep_Connector',
    ]);
    $process = proc_open(
        [PHP_BINARY, '-S', "127.0.0.1:$port", dirname(__DIR__) . '/dev-server.php'],
        [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $null, 'w']],
        $pipes,
        dirname(__DIR__, 2),
        $environment
    );

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
            skip('de ontwikkelserver startte niet');
        }

        $body("http://127.0.0.1:$port");
    } finally {
        proc_terminate($process);
        proc_close($process);
        usleep(200000);
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $file) {
            $file->isDir() ? @rmdir($file->getPathname()) : @unlink($file->getPathname());
        }
        @rmdir($root);
    }
}

/**
 * Eén verzoek met curl. Geeft de status, de kopregels (in kleine letters) en de inhoud terug.
 *
 * @param list<string> $headers
 * @return array{status: int, headers: string, body: string}
 */
function httpCall(string $method, string $url, ?string $json = null, array $headers = []): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_PATH_AS_IS => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => $json === null ? $headers : array_merge(['Content-Type: application/json'], $headers),
    ]);
    if ($json !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, $json);
    }
    $raw = (string) curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $size = (int) curl_getinfo($curl, CURLINFO_HEADER_SIZE);

    return ['status' => $status, 'headers' => strtolower(substr($raw, 0, $size)), 'body' => substr($raw, $size)];
}

test('Ontwikkelserver: alleen index.html, assets en de API worden uitgeleverd, nooit .env of andere bestanden', function (): void {
    withDevServer(function (string $server): void {
        same(200, httpCall('GET', "$server/")['status']);
        same(200, httpCall('GET', "$server/index.html")['status']);
        same('export const nep = true;', httpCall('GET', "$server/assets/js/app.js")['body']);
        same('export const SERVER_API = "/api";', httpCall('GET', "$server/assets/js/deployment.js")['body'], 'de website praat hier met de server');

        foreach (['/.env', '/assets/../.env', '/assets/%2e%2e/.env', '/docs/notitie.md', '/assets/js/geheim.php', '/docker/deployment.js', '/test.sqlite', '/assets/', '/backend/tests/run.php'] as $path) {
            $response = httpCall('GET', $server . $path);
            same(404, $response['status'], $path);
            ok(!str_contains($response['body'], 'NEPGEHEIM'), "$path geeft het nepgeheim");
        }
    });
});

test('Ontwikkelserver: de API werkt over HTTP, en de cookie van het inloggen is HttpOnly en SameSite=Strict', function (): void {
    withDevServer(function (string $server): void {
        $health = httpCall('GET', "$server/api/health");
        same(200, $health['status']);
        same('{"ok":true}', $health['body']);
        ok(str_contains($health['headers'], 'cache-control: no-store'));
        ok(str_contains($health['headers'], 'content-type: application/json'));

        same(401, httpCall('GET', "$server/api/changes?since=0")['status']);
        same(null, json_decode(httpCall('GET', "$server/api/session")['body'], true)['role']);

        $own = ['Origin: ' . $server, 'X-CR-Client: 1'];
        $login = json_encode(['email' => TEST_EMAIL, 'password' => TEST_PASSWORD]);
        same(403, httpCall('POST', "$server/api/login", $login, ['Origin: https://kwaad.voorbeeld.test', 'X-CR-Client: 1'])['status']);
        same(403, httpCall('POST', "$server/api/login", $login)['status']);
        same(401, httpCall('POST', "$server/api/login", json_encode(['email' => TEST_EMAIL, 'password' => 'verkeerd-wachtwoord']), $own)['status']);

        $response = httpCall('POST', "$server/api/login", $login, $own);
        same(200, $response['status']);
        ok(preg_match('/set-cookie: cr_beheer=([a-f0-9]{64});[^\r\n]*/', $response['headers'], $match) === 1, 'geen cookie gezet');
        ok(str_contains($match[0], 'httponly') && str_contains($match[0], 'samesite=strict') && str_contains($match[0], 'path=/'), $match[0]);
        ok(!str_contains($response['body'], $match[1]), 'de sleutel van de cookie staat in de inhoud');
        ok(!str_contains($response['headers'] . $response['body'], TEST_PASSWORD));

        $csrf = json_decode($response['body'], true)['csrf'];
        $session = array_merge($own, ['Cookie: cr_beheer=' . $match[1], 'X-CSRF-Token: ' . $csrf]);
        $saved = httpCall('POST', "$server/api/changes", '{"changes":[{"collection":"products","id":"blikje","data":{"id":"blikje","name":"Blikje","price":0.65}}]}', $session);
        same(200, $saved['status']);
        $pulled = json_decode(httpCall('GET', "$server/api/changes?since=0", null, ['Cookie: cr_beheer=' . $match[1]])['body'], true);
        same('Blikje', $pulled['changes'][0]['data']['name']);
        same(0.65, $pulled['changes'][0]['data']['price']);

        // Een inhoud die geen JSON is, wordt geweigerd zonder fout op de server.
        same(400, httpCall('POST', "$server/api/changes", 'geen json', $session)['status']);
        // Synchroniseren zonder ingestelde koppeling geeft een duidelijke melding en geen crash.
        $sync = httpCall('POST', "$server/api/afas/sync", '{}', $session);
        same(503, $sync['status']);
        ok(str_contains($sync['body'], 'AFAS_'), $sync['body']);
    });
});
