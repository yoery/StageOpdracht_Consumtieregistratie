# Documentatie Consumptieregistratie

## 1. Doel van de applicatie

Consumptieregistratie is een eenvoudige website waarmee medewerkers eten en drinken kunnen registreren. De standaardproducten zijn blikje (€0,65), sneetje brood (€0,10), boter (€0,10), zoet beleg (€0,20), glas melk (€0,20), beleg (€0,50), ei (€0,50) en yoghurt (€0,50). Een medewerker kiest de producten met `+` en `−` en slaat ze op met `Registreren`; ieder gekozen product wordt dan één registratie. Persoonlijke aantallen en kosten zijn alleen zichtbaar voor de beheerder.

Deze versie is een **frontend-demo**. De gegevens worden opgeslagen in `localStorage` van de gebruikte browser. Daardoor zijn de gegevens op één computer/browser beschikbaar, maar nog niet gedeeld tussen alle gebruikers van een bedrijfsnetwerk.

## 2. Bestanden

| Bestand | Functie |
|---|---|
| `index.html` | De HTML-structuur en alle zichtbare onderdelen van de website |
| `assets/css/styles.css` | De volledige vormgeving, kleuren, layout en mobiele weergave |
| `assets/js/main.js` | Startpunt: maakt opslag, model, view en controller aan en start de app |
| `assets/js/config.js` | Vaste waarden: opslagsleutel, kleuren, voorbeeldmedewerkers, standaardproducten, de 13 bedrijven, de tijden van zonsopkomst en zonsondergang en de instellingen van de demo gezichtsherkenning (`FACE_DEMO`) |
| `assets/js/DataStore.js` | Opslag in `localStorage`, validatie en omzetting van oude gegevens |
| `assets/js/RegistrationModel.js` | Gegevens en regels voor registraties, medewerkers, producten en logboek |
| `assets/js/RegistrationView.js` | Weergave van alle onderdelen als HTML |
| `assets/js/RegistrationApp.js` | Controller: verwerkt klikken, formulieren en toetsenbordacties |
| `assets/js/csvExport.js` | Class `CsvExport`: CSV-export voor de loonadministratie (maand + 1) |
| `assets/js/ThemeManager.js` | Class `ThemeManager`: licht en donker thema (Systeem, Auto of zelf kiezen met de slider) |
| `assets/js/icons.js` | De SVG-iconen van de website, met de hulpfunctie `icon(naam)` |
| `assets/js/FaceRecognitionDemo.js` | Class `FaceRecognitionDemo`: de uitschakelbare demo gezichtsherkenning (zie 4.14) |
| `archief/app.js` | Back-up van de originele versie in één bestand; wordt niet meer geladen |
| `archief/app.test.js` | Back-up van de oude tests bij die versie; wordt niet meer uitgevoerd |
| `README.md` | Korte startinformatie voor het project |
| `docs/` | Technisch ontwerp (met daarin ook de functionele eisen en de wireframes), databaseschema en deze documentatie |
| `docs/wireframes/` | Low-fidelity (`lofi-…`), mid-fidelity (`midfi-…`) en high-fidelity (`w…`) wireframes van de schermen, gebruikt in het TO (hoofdstuk 9) |
| `tests/` | Unit tests voor de regels, de opslag, de export, het thema en de welkom- en gezichtsherkenningsfuncties |
| `.github/workflows/ci.yml` | Voert de unit tests automatisch uit op GitHub |

Bij het toevoegen of wijzigen van een medewerker kiest de beheerder een bedrijf uit de keuzelijst en daarna een consumptiepunt van dat bedrijf. Met het bedrijf worden medewerkers op de beginpagina gegroepeerd en gefilterd. Het bedrijfsfilter op de beginpagina is een keuzelijst waarin je ook kunt typen; de lijst filtert direct tijdens het typen en toont alleen bedrijven met actieve medewerkers.

## 3. De website starten

1. Open de projectmap in VS Code.
2. Klik met de rechtermuisknop op `index.html` en kies **Open with Live Server** (extensie "Live Server"). Een andere lokale webserver werkt ook.
3. De website opent in een moderne browser.
4. Er is geen installatie of buildproces nodig.

Dubbelklikken op `index.html` werkt niet: de JavaScript is opgedeeld in modules, en browsers blokkeren modules die via `file://` worden geopend. De pagina toont dan een waarschuwing.

## 4. Gebruikershandleiding

### 4.1 Een medewerker zoeken

Gebruik de zoekbalk boven de medewerkerlijst. Typ een voornaam, achternaam of een deel van een naam. De lijst wordt direct gefilterd.

Met `Ctrl + K` op Windows of `Cmd + K` op macOS krijgt de zoekbalk automatisch de focus.

### 4.2 Een product registreren

1. Zoek je eigen naam.
2. Klik op je naam. Het productvenster opent met alleen de producten van jouw consumptiepunt.
3. Klik bij ieder gewenst product op `+`. Met `−` haal je een verkeerde keuze weer weg (niet lager dan 0).
4. Klik op `Registreren (aantal)` om alle gekozen producten tegelijk op te slaan.
5. Onderaan verschijnt 4 seconden een melding met je naam en de producten, bijvoorbeeld `Lotte van Dijk: 2× Blikje, 1× Ei geregistreerd`.

