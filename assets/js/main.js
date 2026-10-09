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
 * - RegistrationApp reageert op wat de gebruiker doet.
 * - ThemeManager regelt het lichte en donkere thema; die staat los van de rest.
 * - FaceRecognitionDemo is de demo gezichtsherkenning (uit te zetten in config.js).
 * - BadgeReader herkent een pas via een USB-NFC-lezer (uit te zetten in config.js).
 */
import { STORAGE_KEY } from "./config.js";
import { DataStore } from "./DataStore.js";
import { RegistrationModel } from "./RegistrationModel.js";
import { RegistrationView } from "./RegistrationView.js";
import { RegistrationApp } from "./RegistrationApp.js";
import { CsvExport } from "./csvExport.js";
import { ThemeManager } from "./ThemeManager.js";
import { FaceRecognitionDemo } from "./FaceRecognitionDemo.js";
import { BadgeReader } from "./BadgeReader.js";

// Het thema eerst, zodat de kleuren kloppen voordat de rest wordt getekend.
new ThemeManager().initialize();

const model = new RegistrationModel(new DataStore(STORAGE_KEY));
const view = new RegistrationView(model);
const csvExport = new CsvExport(model);
const faceDemo = new FaceRecognitionDemo();
const badgeReader = new BadgeReader();
const app = new RegistrationApp(model, view, csvExport, faceDemo, badgeReader);

app.initialize();
