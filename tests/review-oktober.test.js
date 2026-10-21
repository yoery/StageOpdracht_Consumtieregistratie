// Regressietests voor de review van oktober 2026 (TO versie 3.11). Iedere test hoort bij een
// gevonden fout of afwijking en heeft de code van de review in de naam:
//   D1-D7: gegevens en opslag (DataStore, RegistrationModel, FaceRecognitionDemo);
//   U1-U7: bediening en toegankelijkheid (controller, view en index.html);
//   R1-R3: afwijkingen tussen de requirements in het TO en de code.
// De tests in tests/e2e/app.e2e.test.js controleren dezelfde punten in een echte browser waar
// het om echte klikken en toetsen gaat (U1, U2, U4, U5 en R1).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { DataStore } from "../assets/js/DataStore.js";
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { BadgeReader } from "../assets/js/BadgeReader.js";
import { DEFAULT_PRODUCTS } from "../assets/js/config.js";
import {
  createModel,
  addEmployee,
  createStore,
  createRecordingView,
  createFakeElement,
  createDataStore,
  asAdmin,
  disabledFridge
} from "./helpers.js";

// Console-meldingen van DataStore horen bij deze tests; ze maken de uitvoer alleen onrustig.
console.warn = () => {};
console.error = () => {};

const NOW = new Date("2026-10-12T10:00:00Z");
const toastTexts = (view) => view.toasts.map(({ message }) => message);

// Opgeslagen gegevens met één medewerker, één registratie, een bedrijf en een consumptiepunt.
const storedEmployee = (id, extra = {}) => ({
  id,
  name: "Anna Berg",
  firstName: "Anna",
  lastName: "Berg",
  payrollCode: "",
  personnelNumber: "1",
  employerNumber: "",
  companyId: "c1",
  pointId: "p1",
  active: true,
  color: "#d8f1e8",
  badgeId: "",
  ...extra
});
const validData = (extra = {}) => ({
  employees: [storedEmployee("e1")],
  registrations: [{ id: "r1", employeeId: "e1", productId: "blikje", price: 0.65, createdAt: "2026-09-10T10:00:00.000Z" }],
  products: [{ id: "blikje", name: "Blikje", price: 0.65 }],
  companies: [{ id: "c1", name: "TVB", employerNumber: "100" }],
  points: [{ id: "p1", name: "Hoofdkantoor", companyId: "c1", products: { blikje: { offered: true, stock: 5, minimum: 1 } } }],
  auditLog: [],
  ...extra
});

// Controller met het testmodel (employee-1 op Hoofdkantoor van TVB), een nep-view, een
// BadgeReader met nep-klok en een nep-document. De beheerder is ingelogd.
const SETTINGS = { enabled: true, minLength: 6, maxKeyIntervalMs: 40, endDelayMs: 120 };
const createClock = () => {
  const timers = new Map();
  let nextId = 1;
  const clock = {
    time: 0,
    now: () => clock.time,
    setTimeout: (action, delay) => {
      const id = nextId++;
      timers.set(id, { action, at: clock.time + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    advance: (ms) => {
      clock.time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock.time) {
          timers.delete(id);
          timer.action();
        }
      }
    }
  };
  return clock;
};
const keyEvent = (key, extra = {}) => {
  const event = {
    key,
    prevented: false,
    preventDefault() { event.prevented = true; },
    stopPropagation() {},
    ...extra
  };
  return event;
};

const createApp = ({ model = createModel().model, faceDemo } = {}) => {
  const openModals = [];
  const listeners = {};
  globalThis.document = {
    activeElement: null,
    addEventListener: (type, listener) => { listeners[type] = listener; },
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? openModals : [])
  };
  globalThis.window = { confirm: () => true };
  const view = createRecordingView();
  const clock = createClock();
  const reader = new BadgeReader(SETTINGS, clock);
  const demo = faceDemo || new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  // Zonder koelkast: na herkenning opent het productvenster (zie disabledFridge in helpers.js).
  const app = asAdmin(new RegistrationApp(model, view, undefined, demo, reader, undefined, disabledFridge()));
  return { app, model, view, clock, reader, openModals, listeners, demo };
};

