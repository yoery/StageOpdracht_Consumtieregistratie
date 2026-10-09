// Regressietests voor de wijzigingen uit de TO-controle (versie 3.4):
//   1. "1 medewerker" / "2 medewerkers" in de lijst met bedrijven en consumptiepunten;
//   2. product verwijderen vraagt eerst om bevestiging;
//   3. dezelfde "bestaat niet meer"-melding bij een verwijderde medewerker (correctie "+");
//   4. alleen een inactieve medewerker zonder registraties kan worden verwijderd (ook in het model);
//   5. het werkgevernummer van een bedrijf is uniek;
//   6. controle bij het laden: dubbele id's, registraties ver in de toekomst, telling in de toekomst;
//   7. CSV: een veld dat met een tab, \r of \n begint, krijgt een apostrof;
//   8. lastRegistration = de laatst ingevoerde registratie; pointId en de voorraad bij een telling;
//   9. het SQL-schema: counted_at en geen rol 'manager'.
//  10. opslagknoppen: bij wijzigen is "Opslaan" primair; filters passen op een smal scherm.
//  11. eisen zonder test: actieve medewerkers (FR-01), zoeken op naam (FR-02), "−" verlaagt alleen
//      de keuze (FR-04), alle registraties voor de beheerder (FR-10), geen bedragen of aantallen
//      op de publieke pagina (FR-29).
//  12. "1 product" in de correctielijst.
//  13. klik op de medewerkerkaart (FR-32) en het totaal op de knop "Registreren" (FR-47).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { CsvExport } from "../assets/js/csvExport.js";
import { DEFAULT_PRODUCTS } from "../assets/js/config.js";
import {
  createModel, createRecordingView, createStrictView, createDataStore, createFakeElement, addEmployee, asAdmin
} from "./helpers.js";

// Console-waarschuwingen van DataStore horen bij deze tests; ze maken de uitvoer alleen onrustig.
console.warn = () => {};

// Controller met het testmodel (employee-1 op Hoofdkantoor van TVB), een nep-view en een
// ingelogde beheerder.
const createApp = ({ storeOptions, view = createRecordingView() } = {}) => {
  globalThis.document = { activeElement: null, querySelectorAll: () => [] };
  const { model, point } = createModel(storeOptions);
  const faceDemo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  return { app: asAdmin(new RegistrationApp(model, view, undefined, faceDemo)), model, view, point };
};

const toastTexts = (view) => view.toasts.map(({ message }) => message);

// Nep-window.confirm: onthoudt de vraag en geeft het opgegeven antwoord.
const fakeConfirm = (answer) => {
  const questions = [];
  globalThis.window = { confirm: (question) => { questions.push(question); return answer; } };
  return questions;
};

// Telt hoe vaak het model opslaat.
const countSaves = (model) => {
  const counter = { saves: 0 };
  const originalSave = model.save.bind(model);
  model.save = () => {
    counter.saves += 1;
    return originalSave();
  };
  return counter;
};

