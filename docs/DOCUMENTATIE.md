# Documentatie Consumptieregistratie

## 1. Doel van de applicatie

Consumptieregistratie is een eenvoudige website waarmee medewerkers eten en drinken kunnen registreren. De standaardproducten zijn blikje (€0,65), sneetje brood (€0,10), boter (€0,10), zoet beleg (€0,20), glas melk (€0,20), beleg (€0,50), ei (€0,50) en yoghurt (€0,50). Iedere klik op een product maakt één registratie aan. Persoonlijke aantallen en kosten zijn alleen zichtbaar voor de beheerder.

Deze versie is een **frontend-demo**. De gegevens worden opgeslagen in `localStorage` van de gebruikte browser. Daardoor zijn de gegevens op één computer/browser beschikbaar, maar nog niet gedeeld tussen alle gebruikers van een bedrijfsnetwerk.

## 2. Bestanden

| Bestand | Functie |
|---|---|
| `index.html` | De HTML-structuur en alle zichtbare onderdelen van de website |
| `assets/css/styles.css` | De volledige vormgeving, kleuren, layout en mobiele weergave |
| `assets/js/main.js` | Startpunt: maakt opslag, model, view en controller aan en start de app |
| `assets/js/config.js` | Vaste waarden: opslagsleutel, kleuren, voorbeeldmedewerkers en standaardproducten |
| `assets/js/DataStore.js` | Opslag in `localStorage`, validatie en omzetting van oude gegevens |
| `assets/js/RegistrationModel.js` | Gegevens en regels voor registraties, medewerkers, producten en logboek |
| `assets/js/RegistrationView.js` | Weergave van alle onderdelen als HTML |
| `assets/js/RegistrationApp.js` | Controller: verwerkt klikken, formulieren en toetsenbordacties |
| `assets/js/csvExport.js` | Class `CsvExport`: CSV-export voor de loonadministratie (maand + 1) |
| `assets/js/ThemeManager.js` | Class `ThemeManager`: licht en donker thema (Systeem, Auto of zelf kiezen met de slider) |
| `assets/js/icons.js` | De SVG-iconen van de website, met de hulpfunctie `icon(naam)` |
| `archief/app.js` | Back-up van de originele versie in één bestand; wordt niet meer geladen |
| `archief/app.test.js` | Back-up van de oude tests bij die versie; wordt niet meer uitgevoerd |
| `README.md` | Korte startinformatie voor het project |
| `docs/` | Technisch ontwerp (met daarin ook de functionele eisen), databaseschema en overige documentatie |
| `tests/` | Unit tests voor de belangrijkste reken- en registratiefuncties |

Bij het toevoegen of wijzigen van een medewerker kan de beheerder een bedrijfsnaam (`employerName`) typen of een bestaande bedrijfsnaam uit de compacte keuzelijst kiezen. Met deze bedrijfsnaam worden medewerkers in de openbare lijst gegroepeerd en gefilterd. De lijst filtert direct tijdens het typen. Nieuwe bedrijfsnamen mogen ook direct worden ingevoerd. Op de homepage werkt het bedrijfsfilter op dezelfde manier.

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
2. Klik op je medewerkerkaart.
3. Klik bij ieder gewenst product op het plusje.
4. Klik op `Registreren` om alle gekozen producten tegelijk op te slaan.
5. Je ziet geen persoonlijk totaal of persoonlijke kosten.

Iedere klik op een plusje telt als één product. De datum en tijd worden automatisch toegevoegd zodra je op `Registreren` klikt.

### 4.3 Admin-dashboard openen

1. Klik rechtsboven op `Admin login`.
2. Vul een e-mailadres in.
3. Vul een wachtwoord in.
4. Klik op `Inloggen`.

In deze demo wordt niet gecontroleerd of het wachtwoord echt correct is. Elk ingevuld wachtwoord werkt. Dit is alleen geschikt voor demonstratie en niet voor productie.

### 4.4 Registraties beheren

In het tabblad `Registraties` ziet de beheerder:

- De medewerker
- Het aantal van de registratie
- De datum en tijd
- De zoekfunctie voor correcties

De beheerder gebruikt het zoekveld `Medewerker corrigeren` om eerst een medewerker op te zoeken. Daarna kan met `+` één blikje worden toegevoegd. Met `−` wordt het laatst toegevoegde blikje van die medewerker verwijderd. De losse registraties in de tabel zijn alleen ter inzage; correcties gebeuren dus altijd via de medewerkerzoekfunctie.

