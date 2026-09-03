# Documentatie Blikjesregistratie

## 1. Doel van de applicatie

Blikjesregistratie is een eenvoudige website waarmee medewerkers kunnen aangeven dat zij een blikje hebben gepakt. Iedere klik op de `+`-knop maakt één registratie aan. De applicatie toont de huidige aantallen en geeft een beheerder extra functies voor correcties, medewerkers en Excel-export.

Deze versie is een **frontend-demo**. De gegevens worden opgeslagen in `localStorage` van de gebruikte browser. Daardoor zijn de gegevens op één computer/browser beschikbaar, maar nog niet gedeeld tussen alle gebruikers van een bedrijfsnetwerk.

## 2. Bestanden

| Bestand | Functie |
|---|---|
| `index.html` | De HTML-structuur en alle zichtbare onderdelen van de website |
| `styles.css` | De volledige vormgeving, kleuren, layout en mobiele weergave |
| `app.js` | De interactieve werking, berekeningen, opslag en Excel-export |
| `README.md` | Korte startinformatie voor het project |
| `DOCUMENTATIE.md` | Deze uitgebreide uitleg |

## 3. De website starten

1. Open de projectmap.
2. Dubbelklik op `index.html`.
3. De website opent in een moderne browser.
4. Er is geen installatie of buildproces nodig.

De Excel-export gebruikt SheetJS via een CDN. Voor deze functie is daarom een internetverbinding nodig wanneer de bibliotheek nog niet in de browser geladen is.

## 4. Gebruikershandleiding

### 4.1 Een medewerker zoeken

Gebruik de zoekbalk boven de medewerkerlijst. Typ een voornaam, achternaam of een deel van een naam. De lijst wordt direct gefilterd.

Met `Ctrl + K` op Windows of `Cmd + K` op macOS krijgt de zoekbalk automatisch de focus.

### 4.2 Een blikje registreren

1. Zoek de juiste medewerker.
2. Klik op de groene `+`-knop.
3. De registratie wordt direct toegevoegd.
4. Het aantal van de medewerker wordt bijgewerkt.
5. De totalen van vandaag en deze maand worden bijgewerkt.
6. De registratie verschijnt bij recente activiteit.

Iedere klik telt als één blikje. De datum en tijd worden automatisch toegevoegd.

### 4.3 Admin-dashboard openen

1. Klik rechtsboven op `Beheerder`.
2. Vul een e-mailadres in.
3. Vul een wachtwoord in.
4. Klik op `Inloggen`.

In deze demo wordt niet gecontroleerd of het wachtwoord echt correct is. Elk ingevuld wachtwoord werkt. Dit is alleen geschikt voor demonstratie en niet voor productie.

### 4.4 Registraties beheren

In het tabblad `Registraties` ziet de beheerder:

- De medewerker
- Het aantal van de registratie
- De datum en tijd
- Actieknoppen

Met `+` kan een beheerder een extra registratie toevoegen. Met `−` kan een foutieve registratie worden verwijderd.

De dropdowns boven de tabel filteren op medewerker of maand.

### 4.5 Medewerkers beheren

Open het tabblad `Medewerkers`.

- Vul een naam in en klik op `+ Toevoegen` om een medewerker toe te voegen.
- Klik op `×` om een medewerker uit de actieve lijst te verwijderen.

In deze demo worden namen als één tekst opgeslagen. In een echte database kunnen `Voornaam`, `Achternaam` en `Actief` afzonderlijke velden zijn.

### 4.6 Excel exporteren

1. Open het admin-dashboard.
2. Kies eventueel een medewerker en/of maand.
3. Klik op `Excel exporteren`.
4. De browser downloadt een `.xlsx`-bestand.

Het bestand bevat twee werkbladen:

1. `Registraties`: medewerker, aantal blikjes en registratiedatum.
2. `Maandtotalen`: totaal per medewerker en een totaalregel voor alle geselecteerde medewerkers.

De gekozen filters worden toegepast op de export.

## 5. Uitleg van `index.html`

### Metadata en externe bestanden

In de `<head>` staan:

- `lang="nl"`: de pagina is Nederlandstalig.
- `charset="utf-8"`: ondersteunt Nederlandse tekens.
- `viewport`: maakt de pagina geschikt voor mobiel.
- De titel en beschrijving voor browser en zoekmachines.
- Google Fonts voor de gebruikte lettertypes.
- `styles.css` voor de vormgeving.
- SheetJS voor Excel-export.

### Navigatiebalk

De `.topbar` bevat:

- Het TVB-logo.
- De naam van de applicatie.
- De status `Systeem actief`.
- De knop waarmee het admin-dashboard wordt geopend.

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

### Recente registraties

Het element `recentRegistrations` wordt dynamisch gevuld. Alleen de vijf nieuwste registraties worden getoond.

### Admin-modal

De `.modal-backdrop` is een dialoogvenster over de website heen. De modal bevat twee toestanden:

- `loginView`: loginformulier.
- `adminView`: beheerdashboard.

De knop met `data-close-modal` sluit de modal. Deze knop is bewust gescheiden van `Uitloggen`.

## 6. Uitleg van `styles.css`

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
- `--shadow`: standaard schaduw.

Als het organisatiepalet later verandert, kunnen de kleuren centraal worden aangepast.

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
- Activiteitenlijst.
- Admin-modal en tabbladen.
- Tabellen en filters.
- Toastmeldingen.
- Mobiele schermen.

## 7. Uitleg van `app.js`

### Opslag en voorbeelddata

