# Documentatie Consumptieregistratie

## 1. Doel van de applicatie

Consumptieregistratie is een eenvoudige website waarmee medewerkers eten en drinken kunnen registreren. De standaardproducten zijn blikje (€0,65), sneetje brood (€0,10), boter (€0,10), zoet beleg (€0,20), glas melk (€0,20), beleg (€0,50), ei (€0,50) en yoghurt (€0,50). Een medewerker kiest de producten met `+` en `−` en slaat ze op met `Registreren`. Ieder gekozen product wordt dan één registratie. Persoonlijke aantallen en kosten zijn alleen zichtbaar voor de beheerder.

Deze versie is een **frontend-demo**. De gegevens worden opgeslagen in `localStorage` van de gebruikte browser. Daardoor zijn de gegevens op één computer/browser beschikbaar, maar nog niet gedeeld tussen alle gebruikers van een bedrijfsnetwerk.

## 2. Bestanden

| Bestand | Functie |
|---|---|
| `index.html` | De HTML-structuur en alle zichtbare onderdelen van de website |
| `assets/css/` | De vormgeving, kleuren, layout en mobiele weergave, verdeeld over achttien stylesheets per onderdeel (sinds versie 3.20, zie hoofdstuk 6). `index.html` laadt ze in een vaste volgorde |
| `assets/js/main.js` | Startpunt: maakt opslag, model, view en controller aan en start de app |
| `assets/js/config.js` | Vaste waarden: opslagsleutel, kleuren, voorbeeldmedewerkers, standaardproducten, de 13 bedrijven, de tijden van zonsopkomst en zonsondergang, de instellingen van de demo gezichtsherkenning (`FACE_DEMO`), van de pasjeslezer (`BADGE_READER`), na hoeveel tijd zonder invoer de beheerder wordt uitgelogd (`ADMIN_IDLE_LOGOUT_MS`, 5 minuten) en na hoeveel tijd zonder invoer het productvenster vanzelf sluit (`EMPLOYEE_IDLE_CLOSE_MS`, 75 seconden, met de waarschuwing `EMPLOYEE_IDLE_WARNING_MS`, de laatste 10 seconden) en de instellingen van de slimme koelkast (`SMART_FRIDGE`, zie 4.17), wat er opent na herkennen (`RECOGNITION_TARGET`), het startscherm (`STANDBY`) en hoe de camera op het startscherm begint (`FACE_DEMO.scanMode` en `FACE_DEMO.autoScan`, zie 4.18) en de stille controle op een levend gezicht (`FACE_DEMO.liveness`, zie 4.15) |
| `assets/js/DataStore.js` | Opslag in `localStorage`, validatie en omzetting van oude gegevens |
| `assets/js/RegistrationModel.js` | Gegevens en regels voor registraties, medewerkers, producten en logboek |
| `assets/js/RegistrationView.js` | Weergave van alle onderdelen als HTML |
| `assets/js/RegistrationApp.js` | Controller: maakt de twaalf onderdelen hieronder en koppelt ze, slaat op via `persist`, neemt wijzigingen uit een ander tabblad over, werkt de datum bij na middernacht en koppelt alle klikken en toetsen. Alle methodes van de onderdelen zijn ook via deze class te gebruiken |
| `assets/js/controllers/ModalManager.js` | Class `ModalManager` (onderdeel van de controller): vensters openen en sluiten, de focus terugzetten, Escape en Tab binnen een venster |
| `assets/js/controllers/EmployeeController.js` | Class `EmployeeController` (onderdeel van de controller): zoeken en bedrijfsfilter op de beginpagina, het productvenster en registreren |
| `assets/js/controllers/BadgeController.js` | Class `BadgeController` (onderdeel van de controller): herkennen met de pas, koppelt `BadgeReader` aan de app |
| `assets/js/controllers/FaceController.js` | Class `FaceController` (onderdeel van de controller): het cameravenster van de demo gezichtsherkenning, de scan na een tik, opslaan en uitzetten van een gezicht (sinds versie 3.22 zelf alleen na de pas, uitzetten na de pas of de camera, en door de beheerder) en verlopen gezichten wissen |
| `assets/js/controllers/RecognitionController.js` | Class `RecognitionController` (onderdeel van de controller, sinds versie 3.17): wat er opent na herkennen met de pas of de camera (koelkast of productvenster) en de vraag over gezichtsherkenning na een passcan |
| `assets/js/controllers/StandbyController.js` | Class `StandbyController` (onderdeel van de controller, sinds versie 3.17): sinds versie 3.21 het startscherm. Tonen bij het openen, na afloop van een registratie of koelkastopening en na 2 minuten zonder invoer, de teksten en `Handmatig zoeken` (zie 4.18) |
| `assets/js/controllers/AutoScanController.js` | Class `AutoScanController` (onderdeel van de controller, sinds versie 3.21): het automatisch scannen op het startscherm. Zet de camera alleen op het startscherm aan, zoekt gezichten en laat pas boven de intentie-drempel de kenmerken berekenen (zie 4.18) |
| `assets/js/controllers/AdminController.js` | Class `AdminController` (onderdeel van de controller): inloggen, dashboard en tabbladen, logboek, export, `Alle gegevens wissen`, (de)activeren en verwijderen, en `requireAdmin` |
| `assets/js/controllers/CorrectionController.js` | Class `CorrectionController` (onderdeel van de controller): correcties `+` en `−` en het venster `Registratie verwijderen` |
| `assets/js/controllers/StockController.js` | Class `StockController` (onderdeel van de controller): het tabblad Voorraad (leveringen, tellingen en minimum) |
| `assets/js/controllers/FormController.js` | Class `FormController` (onderdeel van de controller): de formulieren voor medewerker, product, bedrijf en consumptiepunt, met de controle van de invoer |
| `assets/js/controllers/FridgeController.js` | Class `FridgeController` (onderdeel van de controller): de slimme koelkast (demo), het koelkastvenster en het tabblad Koelkast (zie 4.17) |
| `assets/js/FridgeView.js` | Class `FridgeView`: tekent het koelkastvenster en het tabblad Koelkast. `RegistrationView` maakt deze class en geeft de methodes door |
| `assets/js/fridge/SmartFridge.js` | Class `SmartFridge`: de slimme koelkast. Weegt bij openen en sluiten en rekent het gewichtsverschil per schap om naar aantallen, met een tolerantie |
| `assets/js/fridge/FridgeLock.js` en `assets/js/fridge/ShelfScale.js` | De afspraken (interfaces) voor het slot en de weegschaal per schap. In productie komen hier classes die via de backend werken |
| `assets/js/fridge/SimulatedLock.js` en `assets/js/fridge/SimulatedShelfScale.js` | Het nagebootste slot (gaat na 10 seconden vanzelf dicht als de deur niet opengaat) en de nagebootste weegschaal van de demo |
| `assets/js/CsvExport.js` | Class `CsvExport`: CSV-export voor de loonadministratie (maand + 1) |
| `assets/js/ThemeManager.js` | Class `ThemeManager`: licht en donker thema (Systeem, Auto of zelf kiezen met de slider) |
| `assets/js/icons.js` | De SVG-iconen van de website, met de hulpfunctie `icon(naam)` |
| `assets/js/ids.js` | De functie `createId()` voor unieke id's. Werkt ook als de website via een netwerkadres zonder https wordt geopend |
| `assets/js/FaceRecognitionDemo.js` | Class `FaceRecognitionDemo`: de uitschakelbare demo gezichtsherkenning (zie 4.15) |
| `assets/js/FaceIntent.js` | Class `FaceIntent` (sinds versie 3.21): de intentie-drempel van het automatisch scannen. Beslist per camerabeeld of er precies één gezicht dichtbij, in het ovaal en stil staat (zie 4.18) |
| `assets/js/FaceLiveness.js` | Class `FaceLiveness` (sinds versie 3.23): de stille controle op een levend gezicht. Kijkt met de 68 gezichtspunten van de herkenning of het gezicht knippert of licht vervormt, zodat een foto van een collega niet als die collega wordt herkend of ingesteld (zie 4.15) |
| `assets/js/BadgeReader.js` | Class `BadgeReader`: herkennen met de pas via een USB-NFC-lezer die zich als toetsenbord gedraagt (zie 4.16) |
| `assets/fonts/` | De lettertypes DM Sans en Space Grotesk (woff2), zelf gehost in plaats van via Google Fonts. Licentie: SIL Open Font License 1.1 (`LICENSE.txt`) |
| `assets/vendor/face-api/` | De bibliotheek face-api (`face-api.esm.js`, versie 1.7.15) en de drie modellen voor de demo gezichtsherkenning, met de MIT-licentie (`LICENSE`). In de bibliotheek zit TensorFlow.js 4.22.0, met de Apache-licentie 2.0 (`LICENSE-TENSORFLOWJS`). Samen ongeveer 8 MB, waarvan 6,4 MB het herkenningsmodel. Wordt alleen geladen als iemand de demo gebruikt. `README.md` in deze map noemt de bron, een SHA-256-controlegetal per bestand en dat face-api niet meer wordt onderhouden (de repository is gearchiveerd, daarom alleen voor de demo) |
| `archief/app.js` | Back-up van de originele versie in één bestand. Wordt niet meer geladen |
| `archief/app.test.js` | Back-up van de oude tests bij die versie. Wordt niet meer uitgevoerd |
| `README.md` | Korte startinformatie voor het project |
| `tools/md-to-docx.cjs` en `tools/word-bijwerken.ps1` | Maken van `docs/TO-BLIKJESREGISTRATIE.md` en `docs/DOCUMENTATIE.md` een Word-bestand (`.docx`) en een PDF in de TVB-huisstijl, op basis van het sjabloon `docs/tvbsjabloon.docx`: voorblad, inhoudsopgave, genummerde koppen, tabellen en opsommingstekens. Nodig: Node.js en Microsoft Word. De `.md`-bestanden blijven de bron: een wijziging die alleen in de `.docx` staat, is weg na de volgende keer maken |
| `docs/` | Technisch ontwerp (met daarin ook de functionele eisen en de wireframes), databaseschema en deze documentatie |
| `docs/wireframes/` | Low-fidelity (`lofi-…`), mid-fidelity (`midfi-…`) en high-fidelity (`w…`) wireframes van de schermen, gebruikt in het TO (hoofdstuk 9) |
| `tests/slimme-koelkast.test.js` | Tests voor de slimme koelkast: omrekenen van gewicht naar aantallen (tolerantie, terugleggen, meerdere schappen, onverklaarbaar verschil), het slot met een nep-klok, de weegschaal, registraties met voorraad en logboek, de indeling, de controle en migratie in `DataStore`, wissen, en het koelkastvenster met de pas (onbekende pas, tweede scan, deur te lang open, mislukt opslaan, herladen) |
| `tests/startscherm.test.js` | Tests voor het startscherm en het automatisch scannen (versie 3.21), met een nep-klok, een nep-camera en nagebootste gezichten: het startscherm bij het openen, na 2 minuten, na een registratie en na de koelkast, `Handmatig zoeken`, een passcan op het startscherm, de camera alleen op het startscherm (uit bij een venster, `Handmatig zoeken` en een verborgen tabblad), geen kenmerken voor een gezicht op afstand, buiten het ovaal, in beweging of met twee gezichten, herkend naar de koelkast of het productvenster, niet herkend met melding en pauze, geen camera of geen toestemming, `scanMode` "tap" en `FaceIntent`, en sinds versie 3.23 een foto in het ovaal (opent niets, na 5 seconden "niet herkend") en een echt hoofd (herkend zonder opdracht) |
| `tests/standby-en-gezicht.test.js` | Tests voor tik om te scannen (sinds versie 3.21 met `scanMode` "tap") en de vraag na een passcan (versie 3.17), met een nep-klok en een nep-camera: het startscherm na 2 minuten, `Handmatig zoeken` zonder klik-door, de camera alleen na een tik en uit na de scantijd, herkend naar de koelkast of het productvenster, de pas naar de koelkast, `Ja, instellen` en `Nee`, verlopen na 365 dagen, opslaan, controleren en wissen van de kenmerken, en niets in de CSV-export of het logboek |
| `tests/generale-repetitie.test.js` | Regressietests voor de fouten uit de generale repetitie van de demo (versie 3.19): een pas in een ander tekstveld laat de oude inhoud staan (niet in `Pasnummer`), de melding per reden als de camera niet start, de binnenruimte van de velden in de voorraadtabel en het lege pictogram in `index.html` |
| `tests/gezicht-instellen-veilig.test.js` | Tests voor veilig instellen van gezichtsherkenning (versie 3.22), met een nep-klok en een nep-camera: na kiezen op naam geen link en geen `Uitzetten` en weigert de controller instellen en uitzetten, na de pas wel instellen, na de camera wel uitzetten, de beheerder kan instellen en uitzetten (niet zonder inloggen, niet zonder camera, niets bewaard na uitloggen), de knoppen en de vervaldatum in het tabblad Medewerkers, verlopen na 365 dagen en opnieuw instellen alleen na de pas of via de beheerder met een nieuw vinkje, en het moment van toestemming (`consentAt`) met controle en migratie bij het laden |
| `tests/levend-gezicht.test.js` | Tests voor de stille controle op een levend gezicht (versie 3.23), met nagebootste gezichtspunten, een nep-camera en zonder face-api: een foto die schuift, draait en kantelt is nooit levend, een echt hoofd dat een paar graden beweegt of knippert wel, een stil hoofd zonder knipper faalt na 5 seconden, de gezichtspunten staan hooguit 3 seconden in het geheugen, `enabled` en `debug`, de waarden in `config.js`, `describeFace` en `checkLiveness`, en een foto wordt niet ingesteld en niet herkend in het cameravenster |
| `tests/helpers-gezicht.js` | Hulpbestand voor `levend-gezicht.test.js` en `startscherm.test.js`: een nagebootst gezicht van 68 punten in drie dimensies (`face3d`), de projectie bij een draai van het hoofd (`project`), een foto als plat vlak (`photo`) en een kleine ruis (`jitter`) |
| `tests/` | Unit tests (891) voor de regels, de opslag, de export, het thema, de welkom- en gezichtsherkenningsfuncties, herkennen met de pas, de controller, de beveiliging en regressietests voor opgeloste bugs |
| `tests/opslag-model-export.test.js` | Tests voor de reservekopieën, het wissen van gegevens, de strengere controle bij het laden, de voorraadtelling (`countedAt`), nieuwe modelmethodes en de beveiliging van de CSV-export, verboden id's, maximale tekstlengtes en een opslag die niet te lezen is |
| `tests/controller-robuustheid.test.js` | Tests voor de robuustheid van controller en view: na middernacht, correcties in een oude maand, logboek en wijziging in één keer opslaan, grenzen bij de voorraad, verouderde formulieren en knoppen, de camera, de focus na sluiten, veilige HTML, `Alle gegevens wissen`, en exporteren en wissen alleen voor een ingelogde beheerder |
| `tests/beveiliging-config.test.js` | Tests voor de configuratie: geen externe bronnen, iedere stylesheet precies één keer gelinkt in `index.html`, de Content-Security-Policy, lokale lettertypes en face-api (met de SHA-256-controlegetallen), en de CI-workflow |
| `tests/gegevens-en-tabbladen.test.js` | Tests voor de prijsgrens van 1000 euro, de focus na `Registreren`, "niets gewijzigd" bij opslaan, en verouderde formulieren of een gewiste opslag na een wijziging in een ander tabblad. Gebruikt de strenge nep-view (`createStrictView` in `helpers.js`) |
| `tests/werkgever-en-correctiedatum.test.js` | Tests voor het werkgevernummer per registratie en de datum bij een correctie `+` |
| `tests/to-controle.test.js` | Regressietests voor de TO-controle: "1 medewerker"/"2 medewerkers", bevestiging bij product verwijderen, de melding bij een verwijderde medewerker (correctie `+`), alleen een inactieve medewerker zonder registraties verwijderen, uniek werkgevernummer, dubbele id's en datums in de toekomst bij het laden, de apostrof in de CSV, `lastRegistration` en `pointId`, het SQL-schema (`counted_at`, geen rol `manager`), de opslagknoppen bij wijzigen, de filters op een smal scherm en tests voor FR-01, FR-02, FR-04, FR-10 en FR-29 (actieve medewerkers, zoeken op naam, de `−` in het productvenster, alle registraties voor de beheerder, geen bedragen of aantallen op de publieke pagina). Verder: "1 product" in de correctielijst, een klik op de medewerkerkaart (FR-32) en het totaal op de knop `Registreren` (FR-47) |
| `tests/pasjeslezer.test.js` | Tests voor herkennen met de pas: wat de `BadgeReader` als scan ziet (Enter, Tab of stilte na de laatste toets, niet bij gewoon typen of een te korte code, wel op een trage tablet), het normaliseren van het pasnummer, het productvenster of de melding na een scan, geen herkenning als er een ander venster open is (met de melding "Sluit eerst het open venster om je pas te gebruiken.", en de Enter van de scan wordt tegengehouden), het zoekveld na een scan, de pas koppelen in het medewerkersformulier (uniek, alleen letters en cijfers, leeg = geen pas), de controle en migratie van `badgeId` in `DataStore`, en dat het pasnummer niet in de CSV-export of het logboek komt |
| `tests/beveiligingsscan.test.js` | Regressietests voor de beveiligingsscan: beheeracties doen niets zonder ingelogde beheerder, product-id's als `__proto__`, `constructor` en `toString` in de voorraadlijst, de camera die uitgaat na de tijdslimiet, de strengere controle van codes en tijdstippen bij het laden, de Node.js-versie van de CI, het alleen-toevoegen-logboek in het SQL-schema en de licentie van TensorFlow.js |
| `tests/avg-toets.test.js` | Tests voor de aanpassingen uit de AVG-toets: automatisch uitloggen van de beheerder na 5 minuten zonder invoer (met een nep-klok: net onder en precies op 5 minuten, iedere invoer begint opnieuw, open beheerformulieren gaan dicht, de melding en de timer van 10 seconden) en de uitleg over de inhouding op het loon in het productvenster |
| `tests/ux-review.test.js` | Tests voor de verbeteringen uit de UX-review van oktober 2026 (UX 1 t/m UX 12 in de naam van iedere test, daarna 13 en 14): het productvenster dat na 75 seconden vanzelf sluit (met een nep-klok, de waarschuwing en iedere invoer die opnieuw begint), een pas terwijl een venster open is, de knopbalk met `Registreren`, zoekveld en bedrijfsfilter leeg na registreren, de compacte banner, de pashint, de opmaak van een gekozen product, de grootte van knoppen, de statusregel en de meldingsregio's voor schermlezers, de leesbaarheid, de nieuwe teksten, `Registreren` zonder keuze, een productvenster zonder producten zonder knopbalk en loonregel (13) en vensters die altijd bovenaan openen (14) |
| `tests/review-oktober.test.js` | Regressietests voor de review van oktober 2026 (D1 t/m D7, U1 t/m U7, R1 t/m R3 in de naam van iedere test): beschadigde lijsten en volle opslag, dubbele passen, niet-bestaande datums, pasnummers gelijk maken, mislukt wissen, gezichtsherkenning alleen met actieve medewerkers, een scan in het veld `Pasnummer` en in het bedrijfsfilter, dubbelklik op `Registreren`, een ingedrukt gehouden Enter, de focus na opslaan en (de)activeren, het datumveld na middernacht, toegankelijkheid (live region, tabbladen, bedrijfsfilter) en de cijfervelden |
| `tests/rollenspel-oktober.test.js` | Regressietests voor de fouten uit de rollenspeltests en de FMEA van oktober 2026 (punt 1 t/m 14 in de naam van iedere test): zoekveld leeg na sluiten zonder registreren, geen spookklik na een dubbeltik op `Deur dicht`, de naam in de open koelkast en "Controle nodig" bij de pas van een collega, twee tabbladen op één opslag, de weging met het gemeten gemiddelde gewicht (eieren en blikjes), verwacht en geteld bij een telling, oude en nieuwe waarden in het logboek, de lege demokeuze, tikdoelen en hover, voorraad 0, negatieve getallen in de CSV, het SQL-schema en teksten in het TO |
| `.gitattributes` | Zorgt dat Git de bestanden in `assets/vendor/` en `assets/fonts/` niet aanpast (geen omzetting van regeleinden), zodat de controlegetallen blijven kloppen |
| `tests/e2e/` | Browsertests (end-to-end): `app.e2e.test.js` test de echte pagina in headless Edge of Chrome (34 tests, die na het openen eerst op `Handmatig zoeken` tikken: sinds versie 3.22 ook geen link na kiezen op naam en de knop in het beheer, laden zonder fouten, zoeken, registreren (daarna bij kiezen op naam geen "welkom terug"), `Registreren` zonder keuze, Escape en focus, inloggen, thema, pas koppelen en herkennen (ook een tweede scan in het veld `Pasnummer`), CSV-export, een dubbelklik op `Registreren`, een scan in het bedrijfsfilter, de focus na opslaan en (de)activeren in het beheer, letters in een cijferveld, het productvenster dat vanzelf sluit, een pas terwijl een venster open is, `Registreren` in beeld op een liggende tablet, een telefoon en bij 200% zoom, een leeg zoekveld na registreren, een productvenster zonder producten, vensters die bovenaan openen, de slimme koelkast: openen met de pas, twee blikjes pakken en de registratie terugzien, en een onbekende pas, en de rollenspeltests van oktober 2026: een leeg zoekveld na sluiten zonder registreren, een dubbeltik op `Deur dicht`, de naam in de open koelkast met de pas van een collega, een opslag van een ander tabblad die niet wordt overschreven en de lege demokeuze, en sinds versie 3.17 de standby (dimmen, een tik wekt zonder klik-door, een toets wekt) is sinds versie 3.21 vervangen door vier tests van het startscherm (zwart en zonder camera alleen pas en `Handmatig zoeken`, terug na 2 minuten en na registreren, een passcan op het startscherm die de koelkast opent en na `Klaar` het startscherm, en een camera zonder toestemming zonder fouten), de vraag na een passcan met een nagebootste camera, en sinds versie 3.19 een pas in het inlogvenster en een zoekveld van het beheer zonder achtergebleven pasnummer en "Aantal" dat past in het leveringsveld op een staande tablet), `browser.js` bevat de webserver en de besturing van de browser via het Chrome DevTools Protocol. Er wordt pas geklikt als het element stilstaat. Bij een mislukte test volgen het scenario, de toestand van de pagina, de laatste meldingen uit de console en een schermafdruk in `test-results/e2e`. Draaien met `npm run test:e2e`, zonder npm-pakketten. Een andere browser kies je met `BROWSER_PATH` |
| `.github/workflows/ci.yml` | Voert de unit tests en daarna de browsertests (in Google Chrome) automatisch uit op GitHub met Node.js 24 (LTS), met alleen leesrechten en actions die op een commit-SHA zijn vastgezet |

