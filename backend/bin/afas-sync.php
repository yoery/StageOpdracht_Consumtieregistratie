<?php

declare(strict_types=1);

// Proefdraaien van de AFAS-koppeling: haalt de medewerkers op bij AFAS, controleert de rijen en
// toont alleen aantallen. Er wordt niets opgeslagen en er komen geen namen in beeld.
//
// Gebruik (vanuit de projectmap):
//   php backend/bin/afas-sync.php
//   php backend/bin/afas-sync.php --env=C:\pad\naar\.env
//
// De instellingen AFAS_TOKEN, AFAS_BASE_URL en AFAS_CONNECTOR komen uit de omgeving of uit het .env-bestand (zie
// .env.example). Gebruik hier alleen een token van de testomgeving van AFAS.

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\AfasConfig;
use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\CurlHttpClient;
use Tvb\Consumptie\Afas\EmployeeMapper;

// Alleen vanaf de opdrachtregel. Zo kan dit bestand nooit via een webserver worden gestart.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

require dirname(__DIR__) . '/autoload.php';

$envFile = dirname(__DIR__, 2) . '/.env';
foreach (array_slice($argv, 1) as $argument) {
    if (str_starts_with($argument, '--env=')) {
        $envFile = substr($argument, strlen('--env='));
    } else {
        fwrite(STDERR, "Onbekende optie: $argument. Gebruik: php backend/bin/afas-sync.php [--env=pad]\n");
        exit(2);
    }
}

try {
    $config = AfasConfig::fromEnvironment($envFile);
    $connector = $config->connectorName();
    $mapper = new EmployeeMapper();
    $rows = (new AfasClient($config, new CurlHttpClient()))->fetchAll($mapper->sortField());
    $mapped = $mapper->map($rows);
} catch (AfasException $error) {
    fwrite(STDERR, 'Mislukt (' . $error->kind . '): ' . $error->getMessage() . "\n");
    exit(1);
}

$today = (new DateTimeImmutable('now', new DateTimeZone('Europe/Amsterdam')))->format('Y-m-d');
$inService = count(array_filter($mapped->employees, static fn ($employee): bool => $employee->isActiveOn($today)));

echo "AFAS-koppeling: proefdraaien. Er is niets opgeslagen.\n";
echo 'Connector: ' . $connector . "\n";
echo 'Opgehaald: ' . $mapped->receivedCount() . " rijen\n";
echo 'Geldig: ' . count($mapped->employees) . " (in dienst: $inService, uit dienst: " . (count($mapped->employees) - $inService) . ")\n";
echo 'Afgekeurd: ' . count($mapped->problems) . "\n";
foreach ($mapped->problems as $problem) {
    echo '  rij ' . $problem['row'] . ': ' . $problem['reason'] . "\n";
}
