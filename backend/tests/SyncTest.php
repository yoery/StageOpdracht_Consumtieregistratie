<?php

declare(strict_types=1);

// Tests voor EmployeeSync: wat verandert een synchronisatie, en wanneer stopt ze zonder iets te
// wijzigen (stap 3 tot en met 7 uit het TO, paragraaf Koppeling met AFAS Profit).

use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\EmployeeMapper;
use Tvb\Consumptie\Afas\EmployeeSync;
use Tvb\Consumptie\Afas\SyncPlan;

const TODAY = '2026-11-25';

/**
 * Maakt het plan voor deze rijen uit AFAS en deze medewerkers in de app, met de bedrijven en
 * consumptiepunten van InMemoryRepository.
 */
function planFor(array $rows, array $current = [], ?int $previousCount = null): SyncPlan
{
    $repository = new InMemoryRepository($current);

    return (new EmployeeSync())->plan((fullMapper())->map($rows), $current, $repository->companies, $repository->points, TODAY, $previousCount);
}

test('EmployeeSync: een nieuw personeelsnummer wordt een actieve medewerker met bedrijf en consumptiepunt van de werklocatie', function (): void {
    $plan = planFor([afasRow()]);

    same([[
        'personnelNumber' => '5001',
        'firstName' => 'Lotte',
        'lastName' => 'van Dijk',
        'payrollCode' => '101',
        'unit' => 'Hoofdkantoor',
        'companyId' => 'bedrijf-tvb',
        'pointId' => 'punt-hoofdkantoor',
        'active' => true,
    ]], $plan->additions);
    same([], $plan->updates);
});

test('EmployeeSync: de werklocatie wordt zonder hoofdletters vergeleken en alleen binnen het eigen bedrijf', function (): void {
    same('punt-hoofdkantoor', planFor([afasRow(['Werklocatie' => ' HOOFDKANTOOR '])])->additions[0]['pointId']);
    // Kantine IT hoort bij een ander bedrijf dan werkgever 4711.
    same(null, planFor([afasRow(['Werklocatie' => 'Kantine IT'])])->additions[0]['pointId']);
    same(null, planFor([afasRow(['Werklocatie' => 'Bestaat niet'])])->additions[0]['pointId']);
    same(null, planFor([afasRow(['Werklocatie' => null])])->additions[0]['pointId']);
});

test('EmployeeSync: een onbekende werkgever wordt niet gekoppeld en komt in de opmerkingen', function (): void {
    $plan = planFor([afasRow(['Werkgever' => '9999'])]);

    same(null, $plan->additions[0]['companyId']);
    same(null, $plan->additions[0]['pointId']);
    ok(str_contains(implode("\n", $plan->notes), 'werkgever 9999 is niet bekend'));
});

test('EmployeeSync: wie al uit dienst is en nog niet in de app staat, wordt niet toegevoegd', function (): void {
    $plan = planFor([afasRow(['DatumUitDienst' => '2026-10-31']), afasRow(['Personeelsnummer' => '5002'])]);

    same(['5002'], array_column($plan->additions, 'personnelNumber'));
    ok(str_contains(implode("\n", $plan->notes), '5001 is al uit dienst'));
});

test('EmployeeSync: is er niets veranderd, dan is het plan leeg', function (): void {
    $plan = planFor([afasRow()], [stored()]);

    ok($plan->isEmpty());
    same([], $plan->notes);
});

test('EmployeeSync: een andere naam of looncode wordt bijgewerkt', function (): void {
    $plan = planFor([afasRow(['Voornaam' => 'Charlotte', 'Voorvoegsel' => 'van den', 'Achternaam' => 'Berg', 'Looncode' => '102'])], [stored()]);

    same([], $plan->additions);
    same([['id' => 'medewerker-lotte', 'personnelNumber' => '5001', 'changes' => ['firstName' => 'Charlotte', 'lastName' => 'van den Berg', 'payrollCode' => '102']]], $plan->updates);
});

