<?php

declare(strict_types=1);

// Tests voor EmployeeMapper: een rij uit AFAS wordt een medewerker, of wordt afgekeurd met een reden.

use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\EmployeeMapper;

test('EmployeeMapper: een rij wordt een medewerker, met het voorvoegsel bij de achternaam', function (): void {
    $mapped = (fullMapper())->map([afasRow()]);

    same([], $mapped->problems);
    $employee = $mapped->employees[0];
    same('5001', $employee->personnelNumber);
    same('Lotte', $employee->firstName);
    same('van Dijk', $employee->lastName);
    same('4711', $employee->employerNumber);
    same('Hoofdkantoor', $employee->workLocation);
    same('101', $employee->payrollCode);
    same(null, $employee->endDate);
});

test('EmployeeMapper: zonder voorvoegsel is de achternaam alleen de achternaam, en spaties eromheen vervallen', function (): void {
    $mapped = (fullMapper())->map([afasRow(['Voornaam' => '  Mark ', 'Achternaam' => ' Jansen ', 'Voorvoegsel' => null])]);

    same('Mark', $mapped->employees[0]->firstName);
    same('Jansen', $mapped->employees[0]->lastName);
});

test('EmployeeMapper: een nummer dat AFAS als getal geeft, wordt tekst', function (): void {
    $mapped = (fullMapper())->map([afasRow(['Personeelsnummer' => 5001, 'Werkgever' => 4711, 'Looncode' => 101])]);

    same('5001', $mapped->employees[0]->personnelNumber);
    same('4711', $mapped->employees[0]->employerNumber);
    same('101', $mapped->employees[0]->payrollCode);
});

test('EmployeeMapper: voorloopnullen in een nummer blijven staan', function (): void {
    same('0012', (fullMapper())->map([afasRow(['Personeelsnummer' => '0012'])])->employees[0]->personnelNumber);
});

test('EmployeeMapper: van de datum uit dienst telt alleen de dag', function (): void {
    $mapper = fullMapper();

    same('2026-10-31', $mapper->map([afasRow(['DatumUitDienst' => '2026-10-31T00:00:00Z'])])->employees[0]->endDate);
    same('2026-10-31', $mapper->map([afasRow(['DatumUitDienst' => '2026-10-31'])])->employees[0]->endDate);
    same(null, $mapper->map([afasRow(['DatumUitDienst' => ''])])->employees[0]->endDate);
});

test('EmployeeMapper: de laatste werkdag telt nog als in dienst, de dag erna niet meer', function (): void {
    $employee = (fullMapper())->map([afasRow(['DatumUitDienst' => '2026-10-31'])])->employees[0];

    ok($employee->isActiveOn('2026-10-30'));
    ok($employee->isActiveOn('2026-10-31'));
    ok(!$employee->isActiveOn('2026-11-01'));
});

test('EmployeeMapper: ontbreekt een verplicht veld, dan stopt alles met de naam van het veld', function (): void {
    foreach (['Personeelsnummer', 'Voornaam', 'Achternaam', 'Werkgever', 'Looncode'] as $field) {
        $row = afasRow();
        unset($row[$field]);

        $error = throws(AfasException::class, fn () => (fullMapper())->map([afasRow(), $row]));
        same(AfasException::FORMAT, $error->kind);
        ok(str_contains($error->getMessage(), $field) && str_contains($error->getMessage(), 'rij 2'), $error->getMessage());
        ok(!str_contains($error->getMessage(), 'Lotte'), 'de foutmelding bevat een naam');
    }
});

test('EmployeeMapper: voorvoegsel, werklocatie en datum uit dienst mogen ontbreken en zijn dan leeg', function (): void {
    $row = afasRow();
    unset($row['Voorvoegsel'], $row['Werklocatie'], $row['DatumUitDienst']);

    $employee = (fullMapper())->map([$row])->employees[0];
    same('Dijk', $employee->lastName);
    same('', $employee->workLocation);
    same(null, $employee->endDate);
});