Iedere tik op `+` telt als één product. De datum en tijd worden automatisch toegevoegd zodra je op `Registreren` klikt. Je ziet geen persoonlijk totaal of persoonlijke kosten. Klik je op `Registreren` zonder iets te kiezen, dan verschijnt "Kies eerst minimaal één product". Biedt je consumptiepunt nog niets aan, dan staat er "Geen producten op jouw consumptiepunt."

### 4.3 Admin-dashboard openen

1. Klik rechtsboven op `Admin login`.
2. Vul een e-mailadres in.
3. Vul een wachtwoord in.
4. Klik op `Inloggen`.

In deze demo wordt niet gecontroleerd of het wachtwoord echt correct is. Elk ingevuld wachtwoord werkt. Dit is alleen geschikt voor demonstratie en niet voor productie.

### 4.4 Registraties beheren

In het tabblad `Registraties` ziet de beheerder:

- De filters `Medewerker` en `Maand` en de knop `CSV exporteren`
- Onder `Medewerker corrigeren`: een zoekveld en per medewerker het aantal producten en het bedrag
- Een tabel met medewerker, product, aantal en datum en tijd, nieuwste bovenaan

De beheerder zoekt onder `Medewerker corrigeren` eerst een medewerker op en klapt de rij open. Per product staan daar een rode `−`, het aantal en een groene `+`. Met `+` wordt één registratie van dat product toegevoegd, met `−` wordt de laatste registratie van dat product bij die medewerker verwijderd. Iedere correctie komt in het logboek. De losse registraties in de tabel zijn alleen ter inzage; correcties gebeuren dus altijd via `Medewerker corrigeren`.

De keuzelijsten boven de tabel filteren op medewerker of maand. Zijn er voor de filters geen registraties, dan staat er "Geen registraties voor deze filters."

### 4.5 Medewerkers beheren

Open het tabblad `Medewerkers`.

- Vul voornaam, achternaam, looncode en personeelsnummer in.
- Kies het bedrijf en daarna het vaste consumptiepunt van de medewerker. De keuzelijst toont alleen de punten van het gekozen bedrijf. De medewerker ziet bij het registreren alleen de producten van dat punt, en de voorraad van dat punt gaat omlaag.
- Het werkgevernummer komt standaard van het bedrijf. Heeft een medewerker een ander werkgevernummer (bijvoorbeeld per teamleider), vul dan `Afwijkend werkgevernummer` in; dat nummer gaat dan voor in de CSV-export.
- Klik op `Opslaan` om een medewerker toe te voegen. `Opslaan + opnieuw` houdt het bedrijf en consumptiepunt vast voor de volgende collega.
- Gebruik `Wijzigen` om medewerkergegevens aan te passen.
- Gebruik `Deactiveren` of `Activeren` om de medewerkerstatus te wijzigen.

Voornaam, achternaam, looncode, personeelsnummer en bedrijf zijn verplicht. Ontbreekt er iets, dan krijgt het veld een rode rand met een melding eronder en krijgt het eerste foute veld de focus. De voornaam en achternaam worden apart opgeslagen (`firstName`, `lastName`); de volledige naam (`name`) wordt daaruit samengesteld.

Een inactieve medewerker kan daarna met `Verwijderen` definitief worden verwijderd; de browser vraagt eerst om bevestiging. De registraties blijven wel bestaan, zodat de administratie de historie houdt.

### 4.6 Producten beheren

Open het tabblad `Producten` en klik op `+ Product toevoegen`. Het formulier heeft dezelfde opties als het medewerkersformulier:

- `Opslaan`: opslaan en het formulier sluiten.
- `Opslaan + opnieuw`: opslaan, de velden leegmaken en het formulier open laten.

Een nieuw product staat bij alle consumptiepunten **uit**. Zet het daarna aan bij de punten die het aanbieden (zie 4.7).

Twee producten met dezelfde naam kan niet: dan verschijnt "Er bestaat al een product met deze naam." Een product dat al eens is geregistreerd, kan niet worden verwijderd, zodat oude registraties en de export blijven kloppen.

### 4.7 Bedrijven en consumptiepunten beheren

Open het tabblad `Bedrijven`. Standaard staan de 13 bedrijven van TVB erin. Onder ieder bedrijf staan de consumptiepunten van dat bedrijf. Een bedrijf kan geen, één of meerdere consumptiepunten hebben.

- `+ Bedrijf toevoegen` en `Wijzigen`: bedrijfsnaam en werkgevernummer invullen. Het werkgevernummer komt in de CSV-export bij de medewerkers van dat bedrijf, behalve bij medewerkers met een afwijkend werkgevernummer.
- `+ Consumptiepunt`: een nieuw punt bij dat bedrijf toevoegen. Geef het een naam (bijv. `Kantine begane grond`) en vink aan welke producten er worden aangeboden.
- `Aanbod wijzigen`: naam, bedrijf of aangeboden producten van een punt aanpassen. De voorraad blijft bewaard, ook als een product tijdelijk uit staat.
- `Verwijderen`: kan alleen als er geen medewerkers meer aan het bedrijf of punt gekoppeld zijn. Een bedrijf kan ook pas worden verwijderd als het geen consumptiepunten meer heeft.

### 4.8 Voorraad beheren

Open het tabblad `Voorraad`.

