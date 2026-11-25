<?php

declare(strict_types=1);

// Tests voor de metadata van AFAS: welke GetConnectors er zijn en hoe de velden heten. De antwoorden
// zijn nagebootst. Bij metadata gaat er nooit een verzoek naar /connectors (de gegevens zelf).

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\HttpResponse;

test('Metadata: de lijst met GetConnectors komt van /metainfo, met de header van het token', function (): void {
    $http = new FakeHttpClient([new HttpResponse(200, json_encode([
        'updateConnectors' => [['id' => 'KnPerson', 'description' => 'Persoon']],
        'getConnectors' => [
            ['id' => 'TVB_Consumptie_Medewerkers', 'description' => 'Medewerkers voor de consumptieregistratie'],
            ['id' => 'Zonder_Omschrijving'],
            ['description' => 'zonder id telt niet'],
        ],
        'info' => ['envid' => 'T12345AA', 'appName' => 'Consumptieregistratie'],
    ], JSON_THROW_ON_ERROR))]);

    $connectors = (new AfasClient(fakeConfig(), $http))->connectors();

    same([
        ['id' => 'TVB_Consumptie_Medewerkers', 'description' => 'Medewerkers voor de consumptieregistratie'],
        ['id' => 'Zonder_Omschrijving', 'description' => ''],
    ], $connectors);
    same('https://12345.resttest.afas.online/ProfitRestServices/metainfo', $http->requests[0]['url']);
    same(['Authorization: AfasToken ' . fakeToken(), 'Accept: application/json'], $http->requests[0]['headers']);
});

test('Metadata: de velden van de GetConnector komen van /metainfo/get/<connector>', function (): void {
    $http = new FakeHttpClient([new HttpResponse(200, json_encode([
        'name' => 'TVB_Consumptie_Medewerkers',
        'description' => 'Medewerkers voor de consumptieregistratie',
        'fields' => [
            ['id' => 'Personeelsnummer', 'fieldId' => 'Mw', 'dataType' => 'string', 'label' => 'Medewerker', 'length' => 15],
            ['id' => 'DatumUitDienst', 'dataType' => 'date', 'label' => 'Datum uit dienst'],
            ['fieldId' => 'zonder id telt niet'],
        ],
    ], JSON_THROW_ON_ERROR))]);

    $fields = (new AfasClient(fakeConfig(), $http))->connectorFields();

    same([
        ['id' => 'Personeelsnummer', 'label' => 'Medewerker', 'dataType' => 'string', 'length' => 15],
        ['id' => 'DatumUitDienst', 'label' => 'Datum uit dienst', 'dataType' => 'date', 'length' => null],
    ], $fields);
    same('https://12345.resttest.afas.online/ProfitRestServices/metainfo/get/TVB_Consumptie_Medewerkers', $http->requests[0]['url']);
});

test('Metadata: er gaat geen verzoek naar /connectors, dus er komen geen gegevens van medewerkers mee', function (): void {
    $http = new FakeHttpClient([
        new HttpResponse(200, '{"getConnectors":[]}'),
        new HttpResponse(200, '{"fields":[]}'),
    ]);
    $client = new AfasClient(fakeConfig(), $http);

    $client->connectors();
    $client->connectorFields();

    foreach ($http->requests as $request) {
        ok(!str_contains($request['url'], '/connectors/'), 'metadata vroeg gegevens op: ' . $request['url']);
        ok(str_contains($request['url'], '/metainfo'));
    }
});

test('Metadata: een geweigerd token of een onverwacht antwoord geeft een fout zonder het token', function (): void {
    $denied = throws(AfasException::class, fn () => (new AfasClient(fakeConfig(), new FakeHttpClient([new HttpResponse(401, '')])))->connectors());
    same(AfasException::AUTH, $denied->kind);
    withoutToken($denied->getMessage(), 'de foutmelding');

    $wrong = throws(AfasException::class, fn () => (new AfasClient(fakeConfig(), new FakeHttpClient([new HttpResponse(200, '{"name":"x"}')])))->connectorFields());
    same(AfasException::FORMAT, $wrong->kind);

    $missing = throws(AfasException::class, fn () => (new AfasClient(fakeConfig(), new FakeHttpClient([new HttpResponse(404, '')])))->connectorFields());
    same(AfasException::HTTP, $missing->kind);
    same(404, $missing->status);
});
