// Tests voor herkennen met de pas (USB-NFC-lezer die zich als toetsenbord gedraagt):
// de BadgeReader (wat is een scan en wat is gewoon typen), het normaliseren van het pasnummer,
// de controller (productvenster openen, melding, zoekveld opruimen), het koppelen van een pas
// in het medewerkersformulier, de controle en migratie in DataStore, en dat het pasnummer niet
// in de CSV-export of het logboek terechtkomt.
// De tijd en de timers worden nagebootst met een nep-klok, zodat er niet echt gewacht hoeft te worden.
import test from "node:test";
import assert from "node:assert/strict";

import { BadgeReader } from "../assets/js/BadgeReader.js";
import { BADGE_READER } from "../assets/js/config.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { CsvExport } from "../assets/js/csvExport.js";
import { createModel, addEmployee, createRecordingView, createFakeElement, createDataStore, registration, asAdmin } from "./helpers.js";

const SETTINGS = { enabled: true, minLength: 6, maxKeyIntervalMs: 40, endDelayMs: 120 };

// Nep-klok: `now` is de huidige tijd in ms; `advance(ms)` laat de tijd verstrijken en voert
// timers uit die in die tijd aflopen.
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

// Een keydown-event zoals de browser het geeft, met preventDefault en stopPropagation.
const keyEvent = (key, extra = {}) => {
  const event = {
    key,
    prevented: false,
    stopped: false,
    preventDefault() { event.prevented = true; },
    stopPropagation() { event.stopped = true; },
    ...extra
  };
  return event;
};

// Typt `text` met `intervalMs` tussen de toetsen, eventueel gevolgd door een afsluitende toets.
// Geeft het event van de laatste toets terug.
const type = (reader, clock, text, intervalMs, terminator = null) => {
  let last = null;
  for (const character of text) {
    last = keyEvent(character);
    reader.handleKey(last);
    clock.advance(intervalMs);
  }
  if (terminator) {
    last = keyEvent(terminator);
    reader.handleKey(last);
  }
  return last;
};

// BadgeReader met nep-klok die de scans in een lijst bewaart.
const createReader = (settings = SETTINGS) => {
  const clock = createClock();
  const reader = new BadgeReader(settings, clock);
  const scans = [];
  reader.onScan = (code) => scans.push(code);
  return { reader, clock, scans };
};

// ------------------------------------------------------------------
// BadgeReader: wat is een scan?
// ------------------------------------------------------------------

test("een snelle scan afgesloten met Enter geeft het pasnummer door en houdt de Enter tegen", () => {
  const { reader, clock, scans } = createReader();

  const enter = type(reader, clock, "04a1b2c3", 5, "Enter");

  assert.deepEqual(scans, ["04A1B2C3"]);
  assert.equal(enter.prevented, true);
  assert.equal(enter.stopped, true);
});

test("een snelle scan afgesloten met Tab werkt ook en houdt de Tab tegen", () => {
  const { reader, clock, scans } = createReader();

  const tab = type(reader, clock, "0012345678", 5, "Tab");

  assert.deepEqual(scans, ["0012345678"]);
  assert.equal(tab.prevented, true);
});

test("een scan zonder Enter of Tab telt na endDelayMs stilte", () => {
  const { reader, clock, scans } = createReader();

  type(reader, clock, "04A1B2C3", 5);
  assert.deepEqual(scans, [], "nog niet: de stilte is nog korter dan endDelayMs");

  clock.advance(SETTINGS.endDelayMs);
  assert.deepEqual(scans, ["04A1B2C3"]);
});

test("menselijk typen (trager dan maxKeyIntervalMs) is nooit een scan", () => {
  const { reader, clock, scans } = createReader();

  const enter = type(reader, clock, "lotte van dijk", 150, "Enter");
  clock.advance(1000);

  assert.deepEqual(scans, []);
  assert.equal(enter.prevented, false, "een gewone Enter wordt niet tegengehouden");
  assert.equal(reader.buffer, "");
});

test("een te korte code is geen scan, ook niet als die snel komt", () => {
  const { reader, clock, scans } = createReader();

  const enter = type(reader, clock, "04A1B", 5, "Enter");
  type(reader, clock, "12345", 5);
  clock.advance(1000);

  assert.deepEqual(scans, []);
  assert.equal(enter.prevented, false);
});