// Een nep-knop die op de pagina staat (isConnected) en bij focus() het actieve element wordt.
const connectedElement = (dataset = {}) => {
  const element = createFakeElement({ dataset, isConnected: true });
  element.focus = () => {
    element.focused = true;
    globalThis.document.activeElement = element;
  };
  return element;
};

// Laat de lezer een pas "typen" via de controller. `into` is het veld met de focus: de tekens
// komen daar ook in, net als in de browser. `onInput` bootst het input-event van dat veld na.
const scan = (app, clock, text, { into = null, onInput = () => {} } = {}) => {
  for (const character of text) {
    app.handleBadgeKey(keyEvent(character));
    if (into) {
      into.value += character;
      onInput();
    }
    clock.advance(4);
  }
  const enter = keyEvent("Enter");
  app.handleBadgeKey(enter);
  return enter;
};

// ------------------------------------------------------------------
// D1. Een lijst die er wel staat maar geen lijst is
// ------------------------------------------------------------------

for (const name of ["employees", "registrations", "products", "points", "auditLog"]) {
  test(`D1: staat "${name}" er wel, maar is het geen lijst, dan zijn de gegevens onleesbaar (met reservekopie)`, () => {
    const data = validData({ [name]: { kapot: true } });
    const store = createDataStore(data);

    assert.equal(store.load(NOW), null, "de demo start opnieuw in plaats van een lege lijst op te slaan");
    assert.equal(store.loadProblem, "unreadable");
    assert.equal(localStorage.getItem("test-backup"), JSON.stringify(data));
  });
}

test("D1: null bij een lijst telt ook als beschadigd", () => {
  const store = createDataStore(validData({ registrations: null }));

  assert.equal(store.load(NOW), null);
  assert.equal(store.loadProblem, "unreadable");
});

test("D1: een lijst die helemaal ontbreekt (oude versie) krijgt wel een standaardwaarde", () => {
  const data = validData();
  delete data.products;
  delete data.auditLog;
  const store = createDataStore(data);
  const loaded = store.load(NOW);

  assert.equal(store.loadProblem, null);
  assert.deepEqual(loaded.products.map(({ id }) => id), DEFAULT_PRODUCTS.map(({ id }) => id));
  assert.deepEqual(loaded.auditLog, []);
});

// ------------------------------------------------------------------
// D2. Opslag vol
// ------------------------------------------------------------------

// Nep-localStorage waarvan setItem altijd dezelfde fout gooit.
const failingLocalStorage = (error) => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => { throw error; },
    removeItem: () => {}
  };
};

test("D2: DataStore.save herkent een volle opslag (QuotaExceededError)", () => {
  failingLocalStorage(new DOMException("De opslag is vol", "QuotaExceededError"));
  const store = new DataStore("test");

  assert.equal(store.save({}), false);
  assert.equal(store.saveProblem, "full");
});

test("D2: een andere fout bij opslaan telt niet als volle opslag", () => {
  failingLocalStorage(new Error("Opslag geblokkeerd"));
  const store = new DataStore("test");

  assert.equal(store.save({}), false);
  assert.equal(store.saveProblem, "failed");
  assert.equal(store.isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true);
  assert.equal(store.isQuotaError({ code: 22 }), true);
});

test("D2: is de opslag vol, dan krijgt de gebruiker een eigen melding en wordt er niets verwijderd", () => {
  failingLocalStorage(new DOMException("De opslag is vol", "QuotaExceededError"));
  const model = new RegistrationModel(new DataStore("test"));
  const { app, view } = createApp({ model });
  const before = model.registrations.length;
  const employeeId = model.employees[0].id;

  const saved = app.persist(() => model.addRegistration(employeeId, "blikje"));

  assert.equal(saved, false);
  assert.equal(model.registrations.length, before, "de registratie is teruggedraaid");
  assert.deepEqual(toastTexts(view), [
    "De opslag van de browser is vol. Er is niets opgeslagen. Vraag de beheerder om de registraties te exporteren en oude gegevens te wissen."
  ]);
  assert.equal(view.toasts[0].tone, "error");
  assert.equal(view.toasts[0].duration, 8000);
  assert.equal(view.toasts[0].message.includes(";"), false);
});

