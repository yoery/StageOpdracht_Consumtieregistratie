# Backend: de server en de koppeling met AFAS Profit

Deze map bevat het serverdeel van de Consumptieregistratie. Sinds versie 3.33 (26 november 2026) zijn dat twee delen:

- **De server** (`src/Server/`): de API onder `/api` en de database, zodat alle tablets dezelfde gegevens hebben en de beheerder een echte login heeft (zie De server hieronder).
- **De koppeling met AFAS Profit** (`src/Afas/`): de medewerkers ophalen uit een GetConnector van AFAS en bepalen wat er in de app moet veranderen. De naam van die GetConnector staat in de instelling `AFAS_CONNECTOR`.

Het ontwerp staat in het technisch ontwerp, hoofdstuk 6 (de server) en hoofdstuk 11, paragraaf Koppeling met AFAS Profit. De security audit van 26 november 2026 staat in `docs/AUDITRAPPORT.md`.

De code is PHP 8.3 of nieuwer, zonder framework en zonder extra pakketten. De classes passen later in een PHP-backend met of zonder Laravel (`composer.json` regelt het laden).

## Wat er is en wat nog niet

| Onderdeel | Status |
|---|---|
| Instellingen lezen en het token afschermen (`AfasConfig`, `EnvFile`) | Klaar |
| Medewerkers ophalen in porties met `skip` en `take`, gesorteerd op personeelsnummer (`AfasClient`) | Klaar, getest met nagebootste antwoorden |
| Metadata opvragen: welke connectors en velden er zijn (`AfasClient`, `bin/afas-metainfo.php`) | Klaar |
| Rijen controleren en omzetten naar medewerkers (`EmployeeMapper`) | Klaar |
| Bepalen wat er verandert: toevoegen, bijwerken, inactief zetten, nieuwe bedrijven (`EmployeeSync`) | Klaar. Sinds 27 november 2026 ook één rij per personeelsnummer en nieuwe werkgevers als bedrijf |
| Het hele verloop met foutafhandeling (`SyncRunner`) | Klaar |
| Opslaan in de database (`RecordEmployeeRepository`) | Klaar, in de database van de server |
| De server: inloggen, tablets, wie wat mag, de API en de database (`src/Server/`) | Klaar (versie 3.33) |
| De knop `Nu synchroniseren` (`POST /api/afas/sync`) | Klaar |
| De nachtelijke taak | Nog niet |
| Testen met de testomgeving van AFAS (AC-87, AC-88 en AC-89) | Nog niet uitgevoerd |

Zonder server (de demo) gebruikt de website deze map niet. Met de server praat de website alleen met de API. Het token van AFAS komt nooit in de browser.

## De server (sinds versie 3.33)

| Bestand | Taak |
|---|---|
| `public/index.php` | Het enige bestand dat de webserver uitvoert. Alle verzoeken aan `/api` komen hier binnen. De rest van de map staat buiten de map die de webserver uitlevert |
| `dev-server.php` | De ontwikkelserver voor een eigen computer: `php -S 127.0.0.1:8080 backend/dev-server.php` levert `index.html`, `assets/` en `/api` uit, nooit `.env`, de tests of de documenten. `start-lokaal.cmd` in de projectmap start hem |
| `bin/beheerder.php` | Een beheerder aanmaken (`php backend/bin/beheerder.php <e-mailadres>`), of met `--reset` een nieuw wachtwoord zetten. Het programma vraagt om een wachtwoord van minstens 12 tekens |
| `src/Server/Database.php` en `RecordStore.php` | De database (standaard SQLite in `/data/consumptie.sqlite`) en de gegevens als JSON per regel in de tabel `records` |
| `src/Server/Auth.php` | Inloggen, sessies in een cookie (HttpOnly, SameSite=Strict, via HTTPS ook Secure), gekoppelde tablets en de blokkade na foute pogingen |
| `src/Server/Policy.php` | Wat een tablet mag lezen en schrijven. Een tablet krijgt geen looncodes, personeelsnummers, afwijkende werkgevernummers, telefoonnummers, afdelingen en pasnummers. Kenmerken van gezichten krijgt geen enkele browser |
| `src/Server/Recognition.php` | Herkennen op de server (sinds versie 3.34): het gezicht zoeken bij de kenmerken die een tablet stuurt (afstand onder 0,5, niet ouder dan een jaar, alleen actieve medewerkers), de medewerker bij een pasnummer zoeken en een pas koppelen. Hooguit 240 verzoeken per minuut per sessie |
| `src/Server/Api.php`, `Request.php` en `Response.php` | De API: `/health`, `/session`, `/login`, `/logout`, `/account/password`, `/changes`, `/recognize/face`, `/recognize/badge`, `/badge/link`, `/devices` en `/afas/status` en `/afas/sync` |
| `src/Server/RecordEmployeeRepository.php` | Slaat de uitkomst van de synchronisatie met AFAS op in de database |

De instellingen van de server komen uit de omgeving (in Coolify: Environment Variables):