Bij het toevoegen of wijzigen van een medewerker kiest de beheerder een bedrijf uit de keuzelijst en daarna een consumptiepunt van dat bedrijf. Met het bedrijf worden medewerkers op de beginpagina gegroepeerd en gefilterd. Het bedrijfsfilter op de beginpagina is een keuzelijst waarin je ook kunt typen. De lijst filtert direct tijdens het typen en toont alleen bedrijven met actieve medewerkers. Wat je typt, wordt niet overschreven als de lijst intussen opnieuw wordt getekend. Hebben actieve medewerkers geen bedrijf, of bestaat hun bedrijf niet meer, dan staat er ook de keuze `Onbekend bedrijf`. Die toont al deze medewerkers. Escape sluit een open keuzelijst, en een schermlezer hoort of de lijst open is en welk bedrijf is gekozen.

## 3. De website starten

1. Open de projectmap in VS Code.
2. Klik met de rechtermuisknop op `index.html` en kies **Open with Live Server** (extensie "Live Server"). Een andere lokale webserver werkt ook.
3. De website opent in een moderne browser.
4. Er is geen installatie of buildproces nodig.

Alle bestanden staan in het project zelf: ook de lettertypes (`assets/fonts/`) en de bibliotheek en modellen van de demo gezichtsherkenning (`assets/vendor/face-api/`). De website laadt dus niets van een externe server en werkt zonder internetverbinding, zolang de lokale webserver draait.

De website werkt ook via een netwerkadres, bijvoorbeeld `http://192.168.1.20:5500` op een tablet in hetzelfde netwerk. Alleen de demo gezichtsherkenning is dan niet beschikbaar, omdat browsers de camera alleen via `https://` of `http://localhost` toestaan.

Dubbelklikken op `index.html` werkt niet: de JavaScript is opgedeeld in modules, en browsers blokkeren modules die via `file://` worden geopend. De pagina toont dan een waarschuwing.

## 4. Gebruikershandleiding

Sinds versie 3.21 opent de website op het zwarte startscherm (zie 4.18). Daar begin je op een van drie manieren: houd je pas tegen de lezer, kijk in het ovaal (als je gezichtsherkenning hebt ingesteld en er een camera is), of tik op `Handmatig zoeken`. Die knop toont de beginpagina met de lijst, het zoekveld en het bedrijfsfilter die hieronder staan. Ook `Admin login` staat daar, rechtsboven.

### 4.1 Een medewerker zoeken

Tik op het startscherm op `Handmatig zoeken`. Gebruik de zoekbalk boven de medewerkerlijst. Typ een voornaam, achternaam of een deel van een naam. De lijst wordt direct gefilterd.

Met `Ctrl + K` op Windows of `Cmd + K` op macOS krijgt de zoekbalk automatisch de focus. Dat werkt alleen als er geen venster open is, omdat de zoekbalk dan achter het venster staat.

De datum bovenaan en de totalen van vandaag en deze maand worden na middernacht vanzelf bijgewerkt (binnen een minuut). De tablet bij het consumptiepunt kan dus dag en nacht aan blijven staan.

Sluit je een venster (met het kruisje, een klik naast het venster, Escape of na opslaan), dan gaat de focus terug naar de knop of medewerkerrij waarmee je het venster opende. Is de lijst intussen opnieuw getekend (bijvoorbeeld na opslaan in het beheer), dan krijgt de nieuwe knop met dezelfde id de focus. Met het toetsenbord kun je dan meteen verder waar je was.

### 4.2 Een product registreren

1. Zoek je eigen naam, of houd je pas tegen de lezer (zie 4.16). Boven het zoekveld staat daarvoor "Houd je pas tegen de lezer, of zoek je naam".
2. Tik op je naam ("Tik op je naam" staat in de kop, en bij iedere naam "Tik om te kiezen"). Het productvenster opent met alleen de producten van jouw consumptiepunt.
3. Tik bij ieder gewenst product op `+` ("Tik op + bij wat je pakt. Tik daarna op Registreren."). Een product dat je hebt gekozen, krijgt een lichtgroene achtergrond en een groene rand. Met `−` haal je een verkeerde keuze weer weg (niet lager dan 0).
4. Tik op `Registreren (aantal)` om alle gekozen producten tegelijk op te slaan. De knop staat onderaan het venster en blijft in beeld, ook als je door de producten scrolt.
5. Onderaan verschijnt 4 seconden een melding met je naam en de producten, bijvoorbeeld `Lotte van Dijk: 2× Blikje, 1× Ei geregistreerd`. Het zoekveld en het bedrijfsfilter zijn daarna weer leeg en de lijst staat bovenaan, klaar voor de volgende collega. Dat gebeurt ook als je het venster sluit zonder te registreren (kruisje, naast het venster tikken of Escape). Sinds versie 3.21 komt na registreren het startscherm terug, met de melding erboven. Sluit je zonder te registreren het venster van een naam uit de lijst, dan blijft de lijst staan. Opende het venster na de pas of de camera, dan komt het startscherm terug.

Iedere tik op `+` telt als één product. De datum en tijd worden automatisch toegevoegd zodra je op `Registreren` tikt. Je ziet geen persoonlijk totaal of persoonlijke kosten. Zolang je niets hebt gekozen, is `Registreren` uitgeschakeld en staat erboven "Kies eerst een product met +". Tik je toch op de knop, dan wordt die regel vet en rood en wordt er niets opgeslagen. Biedt je consumptiepunt nog niets aan, dan staat er "Geen producten op jouw consumptiepunt." met "Neem contact op met de beheerder als dit niet klopt." De uitleg over `+`, de knop `Registreren` en de regel over de inhouding op het loon staan er dan niet, omdat er niets te registreren valt.

Loop je weg zonder te registreren, dan sluit het productvenster na 75 seconden vanzelf, zonder iets op te slaan. In de laatste 10 seconden staat boven de knop "Venster sluit zo. Tik om door te gaan." Ben je nog bezig, tik dan ergens in het venster: dan begint de tijd opnieuw. Houdt een collega intussen zijn pas tegen de lezer, dan sluit jouw venster ook (zonder opslaan) en opent dat van de collega. Dubbelklik je per ongeluk op `Registreren`, dan wordt er één keer geregistreerd en opent de tweede klik niet het productvenster van de collega wiens naam onder de knop staat.

### 4.3 Admin-dashboard openen

1. Klik rechtsboven op `Admin login`.
2. Vul een e-mailadres in.
3. Vul een wachtwoord in.
4. Klik op `Inloggen`.

In deze demo wordt niet gecontroleerd of het wachtwoord echt correct is. Elk ingevuld wachtwoord werkt. Dit is alleen geschikt voor demonstratie en niet voor productie.

### 4.4 Registraties beheren

In het tabblad `Registraties` ziet de beheerder:

- De filters `Medewerker` en `Maand` en de knop `CSV exporteren`
- Onder `Medewerker corrigeren`: een zoekveld en per medewerker het aantal producten ("1 product", "2 producten") en het bedrag
- Een tabel met medewerker, product, aantal en datum en tijd, nieuwste bovenaan (bij een registratie uit een ander jaar staat het jaartal erbij)

De beheerder zoekt onder `Medewerker corrigeren` eerst een medewerker op en klapt de rij open. Per product staan daar een rode `−`, het aantal en een groene `+`. Met `+` wordt één registratie van dat product toegevoegd, op de datum in het veld `Datum bij toevoegen (+)`. Dat veld staat na het inloggen op vandaag. Kies een eerdere datum voor een vergeten registratie. Een datum in de toekomst geeft een foutmelding. Valt de gekozen datum in een eerdere maand, dan vraagt de browser eerst: "Deze registratie komt in september 2026. Die loonmaand is mogelijk al verwerkt. Toch toevoegen?". De datum komt dan ook in het logboek en in de melding ("… op 14 september 2026"). Met `−` opent het venster `Registratie verwijderen`. Daarin staan alle registraties van dat product bij die medewerker, met de nieuwste datum bovenaan. Per registratie zie je de datum en tijd, het product en het aantal (altijd 1). Bij een registratie die de beheerder met `+` heeft toegevoegd, staat "toegevoegd door beheerder". Klik bij de registratie die weg moet op `Verwijderen`. Het venster verschijnt ook als er maar één registratie is, zodat je altijd ziet welke registratie verdwijnt. `Annuleren`, het kruisje, een klik naast het venster of Escape sluit het venster zonder dat er iets verandert. Bij het openen staat de focus op de eerste knop `Verwijderen`, Tab blijft binnen het venster en na het sluiten staat de focus weer op de `−`. Is de gekozen registratie uit een andere maand dan de huidige, dan vraagt de browser eerst: "Deze registratie is van september 2026. Die loonmaand is mogelijk al verwerkt. Toch verwijderen?" (met de maand van de registratie). Klik alleen op OK als je zeker weet dat de loonadministratie die maand nog niet heeft verwerkt. Met `Annuleren` verandert er niets. Heeft de medewerker geen registratie van dat product, dan verschijnt de foutmelding "Dit product heeft geen registratie voor deze medewerker". Iedere correctie komt in het logboek. De correctie en de logboekregel worden samen opgeslagen. Bij een verwijderde registratie staat in het logboek ook wanneer die was geregistreerd, bijvoorbeeld "Blikje van Lotte van Dijk, geregistreerd op 14 september 2026 om 12:00". Een correctie met `+` telt niet mee als "Vorige keer koos je …" in het productvenster van de medewerker, omdat de medewerker die keuze niet zelf heeft gemaakt. De losse registraties in de tabel zijn alleen ter inzage. Correcties gebeuren dus altijd via `Medewerker corrigeren`.

De keuzelijsten boven de tabel filteren op medewerker of maand. Zijn er voor de filters geen registraties, dan staat er "Geen registraties voor deze filters."

### 4.5 Medewerkers beheren

Open het tabblad `Medewerkers`.

- Vul voornaam, achternaam, looncode en personeelsnummer in.
- Kies het bedrijf en daarna het vaste consumptiepunt van de medewerker. De keuzelijst toont alleen de punten van het gekozen bedrijf. De medewerker ziet bij het registreren alleen de producten van dat punt, en de voorraad van dat punt gaat omlaag.
- Het werkgevernummer komt standaard van het bedrijf. Heeft een medewerker een ander werkgevernummer (bijvoorbeeld per teamleider), vul dan `Afwijkend werkgevernummer` in. Dat nummer gaat dan voor in de CSV-export.
- Pas koppelen (optioneel): klik in het veld `Pasnummer` en houd de pas van de medewerker tegen de USB-NFC-lezer. De lezer typt het pasnummer in het veld en de Enter die de lezer daarna stuurt, verstuurt het formulier niet. Staat er al een nummer in het veld, dan vervangt het nummer van de nieuwe pas het oude. Leeg laten betekent: geen pas. Een pas weghalen kan door het veld leeg te maken en op te slaan. Zie 4.16.
- Klik op `Opslaan` om een medewerker toe te voegen. `Opslaan + opnieuw` houdt het bedrijf en consumptiepunt vast voor de volgende collega.
- Gebruik `Wijzigen` om medewerkergegevens aan te passen.
- Gebruik `Deactiveren` of `Activeren` om de medewerkerstatus te wijzigen.
- Gezichtsherkenning (demo, sinds versie 3.22): bij een actieve medewerker staat `Gezichtsherkenning instellen`. Laat de medewerker zelf voor de camera staan en zelf het vinkje voor toestemming zetten, en klik dan op `Gezicht vastleggen`. Daarna staat in de lijst "Gezichtsherkenning ingesteld tot 27-10-2027" (een jaar later) met `Uitzetten`. Het logboek krijgt "Gezichtsherkenning ingesteld door beheerder" of "Gezichtsherkenning uitgezet door beheerder" met de naam. Zonder camera is de knop uitgeschakeld met "Geen camera gevonden. Instellen kan alleen met een camera." Staat de demo uit, dan zijn er geen knoppen. Zie 4.15.

Voornaam, achternaam, looncode, personeelsnummer en bedrijf zijn verplicht, en ook het consumptiepunt als het gekozen bedrijf consumptiepunten heeft. Ontbreekt er iets, dan krijgt het veld een rode rand met een melding eronder en krijgt het eerste foute veld de focus. Looncode, personeelsnummer en een afwijkend werkgevernummer mogen alleen cijfers bevatten. Anders verschijnt "Gebruik alleen cijfers." bij het veld, ook als je bijvoorbeeld "12a" typt. Deze velden zijn tekstvelden met een cijfertoetsenbord op de tablet (`inputmode="numeric"`). De voornaam en achternaam worden apart opgeslagen (`firstName`, `lastName`). De volledige naam (`name`) wordt daaruit samengesteld.

Een inactieve medewerker zonder registraties kan daarna met `Verwijderen` definitief worden verwijderd. De browser vraagt eerst om bevestiging. Heeft de medewerker registraties, dan staat de knop er niet en is deactiveren voldoende: zo blijven naam, looncode en personeelsnummer beschikbaar voor de CSV-export. Ook bij een actieve medewerker staat de knop er niet. Controller en model controleren dit zelf ook, voor het geval een knop verouderd is (bijvoorbeeld na een wijziging in een ander tabblad): bij registraties verschijnt "Deze medewerker heeft registraties en kan niet definitief worden verwijderd. Deactiveren is voldoende.", bij een actieve medewerker "Zet deze medewerker eerst op inactief. Alleen een inactieve medewerker kan definitief worden verwijderd." Een personeelsnummer mag maar bij één medewerker voorkomen.

Het pasnummer wordt gelijk gemaakt opgeslagen: spaties, `:` en `-` gaan eruit en alles wordt hoofdletters (`04:a1:b2:c3` wordt `04A1B2C3`). Daarna mag het alleen letters en cijfers bevatten, 4 tot en met 64 tekens. Anders verschijnt "Gebruik alleen letters en cijfers (4 tot 64 tekens)." bij het veld. Een pas mag maar bij één medewerker horen. Anders verschijnt "Deze pas is al gekoppeld aan een andere medewerker." In de medewerkerslijst staat bij medewerkers met een pas het label `Pas gekoppeld`. Het pasnummer zelf staat niet in de lijst, niet in het logboek en niet in de CSV-export.

### 4.6 Producten beheren

Open het tabblad `Producten` en klik op `+ Product toevoegen`. Het formulier heeft dezelfde opties als het medewerkersformulier:

- `Opslaan`: opslaan en het formulier sluiten.
- `Opslaan + opnieuw`: opslaan, de velden leegmaken en het formulier open laten.

Een nieuw product staat bij alle consumptiepunten **uit**. Zet het daarna aan bij de punten die het aanbieden (zie 4.7).

De prijs ligt tussen 0 en 1000 euro en heeft hooguit twee decimalen (hele centen), bijvoorbeeld `0.65`. Anders verschijnt "Vul een prijs van 0 tot en met 1000 euro in, met hooguit twee decimalen." Twee producten met dezelfde naam kan niet: dan verschijnt "Er bestaat al een product met deze naam." Een product dat al eens is geregistreerd, kan niet worden verwijderd, zodat oude registraties en de export blijven kloppen ("Dit product wordt al gebruikt en kan niet worden verwijderd"). Bij een product dat nooit is geregistreerd, vraagt de browser eerst "Product Boter verwijderen?" (met de naam van het product). Met `Annuleren` verandert er niets.

### 4.7 Bedrijven en consumptiepunten beheren

