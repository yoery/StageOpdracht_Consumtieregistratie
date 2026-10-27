# Consumptieregistratie TVB

Een interactieve front-end voor het registreren van eten en drinken binnen de organisatie.

## Starten

Open de map in VS Code en start [index.html](./index.html) met de extensie **Live Server** (of een andere lokale webserver). Er is geen buildstap nodig. Alle bestanden (ook lettertypes en face-api) staan in het project zelf; er wordt niets van een externe server geladen. De camera voor de demo gezichtsherkenning werkt alleen via `https://` of `http://localhost`.

Dubbelklikken op `index.html` werkt niet: de JavaScript bestaat uit modules en browsers blokkeren die via `file://`.

Tests draaien (Node.js 22+, de CI gebruikt Node.js 24 LTS): `npm test`

Browsertests (end-to-end) draai je met `npm run test:e2e`. Ze openen de echte pagina zonder venster in Microsoft Edge (Windows) of Google Chrome (Linux). Staat de browser ergens anders, zet dan `BROWSER_PATH` op het pad van de browser, bijvoorbeeld `BROWSER_PATH="/usr/bin/chromium" npm run test:e2e`. Er hoeft niets met npm te worden geïnstalleerd. In GitHub Actions draaien ze automatisch na de unit tests. Met `E2E_CPU_THROTTLE=4` draait de browser vier keer trager, zoals op een drukke server. Mislukt een browsertest, dan staan het scenario, de toestand van de pagina en de laatste meldingen uit de console in de foutuitvoer en komt er een schermafdruk in `test-results/e2e` (in GitHub Actions bewaard als artifact).

## Mappenstructuur