test('EmployeeMapper: een rij met een ongeldige waarde wordt afgekeurd met een reden, de andere rijen gaan door', function (): void {
    $wrong = [
        'personeelsnummer met letters' => [['Personeelsnummer' => 'A12'], null],
        'leeg personeelsnummer' => [['Personeelsnummer' => ''], null],
        'lege voornaam' => [['Voornaam' => ''], '5001'],
        'voornaam met een enter' => [['Voornaam' => "Lotte\nvan"], '5001'],
        'te lange voornaam' => [['Voornaam' => str_repeat('a', 101)], '5001'],
        'lege achternaam' => [['Achternaam' => null], '5001'],
        'voorvoegsel als lijst' => [['Voorvoegsel' => ['van']], '5001'],
        'werkgever met letters' => [['Werkgever' => 'TVB'], '5001'],
        'lege looncode' => [['Looncode' => null], '5001'],
        'looncode als kommagetal' => [['Looncode' => 10.5], '5001'],
        'werklocatie met een tab' => [['Werklocatie' => "Hoofd\tkantoor"], '5001'],
        'datum die niet bestaat' => [['DatumUitDienst' => '2026-02-31'], '5001'],
        'datum in een andere vorm' => [['DatumUitDienst' => '31-10-2026'], '5001'],
    ];
    foreach ($wrong as $name => [$changes, $expectedNumber]) {
        $mapped = (fullMapper())->map([afasRow($changes), afasRow(['Personeelsnummer' => '5002', 'Voornaam' => 'Mark', 'Achternaam' => 'Jansen', 'Voorvoegsel' => null])]);

        same(1, count($mapped->problems), $name);
        same(1, $mapped->problems[0]['row'], $name);
        same($expectedNumber, $mapped->problems[0]['personnelNumber'], $name);
        ok($mapped->problems[0]['reason'] !== '', $name);
        ok(!str_contains($mapped->problems[0]['reason'], 'Lotte'), "$name: de reden bevat een naam");
        same(['5002'], array_map(static fn ($employee): string => $employee->personnelNumber, $mapped->employees), $name);
        same(2, $mapped->receivedCount(), $name);
    }
});

test('EmployeeMapper: de personeelsnummers van afgekeurde rijen zijn op te vragen', function (): void {
    $mapped = (fullMapper())->map([afasRow(['Looncode' => null]), afasRow(['Personeelsnummer' => 'x']), afasRow(['Personeelsnummer' => '5003', 'Voornaam' => ''])]);

    same(['5001', '5003'], $mapped->invalidNumbers());
});

test('EmployeeMapper: extra velden in een rij worden genegeerd', function (): void {
    $employee = (fullMapper())->map([afasRow(['Geboortedatum' => '1990-01-01', 'BSN' => '000000000'])])->employees[0];

    same(['personnelNumber', 'firstName', 'lastName', 'employerNumber', 'workLocation', 'payrollCode', 'endDate'], array_keys(get_object_vars($employee)));
});

test('EmployeeMapper: de namen van de velden in de GetConnector zijn in te stellen', function (): void {
    $mapper = new EmployeeMapper(['personnelNumber' => 'Medewerker', 'firstName' => 'Voornaam', 'endDate' => 'DatumUit']);
    $row = afasRow(['Medewerker' => '7001', 'DatumUit' => '2026-12-31']);
    unset($row['Personeelsnummer'], $row['DatumUitDienst']);

    same('Medewerker', $mapper->sortField());
    $employee = $mapper->map([$row])->employees[0];
    same('7001', $employee->personnelNumber);
    same('2026-12-31', $employee->endDate);

    throws(AfasException::class, fn () => new EmployeeMapper(['onbekend' => 'X']));
    throws(AfasException::class, fn () => new EmployeeMapper(['endDate' => 'Datum&take=1']));
});
