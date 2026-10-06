# Consumptieregistratie TVB

Een interactieve front-end voor het registreren van eten en drinken binnen de organisatie.

## Starten

Open de map in VS Code en start [index.html](./index.html) met de extensie **Live Server** (of een andere lokale webserver). Er is geen buildstap nodig. Alle bestanden (ook lettertypes en face-api) staan in het project zelf; er wordt niets van een externe server geladen. De camera voor de demo gezichtsherkenning werkt alleen via `https://` of `http://localhost`.

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
    ids.js                  # createId(): unieke id's, ook zonder https
    FaceRecognitionDemo.js  # Demo gezichtsherkenning (uit te zetten in config.js)
  fonts/                    # Lettertypes DM Sans en Space Grotesk (zelf gehost, SIL OFL, zie LICENSE.txt)
  vendor/
    face-api/               # face-api 1.7.15 en de drie modellen voor de demo (MIT, ca. 8 MB)
docs/
  TO-BLIKJESREGISTRATIE.md  # Technisch ontwerp (enige ontwerpdocument)
  DOCUMENTATIE.md           # Uitleg van de code en gebruikershandleiding
  DATABASE-SCHEMA.sql       # PostgreSQL-schema voor productie
  *.docx, *.pdf             # Word- en PDF-versies van het TO en de documentatie in de TVB-huisstijl
  tvbsjabloon.docx          # TVB-sjabloon voor documenten (voorblad, stijlen), basis voor de Word-versies
  wireframes/               # Low-, mid- en high-fidelity wireframes van de schermen (gebruikt in het TO)
tests/
  helpers.js                # Gedeelde hulpfuncties voor de tests
  *.test.js                 # 480 unit tests (basis, datastore, model, csv-export, view-app, theme, welcome-face, controller, regressie, controle4-model, controle4-ui, opslag-model-export, controller-robuustheid, beveiliging-config, gegevens-en-tabbladen, werkgever-en-correctiedatum, to-controle)
tools/
  md-to-docx.cjs            # Stap 1: zet Markdown om naar Word in de opmaak van docs/tvbsjabloon.docx (voorbeeld bovenin)
  word-bijwerken.ps1        # Stap 2: laat Word de inhoudsopgave bijwerken en slaat .docx en .pdf op
archief/
  app.js                    # Originele versie van de app in één bestand (back-up, wordt niet geladen)
  app.test.js               # Oude tests bij die versie (back-up, wordt niet uitgevoerd)
