# Auditrapport: Consumptieregistratie TVB (security audit)

**Datum:** 26 november 2026

## Samenvatting

Na het besluit van de administratie van 25 november 2026 gaat de consumptieregistratie in gebruik, met een server, een database en tablets op meer plekken. Deze security audit kijkt naar die nieuwe situatie, met de nadruk op twee vragen: kan het token van AFAS ergens uitlekken, en kunnen personeelsgegevens uitlekken? De audit is gedaan op de code van branch `development` (commit 0b20bd4) en de oplossingen staan in commit 24297ad.

**Belangrijkste uitkomst.** Het token van AFAS lekt nergens uit. Het staat niet in de code, niet in de website, niet in de tests, niet in de container en niet in de Git-geschiedenis (gitleaks, 165 commits, geen vondsten). Alleen de server praat met AFAS, en geen enkel adres van de API geeft een antwoord van AFAS of de kopregel met het token door aan de browser.

Bij personeelsgegevens waren er vijf punten die in de code op te lossen waren. Die zijn opgelost:

1. De synchronisatie met AFAS schreef personeelsnummers in het logboek van de server (AF-01).
2. De API werkte ook zonder HTTPS, als de container toch direct bereikbaar zou zijn (AF-03).
3. Achter de proxy van Coolify blokkeerden 30 foute inlogpogingen iedereen, omdat de server het adres van de proxy telde en niet dat van de gebruiker (AF-04).
4. Apache logde het volledige adres met het vraagteken-deel, de verwijzer en de browser (AF-05).
5. De debuguitvoer van de HTTP-client stond niet expliciet uit (AF-02).

Er blijven vier risico's over die niet zonder een besluit of een actie buiten de code op te lossen zijn. Twee daarvan gaan over gegevens die iedere tablet nodig heeft om zonder server te herkennen: de kenmerken van gezichten (AF-07) en de koppeling tussen pasnummer en naam (AF-08). Het derde is het token in de instellingen van Coolify (AF-10). Het vierde is de GetConnector die meer persoonsgegevens meestuurt dan nodig (AF-11). Eén risico is bewust geaccepteerd door TVB: bij "Snellere optie instellen" wordt niet gecontroleerd of iemand echt zichzelf kiest (AF-09).

**Aantal bevindingen per ernst en status**

| Ernst | Aantal | Nummers | Opgelost | Deels opgelost | Geaccepteerd | Open (actie nodig) |
|---|---|---|---|---|---|---|
| Hoog | 0 | | | | | |
| Middel | 7 | AF-01, AF-03, AF-04, AF-07, AF-08, AF-09, AF-10 | 3 (AF-01, AF-03, AF-04) | 1 (AF-07) | 1 (AF-09) | 2 (AF-08, AF-10) |
| Laag | 6 | AF-02, AF-05, AF-06, AF-11, AF-12, AF-13 | 3 (AF-02, AF-05, AF-06) | | 2 (AF-12, AF-13) | 1 (AF-11) |

### Actielijst

| Wat | Bevinding | Wie | Status |
|---|---|---|---|
| Beslissen of het herkennen met de camera en de pas naar de server gaat, zodat tablets de kenmerken van gezichten en de pasnummers niet meer krijgen | AF-07, AF-08 | TVB | Open |
| In Coolify alleen beheerders van TVB toegang geven, en het token van een App connector gebruiken die alleen deze ene GetConnector mag lezen | AF-10 | TVB (beheer van Coolify en AFAS) | Open |
| Een GetConnector met alleen de velden die de app nodig heeft | AF-11 | TVB (AFAS-beheer) | Open, volgens TVB nu niet mogelijk |
| Na de eerste deploy de controles van de container in GitHub Actions bekijken (job `container`) | alle | Ontwikkelaar | Open |

---

## 1. Inleiding

Dit rapport beschrijft de security audit van de consumptieregistratie op 26 november 2026, na de verbouwing voor echt gebruik. Het doel is drie vragen te beantwoorden: kan het token van AFAS uitlekken, kunnen personeelsgegevens uitlekken, en is alles wat in de code op te lossen was, opgelost?

Het rapport heeft dezelfde opbouw als het pentestrapport van 2 november 2026 ([PENTESTRAPPORT.md](./PENTESTRAPPORT.md)). Dat rapport ging over de demo zonder server. Dit rapport gaat over de app met de server, de container voor Coolify en de koppeling met AFAS.

## 2. Aanpak

### 2.1 Wat is gecontroleerd

De audit volgt de negen punten uit de opdracht van 25 november 2026.