- Bovenaan staat de lijst **Bijbestellen** met alle aangeboden producten die `Op` zijn (voorraad 0 of minder) of op of onder het minimum zitten (`Bijbestellen`), over alle consumptiepunten. Klik op een punt om de voorraad daarvan te openen.
- Kies een consumptiepunt om de voorraad per product te zien.
- **Levering**: vul het geleverde aantal in en klik op `+ Toevoegen`. Het aantal komt bij de voorraad.
- **Voorraad**: na het tellen kun je het getal direct aanpassen. Het wordt opgeslagen zodra je het veld verlaat.
- **Minimum**: bij dit aantal of minder verschijnt het product in de bijbestellijst.

Iedere registratie haalt automatisch 1 van de voorraad af bij het consumptiepunt van de medewerker. Een correctie met `−` in het admin-dashboard zet het product weer terug. Een negatieve voorraad betekent dat er meer is geregistreerd dan er volgens de telling was; tel dan opnieuw. Alle leveringen, tellingen en wijzigingen van het minimum komen in het logboek.

### 4.9 Logboek bekijken

Het tabblad `Logboek` toont standaard maximaal 20 wijzigingen. Met `Meer laden` worden steeds 20 extra wijzigingen getoond.

### 4.10 Modal sluiten en uitloggen

Het kruisje rechtsboven sluit alleen het admin-overzicht. De beheerder blijft ingelogd zolang de pagina open is. Met de knop `Uitloggen` wordt de adminsessie beëindigd en verschijnt bij het volgende openen opnieuw het loginformulier.

### 4.11 CSV exporteren

1. Open het admin-dashboard.
2. Kies eventueel een medewerker en/of maand. Achter iedere maand staat de loonmaand waarin die wordt verwerkt, bijvoorbeeld `september 2026 (loonmaand oktober 2026)`.
3. Klik op `CSV exporteren`.
4. De browser downloadt een `.csv`-bestand, bijvoorbeeld `blikjesregistratie-loonmaand-2026-10.csv`.

Het bestand heeft altijd de kolommen `Jaar`, `Maand`, `Looncode`, `Personeelsnummer`, `Werkgevernummer`, `Naam`, `Totaal` en `Prijs`, in die vaste volgorde. Iedere regel is één medewerker in één loonmaand. Er staat bewust geen totaalregel in, omdat de loonadministratie iedere regel als medewerker inleest.

**Loonmaand:** consumpties worden verwerkt in de loonadministratie van de maand erna. `Jaar` en `Maand` in de export zijn daarom de loonmaand: consumpties uit september 2026 staan als `2026` / `10` in het bestand, consumpties uit december 2026 als `2027` / `1`.

Het bestand gebruikt puntkomma's als scheidingsteken en een komma als decimaalteken (`0,65`), zodat een Nederlandse Excel het direct goed opent. De gekozen filters worden toegepast op de export. Producten en prijzen worden uit de administratie gehaald. Losse registraties staan in de tabel in het admin-dashboard.

### 4.12 Licht of donker thema

Rechtsboven in de bovenbalk staat de thema-schakelaar:

- **Systeem** (standaard): de website volgt de instelling van je computer of telefoon. Staat Windows of je telefoon op donker, dan is de website ook donker.
- **Slider (met zon- en maanicoon)**: kies zelf licht of donker. Dit is een vaste keuze; "Systeem" en "Auto" staan daarna uit.
- **Auto**: overdag licht en na zonsondergang donker. De tijden van zonsopkomst en zonsondergang zijn per maand ingesteld voor Nederland (`DAYLIGHT_HOURS` in `config.js`), bijvoorbeeld in december donker vanaf ongeveer 16:30 en in juni vanaf ongeveer 22:00. De website controleert iedere minuut of het tijd is om te wisselen.

De keuze wordt per browser onthouden. In het donkere thema blijven de huiskleuren behouden: de achtergrond wordt donker en de tekst krijgt de groene huiskleur, iets lichter zodat hij goed leesbaar is.

### 4.13 Welkom en "zelfde als vorige keer"

Als een medewerker het productvenster opent, verschijnt een persoonlijke begroeting die past bij het tijdstip, bijvoorbeeld "Goedemorgen Lotte, welkom terug." Heeft de medewerker eerder iets geregistreerd, dan staat erboven wat er de vorige keer is gekozen ("Vorige keer koos je 1× Blikje en 1× Ei."). Met de knop `Zelfde als vorige keer` staan die aantallen direct klaar; de medewerker kan ze nog aanpassen en bevestigt met `Registreren`.

### 4.14 Demo gezichtsherkenning

Dit is een demo; zie het TO (hoofdstuk 13, Privacy) waarom gezichtsherkenning niet geschikt is voor de echte toepassing.

1. Kies je naam in de lijst. Onderaan het productvenster staat `Gezichtsherkenning instellen (demo)`.
2. De camera van de tablet of laptop gaat aan. Plaats je gezicht in het kader, zet het vinkje voor vrijwillige deelname en klik op `Gezicht vastleggen`.
3. Voortaan kun je op de beginpagina op `Herken mij met de camera (demo)` klikken. Word je herkend, dan opent je eigen productvenster.

Er worden geen foto's gemaakt of opgeslagen; de herkenning gebeurt op het apparaat zelf. Na het herladen van de pagina is niemand meer ingesteld. Met `Uitzetten` in het productvenster vergeet de demo je gezicht direct. Met `FACE_DEMO.enabled = false` in `config.js` staat de demo helemaal uit. De camera werkt alleen via `http://localhost` of `https://`.

## 5. Uitleg van `index.html`

### Metadata en externe bestanden

In de `<head>` staan:

- `lang="nl"`: de pagina is Nederlandstalig.
- `charset="utf-8"`: ondersteunt Nederlandse tekens.
- `viewport`: maakt de pagina geschikt voor mobiel.
- De titel en beschrijving voor browser en zoekmachines.
- Google Fonts voor de gebruikte lettertypes.
- `assets/css/styles.css` voor de vormgeving.
- `assets/js/main.js` als startpunt van de JavaScript.

### Navigatiebalk

De `.topbar` bevat:

- Het TVB-logo.
- De naam van de applicatie.
- De themakeuze: een slider voor licht of donker en de knoppen `Systeem` en `Auto` (zie 4.12).
- De status `Systeem actief`.
- De knop `Admin login` waarmee het admin-dashboard wordt geopend.

De HTML is ingedeeld in herkenbare componentblokken: `header` voor navigatie, `main` voor de hoofdinhoud, `section` voor inhoudelijke onderdelen, `aside` voor samenvattingen en `footer` voor de afsluiting. De admin-modal bevat afzonderlijke componenten voor login, tabs, filters en beheeracties. JavaScript gebruikt de `id`-waarden als koppeling met deze componenten.

### Hero-gedeelte

De `.hero` toont de datum van vandaag, een introductietekst en een decoratief recycling-symbool.

De datum wordt niet hardcoded ingevuld. JavaScript vult het element met id `todayLabel` automatisch.

### Medewerkerlijst

De `.directory-card` bevat:

- De titel `Registreer je consumptie`.
- De teller met het aantal medewerkers (id `employeeCount`).
- De knop `Herken mij met de camera (demo)` (id `faceRecognizeButton`); alleen zichtbaar als de demo aan staat en de browser een camera kan gebruiken.
- De zoekbalk met id `employeeSearch` en de sneltoets-hint `Ctrl K`.
- Het bedrijfsfilter met id `employeeCompanyFilter` en de keuzelijst `companyFilterOptions`.
- De lege status met id `emptyState`, met de knop `Zoekopdracht wissen`.
- De dynamische lijst met id `employeeList`.

JavaScript vult `employeeList` op basis van de medewerkers in de applicatiestatus.

### Statistieken

De elementen `todayTotal` en `monthTotal` worden door JavaScript gevuld met:

- Het aantal registraties van vandaag.
- Het aantal registraties van de huidige maand.

Daaronder staat de tipkaart `Goed bezig!`.

### Vensters (modals)

Ieder venster is een `.modal-backdrop` over de website heen. Een venster sluit met het kruisje of met een klik naast het venster.

| Id | Venster |
|---|---|
| `adminModal` | Loginformulier (`loginView`) en beheerdashboard (`adminView`) met zes tabbladen |
| `employeeProductsModal` | Productvenster van een medewerker, met begroeting, voorstel `Zelfde als vorige keer` en de link voor de demo gezichtsherkenning |
| `employeeFormModal` | Medewerker toevoegen of wijzigen |
| `productFormModal` | Product toevoegen of wijzigen |
| `companyFormModal` | Bedrijf toevoegen of wijzigen |
| `pointFormModal` | Consumptiepunt toevoegen of het aanbod wijzigen |
| `faceModal` | Camerabeeld van de demo gezichtsherkenning (instellen of herkennen) |

Het element `toast` toont de korte meldingen onderaan het scherm.

De knop met `data-close-modal` sluit het admin-venster. Deze knop is bewust gescheiden van `Uitloggen`. Een ingelogde beheerder kan het venster sluiten en later opnieuw openen zonder opnieuw in te loggen.

### Waarschuwing bij openen als los bestand

Onderaan `index.html` staat een klein script dat controleert of de pagina via `file://` is geopend. Is dat zo, dan verschijnt bovenaan een balk met de uitleg dat de website via Live Server moet worden gestart (zie hoofdstuk 3).

## 6. Uitleg van `assets/css/styles.css`

### CSS-variabelen

In `:root` staan herbruikbare variabelen:

- `--green`: hoofdgroen van de organisatie.
- `--green-dark`: donkere groene tekst en hoverkleur.
- `--blue`: hoofdblauw.
- `--blue-soft`: lichte blauwe achtergrond.
- `--mint`: lichte groene achtergrond.
- `--ink`: donkere tekstkleur.
- `--muted`: grijze ondersteunende tekst.
- `--line`: randkleur.
- `--paper` en `--paper-soft`: achtergrond van kaarten, invoervelden en tabelkoppen.
- `--danger`, `--error-*` en `--warning-*`: kleuren voor verwijderknoppen, foutmeldingen en de bijbestellijst.
- `--shadow`: standaard schaduw.

Als het organisatiepalet later verandert, kunnen de kleuren centraal worden aangepast.

**Licht en donker thema:** alle kleuren in de stylesheet komen uit deze variabelen. `:root` bevat de lichte kleuren, `:root[data-theme="dark"]` dezelfde variabelen met donkere waarden. De class `ThemeManager` zet `data-theme="light"` of `data-theme="dark"` op het `<html>`-element, en de hele website verandert dan mee. Een klein script in de `<head>` van `index.html` zet het donkere thema al vóór het tekenen van de pagina, zodat de pagina niet eerst wit oplicht. Alleen de witte tekst op groene knoppen, de letters in de avatars en de kleuren van de banner zijn in beide thema's hetzelfde.

De stylesheet is geordend van algemeen naar specifiek:

1. Globale variabelen en reset.
2. Basislayout en navigatie.
3. Hoofdcomponenten zoals hero, kaarten en medewerkerregels.
4. Admincomponenten, tabellen en meldingen.
5. Responsive regels voor kleinere schermen.

Herbruikbare stijlen staan gegroepeerd in componentselectors, bijvoorbeeld `.card`, `.primary-button`, `.stat-card` en `.admin-search`. Hierdoor blijft de styling centraal beheerd en hoeft dezelfde stijl niet op meerdere plekken te worden gekopieerd.

### Layout

De website gebruikt onder andere:

- Flexbox voor navigatie en rijen.
- CSS Grid voor de hoofdinhoud en statistieken.
- De variabelen `--page-width` en `--gutter`, zodat bovenbalk, inhoud en footer dezelfde breedte en zijmarge hebben.
- Een pagina die altijd minstens schermhoog is (`100dvh`), met de footer onderaan.

Media queries:

| Media query | Wat er verandert |
|---|---|
| `max-width: 1100px` | Kleine teksten worden groter, zodat ze op een tablet of telefoon op armlengte leesbaar zijn |
| `min-width: 721px` en `max-width: 900px` | Kleinere zijmarge; de totalen komen onder de medewerkerlijst |
| `min-width: 721px`, `max-width: 1100px` en staand | Compactere banner op een staande tablet, zodat de lijst hoger begint |
| `max-width: 720px` | Telefoonindeling: alles onder elkaar, kleinere zijmarge, minder tekst in de bovenbalk |
| `max-width: 520px` | De naam naast het logo vervalt |
| `hover: none` | De hint `Ctrl K` verdwijnt op aanraakschermen zonder toetsenbord |
| `prefers-reduced-motion: reduce` | Geen animaties voor wie "minder beweging" heeft ingesteld |

### Componenten

De CSS bevat opmaak voor:

- De topbar, het logo en de themakeuze.
- De hero-banner.
- Kaarten, statistieken en de tipkaart.
- Medewerkerregels, het zoekveld en het bedrijfsfilter.
- Het productvenster met `−`- en `+`-knoppen, de begroeting en het voorstel `Zelfde als vorige keer`.
- Het venster van de demo gezichtsherkenning met het ovale kader.
- Admin-modal, tabbladen, tabellen, filters en de voorraadlabels.
- Formulieren met foutmeldingen onder het veld.
- Lege toestanden (icoon, titel, uitleg en eventueel een knop).
- Toastmeldingen (succes met vinkje, fout met waarschuwingsteken).
- De SVG-iconen.
- Mobiele schermen en het donkere thema.

## 7. Uitleg van de JavaScript (`assets/js/`)

### Opslag en voorbeelddata

```js
// config.js
export const STORAGE_KEY = "tvb-blikjesregistratie";
```

Dit is de naam waaronder de applicatie haar gegevens in `localStorage` bewaart.

Bij de eerste start worden acht voorbeeldmedewerkers aangemaakt, met de standaardproducten, de 13 bedrijven en één consumptiepunt (Hoofdkantoor bij TVB). Daarna worden de gegevens uit `localStorage` gebruikt.

De status heeft deze structuur (de velden staan uitgelegd in hoofdstuk 8):

```js
{
  employees: [
    {
      id: "unieke-id",
      name: "Lotte van Dijk",
      firstName: "Lotte",
      lastName: "van Dijk",
      payrollCode: "",
      personnelNumber: "",
      employerNumber: "",
      companyId: "id-van-bedrijf",
      pointId: "id-van-consumptiepunt",
      active: true,
      color: "#d8f1e8"
    }
  ],
  registrations: [
    {
      id: "unieke-id",
      employeeId: "id-van-medewerker",
      productId: "blikje",
      pointId: "id-van-consumptiepunt",
      createdAt: "2026-10-01T10:05:00.000Z"
    }
  ],
  products: [{ id: "blikje", name: "Blikje", price: 0.65 }],
  companies: [{ id: "id-van-bedrijf", name: "TVB", employerNumber: "" }],
  points: [
    {
      id: "id-van-consumptiepunt",
      name: "Hoofdkantoor",
      companyId: "id-van-bedrijf",
      products: { blikje: { offered: true, stock: 24, minimum: 6 } }
    }
  ],
  auditLog: [
    { id: "unieke-id", action: "Product gewijzigd", details: "Blikje", createdAt: "2026-10-01T10:06:00.000Z" }
  ]
}
```

De ingestelde gezichten van de demo gezichtsherkenning staan **niet** in deze status en ook niet in `localStorage`; ze bestaan alleen in het geheugen van de pagina.

### Objectgeoriënteerde structuur

De JavaScript-code volgt het principe van objectgeoriënteerd programmeren (OOP) en het MVC-patroon (Model, View, Controller). De code is opgedeeld in zeven classes: vijf voor de applicatie zelf, `ThemeManager` voor het lichte en donkere thema en `FaceRecognitionDemo` voor de demo gezichtsherkenning. Iedere class heeft één duidelijke verantwoordelijkheid, en bovenaan ieder bestand staat in een comment waarvoor de class is en met welke andere classes hij verbonden is.

```text
DataStore ──► RegistrationModel ──► RegistrationView
                     │                     │
                     ├──► CsvExport        │
                     ▼                     ▼
               RegistrationApp (controller, stuurt model, view, export en FaceRecognitionDemo aan)

ThemeManager (los: alleen het thema van de pagina)
```