Open het tabblad `Bedrijven`. Standaard staan de 13 bedrijven van TVB erin. Onder ieder bedrijf staan de consumptiepunten van dat bedrijf. Een bedrijf kan geen, één of meerdere consumptiepunten hebben.

- `+ Bedrijf toevoegen` en `Wijzigen`: bedrijfsnaam en werkgevernummer invullen. Het werkgevernummer komt in de CSV-export bij de medewerkers van dat bedrijf, behalve bij medewerkers met een afwijkend werkgevernummer. Bedrijfsnaam en werkgevernummer zijn uniek: bij een dubbele waarde verschijnt bij het veld "Er bestaat al een bedrijf met deze naam." of "Er bestaat al een bedrijf met dit werkgevernummer." en wordt er niets opgeslagen. Meerdere bedrijven zonder werkgevernummer mag wel. Dit past bij de UNIQUE-regel in `docs/DATABASE-SCHEMA.sql`.
- Bij ieder bedrijf en consumptiepunt staat het aantal gekoppelde medewerkers, in enkelvoud of meervoud ("1 medewerker", "2 medewerkers").
- `+ Consumptiepunt`: een nieuw punt bij dat bedrijf toevoegen. Geef het een naam (bijv. `Kantine begane grond`) en vink aan welke producten er worden aangeboden.
- `Aanbod wijzigen`: naam, bedrijf of aangeboden producten van een punt aanpassen. De voorraad blijft bewaard, ook als een product tijdelijk uit staat. Kies je een ander bedrijf, dan verhuizen de medewerkers van dit punt mee naar dat bedrijf. Alleen hun bedrijf verandert, hun naam en andere gegevens blijven gelijk.
- `Verwijderen`: kan alleen als er geen medewerkers meer aan het bedrijf of punt gekoppeld zijn. Een bedrijf kan ook pas worden verwijderd als het geen consumptiepunten meer heeft. De browser vraagt eerst om bevestiging.

### 4.8 Voorraad beheren

Open het tabblad `Voorraad`.

- Bovenaan staat de lijst **Bijbestellen** met alle aangeboden producten die `Leeg` zijn (voorraad 0 of minder) of op of onder het minimum zitten (`Bijbestellen`), over alle consumptiepunten. Klik op een punt om de voorraad daarvan te openen.
- Kies een consumptiepunt om de voorraad per product te zien.
- **Levering**: vul het geleverde aantal in (een heel getal van 1 tot en met 100.000) en klik op `+ Toevoegen`. Het aantal komt bij de voorraad. Tik je per ongeluk twee keer snel achter elkaar (binnen 800 milliseconden) op dezelfde knop, dan telt alleen de eerste tik.
- **Voorraad**: na het tellen kun je het getal direct aanpassen (een heel getal van 0 tot en met 100.000). Het wordt opgeslagen zodra je het veld verlaat. Het systeem onthoudt dan ook het tijdstip van de telling (`countedAt`). In het logboek staan bij "Voorraad geteld" de verwachte voorraad, de getelde voorraad en het verschil, bijvoorbeeld "verwacht 20, geteld 18, verschil -2". Zo is later te zien hoeveel er zonder registratie is verdwenen.
- **Minimum**: bij dit aantal of minder verschijnt het product in de bijbestellijst (een heel getal van 0 tot en met 100.000).

Iedere registratie haalt automatisch 1 van de voorraad af bij het consumptiepunt van de medewerker, maar alleen als dat punt het product aanbiedt (een correctie voor een product dat het punt niet heeft, verandert de voorraad dus niet). Na het aanpassen van voorraad of minimum worden alleen het statuslabel en de bijbestellijst bijgewerkt. De tabel blijft staan, zodat je met Tab gewoon naar het volgende veld kunt. Een foute invoer (leeg, geen heel getal, negatief of meer dan 100.000) geeft een melding en springt terug naar de opgeslagen waarde.

Een correctie met `+` op een datum vóór de laatste telling haalt niets van de voorraad af: dat product zat toen al niet meer in de getelde hoeveelheid. Een correctie met `−` in het admin-dashboard zet het product weer terug in de voorraad, maar alleen als de registratie ná de laatste telling is gemaakt. Is de voorraad daarna geteld, dan zat het product al niet meer in de getelde hoeveelheid en blijft de telling staan.

Een negatieve telling invullen kan niet. Door registraties kan de voorraad wel onder 0 komen. Dat betekent dat er meer is geregistreerd dan er volgens de telling was. Tel dan opnieuw. Alle leveringen, tellingen en wijzigingen van het minimum komen in het logboek.

Typ je in de voorraadtabel terwijl in een ander tabblad iets wordt opgeslagen, dan blijft de tabel staan, zodat je half ingetypte getal niet verdwijnt.

### 4.9 Logboek bekijken

Het tabblad `Logboek` toont standaard maximaal 20 wijzigingen. Met `Meer laden` worden steeds 20 extra wijzigingen getoond.

### 4.10 Alle gegevens wissen

Onder het logboek staat de rode knop `Alle gegevens wissen`. Daarmee wis je alle persoonsgegevens op de tablet, bijvoorbeeld als de tablet ergens anders wordt gebruikt (recht op vergetelheid uit de AVG).

1. Klik op `Alle gegevens wissen`.
2. De browser vraagt: "Alle medewerkers, registraties, producten, voorraad, koelkastopeningen, ingestelde gezichten, het logboek en de reservekopieën op deze tablet wissen?" Klik op OK.
3. De browser vraagt nog een keer: "Weet je het zeker? Dit kan niet ongedaan worden gemaakt." Klik op OK.

Daarna zijn alle gegevens, beide reservekopieën en de ingestelde gezichten van de demo gewist. Je bent uitgelogd, het beheervenster is dicht en de demogegevens staan er weer (8 voorbeeldmedewerkers, de standaardproducten, de 13 bedrijven en het consumptiepunt Hoofdkantoor). Er verschijnt de melding "Alle gegevens zijn gewist. De demogegevens staan er weer." Klik je bij een van de twee vragen op `Annuleren`, dan verandert er niets. Andere open tabbladen laden de nieuwe demogegevens vanzelf in. Lukt het wissen niet, dan blijft alles staan en verschijnt "De gegevens konden niet worden gewist. Probeer het opnieuw."

### 4.11 Modal sluiten en uitloggen

Het kruisje rechtsboven, een klik naast het venster of de Escape-toets sluit het admin-overzicht én logt de beheerder uit. Op een gedeelde tablet kan de volgende persoon zo niet zonder wachtwoord in het beheer komen. Bij het volgende openen verschijnt het loginformulier. Met de knop `Uitloggen` kan de beheerder ook uitloggen zonder het venster te sluiten.

**Automatisch uitloggen.** Gebruikt de beheerder het beheer 5 minuten niet (geen muisbeweging, klik, toets, aanraking of scroll), dan logt de website de beheerder vanzelf uit. Open formulieren en het venster `Registratie verwijderen` gaan dicht zonder op te slaan, het beheervenster sluit en onderaan verschijnt "Je bent automatisch uitgelogd omdat het beheer 5 minuten niet is gebruikt." Zo blijft het beheer niet open staan als de beheerder wegloopt. De tijd staat in `config.js` (`ADMIN_IDLE_LOGOUT_MS`). Een timer kijkt iedere 10 seconden of de tijd voorbij is.

### 4.12 CSV exporteren

1. Open het admin-dashboard.
2. Kies eventueel een medewerker en/of maand. Achter iedere maand staat de loonmaand waarin die wordt verwerkt, bijvoorbeeld `september 2026 (loonmaand oktober 2026)`.
3. Klik op `CSV exporteren`.
4. De browser downloadt een `.csv`-bestand, bijvoorbeeld `blikjesregistratie-loonmaand-2026-10.csv`.

Het bestand heeft altijd de kolommen `Jaar`, `Maand`, `Looncode`, `Personeelsnummer`, `Werkgevernummer`, `Naam`, `Totaal` en `Prijs`, in die vaste volgorde. Iedere regel is één medewerker in één loonmaand. Het werkgevernummer is het nummer dat bij de registraties is bewaard (zie de tabel Registraties hieronder). Is dat binnen een maand veranderd, dan krijgt die maand één regel per werkgevernummer. Er staat bewust geen totaalregel in, omdat de loonadministratie iedere regel als medewerker inleest.

Let op bij voorloopnullen: een looncode of personeelsnummer als `0012` staat zo in het bestand, maar Excel toont het na een dubbelklik als `12` en slaat het bij opnieuw opslaan ook zo op. Lees het bestand daarom rechtstreeks in het loonsysteem in, of open het in Excel via `Gegevens` en `Uit tekst/CSV` met de kolommen Looncode, Personeelsnummer en Werkgevernummer als tekst (zie het TO, hoofdstuk 12).

**Loonmaand:** consumpties worden verwerkt in de loonadministratie van de maand erna. `Jaar` en `Maand` in de export zijn daarom de loonmaand: consumpties uit september 2026 staan als `2026` / `10` in het bestand, consumpties uit december 2026 als `2027` / `1`.

Het bestand gebruikt puntkomma's als scheidingsteken en een komma als decimaalteken (`0,65`), zodat een Nederlandse Excel het direct goed opent. De gekozen filters worden toegepast op de export. De prijs komt van iedere registratie zelf: dat is de prijs op het moment van registreren. Verandert een prijs later, dan blijft een oude maand in de export hetzelfde. Alleen oude registraties zonder opgeslagen prijs gebruiken de huidige prijs. Losse registraties staan in de tabel in het admin-dashboard.

### 4.13 Licht of donker thema

Rechtsboven in de bovenbalk staat de thema-schakelaar:

- **Systeem** (standaard): de website volgt de instelling van je computer of telefoon. Staat Windows of je telefoon op donker, dan is de website ook donker.
- **Slider (met zon- en maanicoon)**: kies zelf licht of donker. Dit is een vaste keuze. "Systeem" en "Auto" staan daarna uit.
- **Auto**: overdag licht en na zonsondergang donker. De tijden van zonsopkomst en zonsondergang zijn per maand ingesteld voor Nederland (`DAYLIGHT_HOURS` in `config.js`), bijvoorbeeld in december donker vanaf ongeveer 16:30 en in juni vanaf ongeveer 22:00. De website controleert iedere minuut of het tijd is om te wisselen.

De keuze wordt per browser onthouden. In het donkere thema blijven de huiskleuren behouden: de achtergrond wordt donker en de tekst krijgt de groene huiskleur, iets lichter zodat hij goed leesbaar is.

### 4.14 Welkom en "zelfde als vorige keer"

Als een medewerker het productvenster opent, verschijnt een persoonlijke begroeting die past bij het tijdstip, bijvoorbeeld "Goedemorgen Lotte." Is de medewerker herkend met de pas of de camera en heeft hij eerder zelf iets geregistreerd, dan wordt dat "Goedemorgen Lotte, welkom terug." en staat eronder wat er de vorige keer is gekozen ("Vorige keer koos je 1× Blikje en 1× Ei."). Wie op een naam in de lijst tikt, ziet die twee dingen niet. Iedereen kan op de naam van een collega tikken, en dan zou te zien zijn of die collega al eens iets registreerde en wat (privacy, zie het TO hoofdstuk 13). Met de knop `Zelfde als vorige keer` staan die aantallen direct klaar. De medewerker kan ze nog aanpassen en bevestigt met `Registreren`. Correcties van de beheerder tellen hierbij niet mee, ook niet voor "welkom terug". Onder in het productvenster staat in kleine grijze tekst "Wat je registreert, wordt maandelijks ingehouden op je loon. Meer informatie staat in de privacyverklaring voor medewerkers." Er staat geen link bij, omdat TVB de privacyverklaring nog moet vaststellen. Bij het openen staat de focus op de eerste `+`-knop. Na een druk op `+` of `−` houdt dezelfde knop de focus, zodat je met het toetsenbord meerdere keren kunt drukken, en een schermlezer leest het nieuwe aantal voor (bijvoorbeeld "Blikje: 2", via de vaste live region `#productLiveStatus`).

### 4.15 Demo gezichtsherkenning

Dit is een demo. Zie het TO (hoofdstuk 13, Privacy) waarom gezichtsherkenning niet geschikt is voor de echte toepassing.

1. Houd je pas tegen de lezer. Heb je nog geen gezichtsherkenning, dan vraagt de tablet "Gezichtsherkenning nog niet ingesteld. Wil je dit?" Kies `Ja, instellen`. Opent na je pas het productvenster, dan staat daar ook de link `Gezichtsherkenning instellen (demo)`.
2. De camera van de tablet of laptop gaat aan. Plaats je gezicht in het kader, zet het vinkje voor vrijwillige deelname en klik op `Gezicht vastleggen`. Daarna gaat de koelkast (of het productvenster) open.
3. Voortaan kijk je op het startscherm in het ovaal (4.18), of klik je op de beginpagina op `Herken mij met de camera (demo)`. Word je herkend, dan gaat de koelkast voor je open (of je eigen productvenster, zie `RECOGNITION_TARGET` in 4.18).

Met `Nee` komt de vraag niet meer terug. Wil je het later toch, open dan met je pas het productvenster en kies de link, of vraag het de beheerder (4.5).

**Alleen na de pas of via de beheerder (sinds versie 3.22).** Iedereen kan op de tablet op de naam van een collega tikken. Kon je daarna een gezicht instellen, dan kon iemand zijn eigen gezicht onder de naam van een collega zetten en op diens naam pakken. Daarom staat na `Handmatig zoeken` en een tik op een naam geen link en geen `Uitzetten`, maar alleen "Gezichtsherkenning instellen? Houd je pas tegen de lezer of vraag het de beheerder." Die regel staat er bij iedereen, ook als de collega al een gezicht heeft. `Uitzetten` staat er alleen na herkenning met de pas of de camera. Heb je geen pas, dan stelt de beheerder het voor je in, terwijl je zelf voor de camera staat en zelf het vinkje zet.

Word je binnen 20 seconden niet herkend, of leg je bij het instellen binnen 20 seconden geen gezicht vast, dan gaat de camera vanzelf uit. Het venster blijft open met een melding. Sluit het venster en probeer het opnieuw, of kies je naam in de lijst.

**Een foto werkt niet (sinds versie 3.23).** Een foto van een collega, geprint of op een telefoon, wordt niet als die collega herkend en kan niet als gezicht worden ingesteld. Tijdens het herkennen kijkt de demo stil mee of je gezicht leeft: of je knippert of je hoofd een beetje beweegt. Dat doet iedereen vanzelf, je hoeft er niets voor te doen en er staat geen opdracht op het scherm. Een foto beweegt altijd als één plat geheel en knippert niet. Ziet de demo binnen 5 seconden geen levend gezicht, dan krijg je op het startscherm dezelfde melding als bij niet herkend ("Je bent niet herkend. Houd je pas tegen de lezer of zoek handmatig."), zoekt het cameravenster van `Herken mij` door tot de tijd om is, en krijg je bij instellen "Geen gezicht gevonden. Plaats je gezicht binnen het kader en probeer het opnieuw." Sta je heel stil, kijk dan gewoon nog eens in het ovaal of gebruik je pas. Een video op een telefoon houdt deze controle niet tegen. Daarom blijft de pas het advies voor productie (TO, bijlage B, punt 9). De controle gebruikt de 68 gezichtspunten (ogen, neus, mond en kaaklijn) die de herkenning toch al berekent. Die staan hooguit 3 seconden in het geheugen en worden nooit opgeslagen of verstuurd.

De instellingen staan in `FACE_DEMO.liveness` in `config.js`:

- `enabled` (`true`): de controle aan of uit. Uitzetten is niet aan te raden, want dan werkt een foto weer.
- `windowMs` (3000): over hoeveel milliseconden aan beelden de demo kijkt.
- `maxMs` (5000): na hoeveel milliseconden zonder levend gezicht het telt als niet herkend.
- `blinkRatio` (0.6): een knipper telt als de ooghoogte onder dit deel van de gewone ooghoogte zakt.
- `minDeformation` (0.03): hoeveel het gezicht moet afwijken van een plat vlak, als deel van de afstand tussen de ogen. 0.03 is ongeveer een hoofd dat 7 graden draait. Te hoog en echte mensen worden niet herkend, te laag en de ruis van de camera laat ook een foto door.
- `minFrames` (2): in hoeveel beelden die afwijking moet worden gezien.
- `debug` (`false`): op `true` staan per beeld de gemeten waarden in de console van de browser (`frames`, `eyes` en `deformation`, geen gezichtspunten). Gebruik dit om de drempels op de tablet af te stellen (TO, hoofdstuk 15, testplan herkenningsnauwkeurigheid, stap 6).

Er worden geen foto's gemaakt of opgeslagen. De herkenning gebeurt op het apparaat zelf. Sinds versie 3.17 worden alleen de kenmerken van je gezicht (128 getallen) met de datum van instellen op de tablet bewaard, zodat het na herladen blijft werken. Sinds versie 3.22 staat er ook het moment van je toestemming bij (`consentAt`). Na een jaar verloopt de instelling: de kenmerken worden gewist, de camera herkent je niet meer en bij de volgende passcan vraagt de tablet "Je gezichtsherkenning is verlopen. Opnieuw instellen?" Opnieuw instellen kan alleen na je pas of via de beheerder, met het vinkje dat weer uit staat en dat je zelf opnieuw zet. `Nee` wordt ook dan onthouden. Met `Uitzetten` in het productvenster (na je pas of de camera) wist de demo je gezicht direct. Deactiveren, opnieuw activeren of verwijderen van de medewerker en `Alle gegevens wissen` wissen ook. De kenmerken en het moment van toestemming staan niet in de CSV-export en niet in het logboek (daar staat alleen "Gezichtsherkenning ingesteld", "opnieuw ingesteld", "uitgezet" of "verlopen" met de naam, bij de beheerder met "door beheerder" erachter). De bibliotheek en de modellen komen uit het project zelf (`assets/vendor/face-api/`), niet van internet. Met `FACE_DEMO.enabled = false` in `config.js` staat de demo helemaal uit. De camera werkt alleen via `http://localhost` of `https://`.

### 4.16 Herkennen met de pas

Medewerkers kunnen zich ook laten herkennen met hun pas, via een USB-NFC-lezer die op de tablet of laptop is aangesloten. De meeste van die lezers gedragen zich als een toetsenbord: bij het aanbieden van een pas "typen" ze razendsnel het pasnummer, meestal gevolgd door Enter. De website heeft daarvoor geen bibliotheek, driver of licentie nodig.

1. De beheerder koppelt eerst de pas aan de medewerker (zie 4.5, veld `Pasnummer`).
2. Op de beginpagina houdt de medewerker zijn pas tegen de lezer. Er hoeft niets aangeklikt te worden.
3. Hoort de pas bij een actieve medewerker, dan gaat sinds versie 3.17 de slimme koelkast voor hem open (als die aan staat en zijn consumptiepunt een schapindeling heeft), met de begroeting plus "Je bent herkend met je pas." In de koelkast staat de knop "Liever brood of beleg? Open het productvenster". Anders opent zijn productvenster met dezelfde tekst. Heeft hij nog geen gezichtsherkenning en heeft de tablet een camera, dan komt eerst de vraag uit 4.15.
4. Is de pas onbekend of hoort hij bij een inactieve medewerker, dan verschijnt de melding "Deze pas is niet gekoppeld aan een medewerker. Kies je naam in de lijst of vraag de beheerder om de pas te koppelen." Een onbekende en een inactieve pas krijgen bewust dezelfde melding, zodat er niets over een andere medewerker uitlekt.

