# Consumptieregistratie TVB

Een interactieve front-end voor het registreren van eten en drinken binnen de organisatie.

## Starten

Open de map in VS Code en start [index.html](./index.html) met de extensie **Live Server** (of een andere lokale webserver). Er is geen buildstap nodig.

Dubbelklikken op `index.html` werkt niet: de JavaScript bestaat uit modules en browsers blokkeren die via `file://`.

Tests draaien (Node.js 20+): `npm test`

## Mappenstructuur

```text
index.html                  # Hoofdpagina van de website
assets/
  css/
    styles.css              # Vormgeving
  js/
    main.js                 # Startpunt van de app
    config.js               # Vaste waarden: standaardproducten en bedrijven
    DataStore.js            # Opslag in localStorage
    RegistrationModel.js    # Gegevens en regels
    RegistrationView.js     # Weergave (HTML)
    RegistrationApp.js      # Controller (klikken en formulieren)
    csvExport.js            # Class CsvExport: CSV-export voor de loonadministratie
    ThemeManager.js         # Class ThemeManager: licht/donker thema
    icons.js                # SVG-iconen (één bron, overal dezelfde stijl)
    FaceRecognitionDemo.js  # Demo gezichtsherkenning (uit te zetten in config.js)
docs/
  TO-BLIKJESREGISTRATIE.md  # Technisch ontwerp (enige ontwerpdocument)
  DOCUMENTATIE.md           # Uitleg van de code en gebruikershandleiding
  DATABASE-SCHEMA.sql       # PostgreSQL-schema voor productie
  *.doc                     # Word-versies van het TO en de documentatie
  wireframes/               # Low-, mid- en high-fidelity wireframes van de schermen (gebruikt in het TO)
tests/
  helpers.js                # Gedeelde hulpfuncties voor de tests
  *.test.js                 # Unit tests (basis, datastore, model, csv-export, view-app, theme, welcome-face)
archief/
  app.js                    # Originele versie van de app in één bestand (back-up, wordt niet geladen)
  app.test.js               # Oude tests bij die versie (back-up, wordt niet uitgevoerd)
.github/workflows/ci.yml    # GitHub Actions: draait npm test
```

## Inbegrepen

- Medewerkerlijst met zoeken en een persoonlijk productvenster waarin meerdere producten met `+` en `−` kunnen worden gekozen en daarna tegelijk geregistreerd.
- Medewerkers zijn gekoppeld aan een bedrijf en een consumptiepunt, en worden per bedrijf gegroepeerd en gefilterd.
- Automatische datum/tijd en lokale opslag via `localStorage`.
- Admin-demo via de knop rechtsboven (elk ingevuld wachtwoord werkt).
- Admin-overzicht met medewerker- en maandfilters.
- Registraties corrigeren met `+` en `−`, medewerkers toevoegen/wijzigen en actief/inactief zetten.
- Inactieve medewerkers kunnen daarna ook definitief worden verwijderd; historische registraties blijven behouden.
- Producten en prijzen beheren. Standaard zijn blikje €0,65, sneetje brood €0,10, boter €0,10, zoet beleg €0,20, glas melk €0,20, beleg €0,50, ei €0,50 en yoghurt €0,50.
- Medewerkers zien geen persoonlijke aantallen of persoonlijke kosten; deze informatie is alleen beschikbaar voor de admin.
- Producten toevoegen via een formulier met `Opslaan` en `Opslaan + opnieuw`.
- Bedrijvenbeheer: de 13 bedrijven van TVB staan erin; bedrijven toevoegen, naam en standaard werkgevernummer wijzigen (per medewerker kan een afwijkend werkgevernummer worden ingevuld). Een bedrijf kan meerdere consumptiepunten hebben, en per consumptiepunt zet je aan welke producten er worden aangeboden. Medewerkers hebben een vast consumptiepunt en zien alleen de producten van dat punt. Een nieuw product staat overal uit tot de beheerder het aanzet.
- Voorraadbeheer per consumptiepunt: iedere registratie haalt 1 van de voorraad af, leveringen en tellingen worden geboekt, en per product is er een minimum. Een bijbestellijst toont alles wat op is of bijbesteld moet worden.
- CSV-export (te openen in Excel) met vaste kolommen: Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs. Jaar en Maand zijn de loonmaand: consumpties worden verwerkt in de maand erna (september → oktober, december → januari).
- Administratief logboek voor wijzigingen, met maximaal 20 regels tegelijk en `Meer laden`.
- Persoonlijk welkom in het productvenster en een knop "Zelfde als vorige keer" met de keuze van de vorige keer.
- Demo gezichtsherkenning met de camera van tablet of laptop: vrijwillig per medewerker, alles op het apparaat, niets opgeslagen; uit te zetten in `config.js`. Zie het TO voor de privacy-afweging en toekomstige uitbreidingen (QR-pas, AFAS, barcode, spraak, slim slot).
- Licht en donker thema: standaard volgt de website de instelling van het apparaat ("Systeem"). Met de slider in de bovenbalk kies je zelf licht of donker, en met "Auto" is het overdag licht en na zonsondergang donker. In donkere modus blijft de huisstijl behouden en wordt de tekst groen.
- Uitgebreide documentatie in [`docs/DOCUMENTATIE.md`](./docs/DOCUMENTATIE.md) en een Word-compatibele export in [`docs/DOCUMENTATIE-WORD.doc`](./docs/DOCUMENTATIE-WORD.doc).
- Technisch ontwerp in [`docs/TO-BLIKJESREGISTRATIE.md`](./docs/TO-BLIKJESREGISTRATIE.md): het enige ontwerpdocument, met aanleiding, gebruikersrollen, functionele eisen, use cases, low-, mid- en high-fidelity wireframes (een screenshot van ieder scherm met UI-principes en Nielsen-heuristieken), OOP-architectuur, databasespecificatie en acceptatiecriteria.
- Productiegericht PostgreSQL-schema in [`docs/DATABASE-SCHEMA.sql`](./docs/DATABASE-SCHEMA.sql).
- Word-compatibele versie van het technisch ontwerp in [`docs/TO-BLIKJESREGISTRATIE.doc`](./docs/TO-BLIKJESREGISTRATIE.doc).
