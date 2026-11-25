<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * SyncRunner — voert één synchronisatie met AFAS uit, van ophalen tot opslaan (stap 2 tot en met 9
 * uit het TO, paragraaf Koppeling met AFAS Profit).
 *
 * De volgorde is vast: eerst alle porties ophalen, dan omzetten en controleren, dan het plan maken en
 * pas als laatste opslaan. Gaat er onderweg iets mis (AFAS niet bereikbaar, token geweigerd, een
 * lege lijst of een fout bij het opslaan), dan verandert er niets aan de medewerkers. De fout gaat
 * naar het logboek van de server en de opslag onthoudt dat de synchronisatie is mislukt.
 *
 * Wat er in het logboek komt, bevat nooit het token en geen namen van medewerkers.
 *
 * Verbonden met:
 *   - AfasClient: haalt de rijen op;
 *   - EmployeeMapper en EmployeeSync: zetten de rijen om en maken het plan;
 *   - EmployeeRepository: levert de gegevens van de app en slaat het plan op;
 *   - de nachtelijke taak en de knop `Nu synchroniseren` van de backend: roepen `run` aan.
 */
final class SyncRunner
{
    /** @var \Closure(string): void */
    private readonly \Closure $log;

    /**
     * @param (\Closure(string): void)|null $log schrijft één regel naar het logboek van de server
     */
    public function __construct(
        private readonly AfasClient $client,
        private readonly EmployeeMapper $mapper,
        private readonly EmployeeSync $sync,
        private readonly EmployeeRepository $repository,
        ?\Closure $log = null,
        private readonly string $timeZone = 'Europe/Amsterdam'
    ) {
        $this->log = $log ?? static function (string $line): void {
            error_log($line);
        };
    }

    /**
     * Voert de synchronisatie uit. `$now` is het moment van nu. De dag van vandaag wordt bepaald in de
     * tijdzone van TVB, zodat een datum uit dienst niet een dag te vroeg of te laat ingaat.
     */
    public function run(\DateTimeImmutable $now): SyncResult
    {
        try {
            $rows = $this->client->fetchAll($this->mapper->sortField());
            $mapped = $this->mapper->map($rows);
            $plan = $this->sync->plan(
                $mapped,
                $this->repository->employees(),
                $this->repository->companyIdsByEmployerNumber(),
                $this->repository->points(),
                $now->setTimezone(new \DateTimeZone($this->timeZone))->format('Y-m-d'),
                $this->repository->lastReceivedCount()
            );
        } catch (AfasException $error) {
            return $this->fail(sprintf('AFAS-synchronisatie mislukt (%s): %s', $error->kind, $error->getMessage()), $now);
        } catch (\Throwable $error) {
            // Een onverwachte fout, bijvoorbeeld bij het lezen uit de opslag. Ook dan wijzigt er niets.
            return $this->fail(sprintf('AFAS-synchronisatie mislukt: onverwachte fout (%s). Er is niets gewijzigd.', $error::class), $now);
        }

        try {
            $this->repository->apply($plan, $now);
        } catch (\Throwable $error) {
            // De melding van de opslag kan gegevens bevatten. Alleen het soort fout gaat naar het logboek.
            return $this->fail(sprintf('AFAS-synchronisatie mislukt: opslaan is niet gelukt (%s). Er is niets gewijzigd.', $error::class), $now);
        }

        $message = 'AFAS-synchronisatie gelukt: ' . $plan->summary() . '.';
        ($this->log)($message);
        foreach ($plan->notes as $note) {
            ($this->log)('AFAS-synchronisatie: ' . $note);
        }

        return new SyncResult(true, $message, $plan);
    }

    // Schrijft de fout naar het logboek en laat de opslag onthouden dat het is mislukt.
    private function fail(string $message, \DateTimeImmutable $now): SyncResult
    {
        ($this->log)($message);
        try {
            $this->repository->recordFailure($message, $now);
        } catch (\Throwable $error) {
            ($this->log)(sprintf('AFAS-synchronisatie: de mislukte poging kon niet worden vastgelegd (%s).', $error::class));
        }

        return new SyncResult(false, $message);
    }
}
