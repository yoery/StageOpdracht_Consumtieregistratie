<?php

declare(strict_types=1);

// Tests voor de server: de database (RecordStore), inloggen en tablets (Auth), wie wat mag (Policy),
// de API en de opslag voor de synchronisatie met AFAS (RecordEmployeeRepository).
// Alles draait met een database in het geheugen en met nepgegevens. Er gaat geen verzoek naar AFAS.

use Tvb\Consumptie\Afas\AfasClient;
use Tvb\Consumptie\Afas\EmployeeMapper;
use Tvb\Consumptie\Afas\EmployeeSync;
use Tvb\Consumptie\Afas\SyncPlan;
use Tvb\Consumptie\Afas\SyncRunner;
use Tvb\Consumptie\Server\Api;
use Tvb\Consumptie\Server\Auth;
use Tvb\Consumptie\Server\Database;
use Tvb\Consumptie\Server\Policy;
use Tvb\Consumptie\Server\RecordEmployeeRepository;
use Tvb\Consumptie\Server\RecordStore;
use Tvb\Consumptie\Server\Request;
use Tvb\Consumptie\Server\Response;

const TEST_PASSWORD = 'een-lang-nepwachtwoord';
const TEST_EMAIL = 'beheer@voorbeeld.test';

/** Een object uit JSON-tekst, zoals de website het stuurt. */
function record(string $json): stdClass
{
    return json_decode($json, false, 32, JSON_THROW_ON_ERROR);
}

function testMoment(string $time = '2026-11-26T09:00:00Z'): DateTimeImmutable
{
    return new DateTimeImmutable($time);
}

/**
 * Een server met een lege database in het geheugen, een beheerder en nepgegevens: het bedrijf TVB
 * (werkgevernummer 01), het punt Hoofdkantoor met Blikje op voorraad, en Lotte (actief, met een
 * afwijkend werkgevernummer) en Mark (inactief).
 */
final class TestServer
{
    public PDO $pdo;
    public Api $api;
    public RecordStore $store;
    public Auth $auth;

    /** @var list<string> */
    public array $log = [];

    /** @var array<string, string> */
    public array $cookies = [];

    public ?string $csrf = null;

    public function __construct(?Closure $syncRunner = null)
    {
        $this->pdo = Database::connect('sqlite::memory:');
        $this->store = new RecordStore($this->pdo);
        $this->auth = new Auth($this->pdo);
        $this->api = new Api($this->pdo, $syncRunner, function (string $line): void {
            $this->log[] = $line;
        });
        same(null, $this->auth->createAdmin(TEST_EMAIL, TEST_PASSWORD, testMoment()));

        $now = testMoment();
        $this->store->put('companies', 'bedrijf-tvb', record('{"id":"bedrijf-tvb","name":"TVB","employerNumber":"01"}'), $now);
        $this->store->put('products', 'blikje', record('{"id":"blikje","name":"Blikje","price":0.65}'), $now);
        $this->store->put('points', 'punt-hk', record('{"id":"punt-hk","name":"Hoofdkantoor","companyId":"bedrijf-tvb","products":{"blikje":{"offered":true,"stock":24,"minimum":6}}}'), $now);
        $this->store->put('employees', 'mw-lotte', record('{"id":"mw-lotte","name":"Lotte van Dijk","firstName":"Lotte","lastName":"van Dijk","payrollCode":"101","personnelNumber":"5001","employerNumber":"77","companyId":"bedrijf-tvb","pointId":"punt-hk","active":true,"color":"#d8f1e8","badgeId":"04A1B2C3"}'), $now);
        $this->store->put('employees', 'mw-mark', record('{"id":"mw-mark","name":"Mark Jansen","firstName":"Mark","lastName":"Jansen","payrollCode":"102","personnelNumber":"5002","employerNumber":"","companyId":"bedrijf-tvb","pointId":"punt-hk","active":false,"color":"#e3eef6","badgeId":""}'), $now);
    }

    /**
     * Doet een verzoek zoals de website dat doet: met de cookies en de sleutel van de sessie, en met
     * de kopregels van de eigen website. Met `$headers` zijn kopregels te vervangen of weg te laten (null).
     *
     * @param array<string, string|null> $headers
     */
    public function call(string $method, string $path, ?string $json = null, array $headers = [], ?DateTimeImmutable $now = null): Response
    {
        $query = [];
        if (str_contains($path, '?')) {
            [$path, $queryText] = explode('?', $path, 2);
            parse_str($queryText, $query);
        }
        $all = ['origin' => 'https://consumptie.voorbeeld.test', 'x-cr-client' => '1'];
        if ($this->csrf !== null) {
            $all['x-csrf-token'] = $this->csrf;
        }
        foreach ($headers as $name => $value) {
            if ($value === null) {
                unset($all[$name]);
            } else {
                $all[$name] = $value;
            }
        }
        $request = new Request($method, $path, $query, $json === null ? null : record($json), $all, $this->cookies, '203.0.113.7', true, 'consumptie.voorbeeld.test');
        $response = $this->api->handle($request, $now ?? testMoment());
        foreach ($response->cookies as $cookie) {
            if ($cookie['value'] === '') {
                unset($this->cookies[$cookie['name']]);
            } else {
                $this->cookies[$cookie['name']] = $cookie['value'];
            }
        }
        if (array_key_exists('csrf', $response->body)) {
            $this->csrf = $response->body['csrf'];
        }

        return $response;
    }

    public function loginAsAdmin(): void
    {
        $response = $this->call('POST', '/login', json_encode(['email' => TEST_EMAIL, 'password' => TEST_PASSWORD]));
        same(200, $response->status);
    }

    /** Koppelt deze browser als tablet en logt de beheerder weer uit. */
    public function becomeTablet(): void
    {
        $this->loginAsAdmin();
        same(200, $this->call('POST', '/devices', '{"name":"Tablet kantine","pointId":"punt-hk"}')->status);
        same('device', $this->call('POST', '/logout')->body['role']);
    }

