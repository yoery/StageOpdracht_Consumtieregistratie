/**
 * config.js — vaste waarden van de applicatie.
 *
 * Dit bestand bevat alleen gegevens en geen gedrag, daarom is het geen class.
 * Door de waarden hier centraal te zetten, hoeven ze maar op één plek te worden aangepast.
 *
 * Gebruikt door:
 *   - main.js: STORAGE_KEY (de naam van de opslag in de browser);
 *   - DataStore: standaardproducten, bedrijven en kleuren bij het omzetten van oude gegevens;
 *   - RegistrationModel: de producten, bedrijven, kleuren en voorbeeldmedewerkers;
 *   - ThemeManager: DAYLIGHT_HOURS, voor de thema-instelling "Auto";
 *   - FaceRecognitionDemo en FaceController: FACE_DEMO, de instellingen van de demo;
 *   - BadgeReader: BADGE_READER, de instellingen voor herkennen met de pas (NFC-lezer);
 *   - AdminController: ADMIN_IDLE_LOGOUT_MS, na hoeveel tijd zonder invoer de beheerder wordt uitgelogd;
 *   - EmployeeController en RegistrationModel: MAX_PER_PRODUCT, hoe vaak één product in één keer kan worden gekozen;
 *   - DataStore: BACKUP_RETENTION_DAYS, hoe lang een reservekopie bewaard blijft;
 *   - EmployeeController: EMPLOYEE_IDLE_CLOSE_MS en EMPLOYEE_IDLE_WARNING_MS, na hoeveel tijd zonder
 *     invoer het productvenster vanzelf sluit en wanneer de waarschuwing daarvoor verschijnt;
 *   - StandbyController: STANDBY, wanneer het startscherm (weer) verschijnt;
 *   - AutoScanController en FaceIntent: FACE_DEMO.scanMode en FACE_DEMO.autoScan, het automatisch
 *     scannen op het startscherm met de intentie-drempel;
 *   - DataStore en RegistrationModel: FACE_DEMO.validityDays (verlopen van een gezichtsinstelling);
 *   - FaceLiveness: FACE_DEMO.liveness, de stille controle op een levend gezicht.
 */

// Naam waaronder alle gegevens in localStorage worden bewaard.
export const STORAGE_KEY = "tvb-blikjesregistratie";

// Achtergrondkleuren voor de avatars van medewerkers; ze worden om de beurt gebruikt.
export const COLORS = [
  "#d8f1e8",
  "#e3eef6",
  "#f8e9d9",
  "#e9e0f4",
  "#e4f0d8"
];

// Voorbeeldmedewerkers voor de demo (alleen gebruikt als er nog niets is opgeslagen).
export const SEED_EMPLOYEES = [
  "Lotte van Dijk",
  "Mark Jansen",
  "Sophie de Boer",
  "Daan Smit",
  "Nora Visser",
  "Bram Bakker",
  "Eva Meijer",
  "Tom de Groot"
];

// De bedrijven binnen TVB. De eerste (TVB) krijgt in de demo een voorbeeld-consumptiepunt.
export const DEFAULT_COMPANIES = [
  "TVB",
  "E-Control",
  "Home Service Nederland",
  "IT Supervision",
  "Klik",
  "MVIE",
  "STB",
  "Technisch Beheer Nederland",
  "Terberg Totaal Installaties",
  "Titanium 24",
  "Van den Broek Loodgietersbedrijf",
  "VR Bedrijven",
  "TVB Academy"
];

// Ongeveer het moment van zonsopkomst en zonsondergang in Nederland, halverwege iedere maand
// (lokale tijd, inclusief zomertijd). De thema-instelling "Auto" is licht tussen zonsopkomst
// en zonsondergang, en donker daarbuiten. Index 0 = januari, 11 = december.
export const DAYLIGHT_HOURS = [
  { sunrise: "08:45", sunset: "16:50" }, // januari
  { sunrise: "08:05", sunset: "17:45" }, // februari
  { sunrise: "07:05", sunset: "18:35" }, // maart
  { sunrise: "06:55", sunset: "20:25" }, // april
  { sunrise: "05:55", sunset: "21:15" }, // mei
  { sunrise: "05:20", sunset: "21:55" }, // juni
  { sunrise: "05:40", sunset: "21:50" }, // juli
  { sunrise: "06:30", sunset: "21:00" }, // augustus
  { sunrise: "07:20", sunset: "19:55" }, // september
  { sunrise: "08:10", sunset: "18:45" }, // oktober
  { sunrise: "07:55", sunset: "17:00" }, // november
  { sunrise: "08:40", sunset: "16:30" } // december
];