test("eerst met de hand typen en daarna scannen: alleen de snelle tekens tellen", () => {
  const { reader, clock, scans } = createReader();

  type(reader, clock, "ab", 200);
  type(reader, clock, "04A1B2C3", 5, "Enter");

  assert.deepEqual(scans, ["04A1B2C3"]);
});

test("sneltoetsen, een ingedrukt gehouden toets en een uitgezette lezer geven geen scan", () => {
  const { reader, clock, scans } = createReader();
  type(reader, clock, "04A1B2", 5);
  reader.handleKey(keyEvent("k", { ctrlKey: true }));
  clock.advance(1000);

  for (let count = 0; count < 8; count += 1) {
    reader.handleKey(keyEvent("a", { repeat: count > 0 }));
    clock.advance(30);
  }
  clock.advance(1000);
  assert.deepEqual(scans, []);

  const off = createReader({ ...SETTINGS, enabled: false });
  type(off.reader, off.clock, "04A1B2C3", 5, "Enter");
  assert.deepEqual(off.scans, []);
});

test("onStart wordt aangeroepen als er een nieuwe buffer begint", () => {
  const { reader, clock } = createReader();
  let starts = 0;
  reader.onStart = () => { starts += 1; };

  type(reader, clock, "04A1B2C3", 5, "Enter");
  assert.equal(starts, 1);

  type(reader, clock, "ab", 200);
  assert.equal(starts, 3, "bij menselijk typen begint iedere toets een nieuwe buffer");
});

test("normalize: spaties, : en - weg en hoofdletters", () => {
  assert.equal(BadgeReader.normalize("04:a1:b2:c3"), "04A1B2C3");
  assert.equal(BadgeReader.normalize(" 04-a1 b2-c3 "), "04A1B2C3");
  assert.equal(BadgeReader.normalize("0012345678"), "0012345678");
  assert.equal(BadgeReader.normalize(""), "");
  assert.equal(BadgeReader.normalize(undefined), "");
});

// ------------------------------------------------------------------
// Controller: herkennen met de pas
// ------------------------------------------------------------------

// Controller met het testmodel, een nep-view, een BadgeReader met nep-klok en een nep-document.
// `openModals` bepaalt welke vensters open staan (zie RegistrationApp.topModal).
// De beheerder is ingelogd, zodat ook het koppelen van een pas in het medewerkersformulier werkt.
const createApp = () => {
  const { model, point } = createModel();
  model.state.employees[0].badgeId = "04A1B2C3";
  const view = createRecordingView();
  const clock = createClock();
  const reader = new BadgeReader(SETTINGS, clock);
  const demo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  const app = asAdmin(new RegistrationApp(model, view, undefined, demo, reader));
  const openModals = [];
  globalThis.document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? openModals : [])
  };
  return { app, model, view, clock, reader, openModals, point };
};

// Laat de lezer een pas "typen" via de controller, zoals de keydown-listener op de pagina doet.
// Staat de focus in het zoekveld (`intoSearch`), dan komen de tekens daar ook in, net als in de browser.
const scanViaApp = (app, view, clock, text, { terminator = "Enter", intoSearch = false } = {}) => {
  const search = view.$("#employeeSearch");
  let last = null;
  for (const character of text) {
    last = keyEvent(character);
    app.handleBadgeKey(last);
    if (intoSearch) search.value += character;
    clock.advance(4);
  }
  if (terminator) {
    last = keyEvent(terminator);
    app.handleBadgeKey(last);
  } else {
    clock.advance(SETTINGS.endDelayMs);
  }
  return last;
};

const toastTexts = (view) => view.toasts.map(({ message }) => message);
const UNKNOWN_BADGE = "Deze pas is niet gekoppeld aan een medewerker. Kies je naam in de lijst of vraag de beheerder om de pas te koppelen.";