    /**
     * De wijzigingen sinds een volgnummer, per lijst op id.
     *
     * @return array<string, array<string, stdClass|null>>
     */
    public function pulled(int $since = 0, ?DateTimeImmutable $now = null): array
    {
        $response = $this->call('GET', "/changes?since=$since", null, [], $now);
        same(200, $response->status);
        $byCollection = [];
        foreach ($response->body['changes'] as $change) {
            $byCollection[$change['collection']][$change['id']] = $change['data'];
        }

        return $byCollection;
    }
}

// ------------------------------------------------------------------
// RecordStore
// ------------------------------------------------------------------

test('RecordStore: een leeg object blijft een object en een kommagetal blijft een kommagetal', function (): void {
    $store = new RecordStore(Database::connect('sqlite::memory:'));
    $store->put('points', 'punt-1', record('{"id":"punt-1","name":"Leeg punt","companyId":"b","products":{}}'));
    $store->put('products', 'p', record('{"id":"p","name":"Product","price":1.0}'));

    same('{"id":"punt-1","name":"Leeg punt","companyId":"b","products":{}}', json_encode($store->get('points', 'punt-1')));
    same('{"id":"p","name":"Product","price":1.0}', json_encode($store->get('products', 'p'), JSON_PRESERVE_ZERO_FRACTION));
});

test('RecordStore: de volgorde van invoeren blijft, ook als een eerdere regel later wijzigt', function (): void {
    $store = new RecordStore(Database::connect('sqlite::memory:'));
    foreach (['c', 'a', 'b'] as $id) {
        $store->put('registrations', $id, record('{"id":"' . $id . '","n":1}'));
    }
    $store->put('registrations', 'c', record('{"id":"c","n":2}'));

    same(['c', 'a', 'b'], array_map(static fn (stdClass $row): string => $row->id, $store->all('registrations')));
    same(4, $store->head());
});

test('RecordStore: alleen wat nieuwer is dan het volgnummer komt terug, en verwijderen is te zien', function (): void {
    $store = new RecordStore(Database::connect('sqlite::memory:'));
    $store->put('employees', 'a', record('{"id":"a"}'));
    $store->put('employees', 'b', record('{"id":"b"}'));
    $seen = $store->head();
    $store->delete('employees', 'a');
    $store->put('products', 'p', record('{"id":"p"}'));

    $changes = $store->changesSince($seen);
    same([['employees', 'a', null], ['products', 'p', 'p']], array_map(static fn (array $change): array => [$change['collection'], $change['id'], $change['data']->id ?? null], $changes));
    same([], $store->changesSince($store->head()));
    same(['b'], array_column($store->changesSince(0, ['employees']), 'id'), 'bij de eerste keer ophalen komt een verwijderde regel niet mee');
    same(null, $store->get('employees', 'a'));
});

test('RecordStore: een onbekende lijst, een onveilige id, een verkeerde id in de inhoud en een te grote regel worden geweigerd', function (): void {
    $store = new RecordStore(Database::connect('sqlite::memory:'));

    throws(InvalidArgumentException::class, fn () => $store->put('wachtwoorden', 'a', record('{"id":"a"}')));
    throws(InvalidArgumentException::class, fn () => $store->put('employees', '__proto__', record('{"id":"__proto__"}')));
    throws(InvalidArgumentException::class, fn () => $store->put('employees', 'a b', record('{"id":"a b"}')));
    throws(InvalidArgumentException::class, fn () => $store->put('employees', 'a', record('{"id":"b"}')));
    throws(InvalidArgumentException::class, fn () => $store->put('employees', 'a', record(json_encode(['id' => 'a', 'name' => str_repeat('x', 70000)]))));
    same(0, $store->head());
});

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------

test('Auth: van het wachtwoord staat alleen een hash in de database, en van een sessie alleen een hash van de sleutel', function (): void {
    $server = new TestServer();
    $login = $server->auth->login(TEST_EMAIL, TEST_PASSWORD, '203.0.113.7', testMoment());
    same('ok', $login['status']);

    $dump = json_encode([
        $server->pdo->query('SELECT * FROM admins')->fetchAll(),
        $server->pdo->query('SELECT * FROM sessions')->fetchAll(),
    ], JSON_THROW_ON_ERROR);
    ok(!str_contains($dump, TEST_PASSWORD), 'het wachtwoord staat in de database');
    ok(!str_contains($dump, $login['token']), 'de sleutel van de sessie staat in de database');
    ok(str_contains($dump, hash('sha256', $login['token'])));
});

test('Auth: een te kort wachtwoord, een ongeldig e-mailadres en een dubbele beheerder worden geweigerd', function (): void {
    $auth = new Auth(Database::connect('sqlite::memory:'));

    ok(str_contains((string) $auth->createAdmin(TEST_EMAIL, 'tekort', testMoment()), 'minstens 12 tekens'));
    ok($auth->createAdmin('geen-adres', TEST_PASSWORD, testMoment()) !== null);
    same(null, $auth->createAdmin('  Beheer@Voorbeeld.TEST ', TEST_PASSWORD, testMoment()));
    ok($auth->adminExists(TEST_EMAIL), 'hoofdletters en spaties tellen niet mee');
    ok(str_contains((string) $auth->createAdmin(TEST_EMAIL, TEST_PASSWORD, testMoment()), 'bestaat al'));
    same(1, $auth->adminCount());
});

test('Auth: een verkeerd wachtwoord en een onbekend e-mailadres geven dezelfde uitkomst', function (): void {
    $server = new TestServer();

    same(['status' => 'wrong'], $server->auth->login(TEST_EMAIL, 'verkeerd-wachtwoord', '203.0.113.7', testMoment()));
    same(['status' => 'wrong'], $server->auth->login('niemand@voorbeeld.test', TEST_PASSWORD, '203.0.113.7', testMoment()));
});

