<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * AfasEmployee — één medewerker zoals die uit AFAS komt, al gecontroleerd en in de vorm van de app.
 *
 * Het voorvoegsel staat bij de achternaam ("van Dijk"), net als in de app. De datum uit dienst is
 * een datum als "2026-10-31", of null als de medewerker in dienst is. De looncode is null als de
 * GetConnector geen looncode geeft: dan blijft de looncode in de app zoals hij is.
 */
final class AfasEmployee
{
    public function __construct(
        public readonly string $personnelNumber,
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly string $employerNumber,
        public readonly string $workLocation,
        public readonly ?string $payrollCode,
        public readonly ?string $endDate
    ) {
    }

    /**
     * Is de medewerker op deze dag (zoals "2026-11-25") in dienst? De laatste werkdag telt nog mee:
     * pas de dag na de datum uit dienst is de medewerker uit dienst.
     */
    public function isActiveOn(string $today): bool
    {
        return $this->endDate === null || $this->endDate >= $today;
    }
}
