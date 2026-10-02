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
// Met `withKeys: true` kent de nep-opslag ook `length` en `key(index)`, zoals de echte
// localStorage. Standaard staat dat uit, zodat de bestaande tests hetzelfde blijven werken.
export const fakeLocalStorage = ({ failSet = false, withKeys = false } = {}) => {
  const items = new Map();
  globalThis.localStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => {
      if (failSet) throw new Error("QuotaExceededError");
      items.set(key, String(value));
    },
    removeItem: (key) => items.delete(key)
  };
  if (withKeys) {
    Object.defineProperty(globalThis.localStorage, "length", { get: () => items.size });
    globalThis.localStorage.key = (index) => [...items.keys()][index] ?? null;
  }
};

// Nep-localStorage die ook kan opsommen welke sleutels er zijn (`length` en `key(index)`).
// Nodig om te testen dat DataStore.clearAll oude reservekopieën ("<sleutel>-backup-<cijfers>") wist.
export const fakeLocalStorageWithKeys = (options = {}) => fakeLocalStorage({ ...options, withKeys: true });

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

// Nep-element van de pagina: genoeg om de controller zonder browser te testen.
// Houdt bij welke classes het heeft, of het de focus kreeg en welke listeners erop zitten.
export const createFakeElement = (props = {}) => {
  const classes = new Set();
  const element = {
    value: "",
    textContent: "",
    tagName: "INPUT",
    disabled: false,
    checked: false,
    dataset: {},
    listeners: {},
    focused: false,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, force) => ((force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    attributes: {},
    focus() { element.focused = true; },
    setAttribute(name, value) { element.attributes[name] = String(value); },
    getAttribute(name) { return element.attributes[name] ?? null; },
    reset() {},
    addEventListener(type, listener) { element.listeners[type] = listener; },
    querySelectorAll: () => [],
    getClientRects: () => [{}],
    contains: (other) => other === element,
    ...props
  };
  return element;
};

// Nep-view die alles onthoudt: meldingen (toasts), foutmeldingen bij velden en de aanroepen
// van render-methodes. `$` geeft per selector altijd hetzelfde nep-element terug.
export const createRecordingView = () => {
  const elements = new Map();
  const target = {
    toasts: [],
    fieldErrors: [],
    calls: [],
    $: (selector) => {
      if (!elements.has(selector)) elements.set(selector, createFakeElement());
      return elements.get(selector);
    },
    showToast: (message, options = {}) => target.toasts.push({ message, ...options }),
    showFieldError: (field, message) => target.fieldErrors.push({ field, message })
  };

  return new Proxy(target, {
    get: (object, property) =>
      property in object ? object[property] : (...args) => object.calls.push([property, ...args])
  });
};

// Strenge nep-view: werkt als createRecordingView, maar `$` geeft alleen een element terug voor
// de selectors in `selectors` en anders null, net als document.querySelector als een element
// niet bestaat. Zo valt in een test op als de controller een verkeerde selector gebruikt of een
// element zoekt dat er niet is. Render-methodes worden alleen onthouden (in `calls`).
export const createStrictView = (selectors = []) => {
  const view = createRecordingView();
  const elements = new Map(selectors.map((selector) => [selector, createFakeElement()]));
  view.$ = (selector) => elements.get(selector) ?? null;
  return view;
};

// Een registratie met een vaste datum (lokale tijd), voor tests met maanden.
export const registration = (id, employeeId, productId, createdAt) => ({
  id,
  employeeId,
  productId,
  pointId: null,
  createdAt
});
