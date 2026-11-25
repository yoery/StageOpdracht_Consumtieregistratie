<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * FieldShape — beschrijft de vorm van de waarden in één veld van de rijen uit AFAS, zonder de
 * waarden zelf te tonen: hoeveel zijn er leeg, hoeveel bestaan alleen uit cijfers, hoeveel bevatten
 * iets anders en hoeveel verschillende waarden zijn er.
 *
 * Bedoeld voor de proefdraai. Zo is te zien waarom rijen worden afgekeurd (bijvoorbeeld omdat de
 * werkgever een naam is en geen nummer) zonder dat er gegevens van medewerkers in beeld komen.
 * Alleen voor velden over het bedrijf, zoals de werkgever, kunnen de waarden zelf worden opgevraagd
 * (`distinctValues`): dat zijn geen gegevens van een persoon.
 */
final class FieldShape
{
    /**
     * Telt de vorm van de waarden in een veld.
     *
     * @param list<array<string, mixed>> $rows
     * @return array{rows: int, missing: int, empty: int, digits: int, other: int, distinct: int, longest: int}
     */
    public static function summarize(array $rows, string $field): array
    {
        $summary = ['rows' => count($rows), 'missing' => 0, 'empty' => 0, 'digits' => 0, 'other' => 0, 'distinct' => 0, 'longest' => 0];
        $seen = [];
        foreach ($rows as $row) {
            if (!array_key_exists($field, $row)) {
                $summary['missing']++;
                continue;
            }
            $text = self::text($row[$field]);
            if ($text === '') {
                $summary['empty']++;
                continue;
            }
            $summary[preg_match('/^[0-9]+$/', $text) === 1 ? 'digits' : 'other']++;
            $summary['longest'] = max($summary['longest'], strlen($text));
            $seen[$text] = true;
        }
        $summary['distinct'] = count($seen);

        return $summary;
    }

    /**
     * De verschillende waarden in een veld, met hoe vaak ze voorkomen, de meest voorkomende eerst.
     * Alleen gebruiken voor een veld over het bedrijf, nooit voor een veld over een persoon.
     *
     * @param list<array<string, mixed>> $rows
     * @return array<string, int>
     */
    public static function distinctValues(array $rows, string $field, int $limit = 50): array
    {
        $counts = [];
        foreach ($rows as $row) {
            $text = self::text($row[$field] ?? null);
            $key = $text === '' ? '(leeg)' : $text;
            $counts[$key] = ($counts[$key] ?? 0) + 1;
        }
        arsort($counts);

        return array_slice($counts, 0, max(1, $limit), true);
    }

    // De waarde als tekst zonder spaties eromheen. Leeg, of iets anders dan tekst of een getal, is "".
    private static function text(mixed $value): string
    {
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        return is_string($value) ? trim($value) : '';
    }
}
