<?php

declare(strict_types=1);

// Toont de metadata van AFAS: welke GetConnectors het token mag gebruiken en hoe de velden van de
// GetConnector heten. Er worden geen gegevens van medewerkers opgehaald en het token komt niet in beeld.
// Hiermee is te controleren of de veldnamen kloppen met wat de koppeling verwacht (EmployeeMapper).
//
// Gebruik (vanuit de projectmap):
//   php backend/bin/afas-metainfo.php
//   php backend/bin/afas-metainfo.php --env=C:\pad\naar\.env
//
// Dit hulpmiddel vraagt alleen /metainfo en /metainfo/get/<connector> op.

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
        fwrite(STDERR, "Onbekende optie: $argument. Gebruik: php backend/bin/afas-metainfo.php [--env=pad]\n");
        exit(2);
    }
}

try {
    $config = AfasConfig::fromEnvironment($envFile);
    $client = new AfasClient($config, new CurlHttpClient());
    $connectors = $client->connectors();
    $known = $config->connector !== null && in_array($config->connector, array_column($connectors, 'id'), true);
    $fields = $known ? $client->connectorFields() : [];
} catch (AfasException $error) {
    fwrite(STDERR, 'Mislukt (' . $error->kind . '): ' . $error->getMessage() . "\n");
    exit(1);
}

echo "GetConnectors waar dit token bij mag:\n";
foreach ($connectors as $connector) {
    echo '  ' . $connector['id'] . ($connector['description'] !== '' ? ' (' . $connector['description'] . ')' : '') . "\n";
}
if ($config->connector === null) {
    echo "\nAFAS_CONNECTOR is nog niet ingevuld. Vul in .env de naam in van de GetConnector met de medewerkers (een van de namen hierboven).\n";
    exit(1);
}
if (!$known) {
    echo "\nDe GetConnector " . $config->connector . " staat er niet bij. Vraag de AFAS-beheerder om hem aan de App connector toe te voegen.\n";
    exit(1);
}

echo "\nVelden van " . $config->connector . ":\n";
foreach ($fields as $field) {
    echo '  ' . $field['id'] . ' (' . ($field['label'] !== '' ? $field['label'] . ', ' : '') . $field['dataType'] . ($field['length'] !== null ? ', lengte ' . $field['length'] : '') . ")\n";
}

$present = array_column($fields, 'id');
$missing = array_values(array_diff(array_values(EmployeeMapper::DEFAULT_FIELDS), $present));
$extra = array_values(array_diff($present, array_values(EmployeeMapper::DEFAULT_FIELDS)));
echo "\nVerwacht door de koppeling: " . implode(', ', EmployeeMapper::DEFAULT_FIELDS) . "\n";
echo 'Ontbreekt in de GetConnector: ' . ($missing === [] ? 'niets' : implode(', ', $missing)) . "\n";
echo 'Extra in de GetConnector (wordt niet gelezen): ' . ($extra === [] ? 'niets' : implode(', ', $extra)) . "\n";
exit($missing === [] ? 0 : 1);