Een medewerker herkennen gebeurt op de beginpagina en als het productvenster open is. Staat het productvenster van een collega nog open, dan sluit dat venster zonder op te slaan en opent het venster van de pas. Staat het eigen venster al open, dan blijft het open met de keuze die er al stond. Staat er een ander venster open (het beheer, een formulier of de camera), dan opent er niets en verschijnt "Sluit eerst het open venster om je pas te gebruiken." De website houdt dan wel de Enter of Tab tegen waarmee de lezer een scan afsluit, zodat die niet de knop met de focus indrukt. Staat de focus in het zoekveld, dan haalt de website de getypte tekens van de lezer daar weer uit. Het zoekveld heeft na een scan dezelfde inhoud als ervoor. Hetzelfde geldt voor het bedrijfsfilter: daar komen na een scan ook het gekozen bedrijf terug en gaat de keuzelijst dicht. Sinds versie 3.19 geldt dat voor ieder ander tekstveld met de focus, bijvoorbeeld het e-mailadres bij het inloggen, een zoekveld in het beheer of de naam in het medewerkersformulier: na de scan staat daar weer wat er stond. In het veld `Pasnummer` van het medewerkersformulier vervangt een scan het nummer dat er al stond. Gewoon typen in het zoekveld werkt zoals altijd: een mens typt veel trager dan de lezer, en dat ziet de website nooit als een scan. De instellingen staan in `BADGE_READER` in `config.js` (minimaal 4 tekens, net als het kortste pasnummer in het medewerkersformulier, hooguit 40 milliseconden tussen twee tekens, en 120 milliseconden stilte als einde van de scan voor lezers zonder Enter). Met `BADGE_READER.enabled = false` staat herkennen met de pas helemaal uit en verdwijnt ook de hint boven het zoekveld. `Alle gegevens wissen` wist ook de gekoppelde pasnummers, want die horen bij de medewerkers.

Let op: het nummer van een pas is niet geheim en kan met goedkope apparatuur worden gekopieerd. Herkennen met de pas is dus gemak, geen bewijs van identiteit. Zie het TO voor de beveiliging en voor hoe de passen in productie worden gekoppeld ("Herkomst van het pasnummer").

### 4.17 Slimme koelkast (demo)

De slimme koelkast laat zien hoe het advies uit het TO (bijlage B) zou werken: een koelkast met een slot en een weegschaal per schap, die je opent met je pas. Wat je pakt, wordt aan de hand van het gewicht vanzelf geregistreerd. Het slot en de weegschalen zijn nagebootst. De simulatie staat aan met `SMART_FRIDGE.enabled` in `config.js`. Staat die op `false`, dan zijn de knop en het tabblad Koelkast weg. Registreren met `+` en `−` werkt daarnaast gewoon.

Voor de medewerker:

1. Tik op de beginpagina op `Slimme koelkast (demo)`. Je ziet een koelkast die "Op slot" is en "Houd je pas tegen de lezer om de koelkast te openen".
2. Houd je pas tegen de lezer (de pas moet zijn gekoppeld, zie 4.5). Heb je geen lezer, kies dan in het vak "Demo zonder pasjeslezer" een medewerker en tik op `Openen (demo)`. De keuzelijst begint met "Kies een medewerker" en de knop gaat pas aan als je een naam hebt gekozen.
3. De deur is open. Onder de begroeting staat "Alles wat je nu pakt, staat op naam van …" met jouw naam. Per schap zie je het product en hoeveel er liggen. Tik op een schap om een product te pakken. Onder de koelkast staat wat je in de hand hebt, bijvoorbeeld "In je hand: 2× Blikje". Zet je iets terug, tik dan op `Terugleggen` bij dat schap.
4. Tik op `Deur dicht`. Het slot gaat dicht en de koelkast weegt de schappen. Je ziet bijvoorbeeld "Je hebt gepakt: 2× Blikje" en "Dit is geregistreerd op naam van Lotte van Dijk. De koelkast is weer op slot." Tik op `Klaar`.

Goed om te weten:

- Een onbekende pas of de pas van een inactieve medewerker laat de koelkast dicht: "Deze pas is niet gekoppeld aan een medewerker. De koelkast blijft dicht."
- Een tweede pas terwijl de deur open is, opent niets. Alles wat je pakt, staat op naam van wie de deur opende. Scant een collega zijn pas, dan staat er "De koelkast is al open op naam van … Sluit eerst de deur en open dan met je eigen pas. De beheerder kijkt naar deze opening." en krijgt de opening de status "Controle nodig".
- Staat de deur langer dan een minuut open, dan verschijnt "De deur staat al lang open. Sluit de deur. Wat er nu wordt gepakt, staat op naam van …"
- Tik je per ongeluk twee keer op `Deur dicht`, dan blijft het overzicht staan.
- De koelkast rekent met het gemiddelde gewicht van de producten op het schap, zodat bijvoorbeeld eieren die zwaarder zijn dan het ingestelde gewicht toch goed worden geteld.
- Heb je niets gepakt, dan wordt er niets geregistreerd ("Je hebt niets gepakt"). Escape met de deur open sluit de deur.
- Klopt het gewicht van een schap niet (in de demo na een tik op `Iets anders op schap 1 leggen (demo)`), dan wordt dat schap niet geregistreerd en kijkt de beheerder ernaar. De andere schappen worden wel geregistreerd.
- Wordt de pagina herladen terwijl de deur open is, dan is er niets opgeslagen.

Voor de beheerder staat in het beheer het tabblad `Koelkast`:

1. Kies een consumptiepunt.
2. Kies per schap een product (alleen producten die het punt aanbiedt) of `Leeg schap`, en vul het gewicht van één stuk in gram in (1 tot en met 5000).
3. Klik op `Indeling opslaan`. In het logboek komt "Koelkastindeling gewijzigd".

Zonder eigen indeling geldt de standaardindeling uit `config.js` (schap 1 Blikje 350 gram, schap 2 Yoghurt 150 gram, schap 3 Ei 60 gram). Onder de indeling staan de laatste 10 openingen met datum en tijd, medewerker, wat er is gepakt en de status: `Geregistreerd`, `Niets gepakt` of `Controle nodig` met de reden. Iedere opening geeft één logboekregel ("Koelkast geopend" of "Koelkast: controle nodig"). Registraties van de koelkast staan in de registratietabel met het label `Koelkast` en tellen gewoon mee in de totalen en de CSV-export. Een fout corrigeer je met `+` of `−` (zie 4.4). De instellingen in `config.js` (`SMART_FRIDGE`) zijn onder andere de tolerantie (`toleranceRatio`, 15 procent), het aantal schappen, de standaardindeling, de waarschuwing bij een open deur (`doorWarningMs`, 60 seconden) en wanneer het venster vanzelf sluit (`idleCloseMs`, 60 seconden).

Sinds versie 3.17 hoeft de medewerker meestal niet eerst op `Slimme koelkast (demo)` te tikken: een passcan op het startscherm of de beginpagina, of herkenning met de camera op het startscherm, opent de koelkast direct (stap 3). Na `Klaar` komt het startscherm terug (sinds versie 3.21).

### 4.18 Het startscherm en automatisch scannen (demo)

Sinds versie 3.21 opent de website op een zwart startscherm, ook in het lichte thema. Bovenaan staat klein het TVB-logo met "Consumptieregistratie", in het midden een ovaal voor het gezicht, daaronder een korte tekst en de knop `Handmatig zoeken`. Het startscherm vervangt het gedimde standby-scherm van versie 3.17 tot en met 3.20. Het verschijnt:

- bij het openen van de website.
- na afloop van een registratie of een koelkastopening, zodat de volgende persoon weer op het startscherm begint.
- als een venster dat na de pas of de camera opende vanzelf of zonder registreren sluit.
- als de beginpagina 2 minuten niet is gebruikt en er geen venster open is. Het zoekveld en het bedrijfsfilter worden dan leeggemaakt.

Er zijn drie manieren om te beginnen:

1. **De pas.** Houd je pas tegen de lezer. Dat werkt altijd, ook op het startscherm. De koelkast (of het productvenster) gaat open en het startscherm verdwijnt. De vraag "Gezichtsherkenning nog niet ingesteld. Wil je dit?" komt zoals in 4.15. Een onbekende pas geeft een melding en het startscherm blijft staan.
2. **Het gezicht.** Kijk in het ovaal. Onder het ovaal staat "Kijk in het ovaal" en "Of houd je pas tegen de lezer." Sta je dichtbij en stil in het ovaal, dan wordt het ovaal groen met "Even stil blijven…". Na ongeveer een seconde vergelijkt de demo je gezicht. Word je herkend, dan gaat de camera uit, staat er bijvoorbeeld "Goedemorgen Lotte." in het ovaal en gaat daarna de koelkast voor je open (of je productvenster). Word je na drie pogingen niet herkend, dan wordt het ovaal oranje met "Je bent niet herkend. Houd je pas tegen de lezer of zoek handmatig." en wacht de camera vijf seconden voordat hij het opnieuw probeert. Staan er twee mensen dichtbij, dan staat er "Graag één persoon tegelijk".
3. **Handmatig zoeken.** De knop toont de beginpagina met de lijst, het zoekveld en het bedrijfsfilter (4.1). Met het toetsenbord (Enter of spatie) gaat de focus daarna in het zoekveld. Na een tik niet, zodat het schermtoetsenbord niet over de lijst schuift. Een tik vlak daarna drukt niets in wat onder de knop ligt.

De camera kijkt alleen als het startscherm in beeld is, de demo aan staat, er een camera is en iemand zijn gezicht heeft ingesteld. Hij zoekt drie keer per seconde in een laag camerabeeld (320 × 240 pixels) alleen naar gezichten: waar ze zijn en hoe groot. De kenmerken van een gezicht worden pas berekend als er precies één gezicht dichtbij is (minstens 45 procent van de breedte van het ovaal), het midden ervan in het ovaal valt en het een seconde stil staat. Een collega die verderop langsloopt of naast het ovaal staat, krijgt dus nooit kenmerken. Er worden geen beelden bewaard of verstuurd. Onderaan het startscherm staat "De camera zoekt alleen een gezicht dichtbij in het ovaal. Er worden geen beelden bewaard of verstuurd." De camera gaat uit bij `Handmatig zoeken`, bij ieder venster (ook het beheer), als het tabblad niet zichtbaar is en na herkennen, en weer aan als het startscherm terugkomt. Is er geen camera, geen toestemming of heeft nog niemand een gezicht ingesteld, dan toont het startscherm alleen "Houd je pas tegen de lezer" en `Handmatig zoeken`, zonder foutmelding. Na een geweigerde camera probeert de demo het die sessie niet opnieuw.

`Admin login` staat bewust niet op het startscherm, maar rechtsboven op de beginpagina na `Handmatig zoeken`. Zo heeft het startscherm één duidelijke knop.

Voor een schermlezer is het startscherm een venster met de uitleg "Startscherm. Begin zo: houd je pas tegen de lezer, kijk in het ovaal om herkend te worden met de camera of kies Handmatig zoeken om je naam in de lijst te zoeken." De tekst onder het ovaal wordt voorgelezen als die verandert. De focus staat op `Handmatig zoeken`. Bij "minder beweging" ademt het groene ovaal niet.

De instellingen in `config.js`:

- `STANDBY.enabled` en `STANDBY.idleMs` (2 minuten): het startscherm aan of uit, en na hoeveel tijd zonder invoer het terugkomt.
- `FACE_DEMO.scanMode`: "auto" (standaard) scant automatisch op het startscherm, "tap" werkt zoals in versie 3.17: het ovaal toont "Tik op het ovaal om je gezicht te laten scannen", en na een tik kijkt de camera hooguit `FACE_DEMO.wakeScanMs` (10 seconden) in het venster "Even kijken wie je bent", met `Stoppen`.
- `FACE_DEMO.autoScan`: de drempels van het automatisch scannen. `detectIntervalMs` (333, drie keer per seconde), `minFaceWidth` (0,45 van de breedte van het ovaal), `stillMs` (1000), `maxMovement` (0,12 van de breedte van het ovaal), `attempts` (3), `retryPauseMs` (5000), `greetingMs` (1200) en de resolutie `videoWidth` en `videoHeight` (320 × 240).
- `FACE_DEMO.liveness`: de stille controle op een levend gezicht (sinds versie 3.23, zie 4.15). Een foto in het ovaal opent niets en geeft na 5 seconden "Je bent niet herkend.", net als een onbekend gezicht.
- `FACE_DEMO.validityDays` (365), `FACE_DEMO.offerAfterBadge` (de vraag na een passcan aan of uit) en `FACE_DEMO.offerIdleCloseMs` (na 60 seconden sluit een onbeantwoorde vraag, en dan komt het startscherm terug).
- `RECOGNITION_TARGET`: "fridge" (standaard) opent na herkennen met de pas of de camera de koelkast, "products" altijd het productvenster.

Let op: met "auto" kijkt de camera de hele tijd zolang het startscherm in beeld is, en ziet hij ook voorbijgangers (alleen zoeken naar gezichten, geen kenmerken). Dat is een bewuste keuze voor de demo, op verzoek van de opdrachtgever. Het TO (bijlage B, punt 7 van "Afweging, advies en besluiten", en hoofdstuk 13) legt uit waarom het advies voor productie de pas blijft.

## 5. Uitleg van `index.html`

### Metadata en externe bestanden

In de `<head>` staan:

- `lang="nl"`: de pagina is Nederlandstalig.
- `charset="utf-8"`: ondersteunt Nederlandse tekens.
- `viewport`: maakt de pagina geschikt voor mobiel.
- De titel en beschrijving voor browser en zoekmachines.
- `referrer` op `no-referrer`: de browser stuurt bij links en verzoeken het adres van de pagina niet mee.
- Een Content-Security-Policy (`http-equiv="Content-Security-Policy"`): de browser laadt alleen bestanden van de eigen server. De twee inline scripts (het themascript in de `<head>` en de `file://`-waarschuwing onderaan) zijn toegestaan via hun sha256-hash. Wijzig je zo'n script, dan moet de hash in de CSP mee veranderen. `tests/beveiliging-config.test.js` controleert dat. `frame-ancestors` werkt niet in een meta-tag. Die moet in productie als HTTP-header door de webserver worden meegestuurd (zie het TO, hoofdstuk 13).
- De achttien stylesheets uit `assets/css/` voor de vormgeving, elk met een eigen `<link rel="stylesheet">`, van `base.css` tot en met `responsive.css` (zie hoofdstuk 6). De lettertypes worden in `base.css` met `@font-face` uit `assets/fonts/` geladen, niet van Google Fonts.
- `assets/js/main.js` als startpunt van de JavaScript.

### Navigatiebalk

De `.topbar` bevat:

- Het TVB-logo.
- De naam van de applicatie.
- De themakeuze: een slider voor licht of donker en de knoppen `Systeem` en `Auto` (zie 4.13).
- De status `Systeem actief`.
- De knop `Admin login` waarmee het admin-dashboard wordt geopend.

De HTML is ingedeeld in herkenbare componentblokken: `header` voor navigatie, `main` voor de hoofdinhoud, `section` voor inhoudelijke onderdelen, `aside` voor samenvattingen en `footer` voor de afsluiting. De admin-modal bevat afzonderlijke componenten voor login, tabs, filters en beheeracties. JavaScript gebruikt de `id`-waarden als koppeling met deze componenten.

### Hero-gedeelte

De `.hero` toont de datum van vandaag, een introductietekst en een decoratief recycling-symbool.

De datum wordt niet hardcoded ingevuld. JavaScript vult het element met id `todayLabel` automatisch.

### Medewerkerlijst

De `.directory-card` bevat:

- De titel `Registreer je consumptie`, met rechts "Tik op je naam" (id `employeeListHint`, verborgen als er niemand wordt gevonden) en de teller met het aantal medewerkers (id `employeeCount`).
- Op één regel (`.directory-tools`): de hint "Houd je pas tegen de lezer, of zoek je naam" (id `badgeHint`, alleen zichtbaar als `BADGE_READER.enabled` aan staat) en de knop `Herken mij met de camera (demo)` (id `faceRecognizeButton`, alleen zichtbaar als de demo aan staat en de browser een camera kan gebruiken).
- In `.directory-filters` (vanaf tabletbreedte naast elkaar): de zoekbalk met id `employeeSearch` en de sneltoets-hint `Ctrl K`, en het bedrijfsfilter met id `employeeCompanyFilter` en de keuzelijst `companyFilterOptions`.
- De lege status met id `emptyState`, met de knop `Zoekopdracht wissen`.
- De dynamische lijst met id `employeeList` (zonder `aria-live`).
- Een vaste, onzichtbare statusregel voor schermlezers (id `employeeResultsStatus`, `role="status"`) met alleen het aantal, bijvoorbeeld "3 medewerkers gevonden" of "Geen medewerker gevonden".

JavaScript vult `employeeList` op basis van de medewerkers in de applicatiestatus.

### Statistieken

De elementen `todayTotal` en `monthTotal` worden door JavaScript gevuld met:

- Het aantal registraties van vandaag.
- Het aantal registraties van de huidige maand.

Daaronder staat de tipkaart `Goed bezig!`.

### Vensters (modals)

Ieder venster is een `.modal-backdrop` over de website heen. Een venster sluit met het kruisje, met een klik naast het venster of met de Escape-toets (dan sluit het bovenste venster). Met Tab blijft de focus binnen het open venster. Bij het openen staat de focus meteen in het venster, en het admin-venster heeft altijd de naam van de zichtbare kop ("Welkom terug" of "Overzicht"). Na het sluiten gaat de focus terug naar het element waarmee het venster werd geopend.

| Id | Venster |
|---|---|
| `adminModal` | Loginformulier (`loginView`) en beheerdashboard (`adminView`) met zes tabbladen |
| `employeeProductsModal` | Productvenster van een medewerker, met begroeting, voorstel `Zelfde als vorige keer` (alleen na herkenning met pas of camera), de regel voor de demo gezichtsherkenning (`faceEnrollArea`, sinds versie 3.22 de link alleen na de pas, `Uitzetten` na de pas of de camera en na kiezen op naam alleen de uitleg), een knopbalk die onderaan in beeld blijft (`.employee-products-actions`) met de waarschuwing vlak voor het automatisch sluiten (`productIdleWarning`), de uitleg bij een uitgeschakelde knop (`registerHint`) en `Registreren`, en daaronder de uitleg over de inhouding op het loon (`employeePrivacyNote`) |
| `employeeFormModal` | Medewerker toevoegen of wijzigen |
| `productFormModal` | Product toevoegen of wijzigen |
| `companyFormModal` | Bedrijf toevoegen of wijzigen |
| `pointFormModal` | Consumptiepunt toevoegen of het aanbod wijzigen |
| `faceModal` | Camerabeeld van de demo gezichtsherkenning (instellen of herkennen) |