test('Auth: na vijf foute pogingen is inloggen een kwartier geblokkeerd, ook met het goede wachtwoord', function (): void {
    $server = new TestServer();
    for ($attempt = 0; $attempt < Auth::MAX_FAILED_PER_EMAIL; $attempt++) {
        same('wrong', $server->auth->login(TEST_EMAIL, 'verkeerd-wachtwoord', '203.0.113.7', testMoment())['status']);
    }

    same('blocked', $server->auth->login(TEST_EMAIL, TEST_PASSWORD, '203.0.113.7', testMoment('2026-11-26T09:05:00Z'))['status']);
    same('ok', $server->auth->login(TEST_EMAIL, TEST_PASSWORD, '203.0.113.7', testMoment('2026-11-26T09:16:00Z'))['status']);
});

test('Auth: een sessie van de beheerder verloopt na een half uur niets doen en altijd na twaalf uur', function (): void {
    $server = new TestServer();
    $token = $server->auth->login(TEST_EMAIL, TEST_PASSWORD, '203.0.113.7', testMoment('2026-11-26T09:00:00Z'))['token'];

    ok($server->auth->session($token, Auth::KIND_ADMIN, testMoment('2026-11-26T09:20:00Z')) !== null);
    ok($server->auth->session($token, Auth::KIND_ADMIN, testMoment('2026-11-26T09:45:00Z')) !== null, 'de tijd begint opnieuw na een verzoek');
    same(null, $server->auth->session($token, Auth::KIND_ADMIN, testMoment('2026-11-26T10:20:00Z')), 'een half uur niets gedaan');

    $long = $server->auth->login(TEST_EMAIL, TEST_PASSWORD, '203.0.113.7', testMoment('2026-11-26T09:00:00Z'))['token'];
    for ($minutes = 20; $minutes <= 700; $minutes += 20) {
        ok($server->auth->session($long, Auth::KIND_ADMIN, testMoment('2026-11-26T09:00:00Z')->modify("+$minutes minutes")) !== null, "na $minutes minuten");
    }
    same(null, $server->auth->session($long, Auth::KIND_ADMIN, testMoment('2026-11-26T21:01:00Z')), 'na twaalf uur');
});

test('Auth: een sleutel van een tablet werkt niet als sessie van een beheerder, en een ingetrokken tablet werkt niet meer', function (): void {
    $server = new TestServer();
    $device = $server->auth->createDevice('Tablet kantine', 'punt-hk', testMoment());

    same(null, $server->auth->session($device['token'], Auth::KIND_ADMIN, testMoment()));
    same($device['id'], $server->auth->session($device['token'], Auth::KIND_DEVICE, testMoment())['subjectId']);
    ok($server->auth->session($device['token'], Auth::KIND_DEVICE, testMoment('2027-06-01T09:00:00Z')) !== null, 'een tablet blijft gekoppeld');

    ok($server->auth->revokeDevice($device['id'], testMoment()));
    same(null, $server->auth->session($device['token'], Auth::KIND_DEVICE, testMoment()));
    same([], $server->auth->devices());
    same(null, $server->auth->session('geen-sleutel', Auth::KIND_DEVICE, testMoment()));
});

test('Auth: een nieuw wachtwoord beëindigt de oude sessies', function (): void {
    $server = new TestServer();
    $token = $server->auth->login(TEST_EMAIL, TEST_PASSWORD, '203.0.113.7', testMoment())['token'];

    same(null, $server->auth->setPassword(TEST_EMAIL, 'een-ander-lang-wachtwoord'));
    same(null, $server->auth->session($token, Auth::KIND_ADMIN, testMoment()));
    same('wrong', $server->auth->login(TEST_EMAIL, TEST_PASSWORD, '203.0.113.7', testMoment())['status']);
    same('ok', $server->auth->login(TEST_EMAIL, 'een-ander-lang-wachtwoord', '203.0.113.7', testMoment())['status']);
});

// ------------------------------------------------------------------
// API: toegang
// ------------------------------------------------------------------

test('API: zonder inloggen is alleen /health bereikbaar, en dat geeft geen gegevens', function (): void {
    $server = new TestServer();

    same(['ok' => true], $server->call('GET', '/health')->body);
    foreach ([['GET', '/changes?since=0'], ['GET', '/devices'], ['GET', '/afas/status'], ['POST', '/changes'], ['POST', '/afas/sync'], ['POST', '/devices'], ['POST', '/logout']] as [$method, $path]) {
        $response = $server->call($method, $path, $method === 'POST' ? '{}' : null);
        same(401, $response->status, "$method $path");
        same(['ok' => false, 'message' => 'Niet ingelogd.'], $response->body, "$method $path");
    }
    $session = $server->call('GET', '/session')->body;
    same(null, $session['role']);
    same(null, $session['device']);
    same(true, $session['configured']);
});

test('API: inloggen zet een cookie en geeft de sleutel van de sessie, een fout wachtwoord geeft 401', function (): void {
    $server = new TestServer();

    $wrong = $server->call('POST', '/login', json_encode(['email' => TEST_EMAIL, 'password' => 'verkeerd-wachtwoord']));
    same(401, $wrong->status);
    same('Het e-mailadres of het wachtwoord klopt niet.', $wrong->body['message']);
    same([], $wrong->cookies);

    $response = $server->call('POST', '/login', json_encode(['email' => TEST_EMAIL, 'password' => TEST_PASSWORD]));
    same(200, $response->status);
    same('admin', $response->body['role']);
    same(Api::COOKIE_ADMIN, $response->cookies[0]['name']);
    ok(preg_match('/^[a-f0-9]{64}$/', $response->cookies[0]['value']) === 1);
    ok(!str_contains(json_encode($response->body), $response->cookies[0]['value']), 'de sleutel van de cookie staat in de inhoud');
    same('admin', $server->call('GET', '/session')->body['role']);

    same(null, $server->call('POST', '/logout')->body['role']);
    same(401, $server->call('GET', '/changes?since=0')->status);
});

