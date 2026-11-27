# Consumptieregistratie TVB

Een interactieve front-end voor het registreren van eten en drinken binnen de organisatie.

Zonder server werkt de app als demo: alle gegevens staan in `localStorage` van één browser. Sinds versie 3.33 (26 november 2026) kan de app ook met een server werken, voor echt gebruik bij TVB: een server in PHP met één database voor alle tablets, een echte login voor de beheerder en de medewerkers en bedrijven uit AFAS Profit. Op de server van TVB draait de app in een container met Coolify. De slimme koelkast (slot en weegschalen) is volgens het besluit van de administratie van TVB van 25 november 2026 vervallen.

## Starten

Open de map in VS Code en start [index.html](./index.html) met de extensie **Live Server** (of een andere lokale webserver). Er is geen buildstap nodig. Alle bestanden (ook lettertypes en face-api) staan in het project zelf. Er wordt niets van een externe server geladen. De camera voor de demo gezichtsherkenning werkt alleen via `https://` of `http://localhost`.

Dubbelklikken op `index.html` werkt niet: de JavaScript bestaat uit modules en browsers blokkeren die via `file://`.

Met de server op een eigen computer (PHP 8.3+): maak eerst een beheerder met `php backend/bin/beheerder.php <e-mailadres>` (met `CR_DB_DSN` zoals in `start-lokaal.cmd`), start dan `start-lokaal.cmd` of `php -S 127.0.0.1:8080 backend/dev-server.php` en open `http://127.0.0.1:8080`. Op de server van TVB bouwt Coolify de container uit `Dockerfile` en `docker-compose.yml`. De instellingen (`CR_BEHEER_EMAIL`, `SERVICE_PASSWORD_BEHEER`, `AFAS_TOKEN`, `AFAS_BASE_URL` en `AFAS_CONNECTOR`) staan alleen in Coolify, nooit in Git. Zie [`docs/DOCUMENTATIE.md`](./docs/DOCUMENTATIE.md), hoofdstuk 3.

Tests draaien (Node.js 22+, de CI gebruikt Node.js 24 LTS): `npm test`

Tests van de backend draaien (de server en de AFAS-koppeling, 161 tests, PHP 8.3+): `php backend/tests/run.php`