// Sinds 26 november 2026 (FR-102) is de werklocatie de afdeling uit AFAS. Een andere afdeling wordt
// bijgewerkt, maar het consumptiepunt dat de beheerder koos, blijft. Wie nog geen punt heeft, krijgt
// het punt van zijn afdeling.
test('EmployeeSync: het consumptiepunt van een bestaande medewerker blijft, ook als de afdeling anders is', function (): void {
    $plan = planFor([afasRow(['Werklocatie' => 'Ergens anders'])], [stored(['pointId' => 'punt-hoofdkantoor'])]);

    same([['id' => 'medewerker-lotte', 'personnelNumber' => '5001', 'changes' => ['unit' => 'Ergens anders']]], $plan->updates, 'de afdeling wordt bijgewerkt');

    $withoutPoint = planFor([afasRow()], [stored(['pointId' => null])]);
    same([['id' => 'medewerker-lotte', 'personnelNumber' => '5001', 'changes' => ['pointId' => 'punt-hoofdkantoor']]], $withoutPoint->updates, 'zonder punt: het punt van de afdeling');

    $unknownUnit = planFor([afasRow(['Werklocatie' => 'Onbekende afdeling'])], [stored(['pointId' => null, 'unit' => 'Onbekende afdeling'])]);
    ok($unknownUnit->isEmpty(), 'een afdeling zonder punt geeft geen punt');
});

test('EmployeeSync: een afdeling die de beheerder aan een punt koppelde, geeft dat punt, ook met een andere naam (FR-102)', function (): void {
    $points = [
        ['id' => 'punt-hoofdkantoor', 'companyId' => 'bedrijf-tvb', 'name' => 'Hoofdkantoor', 'units' => ['Installatie Utrecht', 'Service']],
        ['id' => 'punt-kantine-it', 'companyId' => 'bedrijf-it', 'name' => 'Kantine IT', 'units' => ['Installatie Utrecht']],
    ];
    $plan = (new EmployeeSync())->plan(
        fullMapper()->map([afasRow(['Werklocatie' => 'installatie utrecht']), afasRow(['Personeelsnummer' => '5003', 'Voornaam' => 'Tom', 'Werklocatie' => 'Service'])]),
        [],
        ['4711' => 'bedrijf-tvb', '4712' => 'bedrijf-it'],
        $points,
        '2026-11-26',
        null
    );

    // Het punt van het eigen bedrijf (4711 = TVB), niet dat van IT Supervision met dezelfde afdeling.
    same(['punt-hoofdkantoor', 'punt-hoofdkantoor'], array_column($plan->additions, 'pointId'));
    same(['installatie utrecht', 'Service'], array_column($plan->additions, 'unit'));
});

test('EmployeeSync: bij een ander bedrijf volgt het consumptiepunt van de werklocatie, of geen punt', function (): void {
    $moved = planFor([afasRow(['Werkgever' => '4712', 'Werklocatie' => 'Kantine IT'])], [stored()]);
    same(['unit' => 'Kantine IT', 'companyId' => 'bedrijf-it', 'pointId' => 'punt-kantine-it'], $moved->updates[0]['changes']);

    $unknownPlace = planFor([afasRow(['Werkgever' => '4712', 'Werklocatie' => 'Hoofdkantoor'])], [stored()]);
    same(['companyId' => 'bedrijf-it', 'pointId' => null], $unknownPlace->updates[0]['changes']);
});

test('EmployeeSync: een onbekende werkgever verandert het bedrijf van een bestaande medewerker niet', function (): void {
    $plan = planFor([afasRow(['Werkgever' => '9999'])], [stored()]);

    ok($plan->isEmpty());
    ok(str_contains(implode("\n", $plan->notes), 'werkgever 9999 is niet bekend'));
});

test('EmployeeSync: een datum uit dienst die voorbij is, maakt de medewerker inactief en verwijdert hem niet', function (): void {
    $plan = planFor([afasRow(['DatumUitDienst' => '2026-11-24'])], [stored()]);

    same([['id' => 'medewerker-lotte', 'personnelNumber' => '5001', 'changes' => ['active' => false]]], $plan->updates);
    same(1, $plan->deactivationCount());
});

test('EmployeeSync: een datum uit dienst van vandaag of in de toekomst laat de medewerker actief', function (): void {
    ok(planFor([afasRow(['DatumUitDienst' => TODAY])], [stored()])->isEmpty());
    ok(planFor([afasRow(['DatumUitDienst' => '2027-01-31'])], [stored()])->isEmpty());
});

test('EmployeeSync: wie weer in dienst komt, wordt weer actief', function (): void {
    $plan = planFor([afasRow()], [stored(['active' => false])]);

    same(['active' => true], $plan->updates[0]['changes']);
    same(1, $plan->reactivationCount());
});

