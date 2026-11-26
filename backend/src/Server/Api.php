<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

use Tvb\Consumptie\Afas\AfasException;
use Tvb\Consumptie\Afas\SyncRunner;

/**
 * Api — beantwoordt de verzoeken van de website. Dit is de enige plek waar de browser gegevens van
 * de server krijgt.
 *
 * De adressen (allemaal onder /api):
 *   GET  /health            leeft de server? Geeft geen gegevens. Het enige adres zonder inloggen;
 *   GET  /session           wie ben ik: beheerder, gekoppelde tablet of niemand;
 *   POST /login             inloggen als beheerder;
 *   POST /logout            uitloggen;
 *   POST /account/password  het eigen wachtwoord wijzigen;
 *   GET  /changes?since=N   wat er sinds volgnummer N is veranderd;
 *   POST /changes           wijzigingen opslaan;
 *   GET  /devices           de gekoppelde tablets (beheerder);
 *   POST /devices           deze browser koppelen als tablet (beheerder);
 *   POST /devices/update    naam en locatie van een tablet wijzigen (beheerder);
 *   POST /devices/revoke    een tablet intrekken (beheerder);
 *   GET  /afas/status       de uitkomst van de laatste synchronisatie (beheerder);
 *   POST /afas/sync         nu synchroniseren met AFAS (beheerder).
 *
 * Beveiliging:
 *   - zonder geldige sessie krijgt een verzoek alleen "niet ingelogd" (401);
 *   - ieder schrijvend verzoek moet van de eigen website komen: de kopregel `Origin` moet bij de
 *     server horen, de kopregel `X-CR-Client` moet er zijn en de sleutel van de sessie (`csrf`) moet
 *     kloppen;
 *   - wat een rol mag lezen en schrijven, bepaalt Policy;
 *   - een fout van de server geeft nooit de inhoud van de fout aan de browser. Het AFAS-token en de
 *     antwoorden van AFAS gaan nooit naar de browser: `/afas/sync` geeft alleen aantallen en
 *     opmerkingen met personeelsnummers terug.
 */
final class Api
{
    public const COOKIE_ADMIN = 'cr_beheer';
    public const COOKIE_DEVICE = 'cr_tablet';

    public const MAX_CHANGES = 5000;

    private readonly Auth $auth;
    private readonly RecordStore $store;
    private readonly Policy $policy;

    /** @var (\Closure(RecordStore): SyncRunner)|null */
    private readonly ?\Closure $syncRunner;

    /** @var \Closure(string): void */
    private readonly \Closure $log;

    /**
     * @param (\Closure(RecordStore): SyncRunner)|null $syncRunner maakt de synchronisatie met AFAS.
     *        Zonder deze functie is synchroniseren niet beschikbaar
     * @param (\Closure(string): void)|null $log schrijft één regel naar het logboek van de server
     */
    public function __construct(\PDO $pdo, ?\Closure $syncRunner = null, ?\Closure $log = null)
    {
        $this->auth = new Auth($pdo);
        $this->store = new RecordStore($pdo);
        $this->policy = new Policy($this->store);
        $this->syncRunner = $syncRunner;
        $this->log = $log ?? static function (string $line): void {
            error_log($line);
        };
    }

    public function handle(Request $request, ?\DateTimeImmutable $now = null): Response
    {
        $now ??= new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        try {
            return $this->route($request, $now);
        } catch (\Throwable $error) {
            // Alleen het soort fout en de plek in het logboek: de melding kan gegevens bevatten.
            ($this->log)(sprintf('API-fout bij %s %s: %s (%s:%d)', $request->method, $request->path, $error::class, basename($error->getFile()), $error->getLine()));

            return Response::error(500, 'Er ging iets mis op de server.');
        }
    }

