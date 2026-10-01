# Technisch Ontwerp - Blikjesregistratie TVB

**Versie:** 3.1
**Datum:** 1 oktober 2026
**Status:** frontend-demo met productieschema voor PostgreSQL

Dit document is het enige ontwerpdocument van het project. Het bevat zowel de functionele kant (aanleiding, gebruikersrollen, eisen, use cases, wireframes en acceptatiecriteria) als de technische uitwerking (architectuur, database, interfaces, beveiliging en tests). Het eerdere functioneel ontwerp is hierin opgenomen.

## 1. Inleiding

### Doel van het systeem

Met dit systeem registreren medewerkers wat ze eten en drinken, zoals blikjes en cateringproducten. De beheerder beheert registraties, medewerkers, producten, bedrijven, consumptiepunten en voorraad, en maakt een vaste CSV-export voor de loonadministratie. Het CSV-bestand kan in Excel worden geopend.

### Aanleiding van het project

Eerst werden de blikjes op papier bijgehouden. Dat kostte tijd. Ook konden formulieren onduidelijk zijn of verkeerd worden overgenomen. Daarom is een digitale oplossing gemaakt.

### Scope van het project

In deze demo zitten de volgende onderdelen:

- medewerkers bekijken, zoeken en per bedrijf filteren;
- producten kiezen met `+`- en `−`-knoppen (of met "Zelfde als vorige keer") en in één keer registreren;
- de demo gezichtsherkenning, vrijwillig en uit te zetten;
- datum en tijd automatisch opslaan;
- inloggen als beheerder;
- registraties corrigeren;
- medewerkers toevoegen, wijzigen en actief of inactief zetten;
- producten en prijzen beheren;
- bedrijven en consumptiepunten beheren en per punt het aanbod instellen;
- voorraad per consumptiepunt bijhouden en zien wat bijbesteld moet worden;
- wijzigingen bijhouden in een logboek;
- registraties filteren;
- gegevens exporteren naar CSV voor de loonadministratie;
- gegevens opslaan in de browser met `localStorage`.

De demo heeft nog geen echte gedeelde database en geen echte beveiligde login. Het volledige referentieschema voor productie staat in [`DATABASE-SCHEMA.sql`](./DATABASE-SCHEMA.sql). Een backend/API moet de browseropslag vervangen, en beheerders moeten met gehashte wachtwoorden worden opgeslagen.

## 2. Huidige en gewenste situatie

### Huidige situatie

- De registratie gebeurt op papier.
- Elke week wordt een nieuw formulier gebruikt.
- De administratie moet alles handmatig verwerken.
- Dit kost extra tijd.
- Handgeschreven tekst kan moeilijk te lezen zijn.
- Er kunnen fouten ontstaan bij het overnemen.
- Oude gegevens zijn niet makkelijk terug te vinden.
- Er is geen overzicht van de voorraad per consumptiepunt.

### Gewenste situatie

- Medewerkers registreren hun consumpties op de website.
- Met de zoekbalk en het bedrijfsfilter vinden zij snel hun naam.
- Een medewerker ziet alleen de producten van het eigen consumptiepunt.
- De registratie wordt meteen opgeslagen.
- Een beheerder kan fouten herstellen.
- De beheerder ziet per consumptiepunt wat er bijbesteld moet worden.
- De gegevens kunnen naar een CSV-bestand voor de loonadministratie worden geëxporteerd.
- Ook cateringproducten zoals melk, beleg en brood kunnen worden geregistreerd.

## 3. Gebruikersrollen en autorisatie

### Medewerker

Een medewerker kan:

- de lijst met actieve medewerkers bekijken, gegroepeerd per bedrijf;
- zoeken op voornaam en achternaam en filteren op bedrijf;
- de eigen medewerkerkaart openen en producten kiezen met `+`- en `−`-knoppen, of met `Zelfde als vorige keer`;
- de gekozen producten met één knop registreren;
- vrijwillig de demo gezichtsherkenning aanzetten en zich daarna met de camera laten herkennen.

Een medewerker ziet alleen de producten van het eigen consumptiepunt, ziet geen persoonlijke aantallen of kosten, en kan zelf geen registratie verwijderen.

### Beheerder

Een beheerder kan:

- inloggen en uitloggen;
- alle registraties bekijken en filteren op medewerker en maand;
- registraties corrigeren;
- medewerkers toevoegen, wijzigen, actief of inactief zetten en verwijderen;
- productsoorten en prijzen beheren;
- bedrijven en consumptiepunten beheren en per punt het aanbod instellen;
- de voorraad per consumptiepunt bijhouden en zien wat bijbesteld moet worden;
- een logboek van wijzigingen bekijken;
- een CSV-bestand maken.

### Systeembeheerder (productie)

In productie beheert een systeembeheerder de rollen en instellingen. Deze rol bestaat nog niet in de demo.

## 4. Functionele eisen (FR)

| ID | Eis |
|---|---|
| FR-01 | Het systeem toont alle actieve medewerkers. |
| FR-02 | De gebruiker kan zoeken op voornaam en achternaam. |
| FR-03 | De gebruiker kiest producten met `+`-knoppen; iedere gekozen eenheid wordt één registratie. |
| FR-04 | Een medewerker kan zelf geen registratie verlagen. |
| FR-05 | Een nieuwe registratie wordt meteen opgeslagen. |
| FR-06 | De beheerder ziet per medewerker het aantal registraties en het totaalbedrag. |
| FR-07 | De datum wordt automatisch opgeslagen. |
| FR-08 | Het tijdstip wordt automatisch opgeslagen. |
| FR-09 | Een beheerder kan inloggen. |
| FR-10 | Een beheerder kan alle registraties bekijken. |
| FR-11 | Een beheerder kan filteren op medewerker. |
| FR-12 | Een beheerder kan filteren op maand. |
| FR-13 | Een beheerder kan een registratie toevoegen. |
| FR-14 | Een beheerder kan de laatste registratie van een product verwijderen. |
| FR-15 | Een beheerder kan een medewerker toevoegen. |
| FR-16 | Een beheerder kan een medewerker verwijderen. |
| FR-17 | Oude registraties blijven bestaan na het verwijderen van een medewerker. |
| FR-18 | Een beheerder kan een `.csv`-bestand exporteren dat in Excel kan worden geopend. |
| FR-19 | De export bevat de medewerker, het aantal, de prijs en de loonmaand. |
| FR-20 | De export bevat totalen per medewerker. |
| FR-21 | De export bevat geen totaalregel, zodat iedere regel een medewerker is en de loonadministratie het bestand direct kan inlezen. |
| FR-22 | De prijs per blikje is standaard €0,65. |
| FR-23 | De beheerder kan looncode, personeelsnummer en een eventueel afwijkend werkgevernummer per medewerker, en het standaard werkgevernummer per bedrijf beheren. |
| FR-24 | De beheerder kan productsoorten en prijzen beheren. |
| FR-25 | De standaardproducten zijn blikje, sneetje brood, boter, zoet beleg, glas melk, beleg, ei en yoghurt. |
| FR-26 | Sneetje brood en boter kosten €0,10, zoet beleg en glas melk kosten €0,20, beleg, ei en yoghurt kosten €0,50. |
| FR-27 | Het systeem houdt een logboek bij van administratieve wijzigingen. |
| FR-28 | De CSV-export gebruikt de kolomvolgorde Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs. |
| FR-29 | Medewerkers zien geen persoonlijk aantal of persoonlijk totaalbedrag. |
| FR-30 | Consumpties worden verwerkt in de loonadministratie van de daaropvolgende maand. Jaar en Maand in de export zijn daarom de loonmaand: consumpties uit september staan bij oktober, consumpties uit december bij januari van het volgende jaar. |
| FR-31 | Het systeem groepeert medewerkers per bedrijf en biedt een filter om één bedrijf te bekijken. |
| FR-32 | Een medewerker kan op de eigen medewerkerkaart klikken en een product kiezen. |
| FR-33 | De beheerder kan bedrijven toevoegen en de naam en het werkgevernummer wijzigen. Standaard zijn de 13 bedrijven van TVB aanwezig. |
| FR-34 | Een bedrijf kan geen, één of meerdere consumptiepunten hebben. De beheerder kan consumptiepunten toevoegen, wijzigen en verwijderen. |
| FR-35 | De beheerder stelt per consumptiepunt in welke producten worden aangeboden (aan/uit per product). |
| FR-36 | Een nieuw product staat bij alle consumptiepunten uit, totdat de beheerder het aanzet. |
| FR-37 | Iedere medewerker is gekoppeld aan een bedrijf en een vast consumptiepunt, en ziet alleen de producten die dat punt aanbiedt. |
| FR-38 | Het systeem houdt per consumptiepunt de voorraad per product bij. Iedere registratie verlaagt de voorraad met 1; een correctie van de beheerder zet het product terug. |
| FR-39 | De beheerder kan leveringen boeken, de getelde voorraad invullen en per product een minimum instellen. |
| FR-40 | Het systeem toont een bijbestellijst met alle aangeboden producten die op zijn of op of onder het minimum zitten. |
| FR-41 | Het werkgevernummer staat standaard bij het bedrijf. Bij een medewerker kan een afwijkend werkgevernummer worden ingevuld (bijvoorbeeld per teamleider); dat gaat in de CSV-export voor op het nummer van het bedrijf. |
| FR-42 | De website heeft een licht en een donker thema. In het donkere thema blijven de huiskleuren behouden; de achtergrond wordt donker en de tekst krijgt de groene huiskleur. |
| FR-43 | Standaard volgt het thema de instelling van het apparaat ("Systeem"). |
| FR-44 | Met een slider in de bovenbalk kan de gebruiker zelf licht of donker kiezen. |
| FR-45 | Met de keuze "Auto" is het thema overdag licht en na zonsondergang donker, volgens de tijden van zonsopkomst en zonsondergang in Nederland per maand. |
| FR-46 | De gekozen thema-instelling wordt per browser onthouden. |
| FR-47 | In het productvenster kan de gebruiker per product met `−` en `+` het aantal kiezen; `−` gaat niet onder 0. De knop `Registreren` toont het totaal aantal gekozen producten. |
| FR-48 | Na het registreren toont het systeem een melding met de naam van de medewerker en de geregistreerde producten, bijvoorbeeld "Lotte van Dijk: 2× Blikje, 1× Ei geregistreerd", met een vinkje. |
| FR-49 | Het productvenster begroet de medewerker persoonlijk en passend bij het tijdstip, bijvoorbeeld "Goedemorgen Lotte, welkom terug." |
| FR-50 | Het systeem toont wat de medewerker de vorige keer koos ("Vorige keer koos je 1× Blikje en 1× Ei.") en zet met één knop dezelfde keuze klaar. De medewerker bevestigt zelf met `Registreren`. Producten die het consumptiepunt niet meer aanbiedt, vallen weg. |
| FR-51 | Demo gezichtsherkenning (uit te schakelen): een medewerker kan vrijwillig zijn of haar gezicht instellen en daarna met de camera van de tablet of laptop worden herkend, waarna het eigen productvenster opent. Er wordt niets opgeslagen of verstuurd (zie 13, Privacy). |

## 5. Niet-functionele eisen (NFR)

| Eis | Uitleg | Doel |
|---|---|---|
| Gebruiksgemak | Een medewerker moet zonder uitleg kunnen registreren | Binnen 5 seconden |
| Performance | De pagina moet snel laden | Binnen 2 seconden |
| Browser | De website werkt in moderne browsers | Recente Edge, Chrome en Firefox |
| Responsive | De website werkt op computer, tablet en telefoon | Alle normale schermen |
| Toegankelijkheid | Knoppen hebben duidelijke namen en labels en werken met het toetsenbord | Alle knoppen |
| Foutmeldingen | Bij een opslagfout krijgt de gebruiker een duidelijke melding | Altijd |
| Gegevensbehoud | Oude registraties mogen niet verdwijnen | Ook na vertrek medewerker |
| Beschikbaarheid | De website moet tijdens werktijd werken | 99% in productie |
| Beveiliging | Alleen beheerders mogen beheren | Controle op de server |
| Onderhoudbaarheid | Onderdelen zijn gescheiden | Classes met eigen taak |
| Herstelbaarheid | Gegevens moeten teruggezet kunnen worden | Back-ups in productie |

In de demo blijven gegevens alleen in dezelfde browser bewaard.

## 6. Systeemarchitectuur

### Huidige demo

```text
Gebruiker
    ↓
Webbrowser
    ↓
HTML, CSS en JavaScript
    ↓
DataStore
    ↓
localStorage
    ↓
CSV-export
```

### Mogelijke productieversie

```text
Gebruiker
    ↓
Webbrowser
    ↓
Webapplicatie
    ↓
Backend en API
    ↓
Gedeelde SQL-database
    ↓
CSV-export
```

### Opbouw van de JavaScript

De JavaScript is objectgeoriënteerd opgebouwd volgens het MVC-patroon, met vijf classes:

- `DataStore` (opslag) regelt het opslaan en ophalen van gegevens en zet oude gegevens om.
- `RegistrationModel` (model) bevat de gegevens en de regels van de applicatie, inclusief voorraad en loonmaand.
- `RegistrationView` (view) zet de gegevens op het scherm en verandert zelf niets.
- `RegistrationApp` (controller) verwerkt klikken, formulieren en andere acties en stuurt het model, de view en de export aan.
- `CsvExport` maakt de CSV-export voor de loonadministratie.

Een zesde class, `ThemeManager`, regelt het lichte en donkere thema. Die staat los van de andere classes, omdat het thema een weergave-instelling per browser is en geen gegeven van de registratie. Een zevende class, `FaceRecognitionDemo`, is de uitschakelbare demo gezichtsherkenning; de controller krijgt die mee in de constructor. De bibliotheek face-api wordt alleen geladen als iemand de demo gebruikt.

Daarnaast zijn er drie bestanden zonder class: `main.js` maakt de objecten aan en koppelt ze aan elkaar, `config.js` bevat vaste waarden zoals de standaardproducten, de bedrijven, de tijden van zonsopkomst en zonsondergang en de instellingen van de demo gezichtsherkenning (`FACE_DEMO`), en `icons.js` bevat de SVG-iconen.

```text
DataStore ──► RegistrationModel ──► RegistrationView
                     │                     │
                     ├──► CsvExport        │
                     ▼                     ▼
               RegistrationApp (controller)
```

Toegepaste OOP-principes: encapsulatie (gegevens alleen via getters en methodes van het model), één verantwoordelijkheid per class, compositie (de controller krijgt model, view en export mee in de constructor) en losse koppeling (de view kent de controller niet; de opslag is vervangbaar). Bovenaan ieder bestand staat in een comment waarvoor de class is en met welke classes hij verbonden is.

