import { STORAGE_KEY } from "./config.js";
import { DataStore } from "./DataStore.js";
import { RegistrationModel } from "./RegistrationModel.js";
import { RegistrationView } from "./RegistrationView.js";
import { RegistrationApp } from "./RegistrationApp.js";

// Startpunt in de browser: koppelt opslag, model, view en controller aan elkaar.
const model = new RegistrationModel(new DataStore(STORAGE_KEY));
const app = new RegistrationApp(model, new RegistrationView(model));
app.initialize();