test("D2: bij een andere fout blijft de melding 'Opslaan mislukt. Probeer het opnieuw.'", () => {
  failingLocalStorage(new Error("Opslag geblokkeerd"));
  const model = new RegistrationModel(new DataStore("test"));
  const { app, view } = createApp({ model });

  app.persist(() => model.addRegistration(model.employees[0].id, "blikje"));

  assert.deepEqual(toastTexts(view), ["Opslaan mislukt. Probeer het opnieuw."]);
});

// ------------------------------------------------------------------
// D3. Dubbele passen pas na het opschonen controleren
// ------------------------------------------------------------------

test("D3: een tweede regel met dezelfde id 'claimt' geen pas van een geldige medewerker", () => {
  const store = createDataStore(validData({
    employees: [
      storedEmployee("x1", { badgeId: "AB12CD" }),
      storedEmployee("x1", { badgeId: "CD34EF", personnelNumber: "2" }), // valt af: dubbele id
      storedEmployee("e3", { badgeId: "CD34EF", personnelNumber: "3" })
    ]
  }));

  const employees = store.load(NOW).employees;

  assert.deepEqual(employees.map(({ id, badgeId }) => `${id}=${badgeId}`), ["x1=AB12CD", "e3=CD34EF"]);
});

test("D3: een ongeldige medewerker 'claimt' geen pas van een geldige medewerker", () => {
  const store = createDataStore(validData({
    employees: [
      storedEmployee("bad id", { badgeId: "AB12CD" }), // valt af: ongeldige id
      storedEmployee("e2", { badgeId: "AB12CD", personnelNumber: "2" })
    ]
  }));

  const employees = store.load(NOW).employees;

  assert.deepEqual(employees.map(({ id, badgeId }) => `${id}=${badgeId}`), ["e2=AB12CD"]);
  assert.equal(store.loadProblem, "skipped");
});

// ------------------------------------------------------------------
// D4. Gezichtsherkenning: alleen actieve, bestaande medewerkers
// ------------------------------------------------------------------

test("D4: findMatch kijkt alleen naar de toegestane medewerkers", () => {
  const demo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5 }, null);
  demo.enroll("inactief", [0.1, 0]);
  demo.enroll("actief", [0.4, 0]);

  assert.equal(demo.findMatch([0, 0]), "inactief", "zonder lijst wint het dichtstbijzijnde gezicht");
  assert.equal(demo.findMatch([0, 0], ["actief"]), "actief");
  assert.equal(demo.findMatch([0, 0], []), null);
});

test("D4: een inactieve collega met een gezicht dat dichterbij ligt, schermt een actieve medewerker niet af", async () => {
  const { model } = createModel();
  addEmployee(model, { id: "employee-2", active: false });
  const demo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  demo.enroll("employee-2", [0.1, 0]);
  demo.enroll("employee-1", [0.4, 0]);
  demo.readFace = async () => [0, 0];
  demo.confirm = (employeeId) => employeeId; // direct bevestigd, zodat de test niet hoeft te wachten
  const { app } = createApp({ model, faceDemo: demo });
  app.faceSession = 1;

  await app.scanForFace(1);

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.recognizedBy, "face");
});

test("D4: na een wijziging in een ander tabblad worden gezichten van verwijderde medewerkers vergeten", () => {
  const { model } = createModel();
  addEmployee(model);
  const { app, demo } = createApp({ model });
  // Vanaf 3.17 staan de gezichtsinstellingen in het model; het geheugen van de demo volgt het model.
  model.saveFaceEnrollment("employee-1", new Array(128).fill(0.1));
  model.saveFaceEnrollment("employee-2", new Array(128).fill(0.2));
  app.loadSavedFaces();
  assert.deepEqual(demo.enrolledIds(), ["employee-1", "employee-2"]);
  const otherTabState = { ...model.snapshot(), employees: model.employees.filter(({ id }) => id !== "employee-2") };
  model.store = { key: "tvb-test", loadProblem: null, load: () => otherTabState, save: () => true };

  app.handleStorageChange({ key: "tvb-test" });

  assert.deepEqual(demo.enrolledIds(), ["employee-1"]);
});