```text
index.html                  # Hoofdpagina van de website
assets/
  css/                      # Vormgeving, één stylesheet per onderdeel. index.html laadt ze in deze volgorde (de cascade)
    base.css                # Lettertypes, kleurvariabelen voor licht en donker, reset
    topbar.css              # Bovenbalk met logo, thema-schakelaar en Admin login
    home.css                # Beginpagina: banner, medewerkerlijst, zoeken, bedrijfsfilter, totalen, footer
    modal.css               # Vensters, velden en de algemene knoppen
    admin.css               # Beheer: kop, tabbladen, filters en tabellen
    product-window.css      # Productvenster met − en + en de knopbalk met Registreren
    admin-forms.css         # Beheer: formulieren, lijsten, bedrijven, consumptiepunten en voorraad
    toast.css               # Meldingen
    admin-corrections.css   # Beheer: correcties en Registratie verwijderen
    motion.css              # Overgangen, animaties en minder beweging
    icons.css               # SVG-iconen
    feedback.css            # Foutmeldingen onder een veld, lege toestand en lijsten in het beheer
    suggestion.css          # Begroeting en aanbeveling in het productvenster
    directory-tools.css     # Pashint, demoknoppen en zoekveld en filter naast elkaar
    face.css                # Demo gezichtsherkenning
    start-screen.css        # Startscherm (zwart, met het ovaal en Handmatig zoeken)
    fridge.css              # Slimme koelkast en het tabblad Koelkast
    responsive.css          # Mediaqueries voor telefoon en tablet (als laatste)
  js/
    main.js                 # Startpunt van de app
    config.js               # Vaste waarden: standaardproducten, bedrijven, tijden voor automatisch uitloggen en sluiten, startscherm en scanMode
    DataStore.js            # Opslag in localStorage
    RegistrationModel.js    # Gegevens en regels
    RegistrationView.js     # Weergave (HTML)
    RegistrationApp.js      # Controller: maakt en koppelt de onderdelen hieronder, opslaan (persist), tabbladen synchroniseren
    controllers/            # Onderdelen van de controller (RegistrationApp maakt ze aan en geeft zichzelf mee)
      ModalManager.js       # vensters openen en sluiten, focus
      EmployeeController.js # beginpagina, productvenster, registreren en automatisch sluiten van het productvenster
      BadgeController.js    # herkennen met de pas (koppelt BadgeReader aan de app)
      FaceController.js     # cameravenster van de demo gezichtsherkenning, scan na een tik op het ovaal, opgeslagen gezichten en verlopen, instellen alleen na de pas of door de beheerder
      AdminController.js    # inloggen, dashboard, logboek, export, wissen, verwijderen
      CorrectionController.js # correcties + en − (registratie verwijderen)
      StockController.js    # voorraad, leveringen en minimum
      FormController.js     # formulieren medewerker, product, bedrijf en consumptiepunt
      FridgeController.js   # slimme koelkast (demo): koelkastvenster en tabblad Koelkast
      RecognitionController.js # na herkennen: koelkast of productvenster, en de vraag over gezichtsherkenning na een passcan
      StandbyController.js  # het startscherm: bij openen, na afloop en na 2 minuten, en Handmatig zoeken
      AutoScanController.js # automatisch scannen op het startscherm, de camera alleen op het startscherm
    fridge/                 # Slimme koelkast (demo, uit te zetten in config.js)
      SmartFridge.js        # weegt de schappen en rekent het gewichtsverschil om naar aantallen
      FridgeLock.js         # interface voor het slot (in productie via de backend)
      SimulatedLock.js      # nagebootst slot
      ShelfScale.js         # interface voor de weegschaal per schap (in productie via de backend)
      SimulatedShelfScale.js # nagebootste weegschaal
    FridgeView.js           # Weergave van het koelkastvenster en het tabblad Koelkast
    CsvExport.js            # Class CsvExport: CSV-export voor de loonadministratie
    ThemeManager.js         # Class ThemeManager: licht/donker thema
    icons.js                # SVG-iconen (één bron, overal dezelfde stijl)
    ids.js                  # createId(): unieke id's, ook zonder https
    FaceRecognitionDemo.js  # Demo gezichtsherkenning (uit te zetten in config.js)
    FaceIntent.js           # Intentie-drempel: alleen kenmerken van één gezicht dichtbij, in het ovaal en stil
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
  helpers.js                # Gedeelde hulpfuncties voor de tests (ook readAllCss: alle CSS in de volgorde van index.html)
  e2e/                      # 34 browsertests in headless Edge of Chrome (npm run test:e2e), met hulpcode in browser.js
  *.test.js                 # 874 unit tests (basis, datastore, model, csv-export, view-en-controller, thema, welkom-en-gezichtsherkenning, controller, regressie, codecontrole4-model, codecontrole4-ui, opslag-model-export, controller-robuustheid, beveiliging-config, gegevens-en-tabbladen, werkgever-en-correctiedatum, to-controle, pasjeslezer, beveiligingsscan, avg-toets, review-oktober, ux-review, slimme-koelkast, rollenspel-oktober, standby-en-gezicht, generale-repetitie, startscherm, gezicht-instellen-veilig)
tools/
  md-to-docx.cjs            # Stap 1: zet Markdown om naar Word in de opmaak van het TVB-sjabloon tvbsjabloon.docx (niet in de repository, vraag het op bij TVB)
  word-bijwerken.ps1        # Stap 2: laat Word de inhoudsopgave bijwerken en slaat .docx en .pdf op
archief/
  app.js                    # Originele versie van de app in één bestand (back-up, wordt niet geladen)
  app.test.js               # Oude tests bij die versie (back-up, wordt niet uitgevoerd)
.github/workflows/ci.yml    # GitHub Actions: draait npm test en daarna de browsertests met Node.js 24 op main en development (alleen leesrechten, actions vast op commit-SHA, schermafdrukken als artifact bij een mislukte browsertest)
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
- Demo gezichtsherkenning met de camera van tablet of laptop: vrijwillig per medewerker, alles op het apparaat (bibliotheek en modellen in `assets/vendor/face-api/`). Er worden geen foto's gemaakt. Sinds versie 3.17 worden alleen de kenmerken (128 getallen) met een datum op de tablet bewaard en na een jaar vanzelf gewist. Sinds versie 3.22 kan een medewerker zijn gezicht alleen zelf instellen na herkenning met zijn pas, of stelt de beheerder het in (tabblad Medewerkers, met de medewerker voor de camera). Na kiezen op naam staat er geen link en geen `Uitzetten`, zodat niemand zijn gezicht onder de naam van een collega kan zetten. Bij iedere instelling staat het moment van toestemming, en opnieuw instellen na een jaar vraagt weer de pas of de beheerder en een nieuw vinkje. Uit te zetten in `config.js`. Zie het TO (hoofdstuk 13 en bijlage B) voor de privacy-afweging. Voor productie is het advies de pas.
- Startscherm (sinds versie 3.21, `STANDBY` in `config.js`): de website opent op een zwart scherm met het TVB-logo, een ovaal voor het gezicht en de knop `Handmatig zoeken`. Beginnen kan met de pas, het gezicht of `Handmatig zoeken` (de lijst). Het startscherm komt terug na een registratie of koelkastopening en na 2 minuten zonder gebruik. `Admin login` staat op de beginpagina na `Handmatig zoeken`.
- Automatisch scannen met een intentie-drempel (demo, `FACE_DEMO.scanMode = "auto"`): zolang het startscherm in beeld is, zoekt de camera drie keer per seconde alleen naar gezichten (320 × 240, geen kenmerken). Pas als er één gezicht dichtbij in het ovaal een seconde stil staat, wordt het vergeleken. Herkend: begroeting en daarna de koelkast of het productvenster. Niet herkend: een melding en een korte pauze. De camera staat alleen aan op het startscherm. Met `scanMode = "tap"` werkt het zoals in versie 3.17: de camera gaat pas aan na een tik op het ovaal. De camera ziet in "auto" ook voorbijgangers. Zie het TO, bijlage B, voor de afweging. Voor productie blijft het advies de pas.
- Vraag na een passcan (demo): wie met de pas wordt herkend en nog geen gezichtsherkenning heeft, krijgt "Gezichtsherkenning nog niet ingesteld. Wil je dit?" met `Ja, instellen` en `Nee`. `Nee` wordt onthouden.
- Na herkennen met de pas of de camera opent standaard de slimme koelkast, met een knop naar het productvenster voor brood en beleg (`RECOGNITION_TARGET` in `config.js`, "fridge" of "products").
- Herkennen met de pas: een USB-NFC-lezer die zich als toetsenbord gedraagt typt het pasnummer. De beheerder koppelt de pas in het medewerkersformulier. Geen bibliotheek of driver nodig. Uit te zetten in `config.js`.
- Slimme koelkast (demo, uit te zetten met `SMART_FRIDGE` in `config.js`): de koelkast opent met de pas, de medewerker pakt van de schappen en sluit de deur, en het gewichtsverschil per schap wordt vanzelf als registratie opgeslagen (met voorraad en logboekregel). Een verschil dat niet klopt, wordt gemarkeerd voor de beheerder. Het slot en de weegschalen zijn nagebootst. In productie stuurt alleen de backend ze aan. In het beheer staan de indeling van de schappen en de laatste openingen. Zie het TO, bijlage B.
- Licht en donker thema: standaard volgt de website de instelling van het apparaat ("Systeem"). Met de slider in de bovenbalk kies je zelf licht of donker, en met "Auto" is het overdag licht en na zonsondergang donker. In donkere modus blijft de huisstijl behouden en wordt de tekst groen.
- Uitgebreide documentatie in [`docs/DOCUMENTATIE.md`](./docs/DOCUMENTATIE.md) en in de TVB-huisstijl als [`docs/DOCUMENTATIE.docx`](./docs/DOCUMENTATIE.docx) en [`docs/DOCUMENTATIE.pdf`](./docs/DOCUMENTATIE.pdf).
- Technisch ontwerp in [`docs/TO-BLIKJESREGISTRATIE.md`](./docs/TO-BLIKJESREGISTRATIE.md): het enige ontwerpdocument, met aanleiding, gebruikersrollen, functionele eisen, use cases, low-, mid- en high-fidelity wireframes (een screenshot van ieder scherm met UI-principes en Nielsen-heuristieken), OOP-architectuur, databasespecificatie en acceptatiecriteria.
- Productiegericht PostgreSQL-schema in [`docs/DATABASE-SCHEMA.sql`](./docs/DATABASE-SCHEMA.sql).
- Het technisch ontwerp in de TVB-huisstijl als [`docs/TO-BLIKJESREGISTRATIE.docx`](./docs/TO-BLIKJESREGISTRATIE.docx) en [`docs/TO-BLIKJESREGISTRATIE.pdf`](./docs/TO-BLIKJESREGISTRATIE.pdf). De `.md`-bestanden zijn de bron; de Word- en PDF-versies worden gemaakt met `tools/md-to-docx.cjs` en `tools/word-bijwerken.ps1` (zie het voorbeeld bovenin `md-to-docx.cjs`).