.github/workflows/ci.yml    # GitHub Actions: draait npm test op main en development (alleen leesrechten, actions vast op commit-SHA)
```

## Inbegrepen

- Medewerkerlijst met zoeken en een persoonlijk productvenster waarin meerdere producten met `+` en `−` kunnen worden gekozen en daarna tegelijk geregistreerd.
- Medewerkers zijn gekoppeld aan een bedrijf en een consumptiepunt, en worden per bedrijf gegroepeerd en gefilterd.
- Automatische datum/tijd en lokale opslag via `localStorage`.
- Admin-demo via de knop rechtsboven (elk ingevuld wachtwoord werkt).
- Admin-overzicht met medewerker- en maandfilters.
- Registraties corrigeren met `+` en `−`, medewerkers toevoegen/wijzigen en actief/inactief zetten.
- Inactieve medewerkers zonder registraties kunnen daarna ook definitief worden verwijderd (na bevestiging); medewerkers met registraties worden alleen gedeactiveerd, zodat de export klopt. Een actieve medewerker moet eerst op inactief worden gezet; ook het model controleert dit.
- Producten en prijzen beheren; een product dat nooit is geregistreerd, kan na bevestiging worden verwijderd. Standaard zijn blikje €0,65, sneetje brood €0,10, boter €0,10, zoet beleg €0,20, glas melk €0,20, beleg €0,50, ei €0,50 en yoghurt €0,50.
- Medewerkers zien geen persoonlijke aantallen of persoonlijke kosten; deze informatie is alleen beschikbaar voor de admin.
- Producten toevoegen via een formulier met `Opslaan` en `Opslaan + opnieuw`.
- Bedrijvenbeheer: de 13 bedrijven van TVB staan erin; bedrijven toevoegen, naam en standaard werkgevernummer wijzigen (per medewerker kan een afwijkend werkgevernummer worden ingevuld). Bedrijfsnaam en werkgevernummer zijn uniek. Een bedrijf kan meerdere consumptiepunten hebben, en per consumptiepunt zet je aan welke producten er worden aangeboden. Medewerkers hebben een vast consumptiepunt en zien alleen de producten van dat punt. Een nieuw product staat overal uit tot de beheerder het aanzet.
- Voorraadbeheer per consumptiepunt: iedere registratie haalt 1 van de voorraad af, leveringen en tellingen worden geboekt (hele getallen tot 100.000), en per product is er een minimum. Een bijbestellijst toont alles wat op is of bijbesteld moet worden.
- Correcties in een oude maand vragen eerst om bevestiging, omdat die loonmaand mogelijk al is verwerkt. Iedere beheerwijziging wordt samen met de logboekregel opgeslagen.
- Knop `Alle gegevens wissen` in het tabblad Logboek: wist na twee bevestigingen alle gegevens, reservekopieën en ingestelde gezichten op de tablet (AVG, recht op vergetelheid), logt uit en zet de demogegevens terug.
- Beveiliging in de demo: alle waarden in HTML worden ge-escapet, opgeslagen id's, kleuren en prijzen worden bij het laden gecontroleerd (ook dubbele id's, registraties van meer dan een dag in de toekomst en tellingen in de toekomst), een Content-Security-Policy en `no-referrer` in `index.html`, lettertypes en face-api zelf gehost (geen Google Fonts of CDN) en CSV-velden zijn beschermd tegen formules. Zie het TO, hoofdstuk 13, voor wat er vóór productie nog moet gebeuren.
- CSV-export (te openen in Excel) met vaste kolommen: Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs. Jaar en Maand zijn de loonmaand: consumpties worden verwerkt in de maand erna (september → oktober, december → januari).
- Administratief logboek voor wijzigingen, met maximaal 20 regels tegelijk en `Meer laden`.
- Persoonlijk welkom in het productvenster en een knop "Zelfde als vorige keer" met de keuze van de vorige keer.
- Demo gezichtsherkenning met de camera van tablet of laptop: vrijwillig per medewerker, alles op het apparaat (bibliotheek en modellen in `assets/vendor/face-api/`), niets opgeslagen; uit te zetten in `config.js`. Zie het TO voor de privacy-afweging en toekomstige uitbreidingen (QR-pas, AFAS, barcode, spraak, slim slot).
- Licht en donker thema: standaard volgt de website de instelling van het apparaat ("Systeem"). Met de slider in de bovenbalk kies je zelf licht of donker, en met "Auto" is het overdag licht en na zonsondergang donker. In donkere modus blijft de huisstijl behouden en wordt de tekst groen.
- Uitgebreide documentatie in [`docs/DOCUMENTATIE.md`](./docs/DOCUMENTATIE.md) en in de TVB-huisstijl als [`docs/DOCUMENTATIE.docx`](./docs/DOCUMENTATIE.docx) en [`docs/DOCUMENTATIE.pdf`](./docs/DOCUMENTATIE.pdf).
- Technisch ontwerp in [`docs/TO-BLIKJESREGISTRATIE.md`](./docs/TO-BLIKJESREGISTRATIE.md): het enige ontwerpdocument, met aanleiding, gebruikersrollen, functionele eisen, use cases, low-, mid- en high-fidelity wireframes (een screenshot van ieder scherm met UI-principes en Nielsen-heuristieken), OOP-architectuur, databasespecificatie en acceptatiecriteria.
- Productiegericht PostgreSQL-schema in [`docs/DATABASE-SCHEMA.sql`](./docs/DATABASE-SCHEMA.sql).
- Het technisch ontwerp in de TVB-huisstijl als [`docs/TO-BLIKJESREGISTRATIE.docx`](./docs/TO-BLIKJESREGISTRATIE.docx) en [`docs/TO-BLIKJESREGISTRATIE.pdf`](./docs/TO-BLIKJESREGISTRATIE.pdf). De `.md`-bestanden zijn de bron; de Word- en PDF-versies worden gemaakt met `tools/md-to-docx.cjs` en `tools/word-bijwerken.ps1` (zie het voorbeeld bovenin `md-to-docx.cjs`).
