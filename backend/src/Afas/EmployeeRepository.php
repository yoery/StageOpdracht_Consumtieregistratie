<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * EmployeeRepository — de afspraak (interface) met de opslag van de app.
 *
 * De synchronisatie leest hiermee wat er nu in de app staat en laat het plan opslaan. De echte
 * uitvoering komt bij de backend met de PostgreSQL-database (docs/DATABASE-SCHEMA.sql). Die bestaat
 * nog niet. De tests gebruiken een versie in het geheugen.
 */
interface EmployeeRepository
{
    /**
     * Alle medewerkers die nu in de app staan, actief en inactief.
     *
     * @return list<StoredEmployee>
     */
    public function employees(): array;

    /**
     * De bedrijven: werkgevernummer => id van het bedrijf.
     *
     * @return array<string, string>
     */
    public function companyIdsByEmployerNumber(): array;

    /**
     * De consumptiepunten.
     *
     * @return list<array{id: string, companyId: string, name: string}>
     */
    public function points(): array;

    /** Het aantal rijen van de vorige geslaagde synchronisatie, of null als die er nog niet was. */
    public function lastReceivedCount(): ?int;

    /**
     * Slaat alle wijzigingen van het plan op in één transactie, met regels in het logboek
     * (`audit_log`, zonder beheerder, met als details "Gesynchroniseerd uit AFAS"), en onthoudt het
     * tijdstip en het aantal rijen van deze geslaagde synchronisatie. Mislukt iets, dan wordt alles
     * teruggedraaid en volgt een fout.
     */
    public function apply(SyncPlan $plan, \DateTimeImmutable $now): void;

    /**
     * Onthoudt dat een synchronisatie is mislukt. De gegevens van medewerkers veranderen hierbij niet.
     * De beheerder ziet zo wanneer de laatste geslaagde synchronisatie was.
     */
    public function recordFailure(string $message, \DateTimeImmutable $now): void;
}