```js
const STORAGE_KEY = "tvb-blikjesregistratie";
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

### Hulpfuncties

- `$`: zoekt een HTML-element op basis van een CSS-selector.
- `dateNow`: geeft de huidige datum en tijd.
- `monthKey`: maakt een vergelijkbare sleutel zoals `2026-09`.
- `save`: serialiseert de status naar `localStorage`.
- `initials`: maakt initialen voor de avatar.
- `formatDate`: zet ISO-datums om naar Nederlandse datum- en tijdnotatie.
- `escapeHtml`: voorkomt dat namen als HTML-code worden geïnterpreteerd.

### `renderEmployees`

Deze functie:

1. Leest de zoekterm.
2. Vergelijkt de zoekterm met alle namen.
3. Toont alleen overeenkomende medewerkers.
4. Berekent per medewerker het totale aantal registraties.
5. Maakt voor iedere medewerker een HTML-rij met een `+`-knop.

De `data-add`-waarde bevat de unieke medewerker-id. Daardoor weet de klikhandler voor welke medewerker een registratie moet worden gemaakt.

### `renderStats`

Deze functie vergelijkt de datum van iedere registratie met:

- De datum van vandaag.
- De sleutel van de huidige maand.

Daarna worden de twee totalen in de statistiekkaarten geplaatst.

### `renderRecent`

Deze functie:

1. Maakt een kopie van alle registraties.
2. Sorteert de kopie van nieuw naar oud.
3. Beperkt het resultaat tot vijf registraties.
4. Zoekt de bijbehorende medewerker op.
5. Toont naam, datum/tijd en hoeveelheid.

### `addRegistration`

Deze functie wordt uitgevoerd na een klik op `+`.

Er wordt een object toegevoegd met:

- Een unieke registratie-id.
- De medewerker-id.
- De huidige datum en tijd in ISO-formaat.

Daarna worden de gegevens opgeslagen en alle zichtbare onderdelen opnieuw getekend.

### `renderAll`

Deze functie voert `renderEmployees`, `renderStats` en `renderRecent` achter elkaar uit. Zo blijven de medewerkerlijst, totalen en recente activiteit gelijktijdig actueel.

### `showToast`

Toont een korte melding zoals `Blikje direct opgeslagen`. Na 2,5 seconden verdwijnt deze melding automatisch.

### Adminfuncties

`openAdmin` opent de modal en toont het loginformulier.

`renderAdmin`:

- Leest de gekozen medewerkerfilter.
- Leest de gekozen maandfilter.
- Filtert de registraties.
- Toont de resultaten in de admin-tabel.

`populateFilters` vult de dropdowns met de huidige medewerkers en maanden die in registraties voorkomen.

`renderAdminEmployees` toont alle medewerkers in het beheertabblad.

### Excel-export

`exportExcel` gebruikt de SheetJS-bibliotheek:

1. De geselecteerde filters worden gelezen.
2. De bijbehorende registraties worden verzameld.
3. Een detailoverzicht wordt gemaakt.
4. Maandtotalen worden berekend.
5. Twee werkbladen worden toegevoegd aan een workbook.
6. Het workbook wordt gedownload als `.xlsx`.

### Event listeners

De event listeners koppelen gebruikersacties aan functies:

- Typen in de zoekbalk → lijst filteren.
- Klik op een plusknop → registratie toevoegen.
- Klik op admin → modal openen.
- Loginformulier verzenden → dashboard tonen.
- Klik op sluitknop → modal sluiten.
- Klik op tabblad → juiste admin-tab tonen.
- Wijziging van filter → tabel opnieuw tekenen.
- Klik op export → Excelbestand maken.
- Formulier voor medewerker toevoegen → nieuwe medewerker opslaan.
- `Ctrl/Cmd + K` → zoekbalk focussen.

Voor dynamisch aangemaakte knoppen gebruikt de app één algemene kliklistener op `document`. Daardoor blijven knoppen werken nadat de lijst opnieuw is opgebouwd.

## 8. Datamodel en koppelingen

De huidige demo gebruikt JavaScript-objecten. De logische koppeling is:

### Medewerkers

| Veld | Betekenis |
|---|---|
| `id` | Unieke identificatie |
| `name` | Volledige naam |
| `color` | Kleur van de avatar |

### Registraties

| Veld | Betekenis |
|---|---|
| `id` | Unieke identificatie |
| `employeeId` | Verwijzing naar een medewerker |
| `createdAt` | Datum en tijd van registratie |

Het aantal is in de demo altijd `1`, omdat iedere klik één registratie maakt. Dit sluit aan bij het voorgestelde datamodel waarin `Aantal` standaard 1 is.

## 9. Belangrijke demo-beperkingen

Deze versie is bedoeld als prototype:

- `localStorage` is niet gedeeld tussen gebruikers.
- Er is geen echte database.
- De login heeft geen echte beveiliging.
- Er zijn geen gebruikersrollen of wachtwoordbeheer.
- Verwijderde medewerkers krijgen geen herstelmogelijkheid.
- Er is geen server-side auditlog.
- Excel-export is afhankelijk van de externe SheetJS-CDN.
- De knop `Bekijk alles` is momenteel alleen visueel aanwezig.

Voor productie is een backend met een gedeelde database, echte authenticatie, autorisatie, back-ups en auditlogging nodig.

## 10. Mogelijke vervolgstappen

1. Kies een backend, bijvoorbeeld PHP, Node.js of een beheerde dienst.
2. Maak tabellen `Medewerkers` en `Registraties`.
3. Vervang `localStorage` door API-aanroepen.
4. Voeg echte admin-authenticatie toe.
5. Voeg een logboek voor administratieve wijzigingen toe.
6. Voeg jaar-, maand- en periodefilters toe.
7. Voeg databaseback-ups en foutlogging toe.
8. Test met meerdere gebruikers tegelijk.