// Vult de velden van een formulier en zegt welke velden verplicht zijn.
const fillForm = (view, formSelector, values, requiredSelectors = []) => {
  for (const [selector, value] of Object.entries(values)) view.$(selector).value = value;
  const form = view.$(formSelector);
  form.querySelectorAll = (query) => (query === "[required]" ? requiredSelectors.map((selector) => view.$(selector)) : []);
  return form;
};
const submitEvent = () => ({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

// ------------------------------------------------------------------
// 1. Enkelvoud en meervoud bij het aantal medewerkers
// ------------------------------------------------------------------

test("punt 1: employeeCountText gebruikt enkelvoud bij 1 en meervoud bij 0 en 2", () => {
  const view = new RegistrationView(null);

  assert.equal(view.employeeCountText(0), "0 medewerkers");
  assert.equal(view.employeeCountText(1), "1 medewerker");
  assert.equal(view.employeeCountText(2), "2 medewerkers");
});

test("punt 1: de lijst met bedrijven en consumptiepunten toont '1 medewerker' en '2 medewerkers'", () => {
  const { model, point } = createModel();
  const view = new RegistrationView(model);
  const list = createFakeElement({ innerHTML: "" });
  view.$ = (selector) => (selector === "#adminCompanyList" ? list : null);

  view.renderAdminCompanies();
  assert.ok(list.innerHTML.includes("· 1 medewerker</small>"));
  assert.equal(list.innerHTML.includes("1 medewerkers"), false);
  assert.ok(list.innerHTML.includes("· 0 medewerkers</small>")); // bedrijven zonder medewerkers

  addEmployee(model, { companyId: point.companyId, pointId: point.id });
  view.renderAdminCompanies();
  assert.ok(list.innerHTML.includes("producten · 2 medewerkers</small>")); // het consumptiepunt
  assert.ok(list.innerHTML.includes("onbekend · 2 medewerkers</small>")); // het bedrijf TVB
});

// ------------------------------------------------------------------
// 2. Product verwijderen vraagt om bevestiging
// ------------------------------------------------------------------

test("punt 2: product verwijderen met 'Annuleren' verandert niets en slaat niets op", () => {
  const { app, model, view } = createApp();
  const counter = countSaves(model);
  const questions = fakeConfirm(false);

  app.removeProduct("boter");

  assert.deepEqual(questions, ["Product Boter verwijderen?"]);
  assert.ok(model.findProduct("boter"));
  assert.equal(counter.saves, 0);
  assert.equal(model.auditLog.length, 0);
  assert.deepEqual(toastTexts(view), []);
});

test("punt 2: product verwijderen met 'OK' verwijdert het product", () => {
  const { app, model, view } = createApp();
  const questions = fakeConfirm(true);

  app.removeProduct("boter");

  assert.equal(questions.length, 1);
  assert.equal(model.findProduct("boter"), undefined);
  assert.equal(model.auditLog.at(-1).action, "Product verwijderd");
  assert.deepEqual(toastTexts(view), ["Product verwijderd"]);
});

test("punt 2: een gebruikt product geeft meteen de melding, zonder bevestigingsvraag", () => {
  const { app, model } = createApp();
  model.addRegistration("employee-1", "blikje");
  const questions = fakeConfirm(true);

  app.removeProduct("blikje");

  assert.deepEqual(questions, []);
  assert.ok(model.findProduct("blikje"));
});

// ------------------------------------------------------------------
// 3. Correctie "+" voor een verwijderde medewerker
// ------------------------------------------------------------------

test("punt 3: correctie '+' voor een verwijderde medewerker geeft de gewone 'bestaat niet meer'-melding", () => {
  const { app, model, view } = createApp();

  assert.equal(app.addCorrection("weg", "blikje"), false);

  assert.equal(model.registrations.length, 0);
  assert.deepEqual(view.toasts, [{ message: "Deze medewerker bestaat niet meer; er is niets opgeslagen.", tone: "error" }]);
});

// ------------------------------------------------------------------
// 4. Alleen een inactieve medewerker zonder registraties verwijderen
// ------------------------------------------------------------------

test("punt 4: het model weigert een actieve medewerker te verwijderen", () => {
  const { model } = createModel();

  assert.equal(model.removeEmployee("employee-1"), false);
  assert.ok(model.findEmployee("employee-1"));
});

test("punt 4: het model weigert een inactieve medewerker met registraties te verwijderen", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");
  model.setEmployeeActive("employee-1", false);

  assert.equal(model.removeEmployee("employee-1"), false);
  assert.ok(model.findEmployee("employee-1"));
});

test("punt 4: het model verwijdert een inactieve medewerker zonder registraties", () => {
  const { model } = createModel();
  model.setEmployeeActive("employee-1", false);

  assert.equal(model.removeEmployee("employee-1"), true);
  assert.equal(model.findEmployee("employee-1"), undefined);
});

test("punt 4: het model geeft false voor een medewerker die niet bestaat", () => {
  const { model } = createModel();

  assert.equal(model.removeEmployee("bestaat-niet"), false);
  assert.equal(model.employees.length, 1);
});

test("punt 4: de controller weigert een actieve medewerker, zonder bevestigingsvraag", () => {
  const { app, model, view } = createApp();
  const counter = countSaves(model);
  const questions = fakeConfirm(true);

  app.removeEmployee("employee-1");

  assert.deepEqual(questions, []);
  assert.ok(model.findEmployee("employee-1"));
  assert.equal(counter.saves, 0);
  assert.deepEqual(view.toasts, [{
    message: "Zet deze medewerker eerst op inactief. Alleen een inactieve medewerker kan definitief worden verwijderd.",
    tone: "error",
    duration: 5000
  }]);
});

test("punt 4: de controller blijft een medewerker met registraties weigeren (ook als die actief is)", () => {
  const { app, model, view } = createApp();
  model.addRegistration("employee-1", "blikje");
  const questions = fakeConfirm(true);

  app.removeEmployee("employee-1");

  assert.deepEqual(questions, []);
  assert.ok(model.findEmployee("employee-1"));
  assert.deepEqual(toastTexts(view), [
    "Deze medewerker heeft registraties en kan niet definitief worden verwijderd. Deactiveren is voldoende."
  ]);
});

test("punt 4: de controller verwijdert een inactieve medewerker zonder registraties na bevestiging", () => {
  const { app, model, view } = createApp();
  model.setEmployeeActive("employee-1", false);
  const questions = fakeConfirm(true);

  app.removeEmployee("employee-1");

  assert.equal(questions.length, 1);
  assert.equal(model.findEmployee("employee-1"), undefined);
  assert.deepEqual(toastTexts(view), ["Inactieve medewerker definitief verwijderd"]);
});

// ------------------------------------------------------------------
// 5. Uniek werkgevernummer per bedrijf
// ------------------------------------------------------------------

test("punt 5: het model weigert een tweede bedrijf met hetzelfde werkgevernummer", () => {
  const { model } = createModel();
  assert.equal(model.saveCompany({ name: "Eerste BV", employerNumber: "123" }), true);
  const before = JSON.stringify(model.companies);

  assert.equal(model.saveCompany({ name: "Tweede BV", employerNumber: "123" }), false);
  assert.equal(model.saveCompany({ name: "Derde BV", employerNumber: " 123 " }), false);
  assert.equal(JSON.stringify(model.companies), before);
});

test("punt 5: een leeg werkgevernummer mag bij meerdere bedrijven; het eigen nummer houden mag ook", () => {
  const { model } = createModel();
  model.saveCompany({ name: "Eerste BV", employerNumber: "" });
  model.saveCompany({ name: "Tweede BV", employerNumber: "" });
  model.saveCompany({ name: "Derde BV", employerNumber: "456" });
  const third = model.companies.find(({ name }) => name === "Derde BV");

  assert.equal(model.saveCompany({ id: third.id, name: "Derde BV (nieuw)", employerNumber: "456" }), true);
  assert.equal(model.findCompany(third.id).name, "Derde BV (nieuw)");
  assert.equal(model.isEmployerNumberTaken("", null), false);
  assert.equal(model.isEmployerNumberTaken("456", third.id), false);
  assert.equal(model.isEmployerNumberTaken("456", null), true);
});

test("punt 5: het model weigert een bestaand bedrijf het nummer van een ander bedrijf te geven", () => {
  const { model } = createModel();
  model.saveCompany({ name: "Eerste BV", employerNumber: "111" });
  model.saveCompany({ name: "Tweede BV", employerNumber: "222" });
  const second = model.companies.find(({ name }) => name === "Tweede BV");

  assert.equal(model.saveCompany({ id: second.id, name: "Tweede BV", employerNumber: "111" }), false);
  assert.equal(model.findCompany(second.id).employerNumber, "222");
});

test("punt 5: het bedrijfsformulier toont een dubbel werkgevernummer bij het veld en slaat niets op", () => {
  const view = createStrictView(["#companyForm", "#companyName", "#companyEmployerNumber", "#companyFormModal"]);
  const { app, model } = createApp({ view });
  model.saveCompany({ name: "Eerste BV", employerNumber: "123" });
  const count = model.companies.length;
  const counter = countSaves(model);

  fillForm(view, "#companyForm", { "#companyName": "Nieuw BV", "#companyEmployerNumber": "123" }, ["#companyName"]);
  app.saveCompany(submitEvent());

  const field = view.$("#companyEmployerNumber");
  assert.deepEqual(view.fieldErrors.at(-1), { field, message: "Er bestaat al een bedrijf met dit werkgevernummer." });
  assert.equal(field.focused, true);
  assert.equal(model.companies.length, count);
  assert.equal(counter.saves, 0);
  assert.equal(model.auditLog.length, 0);
});

test("punt 5: het bedrijf zelf wijzigen met zijn eigen werkgevernummer lukt", () => {
  const view = createStrictView(["#companyForm", "#companyName", "#companyEmployerNumber", "#companyFormModal"]);
  const { app, model } = createApp({ view });
  model.saveCompany({ name: "Eerste BV", employerNumber: "123" });
  const company = model.companies.find(({ name }) => name === "Eerste BV");

  fillForm(view, "#companyForm", { "#companyName": "Eerste BV Holding", "#companyEmployerNumber": "123" }, ["#companyName"])
    .dataset.editingId = company.id;
  app.saveCompany(submitEvent());

  assert.equal(view.fieldErrors.length, 0);
  assert.equal(model.findCompany(company.id).name, "Eerste BV Holding");
});

// ------------------------------------------------------------------
// 6. Controle bij het laden
// ------------------------------------------------------------------

// Vast moment van laden, zodat de tests niet van de klok afhangen.
const LOAD_TIME = new Date("2026-10-06T12:00:00.000Z");

const storedData = () => ({
  employees: [{ id: "e1", name: "Jan Jansen", color: "#d8f1e8", active: true }],
  registrations: [{ id: "r1", employeeId: "e1", productId: "blikje", createdAt: "2026-10-01T10:00:00.000Z" }],
  products: DEFAULT_PRODUCTS,
  companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
  points: [{ id: "p1", name: "Hoofdkantoor", companyId: "c1", products: { blikje: { offered: true, stock: 10, minimum: 2 } } }],
  auditLog: []
});

test("punt 6: van twee regels met dezelfde id blijft alleen de eerste; reservekopie en loadProblem 'skipped'", () => {
  const data = storedData();
  data.employees.push({ id: "e1", name: "Dubbele Jan", color: "#d8f1e8", active: true });
  data.registrations.push({ id: "r1", employeeId: "e1", productId: "ei", createdAt: "2026-10-02T10:00:00.000Z" });
  data.companies.push({ id: "c1", name: "Ander bedrijf", employerNumber: "" });
  const store = createDataStore(data);

  const loaded = store.load(LOAD_TIME);

  assert.deepEqual(loaded.employees.map(({ name }) => name), ["Jan Jansen"]);
  assert.deepEqual(loaded.registrations.map(({ productId }) => productId), ["blikje"]);
  assert.deepEqual(loaded.companies.map(({ name }) => name), ["TVB"]);
  assert.equal(store.loadProblem, "skipped");
  assert.equal(localStorage.getItem("test-backup"), JSON.stringify(data));
});

test("punt 6: dubbele id's in producten, consumptiepunten en het logboek worden ook overgeslagen", () => {
  const data = storedData();
  data.products = [...DEFAULT_PRODUCTS, { id: "blikje", name: "Tweede blikje", price: 0.9 }];
  data.points.push({ id: "p1", name: "Kopie", companyId: "c1", products: {} });
  data.auditLog = [
    { id: "a1", action: "Product verwijderd", details: "Boter", createdAt: "2026-10-01T10:00:00.000Z" },
    { id: "a1", action: "Product verwijderd", details: "Kopie", createdAt: "2026-10-01T10:00:00.000Z" },
    { action: "Oude regel zonder id", details: "", createdAt: "2026-01-01T10:00:00.000Z" }
  ];
  const store = createDataStore(data);

  const loaded = store.load(LOAD_TIME);

  assert.equal(loaded.products.filter(({ id }) => id === "blikje").length, 1);
  assert.equal(loaded.products.find(({ id }) => id === "blikje").name, "Blikje");
  assert.deepEqual(loaded.points.map(({ name }) => name), ["Hoofdkantoor"]);
  assert.deepEqual(loaded.auditLog.map(({ details }) => details), ["Boter", ""]);
  assert.equal(store.loadProblem, "skipped");
});

test("punt 6: gegevens zonder dubbele id's geven geen loadProblem", () => {
  const store = createDataStore(storedData());

  store.load(LOAD_TIME);

  assert.equal(store.loadProblem, null);
  assert.equal(localStorage.getItem("test-backup"), null);
});

test("punt 6: een registratie van meer dan 24 uur na het laden wordt overgeslagen, binnen 24 uur niet", () => {
  const data = storedData();
  data.registrations.push(
    { id: "r2", employeeId: "e1", productId: "blikje", createdAt: "2026-10-07T12:00:00.000Z" }, // precies 24 uur later
    { id: "r3", employeeId: "e1", productId: "blikje", createdAt: "2026-10-07T12:00:01.000Z" }, // net te laat
    { id: "r4", employeeId: "e1", productId: "blikje", createdAt: "2027-01-01T00:00:00.000Z" } // ver in de toekomst
  );
  const store = createDataStore(data);

  const loaded = store.load(LOAD_TIME);

  assert.deepEqual(loaded.registrations.map(({ id }) => id), ["r1", "r2"]);
  assert.equal(store.loadProblem, "skipped");
});

test("punt 6: isValidRegistration vergelijkt met het moment van laden", () => {
  const store = createDataStore();
  const future = { id: "r9", employeeId: "e1", productId: "blikje", createdAt: "2026-10-08T12:00:00.000Z" };

  assert.equal(store.isValidRegistration(future, LOAD_TIME), false);
  assert.equal(store.isValidRegistration(future, new Date("2026-10-07T12:00:00.000Z")), true);
});

test("punt 6: een telling in de toekomst wordt weggelaten; een telling in het verleden blijft", () => {
  const data = storedData();
  data.points[0].products.blikje.countedAt = "2026-10-06T12:00:01.000Z"; // net na het laden
  data.points[0].products.ei = { offered: true, stock: 5, minimum: 1, countedAt: "2026-10-05T08:00:00.000Z" };
  const store = createDataStore(data);

  const loaded = store.load(LOAD_TIME);

  assert.equal("countedAt" in loaded.points[0].products.blikje, false);
  assert.equal(loaded.points[0].products.blikje.stock, 10); // de voorraad zelf blijft staan
  assert.equal(loaded.points[0].products.ei.countedAt, "2026-10-05T08:00:00.000Z");
  assert.equal(store.loadProblem, null); // een weggelaten telling is geen overgeslagen regel
});

test("punt 6: zonder telling in de toekomst verandert de voorraad weer bij een nieuwe registratie", () => {
  const data = storedData();
  data.employees[0].companyId = "c1";
  data.employees[0].pointId = "p1";
  data.points[0].products.blikje.countedAt = "2099-01-01T00:00:00.000Z";
  const store = createDataStore(data);

  const loaded = store.load(LOAD_TIME);
  const { model } = createModel();
  model.state = loaded;
  model.addRegistration("e1", "blikje", { createdAt: LOAD_TIME });

  assert.equal(model.findPoint("p1").products.blikje.stock, 9);
});

// ------------------------------------------------------------------
// 7. CSV: velden die met een tab, \r of \n beginnen
// ------------------------------------------------------------------

test("punt 7: een veld dat met een tab, \\r of \\n begint, krijgt altijd een apostrof", () => {
  const csv = new CsvExport(null);

  assert.equal(csv.escapeField("\tJan"), "'\tJan");
  assert.equal(csv.escapeField("\rJan"), "\"'\rJan\"");
  assert.equal(csv.escapeField("\nJan"), "\"'\nJan\"");
  assert.equal(csv.escapeField("\n=1+1"), "\"'\n=1+1\"");
  assert.equal(csv.escapeField("Jan\nJansen"), "\"Jan\nJansen\""); // een enter midden in het veld: alleen quotes
  assert.equal(csv.escapeField("Jan"), "Jan");
});

// ------------------------------------------------------------------
// 8. lastRegistration en pointId
// ------------------------------------------------------------------

test("punt 8: lastRegistration is de laatst ingevoerde registratie, ook als die een eerdere datum heeft", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje", { createdAt: new Date("2026-10-05T10:00:00.000Z") });
  model.addRegistration("employee-1", "blikje", { correction: true, createdAt: new Date("2026-09-15T10:00:00.000Z") });
  const enteredLast = model.registrations.at(-1);

  assert.equal(model.lastRegistration("employee-1", "blikje").id, enteredLast.id);

  model.removeLastRegistration("employee-1", "blikje");
  assert.deepEqual(model.registrations.map(({ createdAt }) => createdAt), ["2026-10-05T10:00:00.000Z"]);
});

