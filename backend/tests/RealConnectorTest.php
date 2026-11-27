<?php

declare(strict_types=1);

// Tests voor de GetConnector zoals TVB die nu heeft. Die geeft Medewerker, Roepnaam, Achternaam,
// Voorvoegsel, Werkgever (de naam van het bedrijf) en Werkgever_2 (het werkgevernummer), maar geen
// looncode, geen werklocatie en geen datum uit dienst. De
// standaardinstelling van EmployeeMapper hoort bij deze connector. De rijen zijn nepgegevens.

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\EmployeeMapper;
use Tvb\Consumptie\Afas\EmployeeSync;
use Tvb\Consumptie\Afas\SyncRunner;

test('Connector van TVB: Medewerker is het personeelsnummer en Roepnaam de voornaam', function (): void {
    $mapper = new EmployeeMapper();
    $mapped = $mapper->map([realRow()]);

    same([], $mapped->problems);
    same('Medewerker', $mapper->sortField());
    same(['Medewerker', 'Roepnaam', 'Achternaam', 'Voorvoegsel', 'Werkgever_2', 'Organisatorische_Eenheid', 'Werkgever', 'Datum_in_dienst'], $mapper->fieldNames());
    $employee = $mapped->employees[0];
    same('5001', $employee->personnelNumber);
    same('Lotte', $employee->firstName);
    same('van Dijk', $employee->lastName);
    same('4711', $employee->employerNumber);
});

test('Connector van TVB: looncode en datum uit dienst komen niet uit AFAS, de afdeling wel (FR-102)', function (): void {
    // Ook als een rij toevallig zo'n veld heeft, wordt het niet gelezen: het staat uit.
    $employee = (new EmployeeMapper())->map([realRow(['Looncode' => '999', 'Werklocatie' => 'Hoofdkantoor', 'DatumUitDienst' => '2020-01-01'])])->employees[0];

    same(null, $employee->payrollCode);
    same('Hoofdkantoor', $employee->workLocation, 'de afdeling komt uit Organisatorische_Eenheid, niet uit Werklocatie');
    same(null, $employee->endDate);
    ok($employee->isActiveOn('2026-11-25'));
});

test('Connector van TVB: adres, geboortedatum en de andere extra velden worden niet overgenomen', function (): void {
    $employee = (new EmployeeMapper())->map([realRow()])->employees[0];
    $text = json_encode(get_object_vars($employee), JSON_THROW_ON_ERROR);

    foreach (['Voorbeeldstraat', 'Voorbeeldstad', '1990', 'L.'] as $extra) {
        ok(!str_contains($text, $extra), "de medewerker bevat $extra");
    }
});

test('Connector van TVB: het werkgevernummer komt uit Werkgever_2, met de voorloopnul, en de naam uit Werkgever', function (): void {
    $mapper = new EmployeeMapper();

    $employee = $mapper->map([realRow(['Werkgever' => 'Voorbeeld Klimaattechniek B.V.', 'Werkgever_2' => '01', 'Datum_in_dienst' => '2024-03-01T00:00:00Z'])])->employees[0];
    same('01', $employee->employerNumber);
    same('Voorbeeld Klimaattechniek B.V.', $employee->employerName, 'de naam is nodig om een nieuw bedrijf aan te maken');
    same('2024-03-01', $employee->startDate);

    // Een rij zonder de naam of met een kapotte datum in dienst is gewoon geldig: die zijn alleen hulpgegevens.
    $row = realRow(['Datum_in_dienst' => 'gisteren', 'Werkgever' => "Naam\nmet enter"]);
    same([], $mapper->map([$row])->problems);
    same(['', null], [$mapper->map([$row])->employees[0]->employerName, $mapper->map([$row])->employees[0]->startDate]);
    $row = realRow();
    unset($row['Werkgever']);
    same([], $mapper->map([$row])->problems);

    // Een naam in plaats van een nummer wordt afgekeurd, zonder de naam in de reden.
    $mapped = $mapper->map([realRow(['Werkgever_2' => 'Voorbeeld B.V.'])]);
    same('de werkgever ontbreekt of bestaat niet alleen uit cijfers', $mapped->problems[0]['reason']);
});

test('Connector van TVB: werkgevernummer 01 is een ander nummer dan 1', function (): void {
    $repository = new InMemoryRepository([]);
    $plan = (new EmployeeSync())->plan((new EmployeeMapper())->map([realRow(['Werkgever_2' => '01'])]), [], ['1' => 'bedrijf-een'], $repository->points, '2026-11-25', null);

    // 01 is niet 1: er komt een nieuw bedrijf voor werkgever 01, met de naam uit AFAS.
    same('afas-werkgever-01', $plan->additions[0]['companyId']);
    same([['id' => 'afas-werkgever-01', 'employerNumber' => '01', 'name' => 'Voorbeeld Installaties B.V.']], $plan->companies);
    ok(str_contains(implode("\n", $plan->notes), 'Werkgever 01 (Voorbeeld Installaties B.V.) is nieuw'));
});