De elementen `toast` (`role="status"`, gewone meldingen) en `toastAlert` (`role="alert"`, foutmeldingen) tonen de korte meldingen onderaan het scherm. Ze blijven altijd op de pagina staan, zodat een schermlezer ze voorleest (zie `showToast`).

De knop met `data-close-modal` sluit het admin-venster en logt de beheerder daarbij ook uit (zie 4.11). De knop `Uitloggen` logt uit zonder het venster te sluiten. Daarna staat het loginformulier in hetzelfde venster.

Onder het logboek (`auditTab`) staan een uitleg en de knop `Alle gegevens wissen` (id `wipeDataButton`, zie 4.10).

### Startscherm

Het startscherm (`<section id="startScreen" role="dialog" aria-modal="true">`) staat na de `.app-shell` en ligt over de hele pagina, onder de meldingen. Het bevat het logo met de titel `startTitle`, het ovaal `startOval` (met `data-state` voor de kleur) met het camerabeeld `startVideo`, het icoon `startOvalIcon` en de knop `startTapButton` (alleen bij `scanMode` "tap"), de statusregel `startStatus` (`role="status"`), de regel `startHint`, de knop `startManualButton` (`Handmatig zoeken`), de privacyregel `startPrivacy` en de uitleg voor schermlezers `startHelp`. `data-mode` op het startscherm is "auto", "tap" of "badge" (alleen pas en handmatig). Zolang het startscherm in beeld is, is de `.app-shell` `inert`.

### Waarschuwing bij openen als los bestand

Onderaan `index.html` staat een klein script dat controleert of de pagina via `file://` is geopend. Is dat zo, dan verschijnt bovenaan een balk met de uitleg dat de website via Live Server moet worden gestart (zie hoofdstuk 3).

## 6. Uitleg van de CSS (`assets/css/`)

### Bestanden en volgorde

Tot en met versie 3.19 stond alle vormgeving in één bestand (`styles.css`, 2706 regels). Sinds versie 3.20 staat die in achttien kleinere stylesheets, één per onderdeel. Er is daarbij niets aan de regels zelf veranderd: het oude bestand is in aaneengesloten stukken geknipt, in de oorspronkelijke volgorde, en ieder stuk kreeg bovenaan een korte uitleg.

`index.html` laadt de bestanden met losse `<link rel="stylesheet">`-regels in deze volgorde. Die volgorde is belangrijk: hebben twee regels dezelfde sterkte, dan wint de regel die later komt. Zet de bestanden dus niet in een andere volgorde.

| Volgorde | Bestand | Wat erin staat |
|---|---|---|
| 1 | `base.css` | Lettertypes, de kleurvariabelen voor licht en donker, de reset en de pagina-opbouw |
| 2 | `topbar.css` | De bovenbalk met logo, thema-schakelaar en de knop `Admin login` |
| 3 | `home.css` | De beginpagina: banner, medewerkerlijst, zoekveld, bedrijfsfilter, totalen, tip en footer |
| 4 | `modal.css` | Vensters, velden in een venster en de algemene knoppen |
| 5 | `admin.css` | Het beheer: kop, tabbladen, filters en tabellen |
| 6 | `product-window.css` | Het productvenster met `−` en `+` en de knopbalk met `Registreren` |
| 7 | `admin-forms.css` | Het beheer: formulieren, lijsten, bedrijven, consumptiepunten en voorraad |
| 8 | `toast.css` | De melding bij openen als los bestand en de tijdelijke meldingen |
| 9 | `admin-corrections.css` | Het beheer: correcties en het venster `Registratie verwijderen` |
| 10 | `motion.css` | Overgangen en animaties, en geen animaties bij "minder beweging" |
| 11 | `icons.css` | De SVG-iconen |
| 12 | `feedback.css` | Iconen in meldingen, foutmeldingen onder een veld en de lege toestand |
| 13 | `suggestion.css` | De begroeting en de aanbeveling in het productvenster |
| 14 | `directory-tools.css` | De hint voor de pas, de demoknoppen en zoekveld en filter naast elkaar |
| 15 | `face.css` | De demo gezichtsherkenning |
| 16 | `start-screen.css` | Het startscherm (sinds versie 3.21, op de plek van `standby.css`) |
| 17 | `fridge.css` | De slimme koelkast en het tabblad Koelkast |
| 18 | `responsive.css` | De mediaqueries voor telefoon en tablet. Staat als laatste |

Een nieuwe regel hoort in het bestand van het onderdeel. Komt er een nieuw bestand bij, link het dan ook in `index.html`. `tests/beveiliging-config.test.js` controleert dat ieder bestand in `assets/css/` precies één keer wordt geladen. De unit tests lezen alle CSS samen met `readAllCss()` uit `tests/helpers.js`, in de volgorde van `index.html`.

### CSS-variabelen

In `:root` (in `base.css`) staan herbruikbare variabelen:

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
- `--start-screen-*` (sinds versie 3.21): de kleuren van het startscherm. Die zijn in beide thema's gelijk, omdat het startscherm altijd donker is: `--start-screen-bg` (`#050d0f`, bijna zwart), de accentkleur `--start-screen-accent` (`#70d9ad`, het groene ovaal) en `--start-screen-warning` (`#f0b36b`, niet herkend).

Als het organisatiepalet later verandert, kunnen de kleuren centraal worden aangepast.

**Licht en donker thema:** alle kleuren in de stylesheet komen uit deze variabelen. `:root` bevat de lichte kleuren, `:root[data-theme="dark"]` dezelfde variabelen met donkere waarden. De class `ThemeManager` zet `data-theme="light"` of `data-theme="dark"` op het `<html>`-element, en de hele website verandert dan mee. Een klein script in de `<head>` van `index.html` zet het donkere thema al vóór het tekenen van de pagina, zodat de pagina niet eerst wit oplicht. Bij `Auto` gebruikt het script het thema van het vorige bezoek, dat `ThemeManager` bewaart onder `tvb-theme-last`. Alleen de witte tekst op groene knoppen, de letters in de avatars en de kleuren van de banner zijn in beide thema's hetzelfde. Door `color-scheme` tekent de browser de keuzelijsten (`select`) en hun opties in het donkere thema ook donker: witte tekst op `--paper`, contrast 15,7:1. Placeholdertekst, zoals "Alle bedrijven" in het bedrijfsfilter, krijgt in het donkere thema `--muted` (6,9:1), omdat het standaardgrijs van de browser daar maar 3,4:1 haalt. In het lichte thema is `--muted` iets donkerder gemaakt (`#5a6c71`, dezelfde tint), zodat de uitleg- en bijschrifttekst op alle lichte achtergronden minstens 4,5:1 haalt (4,6:1 tot 5,5:1).

De stylesheets zijn geordend van algemeen naar specifiek:

1. Globale variabelen en reset (`base.css`).
2. Basislayout en navigatie (`topbar.css` en `home.css`).
3. Hoofdcomponenten zoals hero, kaarten, medewerkerregels, vensters en het productvenster.
4. Admincomponenten, tabellen en meldingen.
5. De onderdelen die later zijn toegevoegd: gezichtsherkenning, het startscherm en de slimme koelkast.
6. Responsive regels voor kleinere schermen (`responsive.css`).

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
| `min-width: 721px` en `max-width: 900px` | Kleinere zijmarge, de totalen komen onder de medewerkerlijst |
| `min-width: 721px` | Het zoekveld en het bedrijfsfilter staan naast elkaar |
| `min-width: 721px`, `max-width: 1100px` en staand, of `min-width: 721px` en `max-height: 900px` | Compactere banner op een staande tablet en op schermen met weinig hoogte (zoals een liggende tablet van 1080 × 810), zodat de lijst hoger begint |
| `min-width: 1000px` en `max-height: 900px` | Nog iets lagere banner op een liggende tablet, met de uitleg op één regel |
| `pointer: coarse` | Op een aanraakscherm zijn `−` en `+` in het productvenster 52 × 52 pixels |
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
- Het productvenster met `−`- en `+`-knoppen (op een aanraakscherm 52 pixels), een gekozen product met lichtgroene achtergrond en groene rand (`.is-selected`), de begroeting, het voorstel `Zelfde als vorige keer` (na herkenning met pas of camera), de knopbalk die onderaan in beeld blijft (`position: sticky`) en de uitleg over de inhouding op het loon.
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
      color: "#d8f1e8",
      badgeId: ""
    }
  ],
  registrations: [
    {
      id: "unieke-id",
      employeeId: "id-van-medewerker",
      productId: "blikje",
      price: 0.65,
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
      products: {
        blikje: { offered: true, stock: 24, minimum: 6, countedAt: "2026-10-01T07:30:00.000Z" }
      }
    }
  ],
  auditLog: [
    { id: "unieke-id", action: "Product gewijzigd", details: "Blikje", createdAt: "2026-10-01T10:06:00.000Z" }
  ]
}
```

Sinds versie 3.17 staan de kenmerken van ingestelde gezichten (128 getallen per medewerker, geen foto) met hun datum ook in deze status (`faceEnrollments`, zie hoofdstuk 8), met het antwoord op de vraag na een passcan (`faceOffers`). Daarvoor bestonden ze alleen in het geheugen van de pagina.

Naast de gegevens zelf kunnen er twee reservekopieën in `localStorage` staan: `tvb-blikjesregistratie-backup` en `tvb-blikjesregistratie-backup-laatste` (zie `DataStore` hieronder). De thema-instelling staat los daarvan onder `tvb-theme` en `tvb-theme-last`.

### Objectgeoriënteerde structuur

De JavaScript-code volgt het principe van objectgeoriënteerd programmeren (OOP) en het MVC-patroon (Model, View, Controller). De code is opgedeeld in achtentwintig classes, ieder in een eigen bestand. Dertien daarvan vormen samen de controller: `RegistrationApp` en de twaalf onderdelen `ModalManager`, `EmployeeController`, `BadgeController`, `FaceController`, `AdminController`, `CorrectionController`, `StockController`, `FormController`, (sinds versie 3.14) `FridgeController`, (sinds versie 3.17) `RecognitionController` en `StandbyController`, en (sinds versie 3.21) `AutoScanController`. Negen zijn `DataStore`, `RegistrationModel`, `RegistrationView`, `CsvExport`, `ThemeManager` (licht en donker thema), `FaceRecognitionDemo` (demo gezichtsherkenning), `FaceIntent` (de intentie-drempel van het automatisch scannen), (sinds versie 3.23) `FaceLiveness` (de stille controle op een levend gezicht) en `BadgeReader` (pasjeslezer). De laatste zes horen bij de slimme koelkast (demo): `FridgeView` en, in de map `assets/js/fridge/`, `SmartFridge`, `FridgeLock`, `SimulatedLock`, `ShelfScale` en `SimulatedShelfScale`. Iedere class heeft één duidelijke verantwoordelijkheid, en bovenaan ieder bestand staat in een comment waarvoor de class is en met welke andere classes hij verbonden is.

```text
DataStore ──► RegistrationModel ──► RegistrationView
                     │                     │
                     ├──► CsvExport        │
                     ▼                     ▼
               RegistrationApp (controller, stuurt model, view, export, FaceRecognitionDemo en BadgeReader aan)
                     │
                     └──► onderdelen: ModalManager, EmployeeController, BadgeController, FaceController,
                          AdminController, CorrectionController, StockController, FormController,
                          RecognitionController, StandbyController (startscherm),
                          AutoScanController ──► FaceIntent,
                          FridgeController ──► SmartFridge ──► FridgeLock (SimulatedLock)
                                                           └──► ShelfScale (SimulatedShelfScale)

FaceRecognitionDemo ──► FaceLiveness (stille controle op een levend gezicht, sinds versie 3.23)

ThemeManager (los: alleen het thema van de pagina)
```

`main.js` maakt alle objecten één keer aan en geeft ze aan elkaar door (compositie). `config.js`, `icons.js` en `ids.js` bevatten alleen vaste waarden of een hulpfunctie en zijn daarom geen class.

Toegepaste OOP-principes:

- **Encapsulatie:** iedere class beheert zijn eigen gegevens. Andere classes lezen de gegevens van het model via getters (`model.employees`, `model.products`) en wijzigen ze alleen via methodes (`model.addRegistration`, `model.saveCompany`).
- **Eén verantwoordelijkheid per class:** opslag, regels, weergave, besturing en export staan elk in een eigen class. Ook de besturing zelf is verdeeld: ieder onderdeel van de controller heeft één taak (vensters, beginpagina, pas, camera, beheer, correcties, voorraad, formulieren, koelkast, na herkennen, startscherm en automatisch scannen).
- **Compositie:** de controller krijgt het model, de view, de export, de demo gezichtsherkenning, de pasjeslezer en de klok voor het automatisch uitloggen mee in de constructor, in plaats van ze zelf te maken. Daardoor kan in de tests een nep-view of nep-export worden meegegeven. De controller maakt wel zelf zijn twaalf onderdelen en geeft zichzelf daarbij mee. Ook de slimme koelkast (`SmartFridge`) wordt meegegeven, zodat in de tests een koelkast met een nep-klok kan worden gebruikt.
- **Losse koppeling:** de view weet niets van de controller en verandert geen gegevens. De opslag kan worden vervangen door een andere class met dezelfde methodes `load()` en `save()`.

#### `DataStore`

Verzorgt het lezen en opslaan van gegevens in `localStorage`. `load` leest de gegevens, zet ze om en slaat losse beschadigde regels over (`removeInvalidItems`). Zijn er regels overgeslagen of zijn de gegevens helemaal onleesbaar, dan bewaart `keepBackup` de oorspronkelijke gegevens als reservekopie en zet `loadProblem` op `"skipped"` of `"unreadable"`. De controller toont dan een melding. Als onleesbaar telt ook een lijst die er wel staat maar geen lijst is (bijvoorbeeld `"registrations": {}`), want die zou anders stil leeg worden en bij de volgende keer opslaan de oude gegevens overschrijven. Alleen een lijst die helemaal ontbreekt (oude versie) krijgt een standaardwaarde. `save` geeft `false` terug als opslaan niet lukt en zet dan `saveProblem` op `"full"` (de opslag van de browser is vol, herkend aan de `QuotaExceededError`, zie `isQuotaError`) of `"failed"`. Bij een volle opslag toont de controller een eigen melding (zie Opslagfouten en terugdraaien). Er zijn hooguit twee reservekopieën (`backupKeys`): `tvb-blikjesregistratie-backup` is de eerste en wordt nooit overschreven, `tvb-blikjesregistratie-backup-laatste` is de nieuwste en wordt steeds vervangen. Staat dezelfde kopie er al als eerste, dan gebeurt er niets. Zo loopt de opslag niet vol.

Bij het laden wordt iedere regel gecontroleerd. `isSafeId` eist dat iedere id en iedere verwijzing naar een id alleen letters, cijfers, `-` en `_` bevat (maximaal 64 tekens, `^[A-Za-z0-9_-]{1,64}$`). Zo kan een aangepaste id niet uit een HTML-attribuut breken. `isSafeColor` eist een kleur in de vorm `#rrggbb`, en `isValidPrice` een prijs van 0 tot en met 1000. Een regel met een ongeldige id, verwijzing of prijs wordt overgeslagen. Een product zonder prijs (`null` of leeg) ook, zodat het niet gratis wordt. Een tijdstip moet ook echt bestaan: `2026-02-31` of `T24:00` is ongeldig, ook al schuift de browser het door naar een andere dag (`existsAsWritten`). Komt een id binnen één lijst (medewerkers, registraties, producten, bedrijven, consumptiepunten of logboek) meer dan één keer voor, dan blijft alleen de eerste regel staan (`withoutDuplicateIds`). Een registratie met een tijdstip (`createdAt`) van meer dan 24 uur na het moment van laden wordt ook overgeslagen. Net als bij andere overgeslagen regels komen er dan een reservekopie, `loadProblem` `"skipped"` en een melding. Een medewerker met een ongeldige kleur blijft bewaard en krijgt een kleur uit `COLORS`. Het pasnummer (`badgeId`) wordt eerst gelijk gemaakt zoals de pasjeslezer dat doet (`migrateBadgeId`: spaties, `:` en `-` weg, hoofdletters). Oude gegevens zonder pasnummer krijgen `""` (geen pas). Een pasnummer dat ook daarna ongeldig is (geen tekst, andere tekens dan `A-Z` en `0-9`, of meer dan 64 tekens, zie `isSafeBadgeId`), wordt `""` en telt als overgeslagen (`repairedBadges`), met een reservekopie en een melding. De medewerker blijft bestaan. Komt hetzelfde pasnummer bij meer medewerkers voor, dan houdt alleen de eerste het (`withoutDuplicateBadges`). Die controle gebeurt pas nadat ongeldige regels en dubbele id's zijn overgeslagen, zodat een regel die afvalt geen pas van een geldige medewerker afpakt.

Codes (looncode, personeelsnummer, werkgevernummer) moeten tekst zijn van hooguit 64 tekens zonder stuurtekens zoals tab of enter (`isShortCode`). Een code die een object of lijst is, maakt de regel ongeldig. Een heel getal uit oude gegevens wordt eerst tekst (`codeText`). Tijdstippen (`createdAt` van registraties en logboekregels, en `countedAt`) moeten in ISO-vorm staan, zoals `2026-10-09T08:30:00.000Z`, en mogen niet vóór 1 januari 2000 liggen (`isValidDateTime`). Ook een logboekregel van meer dan 24 uur na het moment van laden wordt overgeslagen.

De voorraadlijst van een consumptiepunt is een object met een product-id als sleutel. Bij het laden neemt `renameStockKeys` alleen sleutels over die een veilige id zijn, en `completePointStock` maakt alleen regels voor geldige producten. Een geknoeide sleutel zoals `__proto__` of `constructor` kan het object zo niet veranderen. `isValidPoint` controleert dat de voorraadlijst een gewoon object is met alleen veilige sleutels (`hasSafeStockKeys`).

`clearAll` wist de gegevens, beide reservekopieën en oude reservekopieën met een tijdstempel uit een eerdere versie. Dit wordt gebruikt door de knop `Alle gegevens wissen`.

`migrate` zet oude gegevens om (bijvoorbeeld product-id `melk` naar `glas-melk` en `brood` naar `sneetje-brood`, in de registraties, in de opgeslagen productlijst en in de voorraad van de punten, of een vrij ingevulde bedrijfsnaam naar een echt bedrijf). Opgeslagen producten gaan altijd voor op de standaardproducten, zodat gewijzigde prijzen en verwijderde producten bewaard blijven. Voorraad en minimum worden altijd getallen (een negatief minimum wordt 0, een negatieve voorraad blijft staan), het tijdstip van de laatste telling (`countedAt`) blijft bewaard als het een geldige datum is die niet in de toekomst ligt (een telling in de toekomst wordt weggelaten, zodat de voorraad niet geblokkeerd raakt en het product telt dan als "niet geteld"), en beschadigde logboekregels (`isValidAuditEntry`) worden overgeslagen, zodat het logboek niet vastloopt. Als later een database wordt gebruikt, kan deze opslaglaag worden vervangen zonder de rest opnieuw te schrijven.

#### `RegistrationModel`