// ------------------------------------------------------------------
// D5. Datums die niet bestaan
// ------------------------------------------------------------------

test("D5: een datum of tijd die niet bestaat, is ongeldig", () => {
  const store = new DataStore("test");
  const latest = NOW.getTime();

  for (const value of ["2026-02-31T10:00:00Z", "2026-02-30T10:00", "2026-09-30T24:00:00", "2026-09-30T10:60", "2026-13-01T10:00:00Z", "2026-09-30T10:00:61"]) {
    assert.equal(store.isValidDateTime(value, latest), false, value);
  }
  for (const value of ["2024-02-29T10:00:00Z", "2026-09-30T23:59:59.999Z", "2026-10-09T08:30+02:00", "2026-10-09T08:30"]) {
    assert.equal(store.isValidDateTime(value, latest), true, value);
  }
});

test("D5: een registratie op 31 februari wordt bij het laden overgeslagen", () => {
  const data = validData();
  data.registrations.push({ id: "r2", employeeId: "e1", productId: "blikje", price: 0.65, createdAt: "2026-02-31T10:00:00Z" });
  const store = createDataStore(data);

  const loaded = store.load(NOW);

  assert.deepEqual(loaded.registrations.map(({ id }) => id), ["r1"]);
  assert.equal(store.loadProblem, "skipped");
});

// ------------------------------------------------------------------
// D6. Pasnummer gelijk maken bij het laden
// ------------------------------------------------------------------

test("D6: een pasnummer in kleine letters of met ':' wordt gelijk gemaakt en telt niet als beschadigd", () => {
  const store = createDataStore(validData({
    employees: [storedEmployee("e1", { badgeId: "04a1b2c3" }), storedEmployee("e2", { badgeId: "04:99:aa:bb", personnelNumber: "2" })]
  }));

  const loaded = store.load(NOW);

  assert.deepEqual(loaded.employees.map(({ badgeId }) => badgeId), ["04A1B2C3", "0499AABB"]);
  assert.equal(store.loadProblem, null);
});

// ------------------------------------------------------------------
// D7. "Alle gegevens wissen" als wissen niet lukt
// ------------------------------------------------------------------

test("D7: lukt het wissen van de opslag niet, dan geeft wipeAll false en blijven de gegevens staan", () => {
  const store = { ...createStore(), clearAll: () => false };
  const model = new RegistrationModel(store);
  model.state.registrations = [{ id: "r1", employeeId: "x", productId: "blikje", createdAt: NOW.toISOString() }];

  assert.equal(model.wipeAll(), false);
  assert.equal(model.registrations.length, 1);
});

test("D7: lukt het wissen niet, dan meldt de app dat en niet 'Alle gegevens zijn gewist'", () => {
  const { model } = createModel();
  model.store = { ...model.store, clearAll: () => false };
  const { app, view } = createApp({ model });

  app.wipeAllData();

  assert.deepEqual(toastTexts(view), ["De gegevens konden niet worden gewist. Probeer het opnieuw."]);
  assert.equal(view.toasts[0].tone, "error");
  assert.equal(app.adminLoggedIn, true, "het beheer blijft open, zodat de beheerder het opnieuw kan proberen");
});

test("D7: lukt het wissen wel, dan blijft de melding 'Alle gegevens zijn gewist'", () => {
  const { model } = createModel();
  model.store = { ...model.store, clearAll: () => true };
  const { app, view } = createApp({ model });

  app.wipeAllData();

  assert.match(toastTexts(view).at(-1), /^Alle gegevens zijn gewist\./);
});

// ------------------------------------------------------------------
// R2. Meldingen bij het laden zonder puntkomma (gelijk aan het TO)
// ------------------------------------------------------------------

