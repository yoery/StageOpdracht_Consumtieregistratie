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
 *   - EmployeeController: EMPLOYEE_IDLE_CLOSE_MS en EMPLOYEE_IDLE_WARNING_MS, na hoeveel tijd zonder
 *     invoer het productvenster vanzelf sluit en wanneer de waarschuwing daarvoor verschijnt;
 *   - SmartFridge, FridgeController en RegistrationModel: SMART_FRIDGE, de instellingen van de
 *     simulatie van de slimme koelkast (slot en weegschalen per schap).
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
  scanTimeoutMs: 20000
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

// Slimme koelkast (demo), zie SmartFridge.js en TO bijlage B (optie C: een slot en weegschalen per
// schap, met de pas als sleutel). De demo simuleert het slot en de weegschalen in de browser. In
// productie stuurt alleen de backend het echte slot en de weegschalen aan. Zet enabled op false om de
// simulatie helemaal uit te zetten: de knop op de beginpagina en het tabblad Koelkast verdwijnen dan.
//   - shelfCount: het aantal schappen. Op ieder schap ligt één soort product;
//   - defaultShelves: de indeling zolang de beheerder voor een consumptiepunt nog niets heeft ingesteld
//     (schap 1, 2, 3, ...). unitWeight is het gewicht van één product in grammen. Een product dat het
//     consumptiepunt niet aanbiedt, telt als leeg schap;
//   - toleranceRatio: hoeveel het gewichtsverschil van een heel aantal producten mag afwijken, als
//     deel van het gewicht van één product (0.15 = 15 procent, bij een blikje van 350 gram 52 gram);
//   - emptyShelfToleranceGrams: zo veel gram mag een leeg schap verschillen voordat het opvalt;
//   - weightVariation: alleen voor de simulatie. Ieder product wijkt tot zo veel (0.02 = 2 procent)
//     af van het opgegeven gewicht, zoals echte blikjes ook niet allemaal even zwaar zijn;
//   - foreignWeightGrams: alleen voor de simulatie. Zo veel gram legt de demoknop "Iets anders op
//     het schap leggen" op schap 1, om een onverklaarbaar verschil te laten zien;
//   - autoLockMs: het slot gaat weer dicht als de deur niet binnen deze tijd wordt geopend;
//   - doorWarningMs: staat de deur langer open, dan verschijnt "De deur staat al lang open.";
//   - doorAlertMs: staat de deur langer open, dan krijgt de opening de status "Controle nodig";
//   - idleCloseMs: het koelkastvenster sluit vanzelf als het zo lang niet wordt gebruikt terwijl de
//     deur dicht is (wachten op een pas of het overzicht na sluiten);
//   - maxUnitWeight: het hoogste gewicht van één product dat de beheerder kan invullen (grammen);
//   - recentOpenings: zo veel openingen staan in het beheer bij "Laatste openingen".
export const SMART_FRIDGE = {
  enabled: true,
  shelfCount: 3,
  defaultShelves: [
    { productId: "blikje", unitWeight: 350 },
    { productId: "yoghurt", unitWeight: 150 },
    { productId: "ei", unitWeight: 60 }
  ],
  toleranceRatio: 0.15,
  emptyShelfToleranceGrams: 25,
  weightVariation: 0.02,
  foreignWeightGrams: 120,
  autoLockMs: 10 * 1000,
  doorWarningMs: 60 * 1000,
  doorAlertMs: 5 * 60 * 1000,
  idleCloseMs: 60 * 1000,
  maxUnitWeight: 5000,
  recentOpenings: 10
};

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