Bevat alle gegevens en regels. De methodes zijn gegroepeerd per onderwerp: registraties, medewerkers, producten, bedrijven, consumptiepunten, voorraad en logboek. Voorbeelden van regels:

- Een registratie verlaagt de voorraad van het consumptiepunt van de medewerker, als dat punt het product aanbiedt en de registratie niet vóór de laatste telling ligt. `pointId` in de registratie is het punt dat het product aanbood (anders `null`).
- Een bedrijf of consumptiepunt met medewerkers kan niet worden verwijderd.
- `removeEmployee` verwijdert alleen een inactieve medewerker zonder registraties. Anders geeft het `false`.
- `saveCompany` weigert (`false`) een werkgevernummer dat al bij een ander bedrijf hoort (`isEmployerNumberTaken`). Een leeg nummer telt niet.
- De loonmaand is de maand na de consumptie (`payrollPeriod`).
- Met `snapshot` en `restore` kan een wijziging worden teruggedraaid als opslaan mislukt.
- `registrationsFor` geeft alle registraties van een medewerker en product, met de nieuwste datum bovenaan. Dat is de lijst in het venster `Registratie verwijderen` (correctie `−`). `removeRegistration` verwijdert precies de gekozen registratie (op id) en zet het product terug in de voorraad van het punt uit de registratie, maar alleen als de registratie ná de laatste telling is gemaakt. `findRegistration` zoekt een registratie op id.
- `lastRegistration` zoekt de laatst ingevoerde registratie van een medewerker (en product): de volgorde van invoer telt, niet de datum. `removeLastRegistration` verwijdert die registratie (via `removeRegistration`). De correctie `−` in het beheer gebruikt deze twee niet meer, want daar kiest de beheerder zelf de registratie.
- `setStock` vervangt de voorraad door de getelde hoeveelheid en bewaart het tijdstip (`countedAt`). `removeLastRegistration` zet een product alleen terug in de voorraad als de registratie na die telling is gemaakt. `stockEntry` geeft de voorraadregel van één product op één punt. Beide gebruiken `pointProduct`, dat een regel alleen vindt als eigen sleutel van de voorraadlijst (`Object.hasOwn`). Een product-id als `toString` vindt dus geen voorraadregel en schrijft er ook geen.
- `moveEmployeesOfPoint` zet de medewerkers van een consumptiepunt over naar een ander bedrijf. Alleen `companyId` verandert, de naam wordt niet opnieuw opgebouwd.
- `wipeAll` laat de opslag alles wissen (`clearAll`) en start opnieuw met de demogegevens (`createSeedState`).

#### `RegistrationView`