test("R2: de meldingen bij onleesbare en niet beschikbare opslag staan er zoals in het TO", () => {
  const { app, model, view } = createApp();

  model.loadProblem = "unreadable";
  app.showLoadProblem();
  model.loadProblem = "unavailable";
  app.showLoadProblem();

  assert.deepEqual(toastTexts(view), [
    "De opgeslagen gegevens waren onleesbaar. De demo is opnieuw gestart. Er staat een reservekopie in de browser.",
    "De opslag van de browser kon niet worden gelezen. De demo start met voorbeeldgegevens. Wijzigingen worden mogelijk niet bewaard."
  ]);
});

// ------------------------------------------------------------------
// R3. Werkgevernummer als getal in een registratie
// ------------------------------------------------------------------

test("R3: een werkgevernummer dat als getal in een registratie staat, wordt tekst en de registratie blijft", () => {
  const data = validData();
  data.registrations[0].employerNumber = 4711;
  const store = createDataStore(data);

  const loaded = store.load(NOW);

  assert.equal(loaded.registrations.length, 1);
  assert.equal(loaded.registrations[0].employerNumber, "4711");
  assert.equal(store.loadProblem, null);
});

// ------------------------------------------------------------------
// U1. Scan in het veld "Pasnummer" vervangt het oude nummer
// ------------------------------------------------------------------

test("U1: een scan in het veld 'Pasnummer' vervangt het oude nummer door het nieuwe", () => {
  const { app, view, clock, openModals } = createApp();
  openModals.push(view.$("#employeeFormModal"));
  const field = view.$("#newEmployeeBadgeId");
  field.id = "newEmployeeBadgeId";
  field.value = "04A1B2C3";
  document.activeElement = field;

  const enter = scan(app, clock, "04:99:aa:bb", { into: field });

  assert.equal(field.value, "0499AABB");
  assert.equal(enter.prevented, true, "de Enter van de lezer verstuurt het formulier niet");
  assert.equal(app.selectedEmployeeId, null, "er wordt niemand herkend");
  assert.deepEqual(view.toasts, []);
});

// ------------------------------------------------------------------
// U2 en U3. Dubbelklik op "Registreren" en Enter ingedrukt houden
// ------------------------------------------------------------------

test("U2: een klik op een medewerkerrij kort na het sluiten van het productvenster telt niet", () => {
  const { app } = createApp();
  app.openEmployeeProducts("employee-1");
  app.closeEmployeeProducts();
  const row = { dataset: { openEmployee: "employee-1" } };
  const click = (detail) => ({ detail, target: { closest: (selector) => (selector === "[data-open-employee]" ? row : null) } });

  app.handleClick(click(1));
  assert.equal(app.selectedEmployeeId, null, "binnen 500 ms na het sluiten");

  app.productWindowClosedAt -= 600;
  app.handleClick(click(2));
  assert.equal(app.selectedEmployeeId, null, "de tweede klik van een dubbelklik");

  app.handleClick(click(1));
  assert.equal(app.selectedEmployeeId, "employee-1", "een gewone klik later werkt wel");
});

test("U2: isGhostRowClick kijkt naar event.detail en de tijd sinds het sluiten", () => {
  const { app } = createApp();
  app.productWindowClosedAt = 10000;

  assert.equal(app.isGhostRowClick({ detail: 1 }, 10499), true);
  assert.equal(app.isGhostRowClick({ detail: 1 }, 10500), false);
  assert.equal(app.isGhostRowClick({ detail: 2 }, 20000), true);
  assert.equal(app.isGhostRowClick({ detail: 0 }, 20000), false, "Enter op een rij (detail 0) telt wel");
});

test("U3: Enter ingedrukt houden op een medewerkerrij opent het productvenster niet opnieuw", () => {
  const { app } = createApp();
  const row = { dataset: { openEmployee: "employee-1" } };
  const target = { closest: (selector) => (selector === "[data-open-employee]" ? row : null) };

  const held = keyEvent("Enter", { repeat: true, target });
  app.handleEmployeeRowKey(held);
  assert.equal(app.selectedEmployeeId, null);
  assert.equal(held.prevented, true);

  app.handleEmployeeRowKey(keyEvent("Enter", { target }));
  assert.equal(app.selectedEmployeeId, "employee-1");
});

