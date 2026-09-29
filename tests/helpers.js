// Gedeelde hulpfuncties voor de unit tests.
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { DataStore } from "../assets/js/DataStore.js";

// Nep-opslag die alles in het geheugen bewaart. Met `failSave` mislukt opslaan.
export const createStore = (state = null, { failSave = false } = {}) => ({
  load: () => state,
  save: (nextState) => {
    if (failSave) return false;
    state = nextState;
    return true;
  }
});

// Node heeft geen localStorage; deze nep-versie bewaart alles in een Map.
export const fakeLocalStorage = ({ failSet = false } = {}) => {
  const items = new Map();
  globalThis.localStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => {
      if (failSet) throw new Error("QuotaExceededError");
      items.set(key, String(value));
    },
    removeItem: (key) => items.delete(key)
  };
};

// Maakt een echte DataStore met de opgegeven opgeslagen gegevens.
export const createDataStore = (storedData, options) => {
  fakeLocalStorage(options);
  if (storedData !== undefined) localStorage.setItem("test", JSON.stringify(storedData));
  return new DataStore("test");
};

// Model met de demogegevens en één medewerker (employee-1) die gekoppeld is aan
// het demo-consumptiepunt "Hoofdkantoor" van TVB (alle producten: 24 op voorraad, minimum 6).
export const createModel = (storeOptions) => {
  const model = new RegistrationModel(createStore(null, storeOptions));
  const point = model.points[0];

  model.state.employees = [{
    id: "employee-1",
    name: "Test Medewerker",
    firstName: "Test",
    lastName: "Medewerker",
    payrollCode: "",
    personnelNumber: "",
    employerNumber: "",
    companyId: point.companyId,
    pointId: point.id,
    active: true,
    color: "#d8f1e8"
  }];

  return { model, point };
};

// Voegt een tweede medewerker toe aan het model.
export const addEmployee = (model, overrides = {}) => {
  const employee = {
    id: "employee-2",
    name: "Tweede Medewerker",
    firstName: "Tweede",
    lastName: "Medewerker",
    payrollCode: "",
    personnelNumber: "",
    employerNumber: "",
    companyId: null,
    pointId: null,
    active: true,
    color: "#ffffff",
    ...overrides
  };
  model.state.employees.push(employee);
  return employee;
};

// Een registratie met een vaste datum (lokale tijd), voor tests met maanden.
export const registration = (id, employeeId, productId, createdAt) => ({
  id,
  employeeId,
  productId,
  pointId: null,
  createdAt
});