| Nr. | Controle | Hoe |
|---|---|---|
| 1 | Het token staat alleen in `.env` of in de omgeving van de server. Niet in de code, de website, de tests, de container of de logs van GitHub Actions | Zoeken in alle bestanden in Git, in `assets/` en `index.html`, in de Dockerfile en `.dockerignore`, en in de workflow. In CI bouwt de job `container` de container met een nep-`.env` en controleert dat het nepgeheim er niet in zit |
| 2 | `.env` staat in `.gitignore` en `.dockerignore`, en `.env.example` heeft geen waarden | Bestanden lezen en de test `SecretsTest.php` |
| 3 | Geen geheimen in de Git-geschiedenis | `gitleaks git --redact` over alle 165 commits, ook die met Word-bestanden (`--no-textconv`) |
| 4 | Alleen de backend praat met AFAS, en geen adres geeft ruwe antwoorden van AFAS of de kopregel met het token door | Alle adressen van `Api.php` nagelopen en tests met een nagebootste AFAS |
| 5 | Logs en foutmeldingen bevatten nooit de kopregel, het token of personeelsgegevens | Alle plekken die naar een logboek schrijven nagelopen, ook Apache en PHP |
| 6 | Alles vereist inloggen en iedere rol ziet alleen wat hij mag | `Policy.php` en `Api.php` nagelopen, tests voor de beheerder, de tablet en niemand |
| 7 | Alles loopt via HTTPS | `docker-compose.yml`, `apache.conf`, de cookies en de API |
| 8 | Afhankelijkheden zonder bekende kwetsbaarheden | `npm audit`, de pakketten in `composer.json` en de meegeleverde bibliotheek face-api |
| 9 | Tests en GitHub Actions draaien met nep-antwoorden en zonder echt token | Testcode en de workflow nagelopen |

Bij de audit is het bestand `.env` niet gelezen en is er geen verzoek naar AFAS gedaan. De tests gebruiken een neptoken en nagebootste antwoorden.

### 2.2 Wat niet is gecontroleerd

- De container is op deze computer niet gebouwd (er staat geen Docker op). De controles van de container draaien in GitHub Actions (job `container`). De uitkomst daarvan is hier niet bekeken.
- De instellingen van Coolify, de server van TVB en de App connector in AFAS zijn niet bekeken. Die vallen buiten de code.
- Er is geen aanval op een draaiende server gedaan. De API is getest met de ontwikkelserver op deze computer en een eigen database.

### 2.3 Ernstbepaling

| Ernst | Betekenis |
|---|---|
| Hoog | Het token of de gegevens van veel medewerkers kunnen uitlekken zonder bijzondere toegang |
| Middel | Gegevens kunnen uitlekken of misbruikt worden, maar alleen met toegang tot een tablet, de server of het netwerk, of de app kan voor iedereen onbruikbaar worden |
| Laag | Een kleine hoeveelheid gegevens, of alleen met veel moeite of met beheerrechten |

### 2.4 Statussen

| Status | Betekenis |
|---|---|
| Opgelost | In de code opgelost en getest |
| Deels opgelost | Het risico is kleiner gemaakt, er blijft een deel over |
| Geaccepteerd | TVB of de ontwikkelaar heeft bewust gekozen het risico te houden, met de reden erbij |
| Open | Er is een besluit of een actie buiten de code nodig |

## 3. Bevindingen

### AF-01 De synchronisatie schreef personeelsnummers in het logboek van de server

**Ernst: Middel.** Na iedere synchronisatie schreef `SyncRunner` alle opmerkingen naar het logboek van de server, zoals "Personeelsnummer 5001 is toegevoegd zonder looncode". Bij 720 medewerkers zijn dat honderden personeelsnummers in de logs van de container en van Coolify. Ook een mislukte synchronisatie ("Personeelsnummer 5001 komt twee keer voor") kwam met het nummer in het logboek.

**Status: Opgelost.** Het logboek krijgt nu alleen het aantal opmerkingen. Een mislukte poging schrijft "Een personeelsnummer" in plaats van het nummer (`SyncRunner::withoutPersonnelNumbers`). De beheerder ziet de opmerkingen zelf wel, in het tabblad `Tablets en AFAS`. Tests: `RunnerTest.php` ("het logboek van de server bevat geen personeelsnummers" en "het logboek noemt alleen het aantal opmerkingen").

### AF-02 De debuguitvoer van de HTTP-client stond niet expliciet uit

**Ernst: Laag.** `CurlHttpClient` zette `CURLOPT_VERBOSE` niet. Standaard staat die uit, maar een andere standaardinstelling of een latere wijziging zou de kopregels, en dus het token, naar het logboek kunnen schrijven.

