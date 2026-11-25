<?php

declare(strict_types=1);

// Hulpmiddelen voor de tests van de backend. Er zijn geen extra pakketten nodig: `test()` meldt een
// test aan, `same()`, `ok()` en `throws()` controleren een uitkomst, en run.php draait alles.
//
// De tests gebruiken nooit het echte AFAS, geen echt token en geen echte medewerkers. De antwoorden
// van AFAS zijn nagebootst (FakeHttpClient) en de medewerkers zijn de voorbeeldnamen van de demo.

use Tvb\Consumptie\Afas\AfasConfig;
use Tvb\Consumptie\Afas\EmployeeRepository;
use Tvb\Consumptie\Afas\HttpClient;
use Tvb\Consumptie\Afas\HttpResponse;
use Tvb\Consumptie\Afas\StoredEmployee;
use Tvb\Consumptie\Afas\SyncPlan;

final class Tests
{
    /** @var list<array{string, callable}> */
    public static array $all = [];
}

final class SkipTest extends Exception
{
}

/** Meldt een test aan. */
function test(string $name, callable $body): void
{
    Tests::$all[] = [$name, $body];
}

/** Slaat de test over, bijvoorbeeld als een hulpmiddel op deze computer ontbreekt. */
function skip(string $reason): never
{
    throw new SkipTest($reason);
}

/** De waarde moet precies gelijk zijn aan wat er wordt verwacht. */
function same(mixed $expected, mixed $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        throw new AssertionError(($message !== '' ? $message . "\n" : '') . 'verwacht: ' . var_export($expected, true) . "\ngekregen: " . var_export($actual, true));
    }
}

function ok(bool $condition, string $message = 'de voorwaarde klopt niet'): void
{
    if (!$condition) {
        throw new AssertionError($message);
    }
}

/** De functie moet een fout van deze class geven. Geeft de fout terug om verder te controleren. */
function throws(string $class, callable $body): Throwable
{
    try {
        $body();
    } catch (Throwable $error) {
        if ($error instanceof $class) {
            return $error;
        }
        throw new AssertionError('verwacht: ' . $class . ', gekregen: ' . $error::class . ' (' . $error->getMessage() . ')');
    }

    throw new AssertionError('verwacht: ' . $class . ', maar er kwam geen fout');
}

/**
 * Een token dat alleen in de tests bestaat. Het heeft de vorm van een token van AFAS (Base64 van de
 * token-XML), maar geeft nergens toegang toe. Het wordt hier gemaakt en staat dus nergens als vaste
 * tekst in een bestand.
 */
function fakeToken(): string
{
    return base64_encode('<token><version>1</version><data>NEPTOKEN-ALLEEN-VOOR-DE-TESTS-0000</data></token>');
}

/** De tekst mag het neptoken niet bevatten, ook niet het deel tussen <data> en </data>. */
function withoutToken(string $text, string $where): void
{
    ok(!str_contains($text, fakeToken()), "het token staat in $where");
    ok(!str_contains($text, 'NEPTOKEN-ALLEEN-VOOR-DE-TESTS'), "de inhoud van het token staat in $where");
}

/** Instellingen voor de tests, met het neptoken en een adres van de testomgeving van AFAS. */
function fakeConfig(int $take = 100, string $baseUrl = 'https://12345.resttest.afas.online/ProfitRestServices', string $connector = 'TVB_Consumptie_Medewerkers'): AfasConfig
{
    return AfasConfig::fromValues(['AFAS_TOKEN' => fakeToken(), 'AFAS_BASE_URL' => $baseUrl, 'AFAS_CONNECTOR' => $connector], $take);
}

/**
 * Een rij zoals de GetConnector die geeft. Zonder argumenten is het voorbeeldmedewerker Lotte van Dijk.
 *
 * @param array<string, mixed> $changes
 * @return array<string, mixed>
 */
