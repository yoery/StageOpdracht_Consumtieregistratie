# Consumptieregistratie TVB

Een interactieve front-end voor het registreren van eten en drinken binnen de organisatie.

## Starten

Open de map in VS Code en start [index.html](./index.html) met de extensie **Live Server** (of een andere lokale webserver). Er is geen buildstap nodig. Alle bestanden (ook lettertypes en face-api) staan in het project zelf; er wordt niets van een externe server geladen. De camera voor de demo gezichtsherkenning werkt alleen via `https://` of `http://localhost`.

Dubbelklikken op `index.html` werkt niet: de JavaScript bestaat uit modules en browsers blokkeren die via `file://`.

Tests draaien (Node.js 22+, de CI gebruikt Node.js 24 LTS): `npm test`

Browsertests (end-to-end) draai je met `npm run test:e2e`. Ze openen de echte pagina zonder venster in Microsoft Edge (Windows) of Google Chrome (Linux). Staat de browser ergens anders, zet dan `BROWSER_PATH` op het pad van de browser, bijvoorbeeld `BROWSER_PATH="/usr/bin/chromium" npm run test:e2e`. Er hoeft niets met npm te worden geïnstalleerd. In GitHub Actions draaien ze automatisch na de unit tests.

## Mappenstructuur

```text
index.html                  # Hoofdpagina van de website
assets/
  css/
    styles.css              # Vormgeving
  js/
    main.js                 # Startpunt van de app
    config.js               # Vaste waarden: standaardproducten, bedrijven en de tijden voor automatisch uitloggen en sluiten
    DataStore.js            # Opslag in localStorage
    RegistrationModel.js    # Gegevens en regels
    RegistrationView.js     # Weergave (HTML)
    RegistrationApp.js      # Controller: maakt en koppelt de onderdelen hieronder, opslaan (persist), tabbladen synchroniseren
    controllers/            # Onderdelen van de controller (RegistrationApp maakt ze aan en geeft zichzelf mee)
      ModalManager.js       # vensters openen en sluiten, focus
      EmployeeController.js # beginpagina, productvenster, registreren en automatisch sluiten van het productvenster
      BadgeController.js    # herkennen met de pas (koppelt BadgeReader aan de app)
      FaceController.js     # cameravenster van de demo gezichtsherkenning
      AdminController.js    # inloggen, dashboard, logboek, export, wissen, verwijderen
      CorrectionController.js # correcties + en − (registratie verwijderen)
      StockController.js    # voorraad, leveringen en minimum
      FormController.js     # formulieren medewerker, product, bedrijf en consumptiepunt
    CsvExport.js            # Class CsvExport: CSV-export voor de loonadministratie
    ThemeManager.js         # Class ThemeManager: licht/donker thema
    icons.js                # SVG-iconen (één bron, overal dezelfde stijl)
    ids.js                  # createId(): unieke id's, ook zonder https
    FaceRecognitionDemo.js  # Demo gezichtsherkenning (uit te zetten in config.js)
    BadgeReader.js          # Herkennen met de pas via een USB-NFC-lezer (uit te zetten in config.js)
  fonts/                    # Lettertypes DM Sans en Space Grotesk (zelf gehost, SIL OFL, zie LICENSE.txt)
  vendor/
    face-api/               # face-api 1.7.15 en de drie modellen voor de demo (MIT, met TensorFlow.js onder Apache 2.0, ca. 8 MB, niet meer onderhouden en dus alleen voor de demo)
docs/
  TO-BLIKJESREGISTRATIE.md  # Technisch ontwerp (enige ontwerpdocument)
  DOCUMENTATIE.md           # Uitleg van de code en gebruikershandleiding
  DATABASE-SCHEMA.sql       # PostgreSQL-schema voor productie
  *.docx, *.pdf             # Word- en PDF-versies van het TO en de documentatie in de TVB-huisstijl
  wireframes/               # Low-, mid- en high-fidelity wireframes van de schermen (gebruikt in het TO)
tests/
  helpers.js                # Gedeelde hulpfuncties voor de tests
  e2e/                      # 19 browsertests in headless Edge of Chrome (npm run test:e2e), met hulpcode in browser.js
  *.test.js                 # 661 unit tests (basis, datastore, model, csv-export, view-en-controller, thema, welkom-en-gezichtsherkenning, controller, regressie, codecontrole4-model, codecontrole4-ui, opslag-model-export, controller-robuustheid, beveiliging-config, gegevens-en-tabbladen, werkgever-en-correctiedatum, to-controle, pasjeslezer, beveiligingsscan, avg-toets, review-oktober, ux-review)
tools/
  md-to-docx.cjs            # Stap 1: zet Markdown om naar Word in de opmaak van het TVB-sjabloon tvbsjabloon.docx (niet in de repository, vraag het op bij TVB)
  word-bijwerken.ps1        # Stap 2: laat Word de inhoudsopgave bijwerken en slaat .docx en .pdf op
archief/
  app.js                    # Originele versie van de app in één bestand (back-up, wordt niet geladen)
  app.test.js               # Oude tests bij die versie (back-up, wordt niet uitgevoerd)
.github/workflows/ci.yml    # GitHub Actions: draait npm test en daarna de browsertests met Node.js 24 op main en development (alleen leesrechten, actions vast op commit-SHA)
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
- Beveiliging in de demo: alle waarden in HTML worden ge-escapet, opgeslagen id's, kleuren, prijzen, codes en tijdstippen worden bij het laden gecontroleerd (ook dubbele id's, registraties van meer dan een dag in de toekomst, tellingen in de toekomst en speciale sleutels als `__proto__` in de voorraad), iedere beheeractie controleert zelf of er een beheerder is ingelogd, de camera gaat uit als de tijd om is, een Content-Security-Policy en `no-referrer` in `index.html`, lettertypes en face-api zelf gehost (geen Google Fonts of CDN) en CSV-velden zijn beschermd tegen formules. Zie het TO, hoofdstuk 13, voor wat er vóór productie nog moet gebeuren.
- CSV-export (te openen in Excel) met vaste kolommen: Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs. Jaar en Maand zijn de loonmaand: consumpties worden verwerkt in de maand erna (september → oktober, december → januari).
- Administratief logboek voor wijzigingen, met maximaal 20 regels tegelijk en `Meer laden`.
- Persoonlijk welkom in het productvenster. Na herkenning met de pas of de camera ook "welkom terug" en een knop "Zelfde als vorige keer" met de keuze van de vorige keer. Wie op een naam tikt, ziet die niet, zodat collega's niet kunnen zien wat iemand eerder koos.
- Onder in het productvenster een korte uitleg dat registraties maandelijks op het loon worden ingehouden, met een verwijzing naar de privacyverklaring voor medewerkers.
- De beheerder wordt automatisch uitgelogd als het beheer 5 minuten niet is gebruikt (`ADMIN_IDLE_LOGOUT_MS` in `config.js`).
- Het productvenster sluit vanzelf zonder op te slaan als het 75 seconden niet wordt gebruikt, met in de laatste 10 seconden "Venster sluit zo. Tik om door te gaan." (`EMPLOYEE_IDLE_CLOSE_MS` in `config.js`). Een pas van een collega vervangt een open productvenster. Na registreren zijn het zoekveld en het bedrijfsfilter weer leeg.
- Gemaakt voor een tablet: de knop `Registreren` blijft onderaan het productvenster in beeld (over de volle breedte), zonder keuze is hij uitgeschakeld met de uitleg "Kies eerst een product met +", een gekozen product krijgt een lichtgroene achtergrond en knoppen zijn minstens 44 pixels hoog. Een schermlezer hoort na zoeken alleen het aantal medewerkers en leest de meldingen voor. Zie de paragraaf "UX-review oktober 2026" in het TO (hoofdstuk 9).
- Demo gezichtsherkenning met de camera van tablet of laptop: vrijwillig per medewerker, alles op het apparaat (bibliotheek en modellen in `assets/vendor/face-api/`), niets opgeslagen; uit te zetten in `config.js`. Zie het TO voor de privacy-afweging en toekomstige uitbreidingen (QR-pas, AFAS, barcode, spraak, slim slot).
- Herkennen met de pas: een USB-NFC-lezer die zich als toetsenbord gedraagt typt het pasnummer; de beheerder koppelt de pas in het medewerkersformulier. Geen bibliotheek of driver nodig; uit te zetten in `config.js`.
- Licht en donker thema: standaard volgt de website de instelling van het apparaat ("Systeem"). Met de slider in de bovenbalk kies je zelf licht of donker, en met "Auto" is het overdag licht en na zonsondergang donker. In donkere modus blijft de huisstijl behouden en wordt de tekst groen.
- Uitgebreide documentatie in [`docs/DOCUMENTATIE.md`](./docs/DOCUMENTATIE.md) en in de TVB-huisstijl als [`docs/DOCUMENTATIE.docx`](./docs/DOCUMENTATIE.docx) en [`docs/DOCUMENTATIE.pdf`](./docs/DOCUMENTATIE.pdf).
- Technisch ontwerp in [`docs/TO-BLIKJESREGISTRATIE.md`](./docs/TO-BLIKJESREGISTRATIE.md): het enige ontwerpdocument, met aanleiding, gebruikersrollen, functionele eisen, use cases, low-, mid- en high-fidelity wireframes (een screenshot van ieder scherm met UI-principes en Nielsen-heuristieken), OOP-architectuur, databasespecificatie en acceptatiecriteria.
- Productiegericht PostgreSQL-schema in [`docs/DATABASE-SCHEMA.sql`](./docs/DATABASE-SCHEMA.sql).
- Het technisch ontwerp in de TVB-huisstijl als [`docs/TO-BLIKJESREGISTRATIE.docx`](./docs/TO-BLIKJESREGISTRATIE.docx) en [`docs/TO-BLIKJESREGISTRATIE.pdf`](./docs/TO-BLIKJESREGISTRATIE.pdf). De `.md`-bestanden zijn de bron; de Word- en PDF-versies worden gemaakt met `tools/md-to-docx.cjs` en `tools/word-bijwerken.ps1` (zie het voorbeeld bovenin `md-to-docx.cjs`).
