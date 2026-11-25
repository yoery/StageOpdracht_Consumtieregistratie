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