test("punt 8: een registratie vóór de laatste telling bewaart pointId, maar de voorraad verandert niet", () => {
  const { model, point } = createModel();
  model.updateStockEntry(point.id, "blikje", (entry) => ({ ...entry, countedAt: "2026-10-05T00:00:00.000Z" }));

  model.addRegistration("employee-1", "blikje", { correction: true, createdAt: new Date("2026-10-01T12:00:00.000Z") });
  assert.equal(model.registrations[0].pointId, point.id);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);

  model.addRegistration("employee-1", "blikje", { createdAt: new Date("2026-10-06T12:00:00.000Z") });
  assert.equal(model.registrations[1].pointId, point.id);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 23);
});

// ------------------------------------------------------------------
// 9. SQL-schema
// ------------------------------------------------------------------

const schema = fs.readFileSync(new URL("../docs/DATABASE-SCHEMA.sql", import.meta.url), "utf8");

test("punt 9: point_products heeft counted_at (tijdstip van de laatste telling)", () => {
  const pointProducts = schema.slice(schema.indexOf("CREATE TABLE point_products"), schema.indexOf("CREATE OR REPLACE VIEW stock_alerts"));

  assert.match(pointProducts, /counted_at timestamptz,/);
});

test("punt 9: de rol 'manager' bestaat niet meer; alleen 'admin' en 'system_admin'", () => {
  assert.equal(/manager/i.test(schema), false);
  assert.ok(schema.includes("CHECK (role IN ('admin', 'system_admin'))"));
});