// Demo gezichtsherkenning (zie FaceRecognitionDemo.js).
// Zet enabled op false om de demo volledig uit te schakelen; de knoppen verdwijnen dan.
// De bibliotheek en modellen worden pas geladen als iemand de demo gebruikt.
// Bibliotheek en modellen (@vladmandic/face-api 1.7.15, MIT-licentie, met daarin TensorFlow.js
// onder de Apache-licentie 2.0) staan zelf in assets/vendor/face-api/, zodat er tijdens gebruik
// geen code of gegevens van een externe server komen. face-api wordt niet meer onderhouden (de
// repository is gearchiveerd); daarom is het alleen voor de demo bedoeld (zie de README in die map).
// Alleen de modellen voor tiny_face_detector, face_landmark_68_tiny en face_recognition zijn meegenomen.
// De paden worden met import.meta.url omgezet naar volledige adressen. Dat is nodig omdat
// import() een pad relatief aan het modulebestand oplost, maar loadFromUri() relatief aan de pagina.
// Een volledig adres werkt voor allebei, ongeacht in welke map de pagina staat.
export const FACE_DEMO = {
  enabled: true,
  libraryUrl: new URL("../vendor/face-api/face-api.esm.js", import.meta.url).href,
  modelUrl: new URL("../vendor/face-api/", import.meta.url).href,
  // Hoe sterk twee gezichten moeten lijken om als dezelfde persoon te tellen (lager = strenger).
  matchThreshold: 0.5,
  // Hoe lang er maximaal naar een bekend gezicht wordt gezocht, in milliseconden.
  scanTimeoutMs: 20000,
  // Hoe de camera op het startscherm begint (zie StandbyController en AutoScanController, en TO bijlage B):
  //   - "auto" (standaard, de wens van de opdrachtgever sinds versie 3.21): zolang het startscherm in
  //     beeld is, staat de camera aan en kijkt hij of er iemand dichtbij in het ovaal staat. Wie stil in
  //     het ovaal kijkt, wordt zonder tik herkend. Kenmerken worden alleen berekend boven de
  //     intentie-drempel (zie autoScan hieronder);
  //   - "tap": de camera staat uit tot iemand op het ovaal tikt. Daarna kijkt hij hooguit wakeScanMs
  //     in het venster "Even kijken wie je bent" (tik om te scannen, zoals in versie 3.17 tot en met 3.20).
  scanMode: "auto",
  // Hoe lang de korte scan na een tik op het ovaal duurt (scanMode "tap"), in milliseconden. Daarna
  // gaat de camera altijd uit, herkend of niet.
  wakeScanMs: 10000,
  // Het automatisch scannen op het startscherm (scanMode "auto", zie AutoScanController en FaceIntent).
  // De camera staat alleen aan zolang het startscherm in beeld is, in een lage resolutie, en zoekt een
  // paar keer per seconde alleen naar gezichten (waar en hoe groot), zonder kenmerken. De kenmerken (de
  // descriptor van 128 getallen) worden pas berekend als er precies één gezicht dichtbij is, het midden
  // ervan binnen het ovaal valt en het ongeveer een seconde stil staat: de intentie-drempel. Een gezicht
  // op afstand of buiten het ovaal krijgt nooit kenmerken. Er worden geen beelden bewaard of verstuurd.
  //   - detectIntervalMs: zo vaak (ms) zoekt de camera naar een gezicht (333 = 3 keer per seconde);
  //   - minFaceWidth: zo breed moet een gezicht minstens zijn, als deel van de breedte van het ovaal
  //     (0.45 = 45 procent). Smaller betekent te ver weg: dat gezicht telt niet;
  //   - stillMs: zo lang (ms) moet het gezicht stil in het ovaal staan voordat de kenmerken worden berekend;
  //   - maxMovement: zo veel mag het midden van het gezicht verschuiven, als deel van de breedte van het
  //     ovaal (0.12 = 12 procent), en toch als stil tellen;
  //   - attempts: zo vaak wordt een gezicht vergeleken voordat "Je bent niet herkend." verschijnt;
  //   - retryPauseMs: zo lang (ms) wacht de camera na "Je bent niet herkend." voordat hij het opnieuw probeert;
  //   - greetingMs: zo lang (ms) staat de begroeting in het ovaal voordat het productvenster opent;
  //   - videoWidth en videoHeight: de gevraagde resolutie van de camera in pixels (laag, zodat de tablet
  //     niet warm wordt).
  autoScan: {
    detectIntervalMs: 333,
    minFaceWidth: 0.45,
    stillMs: 1000,
    maxMovement: 0.12,
    attempts: 3,
    retryPauseMs: 5000,
    greetingMs: 1200,
    videoWidth: 320,
    videoHeight: 240
  },
  // De stille controle op een levend gezicht (zie FaceLiveness, sinds versie 3.23). Een foto van een
  // collega mag niet als die collega worden herkend. Tijdens het herkennen kijkt de demo, zonder opdracht
  // aan de medewerker, of het gezicht knippert of licht vervormt (een foto beweegt altijd als één plat
  // geheel). Pas dan telt de herkenning: bij het automatisch scannen, bij de scan na een tik, bij
  // "Herken mij" en bij het instellen. Dit houdt een geprinte of stilstaande foto tegen, geen video.
  //   - enabled: zet op false om de controle uit te zetten (niet aan te raden);
  //   - windowMs: over zo veel milliseconden aan beelden wordt gekeken;
  //   - maxMs: zo lang (ms) mag de controle duren. Daarna telt het als niet herkend;
  //   - blinkRatio: een knipper telt als de ooghoogte onder dit deel van de gewone ooghoogte zakt (0.6);
  //   - minDeformation: zo veel moet het gezicht afwijken van een plat vlak, als deel van de afstand
  //     tussen de ogen (0.03 = 3 procent, ongeveer wat een hoofd geeft dat 7 graden draait). Te hoog en
  //     echte mensen worden niet herkend, te laag en de ruis van de camera laat ook een foto door. Stel
  //     dit af op de tablet met debug (zie TO bijlage B, proefplan);
  //   - minFrames: in zo veel beelden moet die afwijking worden gezien;
  //   - debug: zet op true om per beeld de gemeten waarden in de console te zien (voor het afstellen
  //     op de tablet, zie TO bijlage B).
  liveness: {
    enabled: true,
    windowMs: 3000,
    maxMs: 5000,
    blinkRatio: 0.6,
    minDeformation: 0.03,
    minFrames: 2,
    debug: false
  },
  // Na zo veel dagen verloopt een gezichtsinstelling: de kenmerken worden gewist en bij de volgende
  // passcan komt de vraag "Je gezichtsherkenning is verlopen. Opnieuw instellen?" (mensen veranderen).
  validityDays: 365,
  // Vraag na een passcan "Gezichtsherkenning nog niet ingesteld. Wil je dit?" aan medewerkers zonder
  // (geldige) gezichtsinstelling die nog niet "Nee" hebben gezegd. Alleen als de demo aan staat en de
  // tablet een camera heeft. Zet op false om de vraag nooit te stellen.
  offerAfterBadge: true,
  // Zo lang (ms) blijft de vraag in beeld als niemand antwoordt. Daarna sluit hij zonder iets te
  // onthouden, zodat hij niet open blijft staan op de gedeelde tablet.
  offerIdleCloseMs: 60 * 1000
};