test('API: na te veel foute pogingen geeft inloggen 429', function (): void {
    $server = new TestServer();
    for ($attempt = 0; $attempt < Auth::MAX_FAILED_PER_EMAIL; $attempt++) {
        $server->call('POST', '/login', json_encode(['email' => TEST_EMAIL, 'password' => 'verkeerd-wachtwoord']));
    }

    same(429, $server->call('POST', '/login', json_encode(['email' => TEST_EMAIL, 'password' => TEST_PASSWORD]))->status);
});

test('API: een schrijvend verzoek van een andere website, zonder kopregel of zonder sleutel wordt geweigerd', function (): void {
    $server = new TestServer();
    $login = json_encode(['email' => TEST_EMAIL, 'password' => TEST_PASSWORD]);

    same(403, $server->call('POST', '/login', $login, ['origin' => 'https://kwaad.voorbeeld.test'])->status);
    same(403, $server->call('POST', '/login', $login, ['origin' => null])->status);
    same(403, $server->call('POST', '/login', $login, ['x-cr-client' => null])->status);

    $server->loginAsAdmin();
    $change = '{"changes":[{"collection":"products","id":"blikje","data":{"id":"blikje","name":"Blikje","price":9}}]}';
    same(403, $server->call('POST', '/changes', $change, ['x-csrf-token' => 'verkeerd'])->status);
    same(403, $server->call('POST', '/changes', $change, ['x-csrf-token' => null])->status);
    same(403, $server->call('POST', '/changes', $change, ['origin' => 'https://kwaad.voorbeeld.test'])->status);
    same(0.65, $server->store->get('products', 'blikje')->price);
    same(200, $server->call('POST', '/changes', $change)->status);
    same(9, $server->store->get('products', 'blikje')->price);
});

test('API: een fout op de server geeft geen details aan de browser en geen gegevens in het logboek', function (): void {
    $server = new TestServer(static function (): SyncRunner {
        throw new RuntimeException('geheim detail met Lotte van Dijk');
    });
    $server->loginAsAdmin();

    $response = $server->call('POST', '/afas/sync', '{}');
    same(500, $response->status);
    same(['ok' => false, 'message' => 'Er ging iets mis op de server.'], $response->body);
    ok(!str_contains(implode("\n", $server->log), 'Lotte'), 'het logboek bevat de melding van de fout');
    ok(str_contains(implode("\n", $server->log), 'RuntimeException'));
});

// ------------------------------------------------------------------
// API: tablet
// ------------------------------------------------------------------

test('API: een beheerder koppelt een tablet aan een consumptiepunt, en na uitloggen is de browser een tablet', function (): void {
    $server = new TestServer();
    $server->loginAsAdmin();

    same(400, $server->call('POST', '/devices', '{"name":"","pointId":"punt-hk"}')->status);
    same(400, $server->call('POST', '/devices', '{"name":"Tablet","pointId":"bestaat-niet"}')->status);
    $linked = $server->call('POST', '/devices', '{"name":"Tablet kantine","pointId":"punt-hk"}');
    same(200, $linked->status);
    same('punt-hk', $linked->body['device']['pointId']);
    same(Api::COOKIE_DEVICE, $linked->cookies[0]['name']);

    $after = $server->call('POST', '/logout');
    same('device', $after->body['role']);
    $session = $server->call('GET', '/session')->body;
    same('device', $session['role']);
    same('Tablet kantine', $session['device']['name']);
    same(null, $session['email']);
});

test('API: een tablet ziet medewerkers zonder looncode, personeelsnummer en werkgevernummer, en geen logboek', function (): void {
    $server = new TestServer();
    $server->store->put('auditLog', 'log-1', record('{"id":"log-1","action":"Medewerker gewijzigd","details":"Lotte van Dijk","createdAt":"2026-11-26T08:00:00.000Z"}'), testMoment());
    $server->becomeTablet();

    $pulled = $server->pulled();
    $lotte = $pulled['employees']['mw-lotte'];
    same(['Lotte van Dijk', '', '', '', '04A1B2C3', 'punt-hk'], [$lotte->name, $lotte->payrollCode, $lotte->personnelNumber, $lotte->employerNumber, $lotte->badgeId, $lotte->pointId]);
    ok(!isset($pulled['auditLog']), 'een tablet krijgt het logboek');
    ok(isset($pulled['products']['blikje'], $pulled['companies']['bedrijf-tvb'], $pulled['points']['punt-hk']));
    $text = json_encode($pulled, JSON_THROW_ON_ERROR);
    foreach (['5001', '5002', '"101"', '"102"', '"77"'] as $hidden) {
        ok(!str_contains($text, $hidden), "een tablet ziet $hidden");
    }
    same('5001', $server->store->get('employees', 'mw-lotte')->personnelNumber, 'de server zelf houdt het personeelsnummer');

    foreach (['/devices', '/afas/status'] as $path) {
        same(403, $server->call('GET', $path)->status, $path);
    }
    same(403, $server->call('POST', '/afas/sync', '{}')->status);
});

test('API: de beheerder ziet alles, ook het logboek en de personeelsnummers', function (): void {
    $server = new TestServer();
    $server->store->put('auditLog', 'log-1', record('{"id":"log-1","action":"Test","details":"","createdAt":"2026-11-26T08:00:00.000Z"}'), testMoment());
    $server->loginAsAdmin();

    $pulled = $server->pulled();
    same('5001', $pulled['employees']['mw-lotte']->personnelNumber);
    same('101', $pulled['employees']['mw-lotte']->payrollCode);
    ok(isset($pulled['auditLog']['log-1']));
});

