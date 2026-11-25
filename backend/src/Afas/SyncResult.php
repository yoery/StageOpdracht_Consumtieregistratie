<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * SyncResult — de uitkomst van één synchronisatie: gelukt of niet, een melding en (als het gelukt
 * is) het plan dat is opgeslagen.
 */
final class SyncResult
{
    public function __construct(public readonly bool $ok, public readonly string $message, public readonly ?SyncPlan $plan = null)
    {
    }
}