// Het startscherm van de tablet (zie StandbyController, sinds versie 3.21 in plaats van het gedimde
// standby-scherm). Het startscherm is zwart, met het TVB-logo, een ovaal voor het gezicht en de knop
// "Handmatig zoeken". Het verschijnt bij het openen van de website, na afloop van een registratie, en als
// de beginpagina zo lang niet is gebruikt (geen tik, toets, scroll of passcan, en geen venster open).
// Er zijn drie manieren om te beginnen: de pas (werkt altijd, ook op het startscherm), het gezicht (zie
// FACE_DEMO.scanMode) en "Handmatig zoeken" (de lijst met medewerkers). Zet enabled op false om het
// startscherm uit te zetten: de website opent dan op de lijst met medewerkers, gaat niet meer vanzelf
// terug naar het startscherm en de camera gaat nooit vanzelf aan.
//   - idleMs: na zo veel milliseconden zonder invoer komt het startscherm terug (2 minuten).
export const STANDBY = {
  enabled: true,
  idleMs: 2 * 60 * 1000
};

// Herkennen met de pas (zie BadgeReader.js). Een USB-NFC-lezer gedraagt zich als een toetsenbord:
// bij het aanbieden van een pas "typt" hij razendsnel het pasnummer, meestal gevolgd door Enter.
// Zet enabled op false om het herkennen met de pas helemaal uit te zetten.
//   - minLength: zo veel tekens moet een pasnummer minstens hebben;
//   - maxKeyIntervalMs: hoogstens zo veel milliseconden tussen twee tekens. Een lezer typt binnen
//     een paar milliseconden, een mens doet er meestal meer dan 100 over;
//   - endDelayMs: zo lang stilte na de laatste toets telt als einde van de scan, voor lezers
//     die geen Enter of Tab sturen.
export const BADGE_READER = {
  enabled: true,
  minLength: 4,
  maxKeyIntervalMs: 40,
  endDelayMs: 120
};