Browsertests (end-to-end) draai je met `npm run test:e2e`. Ze openen de echte pagina zonder venster in Microsoft Edge (Windows) of Google Chrome (Linux). Staat de browser ergens anders, zet dan `BROWSER_PATH` op het pad van de browser, bijvoorbeeld `BROWSER_PATH="/usr/bin/chromium" npm run test:e2e`. Er hoeft niets met npm te worden geïnstalleerd. Er zijn 42 browsertests: 33 in `tests/e2e/app.e2e.test.js` (de demo) en 9 in `tests/e2e/server.e2e.test.js` (met de echte server in PHP en een tijdelijke database, zonder PHP overgeslagen). In GitHub Actions draaien ze automatisch na de unit tests. Met `E2E_CPU_THROTTLE=4` draait de browser vier keer trager, zoals op een drukke server. Mislukt een browsertest, dan staan het scenario, de toestand van de pagina en de laatste meldingen uit de console in de foutuitvoer en komt er een schermafdruk in `test-results/e2e` (in GitHub Actions bewaard als artifact).

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
    responsive.css          # Mediaqueries voor telefoon en tablet (als laatste)
  js/
    main.js                 # Startpunt van de app
    config.js               # Vaste waarden: standaardproducten, de bedrijven van de demo, tijden voor automatisch uitloggen en sluiten, startscherm en scanMode
    DataStore.js            # Opslag in localStorage
    RegistrationModel.js    # Gegevens en regels
    RegistrationView.js     # Weergave (HTML)
    RegistrationApp.js      # Controller: maakt en koppelt de onderdelen hieronder, opslaan (persist), tabbladen synchroniseren
    controllers/            # Onderdelen van de controller (RegistrationApp maakt ze aan en geeft zichzelf mee)
      ControllerPart.js     # basisclass van de onderdelen: app, model, view, faceDemo en de echte klok
      ModalManager.js       # vensters openen en sluiten, focus
      EmployeeController.js # beginpagina, productvenster, registreren en automatisch sluiten van het productvenster
      BadgeController.js    # herkennen met de pas (koppelt BadgeReader aan de app)
      FaceController.js     # cameravenster van de demo gezichtsherkenning, scan na een tik op het ovaal, opgeslagen gezichten en verlopen, instellen alleen na de pas of door de beheerder
      AdminController.js    # inloggen, dashboard, logboek, export, pasjes exporteren, looncodes importeren, wissen, verwijderen
      CorrectionController.js # correcties + en − (registratie verwijderen)
      StockController.js    # voorraad, leveringen en minimum
      FormController.js     # formulieren medewerker, product, bedrijf en consumptiepunt
      GuestController.js    # registreren als gast (met de server)
      QuickSetupController.js # Snellere optie instellen: gezicht, pas of allebei (met de server)
      RecognitionController.js # na herkennen: altijd het productvenster, en de vraag over gezichtsherkenning na een passcan
      StandbyController.js  # het startscherm: bij openen, na afloop en na 2 minuten, en Handmatig zoeken
      AutoScanController.js # automatisch scannen op het startscherm, de camera alleen op het startscherm
    CsvExport.js            # Class CsvExport: CSV-export voor de loonadministratie
    ThemeManager.js         # Class ThemeManager: licht/donker thema
    icons.js                # SVG-iconen (één bron, overal dezelfde stijl)
    ids.js                  # createId(): unieke id's, ook zonder https
    FaceRecognitionDemo.js  # Demo gezichtsherkenning (uit te zetten in config.js)
    FaceIntent.js           # Intentie-drempel: alleen kenmerken van één gezicht dichtbij, in het ovaal en stil
    FaceLiveness.js         # Stille controle op een levend gezicht: een foto van een collega wordt niet herkend of ingesteld
    BadgeReader.js          # Herkennen met de pas via een USB-NFC-lezer (uit te zetten in config.js)
    PayrollImport.js        # Class PayrollImport: looncodes importeren uit een CSV-bestand van de loonadministratie
    deployment.js           # SERVER_API: leeg is de demo, "/api" is met de server (de container levert docker/deployment.js)
    ServerMode.js           # Met de server: opstarten, inlogscherm, inloggen en uitloggen, tabblad Tablets en AFAS met de afdelingen
    ServerApi.js            # Met de server: de verzoeken aan /api (met ServerError)
    ServerDataStore.js      # Met de server: opslag in het geheugen met een wachtrij (subclass van DataStore)
    ServerSync.js           # Met de server: de wachtrij versturen en iedere 8 seconden de wijzigingen ophalen
  fonts/                    # Lettertypes DM Sans en Space Grotesk (zelf gehost, SIL OFL, zie LICENSE.txt)
  vendor/
    face-api/               # face-api 1.7.15 en de drie modellen voor de demo (MIT, met TensorFlow.js onder Apache 2.0, ca. 8 MB, niet meer onderhouden en dus alleen voor de demo)
docs/
  TO-CONSUMPTIEREGISTRATIE.md  # Technisch ontwerp (enige ontwerpdocument)
  DOCUMENTATIE.md           # Uitleg van de code en gebruikershandleiding
  DATABASE-SCHEMA.sql       # PostgreSQL-schema voor productie
  PENTESTRAPPORT.md         # Pentest van november 2026: bevindingen, oplossingen en status
  AUDITRAPPORT.md           # Security audit van 26 november 2026: de server, de container en de koppeling met AFAS
  *.docx, *.pdf             # Word- en PDF-versies van het TO, de documentatie, het pentestrapport en het auditrapport in de TVB-huisstijl
  wireframes/               # Low-, mid- en high-fidelity wireframes van de schermen (gebruikt in het TO)
