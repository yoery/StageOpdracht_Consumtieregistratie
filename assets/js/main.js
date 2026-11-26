/**
 * main.js — startpunt van de applicatie (wordt geladen door index.html).
 *
 * Hier worden alle objecten één keer gemaakt en aan elkaar gekoppeld:
 *
 *   DataStore ──► RegistrationModel ──► RegistrationView
 *                        │                     │
 *                        ├──► CsvExport        │
 *                        ▼                     ▼
 *                  RegistrationApp (controller, stuurt model, view en export aan)
 *
 * - DataStore bewaart de gegevens in de browser (localStorage).
 * - RegistrationModel bevat de gegevens en de regels.
 * - RegistrationView tekent het scherm.
 * - CsvExport maakt het CSV-bestand voor de loonadministratie.
 * - RegistrationApp reageert op wat de gebruiker doet. De controller maakt zelf zijn kleinere
 *   onderdelen (zoals AdminController, FormController en FaceController, zie RegistrationApp.js).
 * - ThemeManager regelt het lichte en donkere thema; die staat los van de rest.
 * - FaceRecognitionDemo is de demo gezichtsherkenning (uit te zetten in config.js).
 * - BadgeReader herkent een pas via een USB-NFC-lezer (uit te zetten in config.js).
 *
 * Met een server (SERVER_API in deployment.js is ingevuld, zoals in de container) staan de gegevens
 * in de database van de server. ServerMode vraagt dan eerst wie deze browser is en haalt de gegevens
 * op. ServerDataStore neemt de plaats in van DataStore. Is de browser geen beheerder en geen
 * gekoppelde tablet, dan staat er alleen een inlogscherm en start de rest niet.
 */
import { STORAGE_KEY } from "./config.js";
import { DataStore } from "./DataStore.js";
import { RegistrationModel } from "./RegistrationModel.js";
import { RegistrationView } from "./RegistrationView.js";
import { RegistrationApp } from "./RegistrationApp.js";
import { CsvExport } from "./CsvExport.js";
import { ThemeManager } from "./ThemeManager.js";
import { FaceRecognitionDemo } from "./FaceRecognitionDemo.js";
import { BadgeReader } from "./BadgeReader.js";
import { AdminController } from "./controllers/AdminController.js";
import { SERVER_API } from "./deployment.js";
import { ServerApi } from "./ServerApi.js";
import { ServerMode } from "./ServerMode.js";

// Het thema eerst, zodat de kleuren kloppen voordat de rest wordt getekend.
new ThemeManager().initialize();

// Maakt de onderdelen van de website en start ze. `server` is de ServerMode, of null in de demo.
const start = (store, server = null) => {
  const model = new RegistrationModel(store);
  const view = new RegistrationView(model);
  const csvExport = new CsvExport(model);
  const faceDemo = new FaceRecognitionDemo();
  const badgeReader = new BadgeReader();
  const app = new RegistrationApp(model, view, csvExport, faceDemo, badgeReader, AdminController.realClock());

  app.server = server;
  app.initialize();
  server?.attach(app);
  server?.afterStart();
};

if (SERVER_API) {
  // De opslag van de browser is alleen voor een gekoppelde tablet (zie ServerDataStore).
  let cache = null;
  try {
    cache = window.localStorage;
  } catch (error) {
    cache = null;
  }
  const server = new ServerMode({ api: new ServerApi(SERVER_API), key: STORAGE_KEY, cache });
  if ((await server.prepare()) === "ready") start(server.store, server);
} else {
  start(new DataStore(STORAGE_KEY));
}
