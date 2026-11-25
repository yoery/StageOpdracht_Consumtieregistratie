<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * AfasClient — haalt de rijen van een GetConnector op bij AFAS Profit.
 *
 * Verantwoordelijkheid:
 *   - het adres van een portie maken: connector, `skip`, `take` en de sortering (`orderbyfieldids`);
 *   - de header `Authorization: AfasToken <token>` meesturen (het token komt van AfasConfig);
 *   - alle porties ophalen tot er een portie terugkomt die kleiner is dan `take`;
 *   - het antwoord controleren: de status, of het JSON is en of er een lijst `rows` in staat;
 *   - de metadata opvragen (`connectors` en `connectorFields`): welke GetConnectors er zijn en hoe de
 *     velden heten. Daar staan geen gegevens van medewerkers in.
 *
 * AFAS raadt aan `skip` en `take` altijd te combineren met een vaste sortering, zodat er tijdens het
 * ophalen niets wordt overgeslagen of dubbel komt. Daarom is het sorteerveld verplicht.
 *
 * Een foutmelding noemt de connector, de status en de plek in de lijst (`skip`), maar nooit het
 * token en nooit de inhoud van een antwoord (daar kunnen gegevens van medewerkers in staan).
 *
 * Verbonden met:
 *   - AfasConfig: het adres, de connector, de portiegrootte en de header met het token;
 *   - HttpClient: doet het verzoek (CurlHttpClient, of een nagebootste versie in de tests);
 *   - SyncRunner: vraagt alle rijen op voor de synchronisatie.
 */
final class AfasClient
{
    // Meer porties dan dit haalt de koppeling nooit op. Dat voorkomt eindeloos ophalen als AFAS
    // steeds volle porties blijft geven.
    public const MAX_PAGES = 1000;

    public function __construct(private readonly AfasConfig $config, private readonly HttpClient $http)
    {
    }

    /**
     * Haalt alle rijen op, gesorteerd op `$sortField` (de naam van het veld in de GetConnector).
     *
     * @return list<array<string, mixed>>
     */
    public function fetchAll(string $sortField): array
    {
        $rows = [];
        for ($page = 0; $page < self::MAX_PAGES; $page++) {
            $portion = $this->fetchPage($page * $this->config->take, $sortField);
            array_push($rows, ...$portion);
            if (count($portion) < $this->config->take) {
                return $rows;
            }
        }

        throw new AfasException(AfasException::FORMAT, sprintf('AFAS blijft volle porties geven na %d porties. Het ophalen is gestopt.', self::MAX_PAGES));
    }

    /**
     * Haalt één portie op: de rijen vanaf plek `$skip`.
     *
     * @return list<array<string, mixed>>
     */
    public function fetchPage(int $skip, string $sortField): array
    {
        $where = sprintf('connector %s, skip %d', $this->config->connectorName(), $skip);
        $rows = $this->objectList($this->getJson($this->pageUrl($skip, $sortField), $where), 'rows', $where);
        if (count($rows) > $this->config->take) {
            throw new AfasException(AfasException::FORMAT, sprintf('AFAS gaf meer rijen dan gevraagd (%s).', $where));
        }

        return $rows;
    }

    /**
     * De GetConnectors waar dit token bij mag (metadata, geen gegevens van medewerkers). Werkt ook als
     * AFAS_CONNECTOR nog leeg is. Zo is de juiste naam op te zoeken.
     *
     * @return list<array{id: string, description: string}>
     */
    public function connectors(): array
    {
        $where = 'metainfo';
        $connectors = [];
        foreach ($this->objectList($this->getJson($this->config->baseUrl . '/metainfo', $where), 'getConnectors', $where) as $connector) {
            if (isset($connector['id']) && is_string($connector['id'])) {
                $connectors[] = ['id' => $connector['id'], 'description' => is_string($connector['description'] ?? null) ? $connector['description'] : ''];
            }
        }

        return $connectors;
    }

