<?php

declare(strict_types=1);

// Tests voor de instellingen: het .env-bestand lezen (EnvFile), de waarden controleren en het token
// afschermen (AfasConfig).

use Tvb\Consumptie\Afas\AfasConfig;
use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\EnvFile;

/** Schrijft een tijdelijk .env-bestand, geeft het pad aan de test en ruimt het daarna op. */
function withEnvFile(string $content, callable $body): void
{
    $path = tempnam(sys_get_temp_dir(), 'tvb-env-');
    file_put_contents($path, $content);
    try {
        $body($path);
    } finally {
        unlink($path);
    }
}

test('EnvFile: leest NAAM=waarde, slaat lege regels en opmerkingen over en haalt aanhalingstekens weg', function (): void {
    withEnvFile("# opmerking\n\nAFAS_BASE_URL=https://12345.rest.afas.online/ProfitRestServices\nAFAS_TOKEN = \"abc=\"\nNAAM='met spatie'\nklein=telt niet\nZONDER\n", function (string $path): void {
        same([
            'AFAS_BASE_URL' => 'https://12345.rest.afas.online/ProfitRestServices',
            'AFAS_TOKEN' => 'abc=',
            'NAAM' => 'met spatie',
        ], EnvFile::read($path));
    });
});

test('EnvFile: een bestand dat niet bestaat, geeft een lege lijst', function (): void {
    same([], EnvFile::read(sys_get_temp_dir() . '/bestaat-niet-' . bin2hex(random_bytes(4)) . '.env'));
});

test('EnvFile: de waarden komen niet in de omgeving van PHP', function (): void {
    withEnvFile("TVB_TEST_GEHEIM=waarde\n", function (string $path): void {
        EnvFile::read($path);
        same(false, getenv('TVB_TEST_GEHEIM'));
        ok(!isset($_ENV['TVB_TEST_GEHEIM']));
    });
});

test('AfasConfig: de header is "Authorization: AfasToken " met het token erachter, niet opnieuw gecodeerd', function (): void {
    same('Authorization: AfasToken ' . fakeToken(), fakeConfig()->authorizationHeader());
});

test('AfasConfig: de naam van de GetConnector komt uit AFAS_CONNECTOR, en een portie is standaard 100', function (): void {
    $config = AfasConfig::fromValues(['AFAS_TOKEN' => fakeToken(), 'AFAS_BASE_URL' => 'https://12345.rest.afas.online', 'AFAS_CONNECTOR' => ' Mijn_Connector ']);

    same('Mijn_Connector', $config->connector);
    same('Mijn_Connector', $config->connectorName());
    same(100, $config->take);
});

test('AfasConfig: is AFAS_CONNECTOR leeg, dan laden de instellingen wel en volgt een duidelijke melding bij gebruik', function (): void {
    foreach ([[], ['AFAS_CONNECTOR' => ''], ['AFAS_CONNECTOR' => '   ']] as $extra) {
        $config = AfasConfig::fromValues(['AFAS_TOKEN' => fakeToken(), 'AFAS_BASE_URL' => 'https://12345.rest.afas.online'] + $extra);

        same(null, $config->connector);
        $error = throws(AfasException::class, fn () => $config->connectorName());
        same(AfasException::CONFIG, $error->kind);
        ok(str_contains($error->getMessage(), 'AFAS_CONNECTOR ontbreekt'));
        ok(str_contains($error->getMessage(), 'afas-metainfo.php'), 'de melding zegt hoe de naam te vinden is');
        withoutToken($error->getMessage(), 'de foutmelding');
    }
});

test('AfasConfig: het adres verliest de schuine streep aan het eind en krijgt zonder pad /ProfitRestServices', function (): void {
    same('https://12345.rest.afas.online/ProfitRestServices', fakeConfig(100, 'https://12345.rest.afas.online/ProfitRestServices/')->baseUrl);
    same('https://12345.rest.afas.online/ProfitRestServices', fakeConfig(100, 'https://12345.REST.afas.online')->baseUrl);
    same('https://12345.restaccept.afas.online/ProfitRestServices', fakeConfig(100, 'https://12345.restaccept.afas.online/ProfitRestServices')->baseUrl);
});

test('AfasConfig: zonder token of zonder adres volgt een duidelijke fout', function (): void {
    $missingToken = throws(AfasException::class, fn () => AfasConfig::fromValues(['AFAS_TOKEN' => '', 'AFAS_BASE_URL' => 'https://12345.rest.afas.online']));
    same(AfasException::CONFIG, $missingToken->kind);
    ok(str_contains($missingToken->getMessage(), 'AFAS_TOKEN ontbreekt'));

    $missingUrl = throws(AfasException::class, fn () => AfasConfig::fromValues(['AFAS_TOKEN' => fakeToken()]));
    ok(str_contains($missingUrl->getMessage(), 'AFAS_BASE_URL ontbreekt'));
});

test('AfasConfig: alleen een https-adres van AFAS, zodat het token nooit onversleuteld of naar een andere server gaat', function (): void {
    $wrong = [
        'http://12345.rest.afas.online/ProfitRestServices',
        'https://voorbeeld.nl/ProfitRestServices',
        'https://afas.online.voorbeeld.nl/ProfitRestServices',
        'https://gebruiker:wachtwoord@12345.rest.afas.online/ProfitRestServices',
        'https://12345.rest.afas.online/ProfitRestServices?x=1',
        'https://12345.rest.afas.online:8443/ProfitRestServices',
        'geen adres',
    ];
    foreach ($wrong as $baseUrl) {
        $error = throws(AfasException::class, fn () => fakeConfig(100, $baseUrl));
        same(AfasException::CONFIG, $error->kind, $baseUrl);
        withoutToken($error->getMessage(), 'de foutmelding');
    }
});