`main.js` maakt alle objecten één keer aan en geeft ze aan elkaar door (compositie). `config.js` en `icons.js` bevatten alleen vaste waarden en een hulpfunctie en zijn daarom geen class.

Toegepaste OOP-principes:

- **Encapsulatie:** iedere class beheert zijn eigen gegevens. Andere classes lezen de gegevens van het model via getters (`model.employees`, `model.products`) en wijzigen ze alleen via methodes (`model.addRegistration`, `model.saveCompany`).
- **Eén verantwoordelijkheid per class:** opslag, regels, weergave, besturing en export staan elk in een eigen class.
- **Compositie:** de controller krijgt het model, de view en de export mee in de constructor, in plaats van ze zelf te maken. Daardoor kan in de tests een nep-view of nep-export worden meegegeven.
- **Losse koppeling:** de view weet niets van de controller en verandert geen gegevens. De opslag kan worden vervangen door een andere class met dezelfde methodes `load()` en `save()`.

#### `DataStore`

Verzorgt het lezen en opslaan van gegevens in `localStorage`. `load` controleert met `isValid` of de gegevens compleet zijn. `migrate` zet oude gegevens om (bijvoorbeeld product-id `melk` naar `glas-melk`, of een vrij ingevulde bedrijfsnaam naar een echt bedrijf). Opgeslagen producten gaan altijd voor op de standaardproducten, zodat gewijzigde prijzen en verwijderde producten bewaard blijven. Als later een database wordt gebruikt, kan deze opslaglaag worden vervangen zonder de rest opnieuw te schrijven.

#### `RegistrationModel`

Bevat alle gegevens en regels. De methodes zijn gegroepeerd per onderwerp: registraties, medewerkers, producten, bedrijven, consumptiepunten, voorraad en logboek. Voorbeelden van regels:

- Een registratie verlaagt de voorraad van het consumptiepunt van de medewerker.
- Een bedrijf of consumptiepunt met medewerkers kan niet worden verwijderd.
- De loonmaand is de maand na de consumptie (`payrollPeriod`).
- Met `snapshot` en `restore` kan een wijziging worden teruggedraaid als opslaan mislukt.

#### `RegistrationView`

Verzorgt alleen de presentatie in de browser. Deze class rendert de medewerkerlijst, het productvenster, statistieken, admin-tabellen, filters, voorraad en toastmeldingen. Ook worden namen veilig als HTML weergegeven. De view leest uit het model, maar verandert zelf niets.

#### `RegistrationApp`

Vormt de controller van de applicatie. Deze class koppelt klik- en formulier-events aan het model en laat daarna de view opnieuw renderen. `handleClick` bevat een lijst van knoppen met de actie die erbij hoort; iedere actie is een eigen, korte methode. De methode `persist` zorgt dat iedere wijziging wordt opgeslagen of automatisch wordt teruggedraaid bij een opslagfout.

#### `CsvExport`

Maakt het CSV-bestand voor de loonadministratie (zie verderop).

#### `ThemeManager`

Regelt het lichte en donkere thema (zie 4.12). Onthoudt de instelling (`system`, `auto`, `light` of `dark`) in `localStorage`, bepaalt met `resolveTheme` welk thema daarbij hoort en zet dat met `apply` op de pagina. Deze class staat los van het model, de view en de controller, omdat het thema een weergave-instelling per browser is en geen gegeven van de registratie.

#### `FaceRecognitionDemo`

De uitschakelbare demo gezichtsherkenning (zie 4.14). De class laadt de bibliotheek face-api pas als iemand de demo gebruikt (`load`), zet de camera aan en uit (`startCamera`, `stopCamera`) en leest het grootste gezicht in beeld (`readFace`, `largestFace`). Een gezicht wordt bewaard als een rij getallen (een descriptor), alleen in het geheugen (`enroll`, `forget`). `findMatch` zoekt het ingestelde gezicht met de kleinste afstand onder de drempel uit `FACE_DEMO.matchThreshold`, en `confirm` telt pas als dezelfde persoon twee keer achter elkaar is gevonden. De controller krijgt deze class mee in de constructor.

#### `icons.js`

Bevat de SVG-iconen als lijntekeningen met dezelfde lijndikte. De functie `icon(naam)` geeft de HTML van één icoon; elementen met `data-icon="naam"` in `index.html` krijgen bij het starten hun icoon.

### `renderEmployees`

De methode `RegistrationView.renderEmployees`:

1. Leest de zoekterm en het gekozen bedrijf.
2. Toont alleen actieve medewerkers die daarbij passen.
3. Groepeert de medewerkers per bedrijf.
4. Maakt voor iedere medewerker een klikbare rij (ook te bedienen met Enter of spatie).

De `data-open-employee`-waarde bevat de unieke medewerker-id. Daardoor weet de klikhandler voor welke medewerker het productvenster moet worden geopend.

### `renderStats`

De methode `RegistrationView.renderStats` vergelijkt de datum van iedere registratie met:

- De datum van vandaag.
- De sleutel van de huidige maand.

Daarna worden de twee totalen in de statistiekkaarten geplaatst.

### `registerSelectedProducts`

De methode `RegistrationApp.registerSelectedProducts` wordt uitgevoerd na een klik op `Registreren` in het productvenster. Voor ieder gekozen product maakt `RegistrationModel.addRegistration` een object aan met:

- Een unieke registratie-id.
- De medewerker-id.
- De product-id.
- De huidige datum en tijd in ISO-formaat.

Daarna worden de gegevens via `persist` opgeslagen en alle zichtbare onderdelen opnieuw getekend. Correcties van de beheerder met de `+`-knop lopen via `RegistrationApp.addCorrection` en komen ook in het logboek.

### `renderAll`

De methode `RegistrationView.renderAll` voert `populateCompanyFilter`, `renderEmployees` en `renderStats` achter elkaar uit. Zo blijven het bedrijfsfilter, de medewerkerlijst en de totalen gelijktijdig actueel.

### `renderEmployeeProducts`

De methode `RegistrationView.renderEmployeeProducts` tekent het productvenster: de begroeting (`greeting` kiest Goedemorgen, Goedemiddag of Goedenavond), het voorstel `Zelfde als vorige keer` (uit `RegistrationModel.lastSelection`, beschreven met `describeSelection`), de producten van het consumptiepunt met `−`- en `+`-knoppen en onderaan de link of status van de demo gezichtsherkenning.

### `showToast`

De methode `RegistrationView.showToast` toont een korte melding onderaan in het midden van het scherm, zoals `Lotte van Dijk: 2× Blikje, 1× Ei geregistreerd` met een vinkje ervoor. Foutmeldingen krijgen een waarschuwingsteken. Standaard verdwijnt een melding na 2,5 seconde; de melding na het registreren blijft 4 seconden staan, zodat een medewerker aan een gedeelde tablet kan lezen voor wie en wat er is opgeslagen.

### Opslagfouten en terugdraaien

Iedere wijziging loopt via `RegistrationApp.persist`. Eerst wordt een snapshot van de vorige status gemaakt. Daarna wordt de wijziging uitgevoerd en probeert `DataStore.save` de gegevens op te slaan. Als de browseropslag mislukt, wordt de vorige status teruggezet en krijgt de gebruiker een foutmelding. Zo lijkt een mislukte opslag niet toch succesvol.

### Adminfuncties

`openAdmin` opent de modal. Als `adminLoggedIn` waar is, wordt het dashboard opnieuw getoond; anders verschijnt het loginformulier.

De variabele `adminLoggedIn` houdt de adminstatus alleen bij zolang de huidige pagina open is.

`renderAdmin`:

- Leest de gekozen medewerkerfilter.
- Leest de gekozen maandfilter.
- Filtert de registraties.
- Toont de resultaten in de admin-tabel.

`populateFilters` vult de dropdowns met de huidige medewerkers en maanden die in registraties voorkomen.

`renderAdminEmployees` toont alle medewerkers in het beheertabblad.

### CSV-export (class `CsvExport` in `csvExport.js`)

De export heeft geen externe bibliotheek nodig. Na een klik op `CSV exporteren` roept `RegistrationApp.exportCsv` de methode `CsvExport.download` aan:

