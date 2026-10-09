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
 *   - FaceRecognitionDemo en RegistrationApp: FACE_DEMO, de instellingen van de demo;
 *   - BadgeReader: BADGE_READER, de instellingen voor herkennen met de pas (NFC-lezer).
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