test('API: een registratie van een tablet krijgt de prijs en het werkgevernummer van de server', function (): void {
    $server = new TestServer();
    $server->becomeTablet();

    // De tablet stuurt een verzonnen prijs, een verkeerd werkgevernummer en een extra veld mee.
    $response = $server->call('POST', '/changes', '{"changes":[{"collection":"registrations","id":"reg-1","data":{"id":"reg-1","employeeId":"mw-lotte","productId":"blikje","price":0.01,"pointId":"punt-hk","createdAt":"2026-11-26T08:59:00.000Z","employerNumber":"99","correction":true}}]}');
    same(200, $response->status);
    same([], $response->body['rejected']);

    $stored = $server->store->get('registrations', 'reg-1');
    same(0.65, $stored->price);
    same('77', $stored->employerNumber, 'het afwijkende werkgevernummer van Lotte');
    same($server->auth->devices()[0]['id'], $stored->deviceId, 'de server zet de tablet bij de registratie');
    ok(!property_exists($stored, 'correction'), 'een tablet kan geen correctie maken');
    same($response->body['version'], $server->store->head());
    same('77', $server->pulled()['registrations']['reg-1']->employerNumber, 'de tablet krijgt de regel van de server terug');
});

test('API: een tablet kan een registratie niet wijzigen of verwijderen, en niet registreren voor een inactieve of onbekende medewerker', function (): void {
    $server = new TestServer();
    $server->becomeTablet();
    $registration = static fn (string $id, string $employeeId, string $productId = 'blikje'): string => json_encode([
        'collection' => 'registrations', 'id' => $id,
        'data' => ['id' => $id, 'employeeId' => $employeeId, 'productId' => $productId, 'price' => 0.65, 'pointId' => 'punt-hk', 'createdAt' => '2026-11-26T08:59:00.000Z'],
    ]);
    same([], $server->call('POST', '/changes', '{"changes":[' . $registration('reg-1', 'mw-lotte') . ']}')->body['rejected']);

    $response = $server->call('POST', '/changes', '{"changes":[' . implode(',', [
        $registration('reg-1', 'mw-lotte'),
        '{"collection":"registrations","id":"reg-1","data":null}',
        $registration('reg-2', 'mw-mark'),
        $registration('reg-3', 'bestaat-niet'),
        $registration('reg-4', 'mw-lotte', 'bestaat-niet'),
        '{"collection":"registrations","id":"reg-5","data":{"id":"reg-5","employeeId":"mw-lotte","productId":"blikje","createdAt":"gisteren"}}',
    ]) . ']}');

    same(['reg-1', 'reg-1', 'reg-2', 'reg-3', 'reg-4', 'reg-5'], array_column($response->body['rejected'], 'id'));
    same(0, $response->body['saved']);
    same(['reg-1'], array_map(static fn (stdClass $row): string => $row->id, $server->store->all('registrations')));
    ok(str_contains(implode("\n", $server->log), 'Wijzigingen geweigerd voor rol device: 6 van 6'));
});

test('API: een tablet kan medewerkers, producten, bedrijven en consumptiepunten niet wijzigen', function (): void {
    $server = new TestServer();
    $server->becomeTablet();

    $response = $server->call('POST', '/changes', '{"changes":[
        {"collection":"employees","id":"mw-lotte","data":{"id":"mw-lotte","name":"Iemand Anders","active":true}},
        {"collection":"employees","id":"mw-mark","data":null},
        {"collection":"products","id":"blikje","data":{"id":"blikje","name":"Blikje","price":0}},
        {"collection":"companies","id":"bedrijf-tvb","data":{"id":"bedrijf-tvb","name":"X","employerNumber":"1"}},
        {"collection":"points","id":"punt-nieuw","data":{"id":"punt-nieuw","name":"Nieuw","companyId":"bedrijf-tvb","products":{}}},
        {"collection":"points","id":"punt-hk","data":{"id":"punt-hk","name":"Gekaapt","companyId":"ander","products":{"blikje":{"offered":false,"stock":23,"minimum":0},"nieuw":{"offered":true,"stock":5}}}}
    ]}');

    same(['mw-lotte', 'mw-mark', 'blikje', 'bedrijf-tvb', 'punt-nieuw'], array_column($response->body['rejected'], 'id'));
    same('Lotte van Dijk', $server->store->get('employees', 'mw-lotte')->name);
    ok($server->store->get('employees', 'mw-mark') !== null);
    same(0.65, $server->store->get('products', 'blikje')->price);
    same(
        '{"id":"punt-hk","name":"Hoofdkantoor","companyId":"bedrijf-tvb","products":{"blikje":{"offered":true,"stock":24,"minimum":6}}}',
        json_encode($server->store->get('points', 'punt-hk')),
        'het punt is veranderd door een tablet'
    );
    same(1, $response->body['saved'], 'de wijziging van het bestaande punt wordt stil overgeslagen');
});