// Git slaat het bestand op met LF; op Windows (core.autocrlf) staat het lokaal met CRLF. Daarom
// wordt alleen gecontroleerd dat de regeleinden niet door elkaar staan, niet welke soort het is.
test("punt 9: het SQL-bestand heeft overal dezelfde regeleinden", () => {
  const lineFeeds = (schema.match(/\n/g) || []).length;
  const crlf = (schema.match(/\r\n/g) || []).length;

  assert.ok(lineFeeds > 0);
  assert.ok(crlf === 0 || crlf === lineFeeds, "geen mengsel van LF en CRLF");
});

// ------------------------------------------------------------------
// Punt 10: opslagknoppen bij toevoegen en wijzigen
// ------------------------------------------------------------------

test("punt 10: bij toevoegen is 'Opslaan' secundair en 'Opslaan + opnieuw' zichtbaar", () => {
  const { app, view } = createApp();

  app.setSaveButtons("#employeeForm", "#employeeSaveContinueButton", true);

  const close = view.$('#employeeForm [data-save-mode="close"]');
  assert.equal(view.$("#employeeSaveContinueButton").classList.contains("hidden"), false);
  assert.equal(close.classList.contains("secondary-button"), true);
  assert.equal(close.classList.contains("primary-button"), false);
});

test("punt 10: bij wijzigen is 'Opslaan' de enige en dus primaire knop", () => {
  const { app, view } = createApp();

  app.setSaveButtons("#productForm", "#consumptionSaveContinueButton", false);

  const close = view.$('#productForm [data-save-mode="close"]');
  assert.equal(view.$("#consumptionSaveContinueButton").classList.contains("hidden"), true);
  assert.equal(close.classList.contains("primary-button"), true);
  assert.equal(close.classList.contains("secondary-button"), false);
});