- `CR_DB_DSN`, `CR_DB_GEBRUIKER` en `CR_DB_WACHTWOORD`: de database. Zonder `CR_DB_DSN` is het SQLite in `/data`. Op een eigen computer zet `start-lokaal.cmd` de database in `backend/data/` (in `.gitignore`).
- `CR_BEHEER_EMAIL` en `CR_BEHEER_WACHTWOORD`: de eerste beheerder. De container maakt die bij het starten aan als hij nog niet bestaat. In Coolify heet het wachtwoord `SERVICE_PASSWORD_BEHEER` (Coolify verzint het zelf).
- `AFAS_TOKEN`, `AFAS_BASE_URL` en `AFAS_CONNECTOR`: de koppeling met AFAS (zie Instellen).

Een lege server krijgt bij de eerste beheerder alleen de standaardproducten. De bedrijven komen uit AFAS (zie Regels van de synchronisatie). Hoe je de server op de server van TVB zet, staat in `docs/DOCUMENTATIE.md`, paragraaf 3.2.

## Instellen

1. Kopieer `.env.example` uit de projectmap naar `.env`.
2. Vul `AFAS_TOKEN` in: het token van de App connector, al in Base64. Niet opnieuw coderen.
3. Vul `AFAS_BASE_URL` in, bijvoorbeeld `https://<deelnemernummer>.rest.afas.online/ProfitRestServices`.
4. Vul `AFAS_CONNECTOR` in met de naam van de GetConnector. `php backend/bin/afas-metainfo.php` toont welke connectors er zijn. Zolang de naam ontbreekt, geeft de koppeling de melding "AFAS_CONNECTOR ontbreekt" en haalt ze niets op.
5. Voor de server op een eigen computer: zet `CR_DB_DSN` zoals in `start-lokaal.cmd`, maak een beheerder met `php backend/bin/beheerder.php <e-mailadres>` en start `start-lokaal.cmd`. De instellingen `CR_*` horen niet in `.env` maar in de omgeving (zie De server hierboven).

Staan dezelfde namen in de omgeving van de server, dan gaan die voor het bestand. Het adres moet met `https://` beginnen, bij AFAS horen (`.afas.online`) en eindigen op `/ProfitRestServices`, zonder iets erachter. Zo gaat het token nooit onversleuteld of naar een andere server, en kan een opvraag van de metadata nooit per ongeluk de gegevens van een connector ophalen. De naam van de connector hoort alleen in `AFAS_CONNECTOR`.

## Certificaten

De koppeling controleert altijd het certificaat van de AFAS-server. Op Linux gebruikt PHP daarvoor de certificaten van het systeem. Op Windows kent PHP die niet allemaal. Meldt een hulpprogramma "unable to get local issuer certificate", geef PHP dan de lijst met vertrouwde hoofdcertificaten van Mozilla:

1. Download `cacert.pem` van https://curl.se/ca/cacert.pem en controleer het controlegetal (https://curl.se/ca/cacert.pem.sha256).
2. Zet het bestand in de map van PHP, bijvoorbeeld `extras/ssl/cacert.pem`.
3. Zet in `php.ini` de regels `curl.cainfo` en `openssl.cafile` aan, met het pad naar dat bestand.

Zet de controle van het certificaat nooit uit. `afas-metainfo.php` toont bij deze fout welke certificaten de server meestuurt.

## Gebruik

Vanuit de projectmap:

```text
php backend/tests/run.php          de tests (geen verbinding met AFAS)
php backend/bin/afas-metainfo.php  de connectors en de veldnamen bij AFAS opvragen (geen gegevens)
php backend/bin/afas-sync.php      proefdraaien: medewerkers ophalen en alleen aantallen tonen
php backend/bin/beheerder.php <e-mailadres>          een beheerder aanmaken (met --reset: een nieuw wachtwoord)
php -S 127.0.0.1:8080 backend/dev-server.php    de website met de server op een eigen computer
```

`afas-metainfo.php` vergelijkt de velden van de GetConnector met wat de koppeling verwacht. De verwachte namen staan in `EmployeeMapper::DEFAULT_FIELDS` en horen bij de GetConnector die TVB nu heeft. De koppeling leest acht velden:

- `Medewerker` (het personeelsnummer), `Roepnaam` (de voornaam), `Achternaam` en `Voorvoegsel`.
- `Werkgever_2`: het werkgevernummer, twee cijfers met een voorloopnul zoals "01". Vul in de app bij een bedrijf dat je zelf aanmaakt het werkgevernummer in zoals AFAS het geeft: "01" is een ander nummer dan "1".
- `Organisatorische_Eenheid`: de afdeling. De beheerder koppelt iedere afdeling aan een consumptiepunt (FR-102). Het veld voor de werklocatie in `DEFAULT_FIELDS` leest dit veld.
- `Werkgever`: de naam van de werkgever. Alleen gebruikt om een nieuw bedrijf te maken voor een werkgever die de app nog niet kent.
- `Datum_in_dienst`: alleen gebruikt om te kiezen welke rij telt als een personeelsnummer vaker voorkomt.

