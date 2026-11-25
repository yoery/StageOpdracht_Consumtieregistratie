<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * AfasException — een fout in de koppeling met AFAS.
 *
 * Iedere fout heeft een soort (`kind`), zodat de aanroeper kan zien wat er mis is zonder de tekst te
 * lezen. De tekst van een fout bevat nooit het token, geen antwoord van AFAS en geen namen van
 * medewerkers. Zo kan een fout veilig in het logboek van de server.
 */
final class AfasException extends \RuntimeException
{
    public const CONFIG = 'config';   // de instellingen (AFAS_TOKEN of AFAS_BASE_URL) kloppen niet
    public const NETWORK = 'network'; // AFAS is niet bereikbaar
    public const AUTH = 'auth';       // AFAS weigert het token
    public const HTTP = 'http';       // AFAS gaf een andere foutstatus
    public const FORMAT = 'format';   // het antwoord van AFAS heeft niet de verwachte vorm
    public const CHECK = 'check';     // de controle vóór het wijzigen hield de synchronisatie tegen

    public function __construct(public readonly string $kind, string $message, public readonly ?int $status = null)
    {
        parent::__construct($message);
    }
}