**Status: Opgelost.** `CURLOPT_VERBOSE => false` en `CURLOPT_HEADER => false` staan er nu expliciet. Test: `ServerTest.php` ("de HTTP-client schrijft nooit debuguitvoer").

### AF-03 De API werkte ook zonder HTTPS

**Ernst: Middel.** De API accepteerde ieder verzoek, ook zonder HTTPS. Zou de container toch direct bereikbaar zijn, of de proxy verkeerd staan, dan gaan het wachtwoord van de beheerder en de cookies onversleuteld over het netwerk. De cookies krijgen dan ook geen `Secure`.

**Status: Opgelost.** De API weigert een verzoek zonder HTTPS met "Deze server werkt alleen via HTTPS.", behalve vanaf de computer zelf (`localhost`, `127.0.0.1` en `::1`, voor de tests en de controle van de container). Apache stuurt een verzoek dat via de proxy zonder HTTPS binnenkomt door naar HTTPS. Die regel staat nu in het `Directory`-blok, omdat de standaardsite van de container regels op het niveau van de server niet overneemt. `docker-compose.yml` heeft geen eigen poort, zodat de container alleen via de proxy met HTTPS bereikbaar is, en Apache zet `Strict-Transport-Security`. Tests: `ServerTest.php` ("zonder HTTPS werkt de API alleen op deze computer zelf") en in CI de controle op de doorverwijzing.

### AF-04 Achter de proxy blokkeerden 30 foute inlogpogingen iedereen

**Ernst: Middel.** Na 30 foute pogingen vanaf één adres is inloggen een kwartier geblokkeerd. Achter de proxy van Coolify is het adres van iedere verbinding dat van de proxy. Iemand kon dus met 30 foute pogingen iedereen een kwartier buitensluiten.

**Status: Opgelost.** De server neemt het laatste adres uit `X-Forwarded-For`. Dat zet de proxy zelf, en wat ervoor staat kan de afzender invullen en telt dus niet. Is het geen geldig adres, dan geldt het adres van de verbinding. Test: `ServerTest.php` ("achter de proxy telt het laatste adres in X-Forwarded-For").

### AF-05 Apache logde het vraagteken-deel van het adres, de verwijzer en de browser

**Ernst: Laag.** Het eigen, korte logformaat stond in de configuratie, maar de standaardsite van de container gebruikte nog het formaat `combined`. Daarin staan het hele adres met het vraagteken-deel, de verwijzer en de browser.

**Status: Opgelost.** De Dockerfile zet de standaardsite op het korte formaat (`%h %t "%m %U" %>s %b`, alleen het pad). In CI controleert de job `container` dat een waarde in het vraagteken-deel niet in het logboek komt.

### AF-06 Een vast nepwachtwoord in een test werd door gitleaks als geheim gemeld

**Ernst: Laag.** De browsertest met de server (`tests/e2e/server.e2e.test.js`) had een vast nepwachtwoord voor een tijdelijke testdatabase. Gitleaks meldde dat als mogelijk geheim. Het was geen echt wachtwoord. Wel ging de commit 1b7a23b toen door terwijl gitleaks iets meldde: de controle stopte het commando niet.

**Status: Opgelost.** De test maakt bij iedere run een willekeurig wachtwoord. De vondst in commit 1b7a23b staat met uitleg in `.gitleaksignore`. Sindsdien stopt het commando voor een commit als gitleaks iets vindt.

### AF-07 Iedere tablet krijgt de kenmerken van alle ingestelde gezichten

**Ernst: Middel.** Herkennen met de camera gebeurt in de browser van de tablet. Daarvoor krijgt iedere tablet van de server de kenmerken (128 getallen) van iedere medewerker met gezichtsherkenning. Dat zijn biometrische gegevens (AVG artikel 9). Wie de ontwikkelaarstools op een tablet kan openen, kan ze uitlezen.

**Status: Deels opgelost.** De kenmerken staan op een tablet alleen in het geheugen en niet meer in de opslag van de browser (commit a87f390). Een tablet moet gekoppeld zijn door de beheerder. Een volledige oplossing is herkennen op de server: de tablet stuurt dan alleen de kenmerken van het gezicht voor de camera, en de server zoekt wie het is. Dat is een grotere verbouwing van de herkenning. **Besluit nodig van TVB** of dit vóór 16 december moet. Tot dan: de tablets in kioskmodus zetten, zodat de ontwikkelaarstools niet open kunnen.