De naam van de werkgever en de datum in dienst zijn hulpgegevens: klopt er een niet, dan telt hij als leeg en wordt de rij niet afgekeurd. De looncode en de datum uit dienst zitten niet in de GetConnector en komen er ook niet in: TVB mocht ze niet krijgen. Ze staan uit. De looncode vult de beheerder in de app in of importeert hij uit een bestand van de loonadministratie (FR-101). Wie niet meer in de lijst van de GetConnector staat, wordt inactief. Heten de velden later anders, geef dan de namen mee, bijvoorbeeld `new EmployeeMapper(['employerName' => 'Naam_werkgever'])`.

De huidige GetConnector bevat ook adres, geboortedatum, telefoon, e-mail en een foto. De koppeling leest die velden niet, maar AFAS stuurt ze wel mee. Voor echt gebruik is daarom een eigen GetConnector nodig met alleen de acht velden hierboven (dataminimalisatie). Volgens TVB is dat nu niet mogelijk (zie `docs/AUDITRAPPORT.md`, AF-11).

`afas-sync.php` haalt echte gegevens van medewerkers op. Gebruik daarvoor eerst de testomgeving van AFAS. Het programma toont alleen aantallen en slaat niets op: het aantal rijen, de redenen waarom rijen zijn afgekeurd en de vorm van de velden. Komt een personeelsnummer meer dan één keer voor, dan staat erbij hoeveel nummers dat zijn en in welke velden die rijen verschillen. Met `--werkgevers` komen de waarden van de velden over het bedrijf erbij. Waarden van andere velden worden nooit getoond.

## Veiligheid

- Het token staat alleen in `.env` (op een eigen computer) of in de omgeving van de server. `.env` staat in `.gitignore` en `.dockerignore` en wordt nooit gecommit of in de container gezet. In `.env.example` staan alleen de namen van de instellingen, nooit een waarde.
- Het token komt in geen enkele foutmelding, logregel of dump van een object. De HTTP-client zet debuguitvoer uit (AF-02). De tests controleren dat.
- Van deze map voert de webserver alleen `public/index.php` uit. De rest van de map, `.env` en de database staan nooit in de map die de webserver uitlevert.
- De API werkt alleen via HTTPS, behalve op de computer zelf (AF-03). Achter de proxy van Coolify telt voor de blokkade na foute inlogpogingen het adres van de gebruiker (AF-04).
- Het logboek van de server noemt geen personeelsnummers en geen namen: van de opmerkingen van de synchronisatie staat er alleen het aantal (AF-01). De beheerder ziet de opmerkingen in het beheer. De inhoud van een antwoord van AFAS komt nooit in een foutmelding.
- De tests gebruiken een neptoken, nagebootste antwoorden, een tijdelijke database en de voorbeeldnamen van de demo. Er gaat in een test nooit een verzoek naar AFAS.

## Regels van de synchronisatie

- Een lege lijst, een lijst zonder geldige rijen of een lijst die minder dan de helft is van de vorige keer, verandert niets.
- Een medewerker wordt gezocht op personeelsnummer. AFAS geeft één rij per dienstverband of functie, dus een personeelsnummer kan vaker voorkomen (bij de proefdraai van 27 november 2026: 72 nummers in 165 rijen, hoogstens 6 per nummer). Dan telt de rij met de laatste `Datum_in_dienst`. Bij een gelijke datum telt het laagste werkgevernummer en daarna de eerste afdeling op alfabet, zodat de keuze iedere keer dezelfde is. Verschilt de werkgever tussen de rijen, dan krijgt de beheerder een opmerking (niet in het logboek van de server). Met een afwijkend werkgevernummer bij de medewerker zet hij het voor de export anders. De synchronisatie stopt hier niet op.
- Een werkgever die de app nog niet kent, wordt een nieuw bedrijf met de naam (`Werkgever`) en het nummer (`Werkgever_2`) uit AFAS, met een opmerking. De id is vast (`afas-werkgever-<nummer>`), zodat er geen tweede komt. Past de beheerder dat bedrijf aan, dan blijft het zoals hij het zette. Een nieuwe server krijgt daarom niet de 13 bedrijven van de demo (zonder werkgevernummer), alleen de standaardproducten.
- Een nieuw personeelsnummer wordt een actieve medewerker, zonder looncode (de beheerder vult die in of importeert hem). Hij krijgt het consumptiepunt van zijn afdeling: een punt van zijn bedrijf waaraan de beheerder die afdeling heeft gekoppeld (FR-102), anders een punt van zijn bedrijf met dezelfde naam als de afdeling. Anders kiest de beheerder het punt.
- Bij een bestaande medewerker worden naam, bedrijf en afdeling bijgewerkt. De looncode uit de app blijft staan. Het consumptiepunt blijft zoals de beheerder het heeft gekozen. Heeft hij nog geen punt, dan krijgt hij het punt van zijn afdeling. Gaat hij naar een ander bedrijf, dan volgt het punt van zijn afdeling (of geen punt).
- Staat de medewerker niet meer in de lijst van AFAS, dan wordt hij inactief. Komt hij terug, dan wordt hij weer actief. Er wordt nooit iemand verwijderd en de registraties blijven.
- Een rij die niet klopt, wordt afgekeurd met een reden. Die medewerker blijft zoals hij is.
