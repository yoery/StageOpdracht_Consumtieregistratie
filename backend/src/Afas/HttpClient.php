<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * HttpClient — de afspraak (interface) voor het doen van een GET-verzoek.
 *
 * De echte uitvoering is CurlHttpClient. De tests gebruiken een nagebootste versie met vaste
 * antwoorden, zodat er in een test nooit een verzoek naar AFAS gaat.
 */
interface HttpClient
{
    /**
     * Doet een GET-verzoek en geeft de status en de inhoud van het antwoord terug.
     * Lukt de verbinding niet, dan volgt een AfasException van de soort NETWORK.
     *
     * @param list<string> $headers regels als "Naam: waarde"
     */
    public function get(string $url, array $headers): HttpResponse;
}
