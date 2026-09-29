# Technisch Ontwerp - Blikjesregistratie TVB

**Versie:** 3.0
**Datum:** 29 september 2026
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
- producten kiezen met `+`-knoppen en in één keer registreren;
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
- de eigen medewerkerkaart openen en producten kiezen met plusknoppen;
- de gekozen producten met één knop registreren.

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

Een zesde class, `ThemeManager`, regelt het lichte en donkere thema. Die staat los van de andere classes, omdat het thema een weergave-instelling per browser is en geen gegeven van de registratie.

Daarnaast zijn er twee bestanden zonder class: `main.js` maakt de objecten aan en koppelt ze aan elkaar, en `config.js` bevat vaste waarden zoals de standaardproducten, de bedrijven en de tijden van zonsopkomst en zonsondergang.

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

- een zoekveld en een bedrijfsfilter;
- de actieve medewerkers, gegroepeerd per bedrijf, met naam en avatar;
- het totaal van vandaag en van deze maand (voor alle medewerkers samen);
- na een klik op een medewerker: een productvenster met alleen de producten van het eigen consumptiepunt, een `+`-knop per product en een knop `Registreren`;
- een melding na het opslaan.

Een medewerker ziet geen persoonlijke aantallen of kosten en krijgt geen `−`-knop. Alleen de beheerder kan een registratie verlagen.

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

Rechtsboven in de bovenbalk staat een slider (☀ / ☾) met daarnaast de knoppen `Systeem` en `Auto`:

- `Systeem` (standaard) volgt de instelling van het apparaat;
- de slider kiest vast licht of donker;
- `Auto` is overdag licht en na zonsondergang donker.

Technisch: alle kleuren staan als CSS-variabelen in `:root` (licht) en `:root[data-theme="dark"]` (donker). De class `ThemeManager` zet `data-theme` op het `<html>`-element en bewaart de keuze in `localStorage` onder `tvb-theme`. De tijden van zonsopkomst en zonsondergang staan per maand in `config.js` (`DAYLIGHT_HOURS`), een benadering voor Nederland; iedere minuut wordt gecontroleerd of het thema moet wisselen. Een klein script in de `<head>` zet het donkere thema al vóór het tekenen, zodat de pagina niet eerst wit oplicht. In het donkere thema blijven de huiskleuren behouden en krijgt de tekst een iets lichtere tint van het huisgroen (`#1fbf8c`), zodat hij goed leesbaar is.

### Mobiele weergave

Op een klein scherm komen de onderdelen onder elkaar te staan. Hierdoor blijven de knoppen en teksten goed leesbaar op een telefoon. In de bovenbalk vervallen dan de statustekst, de icoontjes naast de slider en (op telefoons) de naam naast het logo, zodat de thema-knoppen en de admin-knop blijven passen.

De pagina is altijd minstens schermhoog, met de footer onderaan. Staat er weinig op het scherm (bijvoorbeeld op een staande tablet bij het consumptiepunt, of na zoeken op één naam), dan rekt de medewerkerskaart mee tot boven de footer in plaats van dat er onder de footer een leeg vlak ontstaat. Staat er meer op dan past, dan scrollt de pagina zoals normaal.

### Low-fidelity wireframe

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

Bij deze versie gaat het vooral om de grote indeling van het scherm.

### Mid-fidelity wireframe

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

Hier zijn de kaarten, knoppen en informatie al duidelijker uitgewerkt. In de uiteindelijke versie zijn de persoonlijke aantallen weggehaald (FR-29) en opent een klik op de medewerker een productvenster.

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

### Ontwerpkeuzes en Nielsen-heuristieken

- De melding na het registreren laat zien wat er is gebeurd. Dit past bij **zichtbaarheid van de systeemstatus**.
- De zoekbalk voorkomt dat de gebruiker alle namen moet onthouden. Dit past bij **herkenning in plaats van onthouden**.
- De knoppen en kleuren zijn steeds hetzelfde. Dit past bij **consistentie en standaarden**.
- De losse knoppen voor sluiten en uitloggen geven de gebruiker controle. Dit past bij **gebruikerscontrole en vrijheid**.
- Een medewerker kan zelf niet verlagen en ziet alleen producten die op het eigen punt aanwezig zijn. Dit helpt om fouten te voorkomen en past bij **foutpreventie**.
- De website werkt op verschillende schermen. Dit past bij **flexibiliteit en efficiënt gebruik**.
- Oude registraties blijven zichtbaar als `Verwijderd`. Hierdoor kan de gebruiker beter zien wat er met oude gegevens is gebeurd.

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

Daarnaast worden de regels automatisch getest met unit tests, uitgevoerd met `npm test` en via GitHub Actions:

| Bestand | Wat wordt getest |
|---|---|
| `tests/basis.test.js` | Basisregels: registraties, medewerkers, producten, bedrijven, consumptiepunten, voorraad en export |
| `tests/datastore.test.js` | Opslag: controle van opgeslagen gegevens, omzetten van oude gegevens en mislukte opslag |
| `tests/model.test.js` | Randgevallen in het model: terugdraaien, verhuisde medewerkers, negatieve voorraad en de bijbestellijst |
| `tests/csv-export.test.js` | CSV-export: loonmaand, filters, sortering, afronding en veilige CSV-velden |
| `tests/view-app.test.js` | HTML-escaping, opslaan en terugdraaien, registreren van gekozen producten en logboekteksten |
| `tests/theme.test.js` | Thema: welke instelling bij welk thema hoort, dag en nacht bij "Auto", onthouden van de keuze |

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