Verzorgt alleen de presentatie in de browser. Deze class rendert de medewerkerlijst, het productvenster, statistieken, admin-tabellen, filters, voorraad en toastmeldingen. Alle tekst én alle waarden in HTML-attributen (zoals id's in `data-…`, `value="…"` en klassen) gaan eerst door `escapeHtml`, zodat ze niet uit het attribuut kunnen breken. De functie `cssAttributeValue` (in hetzelfde bestand, ook gebruikt door de controller) maakt een id veilig voordat die in een CSS-selector komt. In de browser gebruikt die `CSS.escape`. `companyGroupKey` bepaalt bij welke groep van het bedrijfsfilter een medewerker hoort: medewerkers zonder bedrijf of met een bedrijf dat niet meer bestaat, vallen onder `Onbekend bedrijf`. `populateCompanyFilter` overschrijft de tekst in het bedrijfsfilter niet zolang de gebruiker erin typt. `countRegistrations` telt de registraties per medewerker en product in één keer, zodat de correctielijst ook bij veel registraties snel blijft. `renderRemoveRegistrationList` vult het venster `Registratie verwijderen` met per registratie de datum en tijd, het product, het aantal en een knop `Verwijderen`. `renderStockAlerts` en `updateStockStatus` werken na het aanpassen van de voorraad alleen de bijbestellijst en één statuslabel bij. De view leest uit het model, maar verandert zelf niets.

#### `RegistrationApp`

Vormt de controller van de applicatie. Eerder stond alle besturing in deze ene class (2414 regels). Nu maakt `RegistrationApp` in de constructor twaalf kleinere onderdelen, elk met één taak (zie hieronder), en houdt zelf alleen wat bij de hele app hoort:

- het starten (`initialize`) en de dagwissel (`refreshIfNewDay`, `renderTodayLabel`).
- de melding bij beschadigde opgeslagen gegevens (`showLoadProblem`).
- de synchronisatie tussen tabbladen (`handleStorageChange`, `handleStorageCleared`).
- het opslaan met terugdraaien (`persist`) en de namen voor het logboek (`employeeLabel`, `pointLabel`).
- het koppelen van alle event listeners (`registerEventListeners` en de `register…Events`-methodes) en de algemene kliklistener `handleClick`.
- de toestand die meerdere onderdelen delen: `adminLoggedIn`, de gekozen medewerker en producten in het productvenster (`selectedEmployeeId`, `selectedProducts`), hoe die medewerker is herkend (`recognizedBy`) en de dag op het scherm (`currentDay`).

Ieder onderdeel krijgt `RegistrationApp` mee in de constructor (`this.app`). Het gebruikt via die verwijzing het model, de view, `persist`, de gedeelde toestand en de methodes van de andere onderdelen. Onderaan `RegistrationApp.js` staat de lijst `DELEGATES`: welke methodes en velden van de onderdelen ook op `RegistrationApp` bestaan. `app.handleBadgeKey(event)` roept zo `BadgeController.handleBadgeKey` aan, en `app.faceSession` leest en wijzigt het veld van `FaceController`. Zo blijft `RegistrationApp` voor `main.js`, `index.html` en de tests één aanspreekpunt, en staat iedere waarde op één plek. De statische hulpmethodes `RegistrationApp.isValidPrice`, `isDigitsOnly` en `dateValue` geven door aan `FormController` en `CorrectionController`.

`handleClick` bevat een lijst van knoppen met de actie die erbij hoort. Iedere actie is een eigen, korte methode in een van de onderdelen. De methode `persist(wijziging, logboekregel)` zorgt dat iedere wijziging wordt opgeslagen of automatisch wordt teruggedraaid bij een opslagfout. De logboekregel (bijvoorbeeld `{ action: "Product verwijderd", details: "Blikje" }`) wordt toegevoegd vóórdat er één keer wordt opgeslagen. Zo worden de wijziging en de logboekregel samen opgeslagen of samen teruggedraaid.

`handleStorageChange` luistert naar het `storage`-event: slaat een ander tabblad iets op, dan laadt het model de gegevens opnieuw (`RegistrationModel.reload`) en wordt alles opnieuw getekend, zonder dat een knop in een lijst de focus verliest (`preserveFocus`). Gezichten (demo) van medewerkers die in het andere tabblad zijn verwijderd, worden vergeten. Daarna ruimt de controller op wat niet meer klopt: `FormController.closeStaleForms` sluit een open wijzigformulier van iets dat intussen is verwijderd of gewijzigd, en een open productvenster (met het cameravenster erboven) sluit met een melding als de medewerker is verwijderd of gedeactiveerd. Typt de beheerder in de voorraadtabel (`StockController.isTypingInStockTable`), dan blijft die tabel staan. Waren de nieuwe gegevens onleesbaar, dan volgt een waarschuwing. Klikt iemand in een ander tabblad op `Alle gegevens wissen`, dan verwijdert dat tabblad de gegevenssleutel (`event.newValue` is dan null). Dit tabblad wist dan ook alles uit het geheugen, logt de beheerder uit, vergeet de gezichten en toont "De gegevens zijn in een ander venster gewist." (`handleStorageCleared({ keepStore: true })`). De opslag zelf blijft met rust, want het andere tabblad zet er meteen de nieuwe demogegevens in. Anders zouden de twee tabbladen elkaar steeds opnieuw wissen.

#### Onderdelen van de controller

**`ModalManager`** opent en sluit de vensters. `openModal` onthoudt welk element de focus had (`rememberOpener`), en `closeModal` zet de focus daar weer op, als dat element nog zichtbaar op de pagina staat. Is de lijst met die knop intussen opnieuw getekend, dan zoekt `findFocusReplacement` de nieuwe knop met dezelfde data-attributen (bijvoorbeeld `[data-edit-product="blikje"]`, gemaakt door `focusSelector`), of een logisch alternatief als het item weg is (zoals `Medewerker toevoegen`). `preserveFocus` doet hetzelfde rond het opnieuw tekenen van lijsten na opslaan, (de)activeren, verwijderen en een wijziging in een ander tabblad. `registerModalClose` koppelt de sluitknoppen en de donkere achtergrond van een venster en onthoudt de sluitactie (`modalCloseActions`) voor de Escape-toets. `topModal` geeft het bovenste open venster, en `keepFocusInModal` houdt de Tab-toets binnen dat venster. `show` en `hide` tonen of verbergen een element. `scrollModalToTop` zet een venster dat opengaat bovenaan (de scrollpositie van het venster en de achtergrond op 0). `openModal` doet dat altijd, en `EmployeeController.openEmployeeProducts` doet het voor het productvenster, met daarna `focus({ preventScroll: true })` op de eerste `+`. Zonder die stap zet de browser de scrollpositie van de vorige keer terug, waardoor het venster een stukje omlaag gescrold kon openen.

**`EmployeeController`** is de kant van de medewerker: het zoekveld en het bedrijfsfilter (`clearSearch`, `onCompanyFilterInput`, `selectCompanyFilterOption`), het productvenster (`openEmployeeProducts`, `renderProductWindow`, `incrementProduct`, `decrementProduct`, `repeatLastSelection`, `closeEmployeeProducts`) en registreren (`registerSelectedProducts`, zie hieronder). `removeUnavailableSelections` haalt producten uit de keuze die het consumptiepunt intussen niet meer aanbiedt. `setCompanyOptionsOpen` en `closeCompanyOptions` openen en sluiten de keuzelijst van het bedrijfsfilter en houden `aria-expanded` bij (Escape sluit de lijst). `isGhostRowClick` negeert een klik op een medewerkerrij die de tweede klik van een dubbelklik is of minder dan 500 ms na het sluiten van het productvenster komt, zodat een dubbelklik op `Registreren` niet het venster van een collega opent. `handleEmployeeRowKey` opent het venster met Enter of spatie, maar niet bij een ingedrukt gehouden toets (`event.repeat`). `resetEmployeeSearch` maakt na registreren het zoekveld en het bedrijfsfilter leeg (ook `dataset.value` en `aria-selected`) en zet de lijst bovenaan in beeld. `startProductIdleWatch`, `noteProductActivity` en `closeProductWindowIfIdle` sluiten het productvenster na 75 seconden zonder invoer (`EMPLOYEE_IDLE_CLOSE_MS` in `config.js`): de timer kijkt iedere seconde, iedere tik, toets of scroll in het venster begint de tijd opnieuw, in de laatste 10 seconden toont `setIdleWarning` de waarschuwing en daarna gaat het venster dicht zonder op te slaan. De klok wordt net als bij `AdminController` aan de constructor meegegeven, zodat de tests met een nep-klok werken.

**`BadgeController`** verbindt `BadgeReader` met de app. De constructor zet de callbacks `onScan` en `onStart` van de pasjeslezer. `handleBadgeKey` geeft iedere toets door, `rememberSearchBeforeScan` en `restoreSearchAfterScan` zorgen dat er geen pasnummer in het zoekveld of het bedrijfsfilter blijft staan (ook de bedrijfskeuze komt terug), `restoreOtherFieldAfterScan` doet dat voor ieder ander tekstveld met de focus (welke velden dat zijn, bepaalt `isOtherTextField`: niet het zoekveld, het bedrijfsfilter en `Pasnummer`, en geen vinkjes of knoppen) en vuurt daarna een input-event af, zodat een zoekveld in het beheer de lijst opnieuw tekent, `fillBadgeFieldAfterScan` vervangt bij een scan in het veld `Pasnummer` het oude nummer, en `recognizeBadge` zoekt na een scan de medewerker op en geeft hem door aan `RecognitionController.afterRecognition` (de vraag over gezichtsherkenning, daarna de koelkast of het productvenster). Staat er een ander venster open dan het productvenster, dan meldt `recognizeBadge` "Sluit eerst het open venster om je pas te gebruiken." Staat het productvenster open, dan beslist `replaceProductWindow`: het eigen venster blijft open, het venster van een collega gaat dicht zonder op te slaan en het venster van de pas opent.

**`FaceController`** bestuurt het cameravenster van de demo gezichtsherkenning (`openFaceModal`, `scanForFace`, `captureEnrollment`, `closeFaceModal`). Ieder venster krijgt een eigen sessienummer (`faceSession`), zodat een zoektocht of vastlegging stopt als het venster sluit. `stopCameraAfterTimeout` en `scheduleEnrollTimeout` zetten de camera uit als er bij herkennen binnen `FACE_DEMO.scanTimeoutMs` (20 seconden) niemand is herkend, of als er bij instellen in die tijd geen gezicht is vastgelegd. Het venster blijft open met een melding. `closeFaceModal` ruimt een wachtende time-out op. Sinds versie 3.17: `startWakeScan` opent na een tik op het ovaal van het startscherm (`scanMode` "tap") de korte scan (`faceMode` "wake", `FACE_DEMO.wakeScanMs`, de knop heet `Stoppen`), en `endWakeScan` zet daarna de camera uit en sluit het venster als niemand is herkend. Na herkenning gaat `continueAfterRecognition` verder (koelkast of productvenster). `captureEnrollment` slaat de kenmerken met de datum op via `persist` en `model.saveFaceEnrollment`, met de logboekregel "Gezichtsherkenning ingesteld", en `forgetFace` wist ze met "Gezichtsherkenning uitgezet". `loadSavedFaces` zet de geldige opgeslagen gezichten in het geheugen van `FaceRecognitionDemo`, en `expireFaces` wist gezichten van 365 dagen en ouder met "Gezichtsherkenning verlopen". `startFaceEnrollmentFor` opent het instelvenster na `Ja, instellen` en onthoudt wat er daarna verder gaat (`enrollContinuation`). Sinds versie 3.22 bepalen `canSelfEnroll` en `canSelfForget` wie zelf mag instellen (alleen na de pas, `recognizedBy` is "badge") en uitzetten (na de pas of de camera). `startFaceEnrollment`, `startFaceEnrollmentFor` (alleen met `how` "badge") en `forgetFace` weigeren anders met een melding, zonder de camera aan te zetten. `startAdminFaceEnrollment` en `adminForgetFace` zijn voor de beheerder in het tabblad Medewerkers (alleen na `requireAdmin`), met `enrollByAdmin` zodat het logboek "door beheerder" zegt en het cameravenster bij uitloggen sluit. `faceSetupState` geeft "ready", "noCamera" of "off" terug voor de knop in het beheer. `captureEnrollment` bewaart ook het moment van toestemming (`consentAt`) en zegt na verlopen "Gezichtsherkenning opnieuw ingesteld". Sinds versie 3.23 telt `scanForFace` (`Herken mij` en de scan na een tik) een herkenning alleen als `FaceRecognitionDemo.checkLiveness` "alive" geeft, en anders zoekt hij door tot de tijd om is. `readFaceForEnrollment` leest bij het instellen tot er een levend gezicht is gezien (dan de descriptor), tot de controle "failed" geeft (dan `null` en "Geen gezicht gevonden. …") of tot er vijf keer geen gezicht is gevonden.

**`RecognitionController`** (sinds versie 3.17) bepaalt wat er opent na herkennen. `afterRecognition` krijgt de medewerker en hoe hij is herkend ("badge" of "face"). Na een passcan opent `openFaceOffer` eerst de vraag "Gezichtsherkenning nog niet ingesteld. Wil je dit?" als `shouldOfferFace` dat zegt (demo aan, camera aanwezig, geen geldige instelling, niet eerder `Nee`). `acceptFaceOffer`, `declineFaceOffer` en `dismissFaceOffer` horen bij `Ja, instellen`, `Nee` en het kruisje of Escape. `continueAfterRecognition` opent met `RECOGNITION_TARGET` "fridge" de koelkast (`openFridgeFor`) als dat kan, en anders het productvenster. `closeFaceOfferIfIdle` sluit een onbeantwoorde vraag na 60 seconden.

**`StandbyController`** (sinds versie 3.17) is sinds versie 3.21 het startscherm (zie 4.18). In de code heet de toestand nog "standby": `standbyActive` betekent dat het startscherm in beeld is. `startStandbyWatch` start één timer die iedere seconde `tickStandby` aanroept: die sluit een onbeantwoorde vraag, wist eens per minuut verlopen gezichten, werkt het startscherm bij (`refreshStartScreen`) en laat `checkStandby` kijken of de beginpagina 2 minuten niet is gebruikt zonder venster. `enterStandby` toont het startscherm (`view.showStartScreen` en `view.renderStartScreen` met de teksten van `startScreenTexts`). `returnToStartScreen` laat het terugkomen na een registratie, de koelkast of een venster dat vanzelf sluit. `wakeFromStandby` verbergt het, bijvoorbeeld als na herkennen een venster opent (`ModalManager.openModal`, `EmployeeController.openEmployeeProducts` en `RecognitionController` roepen het aan). `handleManualSearch` is de knop `Handmatig zoeken`, `handleStandbyTap` de tik op het ovaal bij `scanMode` "tap", en `swallowStandbyGhostClick` houdt een klik binnen 500 ms na een tik op het startscherm tegen. De klok wordt aan de constructor meegegeven, zodat de tests met een nep-klok werken.

**`AutoScanController`** (sinds versie 3.21) is het automatisch scannen op het startscherm (`FACE_DEMO.scanMode` "auto"). `updateAutoScan` zet de camera aan of uit naar `shouldAutoScan`: alleen als het startscherm in beeld is, de demo aan staat, er zeker een camera is, iemand een gezicht heeft ingesteld en het tabblad zichtbaar is. `startAutoScan` zet eerst de camera aan (320 × 240) en laadt daarna het model, zodat een tablet zonder camera of toestemming de bibliotheek niet laadt. `scanTick` laat `FaceRecognitionDemo.detectFaces` drie keer per seconde gezichten zoeken en geeft het resultaat aan `FaceIntent`. Pas als die "ready" zegt, berekent `recognizeFace` met `describeFace` de kenmerken van dat ene gezicht en vergelijkt ze. Herkend: `greet` zet de camera uit, toont de begroeting en opent na 1,2 seconden de koelkast of het productvenster. Niet herkend na drie pogingen: `pauseAfterUnknown` toont de melding en pauzeert vijf seconden. Sinds versie 3.23 begroet `recognizeFace` alleen als de bevestiging klopt én `checkLiveness` "alive" geeft. Geeft de controle "failed" (bijvoorbeeld bij een foto), dan volgt meteen `pauseAfterUnknown`, met dezelfde melding en zonder te zeggen waarom. Mislukt het starten van de camera, dan wordt `cameraBlocked` waar en toont het startscherm alleen de pas en `Handmatig zoeken`, zonder melding in de console.

**`AdminController`** is het beheerscherm:

- `requireAdmin`: iedere beheeractie begint hiermee, ook in `CorrectionController`, `StockController` en `FormController` (formulieren openen en opslaan, verwijderen, (de)activeren, correcties, leveringen en tellingen, export en `Alle gegevens wissen`). Is er geen beheerder ingelogd, dan gebeurt er niets en verschijnt "Log eerst in als beheerder.". Zo werkt een beheeractie ook niet als een verborgen knop toch wordt ingedrukt of de methode op een andere manier wordt aangeroepen. Registreren door een medewerker zelf vraagt geen login.
- `openAdmin`, `login`, `logout`, `closeAdmin`, `showDashboard`, `switchTab` en `loadMoreAudit`: inloggen, uitloggen, het dashboard, de tabbladen en het logboek (zie Adminfuncties hieronder). De tabbladen hebben `role="tab"` en `switchTab` zet `aria-selected` op het gekozen tabblad.
- `startIdleWatch`, `noteAdminActivity` en `logoutIfIdle`: automatisch uitloggen. `startIdleWatch` start bij het opstarten een timer die iedere 10 seconden `logoutIfIdle` aanroept. `noteAdminActivity` onthoudt bij iedere muisbeweging, klik, toets, aanraking of scroll het tijdstip, maar alleen als de beheerder is ingelogd. `logoutIfIdle` sluit na 5 minuten zonder invoer de open beheerformulieren en het beheervenster en toont de melding. De klok (tijd en timer) wordt aan de constructor meegegeven, net als bij `BadgeReader`, zodat de tests met een nep-klok werken.
- `finishAdminChange`: tekent na een beheerwijziging alle beheeronderdelen opnieuw, ook de registratietabel (zodat bijvoorbeeld een nieuwe productnaam daar meteen staat), zonder nog eens apart op te slaan. De focus blijft daarbij op de knop met dezelfde id (`preserveFocus`).
- `showMissing`: knoppen en formulieren van iets dat niet meer bestaat, geven hiermee een melding in plaats van het gegeven opnieuw aan te maken.
- `exportCsv`: laat `CsvExport` het bestand maken (zie CSV-export hieronder).
- `wipeAllData`: de knop `Alle gegevens wissen`. Doet niets als er geen beheerder is ingelogd. Vraagt twee keer om bevestiging, laat het model alles wissen (`wipeAll`), slaat de nieuwe demogegevens op, vergeet de ingestelde gezichten, logt de beheerder uit en tekent alles opnieuw. Lukt het wissen van de opslag niet (`wipeAll` geeft `false`), dan blijven de gegevens staan, blijft het beheer open en verschijnt "De gegevens konden niet worden gewist. Probeer het opnieuw."
- `toggleEmployee`, `removeEmployee`, `removeProduct`, `removeCompany` en `removePoint`: de knoppen in de beheerlijsten.

**`CorrectionController`** regelt de correcties in het tabblad Registraties:

- `resetCorrectionDate`, `readCorrectionDate` en `confirmOldMonthAddition`: het datumveld bij de correctie `+`. Na het inloggen staat het op vandaag. Bij `+` wordt de datum gecontroleerd (niet in de toekomst, niet vóór 2000) en volgt bij een eerdere maand een bevestigingsvraag. `addCorrection` voegt de registratie toe met een logboekregel.
- `removeCorrection`, `removeChosenRegistration` en `closeRemoveRegistration`: de correctie `−`. `removeCorrection` opent het venster `Registratie verwijderen` (ook bij één registratie) en zet de focus op de eerste knop `Verwijderen`. `removeChosenRegistration` verwijdert de gekozen registratie met een logboekregel via `persist`, sluit het venster en tekent de lijsten en de voorraad opnieuw. Bestaat de registratie niet meer, dan volgt via `showMissing` een melding. `refreshRemoveRegistration` werkt de lijst bij na een wijziging in een ander tabblad en sluit het venster als er niets meer te kiezen is. Bij het sluiten van het beheer gaat het venster ook dicht.
- `confirmOldMonthRemoval`: vraagt bevestiging voordat een correctie met `−` een registratie uit een andere maand verwijdert.
- `renderCorrectionList`: tekent de correctielijst opnieuw en geeft de knop `+` of `−` die de focus had, die focus terug.

**`StockController`** regelt het tabblad Voorraad. `saveStockField` en `bookDelivery` controleren dat voorraad en minimum hele getallen van 0 tot en met 100.000 zijn, en een levering van 1 tot en met 100.000. `isRepeatedDeliveryTap` negeert een tweede tik op dezelfde knop `Toevoegen` binnen 800 milliseconden.

**`FormController`** regelt de vier beheerformulieren (medewerker, product, bedrijf en consumptiepunt): openen (`openEmployeeForm`, `openEditEmployeeForm` enzovoort), controleren en opslaan (`saveEmployee`, `saveProduct`, `saveCompany`, `savePoint`) en sluiten. De controles staan in `validateRequiredFields`, `validateNumberFields`, `isValidPrice`, `isDigitsOnly`, `validateBadgeField` en `validateEmployeeAssignment`. `setSaveButtons` zet de opslagknoppen van het medewerkers- en productformulier goed. Bij toevoegen staan er `Opslaan` (secundair) en `Opslaan + opnieuw` (primair), bij wijzigen alleen `Opslaan`, en die is dan primair. Bij het openen van een wijzigformulier onthoudt `rememberEditing` een kopie van het gegeven. `closeStaleForms` vergelijkt die kopie bij een wijziging in een ander tabblad en sluit het formulier als het gegeven intussen is verwijderd of gewijzigd.

**`FridgeController`** (sinds versie 3.14) is de slimme koelkast (zie 4.17). `openFridgeWindow` opent het koelkastvenster. Een scan gaat via `BadgeController.recognizeBadge` naar `fridgeScan` als het koelkastvenster bovenaan staat. `startFridgeOpening` controleert de medewerker, neemt de indeling van zijn consumptiepunt (`model.fridgeLayout`), vult in de simulatie de schappen met de voorraad (`stockSimulatedShelves`) en laat `SmartFridge` het slot openen. `takeFromShelf` en `returnToShelf` bootsen pakken en terugleggen na, en `addForeignWeight` legt in de demo iets anders op een schap. `closeFridgeDoor` laat `SmartFridge` het slot sluiten en wegen, en slaat via `persist` in één keer de opening, de registraties en één logboekregel op (`openingAudit`). `checkFridgeTimers` geeft na 60 seconden de waarschuwing bij een open deur en sluit het venster met de deur dicht na 60 seconden zonder invoer. `saveFridgeShelves` slaat in het beheer de indeling op. Sinds versie 3.17 opent `openFridgeFor` de koelkast meteen na herkenning op de beginpagina (`canOpenFridgeFor` controleert of het consumptiepunt een schapindeling heeft), en `switchFridgeToProducts` hoort bij de knop "Liever brood of beleg? Open het productvenster".

#### Slimme koelkast (`assets/js/fridge/`)

- **`SmartFridge`** weegt bij het openen ieder schap (`start`), opent het slot, en weegt bij het sluiten opnieuw (`finish`). `countShelf` rekent het verschil van één schap om naar een aantal: verschil gedeeld door het gewicht van één product, afgerond als het binnen de tolerantie valt (`SMART_FRIDGE.toleranceRatio`). Valt het erbuiten of is er iets bij gekomen, dan krijgt het schap een markering (`mismatch`, `added` of `unknown`) en wordt het niet geteld. `statusOf` geeft de status van de opening: `registered`, `nothing` of `check`. `SmartFridge.createSimulated()` maakt de koelkast van de demo.
- **`FridgeLock`** en **`ShelfScale`** zijn afspraken (interfaces): ze beschrijven alleen welke methodes een slot (`unlock`, `lock`, `cancelAutoLock`, `isLocked`) en een weegschaal (`read`) hebben.
- **`SimulatedLock`** is het nagebootste slot. Na `unlock` gaat het na 10 seconden vanzelf weer dicht als de deur niet is geopend.
- **`SimulatedShelfScale`** is de nagebootste weegschaal met een lijst van producten op het schap. Ieder product wijkt tot 2 procent af van het opgegeven gewicht.

In productie stuurt alleen de backend het echte slot en de weegschalen aan. De browser mag het echte slot nooit zelf openen. Dan worden alleen `SimulatedLock` en `SimulatedShelfScale` vervangen door classes met dezelfde methodes die de backend aanroepen (zie het TO, bijlage B).

#### `FridgeView`

Tekent het koelkastvenster (`renderFridgeWindow`, met de drie stappen deur dicht, deur open en overzicht), de statusregel (`setFridgeStatus`), de live region (`announceFridge`), de waarschuwing bij een open deur (`setDoorWarning`) en het tabblad Koelkast (`renderFridgeAdmin`). `RegistrationView` maakt deze class en geeft de methodes door, zodat de controller alleen met `RegistrationView` praat.

#### `CsvExport`

Maakt het CSV-bestand voor de loonadministratie (zie verderop).

#### `ThemeManager`

Regelt het lichte en donkere thema (zie 4.13). Onthoudt de instelling (`system`, `auto`, `light` of `dark`) in `localStorage`, bepaalt met `resolveTheme` welk thema daarbij hoort en zet dat met `apply` op de pagina. Deze class staat los van het model, de view en de controller, omdat het thema een weergave-instelling per browser is en geen gegeven van de registratie.

#### `FaceRecognitionDemo`

De uitschakelbare demo gezichtsherkenning (zie 4.15). De class laadt de bibliotheek face-api pas als iemand de demo gebruikt (`load`), uit `assets/vendor/face-api/` in het project zelf, zet de camera aan en uit (`startCamera`, `stopCamera`. Is het venster gesloten terwijl de camera startte, dan zet `startCamera` die camera meteen weer uit) en leest het grootste gezicht in beeld (`readFace`, `largestFace`). Een gezicht staat als een rij getallen (een descriptor) in het geheugen (`enroll`, `forget`, en `loadFaces` voor de opgeslagen gezichten). Sinds versie 3.17 bewaart het model de descriptor met de datum van instellen in de opslag (`faceEnrollments`, zie hoofdstuk 8). `detectCamera` kijkt zonder de camera aan te zetten of er een camera is (`hasCameraDevice`, `mayHaveCamera`). `findMatch` zoekt het ingestelde gezicht met de kleinste afstand onder de drempel uit `FACE_DEMO.matchThreshold`. De controller geeft daarbij de id's van de actieve medewerkers mee (`allowedIds`), zodat het gezicht van een inactieve of verwijderde medewerker een actieve medewerker niet kan "afschermen". `confirm` telt pas als dezelfde persoon twee keer achter elkaar is gevonden. De controller krijgt deze class mee in de constructor. Mislukt het afspelen van het camerabeeld nadat de camera al aan stond, dan zet de controller de camera uit. Of er een gezicht wordt vastgelegd, hoort bij één keer openen van het cameravenster (`captureSession`). Een vastlegging uit een gesloten venster blokkeert een opnieuw geopend venster dus niet. De camera-functie van de browser (`mediaDevices`) kan worden meegegeven, zodat de camera in de unit tests kan worden nagebootst. Sinds versie 3.21 zoekt `detectFaces` voor het startscherm alleen gezichten (rechthoeken, geen kenmerken), en maakt `describeFace` de kenmerken van precies één gezicht: alleen het stukje beeld rond dat gezicht gaat in een canvas naar de herkenning, en dat canvas wordt daarna meteen leeggemaakt. Sinds versie 3.23 houdt `describeFace` de 68 gezichtspunten van die berekening vast in `lastLandmarks`. `checkLiveness(now)` geeft ze door aan `FaceLiveness`, vergeet ze daarna en geeft "alive", "checking" of "failed" terug. `resetConfirmation` begint ook de controle op een levend gezicht opnieuw.

#### `FaceIntent`

De intentie-drempel van het automatisch scannen (sinds versie 3.21). `update(frame, now)` krijgt de rechthoeken van de gezichten in één camerabeeld en geeft een toestand terug: "none", "far" (alleen gezichten op afstand), "multiple" (meer dan één gezicht dichtbij), "outside" (het midden valt buiten het ovaal), "settling" (dichtbij in het ovaal, nog niet lang genoeg stil) of "ready". `ovalFor` rekent uit welk deel van het camerabeeld het ovaal toont (het midden, 3 bij 4), `isNear` en `isInside` controleren de grootte en de plek. De class kent geen camera en geen pagina, zodat de drempel zonder browser te testen is.

#### `FaceLiveness`

De stille controle op een levend gezicht (sinds versie 3.23, zie 4.15). `check(points, now)` krijgt de 68 gezichtspunten van één beeld en het tijdstip, en geeft "checking" (nog niets gezien), "alive" (een knipper of een vervorming gezien) of "failed" (`maxMs` voorbij zonder iets te zien). `sawBlink` vergelijkt de ooghoogte (`eyesRatio`, de eye aspect ratio van beide ogen) met de hoogste in het venster. `sawDeformation` berekent met `deformation` per beeld het best passende platte vlak (een affiene vervorming, opgelost met `solve3`) van het eerste beeld naar het huidige, en kijkt hoeveel de punten daarna nog afwijken, gedeeld door de afstand tussen de ogen (`eyeDistance`). Een foto geeft bijna 0. `measurements` geeft de gemeten waarden voor `debug`. `reset` wist alle punten. De punten staan alleen in het geheugen, hooguit `windowMs`, en worden na "alive" gewist. De class kent geen camera, geen pagina en geen face-api, zodat de controle zonder browser te testen is.

#### `BadgeReader`

Herkent een pas via een USB-NFC-lezer die zich als toetsenbord gedraagt (zie 4.16). De controller geeft iedere toets door aan `handleKey` (via `BadgeController.handleBadgeKey`), ook als er een venster open is. Dan herkent `recognizeBadge` niemand, maar de afsluitende Enter of Tab wordt wel tegengehouden. De class houdt een buffer bij van snel getypte tekens met het tijdstip van de laatste toets. Een scan is minstens `minLength` tekens, elk binnen `maxKeyIntervalMs` na het vorige (gemeten met `keyTime`: het tijdstip waarop de toets binnenkwam, `event.timeStamp`, zodat een trage tablet een scan niet als typen ziet), afgesloten met Enter of Tab, óf `endDelayMs` stilte na de laatste toets (`scheduleEnd`, `finishAfterSilence`). Komt een teken te laat, dan begint er een nieuwe buffer. Zo wordt menselijk typen nooit een scan. De Enter of Tab die een scan afsluit, wordt tegengehouden (`preventDefault` en `stopPropagation`), zodat die geen andere actie start. `normalize` haalt spaties, `:` en `-` weg en maakt alles hoofdletters. Het medewerkersformulier en `DataStore` (bij het laden) maken een pasnummer op dezelfde manier gelijk. Na een scan roept de class `onScan(code)` aan. De controller zoekt dan de medewerker op (`BadgeController.recognizeBadge`, met `RegistrationModel.findEmployeeByBadge`). `onStart` wordt aangeroepen als er een nieuwe buffer begint. De controller onthoudt dan welk veld de focus had en wat er in het zoekveld, het bedrijfsfilter en een ander tekstveld met de focus stond (`rememberSearchBeforeScan`), en zet dat na de scan terug (`restoreSearchAfterScan` en `restoreOtherFieldAfterScan`). Begon de scan in het veld `Pasnummer`, dan zet `fillBadgeFieldAfterScan` alleen het nieuwe pasnummer in dat veld. De tijd en de timers (`clock`) kunnen worden meegegeven, zodat de unit tests met een nep-klok werken.

#### `icons.js`

Bevat de SVG-iconen als lijntekeningen met dezelfde lijndikte. De functie `icon(naam)` geeft de HTML van één icoon. Elementen met `data-icon="naam"` in `index.html` krijgen bij het starten hun icoon.

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

Daarna worden de twee totalen in de statistiekkaarten geplaatst. Na middernacht roept `RegistrationApp.refreshIfNewDay` deze methode opnieuw aan, zodat de totalen bij de nieuwe dag horen.

### `registerSelectedProducts`

De methode `EmployeeController.registerSelectedProducts` wordt uitgevoerd na een klik op `Registreren` in het productvenster. Voor ieder gekozen product maakt `RegistrationModel.addRegistration` een object aan met:

- Een unieke registratie-id.
- De medewerker-id.
- De product-id.
- De huidige datum en tijd in ISO-formaat.

Daarna worden de gegevens via `persist` opgeslagen, gaat het venster dicht en maakt `resetEmployeeSearch` het zoekveld en het bedrijfsfilter leeg en tekent alle zichtbare onderdelen opnieuw. Is er niets gekozen, dan slaat de methode niets op en benadrukt `RegistrationView.emphasizeRegisterHint` de regel "Kies eerst een product met +" (geen toast). Correcties van de beheerder met de `+`-knop lopen via `CorrectionController.addCorrection` en komen ook in het logboek.

### `renderAll`

De methode `RegistrationView.renderAll` voert `populateCompanyFilter`, `renderEmployees` en `renderStats` achter elkaar uit. Zo blijven het bedrijfsfilter, de medewerkerlijst en de totalen gelijktijdig actueel.

### `renderEmployeeProducts`

De methode `RegistrationView.renderEmployeeProducts` tekent het productvenster: de begroeting (`greeting` kiest Goedemorgen, Goedemiddag of Goedenavond), het voorstel `Zelfde als vorige keer` (uit `RegistrationModel.lastSelection`, beschreven met `describeSelection`, en net als "welkom terug" alleen als `face.recognized` of `face.recognizedByBadge` waar is), de producten van het consumptiepunt met `−`- en `+`-knoppen en onderaan de link of status van de demo gezichtsherkenning.

### `showToast`

De methode `RegistrationView.showToast` toont een korte melding onderaan in het midden van het scherm, zoals `Lotte van Dijk: 2× Blikje, 1× Ei geregistreerd` met een vinkje ervoor. Foutmeldingen krijgen een waarschuwingsteken. Standaard verdwijnt een melding na 2,5 seconde. De melding na het registreren blijft 4 seconden staan, zodat een medewerker aan een gedeelde tablet kan lezen voor wie en wat er is opgeslagen. De tekst is 16 pixels. Gewone meldingen komen in `#toast` (`role="status"`), foutmeldingen in `#toastAlert` (`role="alert"`). De methode maakt de regio eerst leeg zichtbaar en zet de tekst er pas na 60 milliseconden in (`TOAST_TEXT_DELAY_MS`), want een schermlezer leest een live region alleen voor als die al bestond voordat de tekst veranderde. Zolang de regio leeg is, is hij doorzichtig (`.toast:empty`). `hideToast` haalt een melding weg als er een productvenster opengaat.

### Opslagfouten en terugdraaien

Iedere wijziging loopt via `RegistrationApp.persist`. Eerst wordt een snapshot van de vorige status gemaakt. Daarna wordt de wijziging uitgevoerd, wordt (bij een beheeractie) de logboekregel toegevoegd en probeert `DataStore.save` alles in één keer op te slaan. Als de browseropslag mislukt, wordt de vorige status teruggezet, dus zonder de wijziging én zonder de logboekregel, en krijgt de gebruiker een foutmelding: "Opslaan mislukt. Probeer het opnieuw." Is de opslag van de browser vol (`DataStore.saveProblem` is `"full"`), dan helpt opnieuw proberen niet en verschijnt (8 seconden) "De opslag van de browser is vol. Er is niets opgeslagen. Vraag de beheerder om de registraties te exporteren en oude gegevens te wissen." De app verwijdert zelf geen oude gegevens, omdat de bewaartermijn een besluit van TVB is. Zo lijkt een mislukte opslag niet toch succesvol, en staat er nooit een wijziging zonder logboekregel (of andersom).

### Adminfuncties

`openAdmin` opent de modal. Als `adminLoggedIn` waar is, wordt het dashboard opnieuw getoond, anders verschijnt het loginformulier.

De variabele `adminLoggedIn` houdt de adminstatus alleen bij zolang de huidige pagina open is. `closeAdmin` (sluiten van het venster) en `logout` (knop `Uitloggen`) zetten `adminLoggedIn` op `false` en maken het wachtwoordveld leeg. `closeAdmin` verbergt ook het dashboard in het venster. Iedere beheeractie controleert `adminLoggedIn` zelf via `requireAdmin` (zie `AdminController` hierboven).

`renderAdmin`:

- Leest de gekozen medewerkerfilter.
- Leest de gekozen maandfilter.
- Filtert de registraties.
- Toont de resultaten in de admin-tabel.

`populateFilters` vult de dropdowns met de huidige medewerkers en maanden die in registraties voorkomen.

`renderAdminEmployees` toont alle medewerkers in het beheertabblad.

### CSV-export (class `CsvExport` in `CsvExport.js`)

De export heeft geen externe bibliotheek nodig. Na een klik op `CSV exporteren` roept `AdminController.exportCsv` (alleen als een beheerder is ingelogd) de methode `CsvExport.download` aan:

1. `buildRows` verzamelt de registraties die bij de filters passen en telt ze per medewerker per loonmaand.
2. `RegistrationModel.payrollPeriod` bepaalt de loonmaand: de maand na de consumptie (december gaat naar januari van het volgende jaar).
3. `toCsv` zet de regels om naar CSV met puntkomma's. `escapeField` zet velden met speciale tekens tussen aanhalingstekens, en geeft waarden die met `=`, `+`, `-` of `@` beginnen een `'` ervoor, zodat Excel ze niet als formule uitvoert. Dat geldt ook als er eerst spaties, tabs of enters voor dat teken staan (zoals `" =1+1"`). Een waarde die met een tab, `\r` of `\n` begint, krijgt altijd een `'` ervoor, ook zonder formuleteken. Let op: ook een gewone waarde die met `-` begint, krijgt zo een `'` ervoor.
4. `fileName` maakt de bestandsnaam met de loonmaand.
5. Het bestand wordt gedownload als `.csv` (UTF-8 met BOM, zodat Excel letters zoals `é` goed toont).

Zijn er geen registraties voor de filters, dan geeft `download` `false` terug en toont de controller een melding.

### Event listeners

De event listeners koppelen gebruikersacties aan functies:

De listeners worden in `RegistrationApp` per onderwerp gekoppeld:

| Methode | Wat er wordt gekoppeld |
|---|---|
| `registerPageEvents` | De algemene kliklistener (`handleClick`), het sluiten van het productvenster en het cameravenster, de knoppen `Herken mij met de camera (demo)` en `Gezicht vastleggen`, en het toestemmingsvinkje |
| `registerAdminEvents` | `Admin login`, het sluiten van het admin-venster (dat ook uitlogt), inloggen, uitloggen, de tabbladen, `Meer laden`, `CSV exporteren` en `Alle gegevens wissen`, en de listeners voor muis, toets, aanraking en scroll die het automatisch uitloggen uitstellen |
| `registerFilterEvents` | De zoekbalk, het bedrijfsfilter, de filters `Medewerker` en `Maand` en de zoekvelden in het beheer |
| `registerFormEvents` | Openen, opslaan en sluiten van de formulieren voor medewerker, product, bedrijf en consumptiepunt, en het weghalen van een foutmelding zodra een veld wordt aangepast |
| `registerStockEvents` | De keuze van het consumptiepunt en het aanpassen van voorraad of minimum |
| `registerStandbyEvents` | De knop `Handmatig zoeken`, de tik op het ovaal (`scanMode` "tap"), het tegenhouden van een klik-door, `visibilitychange` (de camera uit in een verborgen tabblad) en de listeners die bijhouden wanneer de tablet het laatst is gebruikt |
| `registerKeyboardEvents` | Escape sluit het bovenste venster (`topModal`), Tab blijft binnen een open venster (`keepFocusInModal`), `Ctrl/Cmd + K` voor de zoekbalk (alleen zonder open venster), en Enter of spatie op een medewerkerrij |

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
| `products` | Per product-id: `offered` (aangeboden ja/nee), `stock` (voorraad), `minimum` en, als er is geteld, `countedAt` (tijdstip van de laatste telling) |

### Medewerkers

| Veld | Betekenis |
|---|---|
| `id` | Unieke identificatie |
| `name`, `firstName`, `lastName` | Naam |
| `payrollCode`, `personnelNumber` | Looncode en personeelsnummer |
| `employerNumber` | Optioneel afwijkend werkgevernummer. Leeg = dat van het bedrijf (`RegistrationModel.employerNumberFor`) |
| `companyId` | Verwijzing naar het bedrijf |
| `pointId` | Verwijzing naar het vaste consumptiepunt |
| `active` | Actief of inactief |
| `color` | Kleur van de avatar |
| `badgeId` | Pasnummer van de NFC-pas, genormaliseerd (alleen `A-Z` en `0-9`, hooguit 64 tekens). `""` = geen pas. Uniek per medewerker. Staat niet in de CSV-export en niet in het logboek |

### Registraties

| Veld | Betekenis |
|---|---|
| `id` | Unieke identificatie |
| `employeeId` | Verwijzing naar een medewerker |
| `productId` | Verwijzing naar een product |
| `price` | Prijs op het moment van registreren (voor de CSV-export) |
| `employerNumber` | Werkgevernummer op het moment van registreren (voor de CSV-export, zie `RegistrationModel.registrationEmployerNumber`). Ontbreekt als er toen nog geen nummer was. Dan gebruikt de export het huidige nummer |
| `pointId` | Consumptiepunt waar de voorraad van af ging. Bij een correctie gaat het product hier weer naartoe terug. Leeg (`null`) als het punt het product niet aanbiedt en er dus geen voorraad af ging |
| `correction` | Alleen aanwezig (`true`) als de beheerder de registratie met `+` heeft toegevoegd |
| `source` en `openingId` | Alleen aanwezig bij een registratie van de slimme koelkast: `source` is dan `"fridge"` en `openingId` de opening waarbij het product is gepakt |
| `createdAt` | Datum en tijd van registratie. Bij een correctie `+` met een eerdere datum is dat 12:00 uur op die dag |

Oude gegevens uit een eerdere versie worden bij het laden automatisch omgezet (`DataStore.migrateCompanies`): de vrij ingevulde bedrijfsnaam wordt een bedrijf, het eerste werkgevernummer wordt de standaard van dat bedrijf (een afwijkend nummer blijft bij de medewerker staan) en ieder bedrijf met medewerkers krijgt één consumptiepunt met alle producten.

Het aantal is in de demo altijd `1`, omdat iedere klik één registratie maakt. Dit sluit aan bij het voorgestelde datamodel waarin `Aantal` standaard 1 is.

Een medewerker met registraties kan niet definitief worden verwijderd (alleen gedeactiveerd), zodat de export altijd een naam en looncode heeft. Ontbreekt een medewerker toch (bijvoorbeeld in oude gegevens), dan wordt bij die registraties `Verwijderd` getoond.

Voor de CSV-export wordt de prijs gebruikt die bij iedere registratie is bewaard (`price`). Oude registraties zonder prijs gebruiken de huidige prijs uit het productbeheer. Het bestand bevat per medewerker per loonmaand het aantal en de totale prijs. Deze gegevens zijn alleen zichtbaar voor de beheerder.

### Slimme koelkast

| Lijst | Inhoud |
|---|---|
| `fridgeShelves` | De indeling die de beheerder heeft opgeslagen: per consumptiepunt en schap (`shelf`) het product (`productId`, `null` bij een leeg schap) en het gewicht van één stuk in gram (`unitWeight`). Zonder eigen indeling geldt `SMART_FRIDGE.defaultShelves` uit `config.js` |
| `fridgeOpenings` | Iedere afgeronde opening: de medewerker, het consumptiepunt, `openedAt` en `closedAt`, de status (`registered`, `nothing` of `check`), of de deur te lang open stond (`longOpen`) en per schap het gewicht voor en na (`before`, `after`), het berekende aantal (`count`) en een eventuele markering (`flag`). Geen beelden of andere gegevens |

Gegevens van vóór versie 3.14 hebben deze lijsten niet. Ze krijgen bij het laden twee lege lijsten, zonder melding. `Alle gegevens wissen` wist ze mee.

### Demo gezichtsherkenning

| Lijst | Inhoud |
|---|---|
| `faceEnrollments` | Per actieve medewerker de kenmerken van zijn gezicht (`descriptor`, precies 128 getallen tussen -10 en 10, geen foto), de datum van instellen (`enrolledAt`) en sinds versie 3.22 het moment van toestemming (`consentAt`, gelijk aan `enrolledAt`, niet erna, oudere gegevens krijgen bij het laden `enrolledAt`). Verloopt na 365 dagen (`FACE_DEMO.validityDays`). Wordt gewist bij `Uitzetten`, verlopen, (de)activeren, verwijderen en `Alle gegevens wissen` |
| `faceOffers` | Per medewerker het antwoord op de vraag na een passcan: `declined` (Nee gezegd) of `expired` (de instelling is verlopen), met `answeredAt` |

Deze lijsten zijn er sinds versie 3.17. Oudere gegevens krijgen twee lege lijsten, zonder melding. Bij het laden controleert `DataStore` ieder getal en slaat het een regel met een andere lengte, tekst, een extra veld of een datum in de toekomst over. De kenmerken komen niet in de CSV-export en niet in het logboek. De gezichtspunten van de controle op een levend gezicht (sinds versie 3.23) worden nergens opgeslagen: ze staan hooguit 3 seconden in het geheugen.

## 9. Belangrijke demo-beperkingen

Deze versie is bedoeld als prototype:

- `localStorage` is niet gedeeld tussen gebruikers of apparaten. Tussen tabbladen in dezelfde browser wel: slaat het ene tabblad iets op, dan laadt het andere tabblad de nieuwe gegevens in. Slaat het andere tabblad op voordat het die gegevens heeft geladen, dan schrijft het er niet overheen maar laadt het eerst de nieuwe gegevens en voert het de wijziging opnieuw uit (`DataStore.save` en `RegistrationApp.persist`).
- Zijn de opgeslagen gegevens beschadigd, dan worden losse kapotte regels overgeslagen (of start de demo opnieuw als alles onleesbaar is). De oorspronkelijke gegevens staan dan als reservekopie in `localStorage` (`tvb-blikjesregistratie-backup`, en bij een volgende keer `tvb-blikjesregistratie-backup-laatste`), en de gebruiker krijgt een melding.
- Er is geen echte database. De opslag van de browser (`localStorage`) heeft per website een grens van ongeveer 5 MB, en de reservekopieën tellen mee. Dat is genoeg voor naar schatting 20.000 registraties. Is de opslag vol, dan meldt de app "De opslag van de browser is vol. Er is niets opgeslagen. Vraag de beheerder om de registraties te exporteren en oude gegevens te wissen." De app verwijdert zelf geen oude gegevens.
- Excel laat voorloopnullen in looncode, personeelsnummer en werkgevernummer weg als je het CSV-bestand met een dubbelklik opent (`0012` wordt `12`). Lees het bestand rechtstreeks in het loonsysteem in of importeer de kolommen in Excel als tekst (zie 4.12).
- De login heeft geen echte beveiliging: elk ingevuld wachtwoord werkt. De beheeracties controleren wel zelf of er iemand is ingelogd, maar dat is een controle in de browser die met de ontwikkelaarstools te omzeilen is.
- Iedereen bij de tablet kan op de naam van een collega tikken en op diens naam registreren. Een eigen gezicht instellen in het productvenster van een collega kan sinds versie 3.22 niet meer (alleen na de pas of via de beheerder). Iedere registratie staat wel met datum en tijd in het beheer en de beheerder kan die corrigeren. In productie is een pas, QR-code of pincode nodig, en een overzicht waarin een medewerker zijn eigen registraties ziet.
- Alle gegevens staan als gewone tekst in `localStorage` van de tablet. Wie het apparaat en de ontwikkelaarstools van de browser gebruikt, kan ze lezen en aanpassen, en kan via de console ook de code van de pagina uitvoeren.
- Er zijn geen gebruikersrollen of wachtwoordbeheer.
- Verwijderde medewerkers krijgen geen herstelmogelijkheid, en `Alle gegevens wissen` kan niet ongedaan worden gemaakt.
- Er is geen server-side auditlog. Het logboek staat alleen in de browser.
- De namen van alle actieve medewerkers staan op de beginpagina, omdat je je eigen naam moet kunnen kiezen. Aantallen, bedragen en eerdere keuzes staan er niet.
- Een CSV-bestand komt in de downloadmap van de computer van de beheerder en valt daarmee buiten de app. Stuur het beveiligd naar de loonadministratie en verwijder het na het inlezen.
- De demo vertrouwt op een beveiligde tablet: kioskmodus, schermvergrendeling en versleuteling van het apparaat zijn nodig.
- Voor productie zijn ook AVG-maatregelen nodig, zoals een grondslag per verwerking, bewaartermijnen, een privacyverklaring, een DPIA en instemming van de ondernemingsraad. Zie het TO, hoofdstuk 13, paragraaf AVG-verantwoording (productie).
- Bescherming tegen inbedden in een frame (`frame-ancestors` of `X-Frame-Options`) kan alleen met een HTTP-header van de webserver en zit dus niet in de demo.
- De gezichtsherkenning is alleen een demo. Sinds versie 3.17 blijven de kenmerken van ingestelde gezichten een jaar op de tablet bewaard (onversleuteld in `localStorage`), om "jaarlijks opnieuw instellen" te laten zien. Sinds versie 3.21 kijkt de camera met `scanMode` "auto" de hele tijd zolang het startscherm in beeld is en ziet hij ook voorbijgangers. Hij zoekt dan alleen naar gezichten, en berekent pas kenmerken boven de intentie-drempel. Met `scanMode` "tap" gaat de camera alleen aan na een tik. Voor productie is het advies de pas (TO, bijlage B). De drempels zijn alleen nagebootst getest en nog niet afgesteld op de echte tablet en de plek bij de koelkast. Sinds versie 3.23 is er een stille controle op een levend gezicht die een geprinte of stilstaande foto tegenhoudt, maar geen video op een telefoon. De drempels daarvan zijn ook nog niet op de tablet afgesteld. Hoe vaak de verkeerde persoon wordt herkend, is niet gemeten. Bij het laden toont de console één onschadelijke CSP-melding over `wasm-eval`, omdat de bibliotheek test of WebAssembly werkt. De bibliotheek face-api wordt niet meer onderhouden (de repository is gearchiveerd) en krijgt dus geen beveiligingsupdates. Ze staat met een vaste versie en controlegetallen in het project en is alleen voor de demo bedoeld. Zie het TO (hoofdstuk 13) voor de privacyregels en de beveiliging.
- Herkennen met de pas is gemak, geen bewijs van identiteit: het nummer van een pas is niet geheim en kan worden gekopieerd. TVB heeft geen centraal systeem met pasnummers (navraag 29 oktober 2026): de passen worden nu bij de printers gebruikt, waar medewerkers ze zelf toevoegen. TVB onderzoekt een centraal systeem voor de passen met opslag van de serienummers. Komt dat er, dan haalt de backend het pasnummer daaruit. Tot dan wordt de koppeling eenmalig gevuld met de serienummers (als die te krijgen zijn) of door de medewerker zelf met een code per e-mail. Zie het TO, "Herkomst van het pasnummer".
- De slimme koelkast is een simulatie. Er is geen echt slot en geen echte weegschaal. De browser opent het nagebootste slot zelf en rekent zelf om. In productie mag alleen de backend het slot openen. De tolerantie en de gewichten per stuk zijn schattingen, en in het vak "Demo zonder pasjeslezer" kan iedere actieve medewerker worden gekozen.

Voor productie is een backend met een gedeelde database, echte authenticatie, autorisatie, back-ups en auditlogging nodig. Het TO (hoofdstuk 13) bevat de volledige lijst van wat vóór productie moet gebeuren.

## 10. Code uitleggen tijdens een presentatie

De applicatie volgt het principe van separation of concerns:

1. `DataStore` weet hoe gegevens worden opgeslagen.
2. `RegistrationModel` weet welke gegevens en bedrijfsregels gelden.
3. `RegistrationView` weet hoe gegevens in HTML worden getoond.
4. `RegistrationApp` weet welke actie bij een klik of formulier hoort. De kleinere onderdelen van de controller (zoals `AdminController`, `FormController` en `FaceController`) voeren die actie uit, ieder voor een eigen deel van het scherm.
5. `CsvExport` weet hoe het CSV-bestand voor de loonadministratie eruitziet.
6. `ThemeManager` weet welk thema (licht of donker) actief moet zijn.
7. `FaceRecognitionDemo` weet hoe de camera en de demo gezichtsherkenning werken.
8. `BadgeReader` weet wanneer snel getypte tekens een scan van de pasjeslezer zijn.
9. `SmartFridge` weet hoe een gewichtsverschil per schap wordt omgerekend naar een aantal producten. Het slot en de weegschalen zitten achter de interfaces `FridgeLock` en `ShelfScale`, zodat de nagebootste versies later door echte (via de backend) kunnen worden vervangen.

De schermen zelf staan als screenshots in het TO, hoofdstuk 9, paragraaf Wireframes (`docs/wireframes/`). Die zijn handig om tijdens een presentatie te laten zien welke code bij welk scherm hoort.

De HTML bevat de componenten en vaste ankerpunten met `id`-waarden. De CSS bepaalt uitsluitend de presentatie. JavaScript koppelt de componenten aan gedrag. Daardoor kan bijvoorbeeld de opslag worden vervangen door een database zonder de volledige gebruikersinterface opnieuw te bouwen.

## 11. Mogelijke vervolgstappen

1. Kies een backend, bijvoorbeeld PHP, Node.js of een beheerde dienst.
2. Maak de tabellen uit `docs/DATABASE-SCHEMA.sql` aan (onder andere medewerkers, registraties, producten, bedrijven, consumptiepunten en het logboek). `point_products.counted_at` bewaart het tijdstip van de laatste telling (zoals `countedAt` in de demo), en een beheerder heeft de rol `admin` (beheerder) of `system_admin` (systeembeheerder).
3. Vervang `localStorage` door API-aanroepen. Alleen `DataStore` hoeft daarvoor te veranderen.
4. Voeg echte admin-authenticatie toe.
5. Bewaar het logboek op de server in plaats van in de browser.
6. Voeg naast het maandfilter ook jaar- en periodefilters toe.
7. Voeg databaseback-ups en foutlogging toe.
8. Test met meerdere gebruikers tegelijk.
