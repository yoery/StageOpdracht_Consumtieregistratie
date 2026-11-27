<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * SyncPlan — wat één synchronisatie gaat veranderen: wie erbij komt en wat er bij wie wijzigt.
 *
 * Het plan verwijdert nooit een medewerker. Wie uit dienst is of niet meer in AFAS staat, wordt
 * inactief (een wijziging met `active` op false), omdat de oude registraties nodig blijven voor de
 * loonadministratie. De opmerkingen (`notes`) noemen alleen personeelsnummers en geen namen, zodat ze
 * in het logboek van de server kunnen.
 */
final class SyncPlan
{
    /**
     * @param list<array{personnelNumber: string, firstName: string, lastName: string, payrollCode: string, unit?: string, companyId: string|null, pointId: string|null, active: bool}> $additions
     * @param list<array{id: string, personnelNumber: string, changes: array<string, mixed>}> $updates
     * @param list<string> $notes
     */
    public function __construct(
        public readonly array $additions,
        public readonly array $updates,
        public readonly array $notes,
        public readonly int $receivedCount,
        public readonly int $rejectedRows,
        // Bedrijven die de synchronisatie aanmaakt voor werkgevers die de app nog niet kent:
        // [{ id, employerNumber, name }].
        public readonly array $companies = []
    ) {
    }

    /** Verandert dit plan iets aan de gegevens? */
    public function isEmpty(): bool
    {
        return $this->additions === [] && $this->updates === [] && $this->companies === [];
    }

    /** Hoeveel medewerkers worden inactief? */
    public function deactivationCount(): int
    {
        return count(array_filter($this->updates, static fn (array $update): bool => ($update['changes']['active'] ?? null) === false));
    }

    /** Hoeveel medewerkers worden weer actief? */
    public function reactivationCount(): int
    {
        return count(array_filter($this->updates, static fn (array $update): bool => ($update['changes']['active'] ?? null) === true));
    }

    /** Eén regel voor het logboek, alleen met aantallen. */
    public function summary(): string
    {
        return sprintf(
            '%d rijen uit AFAS, %d toegevoegd, %d gewijzigd (waarvan %d inactief en %d weer actief), %d rijen afgekeurd',
            $this->receivedCount,
            count($this->additions),
            count($this->updates),
            $this->deactivationCount(),
            $this->reactivationCount(),
            $this->rejectedRows
        ) . ($this->companies === [] ? '' : sprintf(', %d bedrijven aangemaakt', count($this->companies)));
    }
}
