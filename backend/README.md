# Backend: koppeling met AFAS Profit

Deze map bevat het serverdeel van de Consumptieregistratie. Nu is dat alleen de koppeling met AFAS Profit: de medewerkers ophalen uit een GetConnector van AFAS en bepalen wat er in de app moet veranderen. De naam van die GetConnector staat in de instelling `AFAS_CONNECTOR` en is nog niet vastgesteld. Het ontwerp staat in het technisch ontwerp, hoofdstuk 11, paragraaf Koppeling met AFAS Profit.

De code is PHP 8.3 of nieuwer, zonder framework en zonder extra pakketten. De classes passen later in een PHP-backend met of zonder Laravel (`composer.json` regelt het laden).

## Wat er is en wat nog niet

| Onderdeel | Status |
|---|---|
| Instellingen lezen en het token afschermen (`AfasConfig`, `EnvFile`) | Klaar |
| Medewerkers ophalen in porties met `skip` en `take`, gesorteerd op personeelsnummer (`AfasClient`) | Klaar, getest met nagebootste antwoorden |
| Metadata opvragen: welke connectors en velden er zijn (`AfasClient`, `bin/afas-metainfo.php`) | Klaar |
| Rijen controleren en omzetten naar medewerkers (`EmployeeMapper`) | Klaar |
| Bepalen wat er verandert: toevoegen, bijwerken, inactief zetten (`EmployeeSync`) | Klaar |
| Het hele verloop met foutafhandeling (`SyncRunner`) | Klaar |
| Opslaan in de database (`EmployeeRepository`) | Alleen de afspraak (interface). De database bestaat nog niet |
| De nachtelijke taak en de knop `Nu synchroniseren` | Nog niet. Die horen bij de rest van de backend |
| Testen met de testomgeving van AFAS (AC-87, AC-88 en AC-89) | Nog niet uitgevoerd |

De website in de browser gebruikt deze map niet. Het token mag nooit in de browser komen.

## Instellen

1. Kopieer `.env.example` uit de projectmap naar `.env`.
2. Vul `AFAS_TOKEN` in: het token van de App connector, al in Base64. Niet opnieuw coderen.
3. Vul `AFAS_BASE_URL` in, bijvoorbeeld `https://<deelnemernummer>.rest.afas.online/ProfitRestServices`.
4. Vul `AFAS_CONNECTOR` in zodra de naam van de GetConnector bekend is. `php backend/bin/afas-metainfo.php` toont welke connectors er zijn. Zolang de naam ontbreekt, geeft de koppeling de melding "AFAS_CONNECTOR ontbreekt" en haalt ze niets op.

Staan dezelfde namen in de omgeving van de server, dan gaan die voor het bestand. Het adres moet met `https://` beginnen en op `.afas.online` eindigen. Zo gaat het token nooit onversleuteld of naar een andere server.

## Gebruik

Vanuit de projectmap:

```text
php backend/tests/run.php          de tests (geen verbinding met AFAS)
php backend/bin/afas-metainfo.php  de connectors en de veldnamen bij AFAS opvragen (geen gegevens)
php backend/bin/afas-sync.php      proefdraaien: medewerkers ophalen en alleen aantallen tonen
```

`afas-metainfo.php` vergelijkt de velden van de GetConnector met wat de koppeling verwacht. De verwachte namen staan in `EmployeeMapper::DEFAULT_FIELDS`: Personeelsnummer, Voornaam, Achternaam, Voorvoegsel, Werkgever, Werklocatie, Looncode en DatumUitDienst. Heten de velden in AFAS anders, geef dan de juiste namen mee aan `new EmployeeMapper([...])`.

`afas-sync.php` haalt echte gegevens van medewerkers op. Gebruik daarvoor eerst de testomgeving van AFAS. Het programma toont alleen aantallen en slaat niets op.

## Veiligheid

- Het token staat alleen in `.env` of in de omgeving van de server. `.env` staat in `.gitignore` en wordt nooit gecommit. In `.env.example` staan alleen de namen van de instellingen, nooit een waarde.
- Het token komt in geen enkele foutmelding, logregel of dump van een object. De tests controleren dat.
- Zet `.env` en deze map nooit in de map die de webserver uitlevert. Op de webserver horen alleen `index.html` en `assets/`.
- Een foutmelding en het logboek noemen personeelsnummers, nooit namen. De inhoud van een antwoord van AFAS komt nooit in een foutmelding.
- De tests gebruiken een neptoken, nagebootste antwoorden en de voorbeeldnamen van de demo. Er gaat in een test nooit een verzoek naar AFAS.

## Regels van de synchronisatie

- Een lege lijst, een lijst zonder geldige rijen of een lijst die minder dan de helft is van de vorige keer, verandert niets.
- Een medewerker wordt gezocht op personeelsnummer.
- Een nieuw personeelsnummer wordt een actieve medewerker. Bestaat er bij zijn bedrijf een consumptiepunt met dezelfde naam als de werklocatie, dan krijgt hij dat punt.
- Bij een bestaande medewerker worden naam, bedrijf en looncode bijgewerkt. Het consumptiepunt blijft zoals de beheerder het heeft gekozen, behalve als de medewerker naar een ander bedrijf gaat.
- Is de datum uit dienst voorbij, of staat de medewerker niet meer in AFAS, dan wordt hij inactief. Er wordt nooit iemand verwijderd.
- Een rij die niet klopt, wordt afgekeurd met een reden. Die medewerker blijft zoals hij is.