// Automatisch uitloggen van de beheerder (zie AdminController.logoutIfIdle). Wordt het beheer zo
// lang niet gebruikt (geen muis, toets, aanraking of scroll), dan logt de app de beheerder uit en
// sluit het beheervenster. Op een gedeelde tablet blijft het beheer zo niet open staan als de
// beheerder wegloopt zonder uit te loggen. In milliseconden: 5 minuten.
export const ADMIN_IDLE_LOGOUT_MS = 5 * 60 * 1000;

// Automatisch sluiten van het productvenster (zie EmployeeController.closeProductWindowIfIdle).
// Wordt het productvenster zo lang niet gebruikt (geen tik, klik, toets of scroll in het venster),
// dan gaat het dicht zonder iets op te slaan. Daarna zijn het zoekveld en het bedrijfsfilter weer
// leeg. Zo blijft op de gedeelde tablet niet het venster van een collega open staan, waarin de
// volgende gebruiker per ongeluk op naam van die collega registreert. Dit geldt ook voor een venster
// dat na herkenning met de pas of de camera is geopend. In milliseconden: 75 seconden.
export const EMPLOYEE_IDLE_CLOSE_MS = 75 * 1000;

// Zo lang vóór het automatisch sluiten verschijnt in het productvenster de regel
// "Venster sluit zo. Tik om door te gaan." Iedere tik of toets begint de tijd opnieuw.
// In milliseconden: de laatste 10 seconden.
export const EMPLOYEE_IDLE_WARNING_MS = 10 * 1000;

// Hoe vaak een medewerker één product in het productvenster in één keer kan kiezen (sinds versie 3.26,
// pentest PT-03). Zonder grens kon iemand met een ingedrukte Enter honderden producten op naam van een
// collega zetten en de opslag laten vollopen. Wie meer nodig heeft, registreert twee keer.
export const MAX_PER_PRODUCT = 10;

// Hoe lang een reservekopie van beschadigde gegevens bewaard blijft (sinds versie 3.26, pentest PT-02).
// Daarna wist DataStore de kopie, bij het laden of bij de dagwissel. Een leesbare reservekopie bevat geen
// gezichtskenmerken. Onleesbare tekst wordt letterlijk bewaard (ook als er nog kenmerken in staan) en verdwijnt
// net als iedere kopie na deze termijn.
// In dagen: 30.
export const BACKUP_RETENTION_DAYS = 30;

// Standaardproducten met prijs in euro's. De id's worden gebruikt in registraties en voorraad.
export const DEFAULT_PRODUCTS = [
  { id: "blikje", name: "Blikje", price: 0.65 },
  { id: "sneetje-brood", name: "Sneetje brood", price: 0.10 },
  { id: "boter", name: "Boter", price: 0.10 },
  { id: "zoet-beleg", name: "Zoet beleg", price: 0.20 },
  { id: "glas-melk", name: "Glas melk", price: 0.20 },
  { id: "beleg", name: "Beleg", price: 0.50 },
  { id: "ei", name: "Ei", price: 0.50 },
  { id: "yoghurt", name: "Yoghurt", price: 0.50 }
];