test('EmployeeSync: wie niet meer in AFAS staat, wordt inactief en nooit verwijderd', function (): void {
    $mark = stored(['id' => 'medewerker-mark', 'personnelNumber' => '5002', 'firstName' => 'Mark', 'lastName' => 'Jansen']);
    $plan = planFor([afasRow()], [stored(), $mark]);

    same([['id' => 'medewerker-mark', 'personnelNumber' => '5002', 'changes' => ['active' => false]]], $plan->updates);
    ok(str_contains(implode("\n", $plan->notes), '5002 staat niet meer in AFAS'));
    ok(!str_contains(implode("\n", $plan->notes), 'Jansen'), 'de opmerkingen bevatten een naam');
});

test('EmployeeSync: wie al inactief is en niet in AFAS staat, blijft zoals hij is', function (): void {
    $mark = stored(['id' => 'medewerker-mark', 'personnelNumber' => '5002', 'active' => false]);

    ok(planFor([afasRow()], [stored(), $mark])->isEmpty());
});

test('EmployeeSync: een medewerker van een afgekeurde rij blijft onaangeroerd en wordt niet inactief', function (): void {
    $mark = stored(['id' => 'medewerker-mark', 'personnelNumber' => '5002', 'firstName' => 'Mark', 'lastName' => 'Jansen']);
    $plan = planFor([afasRow(), afasRow(['Personeelsnummer' => '5002', 'Voornaam' => 'Marcus', 'Looncode' => null])], [stored(), $mark]);

    ok($plan->isEmpty(), 'de afgekeurde rij wijzigt niets');
    same(1, $plan->rejectedRows);
    ok(str_contains(implode("\n", $plan->notes), 'Rij 2 afgekeurd'));
});

test('EmployeeSync: een medewerker zonder personeelsnummer in de app blijft onaangeroerd', function (): void {
    $old = stored(['id' => 'medewerker-oud', 'personnelNumber' => '']);

    ok(planFor([afasRow()], [stored(), $old])->isEmpty());
});

test('EmployeeSync: een lege lijst stopt de synchronisatie, zodat niemand inactief wordt', function (): void {
    $error = throws(AfasException::class, fn () => planFor([], [stored()]));

    same(AfasException::CHECK, $error->kind);
    ok(str_contains($error->getMessage(), 'lege lijst'));
});

test('EmployeeSync: is geen enkele rij geldig, dan stopt de synchronisatie', function (): void {
    $error = throws(AfasException::class, fn () => planFor([afasRow(['Looncode' => null]), afasRow(['Personeelsnummer' => 'x'])], [stored()]));

    same(AfasException::CHECK, $error->kind);
});

test('EmployeeSync: een lijst die veel korter is dan de vorige keer, stopt de synchronisatie', function (): void {
    $rows = [afasRow(), afasRow(['Personeelsnummer' => '5002'])];

    same(AfasException::CHECK, throws(AfasException::class, fn () => planFor($rows, [stored()], 5))->kind);
    // Precies de helft mag nog, en zonder vorige keer is er geen grens.
    same(1, count(planFor($rows, [stored()], 4)->additions));
    same(1, count(planFor($rows, [stored()], null)->additions));
});

test('EmployeeSync: de grens voor een te korte lijst is in te stellen', function (): void {
    $mapped = (fullMapper())->map([afasRow()]);

    throws(AfasException::class, fn () => (new EmployeeSync(0.9))->plan($mapped, [], [], [], TODAY, 2));
    same(1, count((new EmployeeSync(0.5))->plan($mapped, [], [], [], TODAY, 2)->additions));
});

test('EmployeeSync: hetzelfde personeelsnummer twee keer met dezelfde gegevens telt één keer', function (): void {
    same(1, count(planFor([afasRow(), afasRow()])->additions));
});

test('EmployeeSync: hetzelfde personeelsnummer met verschillende gegevens stopt de synchronisatie', function (): void {
    $error = throws(AfasException::class, fn () => planFor([afasRow(), afasRow(['Looncode' => '999'])], [stored()]));

    same(AfasException::CHECK, $error->kind);
    ok(str_contains($error->getMessage(), '5001'));
});

test('EmployeeSync: de samenvatting bevat alleen aantallen', function (): void {
    $mark = stored(['id' => 'medewerker-mark', 'personnelNumber' => '5002', 'firstName' => 'Mark', 'lastName' => 'Jansen']);
    $plan = planFor([afasRow(['Looncode' => '102']), afasRow(['Personeelsnummer' => '5003', 'Voornaam' => 'Sophie', 'Voorvoegsel' => 'de', 'Achternaam' => 'Boer'])], [stored(), $mark]);

    same('2 rijen uit AFAS, 1 toegevoegd, 2 gewijzigd (waarvan 1 inactief en 0 weer actief), 0 rijen afgekeurd', $plan->summary());
});