De dropdowns boven de tabel filteren op medewerker of maand.

### 4.5 Medewerkers beheren

Open het tabblad `Medewerkers`.

- Vul voornaam, achternaam, looncode en personeelsnummer in.
- Kies het bedrijf en daarna het vaste consumptiepunt van de medewerker. De keuzelijst toont alleen de punten van het gekozen bedrijf. De medewerker ziet bij het registreren alleen de producten van dat punt, en de voorraad van dat punt gaat omlaag.
- Het werkgevernummer komt standaard van het bedrijf. Heeft een medewerker een ander werkgevernummer (bijvoorbeeld per teamleider), vul dan `Afwijkend werkgevernummer` in; dat nummer gaat dan voor in de CSV-export.
- Klik op `Opslaan` om een medewerker toe te voegen. `Opslaan + opnieuw` houdt het bedrijf en consumptiepunt vast voor de volgende collega.
- Gebruik `Wijzigen` om medewerkergegevens aan te passen.
- Gebruik `Deactiveren` of `Activeren` om de medewerkerstatus te wijzigen.

In deze demo worden namen als één tekst opgeslagen. In een echte database kunnen `Voornaam`, `Achternaam` en `Actief` afzonderlijke velden zijn.

Een inactieve medewerker kan daarna definitief worden verwijderd. De registraties blijven wel bestaan, zodat de administratie de historie houdt.

### 4.6 Producten beheren

Open het tabblad `Producten` en klik op `+ Product toevoegen`. Het formulier heeft dezelfde opties als het medewerkersformulier:

- `Opslaan`: opslaan en het formulier sluiten.
- `Opslaan + opnieuw`: opslaan, de velden leegmaken en het formulier open laten.

Een nieuw product staat bij alle consumptiepunten **uit**. Zet het daarna aan bij de punten die het aanbieden (zie 4.7).

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
- **Slider (☀ / ☾)**: kies zelf licht of donker. Dit is een vaste keuze; "Systeem" en "Auto" staan daarna uit.
- **Auto**: overdag licht en na zonsondergang donker. De tijden van zonsopkomst en zonsondergang zijn per maand ingesteld voor Nederland (`DAYLIGHT_HOURS` in `config.js`), bijvoorbeeld in december donker vanaf ongeveer 16:30 en in juni vanaf ongeveer 22:00. De website controleert iedere minuut of het tijd is om te wisselen.

De keuze wordt per browser onthouden. In het donkere thema blijven de huiskleuren behouden: de achtergrond wordt donker en de tekst krijgt de groene huiskleur, iets lichter zodat hij goed leesbaar is.

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
- De status `Systeem actief`.
- De knop waarmee het admin-dashboard wordt geopend.

De HTML is ingedeeld in herkenbare componentblokken: `header` voor navigatie, `main` voor de hoofdinhoud, `section` voor inhoudelijke onderdelen, `aside` voor samenvattingen en `footer` voor de afsluiting. De admin-modal bevat afzonderlijke componenten voor login, tabs, filters en beheeracties. JavaScript gebruikt de `id`-waarden als koppeling met deze componenten.

### Hero-gedeelte

De `.hero` toont de datum van vandaag, een introductietekst en een decoratief recycling-symbool.

De datum wordt niet hardcoded ingevuld. JavaScript vult het element met id `todayLabel` automatisch.

### Medewerkerlijst

De `.directory-card` bevat:

- De titel `Registreer je blikje`.
- De teller met het aantal medewerkers.
- De zoekbalk met id `employeeSearch`.
- De lege status met id `emptyState`.
- De dynamische lijst met id `employeeList`.

JavaScript vult `employeeList` op basis van de medewerkers in de applicatiestatus.

### Statistieken

De elementen `todayTotal` en `monthTotal` worden door JavaScript gevuld met:

- Het aantal registraties van vandaag.
- Het aantal registraties van de huidige maand.

### Admin-modal

De `.modal-backdrop` is een dialoogvenster over de website heen. De modal bevat twee toestanden:

- `loginView`: loginformulier.
- `adminView`: beheerdashboard.

De knop met `data-close-modal` sluit de modal. Deze knop is bewust gescheiden van `Uitloggen`. Een ingelogde beheerder kan de modal sluiten en later opnieuw openen zonder opnieuw in te loggen.

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
- `max-width` om de inhoud leesbaar te houden op grote schermen.
- Een media query voor schermen smaller dan 720 pixels.