test('AfasConfig: een token dat geen Base64 is of twee keer is gecodeerd, wordt geweigerd zonder het te noemen', function (): void {
    $raw = '<token><version>1</version><data>NEPTOKEN-ALLEEN-VOOR-DE-TESTS-0000</data></token>';
    $twice = base64_encode(fakeToken());
    foreach ([$raw, $twice, 'niet base64!', fakeToken() . ' ' . fakeToken()] as $token) {
        $error = throws(AfasException::class, fn () => AfasConfig::fromValues(['AFAS_TOKEN' => $token, 'AFAS_BASE_URL' => 'https://12345.rest.afas.online']));
        same(AfasException::CONFIG, $error->kind);
        ok(!str_contains($error->getMessage(), $token), 'de foutmelding noemt het token');
        withoutToken($error->getMessage(), 'de foutmelding');
        withoutToken($error->getTraceAsString(), 'de stacktrace');
    }
});

test('AfasConfig: de melding zegt wat er mis is met het token, zonder het token te noemen', function (): void {
    $raw = '<token><version>1</version><data>NEPTOKEN-ALLEEN-VOOR-DE-TESTS-0000</data></token>';
    $cases = [
        'begint met het woord AfasToken' => 'AfasToken ' . fakeToken(),
        'de token-XML zelf' => $raw,
        'aanhalingsteken' => '"' . fakeToken(),
        'spatie, tab of regeleinde' => substr(fakeToken(), 0, 20) . ' ' . substr(fakeToken(), 20),
        '- of _ in plaats van + en /' => 'abc-def_ghi',
        'teken dat niet in Base64 voorkomt' => 'abc$def',
    ];
    foreach ($cases as $expected => $token) {
        $error = throws(AfasException::class, fn () => AfasConfig::fromValues(['AFAS_TOKEN' => $token, 'AFAS_BASE_URL' => 'https://12345.rest.afas.online']));
        ok(str_contains($error->getMessage(), $expected), "verwacht \"$expected\" in: " . $error->getMessage());
        withoutToken($error->getMessage(), 'de foutmelding');
        ok(!str_contains($error->getMessage(), $token), 'de foutmelding noemt de waarde');
    }
});

test('AfasConfig: de portiegrootte en de naam van de connector worden gecontroleerd', function (): void {
    $values = ['AFAS_TOKEN' => fakeToken(), 'AFAS_BASE_URL' => 'https://12345.rest.afas.online', 'AFAS_CONNECTOR' => 'Andere_Connector'];
    throws(AfasException::class, fn () => AfasConfig::fromValues($values, 0));
    throws(AfasException::class, fn () => AfasConfig::fromValues($values, 1001));
    throws(AfasException::class, fn () => AfasConfig::fromValues(['AFAS_CONNECTOR' => 'TVB/../x'] + $values));
    throws(AfasException::class, fn () => AfasConfig::fromValues(['AFAS_CONNECTOR' => 'Naam met spatie'] + $values));
    same(25, AfasConfig::fromValues($values, 25)->take);
});

test('AfasConfig: het token staat in geen enkele dump van het object en opslaan wordt geweigerd', function (): void {
    $config = fakeConfig();

    withoutToken(print_r($config, true), 'print_r');
    withoutToken(var_export($config, true), 'var_export');
    withoutToken(json_encode($config, JSON_THROW_ON_ERROR), 'json_encode');
    withoutToken(print_r((array) $config, true), 'de omzetting naar een lijst');
    ob_start();
    var_dump($config);
    withoutToken((string) ob_get_clean(), 'var_dump');

    throws(LogicException::class, fn () => serialize($config));
    throws(Error::class, fn () => clone $config);
});

test('AfasConfig: de omgeving van de server gaat voor het .env-bestand', function (): void {
    $fromFile = 'https://11111.rest.afas.online/ProfitRestServices';
    withEnvFile("AFAS_TOKEN=" . fakeToken() . "\nAFAS_BASE_URL=$fromFile\nAFAS_CONNECTOR=Uit_Het_Bestand\n", function (string $path) use ($fromFile): void {
        if (getenv('AFAS_TOKEN') !== false || getenv('AFAS_BASE_URL') !== false || getenv('AFAS_CONNECTOR') !== false) {
            skip('op deze computer staan AFAS-instellingen in de omgeving');
        }
        same($fromFile, AfasConfig::fromEnvironment($path)->baseUrl);
        same('Uit_Het_Bestand', AfasConfig::fromEnvironment($path)->connector);

        putenv('AFAS_BASE_URL=https://22222.rest.afas.online/ProfitRestServices');
        try {
            same('https://22222.rest.afas.online/ProfitRestServices', AfasConfig::fromEnvironment($path)->baseUrl);
        } finally {
            putenv('AFAS_BASE_URL');
        }
    });
});

test('AfasConfig: zonder .env-bestand en zonder omgeving volgt de uitleg over .env.example', function (): void {
    if (getenv('AFAS_TOKEN') !== false || getenv('AFAS_BASE_URL') !== false) {
        skip('op deze computer staan AFAS_TOKEN of AFAS_BASE_URL in de omgeving');
    }
    $error = throws(AfasException::class, fn () => AfasConfig::fromEnvironment(sys_get_temp_dir() . '/bestaat-niet-' . bin2hex(random_bytes(4)) . '.env'));
    ok(str_contains($error->getMessage(), '.env.example'));
});