    private function route(Request $request, \DateTimeImmutable $now): Response
    {
        $key = $request->method . ' ' . $request->path;
        if ($key === 'GET /health') {
            return Response::ok();
        }
        if (!in_array($request->method, ['GET', 'POST'], true)) {
            return Response::error(405, 'Deze methode wordt niet ondersteund.');
        }

        $admin = $this->auth->session($request->cookies[self::COOKIE_ADMIN] ?? null, Auth::KIND_ADMIN, $now);
        $device = $this->auth->session($request->cookies[self::COOKIE_DEVICE] ?? null, Auth::KIND_DEVICE, $now);
        $role = $admin !== null ? Policy::ROLE_ADMIN : ($device !== null ? Policy::ROLE_DEVICE : null);

        if ($request->method === 'POST') {
            if (!$this->fromOwnSite($request)) {
                return Response::error(403, 'Dit verzoek komt niet van de website zelf.');
            }
            if ($key !== 'POST /login') {
                $session = $admin ?? $device;
                if ($session === null) {
                    return Response::error(401, 'Niet ingelogd.');
                }
                if (!hash_equals($session['csrf'], (string) ($request->headers['x-csrf-token'] ?? ''))) {
                    return Response::error(403, 'De sessie klopt niet meer. Herlaad de pagina.');
                }
            }
        }

        if ($key === 'GET /session') {
            return $this->sessionInfo($admin, $device, $now);
        }
        if ($key === 'POST /login') {
            return $this->login($request, $device, $now);
        }
        if ($role === null) {
            return Response::error(401, 'Niet ingelogd.');
        }

        return match ($key) {
            'POST /logout' => $this->logout($request, $admin, $device, $now),
            'GET /changes' => $this->changes($request, $role, $now),
            'POST /changes' => $this->saveChanges($request, $role, $now, $admin === null ? ($device['subjectId'] ?? null) : null),
            default => $admin === null ? Response::error(403, 'Alleen voor de beheerder.') : $this->adminRoute($key, $request, $admin, $now),
        };
    }

    /** @param array{kind: string, subjectId: string, csrf: string} $admin */
    private function adminRoute(string $key, Request $request, array $admin, \DateTimeImmutable $now): Response
    {
        return match ($key) {
            'POST /account/password' => $this->changePassword($request, $admin, $now),
            'GET /devices' => Response::ok(['devices' => $this->auth->devices()]),
            'POST /devices' => $this->linkDevice($request, $now),
            'POST /devices/update' => $this->updateDevice($request),
            'POST /devices/revoke' => $this->revokeDevice($request, $now),
            'GET /afas/status' => Response::ok(['afas' => $this->afasStatus()]),
            'POST /afas/sync' => $this->afasSync($now),
            default => Response::error(404, 'Dit adres bestaat niet.'),
        };
    }

    // ------------------------------------------------------------------
    // Inloggen
    // ------------------------------------------------------------------

    /**
     * @param array{kind: string, subjectId: string, csrf: string}|null $admin
     * @param array{kind: string, subjectId: string, csrf: string}|null $device
     */
    private function sessionInfo(?array $admin, ?array $device, \DateTimeImmutable $now): Response
    {
        $session = $admin ?? $device;

        return Response::ok([
            'role' => $admin !== null ? Policy::ROLE_ADMIN : ($device !== null ? Policy::ROLE_DEVICE : null),
            'csrf' => $session['csrf'] ?? null,
            'email' => $admin !== null ? $this->auth->adminEmail($admin['subjectId']) : null,
            'device' => $device !== null ? $this->auth->device($device['subjectId']) : null,
            'configured' => $this->auth->adminCount() > 0,
            'serverTime' => $now->format('Y-m-d\TH:i:s\Z'),
        ]);
    }

    /** @param array{kind: string, subjectId: string, csrf: string}|null $device */
    private function login(Request $request, ?array $device, \DateTimeImmutable $now): Response
    {
        $email = $request->body->email ?? null;
        $password = $request->body->password ?? null;
        if (!is_string($email) || !is_string($password) || $email === '' || $password === '') {
            return Response::error(400, 'Vul het e-mailadres en het wachtwoord in.');
        }

        $result = $this->auth->login($email, $password, $request->address, $now);
        if ($result['status'] === 'blocked') {
            ($this->log)('Inloggen geblokkeerd: te veel mislukte pogingen.');

            return Response::error(429, 'Te veel mislukte pogingen. Probeer het over een kwartier opnieuw.');
        }
        if ($result['status'] !== 'ok') {
            return Response::error(401, 'Het e-mailadres of het wachtwoord klopt niet.');
        }

        return Response::ok([
            'role' => Policy::ROLE_ADMIN,
            'csrf' => $result['csrf'],
            'email' => $result['email'],
            'device' => $device !== null ? $this->auth->device($device['subjectId']) : null,
        ])->withCookie(self::COOKIE_ADMIN, $result['token'], Auth::ADMIN_MAX_SECONDS);
    }

    /**
     * Uitloggen beëindigt de sessie van de beheerder. Een gekoppelde tablet blijft gekoppeld: daarna
     * is de browser weer alleen een tablet.
     *
     * @param array{kind: string, subjectId: string, csrf: string}|null $admin
     * @param array{kind: string, subjectId: string, csrf: string}|null $device
     */
    private function logout(Request $request, ?array $admin, ?array $device, \DateTimeImmutable $now): Response
    {
        if ($admin !== null) {
            $this->auth->endSession($request->cookies[self::COOKIE_ADMIN] ?? null);
        }

        return Response::ok([
            'role' => $device !== null ? Policy::ROLE_DEVICE : null,
            'csrf' => $device['csrf'] ?? null,
            'device' => $device !== null ? $this->auth->device($device['subjectId']) : null,
        ])->withoutCookie(self::COOKIE_ADMIN);
    }

