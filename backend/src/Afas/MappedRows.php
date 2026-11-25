<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * MappedRows — de uitkomst van EmployeeMapper: de geldige medewerkers en de rijen die zijn afgekeurd.
 *
 * Een afgekeurde rij heeft het rijnummer in het antwoord van AFAS, het personeelsnummer (als dat
 * wel geldig was) en de reden. Namen staan er bewust niet in, zodat de lijst in een logboek kan.
 */
final class MappedRows
{
    /**
     * @param list<AfasEmployee> $employees
     * @param list<array{row: int, personnelNumber: string|null, reason: string}> $problems
     */
    public function __construct(public readonly array $employees, public readonly array $problems)
    {
    }

    /** Het aantal rijen dat AFAS heeft gegeven, geldig of niet. */
    public function receivedCount(): int
    {
        return count($this->employees) + count($this->problems);
    }

    /**
     * De personeelsnummers van afgekeurde rijen. Die medewerkers staan wel in AFAS, dus de
     * synchronisatie laat ze met rust en zet ze niet op inactief.
     *
     * @return list<string>
     */
    public function invalidNumbers(): array
    {
        $numbers = [];
        foreach ($this->problems as $problem) {
            if ($problem['personnelNumber'] !== null) {
                $numbers[] = $problem['personnelNumber'];
            }
        }

        return array_values(array_unique($numbers));
    }
}