### Componenten

De CSS bevat opmaak voor:

- De topbar en het logo.
- De hero-banner.
- Kaarten en statistieken.
- Medewerkerregels en plusknoppen.
- Admin-modal en tabbladen.
- Tabellen en filters.
- Toastmeldingen.
- Mobiele schermen.

## 7. Uitleg van de JavaScript (`assets/js/`)

### Opslag en voorbeelddata

```js
// config.js
export const STORAGE_KEY = "tvb-blikjesregistratie";
```

Dit is de naam waaronder de applicatie haar gegevens in `localStorage` bewaart.

Bij de eerste start worden acht voorbeeldmedewerkers aangemaakt. Daarna worden de gegevens uit `localStorage` gebruikt.

De status heeft deze structuur:

```js
{
  employees: [
    {
      id: "unieke-id",
      name: "Voorbeeld Naam",
      color: "#d8f1e8"
    }
  ],
  registrations: [
    {
      id: "unieke-id",
      employeeId: "id-van-medewerker",
      createdAt: "2026-09-03T10:00:00.000Z"
    }
  ]
}
```

### Objectgeoriënteerde structuur

De JavaScript-code volgt het principe van objectgeoriënteerd programmeren (OOP) en het MVC-patroon (Model, View, Controller). De code is opgedeeld in zes classes: vijf voor de applicatie zelf en `ThemeManager` voor het lichte en donkere thema. Iedere class heeft één duidelijke verantwoordelijkheid, en bovenaan ieder bestand staat in een comment waarvoor de class is en met welke andere classes hij verbonden is.

```text
DataStore ──► RegistrationModel ──► RegistrationView
                     │                     │
                     ├──► CsvExport        │
                     ▼                     ▼
               RegistrationApp (controller, stuurt model, view en export aan)
```

`main.js` maakt alle objecten één keer aan en geeft ze aan elkaar door (compositie). `config.js` bevat alleen vaste waarden en is daarom geen class.

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

De methode `RegistrationView.renderAll` voert `renderEmployees` en `renderStats` achter elkaar uit. Zo blijven de medewerkerlijst en totalen gelijktijdig actueel.

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

- Typen in de zoekbalk → lijst filteren.
- Klik op een plusknop → registratie toevoegen.
- Klik op `Admin login` → login of dashboard openen.
- Loginformulier verzenden → dashboard tonen.
- Klik op sluitknop → modal sluiten.
- Klik op tabblad → juiste admin-tab tonen.
- Wijziging van filter → tabel opnieuw tekenen.
- Klik op export → CSV-bestand maken.
- Formulier voor medewerker toevoegen → nieuwe medewerker opslaan.
- `Ctrl/Cmd + K` → zoekbalk focussen.

Voor dynamisch aangemaakte knoppen gebruikt de app één algemene kliklistener op `document`. Daardoor blijven knoppen werken nadat de lijst opnieuw is opgebouwd.

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
- Er is geen server-side auditlog.
- Het admin-login is een demo en heeft geen echte server-side beveiliging.

Voor productie is een backend met een gedeelde database, echte authenticatie, autorisatie, back-ups en auditlogging nodig.

## 10. Code uitleggen tijdens een presentatie

De applicatie volgt het principe van separation of concerns:

1. `DataStore` weet hoe gegevens worden opgeslagen.
2. `RegistrationModel` weet welke gegevens en bedrijfsregels gelden.
3. `RegistrationView` weet hoe gegevens in HTML worden getoond.
4. `RegistrationApp` weet welke actie bij een klik of formulier hoort.

De HTML bevat de componenten en vaste ankerpunten met `id`-waarden. De CSS bepaalt uitsluitend de presentatie. JavaScript koppelt de componenten aan gedrag. Daardoor kan bijvoorbeeld de opslag worden vervangen door een database zonder de volledige gebruikersinterface opnieuw te bouwen.

## 11. Mogelijke vervolgstappen

1. Kies een backend, bijvoorbeeld PHP, Node.js of een beheerde dienst.
2. Maak tabellen `Medewerkers` en `Registraties`.
3. Vervang `localStorage` door API-aanroepen.
4. Voeg echte admin-authenticatie toe.
5. Voeg een logboek voor administratieve wijzigingen toe.
6. Voeg jaar-, maand- en periodefilters toe.
7. Voeg databaseback-ups en foutlogging toe.
8. Test met meerdere gebruikers tegelijk.
