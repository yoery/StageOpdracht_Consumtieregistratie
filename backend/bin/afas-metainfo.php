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

/**
 * Laat zien welke certificaten de server meestuurt (alleen het onderwerp en de uitgever). Bedoeld
 * voor als de controle van het certificaat mislukt. Er gaat hierbij geen token mee: er wordt alleen
 * een beveiligde verbinding geopend en weer gesloten.
 */
function describeCertificateChain(string $host): void
{
    $context = stream_context_create(['ssl' => ['capture_peer_cert_chain' => true, 'verify_peer' => false, 'verify_peer_name' => false, 'peer_name' => $host]]);
    $socket = @stream_socket_client("ssl://$host:443", $errorCode, $errorText, 10, STREAM_CLIENT_CONNECT, $context);
    if ($socket === false) {
        fwrite(STDERR, "De certificaten konden niet worden opgevraagd.\n");

        return;
    }
    $chain = stream_context_get_params($socket)['options']['ssl']['peer_certificate_chain'] ?? [];
    fclose($socket);

    fwrite(STDERR, 'De server stuurt ' . count($chain) . " certificaat/certificaten mee:\n");
    foreach ($chain as $index => $certificate) {
        $info = openssl_x509_parse($certificate) ?: [];
        fwrite(STDERR, sprintf(
            "  [%d] onderwerp: %s | uitgever: %s (%s) | geldig tot %s\n",
            $index,
            $info['subject']['CN'] ?? '?',
            $info['issuer']['CN'] ?? '?',
            $info['issuer']['O'] ?? '?',
            isset($info['validTo_time_t']) ? date('Y-m-d', $info['validTo_time_t']) : '?'
        ));
    }
    fwrite(STDERR, "De uitgever van het laatste certificaat moet bij PHP bekend zijn. Zie backend/README.md, Certificaten.\n");
}

$config = null;
try {
    $config = AfasConfig::fromEnvironment($envFile);
    $client = new AfasClient($config, new CurlHttpClient());
    $connectors = $client->connectors();
    $known = $config->connector !== null && in_array($config->connector, array_column($connectors, 'id'), true);
    $fields = $known ? $client->connectorFields() : [];
} catch (AfasException $error) {
    fwrite(STDERR, 'Mislukt (' . $error->kind . '): ' . $error->getMessage() . "\n");
    if ($config !== null && $error->kind === AfasException::NETWORK && stripos($error->getMessage(), 'certificate') !== false) {
        describeCertificateChain((string) parse_url($config->baseUrl, PHP_URL_HOST));
    }
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
