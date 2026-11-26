<?php

declare(strict_types=1);

// Het enige PHP-bestand dat de webserver uitvoert: alle verzoeken aan /api komen hier binnen.
// De rest van de backend (src/, bin/, tests/) staat buiten de map die de webserver uitlevert.
//
// De instellingen komen uit de omgeving van de server (in Coolify: Environment Variables):
//   CR_DB_DSN, CR_DB_GEBRUIKER, CR_DB_WACHTWOORD   de database (standaard SQLite in /data)
//   AFAS_TOKEN, AFAS_BASE_URL, AFAS_CONNECTOR      de koppeling met AFAS
// Op een eigen computer mogen de drie van AFAS ook in het bestand .env in de projectmap staan.

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\AfasConfig;
use Tvb\Consumptie\Afas\CurlHttpClient;
use Tvb\Consumptie\Afas\EmployeeMapper;
use Tvb\Consumptie\Afas\EmployeeSync;
use Tvb\Consumptie\Afas\SyncRunner;
use Tvb\Consumptie\Server\Api;
use Tvb\Consumptie\Server\Database;
use Tvb\Consumptie\Server\RecordEmployeeRepository;
use Tvb\Consumptie\Server\RecordStore;
use Tvb\Consumptie\Server\Request;
use Tvb\Consumptie\Server\Response;

// Fouten nooit naar de browser: alleen naar het logboek van de server.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

$backend = getenv('CR_BACKEND_MAP');
$backend = is_string($backend) && $backend !== '' ? $backend : dirname(__DIR__);
require $backend . '/autoload.php';

// De map waarin een .env mag staan. Op de server is dat de map boven de backend (daar staat geen
// .env: de instellingen komen uit de omgeving). De ontwikkelserver geeft zijn eigen projectmap door,
// zodat een test met een nagemaakte projectmap nooit de echte .env leest.
$project = getenv('CR_PROJECT_MAP');
$project = is_string($project) && $project !== '' ? $project : dirname($backend);

$request = Request::fromGlobals('/api');
try {
    $api = new Api(Database::fromEnvironment(), static function (RecordStore $store) use ($project): SyncRunner {
        $config = AfasConfig::fromEnvironment($project . '/.env');

        return new SyncRunner(new AfasClient($config, new CurlHttpClient()), new EmployeeMapper(), new EmployeeSync(), new RecordEmployeeRepository($store));
    });
    $response = $api->handle($request);
} catch (Throwable $error) {
    // Bijvoorbeeld: de database is niet bereikbaar. Alleen het soort fout gaat naar het logboek.
    error_log('API kon niet starten: ' . $error::class);
    $response = Response::error(503, 'De server is nu niet beschikbaar.');
}
$response->send($request->secure);