### AF-08 Iedere tablet heeft de koppeling tussen pasnummer en naam van alle medewerkers

**Ernst: Middel.** Herkennen met de pas gebeurt ook op de tablet. Daarvoor heeft iedere tablet het pasnummer en de naam van iedere medewerker met een pas, ook in de opslag van de browser (om zonder verbinding te kunnen herkennen). Een pasnummer is openbaar: iedere telefoon met NFC kan het van de pas lezen. Met de lijst van een tablet weet iemand welk nummer bij wie hoort, en kan hij met een gekopieerd nummer op naam van een collega registreren.

**Status: Open.** Op te lossen door het pasnummer op de server op te zoeken in plaats van op de tablet. Dan werkt herkennen met de pas niet meer zonder verbinding. **Besluit nodig van TVB:** zonder verbinding met de pas kunnen registreren, of de koppeling niet meer op de tablets. Het blijft ook dan mogelijk een pas te kopiëren: dat is een eigenschap van passen die alleen een nummer hebben.

### AF-09 Snellere optie instellen controleert niet wie er voor de tablet staat

**Ernst: Middel.** Na zichzelf opzoeken kan iemand een gezicht of pas koppelen. Iemand kan daarbij ook de naam van een collega kiezen en daarna op diens naam registreren. Via de API kan een tablet ook het gezicht van een collega uitzetten.

**Status: Geaccepteerd door TVB (26 november 2026).** Op de vraag hoe dit te controleren is (personeelsnummer laten intypen, de beheerder laten goedkeuren of geen controle), koos TVB voor geen controle. Iedere koppeling komt in het logboek met de naam ("Pas gekoppeld door medewerker", "Gezichtsherkenning ingesteld"), en de beheerder kan haar terugdraaien. Een medewerker die op zijn loonstrook een onbekende consumptie ziet, kan dat melden.

### AF-10 Het token staat in de instellingen van Coolify

**Ernst: Middel.** Op de server staat het token als Environment Variable in Coolify. Iedereen met beheerrechten op Coolify kan het daar lezen, en op de server is het te zien met `docker inspect`. Het token geeft toegang tot alle velden van de GetConnector, met adres, geboortedatum en foto van alle medewerkers.

**Status: Open, actie buiten de code.** Alleen beheerders van TVB horen toegang te hebben tot Coolify en tot de server. Gebruik het token van een App connector die alleen deze ene GetConnector mag lezen. Lekt het token toch uit, vraag dan een nieuw token aan in AFAS en vervang het in Coolify.

### AF-11 De GetConnector stuurt meer persoonsgegevens mee dan nodig

**Ernst: Laag.** De GetConnector die TVB nu heeft, bevat ook adres, geboortedatum, geslacht, telefoonnummer, e-mailadres en een foto. De koppeling leest die velden niet en bewaart ze niet, maar AFAS stuurt ze bij iedere synchronisatie mee naar de server.

**Status: Open, actie buiten de code.** Een eigen GetConnector met alleen de velden die de app nodig heeft. Volgens TVB is de huidige connector alles wat de app mag krijgen. De koppeling blijft daarom alleen de nodige velden lezen.

### AF-12 Vijf foute pogingen sluiten de beheerder een kwartier buiten

**Ernst: Laag.** Na vijf foute pogingen voor één e-mailadres is inloggen met dat adres een kwartier geblokkeerd. Iemand die het e-mailadres van de beheerder kent, kan hem zo buitensluiten.

**Status: Geaccepteerd.** Dit is de gebruikelijke afweging tegen het raden van een wachtwoord. Een tablet blijft werken, want die logt niet in met het wachtwoord.

### AF-13 De pagina zelf is zonder inloggen te laden

**Ernst: Laag.** `index.html`, de code van de website en de opmaak zijn zonder inloggen te laden. Zonder sessie toont de pagina alleen het inlogscherm.

**Status: Geaccepteerd.** De pagina en de code bevatten geen gegevens en geen geheimen. Alle gegevens komen van de API, en ieder adres van de API behalve `/api/health` vereist een sessie van de beheerder of een gekoppelde tablet. `/api/health` geeft alleen `{"ok":true}`.

## 4. Wat goed is

