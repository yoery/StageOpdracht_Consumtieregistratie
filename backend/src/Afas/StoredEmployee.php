<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * StoredEmployee — een medewerker zoals die nu in de app staat (tabel `employees`).
 *
 * Alleen de gegevens die de synchronisatie vergelijkt of wijzigt. Het pasnummer en de kleur staan er
 * niet in: die blijven in de app en komen niet uit AFAS.
 */
final class StoredEmployee
{
    public function __construct(
        public readonly string $id,
        public readonly string $personnelNumber,
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly string $payrollCode,
        public readonly ?string $companyId,
        public readonly ?string $pointId,
        public readonly bool $active
    ) {
    }
}