    /**
     * De velden van de GetConnector uit de instellingen (metadata, geen gegevens van medewerkers).
     * Hiermee is te controleren of de veldnamen kloppen met wat EmployeeMapper verwacht.
     *
     * @return list<array{id: string, label: string, dataType: string, length: int|null}>
     */
    public function connectorFields(): array
    {
        $connector = $this->config->connectorName();
        $where = 'metainfo van connector ' . $connector;
        $url = $this->config->baseUrl . '/metainfo/get/' . rawurlencode($connector);
        $fields = [];
        foreach ($this->objectList($this->getJson($url, $where), 'fields', $where) as $field) {
            if (isset($field['id']) && is_string($field['id'])) {
                $fields[] = [
                    'id' => $field['id'],
                    'label' => is_string($field['label'] ?? null) ? $field['label'] : '',
                    'dataType' => is_string($field['dataType'] ?? null) ? $field['dataType'] : '',
                    'length' => is_int($field['length'] ?? null) ? $field['length'] : null,
                ];
            }
        }

        return $fields;
    }

    /**
     * Doet een verzoek met de header van het token en geeft het antwoord als lijst terug.
     * `$where` zegt in een foutmelding waar het misging.
     *
     * @return array<mixed>
     */
    private function getJson(string $url, string $where): array
    {
        $response = $this->http->get($url, [$this->config->authorizationHeader(), 'Accept: application/json']);

        if ($response->status === 401 || $response->status === 403) {
            throw new AfasException(
                AfasException::AUTH,
                sprintf('AFAS weigert het token (status %d, %s). Controleer AFAS_TOKEN en de rechten van de App connector.', $response->status, $where),
                $response->status
            );
        }
        if ($response->status !== 200) {
            throw new AfasException(AfasException::HTTP, sprintf('AFAS gaf status %d (%s).', $response->status, $where), $response->status);
        }

        $data = json_decode($response->body, true);
        if (!is_array($data)) {
            throw new AfasException(AfasException::FORMAT, sprintf('Het antwoord van AFAS is geen JSON (%s).', $where));
        }

        return $data;
    }

    /**
     * Haalt uit het antwoord de lijst met deze naam, waarin ieder onderdeel een object is.
     *
     * @param array<mixed> $data
     * @return list<array<string, mixed>>
     */
    private function objectList(array $data, string $name, string $where): array
    {
        if (!isset($data[$name]) || !is_array($data[$name]) || !array_is_list($data[$name])) {
            // Alleen de namen van de onderdelen op het hoogste niveau, nooit de inhoud. Zo is te zien
            // of het adres naar de juiste dienst wijst, zonder dat er gegevens in de melding komen.
            $present = array_slice(array_filter(array_map('strval', array_keys($data)), static fn (string $key): bool => preg_match('/^[A-Za-z0-9_]{1,40}$/', $key) === 1), 0, 10);
            throw new AfasException(
                AfasException::FORMAT,
                sprintf('Het antwoord van AFAS bevat geen lijst "%s" (%s). Wel aanwezig: %s.', $name, $where, $present === [] ? 'niets herkenbaars' : implode(', ', $present))
            );
        }
        foreach ($data[$name] as $item) {
            if (!is_array($item)) {
                throw new AfasException(AfasException::FORMAT, sprintf('Het antwoord van AFAS bevat in "%s" een onderdeel dat geen object is (%s).', $name, $where));
            }
        }

        return $data[$name];
    }

    /**
     * Het adres van één portie, bijvoorbeeld
     * https://12345.rest.afas.online/ProfitRestServices/connectors/TVB_Consumptie_Medewerkers?skip=0&take=100&orderbyfieldids=Personeelsnummer
     */
    public function pageUrl(int $skip, string $sortField): string
    {
        if ($skip < 0) {
            throw new AfasException(AfasException::CONFIG, 'skip mag niet negatief zijn.');
        }
        if (preg_match('/^[A-Za-z0-9_]{1,100}$/', $sortField) !== 1) {
            throw new AfasException(AfasException::CONFIG, 'Het sorteerveld mag alleen letters, cijfers en _ bevatten.');
        }

        return sprintf(
            '%s/connectors/%s?skip=%d&take=%d&orderbyfieldids=%s',
            $this->config->baseUrl,
            rawurlencode($this->config->connectorName()),
            $skip,
            $this->config->take,
            rawurlencode($sortField)
        );
    }
}