test('API: bij een registratie van een tablet verlaagt de server zelf de voorraad, ook als twee tablets tegelijk registreren', function (): void {
    $server = new TestServer();
    $server->becomeTablet();
    $push = static fn (string $id, string $createdAt, int $stockOnTablet): string => json_encode(['changes' => [
        ['collection' => 'registrations', 'id' => $id, 'data' => ['id' => $id, 'employeeId' => 'mw-lotte', 'productId' => 'blikje', 'price' => 0.65, 'pointId' => 'punt-hk', 'createdAt' => $createdAt]],
        ['collection' => 'points', 'id' => 'punt-hk', 'data' => ['id' => 'punt-hk', 'name' => 'Hoofdkantoor', 'companyId' => 'bedrijf-tvb', 'products' => ['blikje' => ['offered' => true, 'stock' => $stockOnTablet, 'minimum' => 6]]]],
    ]]);

    // Twee tablets zagen allebei 24 en sturen allebei 23. De server telt zelf: 24, 23, 22.
    same([], $server->call('POST', '/changes', $push('reg-1', '2026-11-26T08:59:00.000Z', 23))->body['rejected']);
    same([], $server->call('POST', '/changes', $push('reg-2', '2026-11-26T08:59:01.000Z', 23))->body['rejected']);
    same(22, $server->store->get('points', 'punt-hk')->products->blikje->stock);
    same(22, $server->pulled()['points']['punt-hk']->products->blikje->stock, 'de tablet krijgt de voorraad van de server terug');

    // Een registratie van vóór de laatste telling zat al in de telling: de voorraad blijft.
    $point = $server->store->get('points', 'punt-hk');
    $point->products->blikje->stock = 10;
    $point->products->blikje->countedAt = '2026-11-26T08:00:00.000Z';
    $server->store->put('points', 'punt-hk', $point, testMoment());
    $server->call('POST', '/changes', $push('reg-3', '2026-11-26T07:30:00.000Z', 9));
    same(10, $server->store->get('points', 'punt-hk')->products->blikje->stock);
    $server->call('POST', '/changes', $push('reg-4', '2026-11-26T08:30:00.000Z', 9));
    same(9, $server->store->get('points', 'punt-hk')->products->blikje->stock);

    // Wordt het product niet aangeboden op dat punt, dan verandert de voorraad niet.
    $point = $server->store->get('points', 'punt-hk');
    $point->products->blikje->offered = false;
    $server->store->put('points', 'punt-hk', $point, testMoment());
    $server->call('POST', '/changes', $push('reg-5', '2026-11-26T08:45:00.000Z', 8));
    same(9, $server->store->get('points', 'punt-hk')->products->blikje->stock);
    same(5, count($server->store->all('registrations')));
});

test('API: een tablet ziet alleen registraties van de laatste 40 dagen', function (): void {
    $server = new TestServer();
    $server->store->put('registrations', 'oud', record('{"id":"oud","employeeId":"mw-lotte","productId":"blikje","price":0.65,"pointId":"punt-hk","createdAt":"2026-09-01T10:00:00.000Z"}'), testMoment());
    $server->store->put('registrations', 'nieuw', record('{"id":"nieuw","employeeId":"mw-lotte","productId":"blikje","price":0.65,"pointId":"punt-hk","createdAt":"2026-11-20T10:00:00.000Z"}'), testMoment());
    $server->becomeTablet();
    same(['nieuw'], array_keys($server->pulled()['registrations']));

    $server->loginAsAdmin();
    same(['oud', 'nieuw'], array_keys($server->pulled()['registrations']));
});

test('API: een tablet kan een gezicht instellen en uitzetten voor een actieve medewerker, met precies 128 getallen', function (): void {
    $server = new TestServer();
    $server->becomeTablet();
    $enrollment = static fn (string $id, string $employeeId, int $length): string => json_encode([
        'collection' => 'faceEnrollments', 'id' => $id,
        'data' => ['id' => $id, 'employeeId' => $employeeId, 'descriptor' => array_fill(0, $length, 0.125), 'enrolledAt' => '2026-11-26T08:59:00.000Z', 'consentAt' => '2026-11-26T08:58:00.000Z'],
    ]);

    $response = $server->call('POST', '/changes', '{"changes":[' . implode(',', [$enrollment('g-1', 'mw-lotte', 128), $enrollment('g-2', 'mw-lotte', 5), $enrollment('g-3', 'mw-mark', 128)]) . ']}');
    same(['g-2', 'g-3'], array_column($response->body['rejected'], 'id'));
    same(128, count($server->store->get('faceEnrollments', 'g-1')->descriptor));

    same([], $server->call('POST', '/changes', '{"changes":[{"collection":"faceEnrollments","id":"g-1","data":null}]}')->body['rejected']);
    same(null, $server->store->get('faceEnrollments', 'g-1'));
});

test('API: een onleesbare inhoud wordt geweigerd', function (): void {
    $server = new TestServer();
    $server->loginAsAdmin();

    same(400, $server->call('POST', '/changes', '{"changes":"alles"}')->status);
    same(400, $server->call('POST', '/changes', null)->status);
    same(['', 'x'], array_column($server->call('POST', '/changes', '{"changes":["tekst",{"collection":"employees","id":"x","data":"geen object"}]}')->body['rejected'], 'id'));
    same(404, $server->call('GET', '/bestaat-niet')->status);
    same(405, $server->call('DELETE', '/changes')->status);
});

test('API: de beheerder wijzigt de locatie van een tablet en trekt hem in', function (): void {
    $server = new TestServer();
    $server->loginAsAdmin();
    $id = $server->call('POST', '/devices', '{"name":"Tablet kantine","pointId":"punt-hk"}')->body['device']['id'];

    same(null, $server->call('POST', '/devices/update', json_encode(['id' => $id, 'name' => 'Tablet hal', 'pointId' => null]))->body['device']['pointId']);
    same(['Tablet hal'], array_column($server->call('GET', '/devices')->body['devices'], 'name'));
    same(404, $server->call('POST', '/devices/update', '{"id":"bestaat-niet","name":"X","pointId":null}')->status);

    same(200, $server->call('POST', '/devices/revoke', json_encode(['id' => $id]))->status);
    same([], $server->call('GET', '/devices')->body['devices']);
    same(null, $server->call('POST', '/logout')->body['role'], 'de ingetrokken tablet is geen tablet meer');
});

test('API: de beheerder wijzigt zijn wachtwoord, alleen met het huidige wachtwoord', function (): void {
    $server = new TestServer();
    $server->loginAsAdmin();

    same(401, $server->call('POST', '/account/password', '{"current":"verkeerd-wachtwoord","new":"een-ander-lang-wachtwoord"}')->status);
    same(400, $server->call('POST', '/account/password', json_encode(['current' => TEST_PASSWORD, 'new' => 'kort']))->status);
    same(200, $server->call('POST', '/account/password', json_encode(['current' => TEST_PASSWORD, 'new' => 'een-ander-lang-wachtwoord']))->status);
    same('admin', $server->call('GET', '/session')->body['role']);
    same('ok', $server->auth->login(TEST_EMAIL, 'een-ander-lang-wachtwoord', '203.0.113.7', testMoment())['status']);
});

