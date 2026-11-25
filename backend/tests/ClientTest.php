<?php

declare(strict_types=1);

// Tests voor AfasClient: het adres van een portie, de header met het token, ophalen in porties en
// wat er gebeurt bij een fout van AFAS. De antwoorden zijn nagebootst (FakeHttpClient).

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\HttpResponse;

test('AfasClient: het adres bevat de connector, skip, take en de sortering op personeelsnummer', function (): void {
    $client = new AfasClient(fakeConfig(), new FakeHttpClient([]));

    same(
        'https://12345.resttest.afas.online/ProfitRestServices/connectors/TVB_Consumptie_Medewerkers?skip=200&take=100&orderbyfieldids=Personeelsnummer',
        $client->pageUrl(200, 'Personeelsnummer')
    );
});

test('AfasClient: ieder verzoek krijgt de header met het token en vraagt om JSON', function (): void {
    $http = new FakeHttpClient([afasPage([afasRow(), afasRow(['Personeelsnummer' => '5002'])], 0, 2), afasPage([], 2, 2)]);

    (new AfasClient(fakeConfig(2), $http))->fetchAll('Personeelsnummer');

    same(2, count($http->requests));
    foreach ($http->requests as $request) {
        same(['Authorization: AfasToken ' . fakeToken(), 'Accept: application/json'], $request['headers']);
        withoutToken($request['url'], 'het adres');
    }
});

test('AfasClient: haalt porties op tot er een portie komt die kleiner is dan take', function (): void {
    $rows = [];
    foreach (range(1, 5) as $number) {
        $rows[] = afasRow(['Personeelsnummer' => (string) (5000 + $number)]);
    }
    $http = new FakeHttpClient([afasPage(array_slice($rows, 0, 2)), afasPage(array_slice($rows, 2, 2)), afasPage(array_slice($rows, 4, 1))]);

    $result = (new AfasClient(fakeConfig(2), $http))->fetchAll('Personeelsnummer');

    same(['5001', '5002', '5003', '5004', '5005'], array_column($result, 'Personeelsnummer'));
    same(
        ['skip=0&take=2', 'skip=2&take=2', 'skip=4&take=2'],
        array_map(static fn (array $request): string => explode('&orderbyfieldids', explode('?', $request['url'])[1])[0], $http->requests)
    );
});

test('AfasClient: is de laatste portie precies vol, dan volgt nog één lege portie en stopt het ophalen', function (): void {
    $http = new FakeHttpClient([afasPage([afasRow(), afasRow(['Personeelsnummer' => '5002'])]), afasPage([])]);

    same(2, count((new AfasClient(fakeConfig(2), $http))->fetchAll('Personeelsnummer')));
    same(2, count($http->requests));
});

test('AfasClient: een lege lijst geeft nul rijen met één verzoek', function (): void {
    $http = new FakeHttpClient([afasPage([])]);

    same([], (new AfasClient(fakeConfig(), $http))->fetchAll('Personeelsnummer'));
    same(1, count($http->requests));
});

test('AfasClient: weigert AFAS het token (401 of 403), dan volgt een fout zonder het token erin', function (): void {
    foreach ([401, 403] as $status) {
        $error = throws(AfasException::class, fn () => (new AfasClient(fakeConfig(), new FakeHttpClient([new HttpResponse($status, 'Unauthorized')])))->fetchAll('Personeelsnummer'));
        same(AfasException::AUTH, $error->kind);
        same($status, $error->status);
        withoutToken($error->getMessage(), 'de foutmelding');
        withoutToken($error->getTraceAsString(), 'de stacktrace');
    }
});

test('AfasClient: een andere foutstatus geeft een fout met de status, zonder de inhoud van het antwoord', function (): void {
    $body = '{"error":"Lotte van Dijk kon niet worden gelezen"}';
    $error = throws(AfasException::class, fn () => (new AfasClient(fakeConfig(), new FakeHttpClient([new HttpResponse(500, $body)])))->fetchAll('Personeelsnummer'));

    same(AfasException::HTTP, $error->kind);
    same(500, $error->status);
    ok(str_contains($error->getMessage(), 'status 500'));
    ok(!str_contains($error->getMessage(), 'Lotte'), 'de foutmelding bevat de inhoud van het antwoord');
});

test('AfasClient: een antwoord dat geen JSON is of geen lijst rows heeft, geeft een fout', function (): void {
    $wrong = ['<html>Storing</html>', '{"skip":0,"take":100}', '{"rows":"geen lijst"}', '{"rows":{"a":1}}', '{"rows":["geen object"]}', ''];
    foreach ($wrong as $body) {
        $error = throws(AfasException::class, fn () => (new AfasClient(fakeConfig(), new FakeHttpClient([new HttpResponse(200, $body)])))->fetchAll('Personeelsnummer'));
        same(AfasException::FORMAT, $error->kind, $body);
    }
});

test('AfasClient: geeft AFAS meer rijen dan gevraagd, dan stopt het ophalen', function (): void {
    $http = new FakeHttpClient([afasPage([afasRow(), afasRow(['Personeelsnummer' => '5002']), afasRow(['Personeelsnummer' => '5003'])])]);

    same(AfasException::FORMAT, throws(AfasException::class, fn () => (new AfasClient(fakeConfig(2), $http))->fetchAll('Personeelsnummer'))->kind);
});

test('AfasClient: een fout halverwege gooit alles weg, er komt geen halve lijst terug', function (): void {
    $http = new FakeHttpClient([afasPage([afasRow(), afasRow(['Personeelsnummer' => '5002'])]), new AfasException(AfasException::NETWORK, 'Geen verbinding met de server: time-out')]);

    same(AfasException::NETWORK, throws(AfasException::class, fn () => (new AfasClient(fakeConfig(2), $http))->fetchAll('Personeelsnummer'))->kind);
});

test('AfasClient: blijft AFAS volle porties geven, dan stopt het ophalen na het hoogste aantal porties', function (): void {
    $endless = new class implements \Tvb\Consumptie\Afas\HttpClient {
        public int $count = 0;

        public function get(string $url, array $headers): HttpResponse
        {
            $this->count++;

            return afasPage([afasRow()], 0, 1);
        }
    };

    $error = throws(AfasException::class, fn () => (new AfasClient(fakeConfig(1), $endless))->fetchAll('Personeelsnummer'));
    same(AfasException::FORMAT, $error->kind);
    same(AfasClient::MAX_PAGES, $endless->count);
});

test('AfasClient: het sorteerveld en skip worden gecontroleerd', function (): void {
    $client = new AfasClient(fakeConfig(), new FakeHttpClient([]));

    throws(AfasException::class, fn () => $client->pageUrl(0, 'Personeelsnummer&take=99999'));
    throws(AfasException::class, fn () => $client->pageUrl(0, ''));
    throws(AfasException::class, fn () => $client->pageUrl(-1, 'Personeelsnummer'));
});
