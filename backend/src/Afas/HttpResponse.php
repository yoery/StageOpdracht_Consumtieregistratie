<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * HttpResponse — het antwoord op een verzoek: de statuscode (zoals 200 of 401) en de inhoud.
 */
final class HttpResponse
{
    public function __construct(public readonly int $status, public readonly string $body)
    {
    }
}