1. `buildRows` verzamelt de registraties die bij de filters passen en telt ze per medewerker per loonmaand.
2. `RegistrationModel.payrollPeriod` bepaalt de loonmaand: de maand na de consumptie (december gaat naar januari van het volgende jaar).
3. `toCsv` zet de regels om naar CSV met puntkomma's. `escapeField` zet velden met speciale tekens tussen aanhalingstekens, en geeft waarden die met `=`, `+`, `-` of `@` beginnen een `'` ervoor, zodat Excel ze niet als formule uitvoert.
4. `fileName` maakt de bestandsnaam met de loonmaand.
5. Het bestand wordt gedownload als `.csv` (UTF-8 met BOM, zodat Excel letters zoals `é` goed toont).

Zijn er geen registraties voor de filters, dan geeft `download` `false` terug en toont de controller een melding.

### Event listeners

De event listeners koppelen gebruikersacties aan functies:

De listeners worden in `RegistrationApp` per onderwerp gekoppeld:

| Methode | Wat er wordt gekoppeld |
|---|---|
| `registerPageEvents` | De algemene kliklistener (`handleClick`), het sluiten van het productvenster en het cameravenster, de knoppen `Herken mij met de camera (demo)` en `Gezicht vastleggen`, en het toestemmingsvinkje |
| `registerAdminEvents` | `Admin login`, het sluiten van het admin-venster, inloggen, uitloggen, de tabbladen, `Meer laden` en `CSV exporteren` |
| `registerFilterEvents` | De zoekbalk, het bedrijfsfilter, de filters `Medewerker` en `Maand` en de zoekvelden in het beheer |
| `registerFormEvents` | Openen, opslaan en sluiten van de formulieren voor medewerker, product, bedrijf en consumptiepunt, en het weghalen van een foutmelding zodra een veld wordt aangepast |
| `registerStockEvents` | De keuze van het consumptiepunt en het aanpassen van voorraad of minimum |
| `registerKeyboardEvents` | `Ctrl/Cmd + K` voor de zoekbalk, en Enter of spatie op een medewerkerrij |

Voor dynamisch aangemaakte knoppen gebruikt de app één algemene kliklistener op `document` (`handleClick`). Die bevat een lijst van `data-`-attributen met de actie die erbij hoort, bijvoorbeeld `data-open-employee`, `data-product-increment`, `data-repeat-last` en `data-face-enroll`. Daardoor blijven knoppen werken nadat een lijst opnieuw is opgebouwd.

## 8. Datamodel en koppelingen

De huidige demo gebruikt JavaScript-objecten. De logische koppeling is:

### Bedrijven

| Veld | Betekenis |
|---|---|
| `id` | Unieke identificatie |
| `name` | Bedrijfsnaam |
| `employerNumber` | Standaard werkgevernummer voor de CSV-export |

### Consumptiepunten

| Veld | Betekenis |
|---|---|
| `id` | Unieke identificatie |
| `name` | Naam van het punt, bijv. `Kantine begane grond` |
| `companyId` | Verwijzing naar het bedrijf |
| `products` | Per product-id: `offered` (aangeboden ja/nee), `stock` (voorraad) en `minimum` |

### Medewerkers

| Veld | Betekenis |
|---|---|
| `id` | Unieke identificatie |
| `name`, `firstName`, `lastName` | Naam |
| `payrollCode`, `personnelNumber` | Looncode en personeelsnummer |
| `employerNumber` | Optioneel afwijkend werkgevernummer; leeg = dat van het bedrijf (`RegistrationModel.employerNumberFor`) |
| `companyId` | Verwijzing naar het bedrijf |
| `pointId` | Verwijzing naar het vaste consumptiepunt |
| `active` | Actief of inactief |
| `color` | Kleur van de avatar |

### Registraties

| Veld | Betekenis |
|---|---|
| `id` | Unieke identificatie |
| `employeeId` | Verwijzing naar een medewerker |
| `productId` | Verwijzing naar een product |
| `pointId` | Consumptiepunt waar de voorraad van af ging; bij een correctie gaat het product hier weer naartoe terug |
| `createdAt` | Datum en tijd van registratie |

Oude gegevens uit een eerdere versie worden bij het laden automatisch omgezet (`DataStore.migrateCompanies`): de vrij ingevulde bedrijfsnaam wordt een bedrijf, het eerste werkgevernummer wordt de standaard van dat bedrijf (een afwijkend nummer blijft bij de medewerker staan) en ieder bedrijf met medewerkers krijgt één consumptiepunt met alle producten.

Het aantal is in de demo altijd `1`, omdat iedere klik één registratie maakt. Dit sluit aan bij het voorgestelde datamodel waarin `Aantal` standaard 1 is.

Wanneer een medewerker wordt verwijderd, blijven bestaande registraties behouden voor de administratie. In het admin-overzicht wordt bij zulke historische regels `Verwijderd` getoond.

Voor de CSV-export worden de prijzen uit het productbeheer gebruikt. Het bestand bevat per medewerker per loonmaand het aantal en de totale prijs. Deze gegevens zijn alleen zichtbaar voor de beheerder.

## 9. Belangrijke demo-beperkingen

Deze versie is bedoeld als prototype:

- `localStorage` is niet gedeeld tussen gebruikers.
- Er is geen echte database.
- De login heeft geen echte beveiliging.
- Er zijn geen gebruikersrollen of wachtwoordbeheer.
- Verwijderde medewerkers krijgen geen herstelmogelijkheid.
- Er is geen server-side auditlog; het logboek staat alleen in de browser.
- Het admin-login is een demo en heeft geen echte server-side beveiliging.
- De gezichtsherkenning is alleen een demo. Ingestelde gezichten zijn na het herladen van de pagina weg, en de bibliotheek en modellen worden van internet (jsDelivr) geladen. Zie het TO (hoofdstuk 13) voor de privacyregels.

Voor productie is een backend met een gedeelde database, echte authenticatie, autorisatie, back-ups en auditlogging nodig.

## 10. Code uitleggen tijdens een presentatie

De applicatie volgt het principe van separation of concerns:

1. `DataStore` weet hoe gegevens worden opgeslagen.
2. `RegistrationModel` weet welke gegevens en bedrijfsregels gelden.
3. `RegistrationView` weet hoe gegevens in HTML worden getoond.
4. `RegistrationApp` weet welke actie bij een klik of formulier hoort.
5. `CsvExport` weet hoe het CSV-bestand voor de loonadministratie eruitziet.
6. `ThemeManager` weet welk thema (licht of donker) actief moet zijn.
7. `FaceRecognitionDemo` weet hoe de camera en de demo gezichtsherkenning werken.

De schermen zelf staan als screenshots in het TO, hoofdstuk 9, paragraaf Wireframes (`docs/wireframes/`). Die zijn handig om tijdens een presentatie te laten zien welke code bij welk scherm hoort.

De HTML bevat de componenten en vaste ankerpunten met `id`-waarden. De CSS bepaalt uitsluitend de presentatie. JavaScript koppelt de componenten aan gedrag. Daardoor kan bijvoorbeeld de opslag worden vervangen door een database zonder de volledige gebruikersinterface opnieuw te bouwen.

## 11. Mogelijke vervolgstappen

1. Kies een backend, bijvoorbeeld PHP, Node.js of een beheerde dienst.
2. Maak de tabellen uit `docs/DATABASE-SCHEMA.sql` aan (onder andere medewerkers, registraties, producten, bedrijven, consumptiepunten en het logboek).
3. Vervang `localStorage` door API-aanroepen; alleen `DataStore` hoeft daarvoor te veranderen.
4. Voeg echte admin-authenticatie toe.
5. Bewaar het logboek op de server in plaats van in de browser.
6. Voeg naast het maandfilter ook jaar- en periodefilters toe.
7. Voeg databaseback-ups en foutlogging toe.
8. Test met meerdere gebruikers tegelijk.