// ------------------------------------------------------------------
// U4. Scan met de focus in het bedrijfsfilter
// ------------------------------------------------------------------

test("U4: na een scan in het bedrijfsfilter staan tekst en bedrijfskeuze terug en is de keuzelijst dicht", () => {
  const { app, view, clock } = createApp();
  const filter = view.$("#employeeCompanyFilter");
  filter.id = "employeeCompanyFilter";
  filter.value = "TVB";
  filter.dataset.value = "c1";
  document.activeElement = filter;

  // Typen in het filter wist de bedrijfskeuze en opent de keuzelijst (onCompanyFilterInput).
  scan(app, clock, "FFFF0000", { into: filter, onInput: () => app.onCompanyFilterInput() });

  assert.equal(filter.value, "TVB");
  assert.equal(filter.dataset.value, "c1");
  assert.equal(view.$("#companyFilterOptions").classList.contains("hidden"), true);
  assert.equal(filter.getAttribute("aria-expanded"), "false");
  assert.match(toastTexts(view).at(-1), /^Deze pas is niet gekoppeld/);
});

test("U4: was er nog geen bedrijf gekozen, dan blijft dataset.value leeg na de scan", () => {
  const { app, view, clock } = createApp();
  const filter = view.$("#employeeCompanyFilter");
  filter.id = "employeeCompanyFilter";
  document.activeElement = filter;

  scan(app, clock, "04A1B2C3", { into: filter, onInput: () => app.onCompanyFilterInput() });

  assert.equal(filter.value, "");
  assert.equal("value" in filter.dataset, false);
});

// ------------------------------------------------------------------
// U5. Focus na opslaan, (de)activeren, verwijderen en een wijziging in een ander tabblad
// ------------------------------------------------------------------