// ------------------------------------------------------------------
// AFAS: opslaan in de database
// ------------------------------------------------------------------

/** Een synchronisatie met nagebootste antwoorden van AFAS die opslaat in de database van de test. */
function fakeSyncRunner(array $rows, ?FakeHttpClient &$http = null): Closure
{
    return static function (RecordStore $store) use ($rows, &$http): SyncRunner {
        $http = new FakeHttpClient([afasPage($rows)]);

        return new SyncRunner(new AfasClient(fakeConfig(), $http), new EmployeeMapper(), new EmployeeSync(), new RecordEmployeeRepository($store), static function (): void {
        });
    };
}

test('AFAS opslaan: een nieuwe medewerker komt in de database, zonder looncode en met een eigen id', function (): void {
    $server = new TestServer(fakeSyncRunner([
        realRow(['Werkgever_2' => '01']),
        realRow(['Medewerker' => '5002', 'Roepnaam' => 'Mark', 'Achternaam' => 'Jansen', 'Voorvoegsel' => null, 'Werkgever_2' => '01']),
        realRow(['Medewerker' => '6001', 'Roepnaam' => 'Sanne', 'Achternaam' => 'Bakker', 'Voorvoegsel' => null, 'Werkgever_2' => '01']),
    ]));
    $server->loginAsAdmin();

    $response = $server->call('POST', '/afas/sync', '{}');
    same(200, $response->status);
    ok(str_contains($response->body['message'], '3 rijen uit AFAS, 1 toegevoegd, 1 gewijzigd'), $response->body['message']);

    $sanne = array_values(array_filter($server->store->all('employees'), static fn (stdClass $employee): bool => $employee->personnelNumber === '6001'))[0];
    same(['Sanne Bakker', 'Sanne', 'Bakker', '', '', 'bedrijf-tvb', null, true, ''], [$sanne->name, $sanne->firstName, $sanne->lastName, $sanne->payrollCode, $sanne->employerNumber, $sanne->companyId, $sanne->pointId, $sanne->active, $sanne->badgeId]);
    ok(preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $sanne->id) === 1, $sanne->id);
    ok(!str_contains($sanne->id, '6001'), 'het personeelsnummer staat in de id');
    ok(in_array($sanne->color, RecordEmployeeRepository::COLORS, true));

    // Mark was inactief en staat weer in AFAS: hij is weer actief. Lotte houdt haar looncode en pas.
    same(true, $server->store->get('employees', 'mw-mark')->active);
    $lotte = $server->store->get('employees', 'mw-lotte');
    same(['101', '04A1B2C3', '77', '#d8f1e8'], [$lotte->payrollCode, $lotte->badgeId, $lotte->employerNumber, $lotte->color]);

    $audit = $server->store->all('auditLog');
    same('Gesynchroniseerd uit AFAS', $audit[0]->action);
    foreach (['Sanne', 'Bakker', 'Mark', 'Lotte', '6001'] as $name) {
        ok(!str_contains(json_encode($audit), $name), "het logboek bevat $name");
    }
    same('3', $server->store->meta('afas_last_count'));
    ok($response->body['afas']['lastSuccessAt'] !== null);
});

test('AFAS opslaan: het antwoord aan de browser bevat geen namen, geen token en geen ruwe rijen van AFAS', function (): void {
    $http = null;
    $server = new TestServer(fakeSyncRunner([realRow(['Werkgever_2' => '01']), realRow(['Medewerker' => '6001', 'Roepnaam' => 'Sanne', 'Achternaam' => 'Bakker', 'Werkgever_2' => '55'])], $http));
    $server->loginAsAdmin();

    $response = $server->call('POST', '/afas/sync', '{}');
    $text = json_encode($response->body, JSON_THROW_ON_ERROR);

    foreach (['Sanne', 'Bakker', 'Lotte', 'Voorbeeldstraat', 'Geboortedatum', fakeToken(), 'AfasToken', 'Authorization'] as $hidden) {
        ok(!str_contains($text, $hidden), "het antwoord bevat $hidden");
    }
    ok(str_contains($text, 'Personeelsnummer 6001: werkgever 55 is niet bekend in de app'), 'de opmerking voor de beheerder ontbreekt');
    ok(str_contains($http->requests[0]['headers'][0] ?? '', 'AfasToken'), 'het token gaat alleen mee naar AFAS');
});

test('AFAS opslaan: wie niet meer in AFAS staat wordt inactief en zijn gezichtsinstelling wordt gewist', function (): void {
    $server = new TestServer(fakeSyncRunner([realRow(['Medewerker' => '9000', 'Roepnaam' => 'Nieuw', 'Achternaam' => 'Persoon', 'Voorvoegsel' => null, 'Werkgever_2' => '01'])]));
    $server->store->put('faceEnrollments', 'g-lotte', record(json_encode(['id' => 'g-lotte', 'employeeId' => 'mw-lotte', 'descriptor' => array_fill(0, 128, 0.5), 'enrolledAt' => '2026-11-01T09:00:00.000Z', 'consentAt' => '2026-11-01T09:00:00.000Z'])), testMoment());
    $server->store->put('registrations', 'reg-1', record('{"id":"reg-1","employeeId":"mw-lotte","productId":"blikje","price":0.65,"pointId":"punt-hk","createdAt":"2026-11-20T10:00:00.000Z"}'), testMoment());
    $server->loginAsAdmin();

    same(200, $server->call('POST', '/afas/sync', '{}')->status);

    $lotte = $server->store->get('employees', 'mw-lotte');
    same(false, $lotte->active);
    same('Lotte van Dijk', $lotte->name, 'de medewerker is niet verwijderd');
    same(null, $server->store->get('faceEnrollments', 'g-lotte'));
    ok($server->store->get('registrations', 'reg-1') !== null, 'de registraties blijven');
});

