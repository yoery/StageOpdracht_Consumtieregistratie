<?php

declare(strict_types=1);

// Tests voor FieldShape: de vorm van de waarden in een veld beschrijven zonder de waarden te tonen.
// De proefdraai gebruikt dit om te laten zien waarom rijen worden afgekeurd. De rijen zijn nepgegevens.

use Tvb\Consumptie\Afas\FieldShape;

test('FieldShape: telt lege waarden, waarden met alleen cijfers, andere waarden en ontbrekende velden', function (): void {
    $rows = [
        ['Werkgever' => '4711'],
        ['Werkgever' => 4711],
        ['Werkgever' => ' 4712 '],
        ['Werkgever' => 'TVB Beheer'],
        ['Werkgever' => '01-A'],
        ['Werkgever' => ''],
        ['Werkgever' => null],
        ['Werkgever' => ['geen', 'tekst']],
        ['Iets_anders' => 'x'],
    ];

    same(
        ['rows' => 9, 'missing' => 1, 'empty' => 3, 'digits' => 3, 'other' => 2, 'distinct' => 4, 'longest' => 10],
        FieldShape::summarize($rows, 'Werkgever')
    );
});

test('FieldShape: een leeg antwoord geeft alleen nullen', function (): void {
    same(['rows' => 0, 'missing' => 0, 'empty' => 0, 'digits' => 0, 'other' => 0, 'distinct' => 0, 'longest' => 0], FieldShape::summarize([], 'Werkgever'));
});

test('FieldShape: de verschillende waarden met hun aantal, de meest voorkomende eerst', function (): void {
    $rows = [
        ['Werkgever' => 'TVB Beheer'],
        ['Werkgever' => 'IT Supervision'],
        ['Werkgever' => 'TVB Beheer'],
        ['Werkgever' => ''],
        ['Werkgever' => ' TVB Beheer '],
        [],
    ];

    same(['TVB Beheer' => 3, '(leeg)' => 2, 'IT Supervision' => 1], FieldShape::distinctValues($rows, 'Werkgever'));
    same(['TVB Beheer' => 3], FieldShape::distinctValues($rows, 'Werkgever', 1));
});

test('FieldShape: de samenvatting bevat geen enkele waarde uit de rijen', function (): void {
    $rows = [realRow(), realRow(['Medewerker' => '5002', 'Roepnaam' => 'Mark', 'Achternaam' => 'Jansen'])];

    foreach (['Roepnaam', 'Achternaam', 'Medewerker'] as $field) {
        $text = json_encode(FieldShape::summarize($rows, $field), JSON_THROW_ON_ERROR);
        foreach (['Lotte', 'Mark', 'Dijk', 'Jansen', '5001', '5002'] as $value) {
            ok(!str_contains($text, $value), "de samenvatting van $field bevat $value");
        }
    }
});

// ------------------------------------------------------------------
// Personeelsnummers die meer dan één keer voorkomen
// ------------------------------------------------------------------

/**
 * Nepgegevens: 5001 staat twee keer met een ander bedrijf, 5002 twee keer precies gelijk, 5003 drie
 * keer met een andere datum in dienst, en 5004 één keer.
 *
 * @return list<array<string, mixed>>
 */
function duplicateRows(): array
{
    return [
        realRow(['Werkgever_2' => '01', 'Geblokkeerd' => true, 'Datum_in_dienst' => '2020-01-01T00:00:00Z']),
        realRow(['Werkgever_2' => '02', 'Geblokkeerd' => false, 'Datum_in_dienst' => '2024-06-01T00:00:00Z']),
        realRow(['Medewerker' => '5002', 'Roepnaam' => 'Mark']),
        realRow(['Medewerker' => 5002, 'Roepnaam' => ' Mark ']),
        realRow(['Medewerker' => '5003', 'Geblokkeerd' => false, 'Datum_in_dienst' => '2019-01-01T00:00:00Z']),
        realRow(['Medewerker' => '5003', 'Geblokkeerd' => false, 'Datum_in_dienst' => '2025-01-01T00:00:00Z']),
        realRow(['Medewerker' => '5003', 'Geblokkeerd' => true, 'Datum_in_dienst' => '2025-01-01T00:00:00Z']),
        realRow(['Medewerker' => '5004']),
        ['Roepnaam' => 'Zonder nummer'],
        ['Medewerker' => '', 'Roepnaam' => 'Leeg nummer'],
    ];
}

test('FieldShape: telt de personeelsnummers die meer dan één keer voorkomen en de velden die dan verschillen', function (): void {
    same(
        [
            'keys' => 3,
            'rows' => 7,
            'largest' => 3,
            'identical' => 1,
            'differing' => ['Geblokkeerd' => 2, 'Datum_in_dienst' => 2, 'Werkgever_2' => 1],
        ],
        FieldShape::duplicates(duplicateRows(), 'Medewerker')
    );
});

test('FieldShape: zonder dubbele personeelsnummers is alles nul', function (): void {
    $empty = ['keys' => 0, 'rows' => 0, 'largest' => 0, 'identical' => 0, 'differing' => []];

    same($empty, FieldShape::duplicates([realRow(), realRow(['Medewerker' => '5002'])], 'Medewerker'));
    same($empty, FieldShape::duplicates([], 'Medewerker'));
    same($empty, FieldShape::duplicates([['Roepnaam' => 'a'], ['Roepnaam' => 'b']], 'Medewerker'));
});

test('FieldShape: wijst Geblokkeerd bij een dubbel nummer precies één rij aan?', function (): void {
    // 5001: één rij niet geblokkeerd. 5002: het veld is bij beide rijen nee. 5003: twee rijen niet geblokkeerd.
    same(['one' => 1, 'several' => 2, 'none' => 0], FieldShape::singleNoInDuplicates(duplicateRows(), 'Medewerker', 'Geblokkeerd'));

    $allBlocked = [realRow(['Geblokkeerd' => true]), realRow(['Geblokkeerd' => 'true']), realRow(['Geblokkeerd' => 1])];
    same(['one' => 0, 'several' => 0, 'none' => 1], FieldShape::singleNoInDuplicates($allBlocked, 'Medewerker', 'Geblokkeerd'));
});

test('FieldShape: wijst de laatste datum in dienst bij een dubbel nummer precies één rij aan?', function (): void {
    // 5001: één rij met de laatste datum. 5002: het veld ontbreekt. 5003: twee rijen delen de laatste datum.
    same(['one' => 1, 'shared' => 1, 'empty' => 1], FieldShape::singleLatestInDuplicates(duplicateRows(), 'Medewerker', 'Datum_in_dienst'));
});

test('FieldShape: de telling van dubbele nummers bevat geen enkele waarde uit de rijen', function (): void {
    $rows = duplicateRows();
    $text = json_encode([
        FieldShape::duplicates($rows, 'Medewerker'),
        FieldShape::singleNoInDuplicates($rows, 'Medewerker', 'Geblokkeerd'),
        FieldShape::singleLatestInDuplicates($rows, 'Medewerker', 'Datum_in_dienst'),
    ], JSON_THROW_ON_ERROR);

    foreach (['Lotte', 'Mark', 'Dijk', '5001', '5002', '5003', '2020', '2024', '2025', 'Voorbeeld'] as $value) {
        ok(!str_contains($text, $value), "de telling bevat $value");
    }
});