test("punt 10: op een smal scherm krijgen de filters de hele breedte en kunnen ze krimpen", () => {
  const css = fs.readFileSync(new URL("../assets/css/styles.css", import.meta.url), "utf8");
  const mobile = css.slice(css.indexOf("@media(max-width:720px)"));

  assert.match(mobile, /\.filter-row label \{\s*flex:1 1 100%;\s*min-width:0\s*\}/);
  assert.match(mobile, /\.filter-row select \{\s*width:100%;\s*min-width:0\s*\}/);
});

// ------------------------------------------------------------------
// Punt 11: eisen zonder test (FR-01, 02, 04, 10, 29)
// ------------------------------------------------------------------

// View met de nep-elementen die renderEmployees (de publieke medewerkerlijst) gebruikt.
const createEmployeeListView = (model, search = "") => {
  const view = new RegistrationView(model);
  const elements = {
    "#employeeSearch": createFakeElement({ value: search }),
    "#employeeCompanyFilter": createFakeElement(),
    "#employeeCount": createFakeElement(),
    "#emptyState": createFakeElement(),
    "#employeeList": createFakeElement({ innerHTML: "" })
  };
  view.$ = (selector) => elements[selector];
  return { view, elements };
};

// Welke medewerkers staan er in de publieke lijst? (de id's uit data-open-employee, gesorteerd)
const listedEmployeeIds = (html) => [...html.matchAll(/data-open-employee="([^"]+)"/g)].map(([, id]) => id).sort();