test('AFAS opslaan: mislukt de synchronisatie, dan verandert er niets en is de mislukking te zien', function (): void {
    $server = new TestServer(fakeSyncRunner([]));
    $server->loginAsAdmin();
    $before = $server->store->head();

    $response = $server->call('POST', '/afas/sync', '{}');
    same(502, $response->status);
    same(false, $response->body['ok']);
    ok(str_contains($response->body['message'], 'lege lijst'));
    same($before, $server->store->head());
    same(true, $server->store->get('employees', 'mw-lotte')->active);
    ok($response->body['afas']['lastFailureAt'] !== null);
    same(null, $response->body['afas']['lastSuccessAt']);
});

test('AFAS opslaan: zonder ingestelde koppeling zegt de server dat, zonder te crashen', function (): void {
    $server = new TestServer();
    $server->loginAsAdmin();

    same(503, $server->call('POST', '/afas/sync', '{}')->status);
    same(false, $server->call('GET', '/afas/status')->body['afas']['available']);
});

test('RecordEmployeeRepository: geeft de synchronisatie de medewerkers, bedrijven en punten uit de database', function (): void {
    $server = new TestServer();
    $repository = new RecordEmployeeRepository($server->store);

    same(['5001', '5002'], array_map(static fn ($employee): string => $employee->personnelNumber, $repository->employees()));
    same(['01' => 'bedrijf-tvb'], $repository->companyIdsByEmployerNumber());
    same([['id' => 'punt-hk', 'companyId' => 'bedrijf-tvb', 'name' => 'Hoofdkantoor']], $repository->points());
    same(null, $repository->lastReceivedCount());

    $repository->apply(new SyncPlan([], [], [], 12, 0), testMoment());
    same(12, $repository->lastReceivedCount());
    same([], $server->store->all('auditLog'), 'een synchronisatie zonder wijzigingen geeft geen logboekregel');
});

test('Database: de instellingen komen uit de omgeving, met SQLite in /data als standaard', function (): void {
    same('sqlite:/data/consumptie.sqlite', Database::DEFAULT_DSN);
    $pdo = Database::fromEnvironment(['CR_DB_DSN' => ' sqlite::memory: ']);
    same('sqlite', $pdo->getAttribute(PDO::ATTR_DRIVER_NAME));
    Database::migrate($pdo); // een tweede keer mag
    same(0, (new RecordStore($pdo))->head());
});

test('API: een tablet maakt een gast met alleen naam en telefoonnummer, en ziet het telefoonnummer daarna niet', function (): void {
    $server = new TestServer();
    $server->becomeTablet();

    // De tablet probeert er een looncode, bedrijf en pas bij te zetten: de server neemt alleen naam en telefoon over.
    $response = $server->call('POST', '/changes', '{"changes":[{"collection":"employees","id":"gast-1","data":{"id":"gast-1","name":"X","firstName":"Ilse","lastName":"de Wit","phone":"06 12345678","guest":true,"payrollCode":"999","personnelNumber":"1","companyId":"bedrijf-tvb","pointId":"punt-hk","badgeId":"AB12","active":true,"color":"#e3eef6"}}]}');
    same([], $response->body['rejected']);

    $stored = $server->store->get('employees', 'gast-1');
    same(['Ilse de Wit', '', '', null, null, '', true, '06 12345678', '#e3eef6'], [$stored->name, $stored->payrollCode, $stored->personnelNumber, $stored->companyId, $stored->pointId, $stored->badgeId, $stored->guest, $stored->phone, $stored->color]);
    same('', $server->pulled()['employees']['gast-1']->phone, 'de tablet ziet het telefoonnummer');

    // De gast registreert op zijn eigen naam.
    same([], $server->call('POST', '/changes', '{"changes":[{"collection":"registrations","id":"reg-gast","data":{"id":"reg-gast","employeeId":"gast-1","productId":"blikje","pointId":"punt-hk","createdAt":"2026-11-26T08:59:00.000Z"}}]}')->body['rejected']);
    ok(!property_exists($server->store->get('registrations', 'reg-gast'), 'employerNumber'), 'een gast heeft geen werkgevernummer');

    $server->loginAsAdmin();
    same('06 12345678', $server->pulled()['employees']['gast-1']->phone, 'de beheerder ziet het telefoonnummer');
});

test('API: een tablet kan geen gewone medewerker aanmaken en geen gast met een ongeldig telefoonnummer, en een gast niet wijzigen', function (): void {
    $server = new TestServer();
    $server->becomeTablet();
    $guest = static fn (string $id, array $fields): array => ['collection' => 'employees', 'id' => $id, 'data' => array_merge(['id' => $id, 'firstName' => 'Ilse', 'lastName' => 'de Wit', 'phone' => '06 12345678', 'guest' => true], $fields)];

    $response = $server->call('POST', '/changes', json_encode(['changes' => [
        $guest('mw-nieuw', ['guest' => false]),
        $guest('mw-zonder', ['guest' => null]),
        $guest('gast-kort', ['phone' => '1234']),
        $guest('gast-tekst', ['phone' => 'bel mij maar']),
        $guest('gast-leeg', ['firstName' => '']),
        $guest('gast-enter', ['lastName' => "de
Wit"]),
        $guest('mw-lotte', []),
    ]]));
    same(['mw-nieuw', 'mw-zonder', 'gast-kort', 'gast-tekst', 'gast-leeg', 'gast-enter', 'mw-lotte'], array_column($response->body['rejected'], 'id'));
    same('Lotte van Dijk', $server->store->get('employees', 'mw-lotte')->name);
});