test("een bekende pas opent het productvenster van die medewerker met 'Je bent herkend met je pas.'", () => {
  const { app, model, view, clock } = createApp();

  scanViaApp(app, view, clock, "04:a1:b2:c3");

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.recognizedBy, "badge");
  assert.equal(app.recognizedByFace, false);
  const render = view.calls.find(([name]) => name === "renderEmployeeProducts");
  assert.equal(render[1], "employee-1");
  assert.equal(render[3].recognizedByBadge, true);
  assert.equal(render[3].recognized, false);
  assert.deepEqual(view.toasts, []);

  // De echte view zet de tekst in de begroeting, op dezelfde plek als bij de camera.
  const elements = new Map();
  const realView = new RegistrationView(model);
  realView.$ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createFakeElement({ innerHTML: "" }));
    return elements.get(selector);
  };
  const welcome = realView.$("#employeeWelcome");
  realView.renderEmployeeProducts("employee-1", {}, { recognizedByBadge: true });
  assert.match(welcome.textContent, /^Goede(morgen|middag|navond) Test\. Je bent herkend met je pas\.$/);
});

test("een scan zonder Enter (alleen stilte) opent ook het productvenster", () => {
  const { app, view, clock } = createApp();

  scanViaApp(app, view, clock, "04A1B2C3", { terminator: null });

  assert.equal(app.selectedEmployeeId, "employee-1");
});

test("een onbekende pas geeft een melding en opent niets", () => {
  const { app, view, clock } = createApp();

  scanViaApp(app, view, clock, "FFFF0000");

  assert.equal(app.selectedEmployeeId, null);
  assert.deepEqual(toastTexts(view), [UNKNOWN_BADGE]);
  assert.equal(view.toasts[0].tone, "error");
});

test("de pas van een inactieve medewerker geeft dezelfde melding als een onbekende pas", () => {
  const { app, model, view, clock } = createApp();
  model.state.employees[0].active = false;

  scanViaApp(app, view, clock, "04A1B2C3");

  assert.equal(app.selectedEmployeeId, null);
  assert.deepEqual(toastTexts(view), [UNKNOWN_BADGE]);
});

test("staat er een venster open, dan herkent de lezer niemand maar houdt hij de Enter van de scan tegen", () => {
  const { app, view, clock, reader, openModals } = createApp();
  openModals.push(view.$("#adminModal"));

  const enter = scanViaApp(app, view, clock, "04A1B2C3");
  clock.advance(1000);

  assert.equal(app.selectedEmployeeId, null);
  assert.deepEqual(view.toasts, []);
  assert.equal(enter.prevented, true, "de Enter van de lezer drukt geen knop in het venster in");
  assert.equal(reader.buffer, "");
});

test("staat er een venster open, dan blijft een Enter van een mens gewoon werken", () => {
  const { app, view, clock, openModals } = createApp();
  openModals.push(view.$("#adminModal"));

  for (const character of "04A1B2C3") {
    app.handleBadgeKey(keyEvent(character));
    clock.advance(200);
  }
  const enter = keyEvent("Enter");
  app.handleBadgeKey(enter);

  assert.equal(enter.prevented, false);
  assert.equal(app.selectedEmployeeId, null);
});

test("na een scan heeft het zoekveld weer dezelfde inhoud als ervoor", () => {
  const { app, view, clock } = createApp();
  const search = view.$("#employeeSearch");
  search.value = "lot";

  scanViaApp(app, view, clock, "04A1B2C3", { intoSearch: true });

  assert.equal(search.value, "lot");
  assert.ok(view.calls.some(([name]) => name === "renderEmployees"), "de lijst wordt opnieuw getekend");
  assert.equal(app.selectedEmployeeId, "employee-1");
});

test("ook na een onbekende pas zonder Enter wordt het zoekveld opgeruimd", () => {
  const { app, view, clock } = createApp();
  const search = view.$("#employeeSearch");
  search.value = "";

  scanViaApp(app, view, clock, "FFFF0000", { terminator: null, intoSearch: true });

  assert.equal(search.value, "");
  assert.deepEqual(toastTexts(view), [UNKNOWN_BADGE]);
});

test("gewoon typen in het zoekveld blijft staan", () => {
  const { app, view, clock } = createApp();
  const search = view.$("#employeeSearch");

  for (const character of "Lotte") {
    app.handleBadgeKey(keyEvent(character));
    search.value += character;
    clock.advance(180);
  }
  clock.advance(1000);

  assert.equal(search.value, "Lotte");
  assert.equal(app.selectedEmployeeId, null);
  assert.deepEqual(view.toasts, []);
});

// ------------------------------------------------------------------
// Medewerkersformulier: pas koppelen
// ------------------------------------------------------------------

