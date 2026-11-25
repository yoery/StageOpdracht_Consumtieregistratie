<?php

declare(strict_types=1);

// Tests voor SyncRunner: één synchronisatie van ophalen tot opslaan, en wat er gebeurt als er iets
// misgaat. De acceptatiecriteria AC-87, AC-88 en AC-89 uit het TO zijn hier nagespeeld met
// nagebootste antwoorden van AFAS en een opslag in het geheugen.

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\EmployeeMapper;
use Tvb\Consumptie\Afas\EmployeeSync;
use Tvb\Consumptie\Afas\HttpResponse;
use Tvb\Consumptie\Afas\SyncResult;

/**
 * Draait één synchronisatie met deze antwoorden van AFAS en deze opslag. De regels van het logboek
 * komen in `$log`.
 *
 * @param list<HttpResponse|Throwable> $responses
 * @param list<string> $log
 */
function runSync(array $responses, InMemoryRepository $repository, array &$log = [], string $now = '2026-11-25T09:00:00+01:00'): SyncResult
{
    $runner = new \Tvb\Consumptie\Afas\SyncRunner(
        new AfasClient(fakeConfig(), new FakeHttpClient($responses)),
        fullMapper(),
        new EmployeeSync(),
        $repository,
        static function (string $line) use (&$log): void {
            $log[] = $line;
        }
    );

    return $runner->run(new DateTimeImmutable($now));
}

test('SyncRunner (AC-87): een nieuwe medewerker uit AFAS wordt opgeslagen en de synchronisatie staat in het logboek', function (): void {
    $repository = new InMemoryRepository([]);
    $log = [];

    $result = runSync([afasPage([afasRow()])], $repository, $log);

    ok($result->ok);
    same(1, count($repository->applied));
    same('5001', $repository->applied[0]->additions[0]['personnelNumber']);
    same('bedrijf-tvb', $repository->applied[0]->additions[0]['companyId']);
    same('101', $repository->applied[0]->additions[0]['payrollCode']);
    same([], $repository->failures);
    same(1, $repository->lastCount);
    same(['AFAS-synchronisatie gelukt: 1 rijen uit AFAS, 1 toegevoegd, 0 gewijzigd (waarvan 0 inactief en 0 weer actief), 0 rijen afgekeurd.'], $log);
});

test('SyncRunner (AC-88): een datum uit dienst in het verleden maakt de medewerker inactief en verwijdert hem niet', function (): void {
    $repository = new InMemoryRepository([stored()]);

    $result = runSync([afasPage([afasRow(['DatumUitDienst' => '2026-10-31'])])], $repository);

    ok($result->ok);
    same([], $repository->applied[0]->additions);
    same([['id' => 'medewerker-lotte', 'personnelNumber' => '5001', 'changes' => ['active' => false]]], $repository->applied[0]->updates);
});

test('SyncRunner (AC-89): met een verkeerd token wordt geen enkele medewerker gewijzigd', function (): void {
    $repository = new InMemoryRepository([stored()], lastCount: 1);
    $log = [];

    $result = runSync([new HttpResponse(401, 'Unauthorized')], $repository, $log);

    ok(!$result->ok);
    same([], $repository->applied);
    same(1, count($repository->failures));
    same(1, $repository->lastCount);
    ok(str_contains($log[0], 'AFAS-synchronisatie mislukt (auth)'));
    withoutToken(implode("\n", $log) . implode("\n", $repository->failures) . $result->message, 'het logboek');
});

test('SyncRunner (AC-89): zonder verbinding met AFAS wordt geen enkele medewerker gewijzigd', function (): void {
    $repository = new InMemoryRepository([stored()]);
    $log = [];

    $result = runSync([new AfasException(AfasException::NETWORK, 'Geen verbinding met de server: time-out')], $repository, $log);

    ok(!$result->ok);
    same([], $repository->applied);
    ok(str_contains($log[0], 'mislukt (network)'));
});

test('SyncRunner (AC-89): een lege lijst van AFAS maakt niemand inactief', function (): void {
    $repository = new InMemoryRepository([stored()], lastCount: 8);
    $log = [];

    $result = runSync([afasPage([])], $repository, $log);

    ok(!$result->ok);
    same([], $repository->applied);
    same(8, $repository->lastCount);
    ok(str_contains($log[0], 'mislukt (check)') && str_contains($log[0], 'lege lijst'));
});