Door deze verdeling blijft de code overzichtelijk. Later kan bijvoorbeeld `localStorage` worden vervangen door een database zonder alles opnieuw te maken.

## 7. Technologiestack

### Gebruikte technieken in de demo

- **HTML5:** voor de structuur van de pagina.
- **CSS3:** voor kleuren, layout en responsive design.
- **JavaScript (ES-modules):** voor de werking van de website.
- **OOP:** de JavaScript is verdeeld in classes.
- **localStorage:** tijdelijke opslag in de browser.
- **CSV-export:** gemaakt met eigen JavaScript, zonder externe bibliotheek.
- **Node.js test runner:** voor de unit tests, automatisch uitgevoerd via GitHub Actions.

### Mogelijke technieken voor productie

De backend en database zijn nog niet gekozen. Mogelijke keuzes zijn:

- PHP, .NET of Node.js voor de backend;
- SQL Server, PostgreSQL of MySQL voor de database;
- een interne server of Azure voor de hosting.

De definitieve keuze moet samen met de IT-afdeling van TVB worden gemaakt.

## 8. Databaseontwerp

### Opslag in de huidige demo

De demo bewaart een JSON-object in `localStorage`:

```js
{
  companies: [
    { id: "unieke-id", name: "IT Supervision", employerNumber: "1234" }
  ],
  points: [
    {
      id: "unieke-id",
      name: "Kantine begane grond",
      companyId: "id-van-bedrijf",
      products: {
        blikje: { offered: true, stock: 24, minimum: 6 },
        ei: { offered: false, stock: 0, minimum: 0 }
      }
    }
  ],
  employees: [
    {
      id: "unieke-id",
      name: "Voorbeeld Naam",
      companyId: "id-van-bedrijf",
      pointId: "id-van-consumptiepunt",
      color: "#d8f1e8"
    }
  ],
  registrations: [
    {
      id: "unieke-id",
      employeeId: "id-van-medewerker",
      productId: "blikje",
      pointId: "id-van-consumptiepunt",
      createdAt: "2026-09-07T08:00:00.000Z"
    }
  ]
}
```

Elke gekozen eenheid wordt één registratie. Daarom is het aantal in de demo altijd `1`.

### Bedrijven, consumptiepunten en voorraad

- Een **bedrijf** heeft een naam en een standaard werkgevernummer. Een medewerker kan een afwijkend werkgevernummer hebben (bijvoorbeeld per teamleider); `employerNumberFor` gebruikt dat nummer als het is ingevuld, en anders dat van het bedrijf.
- Een bedrijf heeft geen, één of meerdere **consumptiepunten**. Per punt staat per product of het wordt aangeboden (`offered`), de voorraad (`stock`) en het minimum (`minimum`).
- Een **medewerker** is gekoppeld aan een bedrijf en een vast consumptiepunt, en ziet alleen de producten die dat punt aanbiedt.
- Een **registratie** onthoudt het consumptiepunt (`pointId`). De voorraad daar gaat 1 omlaag; bij een correctie gaat het product naar datzelfde punt terug, ook als de medewerker inmiddels bij een ander punt hoort.
- Een nieuw product krijgt bij ieder punt `offered: false`. Een verwijderd product verdwijnt uit alle voorraadlijsten.
- Status per product: `Op` bij voorraad 0 of lager, `Bijbestellen` bij voorraad op of onder het minimum, anders `Op voorraad`.

### Tabel Medewerkers

| Veld | Type | Uitleg |
|---|---|---|
| `MedewerkerID` | Integer of UUID | Uniek nummer van de medewerker |
| `Voornaam` | Tekst | Voornaam van de medewerker |
| `Achternaam` | Tekst | Achternaam van de medewerker |
| `Actief` | Boolean | Geeft aan of de medewerker nog actief is |
| `Looncode` | Tekst | Looncode voor de CSV-export |
| `Personeelsnummer` | Tekst | Nummer van de medewerker |
| `BedrijfID` | Integer of UUID | Bedrijf waar de medewerker werkt (het standaard werkgevernummer staat bij het bedrijf) |
| `Werkgevernummer` | Tekst | Optioneel afwijkend werkgevernummer; leeg = dat van het bedrijf |
| `ConsumptiepuntID` | Integer of UUID | Vast consumptiepunt van de medewerker |

### Tabel Registraties

| Veld | Type | Uitleg |
|---|---|---|
| `RegistratieID` | Integer of UUID | Uniek nummer van de registratie |
| `MedewerkerID` | Integer of UUID | Koppeling met de medewerker |
| `DatumTijd` | DateTime | Datum en tijd van de registratie |
| `Aantal` | Integer | Aantal, standaard `1` |
| `ProductID` | Integer of UUID | Geregistreerd product |
| `ConsumptiepuntID` | Integer of UUID | Punt waar de voorraad van af ging |

### Tabel Producten

| Veld | Type | Uitleg |
|---|---|---|
| `ProductID` | Integer of UUID | Uniek nummer van het product |
| `Naam` | Tekst | Bijvoorbeeld blikje, melk, beleg of brood |
| `Prijs` | Decimal | Prijs per product |

De standaardprijzen zijn: blikje €0,65, sneetje brood €0,10, boter €0,10, zoet beleg €0,20, glas melk €0,20, beleg €0,50, ei €0,50 en yoghurt €0,50.

### Extra tabel voor adminacties

Voor een echte versie is een tabel `AdminLog` handig. Hierin kan worden opgeslagen wie een wijziging heeft gedaan en wanneer dit gebeurde.

| Veld | Type | Uitleg |
|---|---|---|
| `LogID` | Integer of UUID | Uniek nummer van de logregel |
| `AdminID` | Integer of UUID | Nummer van de beheerder |
| `Actie` | Tekst | Bijvoorbeeld toevoegen of corrigeren |
| `MedewerkerID` | Integer of UUID | Betrokken medewerker |
| `DatumTijd` | DateTime | Moment van de actie |
| `Details` | Tekst | Extra uitleg over de actie |

### Productieschema

Het volledige PostgreSQL-schema staat in [`DATABASE-SCHEMA.sql`](./DATABASE-SCHEMA.sql). Het schema bevat:

- `companies` voor bedrijven en werkgeversnummers;
- `consumption_points` voor de consumptiepunten per bedrijf;
- `point_products` voor aanbod, voorraad en minimum per consumptiepunt per product;
- `stock_alerts` als databaseview voor alles wat bijbesteld moet worden;
- `employees` voor actieve en inactieve medewerkers, met bedrijf en vast consumptiepunt;
- `products` voor producten en prijzen;
- `admins` voor beheerders en rollen;
- `registrations` voor iedere consumptieregistratie met datum, tijd en aantal;
- `audit_log` voor administratieve wijzigingen;
- `monthly_employee_consumption` als databaseview voor maandtotalen.

Registraties worden niet fysiek verwijderd bij normale correcties. Een correctie verwijdert alleen de betreffende registratie via de backend en schrijft altijd een regel naar `audit_log`. Medewerkers, bedrijven en producten worden bij voorkeur gedeactiveerd in plaats van verwijderd, zodat oude registraties aan de juiste medewerker gekoppeld blijven.

Gebruik voor `password_hash` een sterk wachtwoordalgoritme zoals Argon2id of bcrypt. Sla nooit een wachtwoord zelf op. Gebruik in de backend parameterized queries, transacties rond correcties en een databasegebruiker met alleen de benodigde rechten.

## 9. Schermontwerpen en wireframes

### Medewerkersscherm

Op dit scherm staan:

- een knop `Herken mij met de camera (demo)`, een zoekveld (sneltoets Ctrl K) en een bedrijfsfilter;
- de actieve medewerkers, gegroepeerd per bedrijf, met naam en avatar;
- het totaal van vandaag en van deze maand (voor alle medewerkers samen);
- na een klik op een medewerker: een productvenster met een begroeting, alleen de producten van het eigen consumptiepunt, per product een `−`- en `+`-knop (44 × 44 pixels, geschikt voor een aanraakscherm) en een knop `Registreren (aantal)`;
- bij een medewerker die eerder heeft geregistreerd: een voorstel `Zelfde als vorige keer`;
- een melding na het opslaan.

Een medewerker ziet geen persoonlijke aantallen of kosten. De `−`-knop in het productvenster verlaagt alleen de keuze die nog niet is opgeslagen; een opgeslagen registratie verlagen kan alleen de beheerder.

### Admin-login

Het loginvenster bevat:

- een e-mailadres;
- een wachtwoord;
- een knop om in te loggen;
- een melding bij lege invoer;
- een sluitknop.

In de demo werkt ieder ingevuld wachtwoord. Dit is alleen voor demonstratie en is niet veilig voor productie.

### Beheerscherm

Het beheerscherm heeft zes tabbladen:

- **Registraties:** alle registraties bekijken, filteren op medewerker en maand, correcties met `+` en `−`, en CSV exporteren;
- **Medewerkers:** medewerkers toevoegen, wijzigen, aan een bedrijf en consumptiepunt koppelen, activeren, deactiveren en verwijderen;
- **Producten:** producten en prijzen beheren;
- **Bedrijven:** bedrijven en consumptiepunten beheren en per punt het aanbod aan- of uitzetten;
- **Voorraad:** de bijbestellijst, de voorraad per consumptiepunt, leveringen boeken en minimums instellen;
- **Logboek:** alle administratieve wijzigingen.

### Licht en donker thema

Rechtsboven in de bovenbalk staat een slider (met een zon- en een maanicoon) met daarnaast de knoppen `Systeem` en `Auto`:

- `Systeem` (standaard) volgt de instelling van het apparaat;
- de slider kiest vast licht of donker;
- `Auto` is overdag licht en na zonsondergang donker.

Technisch: alle kleuren staan als CSS-variabelen in `:root` (licht) en `:root[data-theme="dark"]` (donker). De class `ThemeManager` zet `data-theme` op het `<html>`-element en bewaart de keuze in `localStorage` onder `tvb-theme`. De tijden van zonsopkomst en zonsondergang staan per maand in `config.js` (`DAYLIGHT_HOURS`), een benadering voor Nederland; iedere minuut wordt gecontroleerd of het thema moet wisselen. Een klein script in de `<head>` zet het donkere thema al vóór het tekenen, zodat de pagina niet eerst wit oplicht. In het donkere thema blijven de huiskleuren behouden en krijgt de tekst een iets lichtere tint van het huisgroen (`#1fbf8c`), zodat hij goed leesbaar is.

### Mobiele weergave

Op een klein scherm komen de onderdelen onder elkaar te staan. Hierdoor blijven de knoppen en teksten goed leesbaar op een telefoon. In de bovenbalk vervallen dan de statustekst, de icoontjes naast de slider en (op telefoons) de naam naast het logo, zodat de thema-knoppen en de admin-knop blijven passen.

De pagina is altijd minstens schermhoog, met de footer onderaan. Staat er weinig op het scherm (bijvoorbeeld op een staande tablet bij het consumptiepunt, of na zoeken op één naam), dan rekt de medewerkerskaart mee tot boven de footer in plaats van dat er onder de footer een leeg vlak ontstaat. Staat er meer op dan past, dan scrollt de pagina zoals normaal.

Bovenbalk, inhoud en footer gebruiken dezelfde paginabreedte en zijmarge (CSS-variabelen `--page-width` en `--gutter`), zodat de randen op ieder scherm gelijk lopen. Op tablets en telefoons (tot 1100 pixels breed) zijn de kleine teksten groter gemaakt, zodat ze op armlengte leesbaar zijn; op een groot scherm blijven de oorspronkelijke maten staan.

Knoppen en medewerkerrijen reageren kort bij indrukken (ze worden heel even iets kleiner), vensters openen met een zachte fade en tabbladen faden in. Alle effecten duren hooguit een kwart seconde. Wie op het apparaat "minder beweging" heeft ingesteld, krijgt geen animaties.

### Van schets naar website: drie niveaus

Een wireframe kan op drie niveaus worden uitgewerkt:

| Niveau | Wat het laat zien | Waar in dit document |
|---|---|---|
| Low-fidelity | Alleen de indeling: vlakken, kaders, knoppen en waar tekst komt. Geen kleuren en (bijna) geen tekst. | [Low-fidelity wireframes](#low-fidelity-wireframes) |
| Mid-fidelity | De indeling met de echte teksten, labels en volgorde, in grijstinten en met één lettertype. Nog zonder huisstijl. | [Mid-fidelity wireframes](#mid-fidelity-wireframes) |
| High-fidelity | Het eindontwerp met de kleuren, lettertypes, iconen en afbeeldingen van TVB. | [Wireframes](#wireframes) (de screenshots van de website) |

**Hoe de low- en mid-fidelity wireframes zijn gemaakt.** Aan het begin van het project zijn de twee schetsen hieronder gemaakt ("Eerste schets" en "Eerste uitwerking"). De website is daarna flink veranderd, dus die schetsen laten niet meer zien hoe de website nu is. Daarom zijn de low- en mid-fidelity wireframes in dit hoofdstuk opnieuw gemaakt **vanuit de huidige website**, zodat ze precies overeenkomen met de echte schermen. Dat is gedaan op 1 oktober 2026 met Microsoft Edge zonder venster (headless), met dezelfde demogegevens als de high-fidelity screenshots (ingevoerd via de website zelf). Een klein script verandert alleen de weergave van de pagina; de indeling, de plaats en de grootte van alles blijven gelijk:

- **Low-fidelity:** alle kleuren en schaduwen zijn weg, ieder vlak, kaart, knop en invoerveld is een zwart kader op wit. Koppen, knoppen, tabbladen, labels van velden en kolomkoppen houden hun tekst; alle andere tekst is een grijze balk. Iconen zijn kleine grijze blokjes en afbeeldingen en het camerabeeld zijn een kader met een kruis.
- **Mid-fidelity:** de pagina staat in grijstinten, alles gebruikt één lettertype (Arial), schaduwen en kleurverlopen zijn weg en de banner is een egaal grijs vlak. Alle echte teksten staan erin. Het camerabeeld is een grijs vlak met de tekst "Camerabeeld" en het ovale kader.

Bij schermen met een venster (zoals het productvenster of het beheer) is de pagina erachter ook te zien, net als op de website: gedimd achter het venster.

| Teken in de low-fidelity wireframe | Betekenis |
|---|---|
| Zwart kader | Vlak, kaart, knop, invoerveld of keuzelijst |
| Grijze balk | Tekst (de lengte van de balk is de lengte van de tekst) |
| Kader met een kruis | Afbeelding of camerabeeld |
| Klein grijs blok | Icoon |

### Low-fidelity wireframes

#### Eerste schets (begin van het project)

```text
+------------------------------------------------------+
| TVB Blikjesregistratie                 [Admin login] |
+------------------------------------------------------+
| Vandaag: [datum]                                     |
| Wie heeft er vandaag een blikje gepakt?              |
|------------------------------------------------------|
| Medewerkers                         | Statistieken  |
| [ Zoek medewerker................ ] | Vandaag:  12  |
| [Naam medewerker................ +] | Deze maand: 30|
+------------------------------------------------------+
```

Bij deze eerste schets ging het vooral om de grote indeling van het scherm: een lijst met medewerkers links en de totalen rechts. In die tijd ging het alleen om blikjes en had iedere medewerker een eigen `+`-knop in de lijst.

#### L01 – Beginpagina op een tablet

![L01 – Beginpagina op een tablet (low-fidelity)](wireframes/lofi-01-beginpagina-tablet.jpg)

Bovenaan de bovenbalk met links het logo en de naam, en rechts de themakeuze (slider en twee knoppen), de status en de admin-knop. Daaronder de banner met de vraag als grote kop en rechts een afbeelding. Daaronder één grote kaart met een kop, een teller, een brede knop voor de camera, het zoekveld, het bedrijfsfilter en de lijst met medewerkers onder een bedrijfsnaam: per medewerker een avatar met twee regels tekst. Uitgewerkt in [W01](#w01--beginpagina-op-een-tablet).

#### L02 – Beginpagina op een groot scherm

![L02 – Beginpagina op een groot scherm (low-fidelity)](wireframes/lofi-02-beginpagina-desktop.jpg)

Dezelfde onderdelen in twee kolommen: links de kaart met medewerkers (nu onder drie bedrijfsnamen), rechts drie kleinere kaarten onder elkaar: twee voor de totalen (icoon, label en getal) en één tipkaart. Uitgewerkt in [W02](#w02--beginpagina-op-een-groot-scherm).

#### L03 – Beginpagina op een telefoon

![L03 – Beginpagina op een telefoon (low-fidelity)](wireframes/lofi-03-beginpagina-telefoon.jpg)

Alles staat in één kolom. In de bovenbalk blijven alleen het logo, de themakeuze en de admin-knop over. De afbeelding in de banner schuift achter de kop. Uitgewerkt in [W03](#w03--beginpagina-op-een-telefoon).

#### L04 – Productvenster

![L04 – Productvenster (low-fidelity)](wireframes/lofi-04-productvenster.jpg)

Een venster boven de beginpagina met bovenaan de kop met de naam van de medewerker en een sluitknop. Daaronder een vak met het voorstel en de knop `Zelfde als vorige keer`, een korte uitleg en een lijst met even grote productrijen: links naam en prijs, rechts een ronde `−`-knop, het aantal en een ronde `+`-knop. Onderaan links de link voor de gezichtsherkenning en rechts de knop `Registreren (3)`. Uitgewerkt in [W07](#w07--productvenster-eerste-keer) tot en met [W10](#w10--productvenster-met-zelfde-als-vorige-keer).

#### L05 – Gezichtsherkenning instellen (demo)

![L05 – Gezichtsherkenning instellen (low-fidelity)](wireframes/lofi-05-gezichtsherkenning-instellen.jpg)

Een tweede venster boven het productvenster. Het grootste deel is het camerabeeld (kader met kruis) met daarin het ovale kader voor het gezicht. Daaronder een statusregel, een vinkje met de toestemmingstekst, de knoppen `Annuleren` en `Gezicht vastleggen` en een regel met een slot-icoon. Uitgewerkt in [W12](#w12--gezichtsherkenning-instellen-demo).

#### L06 – Inloggen als beheerder

![L06 – Inloggen als beheerder (low-fidelity)](wireframes/lofi-06-inloggen.jpg)

Een venster met een icoon, een kop, een korte uitleg, twee velden onder elkaar met hun label erboven, een hint en één brede knop `Inloggen`. Uitgewerkt in [W16](#w16--inloggen-als-beheerder).

#### L07 – Beheer: Registraties

![L07 – Beheer: Registraties (low-fidelity)](wireframes/lofi-07-registraties.jpg)

Het beheervenster met bovenaan de kop `Overzicht` en de knop `Uitloggen`, daaronder een rij met zes tabbladen. Op dit tabblad: twee keuzelijsten en een exportknop op één regel, een zoekveld, een lijst met per medewerker links een naam en rechts een totaal, en daaronder een tabel met vier kolommen. Uitgewerkt in [W18](#w18--beheer-registraties).

#### L08 – Beheer: Medewerkers

![L08 – Beheer: Medewerkers (low-fidelity)](wireframes/lofi-08-medewerkers.jpg)

Een knop om een medewerker toe te voegen, een zoekveld met label en een lijst met rijen: links twee regels tekst, rechts de knoppen `Deactiveren` en `Wijzigen`. Uitgewerkt in [W21](#w21--beheer-medewerkers).

#### L09 – Medewerker toevoegen

![L09 – Medewerker toevoegen (low-fidelity)](wireframes/lofi-09-medewerker-toevoegen.jpg)

Een formulier in een venster boven het beheer, met de velden in twee kolommen en het label boven ieder veld, een hint naast het laatste veld en rechtsonder drie knoppen. Uitgewerkt in [W22](#w22--medewerker-toevoegen).

#### L10 – Beheer: Producten

![L10 – Beheer: Producten (low-fidelity)](wireframes/lofi-10-producten.jpg)

Een knop om een product toe te voegen en een lijst met rijen: links naam en prijs, rechts `Wijzigen` en `Verwijderen`. Dezelfde opbouw als de lijst met medewerkers. Uitgewerkt in [W25](#w25--beheer-producten).

#### L11 – Product toevoegen

![L11 – Product toevoegen (low-fidelity)](wireframes/lofi-11-product-toevoegen.jpg)

Een klein formulier met twee velden naast elkaar en drie knoppen, in dezelfde opbouw als het formulier voor medewerkers. Uitgewerkt in [W26](#w26--product-toevoegen).

#### L12 – Beheer: Bedrijven en consumptiepunten

![L12 – Beheer: Bedrijven en consumptiepunten (low-fidelity)](wireframes/lofi-12-bedrijven.jpg)

Een knop om een bedrijf toe te voegen en per bedrijf een blok: bovenin de bedrijfsregel met drie knoppen, daaronder ingesprongen de consumptiepunten met twee knoppen, of één regel tekst als er nog geen punt is. Uitgewerkt in [W28](#w28--beheer-bedrijven-en-consumptiepunten).

#### L13 – Consumptiepunt toevoegen

![L13 – Consumptiepunt toevoegen (low-fidelity)](wireframes/lofi-13-consumptiepunt-toevoegen.jpg)

Een formulier met twee velden naast elkaar en een omkaderd blok `Aanbod` met een vinkje per product in drie kolommen, en daaronder twee knoppen. Uitgewerkt in [W30](#w30--consumptiepunt-toevoegen-met-aanbod).

#### L14 – Beheer: Voorraad

![L14 – Beheer: Voorraad (low-fidelity)](wireframes/lofi-14-voorraad.jpg)

Bovenaan een blok `Bijbestellen (3)` met per regel een label, een link naar het punt en tekst. Daaronder een keuzelijst voor het consumptiepunt en een tabel met vijf kolommen: product, twee invoervelden (voorraad en minimum), een statuslabel en een invoerveld met de knop `Toevoegen`. Uitgewerkt in [W31](#w31--beheer-voorraad).

#### L15 – Beheer: Logboek

![L15 – Beheer: Logboek (low-fidelity)](wireframes/lofi-15-logboek.jpg)

Alleen een tabel met drie kolommen: actie, details en datum en tijd. Uitgewerkt in [W33](#w33--beheer-logboek).

### Mid-fidelity wireframes

#### Eerste uitwerking (begin van het project)

```text
+------------------------------------------------------+
| [TVB] Blikjesregistratie       Systeem actief [ A ]  |
+------------------------------------------------------+
| Vandaag · datum                                      |
| Medewerkers                              8 totaal   |
| [ Zoek op voor- of achternaam... ]                   |
| [avatar] Mark Jansen                    [ + ]        |
|          0 blikjes gepakt                             |
| [avatar] Sophie de Boer                 [ + ]        |
|          3 blikjes gepakt                             |
+------------------------------+-----------------------+
| Vandaag gepakt: 5            | Deze maand: 5         |
+------------------------------+-----------------------+
```

Hier waren de kaarten, knoppen en informatie al duidelijker uitgewerkt. In de uiteindelijke versie zijn de persoonlijke aantallen weggehaald (FR-29) en opent een klik op de medewerker een productvenster.

#### M01 – Beginpagina op een tablet

![M01 – Beginpagina op een tablet (mid-fidelity)](wireframes/midfi-01-beginpagina-tablet.jpg)

De indeling van L01 met de echte teksten: de datum en de vraag in de banner, de kop `Registreer je consumptie`, de teller `8 totaal`, de voorbeeldtekst in het zoekveld met `Ctrl K`, `Alle bedrijven` in het filter en de namen met initialen. De hiërarchie is al zichtbaar door grootte en dikte van de letters, zonder huiskleuren.

#### M02 – Beginpagina op een groot scherm

![M02 – Beginpagina op een groot scherm (mid-fidelity)](wireframes/midfi-02-beginpagina-desktop.jpg)

Twee kolommen met rechts de totalen (`Vandaag geregistreerd`, `Deze maand`) en de tipkaart `Goed bezig!`. Links de medewerkers onder IT Supervision, Klik en TVB.

#### M03 – Beginpagina op een telefoon

![M03 – Beginpagina op een telefoon (mid-fidelity)](wireframes/midfi-03-beginpagina-telefoon.jpg)

Eén kolom met dezelfde teksten. Hier is ook te zien dat de voorbeeldtekst in het zoekveld op een telefoon net niet past.

#### M04 – Productvenster

![M04 – Productvenster (mid-fidelity)](wireframes/midfi-04-productvenster.jpg)

Met de echte inhoud: de begroeting "Goedemiddag Lotte, welkom terug.", het voorstel "Vorige keer koos je 2× Blikje en 1× Ei.", de productnamen met prijzen, de aantallen (2 en 1 na `Zelfde als vorige keer`) en `Registreren (3)`. De `+`-knoppen en `Registreren` zijn donker, de uitgeschakelde `−`-knoppen licht: het verschil tussen hoofdactie en uitgeschakeld is al zonder kleur te zien.

#### M05 – Gezichtsherkenning instellen (demo)

![M05 – Gezichtsherkenning instellen (mid-fidelity)](wireframes/midfi-05-gezichtsherkenning-instellen.jpg)

Het camerabeeld als grijs vlak met het ovale kader, de status `Camera staat aan.`, de volledige toestemmingstekst, de lichte (uitgeschakelde) knop `Gezicht vastleggen` en de privacyregel.

#### M06 – Inloggen als beheerder

![M06 – Inloggen als beheerder (mid-fidelity)](wireframes/midfi-06-inloggen.jpg)

Het loginvenster met `Beheerdersomgeving`, `Welkom terug`, het ingevulde e-mailadres, het wachtwoordveld, de hint "Demo: elk ingevuld wachtwoord werkt." en de donkere knop `Inloggen`.

#### M07 – Beheer: Registraties

![M07 – Beheer: Registraties (mid-fidelity)](wireframes/midfi-07-registraties.jpg)

De tabbladen met het actieve tabblad onderstreept, de filters `Alle medewerkers` en `Alle maanden`, `CSV exporteren`, de totalen per medewerker (bijvoorbeeld "3 producten · € 1,80") en de tabel met de nieuwste registraties bovenaan. Deze wireframes zijn later op de dag gemaakt dan de high-fidelity screenshots, daarom staat er een andere tijd in de tabel.

#### M08 – Beheer: Medewerkers

![M08 – Beheer: Medewerkers (mid-fidelity)](wireframes/midfi-08-medewerkers.jpg)

De lijst met per medewerker de naam en "Actief · TVB · Hoofdkantoor · Geen personeelsnummer", en de knoppen `Deactiveren` en `Wijzigen`.

#### M09 – Medewerker toevoegen

![M09 – Medewerker toevoegen (mid-fidelity)](wireframes/midfi-09-medewerker-toevoegen.jpg)

Het formulier met alle labels, de keuzelijsten `Kies een bedrijf` en `Geen consumptiepunt bij dit bedrijf`, de hint bij het werkgevernummer en de knoppen `Annuleren`, `Opslaan` en (donker) `Opslaan + opnieuw`.

#### M10 – Beheer: Producten

![M10 – Beheer: Producten (mid-fidelity)](wireframes/midfi-10-producten.jpg)

De acht producten met hun prijs en de knoppen `Wijzigen` en `Verwijderen`.

#### M11 – Product toevoegen

![M11 – Product toevoegen (mid-fidelity)](wireframes/midfi-11-product-toevoegen.jpg)

De velden `Productnaam` en `Prijs in euro` met de voorbeelden "bijv. Soep" en "bijv. 0.65", en de drie knoppen.

#### M12 – Beheer: Bedrijven en consumptiepunten

![M12 – Beheer: Bedrijven en consumptiepunten (mid-fidelity)](wireframes/midfi-12-bedrijven.jpg)

De bedrijven op alfabetische volgorde met "Werkgevernummer onbekend" en het aantal medewerkers, de punten Kantine IT ("2 van 8 producten") en Kantine Klik ("0 van 8 producten"), en "Nog geen consumptiepunt." bij bedrijven zonder punt.

#### M13 – Consumptiepunt toevoegen

![M13 – Consumptiepunt toevoegen (mid-fidelity)](wireframes/midfi-13-consumptiepunt-toevoegen.jpg)

De uitleg over het aanbod, de naam `Kantine IT`, het bedrijf `IT Supervision` en de productnamen bij de vinkjes, met Blikje en Glas melk aangevinkt.

#### M14 – Beheer: Voorraad

![M14 – Beheer: Voorraad (mid-fidelity)](wireframes/midfi-14-voorraad.jpg)

De bijbestellijst met de labels `Bijbestellen` en `Op` en de teksten (bijvoorbeeld "Blikje: 4 (minimum 6)"), en de tabel van Hoofdkantoor met de getallen, de statuslabels `Bijbestellen` en `Op voorraad` en de velden `Aantal` met `Toevoegen`. Zonder kleur zijn de labels alleen nog aan hun tekst te herkennen; in het eindontwerp helpen kleuren hierbij (zie W31).

#### M15 – Beheer: Logboek

![M15 – Beheer: Logboek (mid-fidelity)](wireframes/midfi-15-logboek.jpg)

Het logboek met de echte regels, zoals "Consumptiepunt toegevoegd" en "Voorraad geteld", met de details en de datum en tijd.

### High-fidelity wireframe

De high-fidelity versie is de uiteindelijke website. Deze heeft:

- de groene en blauwe kleuren van TVB;
- afgeronde kaarten;
- duidelijke teksten;
- avatars en iconen;
- hover-effecten;
- meldingen na een actie;
- een mobiele indeling;
- een aparte admin-modal.

Van ieder scherm van de high-fidelity versie staat een screenshot in de paragraaf [Wireframes](#wireframes) hieronder.

### Ontwerpkeuzes en Nielsen-heuristieken

- De melding na het registreren laat zien wat er is gebeurd. Dit past bij **zichtbaarheid van de systeemstatus**.
- De zoekbalk voorkomt dat de gebruiker alle namen moet onthouden. Dit past bij **herkenning in plaats van onthouden**.
- De knoppen en kleuren zijn steeds hetzelfde. Dit past bij **consistentie en standaarden**.
- De losse knoppen voor sluiten en uitloggen geven de gebruiker controle. Dit past bij **gebruikerscontrole en vrijheid**.
- Een medewerker kan zelf niet verlagen en ziet alleen producten die op het eigen punt aanwezig zijn. Dit helpt om fouten te voorkomen en past bij **foutpreventie**.
- De website werkt op verschillende schermen. Dit past bij **flexibiliteit en efficiënt gebruik**.
- Oude registraties blijven zichtbaar als `Verwijderd`. Hierdoor kan de gebruiker beter zien wat er met oude gegevens is gebeurd.
- Het productvenster heeft naast `+` ook een `−`-knop, zodat een verkeerde tik direct te herstellen is. Dit past bij **gebruikerscontrole en vrijheid**.
- De melding na het registreren noemt de naam en de producten, staat onderaan in het midden en blijft 4 seconden staan. Dit past bij **zichtbaarheid van de systeemstatus**, belangrijk op een gedeelde tablet.
- Formulieren hebben labels boven de velden in plaats van alleen voorbeeldtekst die verdwijnt tijdens het typen. Dit past bij **herkenning in plaats van onthouden** en **foutpreventie**.
- Knoppen voor aanraakschermen zijn minstens 44 × 44 pixels, en op een staande tablet is de banner compacter zodat de medewerkerlijst hoger begint. Dit past bij **flexibiliteit en efficiënt gebruik**.
- Foutmeldingen in formulieren staan direct onder het veld (met een waarschuwingsteken), het eerste foute veld krijgt de focus en de melding verdwijnt zodra je het veld aanpast. Dit past bij **fouten herkennen en herstellen**.
- Lege lijsten en tabellen tonen een icoon, een korte uitleg en waar nodig een knop, zoals "Zoekopdracht wissen" of "Naar Bedrijven". Dit past bij **hulp en documentatie** en **fouten herstellen**.
- Meldingen tonen een vinkje bij succes en een waarschuwingsteken bij een fout, zodat het verschil direct zichtbaar is. Dit past bij **zichtbaarheid van de systeemstatus**.
- Alle iconen zijn eenvoudige SVG-lijntekeningen met dezelfde lijndikte (`assets/js/icons.js`) in plaats van teksttekens, zodat ze op ieder apparaat hetzelfde en scherp zijn. Dit past bij **consistentie en standaarden**.

### Wireframes

Deze paragraaf laat ieder scherm van de website zien zoals het nu werkt. Per scherm staan een naam, een omschrijving, de UI-principes die erin zitten en de heuristieken van Nielsen die erin terugkomen.

**Hoe de screenshots zijn gemaakt.** Alle afbeeldingen staan in de map `docs/wireframes/` en zijn screenshots van de echte website, gemaakt met Microsoft Edge zonder venster (headless) op 1 oktober 2026 rond 12:00 uur. Er is niets in getekend of nagemaakt. De demogegevens zijn via de website zelf ingevoerd: Lotte van Dijk registreerde 2× Blikje en 1× Ei, Sophie de Boer 1× Yoghurt en 1× Glas melk, en Daan Smit 2× Sneetje brood en 1× Beleg. Daarna zijn in het beheer het consumptiepunt Kantine IT (IT Supervision, alleen Blikje en Glas melk) en Kantine Klik (Klik, geen producten) aangemaakt, is Tom de Groot naar Kantine IT en Eva Meijer naar Kantine Klik verplaatst en is de voorraad Blikje op Hoofdkantoor op 4 gezet. Daarom staan in de eerste screenshots alle medewerkers nog onder TVB en in de latere ook onder IT Supervision en Klik.

Een paar dingen om te weten:

- **Camera.** Bij de schermen van de gezichtsherkenning (W12 en W13) gebruikt de browser zijn eigen testbeeld als camera (een groen vlak met een draaiende cirkel en een teller). Er staan dus geen echte gezichten in dit document. Het beeld is gespiegeld, net als bij een echte camera aan de voorkant.
- **W13.** Het venster `Herken mij` opent alleen als er minstens één gezicht is ingesteld. Met het testbeeld kan geen gezicht worden vastgelegd. Alleen voor deze screenshot is daarom nagebootst dat er iemand is ingesteld; het venster zelf is ongewijzigd.
- **W14.** Hier is echt herkend: als camerabeeld is een voorbeeldfoto gebruikt. De screenshot is gemaakt nadat het cameravenster vanzelf was gesloten, dus de foto staat er niet op.
- **Bevestigingsvragen.** Bij het verwijderen van een medewerker, bedrijf of consumptiepunt vraagt de browser om bevestiging met een eigen venster (`window.confirm`). Dat venster hoort bij de browser en niet bij de website en staat daarom niet tussen de screenshots.
- **Schermformaten.** De medewerkerskant is vastgelegd op een staande tablet (810 × 1080 pixels), omdat de website op een tablet bij het consumptiepunt wordt gebruikt. Het beheer is vastgelegd op een laptopscherm (1280 × 900). W02 en W03 tonen de beginpagina op een groot scherm (1440 × 900) en een telefoon (390 × 844).

#### Gebruikte UI-principes

| UI-principe | Betekenis in deze website |
|---|---|
| Visuele hiërarchie | Het belangrijkste valt het eerst op door grootte, gewicht en kleur, zoals de vraag in de banner en de groene hoofdknop. |
| Consistentie | Dezelfde onderdelen zien er overal hetzelfde uit en werken hetzelfde: kaarten, knoppen, vensters, labels en iconen. |
| Feedback | Iedere actie geeft een zichtbare reactie: een teller, een melding, een status of een foutmelding. |
| Affordance | Aan een element is te zien wat je ermee kunt: knoppen zien eruit als knoppen, een uitgeschakelde knop is vaag. |
| Groeperen (nabijheid) | Wat bij elkaar hoort, staat bij elkaar: medewerkers per bedrijf, consumptiepunten onder hun bedrijf, filters boven de tabel. |
| Kleur met betekenis | Groen voor de hoofdactie en succes, rood voor fouten en verwijderen, oranje voor bijbestellen. |
| Witruimte en eenvoud | Weinig onderdelen per scherm en genoeg ruimte ertussen. |
| Uitlijning | Alle onderdelen volgen dezelfde paginabreedte, zijmarge en kolommen. |
| Toegankelijkheid | Grote aanraakvlakken (minstens 44 × 44 pixels), labels boven velden, voldoende contrast en bediening met het toetsenbord. |
| Progressieve onthulling | Details komen pas in beeld als ze nodig zijn, bijvoorbeeld in een venster of een uitklapbare rij. |
| Responsief ontwerp | De indeling past zich aan het scherm aan: telefoon, tablet of groot scherm. |

#### De tien heuristieken van Nielsen

| Code | Heuristiek |
|---|---|
| H1 | Zichtbaarheid van de systeemstatus |
| H2 | Overeenkomst tussen het systeem en de echte wereld |
| H3 | Gebruikerscontrole en vrijheid |
| H4 | Consistentie en standaarden |
| H5 | Foutpreventie |
| H6 | Herkennen in plaats van herinneren |
| H7 | Flexibiliteit en efficiëntie |
| H8 | Esthetisch en minimalistisch ontwerp |
| H9 | Gebruikers helpen fouten te herkennen, begrijpen en herstellen |
| H10 | Hulp en documentatie |

#### Overzicht

| Nr. | Naam | Wie |
|---|---|---|
| W01 | Beginpagina op een tablet | Medewerker |
| W02 | Beginpagina op een groot scherm | Medewerker |
| W03 | Beginpagina op een telefoon | Medewerker |
| W04 | Beginpagina in het donkere thema | Medewerker |
| W05 | Bedrijfsfilter geopend | Medewerker |
| W06 | Zoeken zonder resultaat | Medewerker |
| W07 | Productvenster, eerste keer | Medewerker |
| W08 | Productvenster met een keuze | Medewerker |
| W09 | Bevestiging na registreren | Medewerker |
| W10 | Productvenster met "Zelfde als vorige keer" | Medewerker |
| W11 | Productvenster zonder producten | Medewerker |
| W12 | Gezichtsherkenning instellen (demo) | Medewerker |
| W13 | Herken mij met de camera (demo) | Medewerker |
| W14 | Herkend met de camera (demo) | Medewerker |
| W15 | Waarschuwing bij openen als los bestand | Iedereen |
| W16 | Inloggen als beheerder | Beheerder |
| W17 | Inloggen met een foutmelding | Beheerder |
| W18 | Beheer: Registraties | Beheerder |
| W19 | Beheer: registratie corrigeren | Beheerder |
| W20 | Beheer: filter zonder registraties | Beheerder |
| W21 | Beheer: Medewerkers | Beheerder |
| W22 | Medewerker toevoegen | Beheerder |
| W23 | Medewerker toevoegen met foutmeldingen | Beheerder |
| W24 | Medewerker wijzigen | Beheerder |
| W25 | Beheer: Producten | Beheerder |
| W26 | Product toevoegen | Beheerder |
| W27 | Product met een bestaande naam | Beheerder |
| W28 | Beheer: Bedrijven en consumptiepunten | Beheerder |
| W29 | Bedrijf wijzigen | Beheerder |
| W30 | Consumptiepunt toevoegen met aanbod | Beheerder |
| W31 | Beheer: Voorraad | Beheerder |
| W32 | Voorraad van een punt zonder aanbod | Beheerder |
| W33 | Beheer: Logboek | Beheerder |
| W34 | Foutmelding bij een levering | Beheerder |

#### W01 – Beginpagina op een tablet

![W01 – Beginpagina op een tablet](wireframes/w01-beginpagina-tablet.jpg)

**Omschrijving.** Dit is het eerste scherm dat een medewerker op de tablet bij het consumptiepunt ziet. Bovenaan staat de bovenbalk met het TVB-logo, de naam `Consumptieregistratie`, de themakeuze (slider met zon en maan, en de knoppen `Systeem` en `Auto`), de status `Systeem actief` en de knop `Admin login`. Daaronder staat de banner met de datum (`Vandaag · 1 oktober 2026`) en de vraag "Wat heb je vandaag gegeten of gedronken?". Op een staande tablet is deze banner compacter, zodat de lijst hoger begint. In de kaart `Registreer je consumptie` staan het aantal medewerkers (`8 totaal`), de knop `Herken mij met de camera (demo)`, het zoekveld met de sneltoets `Ctrl K` en het bedrijfsfilter. De medewerkers staan per bedrijf (hier alleen TVB), met een gekleurde avatar met initialen en de tekst "Klik om een product te kiezen". De totalen van vandaag en deze maand staan op de tablet onder de lijst (zie W06).

**UI-principes:**
- *Visuele hiërarchie:* de grote vraag in de banner en de kop van de kaart zijn het eerst te zien; de uitleg is kleiner en lichter.
- *Groeperen:* medewerkers staan onder de naam van hun bedrijf.
- *Toegankelijkheid:* de rijen van de medewerkers zijn groot genoeg om met een vinger aan te tikken en werken ook met Enter of spatie.
- *Responsief ontwerp:* op een staande tablet komen de totalen onder de lijst en is de banner lager.
- *Witruimte en eenvoud:* alleen wat nodig is om te registreren staat op het scherm.

**Nielsen-heuristieken:**
- *H1:* de datum, `Systeem actief` en `8 totaal` laten zien waar de gebruiker is en wat het systeem doet.
- *H2:* de vraag en de teksten zijn gewone taal ("Klik om een product te kiezen") en er worden echte namen getoond, geen nummers.
- *H6:* de medewerker zoekt zijn of haar naam op in een lijst met avatars en hoeft niets te onthouden of in te typen.
- *H7:* zoeken, het bedrijfsfilter, de sneltoets `Ctrl K` en de camera zijn snellere wegen naar de eigen naam.
- *H8:* er staan geen persoonlijke aantallen of bedragen in de lijst.

#### W02 – Beginpagina op een groot scherm

![W02 – Beginpagina op een groot scherm](wireframes/w02-beginpagina-desktop.jpg)

**Omschrijving.** Dezelfde beginpagina op een scherm van 1440 pixels breed. De inhoud blijft binnen een vaste paginabreedte in het midden. Links staat de kaart met medewerkers, nu verdeeld over IT Supervision (Tom de Groot), Klik (Eva Meijer) en TVB. Rechts staan de kaarten `Vandaag geregistreerd` (8 producten) en `Deze maand` (8 producten totaal) en een tipkaart `Goed bezig!` met de tekst "Elke registratie helpt ons bewuster om te gaan met verbruik."

**UI-principes:**
- *Uitlijning:* bovenbalk, banner, kaarten en footer hebben dezelfde linker- en rechterrand.
- *Responsief ontwerp:* op een groot scherm staan de lijst en de totalen naast elkaar in twee kolommen.
- *Groeperen:* de bedrijven staan op alfabetische volgorde, met hun medewerkers eronder.
- *Visuele hiërarchie:* de getallen in de totaalkaarten zijn groot, het label erboven is klein.
- *Consistentie:* de totaalkaarten hebben dezelfde opbouw (icoon, label, getal, eenheid).

**Nielsen-heuristieken:**
- *H1:* de totalen laten direct zien hoeveel er vandaag en deze maand is geregistreerd.
- *H4:* de kaarten, iconen en kleuren zijn dezelfde als op de tablet.
- *H8:* de tipkaart is de enige extra informatie; verder staat er alleen wat nodig is.

#### W03 – Beginpagina op een telefoon

![W03 – Beginpagina op een telefoon](wireframes/w03-beginpagina-telefoon.jpg)

**Omschrijving.** De beginpagina op een telefoon van 390 pixels breed. In de bovenbalk vervallen de naam naast het logo, de status en de icoontjes naast de slider; de themaknoppen en de admin-knop (alleen de letter `A`) blijven staan. Banner, kaart en lijst staan onder elkaar over de volle breedte. De voorbeeldtekst in het zoekveld past niet helemaal en wordt afgekapt ("Zoek op voor- of achtern").

**UI-principes:**
- *Responsief ontwerp:* alles staat in één kolom; er is geen horizontaal scrollen.
- *Progressieve onthulling:* minder belangrijke teksten in de bovenbalk zijn weggelaten zodat de knoppen passen.
- *Toegankelijkheid:* de knoppen en rijen blijven even groot als op de tablet.

**Nielsen-heuristieken:**
- *H7:* de website werkt ook op een telefoon, niet alleen op de tablet.
- *H4:* de onderdelen zien er hetzelfde uit als op de andere schermen.
- *H8:* op het kleine scherm is alleen het noodzakelijke overgebleven.

#### W04 – Beginpagina in het donkere thema

![W04 – Beginpagina in het donkere thema](wireframes/w04-beginpagina-donker.jpg)

**Omschrijving.** De beginpagina op de tablet als het apparaat op donker staat. `Systeem` is gekozen, dus de website volgt het apparaat; de slider staat daarom naar de maan. De achtergrond en kaarten zijn donker, de huiskleuren blijven en koppen en namen krijgen een lichtere tint van het huisgroen, zodat ze goed leesbaar zijn.

**UI-principes:**
- *Kleur met betekenis:* groen blijft de kleur van koppen en acties, ook in het donker.
- *Toegankelijkheid:* de lichtere groene tekst geeft genoeg contrast op de donkere achtergrond.
- *Consistentie:* indeling en onderdelen zijn gelijk aan het lichte thema; alleen de kleuren wisselen.

**Nielsen-heuristieken:**
- *H1:* de slider laat zien welk thema actief is.
- *H3:* de gebruiker kan zelf kiezen tussen het systeem volgen, vast licht of donker, of `Auto` (overdag licht, na zonsondergang donker).
- *H7:* het thema past zich vanzelf aan het apparaat aan.

#### W05 – Bedrijfsfilter geopend

![W05 – Bedrijfsfilter geopend](wireframes/w05-bedrijfsfilter-open.jpg)

**Omschrijving.** Het bedrijfsfilter is uitgeklapt. Het is een keuzelijst waarin je ook kunt typen. De lijst toont `Alle bedrijven` en alleen de bedrijven waar actieve medewerkers bij horen; op dit moment is dat alleen TVB.

**UI-principes:**
- *Affordance:* het pijltje rechts laat zien dat het veld uitklapt.
- *Progressieve onthulling:* de bedrijven komen pas in beeld als het filter wordt geopend.
- *Visuele hiërarchie:* de uitklaplijst ligt met een schaduw boven de medewerkerslijst.

**Nielsen-heuristieken:**
- *H5:* er staan geen bedrijven zonder medewerkers in de lijst, dus kiezen leidt nooit tot een lege lijst.
- *H6:* de bedrijven staan uitgeschreven in de lijst en hoeven niet te worden onthouden.
- *H7:* bij 13 bedrijven kan de gebruiker de lijst snel inkorten.

#### W06 – Zoeken zonder resultaat

![W06 – Zoeken zonder resultaat](wireframes/w06-zoeken-zonder-resultaat.jpg)

**Omschrijving.** Er is gezocht op "Willem", maar die medewerker bestaat niet. De teller springt naar `0 totaal` en in de kaart staat een lege toestand: een icoon, de tekst "Geen medewerker gevonden", de uitleg "Probeer een andere zoekterm of kies een ander bedrijf." en de knop `Zoekopdracht wissen`. Onder de kaart staan de totalen naast elkaar (8 producten vandaag, 8 deze maand) met daaronder de tipkaart.

**UI-principes:**
- *Feedback:* de teller en de lege toestand laten direct zien dat er niets is gevonden.
- *Affordance:* de knop `Zoekopdracht wissen` geeft één duidelijke vervolgstap.
- *Responsief ontwerp:* op de tablet staan de totalen in twee kolommen onder de lijst.

**Nielsen-heuristieken:**
- *H1:* `0 totaal` toont het resultaat van het zoeken.
- *H3:* met één knop is de zoekopdracht weg en staat de hele lijst er weer.
- *H9:* de melding zegt wat er aan de hand is en wat de gebruiker kan doen.
- *H10:* de uitleg in de lege toestand helpt verder zonder handleiding.

#### W07 – Productvenster, eerste keer

![W07 – Productvenster, eerste keer](wireframes/w07-productvenster-eerste-keer.jpg)

**Omschrijving.** Na een klik op Lotte van Dijk opent het productvenster. Bovenaan staan `Persoonlijke registratie`, `Product kiezen voor Lotte van Dijk` en een begroeting die bij het tijdstip past ("Goedemiddag Lotte."). Daaronder staat een korte uitleg en de lijst met producten van haar consumptiepunt, met de prijs. Per product is er een `−`-knop, het aantal en een `+`-knop. Omdat er nog niets is gekozen, staan alle aantallen op 0 en zijn de `−`-knoppen uitgeschakeld. Onderaan staan de link `Gezichtsherkenning instellen (demo)` en de knop `Registreren`. Het venster sluit met het kruisje of door naast het venster te klikken.

**UI-principes:**
- *Affordance:* de groene `+`-knoppen zijn opvallend; de uitgeschakelde `−`-knoppen zijn vaag.
- *Toegankelijkheid:* de `−`- en `+`-knoppen zijn 44 × 44 pixels, goed te raken op een aanraakscherm.
- *Consistentie:* iedere productrij heeft dezelfde opbouw: naam, prijs, `−`, aantal, `+`.
- *Visuele hiërarchie:* de naam van de medewerker staat groot bovenaan en de knop `Registreren` is de enige gevulde knop onderaan.
- *Progressieve onthulling:* de producten verschijnen pas na het kiezen van een naam.

**Nielsen-heuristieken:**
- *H2:* bekende productnamen en prijzen in euro; de begroeting voelt als een gesprek.
- *H3:* het venster is altijd te sluiten zonder iets op te slaan.
- *H5:* de `−`-knop werkt niet onder 0, er wordt pas opgeslagen na `Registreren` en een medewerker ziet alleen producten van het eigen punt. Wie op `Registreren` drukt zonder keuze, krijgt de melding "Kies eerst minimaal één product".
- *H6:* alle producten staan in beeld; niets hoeft te worden onthouden.

#### W08 – Productvenster met een keuze

![W08 – Productvenster met een keuze](wireframes/w08-productvenster-keuze-gemaakt.jpg)

**Omschrijving.** Lotte heeft 2× Blikje en 1× Ei gekozen. Bij die producten is de `−`-knop nu actief en de knop onderaan toont het totaal: `Registreren (3)`. Er is nog niets opgeslagen.

**UI-principes:**
- *Feedback:* de aantallen en de tekst op de knop veranderen direct bij iedere tik.
- *Affordance:* de `−`-knop wordt pas actief als er iets te verlagen is.

**Nielsen-heuristieken:**
- *H1:* `Registreren (3)` laat zien hoeveel producten worden opgeslagen.
- *H3:* een verkeerde tik is met `−` direct te herstellen, vóór het opslaan.
- *H5:* de gebruiker ziet de hele keuze voordat die wordt opgeslagen.

#### W09 – Bevestiging na registreren

![W09 – Bevestiging na registreren](wireframes/w09-bevestiging-na-registreren.jpg)

**Omschrijving.** Na `Registreren` sluit het productvenster en verschijnt onderaan in het midden een melding met een vinkje: "Lotte van Dijk: 2× Blikje, 1× Ei geregistreerd". De melding blijft 4 seconden staan. De lijst is direct weer klaar voor de volgende medewerker.

**UI-principes:**
- *Feedback:* de melding bevestigt wat er is opgeslagen.
- *Kleur met betekenis:* het vinkje toont dat het gelukt is (bij een fout staat er een waarschuwingsteken, zie W34).
- *Witruimte en eenvoud:* de melding bedekt de lijst nauwelijks en verdwijnt vanzelf.

**Nielsen-heuristieken:**
- *H1:* de melding noemt de naam en de producten, zodat op een gedeelde tablet duidelijk is wat er voor wie is opgeslagen.
- *H2:* de melding is één zin in gewone taal.

#### W10 – Productvenster met "Zelfde als vorige keer"

![W10 – Productvenster met "Zelfde als vorige keer"](wireframes/w10-productvenster-vorige-keer.jpg)

**Omschrijving.** Lotte opent het productvenster opnieuw. De begroeting is nu "Goedemiddag Lotte, welkom terug." Daaronder staat een groen vak met een icoon: "Vorige keer koos je 2× Blikje en 1× Ei." met de knop `Zelfde als vorige keer`. Die knop vult de aantallen in; opslaan gebeurt pas met `Registreren`. Het voorstel bestaat uit de laatste registratie en alles wat binnen 60 seconden daarvoor is geregistreerd, en bevat alleen producten die het punt nu aanbiedt.

**UI-principes:**
- *Visuele hiërarchie:* het voorstel staat boven de productlijst en valt op door de lichtgroene achtergrond.
- *Groeperen:* het voorstel en de knop staan samen in één vak.
- *Feedback:* de begroeting laat zien dat het systeem de medewerker herkent als terugkerende gebruiker.

**Nielsen-heuristieken:**
- *H6:* de medewerker hoeft niet te onthouden wat er vorige keer is gekozen.
- *H7:* met één tik is een vaste keuze ingevuld; een sneltoets voor wie vaak hetzelfde neemt.
- *H3:* na het invullen kunnen de aantallen nog worden aangepast voordat er iets wordt opgeslagen.

#### W11 – Productvenster zonder producten

![W11 – Productvenster zonder producten](wireframes/w11-productvenster-geen-producten.jpg)

**Omschrijving.** Eva Meijer hoort bij Kantine Klik, waar nog geen producten zijn aangezet. In het productvenster staat daarom een lege toestand met een locatie-icoon: "Geen producten op jouw consumptiepunt." en "Neem contact op met de beheerder als dit niet klopt." De knop `Registreren` is weggelaten.

**UI-principes:**
- *Feedback:* in plaats van een leeg venster staat er een uitleg.
- *Witruimte en eenvoud:* knoppen die niets kunnen doen, zijn weggelaten.
- *Consistentie:* de lege toestand heeft dezelfde vorm als in W06, W20 en W32 (icoon, titel, uitleg).

**Nielsen-heuristieken:**
- *H5:* zonder producten is er geen knop om iets te registreren.
- *H9:* de melding zegt wat er aan de hand is en wat de medewerker kan doen.
- *H10:* de medewerker weet bij wie hij of zij terecht kan.

#### W12 – Gezichtsherkenning instellen (demo)

![W12 – Gezichtsherkenning instellen (demo)](wireframes/w12-gezicht-instellen.jpg)

**Omschrijving.** Via de link `Gezichtsherkenning instellen (demo)` in het productvenster opent dit venster bovenop het productvenster. De titel is `Gezichtsherkenning instellen voor Lotte van Dijk`, met de uitleg "Plaats je gezicht binnen het kader. Zet het vinkje en klik op Gezicht vastleggen." In het camerabeeld (hier het testbeeld van de browser) staat een ovaal kader. Onder het beeld staat de status `Camera staat aan.` en een vinkje voor toestemming: "Ik doe vrijwillig mee aan deze demo. Mijn gezicht wordt alleen in deze browser verwerkt en niet opgeslagen of verstuurd. Na het herladen van de pagina is alles weg." De knop `Gezicht vastleggen` is uitgeschakeld tot het vinkje is gezet. Onderaan staat met een slotje: "Er worden geen foto's gemaakt of bewaard. Alles gebeurt op dit apparaat." Zie ook de paragraaf over privacy in hoofdstuk 13.

**UI-principes:**
- *Affordance:* de uitgeschakelde knop is vaag en wordt pas groen na toestemming.
- *Progressieve onthulling:* de camera start alleen als de medewerker hier zelf voor kiest.
- *Visuele hiërarchie:* het camerabeeld met het kader neemt de meeste ruimte in, omdat de gebruiker daar moet kijken.
- *Feedback:* de status onder het beeld laat zien wat de camera doet.

**Nielsen-heuristieken:**
- *H1:* de status (`Camera staat aan.`) laat zien wat er gebeurt.
- *H3:* `Annuleren` en het kruisje stoppen de camera en sluiten het venster.
- *H5:* zonder vinkje kan er niets worden vastgelegd.
- *H10:* de toestemmingstekst en de privacyregel leggen uit wat er met het beeld gebeurt.

#### W13 – Herken mij met de camera (demo)

![W13 – Herken mij met de camera (demo)](wireframes/w13-gezicht-herkennen.jpg)

**Omschrijving.** Na een klik op `Herken mij met de camera (demo)` op de beginpagina opent dit venster: `Herken mij`, met de uitleg "Plaats je gezicht binnen het kader en kijk recht in de camera." De status is hier "Geen gezicht in beeld. Plaats je gezicht binnen het kader." Andere statussen zijn "Gezicht gevonden, maar niet herkend. Blijf rustig in het kader kijken." en "Bijna herkend. Blijf even rustig in het kader kijken." Pas als dezelfde actieve medewerker twee keer achter elkaar wordt herkend, telt het. Lukt het na 20 seconden niet, dan staat er "Niet herkend. Sluit dit venster en kies je naam in de lijst." Is er nog niemand ingesteld, dan opent het venster niet en verschijnt een melding.

**UI-principes:**
- *Feedback:* de status verandert terwijl de camera zoekt.
- *Consistentie:* dit venster lijkt op W12 (zelfde kader, status en privacyregel).
- *Witruimte en eenvoud:* er is maar één knop (`Annuleren`); herkennen gaat vanzelf.

**Nielsen-heuristieken:**
- *H1:* de status vertelt steeds wat het systeem ziet.
- *H3:* `Annuleren` en het kruisje stoppen de camera; de lijst met namen blijft altijd een alternatief.
- *H5:* twee keer achter elkaar dezelfde uitkomst voorkomt dat de verkeerde persoon wordt gekozen.
- *H9:* bij niet herkennen staat erbij wat de gebruiker dan moet doen.

#### W14 – Herkend met de camera (demo)

![W14 – Herkend met de camera (demo)](wireframes/w14-gezicht-herkend.jpg)

**Omschrijving.** Lotte is herkend. Het cameravenster sluit vanzelf en haar productvenster opent met de begroeting "Goedemiddag Lotte. Je bent herkend met de camera." Onderaan staat met een vinkje "Gezichtsherkenning staat aan (demo)" en de link `Uitzetten`. Verder werkt het venster hetzelfde als in W07.

**UI-principes:**
- *Feedback:* de begroeting zegt dat de camera de medewerker heeft herkend.
- *Consistentie:* na herkennen ziet het productvenster eruit zoals altijd.

**Nielsen-heuristieken:**
- *H1:* de medewerker ziet dat herkennen is gelukt en dat de functie aan staat.
- *H3:* met `Uitzetten` wordt het gezicht direct vergeten; is de verkeerde naam gekozen, dan sluit het kruisje het venster zonder iets op te slaan.
- *H5:* de naam staat groot bovenaan, zodat een verkeerde herkenning opvalt vóór het registreren.

#### W15 – Waarschuwing bij openen als los bestand

![W15 – Waarschuwing bij openen als los bestand](wireframes/w15-los-bestand-waarschuwing.jpg)

**Omschrijving.** Wie `index.html` dubbelklikt (adres begint met `file://`), krijgt de website zonder werkende JavaScript, omdat browsers ES-modules niet laden vanaf een los bestand. Bovenaan staat dan een oranje balk: "Deze pagina werkt niet als los bestand. Open de map in VS Code en start hem met Live Server (of een andere lokale webserver)." Op de rest van de pagina is te zien dat de website niet werkt: geen datum, geen medewerkers, totalen op 0 en geen iconen.

**UI-principes:**
- *Kleur met betekenis:* de oranje balk valt op boven de rest.
- *Visuele hiërarchie:* de melding staat helemaal bovenaan, vóór alle andere inhoud.

**Nielsen-heuristieken:**
- *H1:* het is direct duidelijk dat de pagina niet goed is gestart.
- *H9:* de melding zegt wat er mis is en hoe het op te lossen is.
- *H10:* de oplossing (Live Server) staat erbij.

#### W16 – Inloggen als beheerder

![W16 – Inloggen als beheerder](wireframes/w16-inloggen.jpg)

**Omschrijving.** Na `Admin login` opent het loginvenster met een slot-icoon, `Beheerdersomgeving`, de titel `Welkom terug` en "Log in om registraties en medewerkers te beheren." Het e-mailadres staat al ingevuld (`admin@tvb.nl`); het wachtwoordveld is leeg (de puntjes zijn voorbeeldtekst). Onder het wachtwoord staat "Demo: elk ingevuld wachtwoord werkt." en daaronder de knop `Inloggen` met een pijl.

**UI-principes:**
- *Consistentie:* labels staan boven de velden, net als in alle andere formulieren.
- *Visuele hiërarchie:* `Inloggen` is de enige grote groene knop.
- *Witruimte en eenvoud:* alleen e-mailadres, wachtwoord en één knop.

**Nielsen-heuristieken:**
- *H4:* een standaard loginformulier met de gebruikelijke velden en volgorde.
- *H10:* de hint legt uit hoe inloggen in de demo werkt.
- *H3:* het kruisje of een klik naast het venster sluit het zonder in te loggen.

#### W17 – Inloggen met een foutmelding

![W17 – Inloggen met een foutmelding](wireframes/w17-inloggen-foutmelding.jpg)

**Omschrijving.** Er is op `Inloggen` geklikt zonder wachtwoord. Onder de knop staat in rood: "Vul een e-mailadres en wachtwoord in." Het venster blijft open.

**UI-principes:**
- *Feedback:* de fout wordt in het venster zelf getoond, direct bij de knop.
- *Kleur met betekenis:* rood voor een fout.

**Nielsen-heuristieken:**
- *H9:* de melding zegt in gewone taal wat er ontbreekt.
- *H1:* de gebruiker ziet meteen waarom er niets gebeurt.

#### W18 – Beheer: Registraties

![W18 – Beheer: Registraties](wireframes/w18-registraties.jpg)

**Omschrijving.** Na inloggen opent het beheer (`Beheer` / `Overzicht`) met de knop `Uitloggen` en zes tabbladen: Registraties, Medewerkers, Producten, Bedrijven, Voorraad en Logboek. Het actieve tabblad is groen en onderstreept. Op `Registraties` staan de filters `Medewerker` en `Maand` en de knop `CSV exporteren`. Onder `Medewerker corrigeren` staan een zoekveld en per medewerker het aantal producten en het bedrag (bijvoorbeeld Lotte van Dijk: 3 producten · € 1,80). Daaronder staat de tabel met Medewerker, Product, Aantal en Datum & tijd, met de nieuwste registratie bovenaan.

**UI-principes:**
- *Groeperen:* filters en export staan samen boven de lijst; correcties en de tabel zijn aparte blokken.
- *Consistentie:* dezelfde knoppen, velden en kleuren als op de medewerkerskant.
- *Visuele hiërarchie:* het actieve tabblad valt op door kleur en onderstreping.
- *Uitlijning:* de kolommen van de tabel en de bedragen staan recht onder elkaar.

**Nielsen-heuristieken:**
- *H1:* het actieve tabblad en de totalen per medewerker laten de stand zien.
- *H4:* tabbladen en tabellen werken zoals de gebruiker gewend is.
- *H6:* medewerkers en maanden worden uit een lijst gekozen.
- *H7:* filteren en zoeken maken een lange lijst snel kleiner; de export gebruikt dezelfde filters.

#### W19 – Beheer: registratie corrigeren

![W19 – Beheer: registratie corrigeren](wireframes/w19-registraties-correctie.jpg)

**Omschrijving.** De rij van Lotte van Dijk is opengeklapt. Per product staan een rode `−`-knop, het aantal (Blikje 2, Ei 1, de rest 0) en een groene `+`-knop. `−` verwijdert de laatste registratie van dat product, `+` voegt er één toe. Iedere correctie geeft een melding en komt in het logboek.

**UI-principes:**
- *Progressieve onthulling:* de producten van een medewerker zijn pas zichtbaar na openklappen.
- *Kleur met betekenis:* rood voor verlagen, groen voor verhogen.
- *Consistentie:* dezelfde `−` / aantal / `+`-opbouw als in het productvenster (W07).

**Nielsen-heuristieken:**
- *H3:* een verkeerde registratie is door de beheerder terug te draaien.
- *H1:* het aantal per product is direct zichtbaar en verandert na iedere klik.
- *H9:* fouten van medewerkers zijn hier te herstellen.

#### W20 – Beheer: filter zonder registraties

![W20 – Beheer: filter zonder registraties](wireframes/w20-registraties-geen-resultaat.jpg)

**Omschrijving.** Bij het filter `Mark Jansen` zijn er geen registraties. In de tabel staat een lege toestand met een icoon en "Geen registraties voor deze filters.", gevolgd door de uitleg "Kies een andere medewerker of maand, of kies weer voor alle medewerkers en maanden." (in de screenshot net onder de rand). Met dit filter geeft `CSV exporteren` de melding "Geen registraties om te exporteren voor deze filters."

**UI-principes:**
- *Feedback:* een lege tabel krijgt een uitleg in plaats van alleen kolomkoppen.
- *Consistentie:* zelfde opbouw van de lege toestand als in W06.

**Nielsen-heuristieken:**
- *H1:* het filter staat zichtbaar ingesteld, zodat duidelijk is waarom de tabel leeg is.
- *H9:* de uitleg zegt hoe de gebruiker weer resultaten krijgt.
- *H5:* er wordt geen leeg CSV-bestand gemaakt.

#### W21 – Beheer: Medewerkers

![W21 – Beheer: Medewerkers](wireframes/w21-medewerkers.jpg)

**Omschrijving.** Het tabblad `Medewerkers` met de knop `Medewerker toevoegen`, een zoekveld ("Medewerker zoeken, wijzigen of activeren") en de lijst. Per medewerker staan de naam en een regel met status, bedrijf, consumptiepunt en personeelsnummer (bijvoorbeeld "Actief · TVB · Hoofdkantoor · Geen personeelsnummer"), met de knoppen `Deactiveren` en `Wijzigen`. De knop `Verwijderen` verschijnt alleen bij een inactieve medewerker en vraagt dan eerst om bevestiging.

**UI-principes:**
- *Groeperen:* alle gegevens van één medewerker staan in één rij, de acties rechts.
- *Visuele hiërarchie:* de naam is vet, de details eronder kleiner en grijs.
- *Consistentie:* iedere rij heeft dezelfde knoppen op dezelfde plek.

**Nielsen-heuristieken:**
- *H1:* de status (`Actief`) staat bij iedere medewerker.
- *H5:* een actieve medewerker kan niet direct worden verwijderd; eerst deactiveren, dan verwijderen met bevestiging.
- *H3:* deactiveren is met `Activeren` terug te draaien.

#### W22 – Medewerker toevoegen

![W22 – Medewerker toevoegen](wireframes/w22-medewerker-toevoegen.jpg)

**Omschrijving.** Het formulier `Medewerker toevoegen` (boven het beheer) met de velden Voornaam, Achternaam, Looncode, Personeelsnummer, Bedrijf, Consumptiepunt en `Afwijkend werkgevernummer (optioneel)`. Naast dat laatste veld staat "Leeg laten = werkgevernummer van het bedrijf." De keuzelijst Consumptiepunt toont alleen de punten van het gekozen bedrijf; zonder bedrijf staat er "Geen consumptiepunt bij dit bedrijf". Onderaan staan `Annuleren`, `Opslaan` en `Opslaan + opnieuw`.

**UI-principes:**
- *Uitlijning:* de velden staan in twee nette kolommen.
- *Groeperen:* naam, nummers en koppeling met bedrijf en punt staan per paar naast elkaar.
- *Toegankelijkheid:* ieder veld heeft een label boven het veld.
- *Visuele hiërarchie:* `Opslaan + opnieuw` is de groene hoofdknop.

**Nielsen-heuristieken:**
- *H5:* bedrijf en consumptiepunt worden gekozen uit een lijst, dus een tikfout is niet mogelijk en een punt van een ander bedrijf kan niet.
- *H7:* met `Opslaan + opnieuw` voegt de beheerder snel meerdere medewerkers achter elkaar toe.
- *H10:* de hint bij het werkgevernummer legt uit wat leeg laten betekent.
- *H3:* `Annuleren` en het kruisje sluiten het formulier zonder op te slaan.

#### W23 – Medewerker toevoegen met foutmeldingen

![W23 – Medewerker toevoegen met foutmeldingen](wireframes/w23-medewerker-foutmeldingen.jpg)

**Omschrijving.** Het formulier is leeg opgeslagen. De verplichte velden hebben een rode rand en eronder staat met een waarschuwingsteken "Vul dit veld in." of, bij Bedrijf, "Maak een keuze." Het eerste foute veld krijgt de focus. Zodra de gebruiker een veld aanpast, verdwijnt de melding bij dat veld. Het optionele veld en Consumptiepunt krijgen geen melding.

**UI-principes:**
- *Feedback:* iedere fout staat direct onder het veld waar hij bij hoort.
- *Kleur met betekenis:* rood voor fouten, samen met een icoon (niet alleen kleur).
- *Toegankelijkheid:* de focus springt naar het eerste foute veld.

**Nielsen-heuristieken:**
- *H9:* de melding zegt per veld wat er moet gebeuren.
- *H5:* er wordt niets opgeslagen zolang verplichte velden leeg zijn.
- *H1:* de rode randen laten in één oogopslag zien welke velden nog ontbreken.

#### W24 – Medewerker wijzigen

![W24 – Medewerker wijzigen](wireframes/w24-medewerker-wijzigen.jpg)

**Omschrijving.** Na `Wijzigen` bij Lotte van Dijk opent hetzelfde formulier met de titel `Medewerker wijzigen` en de uitleg "Pas de gegevens aan en klik daarna op Opslaan." De velden zijn ingevuld met haar gegevens (TVB, Hoofdkantoor). Bij wijzigen zijn er alleen de knoppen `Annuleren` en `Opslaan`. Bij het openen verschijnt kort de melding "Gegevens geladen om te wijzigen" (niet in de screenshot).

**UI-principes:**
- *Consistentie:* toevoegen en wijzigen gebruiken hetzelfde formulier.
- *Feedback:* titel en uitleg laten zien dat het om wijzigen gaat.

**Nielsen-heuristieken:**
- *H1:* de titel maakt het verschil tussen toevoegen en wijzigen duidelijk.
- *H6:* de huidige gegevens staan al ingevuld.
- *H4:* dezelfde velden en volgorde als bij toevoegen.

#### W25 – Beheer: Producten

![W25 – Beheer: Producten](wireframes/w25-producten.jpg)

**Omschrijving.** Het tabblad `Producten` met de knop `Product toevoegen` en de lijst van acht producten met hun prijs (van Blikje € 0,65 tot Yoghurt € 0,50). Per product staan de knoppen `Wijzigen` (groen) en `Verwijderen` (rood). Een product dat al eens is geregistreerd, kan niet worden verwijderd; dan verschijnt de melding "Dit product wordt al gebruikt en kan niet worden verwijderd".

**UI-principes:**
- *Kleur met betekenis:* rood voor verwijderen, groen voor wijzigen.
- *Consistentie:* dezelfde lijstopbouw als bij Medewerkers.
- *Uitlijning:* de knoppen staan in iedere rij recht onder elkaar.

**Nielsen-heuristieken:**
- *H5:* een product met registraties kan niet weg, zodat oude registraties en de export blijven kloppen.
- *H4:* `Wijzigen` en `Verwijderen` staan in iedere lijst op dezelfde plek.
- *H9:* als verwijderen niet mag, zegt de melding waarom.

#### W26 – Product toevoegen

![W26 – Product toevoegen](wireframes/w26-product-toevoegen.jpg)

**Omschrijving.** Het formulier `Product toevoegen` met de velden `Productnaam` (voorbeeld "bijv. Soep") en `Prijs in euro` (voorbeeld "bijv. 0.65") en de knoppen `Annuleren`, `Opslaan` en `Opslaan + opnieuw`.

**UI-principes:**
- *Witruimte en eenvoud:* maar twee velden.
- *Consistentie:* dezelfde opbouw en knoppen als het medewerkersformulier (W22).

**Nielsen-heuristieken:**
- *H2:* "Prijs in euro" zegt in welke eenheid de prijs moet.
- *H10:* de voorbeelden in de velden laten zien wat er verwacht wordt.
- *H7:* `Opslaan + opnieuw` voor meerdere producten achter elkaar.

#### W27 – Product met een bestaande naam

![W27 – Product met een bestaande naam](wireframes/w27-product-dubbele-naam.jpg)

**Omschrijving.** Er is geprobeerd een nieuw product "Blikje" op te slaan. Omdat die naam al bestaat, krijgt het veld een rode rand en staat eronder "Er bestaat al een product met deze naam." Het venster blijft open en er is niets opgeslagen.

**UI-principes:**
- *Feedback:* de fout staat direct onder het veld.
- *Consistentie:* dezelfde foutweergave als in W23.

**Nielsen-heuristieken:**
- *H5:* dubbele productnamen worden tegengehouden, zodat de lijst en de export niet verwarrend worden.
- *H9:* de melding zegt precies wat er mis is.

#### W28 – Beheer: Bedrijven en consumptiepunten

![W28 – Beheer: Bedrijven en consumptiepunten](wireframes/w28-bedrijven.jpg)

**Omschrijving.** Het tabblad `Bedrijven` met de knop `Bedrijf toevoegen` en de bedrijven op alfabetische volgorde (E-Control, Home Service Nederland, IT Supervision, Klik, MVIE, …). Ieder bedrijf is een blok met het werkgevernummer en het aantal medewerkers, en de knoppen `Consumptiepunt` (met plusteken), `Wijzigen` en `Verwijderen`. Daaronder staan de consumptiepunten van dat bedrijf, met hoeveel producten er worden aangeboden en het aantal medewerkers (bijvoorbeeld Kantine IT: "2 van 8 producten"), en de knoppen `Aanbod wijzigen` en `Verwijderen`. Zonder punt staat er "Nog geen consumptiepunt."

**UI-principes:**
- *Groeperen:* de consumptiepunten staan ingesprongen onder hun bedrijf, in hetzelfde blok.
- *Visuele hiërarchie:* bedrijven zijn groter en vet, punten iets kleiner en ingesprongen.
- *Consistentie:* dezelfde knoppen en kleuren als op de andere tabbladen.

**Nielsen-heuristieken:**
- *H1:* per bedrijf en punt is te zien hoeveel medewerkers en producten erbij horen, en of het werkgevernummer bekend is.
- *H5:* een bedrijf met medewerkers of consumptiepunten kan niet worden verwijderd, en een consumptiepunt met medewerkers ook niet. Verwijderen vraagt altijd om bevestiging.
- *H2:* de opbouw volgt de echte organisatie: bedrijven met hun eigen kantines.

#### W29 – Bedrijf wijzigen

![W29 – Bedrijf wijzigen](wireframes/w29-bedrijf-wijzigen.jpg)

**Omschrijving.** Het formulier `Bedrijf wijzigen` voor IT Supervision met de uitleg "Het werkgevernummer komt in de CSV-export bij de medewerkers van dit bedrijf, behalve bij wie een afwijkend nummer heeft." en de velden `Bedrijfsnaam` en `Werkgevernummer` (nog leeg).

**UI-principes:**
- *Witruimte en eenvoud:* twee velden en twee knoppen.
- *Consistentie:* zelfde vensteropbouw als de andere formulieren.

**Nielsen-heuristieken:**
- *H10:* de uitleg zegt waar het werkgevernummer voor wordt gebruikt.
- *H2:* termen uit de salarisadministratie (werkgevernummer) die de beheerder kent.

#### W30 – Consumptiepunt toevoegen met aanbod

![W30 – Consumptiepunt toevoegen met aanbod](wireframes/w30-consumptiepunt-aanbod.jpg)

**Omschrijving.** Het formulier `Consumptiepunt toevoegen`, geopend via `Consumptiepunt` bij IT Supervision. De uitleg is "Zet aan welke producten hier worden aangeboden. Medewerkers van dit punt zien alleen deze producten." Er zijn velden voor `Naam` (Kantine IT) en `Bedrijf` (IT Supervision staat al gekozen) en een blok `Aanbod` met een vinkje per product. Hier zijn Blikje en Glas melk aangevinkt.

**UI-principes:**
- *Groeperen:* de producten staan samen in een omkaderd blok `Aanbod`.
- *Uitlijning:* de vinkjes staan in drie kolommen.
- *Affordance:* vinkjes laten zien dat meerdere producten tegelijk kunnen worden gekozen.

**Nielsen-heuristieken:**
- *H6:* alle producten staan in beeld; de beheerder hoeft ze niet te kennen.
- *H5:* het bedrijf staat al ingevuld vanuit het bedrijf waar op is geklikt.
- *H10:* de uitleg zegt wat het aanbod voor medewerkers betekent.

#### W31 – Beheer: Voorraad

![W31 – Beheer: Voorraad](wireframes/w31-voorraad.jpg)

**Omschrijving.** Het tabblad `Voorraad`. Bovenaan staat een oranje blok `Bijbestellen (3)` met alle aangeboden producten die op zijn of bijna op zijn, over alle punten: een oranje label `Bijbestellen` bij "TVB · Hoofdkantoor — Blikje: 4 (minimum 6)" en twee rode labels `Op` bij Kantine IT (nieuw punt, nog voorraad 0). De naam van het punt is een link die de voorraad van dat punt opent. Daaronder kiest de beheerder een consumptiepunt (de lijst is per bedrijf gegroepeerd) en ziet een tabel met Product, Voorraad, Minimum, Status en Levering. Voorraad en minimum zijn direct aan te passen; bij Levering vult de beheerder een aantal in en klikt op `Toevoegen`. De status is `Op` bij 0, `Bijbestellen` bij een voorraad op of onder het minimum en anders `Op voorraad`.

**UI-principes:**
- *Visuele hiërarchie:* wat aandacht nodig heeft, staat bovenaan in een opvallend blok.
- *Kleur met betekenis:* rood voor op, oranje voor bijbestellen, groen voor op voorraad, telkens met tekst erbij.
- *Uitlijning:* een tabel met vaste kolommen.
- *Feedback:* na het aanpassen van voorraad of minimum verandert de status direct.

**Nielsen-heuristieken:**
- *H1:* de bijbestellijst en de statuslabels tonen de voorraad zonder te hoeven rekenen.
- *H2:* "Bijbestellen", "Op" en "Levering" zijn woorden uit de praktijk.
- *H7:* de links in de bijbestellijst springen direct naar het juiste punt; voorraad en minimum zijn in de tabel zelf aan te passen.
- *H4:* dezelfde kleuren betekenen overal hetzelfde.

#### W32 – Voorraad van een punt zonder aanbod

![W32 – Voorraad van een punt zonder aanbod](wireframes/w32-voorraad-punt-zonder-aanbod.jpg)

**Omschrijving.** In de voorraad is Kantine Klik gekozen. Dit punt biedt nog niets aan, dus de tabel toont een lege toestand met een pakket-icoon: "Dit consumptiepunt biedt nog geen producten aan.", "Zet producten aan via Bedrijven en dan Aanbod wijzigen." en de knop `Naar Bedrijven`, die direct naar dat tabblad gaat.

**UI-principes:**
- *Feedback:* de lege tabel legt uit waarom hij leeg is.
- *Affordance:* de knop brengt de gebruiker naar de plek waar het op te lossen is.
- *Consistentie:* zelfde lege toestand als in W06, W11 en W20.

**Nielsen-heuristieken:**
- *H9:* de melding zegt wat er ontbreekt en hoe het op te lossen is.
- *H10:* de uitleg noemt de stappen (Bedrijven, dan Aanbod wijzigen).
- *H7:* `Naar Bedrijven` scheelt zoeken naar het juiste tabblad.

#### W33 – Beheer: Logboek

![W33 – Beheer: Logboek](wireframes/w33-logboek.jpg)

**Omschrijving.** Het tabblad `Logboek` met een tabel van Actie, Details en Datum & tijd, nieuwste bovenaan. Hier staan de acties die in de beheer-screenshots zijn gedaan, zoals "Consumptiepunt toegevoegd — Kantine IT (IT Supervision), 2 producten aangeboden", "Medewerker gewijzigd — Tom de Groot" en "Voorraad geteld — Blikje op TVB · Hoofdkantoor: 4". Het logboek toont 20 regels per keer; als er meer zijn, verschijnt `Meer laden`. Het logboek bevat de wijzigingen van de beheerder; de registraties die medewerkers zelf doen, staan op het tabblad Registraties.

**UI-principes:**
- *Uitlijning:* vaste kolommen met datum en tijd rechts.
- *Witruimte en eenvoud:* één tabel, zonder extra knoppen.
- *Progressieve onthulling:* eerst de 20 nieuwste regels, de rest met `Meer laden`.

**Nielsen-heuristieken:**
- *H1:* de beheerder kan terugzien wat er is gewijzigd en wanneer.
- *H2:* de acties staan in gewone zinnen met namen in plaats van codes.
- *H9:* bij een vergissing is te zien wat er is gebeurd, zodat het kan worden hersteld.

#### W34 – Foutmelding bij een levering

![W34 – Foutmelding bij een levering](wireframes/w34-foutmelding.jpg)

**Omschrijving.** In de voorraad is op `Toevoegen` geklikt zonder een geleverd aantal in te vullen. Onderaan verschijnt een melding met een waarschuwingsteken: "Vul een geleverd aantal van minimaal 1 in". De voorraad is niet veranderd.

**UI-principes:**
- *Feedback:* de actie geeft direct een reactie, ook als hij niet lukt.
- *Kleur met betekenis:* een foutmelding heeft een waarschuwingsteken in plaats van het vinkje uit W09.
- *Consistentie:* de melding staat op dezelfde plek als alle andere meldingen.

**Nielsen-heuristieken:**
- *H5:* een lege of negatieve levering wordt niet geboekt.
- *H9:* de melding zegt wat er moet gebeuren.
- *H1:* de gebruiker ziet waarom de voorraad niet is veranderd.

## 10. Use cases en procesbeschrijvingen

Iedere use case beschrijft eerst wat de gebruiker doet en daarna wat het systeem technisch doet.

### Product registreren

**Actor:** Medewerker

1. De medewerker opent de website en zoekt zijn of haar naam.
2. De medewerker klikt op de eigen medewerkerkaart.
3. Het productvenster toont alleen de producten van het eigen consumptiepunt.
4. De medewerker kiest producten met de `+`-knoppen en klikt op `Registreren`.

**Verwerking:**

1. Voor iedere gekozen eenheid maakt `RegistrationModel.addRegistration` een registratie met product, consumptiepunt, datum en tijd.
2. De voorraad van het consumptiepunt gaat per registratie 1 omlaag.
3. `RegistrationApp.persist` slaat alles op. Lukt dat niet, dan wordt de wijziging teruggedraaid en krijgt de gebruiker een foutmelding.
4. De totalen worden vernieuwd en de gebruiker krijgt een bevestiging.

### Registratie corrigeren

**Actor:** Beheerder

1. De beheerder klikt op `Admin login` en logt in.
2. De beheerder zoekt de medewerker in het tabblad `Registraties`.
3. De beheerder klikt bij een product op `+` of `−`.

**Verwerking:**

1. Met `+` wordt een registratie toegevoegd en gaat de voorraad van het consumptiepunt van de medewerker 1 omlaag.
2. Met `−` verwijdert `removeLastRegistration` de laatste registratie van dat product en zet het product terug op het punt uit de registratie.
3. De correctie komt in het logboek en het overzicht wordt vernieuwd.

### Medewerker beheren

**Actor:** Beheerder

1. De beheerder opent het tabblad `Medewerkers`.
2. De beheerder vult de gegevens in en kiest bedrijf en consumptiepunt, of zoekt een bestaande medewerker om te wijzigen.
3. De beheerder zet een medewerker actief of inactief. Een inactieve medewerker kan definitief worden verwijderd, na bevestiging.

**Verwerking:**

1. Een nieuwe medewerker krijgt een unieke id.
2. Een inactieve medewerker verdwijnt uit de openbare lijst.
3. Bij verwijderen blijven oude registraties bewaard; in het overzicht staat bij die registraties `Verwijderd`.
4. Iedere wijziging komt in het logboek.

### Consumptiepunt en aanbod instellen

**Actor:** Beheerder

1. De beheerder opent het tabblad `Bedrijven`.
2. De beheerder klikt bij een bedrijf op `+ Consumptiepunt` of bij een bestaand punt op `Aanbod wijzigen`.
3. De beheerder vult de naam in en vinkt de producten aan die op dit punt worden aangeboden.

**Verwerking:**

1. `savePoint` slaat naam, bedrijf en aanbod op. Voorraad en minimum van bestaande producten blijven behouden.
2. Medewerkers van dit punt zien voortaan alleen de aangevinkte producten.
3. Een bedrijf of punt met gekoppelde medewerkers kan niet worden verwijderd.

### Voorraad bijhouden

**Actor:** Beheerder

1. De beheerder opent het tabblad `Voorraad` en ziet bovenaan wat bijbesteld moet worden.
2. Na een levering vult de beheerder het geleverde aantal in en klikt op `+ Toevoegen`.
3. Na het tellen past de beheerder de voorraad direct aan.
4. De beheerder stelt per product een minimum in.

**Verwerking:**

1. Een levering telt het geleverde aantal op bij de voorraad (`changeStock`).
2. Na tellen vervangt `setStock` de voorraad; `setMinimum` past het minimum aan.
3. `stockAlerts` verzamelt alle aangeboden producten met status `Op` of `Bijbestellen` voor de bijbestellijst.
4. Iedere levering, telling en minimumwijziging komt in het logboek.

### CSV-export maken

**Actor:** Beheerder

1. De beheerder kiest eventueel een medewerker en consumptiemaand. Bij iedere maand staat de bijbehorende loonmaand.
2. De beheerder klikt op `CSV exporteren`.

**Verwerking:**

1. De applicatie verzamelt de registraties die bij de filters passen.
2. Per registratie wordt de loonmaand bepaald: de maand na de consumptie (`RegistrationModel.payrollPeriod`).
3. De registraties worden per medewerker per loonmaand opgeteld, met de prijzen uit het productbeheer.
4. Het CSV-bestand wordt gedownload, zonder totaalregel.

## 11. Interfaces

### CSV

De class `CsvExport` (`assets/js/csvExport.js`) maakt zelf een CSV-bestand, bedoeld voor de loonadministratie:

- kolommen in vaste volgorde: Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal, Prijs;
- Jaar en Maand zijn de **loonmaand**: consumpties worden verwerkt in de daaropvolgende maand (september → oktober, december → januari van het volgende jaar);
- één regel per medewerker per loonmaand, zonder totaalregel (de loonadministratie leest iedere regel in als medewerker);
- puntkomma als scheidingsteken en komma als decimaalteken, zodat een Nederlandse Excel het bestand direct goed opent;
- UTF-8 met BOM, zodat letters zoals `é` goed worden getoond;
- waarden die met `=`, `+`, `-` of `@` beginnen krijgen een `'` ervoor, zodat Excel ze niet als formule uitvoert.

### Mogelijke API

| Methode | Endpoint | Doel |
|---|---|---|
| `GET` | `/api/employees` | Medewerkers ophalen |
| `POST` | `/api/employees` | Medewerker toevoegen |
| `PATCH` | `/api/employees/{id}` | Medewerker wijzigen of inactief maken |
| `POST` | `/api/registrations` | Registratie toevoegen |
| `GET` | `/api/registrations` | Registraties ophalen met filters |
| `POST` | `/api/admin/login` | Beheerder inloggen |
| `POST` | `/api/admin/corrections` | Correctie opslaan |
| `GET` | `/api/companies` | Bedrijven met consumptiepunten ophalen |
| `POST` | `/api/companies` | Bedrijf toevoegen |
| `POST` | `/api/points` | Consumptiepunt toevoegen |
| `PATCH` | `/api/points/{id}/products` | Aanbod, voorraad of minimum van een punt wijzigen |
| `POST` | `/api/points/{id}/deliveries` | Levering boeken |
| `GET` | `/api/stock-alerts` | Bijbestellijst ophalen |
| `GET` | `/api/export` | CSV-export maken |

Een koppeling met Active Directory of Microsoft Entra ID kan later worden onderzocht. Deze koppeling zit niet in de demo.

## 12. Exportontwerp

### CSV-bestand

Het CSV-bestand gebruikt altijd deze kolomvolgorde:

1. Jaar
2. Maand
3. Looncode
4. Personeelsnummer
5. Werkgevernummer
6. Naam
7. Totaal
8. Prijs

Jaar en Maand zijn de loonmaand (consumptiemaand + 1). Het werkgevernummer is het afwijkende nummer van de medewerker, of anders dat van het bedrijf. De losse registraties staan in de tabel in het admin-dashboard.

### Exportopties

De huidige export kan filteren op:

- alle medewerkers;
- één medewerker;
- één maand;
- alle beschikbare maanden.

Week- en jaarfilters kunnen later worden toegevoegd.

## 13. Beveiliging

### Authenticatie

De login in de demo is niet echt beveiligd. Elk ingevuld wachtwoord wordt geaccepteerd. In productie moet een echte login met veilige wachtwoorden worden gebruikt.

### Autorisatie

De rechten per rol staan in hoofdstuk 3. In productie moet de server deze rechten controleren; controle in de browser alleen is niet genoeg.

Voor productie zijn ook HTTPS, gehashte wachtwoorden, sessies, server-side controle, logging en back-ups nodig.

### Privacy en de demo gezichtsherkenning

Een gezichtsscan is een biometrisch gegeven en valt onder de bijzondere persoonsgegevens van de AVG (artikel 9). In Nederland mag biometrie alleen worden gebruikt als dat noodzakelijk is voor authenticatie of beveiliging (UAVG artikel 29). Voor het registreren van consumpties is dat niet noodzakelijk: kiezen op naam werkt ook. Toestemming van een medewerker is in een werkrelatie bovendien zelden "vrij gegeven". Gezichtsherkenning is daarom **niet** geschikt voor de echte toepassing.

Om het idee te kunnen laten zien, is het gebouwd als demo (`assets/js/FaceRecognitionDemo.js`) met deze voorwaarden:

- **Uit te schakelen:** met `FACE_DEMO.enabled = false` in `config.js` verdwijnen alle knoppen.
- **Vrijwillig en per medewerker:** een medewerker zet het zelf aan in het eigen productvenster en moet een vinkje zetten voor vrijwillige deelname.
- **Alles op het apparaat:** de herkenning draait in de browser (bibliotheek face-api). Er gaan geen beelden naar een server.
- **Niets bewaard:** er worden geen foto's gemaakt. Van een gezicht wordt alleen een reeks van 128 getallen onthouden, en alleen in het geheugen. Na herladen of sluiten van de pagina is alles weg; uitzetten kan ook direct.
- **Camera alleen als het venster open is:** sluiten zet de camera meteen uit.
- **Extra zekerheid tegen vergissingen:** het grootste gezicht in beeld telt (de persoon voor de camera), en iemand geldt pas als herkend na twee keer achter elkaar dezelfde uitkomst.

Voordat de demo bij TVB met echte medewerkers wordt gebruikt, moet dit worden besproken met de begeleider en de privacyfunctionaris. Voor de echte toepassing is een QR-code of medewerkerspas het advies (zie hoofdstuk 16).

## 14. Foutafhandeling

| Situatie | Wat doet het systeem? |
|---|---|
| Beschadigde JSON | De demo start opnieuw met voorbeelddata |
| Opslaan lukt niet | De wijziging wordt teruggedraaid en de gebruiker krijgt een melding |
| Ongeldige invoer | De gebruiker krijgt een melding |
| Medewerker niet gevonden | De zoeklijst toont een melding |
| Geen registratie om te verwijderen | De gebruiker krijgt een informatiemelding |
| Geen producten op het consumptiepunt | Het productvenster toont een melding in plaats van producten |
| Bedrijf of punt met medewerkers verwijderen | Dit wordt geweigerd met een melding |
| Dubbele naam voor product of consumptiepunt | Dit wordt geweigerd met een melding |
| Geen registraties voor de filters | De export wordt niet gestart en de gebruiker krijgt een melding |
| Pagina geopend als los bestand (`file://`) | De pagina toont een waarschuwing om een lokale webserver te gebruiken |
| Onbevoegde actie (productie) | De actie wordt geweigerd en gelogd |

## 15. Acceptatiecriteria en testscenario's

| Nr. | Test | Verwacht resultaat |
|---|---|---|
| AC-01 | Medewerker zoeken | Alleen passende medewerkers worden getoond. |
| AC-02 | Onbekende naam zoeken | De melding "Geen medewerker gevonden" verschijnt. |
| AC-03 | Product registreren | De registratie wordt opgeslagen en er verschijnt een bevestiging. |
| AC-04 | Pagina opnieuw laden | De registratie bestaat nog. |
| AC-05 | Datum en tijd controleren | Datum en tijd zijn opgeslagen. |
| AC-06 | Medewerker bekijken | Een medewerker ziet geen `−`-knop en geen persoonlijke aantallen. |
| AC-07 | Cateringproduct registreren | Melk, beleg of brood wordt met de juiste prijs opgeslagen. |
| AC-08 | Beschadigde opslag openen | De demo start opnieuw met voorbeelddata. |
| AC-09 | Opslagfout testen | De wijziging wordt teruggedraaid en er verschijnt een melding. |
| AC-10 | Admin-login gebruiken | Het admin-dashboard wordt geopend. |
| AC-11 | Admin `+` gebruiken | De gekozen medewerker krijgt één registratie. |
| AC-12 | Admin `−` gebruiken | De laatste registratie van dat product wordt verwijderd; alleen de gekozen medewerker verandert. |
| AC-13 | Filter gebruiken | Alleen de gekozen gegevens worden getoond. |
| AC-14 | Medewerker toevoegen | De nieuwe medewerker verschijnt in de lijst. |
| AC-15 | Medewerker wijzigen | De gewijzigde medewerkergegevens worden bewaard. |
| AC-16 | Medewerker inactief maken | De medewerker verdwijnt uit de openbare lijst, maar de historie blijft bestaan. |
| AC-17 | Medewerker verwijderen | De medewerker verdwijnt, maar de historie blijft. |
| AC-18 | CSV-export maken | Er wordt een CSV-bestand gedownload. |
| AC-19 | Export openen in Excel | Medewerker, aantal, loonmaand en prijs staan in de juiste kolommen. |
| AC-20 | Exportkolommen controleren | De acht afgesproken kolommen staan in de juiste volgorde. |
| AC-21 | Export van september | Jaar en Maand in de export zijn de loonmaand oktober. |
| AC-22 | Product uitzetten bij een consumptiepunt | Medewerkers van dat punt zien het product niet meer. |
| AC-23 | Nieuw product toevoegen | Het product staat bij alle consumptiepunten uit. |
| AC-24 | Product registreren bij een consumptiepunt | De voorraad van het punt van de medewerker wordt 1 lager. |
| AC-25 | Registratie corrigeren met `−` | De voorraad stijgt weer met 1. |
| AC-26 | Voorraad op of onder het minimum | Het product verschijnt in de bijbestellijst. |
| AC-27 | Levering boeken | De voorraad stijgt met het geleverde aantal en de actie staat in het logboek. |
| AC-28 | Bedrijf met medewerkers verwijderen | Dit wordt geweigerd met een melding. |
| AC-29 | Modal sluiten | De modal sluit zonder uit te loggen. |
| AC-30 | Uitloggen | Het loginvenster verschijnt opnieuw. |
| AC-31 | Mobiel scherm testen | De website blijft goed bruikbaar. |
| AC-32 | Apparaat op donker, instelling "Systeem" | De website opent direct in het donkere thema, zonder eerst wit op te lichten. |
| AC-33 | Slider aanklikken | Het thema wisselt tussen licht en donker; "Systeem" en "Auto" staan uit. Na herladen blijft de keuze bewaard. |
| AC-34 | "Auto" kiezen | Overdag is het thema licht, na zonsondergang donker. |
| AC-35 | Donker thema bekijken | Alle schermen (ook het beheerscherm en de meldingen) zijn donker en goed leesbaar; de tekst is groen. |
| AC-36 | Productvenster: `+`, `+`, `−` op één product | Het aantal is 1 en de knop toont `Registreren (1)`; `−` bij 0 doet niets. |
| AC-37 | Registreren op de tablet | De melding noemt de naam en de producten en is onderaan in het midden goed leesbaar. |
| AC-38 | Formulier leeg opslaan | Onder ieder leeg verplicht veld staat een foutmelding en het eerste veld krijgt de focus. |
| AC-39 | Zoeken zonder resultaat, dan "Zoekopdracht wissen" | Alle medewerkers zijn weer zichtbaar. |
| AC-40 | Voorraad van een punt zonder aanbod | Een lege toestand legt uit wat te doen, met een knop naar Bedrijven. |
| AC-41 | Productvenster openen na een eerdere registratie | De medewerker wordt begroet ("Goedemorgen Lotte, welkom terug.") en ziet de keuze van de vorige keer. |
| AC-42 | "Zelfde als vorige keer" | De aantallen van de vorige keer staan klaar; er is nog niets geregistreerd tot `Registreren`. |
| AC-43 | Demo: gezicht instellen | Zonder vinkje kan het gezicht niet worden vastgelegd; na vastleggen staat "Gezichtsherkenning staat aan (demo)" en is de camera uit. |
| AC-44 | Demo: herkend worden | Na "Herken mij" opent het productvenster van de juiste medewerker met "Je bent herkend met de camera." Na herladen is niemand meer ingesteld. |

Daarnaast worden de regels automatisch getest met unit tests, uitgevoerd met `npm test` en via GitHub Actions:

| Bestand | Wat wordt getest |
|---|---|
| `tests/basis.test.js` | Basisregels: registraties, medewerkers, producten, bedrijven, consumptiepunten, voorraad en export |
| `tests/datastore.test.js` | Opslag: controle van opgeslagen gegevens, omzetten van oude gegevens en mislukte opslag |
| `tests/model.test.js` | Randgevallen in het model: terugdraaien, verhuisde medewerkers, negatieve voorraad en de bijbestellijst |
| `tests/csv-export.test.js` | CSV-export: loonmaand, filters, sortering, afronding en veilige CSV-velden |
| `tests/view-app.test.js` | HTML-escaping, opslaan en terugdraaien, registreren van gekozen producten en logboekteksten |
| `tests/theme.test.js` | Thema: welke instelling bij welk thema hoort, dag en nacht bij "Auto", onthouden van de keuze |
| `tests/welcome-face.test.js` | Welkom en "Zelfde als vorige keer" (welke keuze, alleen aangeboden producten, nog niet registreren), begroeting per tijdstip en de demo gezichtsherkenning (afstand tussen gezichten, herkennen, grootste gezicht, twee keer bevestigen, uitzetten) |

`tests/helpers.js` bevat de gedeelde hulpfuncties, zoals nep-opslag en een testmodel.

## 16. Onderhoud en toekomst

Bij nieuwe code moet de verdeling hetzelfde blijven:

- opslag in `DataStore`;
- regels in `RegistrationModel`;
- HTML-weergave in `RegistrationView`;
- acties in `RegistrationApp`;
- export in `CsvExport` (`csvExport.js`);
- vaste waarden in `config.js`;
- vormgeving in `assets/css/styles.css`;
- vaste paginaopbouw in `index.html`.

De belangrijkste volgende stap is een backend met een gedeelde database, echte login, autorisatie, auditlog en back-ups.

### Toekomstige uitbreidingen

Deze ideeën maken de registratie sneller en moderner. Ze zijn nog niet gebouwd, omdat ze een backend, hardware of een getraind model nodig hebben.

| Idee | Wat het doet | Wat ervoor nodig is | Afweging |
|---|---|---|---|
| **Identificeren met QR-code of medewerkerspas** | De medewerker houdt een persoonlijke QR-code (op de pas of telefoon) voor de camera en is direct herkend. | Een QR-code per medewerker; de camera en de barcode-functie van de browser (Chrome/Edge). | Zelfde gemak als gezichtsherkenning, maar zonder biometrie. **Advies voor de echte toepassing.** |
| **Koppeling met AFAS** | Medewerkers en hun gegevens (looncode, personeelsnummer, werkgevernummer) komen automatisch uit AFAS, en de CSV-export kan direct naar AFAS. | Een backend die de AFAS Profit-connectoren aanroept met een token. Dat token mag nooit in de browser staan. | Voorkomt dubbel invoeren; afstemmen met de IT-afdeling van TVB. |
| **Product scannen met de camera** | De medewerker houdt het product voor de camera; de barcode (EAN) wordt gelezen en het product toegevoegd. | Per product de EAN-code in productbeheer; de barcode-functie van de browser. | Betrouwbaarder dan "AI die het product herkent", omdat ieder product al een barcode heeft. |
| **Spraakbesturing** | "Wat wil je vandaag hebben?" — "Een blikje en een ei." De producten worden automatisch gekozen. | De spraakherkenning van de browser (Web Speech API). | Werkt alleen in Chrome/Edge en stuurt de spraak naar een server van Google of Microsoft; niet offline. |
| **Slim slot op deur of koelkast** | Na identificatie gaat het slot automatisch open, zodat alleen geregistreerde medewerkers producten pakken. | Een elektronisch slot met een koppeling (bijv. via een kleine computer of een slim relais) en een backend die het slot aanstuurt. | Hardware en installatie nodig; beveiliging van de koppeling is belangrijk. |
| **AI-camera in de koelkast** | Een camera ziet welk product wordt gepakt en registreert dat automatisch, inclusief voorraad. | Vaste camera's, een herkenningsmodel dat is getraind op de producten, en een server om het model te draaien. | Veel werk en foutgevoelig (handen, verpakkingen); de barcode-oplossing is een eenvoudiger alternatief. |
