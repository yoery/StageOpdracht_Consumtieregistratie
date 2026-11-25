<?php

declare(strict_types=1);

// Tests voor een lege AFAS_CONNECTOR. De naam van de GetConnector is nog niet bekend. Zolang hij
// ontbreekt, geeft de koppeling een duidelijke melding en gaat er geen verzoek om gegevens naar AFAS.

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\EmployeeMapper;
use Tvb\Consumptie\Afas\EmployeeSync;
use Tvb\Consumptie\Afas\HttpResponse;
use Tvb\Consumptie\Afas\SyncRunner;

/** Instellingen met een token en een adres, maar zonder naam van de GetConnector. */
function configWithoutConnector(): \Tvb\Consumptie\Afas\AfasConfig
{
    return fakeConfig(100, 'https://12345.resttest.afas.online/ProfitRestServices', '');
}

test('Zonder AFAS_CONNECTOR: ophalen geeft een duidelijke melding en doet geen verzoek', function (): void {
    $http = new FakeHttpClient([]);
    $client = new AfasClient(configWithoutConnector(), $http);

    foreach ([fn () => $client->fetchAll('Personeelsnummer'), fn () => $client->fetchPage(0, 'Personeelsnummer'), fn () => $client->pageUrl(0, 'Personeelsnummer'), fn () => $client->connectorFields()] as $call) {
        $error = throws(AfasException::class, $call);
        same(AfasException::CONFIG, $error->kind);
        ok(str_contains($error->getMessage(), 'AFAS_CONNECTOR ontbreekt'));
    }
    same([], $http->requests, 'er is toch een verzoek gedaan');
});

test('Zonder AFAS_CONNECTOR: de lijst met connectors is wel op te vragen, om de naam te vinden', function (): void {
    $http = new FakeHttpClient([new HttpResponse(200, '{"getConnectors":[{"id":"Een_Connector","description":"Voorbeeld"}]}')]);

    same([['id' => 'Een_Connector', 'description' => 'Voorbeeld']], (new AfasClient(configWithoutConnector(), $http))->connectors());
    same('https://12345.resttest.afas.online/ProfitRestServices/metainfo', $http->requests[0]['url']);
});

test('Zonder AFAS_CONNECTOR: de synchronisatie mislukt netjes, wijzigt niets en meldt wat er ontbreekt', function (): void {
    $http = new FakeHttpClient([]);
    $repository = new InMemoryRepository([stored()], lastCount: 8);
    $log = [];
    $runner = new SyncRunner(
        new AfasClient(configWithoutConnector(), $http),
        new EmployeeMapper(),
        new EmployeeSync(),
        $repository,
        static function (string $line) use (&$log): void {
            $log[] = $line;
        }
    );

    $result = $runner->run(new DateTimeImmutable('2026-11-25T09:00:00+01:00'));

    ok(!$result->ok);
    ok(str_contains($result->message, 'AFAS_CONNECTOR ontbreekt'));
    same([], $repository->applied);
    same(8, $repository->lastCount);
    same([], $http->requests);
    same(1, count($log));
    withoutToken(implode("\n", $log), 'het logboek');
});
