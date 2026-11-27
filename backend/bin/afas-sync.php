<?php

declare(strict_types=1);

// Proefdraaien van de AFAS-koppeling: haalt de medewerkers op bij AFAS, controleert de rijen en
// toont alleen aantallen. Er wordt niets opgeslagen en er komen geen namen in beeld.
//
// Gebruik (vanuit de projectmap):
//   php backend/bin/afas-sync.php
//   php backend/bin/afas-sync.php --werkgevers     toont ook de verschillende waarden van de werkgever
//   php backend/bin/afas-sync.php --env=C:\pad\naar\.env
//
// De uitvoer bevat: het aantal rijen, de redenen waarom rijen zijn afgekeurd (samengevat) en de vorm
// van de velden die de koppeling leest (hoeveel leeg, hoeveel alleen cijfers, hoeveel iets anders).
// Komt een personeelsnummer meer dan één keer voor, dan staat erbij in welke velden die rijen verschillen.
// Met --werkgevers komen de waarden van de velden over het bedrijf erbij. Dat zijn geen gegevens van
// een persoon. Waarden van andere velden worden nooit getoond.
//
// De instellingen AFAS_TOKEN, AFAS_BASE_URL en AFAS_CONNECTOR komen uit de omgeving of uit het
// .env-bestand (zie .env.example). Gebruik hier bij voorkeur de testomgeving van AFAS.

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\AfasConfig;
use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\CurlHttpClient;
use Tvb\Consumptie\Afas\EmployeeMapper;
use Tvb\Consumptie\Afas\FieldShape;

// Alleen vanaf de opdrachtregel. Zo kan dit bestand nooit via een webserver worden gestart.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

require dirname(__DIR__) . '/autoload.php';

$envFile = dirname(__DIR__, 2) . '/.env';
$showEmployers = false;
foreach (array_slice($argv, 1) as $argument) {
    if (str_starts_with($argument, '--env=')) {
        $envFile = substr($argument, strlen('--env='));
    } elseif ($argument === '--werkgevers') {
        $showEmployers = true;
    } else {
        fwrite(STDERR, "Onbekende optie: $argument. Gebruik: php backend/bin/afas-sync.php [--werkgevers] [--env=pad]\n");
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

// De redenen samengevat: per reden het aantal rijen en de eerste rij waar het voorkomt.
$reasons = [];
foreach ($mapped->problems as $problem) {
    $reasons[$problem['reason']] ??= ['count' => 0, 'first' => $problem['row']];
    $reasons[$problem['reason']]['count']++;
}
foreach ($reasons as $reason => $info) {
    echo '  ' . $info['count'] . ' keer: ' . $reason . ' (eerste keer in rij ' . $info['first'] . ")\n";
}

// De vorm van de velden die de koppeling leest, en van alle velden over de werkgever. Alleen aantallen.
$employerFields = array_values(array_filter(array_keys($rows[0] ?? []), static fn ($name): bool => is_string($name) && stripos($name, 'werkgever') === 0));
$fields = array_values(array_unique(array_merge($mapper->fieldNames(), $employerFields)));
echo "\nVorm van de velden (alleen aantallen, geen waarden):\n";
foreach ($fields as $field) {
    $shape = FieldShape::summarize($rows, $field);
    echo sprintf(
        "  %s: %d alleen cijfers, %d met letters of andere tekens, %d leeg, %d ontbreekt. %d verschillende waarden, langste %d tekens.\n",
        $field,
        $shape['digits'],
        $shape['other'],
        $shape['empty'],
        $shape['missing'],
        $shape['distinct'],
        $shape['longest']
    );
}

// Personeelsnummers die meer dan één keer voorkomen. De synchronisatie stopt als zulke rijen
// verschillende gegevens hebben, dus hier is te zien in welke velden ze verschillen en of een veld de
// goede rij kan aanwijzen. Alleen aantallen en veldnamen, geen waarden.
$duplicates = FieldShape::duplicates($rows, $mapper->sortField());
if ($duplicates['keys'] > 0) {
    $key = $mapper->sortField();
    echo "\nDubbele personeelsnummers (alleen aantallen, geen waarden):\n";
    echo sprintf(
        "  %d nummers komen meer dan één keer voor, samen %d rijen, hoogstens %d rijen per nummer.\n",
        $duplicates['keys'],
        $duplicates['rows'],
        $duplicates['largest']
    );
    echo '  Bij ' . $duplicates['identical'] . " daarvan zijn alle rijen precies gelijk.\n";
    if ($duplicates['differing'] !== []) {
        echo "  Velden die bij zo'n nummer verschillen (het aantal nummers):\n";
        foreach ($duplicates['differing'] as $field => $count) {
            echo '    ' . $field . ': ' . $count . "\n";
        }
    }
    foreach (array_keys($duplicates['differing']) as $field) {
        $field = (string) $field;
        if (stripos($field, 'geblokkeerd') !== false) {
            $choice = FieldShape::singleNoInDuplicates($rows, $key, $field);
            echo sprintf(
                "  %s: bij %d nummers is precies één rij niet geblokkeerd, bij %d meer dan één, bij %d geen.\n",
                $field,
                $choice['one'],
                $choice['several'],
                $choice['none']
            );
        }
        if (stripos($field, 'datum') === 0) {
            $choice = FieldShape::singleLatestInDuplicates($rows, $key, $field);
            echo sprintf(
                "  %s: bij %d nummers heeft precies één rij de laatste datum, bij %d delen rijen die datum, bij %d is het veld leeg.\n",
                $field,
                $choice['one'],
                $choice['shared'],
                $choice['empty']
            );
        }
    }
    if ($duplicates['identical'] < $duplicates['keys']) {
        echo "  De synchronisatie neemt per personeelsnummer de rij met de laatste Datum_in_dienst. Verschilt de werkgever, dan krijgt de beheerder een opmerking.\n";
    }
}

if ($showEmployers) {
    foreach ($employerFields as $field) {
        echo "\nWaarden van $field (hoogstens 50, met het aantal medewerkers):\n";
        foreach (FieldShape::distinctValues($rows, $field) as $value => $count) {
            echo '  ' . $count . ' keer: ' . $value . "\n";
        }
    }
} elseif ($employerFields !== []) {
    echo "\nDe waarden van de werkgever zelf bekijken: php backend/bin/afas-sync.php --werkgevers\n";
}