// Model met drie medewerkers: Test Medewerker (employee-1), Anna de Vries en Bram Jansen.
const createSearchModel = () => {
  const { model, point } = createModel();
  addEmployee(model, { id: "employee-2", name: "Anna de Vries", firstName: "Anna", lastName: "de Vries", companyId: point.companyId, pointId: point.id });
  addEmployee(model, { id: "employee-3", name: "Bram Jansen", firstName: "Bram", lastName: "Jansen", companyId: point.companyId, pointId: point.id });
  return model;
};

// Zoekt in de publieke lijst en geeft de id's van de medewerkers die overblijven.
const searchEmployees = (model, term) => {
  const { view, elements } = createEmployeeListView(model, term);
  view.renderEmployees();
  return listedEmployeeIds(elements["#employeeList"].innerHTML);
};

test("punt 11 (FR-01): de publieke medewerkerlijst toont alle actieve medewerkers en geen inactieve", () => {
  const model = createSearchModel();
  model.findEmployee("employee-2").active = false;
  const { view, elements } = createEmployeeListView(model);

  view.renderEmployees();

  assert.deepEqual(listedEmployeeIds(elements["#employeeList"].innerHTML), ["employee-1", "employee-3"]);
  assert.equal(elements["#employeeList"].innerHTML.includes("Anna de Vries"), false);
  assert.equal(elements["#employeeCount"].textContent, "2 totaal");
});