test('Connector van TVB: ontbreekt Medewerker, Roepnaam, Achternaam of Werkgever_2, dan stopt alles', function (): void {
    foreach (['Medewerker', 'Roepnaam', 'Achternaam', 'Werkgever_2'] as $field) {
        $row = realRow();
        unset($row[$field]);

        $error = throws(AfasException::class, fn () => (new EmployeeMapper())->map([$row]));
        same(AfasException::FORMAT, $error->kind);
        ok(str_contains($error->getMessage(), $field));
    }
});

test('Connector van TVB: de vier vaste velden kunnen niet worden uitgezet', function (): void {
    foreach (['personnelNumber', 'firstName', 'lastName', 'employer'] as $key) {
        throws(AfasException::class, fn () => new EmployeeMapper([$key => null]));
    }
    // De andere wel, en ze kunnen weer aan als de connector het veld later krijgt.
    same(['Medewerker', 'Roepnaam', 'Achternaam', 'Werkgever_2', 'Organisatorische_Eenheid', 'Werkgever', 'Datum_in_dienst'], (new EmployeeMapper(['prefix' => null]))->fieldNames());
    ok(in_array('Looncode', (new EmployeeMapper(['payrollCode' => 'Looncode']))->fieldNames(), true));
});

test('Connector van TVB: een nieuwe medewerker komt zonder looncode binnen, met een opmerking voor de beheerder', function (): void {
    $repository = new InMemoryRepository([]);
    $plan = (new EmployeeSync())->plan((new EmployeeMapper())->map([realRow()]), [], $repository->companies, $repository->points, '2026-11-25', null);

    same('', $plan->additions[0]['payrollCode']);
    same('bedrijf-tvb', $plan->additions[0]['companyId']);
    same('punt-hoofdkantoor', $plan->additions[0]['pointId'], 'de afdeling Hoofdkantoor heeft een punt met die naam');
    same('Hoofdkantoor', $plan->additions[0]['unit']);
    ok(str_contains(implode("\n", $plan->notes), 'Personeelsnummer 5001 is toegevoegd zonder looncode'));
});

test('Connector van TVB: de looncode die de beheerder heeft ingevuld, blijft staan', function (): void {
    $repository = new InMemoryRepository([stored(['payrollCode' => '101'])]);
    $plan = (new EmployeeSync())->plan(
        (new EmployeeMapper())->map([realRow(['Roepnaam' => 'Charlotte'])]),
        $repository->employees,
        $repository->companies,
        $repository->points,
        '2026-11-25',
        null
    );

    same([['id' => 'medewerker-lotte', 'personnelNumber' => '5001', 'changes' => ['firstName' => 'Charlotte']]], $plan->updates);
});

test('Connector van TVB: wie niet meer in de lijst staat, wordt inactief, ook zonder datum uit dienst', function (): void {
    $mark = stored(['id' => 'medewerker-mark', 'personnelNumber' => '5002', 'firstName' => 'Mark', 'lastName' => 'Jansen']);
    $repository = new InMemoryRepository([stored(), $mark]);
    $plan = (new EmployeeSync())->plan((new EmployeeMapper())->map([realRow()]), $repository->employees, $repository->companies, $repository->points, '2026-11-25', null);

    same([['id' => 'medewerker-mark', 'personnelNumber' => '5002', 'changes' => ['active' => false]]], $plan->updates);
});

test('Connector van TVB: het hele verloop sorteert op Medewerker en slaat het plan op', function (): void {
    $http = new FakeHttpClient([afasPage([realRow(), realRow(['Medewerker' => '5002', 'Roepnaam' => 'Mark', 'Achternaam' => 'Jansen', 'Voorvoegsel' => null])])]);
    $repository = new InMemoryRepository([]);
    $log = [];
    $runner = new SyncRunner(new AfasClient(fakeConfig(), $http), new EmployeeMapper(), new EmployeeSync(), $repository, static function (string $line) use (&$log): void {
        $log[] = $line;
    });

    $result = $runner->run(new DateTimeImmutable('2026-11-25T09:00:00+01:00'));

    ok($result->ok);
    ok(str_ends_with($http->requests[0]['url'], '&orderbyfieldids=Medewerker'));
    same(['5001', '5002'], array_column($repository->applied[0]->additions, 'personnelNumber'));
    foreach (['Lotte', 'Jansen', 'Voorbeeldstraat'] as $name) {
        ok(!str_contains(implode("\n", $log), $name), "het logboek bevat $name");
    }
});