tests/
  helpers.js                # Gedeelde hulpfuncties voor de tests (ook readAllCss: alle CSS in de volgorde van index.html)
  helpers-gezicht.js        # Nagebootst gezicht van 68 punten, een foto als plat vlak en ruis (voor de controle op een levend gezicht)
  e2e/                      # 42 browsertests in headless Edge of Chrome (npm run test:e2e): 33 met de demo, 9 met de echte server in PHP. Hulpcode in browser.js
  *.test.js                 # 989 unit tests (basis, datastore, model, csv-export, view-en-controller, thema, welkom-en-gezichtsherkenning, controller, regressie, codecontrole4-model, codecontrole4-ui, opslag-model-export, controller-robuustheid, beveiliging-config, gegevens-en-tabbladen, werkgever-en-correctiedatum, to-controle, pasjeslezer, beveiligingsscan, avg-toets, review-oktober, ux-review, rollenspel-oktober, standby-en-gezicht, generale-repetitie, startscherm, gezicht-instellen-veilig, levend-gezicht, pentest-november, looncode, server-sync, server-mode, zoeken-en-locatie, gasten, pasjes-dataset, geen-camerabeeld, snellere-optie, looncode-import-en-afdeling)
backend/                    # Serverdeel in PHP (zie backend/README.md)
  public/index.php          # Het enige bestand dat de webserver uitvoert: de API onder /api
  dev-server.php            # Ontwikkelserver: php -S 127.0.0.1:8080 backend/dev-server.php (website en API op een eigen computer)
  src/Server/               # De server: Database, RecordStore, Auth, Policy, Api, Request, Response en RecordEmployeeRepository
  src/Afas/                 # De koppeling met AFAS: AfasConfig, AfasClient, EmployeeMapper, EmployeeSync en SyncRunner
  bin/                      # beheerder.php (beheerder aanmaken of nieuw wachtwoord), afas-metainfo.php (veldnamen bij AFAS) en afas-sync.php (proefdraaien)
  tests/                    # Tests met nagebootste antwoorden van AFAS en een tijdelijke database (php backend/tests/run.php)
Dockerfile                  # De container voor Coolify: Apache met PHP 8.3, de website en de API
docker-compose.yml          # Voor Coolify: de instellingen, het volume consumptie-data voor de database en geen eigen poort
docker/                     # apache.conf, php.ini, start.sh (maakt de eerste beheerder aan) en deployment.js
.dockerignore               # Wat niet in de container mag: .env, de tests, de documenten
start-lokaal.cmd            # Start de website met de server op een eigen computer (Windows, zonder Docker)
.env.example                # De namen van de instellingen (AFAS_TOKEN, AFAS_BASE_URL, AFAS_CONNECTOR en CR_*), zonder waarden
.gitleaksignore             # Een bekend vals alarm van de geheimenscan Gitleaks, met uitleg
tools/
  md-to-docx.cjs            # Stap 1: zet Markdown om naar Word in de opmaak van het TVB-sjabloon tvbsjabloon.docx (niet in de repository, vraag het op bij TVB)
  word-bijwerken.ps1        # Stap 2: laat Word de inhoudsopgave bijwerken en slaat .docx en .pdf op
uitleg-video/
  video.json                # Script van het uitlegfilmpje voor de bedrijvenmarkt (59 s, verzonnen namen)
  assets/                   # Nagetekende schermen voor het filmpje (SVG). Het mp4-bestand staat niet in Git
archief/
  app.js                    # Originele versie van de app in één bestand (back-up, wordt niet geladen)
  app.test.js               # Oude tests bij die versie (back-up, wordt niet uitgevoerd)