// Vult het medewerkersformulier (zie ook controller.test.js) met een pasnummer.
const fillEmployeeForm = (view, point, badgeId) => {
  const values = {
    "#newEmployeeFirstName": "Jan",
    "#newEmployeeLastName": "de Vries",
    "#newEmployeePayrollCode": "12",
    "#newEmployeePersonnelNumber": "345",
    "#newEmployeeEmployerNumber": "",
    "#newEmployeeCompany": point.companyId,
    "#newEmployeePoint": point.id,
    "#newEmployeeBadgeId": badgeId
  };
  for (const [selector, value] of Object.entries(values)) view.$(selector).value = value;
  view.$("#employeeForm").querySelectorAll = () => [];
};

const submitEvent = () => ({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

test("pas koppelen: het pasnummer wordt genormaliseerd opgeslagen, zonder pasnummer in het logboek", () => {
  const { app, model, view, point } = createApp();
  fillEmployeeForm(view, point, " 04:d5-e6:f7 ");

  app.saveEmployee(submitEvent());

  const employee = model.employees.at(-1);
  assert.equal(employee.name, "Jan de Vries");
  assert.equal(employee.badgeId, "04D5E6F7");
  assert.deepEqual(view.fieldErrors, []);
  const lastEntry = model.auditLog.at(-1);
  assert.equal(lastEntry.action, "Medewerker toegevoegd");
  assert.ok(!JSON.stringify(model.auditLog).includes("04D5E6F7"), "het pasnummer staat niet in het logboek");
});

test("pas koppelen: een pas van een andere medewerker wordt geweigerd", () => {
  const { app, model, view, point } = createApp();
  fillEmployeeForm(view, point, "04-a1-b2-c3");

  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, 1);
  assert.deepEqual(view.fieldErrors.map(({ message }) => message), ["Deze pas is al gekoppeld aan een andere medewerker."]);
  assert.equal(view.$("#newEmployeeBadgeId").focused, true);
});

test("pas koppelen: bij wijzigen mag de medewerker zijn eigen pas houden", () => {
  const { app, model, view, point } = createApp();
  app.openEditEmployeeForm("employee-1");
  assert.equal(view.$("#newEmployeeBadgeId").value, "04A1B2C3");
  fillEmployeeForm(view, point, "04A1B2C3");

  app.saveEmployee(submitEvent());

  assert.deepEqual(view.fieldErrors, []);
  assert.equal(model.findEmployee("employee-1").badgeId, "04A1B2C3");
});

test("pas koppelen: andere tekens of een verkeerde lengte worden geweigerd", () => {
  for (const badgeId of ["04A1!B2", "04é1B2C3", "ABC", "A".repeat(65)]) {
    const { app, model, view, point } = createApp();
    fillEmployeeForm(view, point, badgeId);

    app.saveEmployee(submitEvent());

    assert.equal(model.employees.length, 1, badgeId);
    assert.deepEqual(view.fieldErrors.map(({ message }) => message), ["Gebruik alleen letters en cijfers (4 tot 64 tekens)."], badgeId);
  }
});

test("pas koppelen: leeg laten betekent geen pas, en een pas weghalen kan ook", () => {
  const { app, model, view, point } = createApp();
  fillEmployeeForm(view, point, "  ");
  app.saveEmployee(submitEvent());
  assert.equal(model.employees.at(-1).badgeId, "");

  app.openEditEmployeeForm("employee-1");
  fillEmployeeForm(view, point, "");
  view.$("#newEmployeePersonnelNumber").value = "999"; // 345 hoort nu bij Jan de Vries
  app.saveEmployee(submitEvent());
  assert.equal(model.findEmployee("employee-1").badgeId, "");
  assert.equal(model.findEmployeeByBadge(""), undefined, "een leeg pasnummer hoort bij niemand");
});

test("de medewerkerslijst van het beheer toont 'Pas gekoppeld', maar niet het pasnummer", () => {
  const { model } = createModel();
  model.state.employees[0].badgeId = "04A1B2C3";
  addEmployee(model);
  const view = new RegistrationView(model);
  const list = { innerHTML: "" };
  view.$ = (selector) => (selector === "#employeeManagementSearch" ? { value: "" } : list);

  view.renderAdminEmployees();

  assert.equal(list.innerHTML.match(/class="badge-linked">Pas gekoppeld</g).length, 1);
  assert.ok(!list.innerHTML.includes("04A1B2C3"));
});

// ------------------------------------------------------------------
// DataStore: controle en migratie van badgeId
// ------------------------------------------------------------------

const storedEmployee = (id, extra = {}) => ({
  id,
  name: "Jan Jansen",
  firstName: "Jan",
  lastName: "Jansen",
  payrollCode: "",
  personnelNumber: "",
  employerNumber: "",
  companyId: null,
  pointId: null,
  active: true,
  color: "#d8f1e8",
  ...extra
});

const loadEmployees = (employees) =>
  createDataStore({ employees, registrations: [], products: [], companies: [], points: [], auditLog: [] }).load().employees;

test("DataStore: oude gegevens zonder badgeId krijgen een leeg pasnummer", () => {
  const [employee] = loadEmployees([storedEmployee("e1")]);

  assert.equal(employee.badgeId, "");
});

test("DataStore: een geldig pasnummer blijft staan", () => {
  const [employee] = loadEmployees([storedEmployee("e1", { badgeId: "04A1B2C3" })]);

  assert.equal(employee.badgeId, "04A1B2C3");
});

test("DataStore: een ongeldig pasnummer wordt leeggemaakt, de medewerker blijft bestaan", () => {
  const invalid = [123, "04a1b2c3", "04:A1", "<img>", "A".repeat(65), null, { code: "x" }];
  const employees = loadEmployees(invalid.map((badgeId, index) => storedEmployee(`e${index}`, { badgeId })));

  assert.equal(employees.length, invalid.length);
  assert.ok(employees.every((employee) => employee.badgeId === ""));
});

test("DataStore: een pasnummer dat twee keer voorkomt, blijft alleen bij de eerste medewerker", () => {
  const employees = loadEmployees([
    storedEmployee("e1", { badgeId: "04A1B2C3" }),
    storedEmployee("e2", { badgeId: "04A1B2C3" })
  ]);

  assert.deepEqual(employees.map(({ badgeId }) => badgeId), ["04A1B2C3", ""]);
});

test("DataStore: isValidEmployee controleert badgeId als het er staat", () => {
  const store = createDataStore();

  assert.equal(store.isValidEmployee(storedEmployee("e1")), true);
  assert.equal(store.isValidEmployee(storedEmployee("e1", { badgeId: "" })), true);
  assert.equal(store.isValidEmployee(storedEmployee("e1", { badgeId: "04A1B2C3" })), true);
  assert.equal(store.isValidEmployee(storedEmployee("e1", { badgeId: "04a1" })), false);
  assert.equal(store.isValidEmployee(storedEmployee("e1", { badgeId: 1234 })), false);
});

test("de demogegevens hebben bij iedere medewerker een leeg pasnummer", () => {
  const { model } = createModel();
  const seed = model.createSeedState();

  assert.ok(seed.employees.every((employee) => employee.badgeId === ""));
});

// ------------------------------------------------------------------
// Het pasnummer komt niet in de CSV-export
// ------------------------------------------------------------------

test("het pasnummer staat niet in de CSV-export", () => {
  const { model } = createModel();
  model.state.employees[0].badgeId = "04A1B2C3";
  model.state.registrations = [registration("r1", "employee-1", "blikje", "2026-09-02T12:00:00")];

  const csvExport = new CsvExport(model);
  const csv = csvExport.toCsv(csvExport.buildRows("all", "all"));

  assert.ok(csv.includes("Test"), "de medewerker staat wel in de export");
  assert.ok(!csv.includes("04A1B2C3"));
  assert.ok(!/pas/i.test(csv.split("\n")[0]), "er is geen kolom voor het pasnummer");
});

test("met de instellingen uit config.js is ook het kortste pasnummer (4 tekens) te scannen", () => {
  const clock = createClock();
  const reader = new BadgeReader(BADGE_READER, clock);
  const scans = [];
  reader.onScan = (code) => scans.push(code);

  type(reader, clock, "A1B2", 4, "Enter");

  assert.ok(BADGE_READER.minLength <= 4, "minLength mag niet groter zijn dan het kortste pasnummer dat de beheerder kan koppelen");
  assert.deepEqual(scans, ["A1B2"]);
});
