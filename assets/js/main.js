import {STORAGE_KEY,DEFAULT_PRODUCTS} from "./config.js";
import { DataStore } from "./DataStore.js";
import { RegistrationModel } from "./RegistrationModel.js";
import { RegistrationView } from "./RegistrationView.js";
import { RegistrationApp } from "./RegistrationApp.js";

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DataStore, RegistrationModel, DEFAULT_PRODUCTS };
} else {
  const model = new RegistrationModel(new DataStore(STORAGE_KEY));
  const app = new RegistrationApp(model, new RegistrationView(model));
  app.initialize();
}