    /** @param array{kind: string, subjectId: string, csrf: string} $admin */
    private function changePassword(Request $request, array $admin, \DateTimeImmutable $now): Response
    {
        $current = $request->body->current ?? null;
        $new = $request->body->new ?? null;
        $email = $this->auth->adminEmail($admin['subjectId']);
        if (!is_string($current) || !is_string($new) || $email === null) {
            return Response::error(400, 'Vul het huidige en het nieuwe wachtwoord in.');
        }
        // Het huidige wachtwoord wordt gecontroleerd met dezelfde regels als inloggen (ook de blokkade).
        $check = $this->auth->login($email, $current, $request->address, $now);
        if ($check['status'] !== 'ok') {
            return Response::error($check['status'] === 'blocked' ? 429 : 401, 'Het huidige wachtwoord klopt niet.');
        }
        $problem = $this->auth->setPassword($email, $new);
        if ($problem !== null) {
            $this->auth->endSession($check['token']);

            return Response::error(400, $problem);
        }

        // Alle oude sessies zijn beëindigd. De beheerder gaat verder met een nieuwe.
        $fresh = $this->auth->login($email, $new, $request->address, $now);
        if ($fresh['status'] !== 'ok') {
            return Response::ok(['role' => null])->withoutCookie(self::COOKIE_ADMIN);
        }

        return Response::ok(['role' => Policy::ROLE_ADMIN, 'csrf' => $fresh['csrf']])->withCookie(self::COOKIE_ADMIN, $fresh['token'], Auth::ADMIN_MAX_SECONDS);
    }

    // ------------------------------------------------------------------
    // Gegevens uitwisselen
    // ------------------------------------------------------------------

    private function changes(Request $request, string $role, \DateTimeImmutable $now): Response
    {
        $since = (int) ($request->query['since'] ?? '0');
        // Het volgnummer eerst: komt er tijdens het lezen iets bij, dan haalt de tablet dat de volgende keer op.
        $head = $this->store->head();
        $changes = [];
        foreach ($this->store->changesSince($since, $this->policy->readable($role)) as $change) {
            $data = $change['data'] === null ? null : $this->policy->visible($role, $change['collection'], $change['data'], $now);
            if ($data === false) {
                continue;
            }
            $changes[] = ['collection' => $change['collection'], 'id' => $change['id'], 'data' => $data];
        }

        return Response::ok(['version' => $head, 'changes' => $changes]);
    }

    private function saveChanges(Request $request, string $role, \DateTimeImmutable $now, ?string $deviceId): Response
    {
        $changes = $request->body->changes ?? null;
        if (!is_array($changes) || count($changes) > self::MAX_CHANGES) {
            return Response::error(400, 'De wijzigingen zijn niet te lezen.');
        }

        $rejected = [];
        $saved = 0;
        $this->store->transaction(function () use ($changes, $role, $now, $deviceId, &$rejected, &$saved): void {
            foreach ($changes as $change) {
                $collection = $change->collection ?? null;
                $id = $change->id ?? null;
                $incoming = $change->data ?? null;
                if (!$change instanceof \stdClass || !is_string($collection) || !is_string($id) || ($incoming !== null && !$incoming instanceof \stdClass)) {
                    $rejected[] = ['collection' => is_string($collection) ? $collection : '', 'id' => is_string($id) ? $id : ''];
                    continue;
                }
                $accepted = $this->policy->accept($role, $collection, $id, $incoming, $deviceId);
                if ($accepted === false) {
                    $rejected[] = ['collection' => $collection, 'id' => $id];
                    continue;
                }
                try {
                    if ($accepted === null) {
                        $this->store->delete($collection, $id, $now);
                    } elseif ($accepted !== true) {
                        $this->store->put($collection, $id, $accepted, $now);
                        if ($role === Policy::ROLE_DEVICE && $collection === 'registrations') {
                            $this->policy->registrationStored($accepted, $now);
                        }
                    }
                    $saved++;
                } catch (\InvalidArgumentException | \JsonException) {
                    $rejected[] = ['collection' => $collection, 'id' => $id];
                }
            }
        });
        if ($rejected !== []) {
            ($this->log)(sprintf('Wijzigingen geweigerd voor rol %s: %d van %d.', $role, count($rejected), count($changes)));
        }

        return Response::ok(['version' => $this->store->head(), 'saved' => $saved, 'rejected' => $rejected]);
    }

    // ------------------------------------------------------------------
    // Tablets
    // ------------------------------------------------------------------