const submitEvent = () => ({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

test("U5: na opslaan van een gewijzigd product krijgt de nieuwe knop 'Wijzigen' de focus", () => {
  const { app, view } = createApp();
  const opener = connectedElement({ editProduct: "blikje" });
  const newButton = view.$('[data-edit-product="blikje"]');
  document.activeElement = opener;
  app.openEditProductForm("blikje");
  // Opslaan tekent de productlijst opnieuw: de oude knop verdwijnt, er komt een nieuwe.
  view.renderAdminProducts = () => {
    opener.isConnected = false;
    newButton.isConnected = true;
  };

  app.saveProduct(submitEvent());

  assert.equal(newButton.focused, true);
});

test("U5: na opslaan van een gewijzigd bedrijf (eerst sluiten, dan tekenen) houdt de knop de focus", () => {
  const { app, model, view } = createApp();
  const company = model.companies[0];
  const opener = connectedElement({ editCompany: company.id });
  const newButton = view.$(`[data-edit-company="${company.id}"]`);
  document.activeElement = opener;
  app.openEditCompanyForm(company.id);
  view.$("#companyName").value = company.name;
  view.$("#companyEmployerNumber").value = "";
  view.renderAdminCompanies = () => {
    opener.isConnected = false;
    newButton.isConnected = true;
  };

  app.saveCompany(submitEvent());

  assert.equal(newButton.focused, true);
});

test("U5: na (de)activeren krijgt de nieuwe knop van dezelfde medewerker de focus", () => {
  const { app, view } = createApp();
  const button = connectedElement({ toggleEmployee: "employee-1" });
  const newButton = view.$('[data-toggle-employee="employee-1"]');
  document.activeElement = button;
  view.renderAdminEmployees = () => {
    button.isConnected = false;
    newButton.isConnected = true;
  };

  app.toggleEmployee("employee-1");

  assert.equal(newButton.focused, true);
});

test("U5: na verwijderen van een medewerker gaat de focus naar 'Medewerker toevoegen'", () => {
  const { model } = createModel();
  addEmployee(model, { active: false });
  const { app, view } = createApp({ model });
  const button = connectedElement({ removeEmployee: "employee-2" });
  const addButton = view.$("#addEmployeeButton");
  addButton.isConnected = true;
  document.activeElement = button;
  view.renderAdminEmployees = () => { button.isConnected = false; };

  app.removeEmployee("employee-2");

  assert.equal(model.findEmployee("employee-2"), undefined);
  assert.equal(addButton.focused, true);
});

test("U5: na een wijziging in een ander tabblad houdt de medewerkerrij met de focus die focus", () => {
  const { app, model, view } = createApp();
  const row = connectedElement({ openEmployee: "employee-1" });
  const newRow = view.$('[data-open-employee="employee-1"]');
  document.activeElement = row;
  view.renderAll = () => {
    row.isConnected = false;
    newRow.isConnected = true;
  };
  const state = model.snapshot();
  model.store = { key: "tvb-test", loadProblem: null, load: () => state, save: () => true };

  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(newRow.focused, true);
});

test("U5: findFocusReplacement zonder data-attribuut uit de lijst geeft null", () => {
  const { app } = createApp();

  assert.equal(app.findFocusReplacement(createFakeElement()), null);
  assert.equal(app.focusSelector(connectedElement({ correctionPlus: "e1", correctionProduct: "blikje" })),
    '[data-correction-plus="e1"][data-correction-product="blikje"]');
});

// ------------------------------------------------------------------
// U6. Dagwissel en het datumveld van de correctie
// ------------------------------------------------------------------

test("U6: na middernacht schuift het datumveld van de correctie mee als het op de oude laatste dag stond", () => {
  const { app, view } = createApp();
  const field = view.$("#correctionDate");
  field.value = "2026-10-11";
  field.max = "2026-10-11";
  app.currentDay = new Date(2026, 9, 11, 23, 59).toDateString();

  assert.equal(app.refreshIfNewDay(new Date(2026, 9, 12, 0, 1)), true);

  assert.equal(field.value, "2026-10-12");
  assert.equal(field.max, "2026-10-12");
});

test("U6: een datum die de beheerder zelf heeft gekozen, blijft na middernacht staan", () => {
  const { app, view } = createApp();
  const field = view.$("#correctionDate");
  field.value = "2026-10-05";
  field.max = "2026-10-11";
  app.currentDay = new Date(2026, 9, 11, 23, 59).toDateString();

  app.refreshIfNewDay(new Date(2026, 9, 12, 0, 1));

  assert.equal(field.value, "2026-10-05");
  assert.equal(field.max, "2026-10-12");
});

// ------------------------------------------------------------------
// U7. Toegankelijkheid: live region, tabbladen en bedrijfsfilter
// ------------------------------------------------------------------

test("U7a: + en − zetten het nieuwe aantal in de vaste live region", () => {
  const { app, view } = createApp();
  app.openEmployeeProducts("employee-1");

  app.incrementProduct("blikje");
  app.incrementProduct("blikje");
  app.decrementProduct("blikje");

  const announced = view.calls.filter(([name]) => name === "announce").map(([, text]) => text);
  assert.deepEqual(announced, ["", "Blikje: 1", "Blikje: 2", "Blikje: 1"]);
});

test("U7a: de view zet de tekst in #productLiveStatus en de teller zelf heeft geen aria-live meer", () => {
  const { model } = createModel();
  const elements = new Map();
  const view = new RegistrationView(model);
  view.$ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createFakeElement({ innerHTML: "" }));
    return elements.get(selector);
  };

  view.announce("Blikje: 2");
  view.renderEmployeeProducts("employee-1", { blikje: 2 });

  assert.equal(view.$("#productLiveStatus").textContent, "Blikje: 2");
  assert.equal(view.$("#employeeProductList").innerHTML.includes("aria-live"), false);
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<p class="visually-hidden" id="productLiveStatus" aria-live="polite"><\/p>/);
});

test("U7b: de beheertabbladen zijn een tablist en switchTab werkt aria-selected bij", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /class="admin-tabs" role="tablist"/);
  for (const name of ["registrations", "employees", "products", "companies", "stock", "audit"]) {
    assert.match(html, new RegExp(`role="tab" id="tab-${name}" aria-controls="${name}Tab"`));
    assert.match(html, new RegExp(`id="${name}Tab"[^>]*role="tabpanel" aria-labelledby="tab-${name}"`));
  }

  const { app } = createApp();
  const tabs = ["registrations", "employees"].map((name) => createFakeElement({ dataset: { tab: name } }));
  document.querySelectorAll = (selector) => (selector === ".tab" ? tabs : []);

  app.switchTab(tabs[1]);

  assert.deepEqual(tabs.map((tab) => tab.getAttribute("aria-selected")), ["false", "true"]);
});