test("punt 11 (FR-02): zoeken op voornaam of achternaam toont alleen de medewerkers die passen", () => {
  const model = createSearchModel();

  assert.deepEqual(searchEmployees(model, "Anna"), ["employee-2"]); // voornaam
  assert.deepEqual(searchEmployees(model, "Jansen"), ["employee-3"]); // achternaam
  assert.deepEqual(searchEmployees(model, "de Vries"), ["employee-2"]); // achternaam met tussenvoegsel
  assert.deepEqual(searchEmployees(model, ""), ["employee-1", "employee-2", "employee-3"]); // geen zoekterm: iedereen
  assert.deepEqual(searchEmployees(model, "Pietersen"), []); // niemand past
});

test("punt 11 (FR-02): zoeken werkt ook met een deel van de naam, zonder op hoofdletters te letten", () => {
  const model = createSearchModel();

  assert.deepEqual(searchEmployees(model, "ans"), ["employee-3"]); // deel van "Jansen"
  assert.deepEqual(searchEmployees(model, "VRIES"), ["employee-2"]); // hoofdletters
  assert.deepEqual(searchEmployees(model, "bRaM"), ["employee-3"]); // gemengde letters
  assert.deepEqual(searchEmployees(model, "  anna  "), ["employee-2"]); // spaties eromheen tellen niet mee
});

test("punt 11 (FR-04): de '−' in het productvenster verlaagt alleen de keuze en verwijdert geen registratie", () => {
  const { app, model, view } = createApp();
  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "blikje");
  const before = model.registrations.map(({ id }) => id);
  const shownSelection = () => view.calls.filter(([name]) => name === "renderEmployeeProducts").at(-1)[2];

  app.openEmployeeProducts("employee-1");
  assert.deepEqual(shownSelection(), {}); // het venster begint met een lege keuze, niet met de registraties

  app.incrementProduct("blikje");
  app.decrementProduct("blikje");
  assert.equal(app.selectedProducts.blikje, 0);

  app.decrementProduct("blikje"); // nooit onder 0
  app.decrementProduct("ei"); // een product dat niet gekozen is
  assert.equal(app.selectedProducts.blikje, 0);
  assert.equal(app.selectedProducts.ei, undefined);
  assert.deepEqual(shownSelection(), { blikje: 0 });

  // De twee bestaande registraties zijn er nog precies zo.
  assert.equal(model.registrations.length, 2);
  assert.deepEqual(model.registrations.map(({ id }) => id), before);
});