.github/workflows/ci.yml    # GitHub Actions op main en development, met Node.js 24: unit tests, tests van de backend (PHP), browsertests en het bouwen en controleren van de container (alleen leesrechten, actions vast op commit-SHA, geen geheimen, schermafdrukken als artifact bij een mislukte browsertest)
```

## Inbegrepen

- Medewerkerlijst met zoeken en een persoonlijk productvenster waarin meerdere producten met `+` en `−` kunnen worden gekozen en daarna tegelijk geregistreerd.
- Medewerkers zijn gekoppeld aan een bedrijf en een consumptiepunt, en worden per bedrijf gegroepeerd en gefilterd.
- Automatische datum/tijd en lokale opslag via `localStorage` (in de demo, met de server in de database van de server).
- Admin-demo via de knop rechtsboven (in de demo werkt elk ingevuld wachtwoord, met de server is er een echte login).
- Admin-overzicht met medewerker- en maandfilters.
- Registraties corrigeren met `+` en `−`, medewerkers toevoegen/wijzigen en actief/inactief zetten.
- Inactieve medewerkers zonder registraties kunnen daarna ook definitief worden verwijderd (na bevestiging). Medewerkers met registraties worden alleen gedeactiveerd, zodat de export klopt. Een actieve medewerker moet eerst op inactief worden gezet. Ook het model controleert dit.
- Producten en prijzen beheren. Een product dat nooit is geregistreerd, kan na bevestiging worden verwijderd. Standaard zijn blikje €0,65, sneetje brood €0,10, boter €0,10, zoet beleg €0,20, glas melk €0,20, beleg €0,50, ei €0,50 en yoghurt €0,50.
- Medewerkers zien geen persoonlijke aantallen of persoonlijke kosten. Die zijn alleen te zien voor de beheerder.
- Producten toevoegen via een formulier met `Opslaan` en `Opslaan + opnieuw`.
- Bedrijvenbeheer: in de demo staan de 13 bedrijven van TVB erin (met de server komen de bedrijven uit AFAS). Bedrijven toevoegen, naam en standaard werkgevernummer wijzigen (per medewerker kan een afwijkend werkgevernummer worden ingevuld). Bedrijfsnaam en werkgevernummer zijn uniek. Een bedrijf kan meerdere consumptiepunten hebben, en per consumptiepunt zet je aan welke producten er worden aangeboden. Medewerkers hebben een vast consumptiepunt en zien alleen de producten van dat punt. Een nieuw product staat overal uit tot de beheerder het aanzet.
- Voorraadbeheer per consumptiepunt: iedere registratie haalt 1 van de voorraad af, leveringen en tellingen worden geboekt (hele getallen tot 100.000), en per product is er een minimum. Een bijbestellijst toont alles wat op is of bijbesteld moet worden.
- Correcties in een oude maand vragen eerst om bevestiging, omdat die loonmaand mogelijk al is verwerkt. Iedere beheerwijziging wordt samen met de logboekregel opgeslagen.
- Knop `Alle gegevens wissen` in het tabblad Logboek: wist na twee bevestigingen alle gegevens, reservekopieën en ingestelde gezichten op de tablet (AVG, recht op vergetelheid), logt uit en zet de demogegevens terug.
- Beveiliging in de demo: alle waarden in HTML worden ge-escapet, opgeslagen id's, kleuren, prijzen, codes en tijdstippen worden bij het laden gecontroleerd (ook dubbele id's, registraties van meer dan een dag in de toekomst, tellingen in de toekomst en speciale sleutels als `__proto__` in de voorraad), iedere beheeractie controleert zelf of er een beheerder is ingelogd, de camera gaat uit als de tijd om is, een Content-Security-Policy en `no-referrer` in `index.html`, lettertypes en face-api zelf gehost (geen Google Fonts of CDN) en CSV-velden zijn beschermd tegen formules. Zie het TO, hoofdstuk 13, voor wat er vóór productie nog moet gebeuren.
- CSV-export (te openen in Excel) met vaste kolommen: Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs. Jaar en Maand zijn de loonmaand: consumpties worden verwerkt in de maand erna (september → oktober, december → januari).
- Administratief logboek voor wijzigingen, met maximaal 20 regels tegelijk en `Meer laden`.
- Persoonlijk welkom in het productvenster. Na herkenning met de pas of de camera ook "welkom terug" en een knop "Zelfde als vorige keer" met de keuze van de vorige keer. Wie op een naam tikt, ziet die niet, zodat collega's niet kunnen zien wat iemand eerder koos.
- Onder in het productvenster een korte uitleg dat registraties maandelijks op het loon worden ingehouden, met een verwijzing naar de privacyverklaring voor medewerkers.
- De beheerder wordt automatisch uitgelogd als het beheer 5 minuten niet is gebruikt (`ADMIN_IDLE_LOGOUT_MS` in `config.js`). Na uitloggen staan er geen gegevens van het beheer meer in de pagina.
- Hooguit 10 van één product in één keer (`MAX_PER_PRODUCT` in `config.js`), ook met een ingedrukt gehouden toets. Een leesbare reservekopie van beschadigde gegevens bevat geen gezichtskenmerken, en iedere kopie verdwijnt na 30 dagen (`BACKUP_RETENTION_DAYS`). Een registratie met een tijdstip in de toekomst (een klok die niet klopt) wordt bewaard, met een melding voor de beheerder. Zie [docs/PENTESTRAPPORT.md](./docs/PENTESTRAPPORT.md) (pentest november 2026).
- Het productvenster sluit vanzelf zonder op te slaan als het 75 seconden niet wordt gebruikt, met in de laatste 10 seconden "Venster sluit zo. Tik om door te gaan." (`EMPLOYEE_IDLE_CLOSE_MS` in `config.js`). Een pas van een collega vervangt een open productvenster. Na registreren zijn het zoekveld en het bedrijfsfilter weer leeg.
- Gemaakt voor een tablet: de knop `Registreren` blijft onderaan het productvenster in beeld (over de volle breedte), zonder keuze is hij uitgeschakeld met de uitleg "Kies eerst een product met +", een gekozen product krijgt een lichtgroene achtergrond en knoppen zijn minstens 44 pixels hoog. Een schermlezer hoort na zoeken alleen het aantal medewerkers en leest de meldingen voor. Zie de paragraaf "UX-review oktober 2026" in het TO (hoofdstuk 9).
- Demo gezichtsherkenning met de camera van tablet of laptop: vrijwillig per medewerker, alles op het apparaat (bibliotheek en modellen in `assets/vendor/face-api/`). Er worden geen foto's gemaakt. Sinds versie 3.17 worden alleen de kenmerken (128 getallen) met een datum op de tablet bewaard en na een jaar vanzelf gewist. Sinds versie 3.22 kan een medewerker zijn gezicht alleen zelf instellen na herkenning met zijn pas, of stelt de beheerder het in (tabblad Medewerkers, met de medewerker voor de camera). Na kiezen op naam staat er geen link en geen `Uitzetten`, zodat niemand zijn gezicht onder de naam van een collega kan zetten. Bij iedere instelling staat het moment van toestemming, en opnieuw instellen na een jaar vraagt weer de pas of de beheerder en een nieuw vinkje. Sinds versie 3.23 kijkt een stille controle tijdens het herkennen of het gezicht knippert of licht vervormt (`FACE_DEMO.liveness` in `config.js`, met `debug` om af te stellen op de tablet). Zo wordt een geprinte foto of een foto op een telefoon niet herkend en niet ingesteld, zonder opdracht aan de medewerker. Een video op een telefoon houdt dit niet tegen. Uit te zetten in `config.js`. Zie het TO (hoofdstuk 13 en bijlage B) voor de privacy-afweging. Voor productie is het advies de pas.
- Startscherm (sinds versie 3.21, `STANDBY` in `config.js`): de website opent op een zwart scherm met het TVB-logo, een ovaal voor het gezicht en de knop `Handmatig zoeken`. Beginnen kan met de pas, het gezicht of `Handmatig zoeken` (de lijst). Het startscherm komt terug na een registratie en na 2 minuten zonder gebruik. `Admin login` staat op de beginpagina na `Handmatig zoeken`.
- Automatisch scannen met een intentie-drempel (demo, `FACE_DEMO.scanMode = "auto"`): zolang het startscherm in beeld is, zoekt de camera drie keer per seconde alleen naar gezichten (320 × 240, geen kenmerken). Pas als er één gezicht dichtbij in het ovaal een seconde stil staat, wordt het vergeleken. Herkend: begroeting en daarna het productvenster. Niet herkend: een melding en een korte pauze. De camera staat alleen aan op het startscherm. Met `scanMode = "tap"` werkt het zoals in versie 3.17: de camera gaat pas aan na een tik op het ovaal. De camera ziet in "auto" ook voorbijgangers. Zie het TO, bijlage B, voor de afweging. Voor productie blijft het advies de pas.
- Vraag na een passcan (demo): wie met de pas wordt herkend en nog geen gezichtsherkenning heeft, krijgt "Gezichtsherkenning nog niet ingesteld. Wil je dit?" met `Ja, instellen` en `Nee`. `Nee` wordt onthouden.
- Na herkennen met de pas of de camera opent altijd het productvenster. De slimme koelkast (slot en weegschalen) is sinds versie 3.33 vervallen.
- Herkennen met de pas: een USB-NFC-lezer die zich als toetsenbord gedraagt typt het pasnummer. De beheerder koppelt de pas in het medewerkersformulier. Geen bibliotheek of driver nodig. Uit te zetten in `config.js`.
- Met de server (sinds versie 3.33): alle tablets delen één database, de beheerder logt in met een eigen wachtwoord (blokkade na vijf foute pogingen), en iedere tablet wordt in het tabblad `Tablets en AFAS` gekoppeld aan een locatie. Een tablet krijgt geen looncodes, personeelsnummers, afdelingen of telefoonnummers. Zonder verbinding blijven registraties in een wachtrij.
- Zoeken op een tablet zonder namenlijst: pas na typen verschijnen de namen. Bovenaan staan de medewerkers van de locatie van de tablet, en de producten en de voorraad zijn die van de locatie.
- Gasten (iemand van buiten TVB): registreren met naam en telefoonnummer. Het telefoonnummer ziet alleen de beheerder en gasten staan niet in het bestand voor de loonadministratie.
- `Pasjes exporteren`: een CSV-bestand met het serienummer van iedere gekoppelde pas en de persoon erbij.
- `Snellere optie instellen`: na zichzelf opzoeken stelt een medewerker zelf zijn gezicht of pas in, of wijst het een jaar af. Het camerabeeld is nooit te zien.
- `Looncodes importeren`: de beheerder leest alle looncodes in één keer in uit een CSV-bestand van de loonadministratie (ook in de demo). Met de server staan ze in de database, zodat iedere beheerder ze op iedere locatie ziet.
- Medewerkers en bedrijven uit AFAS met `Nu synchroniseren`. De afdeling uit AFAS koppelt de beheerder aan een consumptiepunt, zodat medewerkers van die afdeling dat punt krijgen. Looncode, werklocatie en datum uit dienst komen niet uit AFAS (zie het TO, hoofdstuk 11).
- Licht en donker thema: standaard volgt de website de instelling van het apparaat ("Systeem"). Met de slider in de bovenbalk kies je zelf licht of donker, en met "Auto" is het overdag licht en na zonsondergang donker. In donkere modus blijft de huisstijl behouden en wordt de tekst groen.
- Uitgebreide documentatie in [`docs/DOCUMENTATIE.md`](./docs/DOCUMENTATIE.md) en in de TVB-huisstijl als [`docs/DOCUMENTATIE.docx`](./docs/DOCUMENTATIE.docx) en [`docs/DOCUMENTATIE.pdf`](./docs/DOCUMENTATIE.pdf).
- Technisch ontwerp in [`docs/TO-CONSUMPTIEREGISTRATIE.md`](./docs/TO-CONSUMPTIEREGISTRATIE.md): het enige ontwerpdocument, met aanleiding, gebruikersrollen, functionele eisen, use cases, low-, mid- en high-fidelity wireframes (een screenshot van ieder scherm met UI-principes en Nielsen-heuristieken), OOP-architectuur, databasespecificatie en acceptatiecriteria.
- Pentestrapport van november 2026 in [`docs/PENTESTRAPPORT.md`](./docs/PENTESTRAPPORT.md): wat er is getest, de bevindingen met hun ernst en per bevinding de status (opgelost, gedocumenteerd of geaccepteerd).
- Auditrapport van de security audit van 26 november 2026 in [`docs/AUDITRAPPORT.md`](./docs/AUDITRAPPORT.md): de server, de container en de koppeling met AFAS gecontroleerd op het uitlekken van het token en van personeelsgegevens, met per bevinding de ernst, de oplossing en wat overblijft.
- Productiegericht PostgreSQL-schema in [`docs/DATABASE-SCHEMA.sql`](./docs/DATABASE-SCHEMA.sql).
- Het technisch ontwerp in de TVB-huisstijl als [`docs/TO-CONSUMPTIEREGISTRATIE.docx`](./docs/TO-CONSUMPTIEREGISTRATIE.docx) en [`docs/TO-CONSUMPTIEREGISTRATIE.pdf`](./docs/TO-CONSUMPTIEREGISTRATIE.pdf). De `.md`-bestanden zijn de bron. De Word- en PDF-versies worden gemaakt met `tools/md-to-docx.cjs` en `tools/word-bijwerken.ps1` (zie het voorbeeld bovenin `md-to-docx.cjs`).