    private function linkDevice(Request $request, \DateTimeImmutable $now): Response
    {
        [$name, $pointId, $problem] = $this->deviceInput($request);
        if ($problem !== null) {
            return Response::error(400, $problem);
        }
        // Was deze browser al een tablet, dan vervalt de oude koppeling.
        $old = $this->auth->session($request->cookies[self::COOKIE_DEVICE] ?? null, Auth::KIND_DEVICE, $now);
        if ($old !== null) {
            $this->auth->revokeDevice($old['subjectId'], $now);
        }
        $device = $this->auth->createDevice($name, $pointId, $now);

        return Response::ok(['device' => $this->auth->device($device['id'])])->withCookie(self::COOKIE_DEVICE, $device['token'], Auth::DEVICE_MAX_SECONDS);
    }

    private function updateDevice(Request $request): Response
    {
        $id = $request->body->id ?? null;
        [$name, $pointId, $problem] = $this->deviceInput($request);
        if ($problem !== null || !RecordStore::isSafeId($id)) {
            return Response::error(400, $problem ?? 'Onbekende tablet.');
        }

        return $this->auth->updateDevice($id, $name, $pointId)
            ? Response::ok(['device' => $this->auth->device($id)])
            : Response::error(404, 'Deze tablet is niet (meer) gekoppeld.');
    }

    private function revokeDevice(Request $request, \DateTimeImmutable $now): Response
    {
        $id = $request->body->id ?? null;
        if (!RecordStore::isSafeId($id) || !$this->auth->revokeDevice($id, $now)) {
            return Response::error(404, 'Deze tablet is niet (meer) gekoppeld.');
        }

        return Response::ok();
    }

    /**
     * De naam en de locatie (het consumptiepunt) van een tablet uit het verzoek, met de reden als het
     * niet klopt.
     *
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function deviceInput(Request $request): array
    {
        $name = $request->body->name ?? null;
        $pointId = $request->body->pointId ?? null;
        if (!is_string($name) || trim($name) === '' || strlen($name) > 100 || preg_match('/[\x00-\x1F\x7F]/', $name) === 1) {
            return ['', null, 'Geef de tablet een naam van hooguit 100 tekens.'];
        }
        if ($pointId !== null && (!RecordStore::isSafeId($pointId) || $this->store->get('points', $pointId) === null)) {
            return ['', null, 'Dit consumptiepunt bestaat niet (meer).'];
        }

        return [trim($name), $pointId, null];
    }

    // ------------------------------------------------------------------
    // AFAS
    // ------------------------------------------------------------------

    /** @return array{lastSuccessAt: string|null, lastFailureAt: string|null, lastMessage: string|null, available: bool} */
    private function afasStatus(): array
    {
        return [
            'lastSuccessAt' => $this->store->meta('afas_last_success_at'),
            'lastFailureAt' => $this->store->meta('afas_last_failure_at'),
            'lastMessage' => $this->store->meta('afas_last_message'),
            'available' => $this->syncRunner !== null,
        ];
    }

    private function afasSync(\DateTimeImmutable $now): Response
    {
        if ($this->syncRunner === null) {
            return Response::error(503, 'De koppeling met AFAS is op deze server niet ingesteld.');
        }
        try {
            $runner = ($this->syncRunner)($this->store);
        } catch (AfasException $error) {
            // De instellingen kloppen niet (bijvoorbeeld AFAS_CONNECTOR ontbreekt). De melding noemt nooit het token.
            return Response::error(503, $error->getMessage());
        }
        $result = $runner->run($now);

        return new Response($result->ok ? 200 : 502, [
            'ok' => $result->ok,
            'message' => $result->message,
            'notes' => $result->plan?->notes ?? [],
            'version' => $this->store->head(),
            'afas' => $this->afasStatus(),
        ]);
    }

    // ------------------------------------------------------------------
    // Hulpfuncties
    // ------------------------------------------------------------------

    // Komt dit schrijvende verzoek van de eigen website? De browser zet `Origin` zelf en een andere
    // website kan de kopregel `X-CR-Client` niet meesturen zonder toestemming van deze server.
    private function fromOwnSite(Request $request): bool
    {
        if (($request->headers['x-cr-client'] ?? '') !== '1') {
            return false;
        }
        $origin = $request->headers['origin'] ?? '';
        if ($origin === '') {
            return false;
        }
        $host = parse_url($origin, PHP_URL_HOST);
        $port = parse_url($origin, PHP_URL_PORT);
        $originHost = strtolower((string) $host) . ($port === null || $port === false ? '' : ':' . $port);

        return $request->host !== '' && $originHost === $request->host;
    }
}