test('SyncRunner: valt AFAS halverwege het ophalen uit, dan wordt er niets opgeslagen', function (): void {
    $repository = new InMemoryRepository([stored()]);
    $rows = array_map(static fn (int $number): array => afasRow(['Personeelsnummer' => (string) $number]), range(5001, 5100));

    $result = runSync([afasPage($rows), new HttpResponse(503, 'Service Unavailable')], $repository);

    ok(!$result->ok);
    same([], $repository->applied);
});

test('SyncRunner: ontbreekt een verplicht veld in het antwoord, dan wordt er niets opgeslagen', function (): void {
    $repository = new InMemoryRepository([stored()]);
    $row = afasRow();
    unset($row['Looncode']);

    $result = runSync([afasPage([$row])], $repository);

    ok(!$result->ok);
    same([], $repository->applied);
    ok(str_contains($result->message, 'Looncode'));
});

test('SyncRunner: mislukt het opslaan, dan staat alleen het soort fout in het logboek en niet de melding van de opslag', function (): void {
    $repository = new InMemoryRepository([stored()]);
    $repository->applyError = new RuntimeException('INSERT mislukt voor Mark Jansen (looncode 102)');
    $log = [];

    $result = runSync([afasPage([afasRow(['Looncode' => '102'])])], $repository, $log);

    ok(!$result->ok);
    same(1, count($repository->failures));
    ok(str_contains($log[0], 'opslaan is niet gelukt (RuntimeException)'));
    ok(!str_contains(implode("\n", $log), 'Jansen'), 'het logboek bevat de melding van de opslag');
});

test('SyncRunner: kan de mislukte poging zelf niet worden vastgelegd, dan komt er toch een uitkomst', function (): void {
    $repository = new InMemoryRepository([stored()]);
    $repository->recordError = new RuntimeException('de database is niet bereikbaar');
    $log = [];

    $result = runSync([new HttpResponse(500, '')], $repository, $log);

    ok(!$result->ok);
    same([], $repository->applied);
    same(2, count($log));
    ok(str_contains($log[1], 'kon niet worden vastgelegd (RuntimeException)'));
});

test('SyncRunner: een onverwachte fout bij het lezen uit de opslag wijzigt niets', function (): void {
    $repository = new class extends InMemoryRepository {
        public function employees(): array
        {
            throw new RuntimeException('SELECT mislukt');
        }
    };
    $log = [];

    $result = runSync([afasPage([afasRow()])], $repository, $log);

    ok(!$result->ok);
    same([], $repository->applied);
    ok(str_contains($log[0], 'onverwachte fout (RuntimeException)'));
});

test('SyncRunner: de opmerkingen in het logboek noemen personeelsnummers en geen namen', function (): void {
    $mark = stored(['id' => 'medewerker-mark', 'personnelNumber' => '5002', 'firstName' => 'Mark', 'lastName' => 'Jansen']);
    $repository = new InMemoryRepository([stored(), $mark]);
    $log = [];

    runSync([afasPage([afasRow(['Werkgever' => '9999'])])], $repository, $log);

    $text = implode("\n", $log);
    ok(str_contains($text, 'Personeelsnummer 5002 staat niet meer in AFAS'));
    ok(str_contains($text, 'werkgever 9999 is niet bekend'));
    foreach (['Lotte', 'Dijk', 'Mark', 'Jansen'] as $name) {
        ok(!str_contains($text, $name), "het logboek bevat de naam $name");
    }
    withoutToken($text, 'het logboek');
});

test('SyncRunner: de dag van vandaag wordt bepaald in de tijdzone van TVB', function (): void {
    $log = [];
    // 31 oktober 23:30 UTC is in Nederland al 1 november 00:30. De laatste werkdag (31 oktober) is dan voorbij.
    $late = new InMemoryRepository([stored()]);
    runSync([afasPage([afasRow(['DatumUitDienst' => '2026-10-31'])])], $late, $log, '2026-10-31T23:30:00+00:00');
    same(['active' => false], $late->applied[0]->updates[0]['changes']);

    // 31 oktober 21:30 UTC is in Nederland nog 31 oktober. De medewerker is dan nog in dienst.
    $early = new InMemoryRepository([stored()]);
    runSync([afasPage([afasRow(['DatumUitDienst' => '2026-10-31'])])], $early, $log, '2026-10-31T21:30:00+00:00');
    ok($early->applied[0]->isEmpty());
});

test('SyncRunner: de tweede keer verandert er niets meer', function (): void {
    $repository = new InMemoryRepository([]);
    runSync([afasPage([afasRow()])], $repository);

    $repository->employees = [stored()];
    $second = runSync([afasPage([afasRow()])], $repository);

    ok($second->ok);
    ok($repository->applied[1]->isEmpty());
});