- **Het token.** Staat alleen in `.env` (in `.gitignore` en `.dockerignore`) of in de omgeving van de server. In het geheugen zit het in een afgeschermde plek van `AfasConfig`, het staat niet in een dump van het object, niet in een foutmelding en niet in een logboek. De Dockerfile kopieert alleen wat nodig is, nooit "alles". Tests controleren dit (`SecretsTest.php`, `ConfigTest.php`).
- **De Git-geschiedenis.** Gitleaks vond in alle 165 commits geen geheim (met de uitleg in `.gitleaksignore` voor AF-06).
- **Alleen de server praat met AFAS.** De website heeft geen enkele verwijzing naar AFAS. `/api/afas/sync` geeft alleen een melding, opmerkingen en het resultaat terug, nooit rijen van AFAS of de kopregel.
- **Rollen.** Een tablet krijgt geen looncodes, personeelsnummers, werkgevernummers, telefoonnummers van gasten en het logboek niet. Een tablet kan alleen registreren, een gast aanmaken, een pas koppelen aan iemand zonder pas en een gezicht instellen. De prijs, het werkgevernummer en de voorraad bepaalt de server zelf.
- **Inloggen.** Alleen een hash van het wachtwoord (Argon2id), sessies met een willekeurige sleutel waarvan alleen de hash in de database staat, cookies met `HttpOnly` en `SameSite=Strict`, en bij ieder schrijvend verzoek een controle op de eigen website (`Origin`, een eigen kopregel en een tweede sleutel).
- **Foutmeldingen.** Een fout op de server geeft de browser alleen "Er ging iets mis op de server." en het logboek alleen het soort fout en de plek in de code. PHP toont geen fouten in de browser en geen waarden van argumenten (`zend.exception_ignore_args`).
- **Afhankelijkheden.** Geen npm-pakketten en geen Composer-pakketten in de app. De meegeleverde face-api is versie 1.7.15, de nieuwste. `npm audit` op die versie vindt 0 kwetsbaarheden.
- **Tests en CI.** Alle tests gebruiken een neptoken en nagebootste antwoorden. In GitHub Actions staan geen geheimen. De workflow mag de code alleen lezen en de actions staan vast op een commit.

## 5. Oplossingen en tests

| Bevinding | Oplossing | Commit | Tests |
|---|---|---|---|
| AF-01 | Alleen het aantal opmerkingen in het logboek, en "Een personeelsnummer" in plaats van het nummer | 24297ad | `RunnerTest.php` (2) |
| AF-02 | `CURLOPT_VERBOSE` en `CURLOPT_HEADER` expliciet uit | 24297ad | `ServerTest.php` (1) |
| AF-03 | De API weigert verzoeken zonder HTTPS, Apache stuurt door | 24297ad | `ServerTest.php` (2), CI |
| AF-04 | Laatste adres uit `X-Forwarded-For` | 24297ad | `ServerTest.php` (1) |
| AF-05 | Kort logformaat voor de standaardsite | 24297ad | CI |
| AF-06 | Willekeurig wachtwoord in de test, `.gitleaksignore` | c3c9d39 | gitleaks |
| AF-07 | Kenmerken van gezichten niet in de opslag van de browser | a87f390 | `server-sync.test.js` (1) |

### 5.1 Hertest

| Wat | Uitkomst |
|---|---|
| Tests van de backend (`php backend/tests/run.php`) | 158 geslaagd |
| Unit tests (`npm test`) | 972 geslaagd |
| Browsertests (`npm run test:e2e`), waarvan 8 met de echte server | 41 geslaagd |
| Gitleaks over de hele geschiedenis | 165 commits, geen vondsten |
| `npm audit` op face-api 1.7.15 | 0 kwetsbaarheden |
| Controles van de container in GitHub Actions | Niet bekeken (zie 2.2) |

## 6. Aanbevelingen

1. Beslis vóór 16 december 2026 over AF-07 en AF-08: herkennen op de server, of de kenmerken en de pasnummers op de tablets houden met kioskmodus.
2. Zet de tablets in kioskmodus, zodat de ontwikkelaarstools en de adresbalk niet bereikbaar zijn.
3. Beperk de toegang tot Coolify en de server tot de beheerders van TVB (AF-10).
4. Deploy regelmatig opnieuw, zodat de container de nieuwste versie van PHP 8.3 en Apache krijgt.
5. Herhaal deze audit en de gitleaks-scan na iedere grote wijziging, en vóór de beoordeling op 16 december 2026.

## 7. Bronnen

Europese Unie. (2016). *Verordening (EU) 2016/679 (Algemene verordening gegevensbescherming)*. https://eur-lex.europa.eu/eli/reg/2016/679/oj

Gitleaks. (z.d.). *Gitleaks*. Geraadpleegd op 26 november 2026, van https://github.com/gitleaks/gitleaks

OWASP Foundation. (z.d.). *Logging Cheat Sheet*. Geraadpleegd op 26 november 2026, van https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