test("U7c: de keuzelijst van het bedrijfsfilter werkt aria-expanded bij en heeft opties met aria-selected", () => {
  const { app, view } = createApp();
  const filter = view.$("#employeeCompanyFilter");
  const toggle = view.$("[data-toggle-company-filter]");

  app.onCompanyFilterInput();
  assert.equal(filter.getAttribute("aria-expanded"), "true");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  const options = [createFakeElement({ dataset: { companyValue: "all" } }), createFakeElement({ dataset: { companyValue: "c1" } })];
  view.$("#companyFilterOptions").querySelectorAll = () => options;
  app.selectCompanyFilterOption(options[1]);

  assert.equal(filter.getAttribute("aria-expanded"), "false");
  assert.deepEqual(options.map((option) => option.getAttribute("aria-selected")), ["false", "true"]);

  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="employeeCompanyFilter"[^>]*role="combobox"[^>]*aria-controls="companyFilterOptions" aria-expanded="false"/);
});

test("U7c: de view tekent de bedrijven als opties met role=option en aria-selected", () => {
  const { model } = createModel();
  const elements = new Map();
  const view = new RegistrationView(model);
  view.$ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createFakeElement({ innerHTML: "" }));
    return elements.get(selector);
  };

  view.populateCompanyFilter();

  const html = view.$("#companyFilterOptions").innerHTML;
  assert.match(html, /<button type="button" role="option" aria-selected="true" data-company-value="all">Alle bedrijven<\/button>/);
  assert.match(html, /role="option" aria-selected="false" data-company-value="[^"]+">TVB<\/button>/);
});

test("U7c: Escape sluit de open keuzelijst zonder een venster te sluiten", () => {
  const { app, view, listeners, openModals } = createApp();
  const closed = [];
  app.registerKeyboardEvents();
  app.registerModalClose("#adminModal", "[data-close-modal]", () => closed.push("beheer"));
  app.onCompanyFilterInput(); // keuzelijst open

  const escape = keyEvent("Escape");
  listeners.keydown(escape);

  assert.equal(escape.prevented, true);
  assert.equal(view.$("#companyFilterOptions").classList.contains("hidden"), true);
  assert.deepEqual(closed, []);

  // Staat er wel een venster open, dan sluit Escape dat venster (zoals altijd).
  openModals.push(view.$("#adminModal"));
  listeners.keydown(keyEvent("Escape"));
  assert.deepEqual(closed, ["beheer"]);
});

// ------------------------------------------------------------------
// R1. Cijfervelden zijn tekstvelden met een cijfertoetsenbord
// ------------------------------------------------------------------

test("R1: looncode, personeelsnummer en werkgevernummers zijn type=text met inputmode=numeric", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  for (const id of ["newEmployeePayrollCode", "newEmployeePersonnelNumber", "newEmployeeEmployerNumber", "companyEmployerNumber"]) {
    const input = html.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0] || "";
    assert.match(input, /type="text"/, id);
    assert.match(input, /inputmode="numeric"/, id);
    assert.equal(input.includes('type="number"'), false, id);
  }
});

test("R1: '12a' in een cijferveld geeft 'Gebruik alleen cijfers.' en er wordt niets opgeslagen", () => {
  const { app, model, view } = createApp();
  view.$("#newEmployeeFirstName").value = "Test";
  view.$("#newEmployeeLastName").value = "Persoon";
  view.$("#newEmployeePayrollCode").value = "12a";
  view.$("#newEmployeePersonnelNumber").value = "999";
  view.$("#newEmployeeCompany").value = model.companies[0].id;
  const before = model.employees.length;

  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, before);
  assert.deepEqual(view.fieldErrors.map(({ message }) => message), ["Gebruik alleen cijfers."]);
});
