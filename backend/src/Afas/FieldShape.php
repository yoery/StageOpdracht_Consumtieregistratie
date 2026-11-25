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
 *
 * Komt een personeelsnummer meer dan één keer voor, dan laat `duplicates` zien in welke velden die
 * rijen verschillen, en `singleNoInDuplicates` en `singleLatestInDuplicates` of een veld de goede rij
 * kan aanwijzen. Ook dat zijn alleen aantallen.
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

    /**
     * Rijen met hetzelfde sleutelveld (het personeelsnummer): hoeveel sleutels komen meer dan één keer
     * voor, en in welke velden verschillen die rijen van elkaar? Alleen aantallen, geen waarden.
     *
     * - keys: het aantal sleutels dat meer dan één keer voorkomt;
     * - rows: het aantal rijen van die sleutels samen;
     * - largest: het grootste aantal rijen bij één sleutel;
     * - identical: het aantal sleutels waarvan alle rijen precies gelijk zijn;
     * - differing: per veld het aantal sleutels waarbij de rijen een andere waarde hebben.
     *
     * @param list<array<string, mixed>> $rows
     * @return array{keys: int, rows: int, largest: int, identical: int, differing: array<string, int>}
     */
    public static function duplicates(array $rows, string $keyField): array
    {
        $result = ['keys' => 0, 'rows' => 0, 'largest' => 0, 'identical' => 0, 'differing' => []];
        foreach (self::duplicateGroups($rows, $keyField) as $group) {
            $result['keys']++;
            $result['rows'] += count($group);
            $result['largest'] = max($result['largest'], count($group));

            $fields = [];
            foreach ($group as $row) {
                $fields += array_fill_keys(array_keys($row), true);
            }
            $same = true;
            foreach (array_keys($fields) as $field) {
                $values = [];
                foreach ($group as $row) {
                    $values[self::comparable($row[$field] ?? null)] = true;
                }
                if (count($values) > 1) {
                    $same = false;
                    $result['differing'][(string) $field] = ($result['differing'][(string) $field] ?? 0) + 1;
                }
            }
            if ($same) {
                $result['identical']++;
            }
        }
        arsort($result['differing']);

        return $result;
    }

    /**
     * Kan een veld met ja of nee (zoals Geblokkeerd) bij een dubbele sleutel de goede rij aanwijzen?
     * Telt bij hoeveel dubbele sleutels precies één rij "nee" heeft, bij hoeveel meer dan één en bij
     * hoeveel geen enkele.
     *
     * @param list<array<string, mixed>> $rows
     * @return array{one: int, several: int, none: int}
     */
    public static function singleNoInDuplicates(array $rows, string $keyField, string $field): array
    {
        $result = ['one' => 0, 'several' => 0, 'none' => 0];
        foreach (self::duplicateGroups($rows, $keyField) as $group) {
            $no = count(array_filter($group, static fn (array $row): bool => !self::isYes($row[$field] ?? null)));
            $result[$no === 1 ? 'one' : ($no === 0 ? 'none' : 'several')]++;
        }

        return $result;
    }

    /**
     * Kan een datumveld (zoals Datum_in_dienst) bij een dubbele sleutel de goede rij aanwijzen? Telt
     * bij hoeveel dubbele sleutels precies één rij de laatste datum heeft, bij hoeveel meer rijen die
     * datum delen en bij hoeveel het veld overal leeg is.
     *
     * @param list<array<string, mixed>> $rows
     * @return array{one: int, shared: int, empty: int}
     */
    public static function singleLatestInDuplicates(array $rows, string $keyField, string $field): array
    {
        $result = ['one' => 0, 'shared' => 0, 'empty' => 0];
        foreach (self::duplicateGroups($rows, $keyField) as $group) {
            $values = array_map(static fn (array $row): string => self::text($row[$field] ?? null), $group);
            $latest = max($values);
            if ($latest === '') {
                $result['empty']++;
                continue;
            }
            $result[count(array_keys($values, $latest, true)) === 1 ? 'one' : 'shared']++;
        }

        return $result;
    }

    /**
     * De rijen per sleutel, alleen voor sleutels die meer dan één keer voorkomen. Een rij zonder
     * sleutel doet niet mee.
     *
     * @param list<array<string, mixed>> $rows
     * @return list<list<array<string, mixed>>>
     */
    private static function duplicateGroups(array $rows, string $keyField): array
    {
        $groups = [];
        foreach ($rows as $row) {
            $key = self::text($row[$keyField] ?? null);
            if ($key !== '') {
                $groups[$key][] = $row;
            }
        }

        return array_values(array_filter($groups, static fn (array $group): bool => count($group) > 1));
    }

    // Een waarde in een vorm die te vergelijken is. Tekst telt zonder spaties eromheen, en het getal
    // 12 is gelijk aan de tekst "12".
    private static function comparable(mixed $value): string
    {
        if (is_string($value) || is_int($value) || is_float($value)) {
            return 't:' . self::text($value);
        }

        return 'j:' . (json_encode($value, JSON_PARTIAL_OUTPUT_ON_ERROR) ?: '');
    }

    // Is dit "ja"? AFAS geeft een ja/nee-veld als true of false. Voor de zekerheid tellen ook 1 en
    // de teksten "true", "ja" en "j" als ja. Al het andere (ook leeg) is nee.
    private static function isYes(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return in_array(strtolower(self::text($value)), ['1', 'true', 'ja', 'j'], true);
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