test("punt 11 (FR-10): met filter 'alle' ziet de beheerder iedere registratie, nieuwste eerst", () => {
  const { model } = createModel();
  addEmployee(model, { id: "employee-2", name: "Anna de Vries", firstName: "Anna", lastName: "de Vries" });
  model.addRegistration("employee-1", "blikje", { createdAt: new Date("2026-03-02T09:00:00Z") });
  model.addRegistration("employee-2", "ei", { createdAt: new Date("2026-03-04T09:00:00Z") });
  model.addRegistration("employee-1", "yoghurt", { createdAt: new Date("2026-03-03T09:00:00Z") });

  const view = new RegistrationView(model);
  const elements = {
    "#filterMonth": createFakeElement({ value: "all" }),
    "#filterEmployee": createFakeElement({ value: "all" }),
    "#adminTableBody": createFakeElement({ innerHTML: "" })
  };
  view.$ = (selector) => elements[selector];

  view.renderAdmin();

  const rows = elements["#adminTableBody"].innerHTML.match(/<tr>[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, 3);

  // Per rij: medewerker, product, "+1" en de datum (nieuwste registratie bovenaan).
  const expected = [
    ["Anna de Vries", "Ei", "2026-03-04T09:00:00Z"],
    ["Test Medewerker", "Yoghurt", "2026-03-03T09:00:00Z"],
    ["Test Medewerker", "Blikje", "2026-03-02T09:00:00Z"]
  ];
  expected.forEach(([name, product, date], index) => {
    const cells = [...rows[index].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell.trim());
    assert.deepEqual(cells, [name, product, "+1", view.formatDate(date)]);
  });
});

test("punt 11 (FR-29): de publieke medewerkerlijst toont geen bedragen en geen persoonlijke aantallen", () => {
  const { model } = createModel();
  for (let count = 0; count < 3; count += 1) model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "beleg");
  const { view, elements } = createEmployeeListView(model);

  view.renderEmployees();

  const html = elements["#employeeList"].innerHTML;
  const visibleText = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  assert.ok(html.includes('data-open-employee="employee-1"')); // de medewerker staat er wel
  assert.equal(html.includes("€"), false); // geen bedrag
  assert.equal(html.includes("&euro;"), false);
  assert.doesNotMatch(visibleText, /\d/); // geen aantal (4 registraties) en geen totaalbedrag (€ 2,45)
  assert.match(html, /<div class="employee-total">Klik om een product te kiezen<\/div>/);
});

// ------------------------------------------------------------------
// Punt 12: enkelvoud in de correctielijst
// ------------------------------------------------------------------

test("punt 12: de correctielijst schrijft '1 product', maar '0 producten' en '2 producten'", () => {
  const { model } = createModel();
  const view = new RegistrationView(model);

  assert.equal(view.productCountText(0), "0 producten");
  assert.equal(view.productCountText(1), "1 product");
  assert.equal(view.productCountText(2), "2 producten");
});

// ------------------------------------------------------------------
// Punt 13: medewerkerkaart aanklikken (FR-32) en het totaal op "Registreren" (FR-47)
// ------------------------------------------------------------------

test("punt 13 (FR-32): een klik op de medewerkerkaart opent het productvenster van die medewerker", () => {
  const { app } = createApp();
  const card = { dataset: { openEmployee: "employee-1" } };
  // De klik komt binnen op een element in de kaart; closest vindt alleen de kaart zelf.
  const event = { target: { closest: (selector) => (selector === "[data-open-employee]" ? card : null) } };

  app.handleClick(event);

  assert.equal(app.selectedEmployeeId, "employee-1");
});

test("punt 13 (FR-47): de knop 'Registreren' toont het totaal aantal gekozen producten", () => {
  const { model } = createModel();
  const view = new RegistrationView(model);
  const elements = new Map();
  view.$ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createFakeElement());
    return elements.get(selector);
  };
  const button = view.$("#registerSelectedProductsButton");

  view.renderEmployeeProducts("employee-1", {});
  assert.equal(button.textContent, "Registreren");

  view.renderEmployeeProducts("employee-1", { blikje: 2, ei: 1 });
  assert.equal(button.textContent, "Registreren (3)");
});