function afasRow(array $changes = []): array
{
    return array_merge([
        'Personeelsnummer' => '5001',
        'Voornaam' => 'Lotte',
        'Achternaam' => 'Dijk',
        'Voorvoegsel' => 'van',
        'Werkgever' => '4711',
        'Werklocatie' => 'Hoofdkantoor',
        'Looncode' => '101',
        'DatumUitDienst' => null,
    ], $changes);
}

/** Het antwoord van AFAS op één portie. */
function afasPage(array $rows, int $skip = 0, int $take = 100): HttpResponse
{
    return new HttpResponse(200, json_encode(['skip' => $skip, 'take' => $take, 'rows' => $rows], JSON_THROW_ON_ERROR));
}

/**
 * FakeHttpClient — nagebootste verbinding met AFAS. Geeft de antwoorden die de test klaarzet, in
 * volgorde, en onthoudt welke verzoeken er zijn gedaan. Een klaargezette fout wordt gegooid.
 */
final class FakeHttpClient implements HttpClient
{
    /** @var list<array{url: string, headers: list<string>}> */
    public array $requests = [];

    /** @param list<HttpResponse|Throwable> $responses */
    public function __construct(private array $responses)
    {
    }

    public function get(string $url, array $headers): HttpResponse
    {
        $this->requests[] = ['url' => $url, 'headers' => $headers];
        if ($this->responses === []) {
            throw new LogicException('De test heeft geen antwoord meer klaargezet voor ' . $url);
        }
        $response = array_shift($this->responses);
        if ($response instanceof Throwable) {
            throw $response;
        }

        return $response;
    }
}

/**
 * InMemoryRepository — de opslag van de app, nagebootst in het geheugen. Onthoudt welk plan is
 * opgeslagen en welke mislukte pogingen zijn vastgelegd.
 */
class InMemoryRepository implements EmployeeRepository
{
    /** @var list<SyncPlan> */
    public array $applied = [];

    /** @var list<string> */
    public array $failures = [];

    public ?Throwable $applyError = null;

    public ?Throwable $recordError = null;

    /**
     * @param list<StoredEmployee> $employees
     * @param array<string, string> $companies
     * @param list<array{id: string, companyId: string, name: string}> $points
     */
    public function __construct(
        public array $employees = [],
        public array $companies = ['4711' => 'bedrijf-tvb', '4712' => 'bedrijf-it'],
        public array $points = [
            ['id' => 'punt-hoofdkantoor', 'companyId' => 'bedrijf-tvb', 'name' => 'Hoofdkantoor'],
            ['id' => 'punt-kantine-it', 'companyId' => 'bedrijf-it', 'name' => 'Kantine IT'],
        ],
        public ?int $lastCount = null
    ) {
    }

    public function employees(): array
    {
        return $this->employees;
    }

    public function companyIdsByEmployerNumber(): array
    {
        return $this->companies;
    }

    public function points(): array
    {
        return $this->points;
    }

    public function lastReceivedCount(): ?int
    {
        return $this->lastCount;
    }

    public function apply(SyncPlan $plan, DateTimeImmutable $now): void
    {
        if ($this->applyError !== null) {
            throw $this->applyError;
        }
        $this->applied[] = $plan;
        $this->lastCount = $plan->receivedCount;
    }

    public function recordFailure(string $message, DateTimeImmutable $now): void
    {
        if ($this->recordError !== null) {
            throw $this->recordError;
        }
        $this->failures[] = $message;
    }
}

/** Een medewerker zoals die in de app staat. Zonder argumenten is het Lotte van Dijk. */
function stored(array $changes = []): StoredEmployee
{
    $values = array_merge([
        'id' => 'medewerker-lotte',
        'personnelNumber' => '5001',
        'firstName' => 'Lotte',
        'lastName' => 'van Dijk',
        'payrollCode' => '101',
        'companyId' => 'bedrijf-tvb',
        'pointId' => 'punt-hoofdkantoor',
        'active' => true,
    ], $changes);

    return new StoredEmployee(
        $values['id'],
        $values['personnelNumber'],
        $values['firstName'],
        $values['lastName'],
        $values['payrollCode'],
        $values['companyId'],
        $values['pointId'],
        $values['active']
    );
}
