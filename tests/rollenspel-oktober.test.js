// Regressietests voor de fouten uit de rollenspeltests en de FMEA van oktober 2026 (versie 3.16 van
// het TO). Ieder blok hoort bij één punt:
//   1. sluiten van het productvenster zonder registreren maakt zoekveld en bedrijfsfilter leeg;
//   4. twee tabbladen: een opslag van het ene tabblad wist de wijziging van het andere niet meer;
//   6. een telling zet verwacht, geteld en het verschil in het logboek;
//   7. een gewijzigde prijs, looncode, personeelsnummer of werkgevernummer staat oud en nieuw in het logboek;
//   9. "Zelfde als vorige keer" is minstens 44 pixels hoog;
//  10. hover-stijlen van tikdoelen alleen met een muis of pen (@media (hover:hover));
//  11. registreren bij voorraad 0 mag (volgens het TO) en geeft de status "Leeg";
//  12. de CSV-export zet geen apostrof voor een negatief getal in een getalkolom;
//  13. het productieschema bepaalt de maand in Nederlandse tijd en zegt "Leeg" in plaats van "Op";
//  14. het TO noemt de juiste melding bij een volle opslag, de juiste tijdzone in de CI en de
//      gemeten grootte van een registratie.
// De punten 2, 3, 5 en 8 zijn vervallen: de functie waar ze over gingen, bestaat niet meer.
// De browsertests in tests/e2e/app.e2e.test.js controleren 1 en 4 ook in een echte browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationModel, STOCK_STATUS, MAX_AUDIT_DETAILS } from "../assets/js/RegistrationModel.js";
import { DataStore } from "../assets/js/DataStore.js";
import { CsvExport } from "../assets/js/CsvExport.js";
import { BadgeReader } from "../assets/js/BadgeReader.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { StockController } from "../assets/js/controllers/StockController.js";
import { FormController } from "../assets/js/controllers/FormController.js";
import { createModel, addEmployee, createRecordingView, createFakeElement, fakeLocalStorageWithKeys, asAdmin, readAllCss } from "./helpers.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = readAllCss();
const appSource = read("../assets/js/RegistrationApp.js");
const schema = read("../docs/DATABASE-SCHEMA.sql").replace(/\r\n/g, "\n");
const to = read("../docs/TO-CONSUMPTIEREGISTRATIE.md");

// Nep-klok met setTimeout en setInterval; `advance(ms)` laat de tijd verstrijken en voert de timers uit.
const createClock = (start = Date.UTC(2026, 9, 20, 10, 0)) => {
  const timers = new Map();
  let nextId = 1;
  const clock = {
    time: start,
    now: () => clock.time,
    setTimeout: (action, delay) => { const id = nextId++; timers.set(id, { action, at: clock.time + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (action, delay) => { const id = nextId++; timers.set(id, { action, at: clock.time + delay, every: delay }); return id; },
    clearInterval: (id) => timers.delete(id),
    advance: (ms) => {
      const end = clock.time + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        clock.time = timer.at;
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        timer.action();
      }
      clock.time = end;
    }
  };
  return clock;
};

// Controller met het testmodel (employee-1 "Test Medewerker" met pas 04A1B2C3, employee-2 "Tweede
// Medewerker" met pas 0499AABB, allebei op Hoofdkantoor), een nep-view en een nep-klok.
const createApp = ({ failSave = false } = {}) => {
  const { model, point } = createModel({ failSave });
  model.state.employees[0].badgeId = "04A1B2C3";
  addEmployee(model, { badgeId: "0499AABB", companyId: point.companyId, pointId: point.id });
  const view = createRecordingView();
  view.$("#faceModal").classList.add("hidden");
  const clock = createClock();
  const demo = new FaceRecognitionDemo({ enabled: false }, null);
  const reader = new BadgeReader({ enabled: true, minLength: 4, maxKeyIntervalMs: 40, endDelayMs: 120 }, {
    now: () => 0, setTimeout: () => 0, clearTimeout: () => {}
  });
  const app = asAdmin(new RegistrationApp(model, view, undefined, demo, reader, clock));
  const openModals = [];
  globalThis.document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? openModals : [])
  };
  return { app, model, view, clock, point, openModals };
};

const toastTexts = (view) => view.toasts.map(({ message }) => message);

// ------------------------------------------------------------------
// 1. Sluiten van het productvenster zonder registreren
// ------------------------------------------------------------------

test("1: sluiten zonder registreren (kruisje, achtergrond of Escape) maakt zoekveld en bedrijfsfilter leeg", () => {
  const { app, view } = createApp();
  view.$("#employeeSearch").value = "Test";
  view.$("#employeeCompanyFilter").value = "TVB";
  view.$("#employeeCompanyFilter").dataset.value = "company-tvb";
  let focusOptions = null;
  view.$('[data-open-employee="employee-1"]').focus = (options) => { focusOptions = options; };
  app.openEmployeeProducts("employee-1");
  app.incrementProduct("blikje");

  app.dismissEmployeeProducts();

  assert.equal(app.selectedEmployeeId, null);
  assert.deepEqual(app.selectedProducts, {});
  assert.equal(view.$("#employeeSearch").value, "");
  assert.equal(view.$("#employeeCompanyFilter").value, "");
  assert.equal(view.$("#employeeCompanyFilter").dataset.value, "all");
  assert.equal(view.$("#employeeCompanyFilter").getAttribute("aria-expanded"), "false");
  assert.ok(view.calls.some(([name]) => name === "renderAll"));
  assert.deepEqual(focusOptions, { preventScroll: true }, "de focus gaat terug naar de rij zonder te scrollen");
});

test("1: het kruisje, de achtergrond en Escape van het productvenster gebruiken dismissEmployeeProducts", () => {
  assert.match(appSource, /registerModalClose\("#employeeProductsModal", "\[data-close-employee-products\]", \(\) => this\.dismissEmployeeProducts\(\)\)/);
});

// ------------------------------------------------------------------
// 4. Twee tabbladen op één opslag
// ------------------------------------------------------------------

// Twee "tabbladen": twee modellen (en controllers) met een eigen DataStore op dezelfde nep-localStorage.
// Tabblad B krijgt het storage-event van A niet: zo gaat het als B opslaat voordat dat event binnen is.
const createTabs = () => {
  fakeLocalStorageWithKeys();
  const modelA = new RegistrationModel(new DataStore("tvb-tabs"));
  assert.equal(modelA.save(), true);
  const modelB = new RegistrationModel(new DataStore("tvb-tabs"));
  const tab = (model) => {
    const view = createRecordingView();
    const app = new RegistrationApp(model, view, undefined, new FaceRecognitionDemo({ enabled: false }, null), new BadgeReader({ enabled: false }));
    return { app, view, model };
  };
  return { a: tab(modelA), b: tab(modelB), employeeId: modelA.employees[0].id };
};

const storedRegistrations = () => JSON.parse(localStorage.getItem("tvb-tabs")).registrations.map(({ productId }) => productId);

test("4: DataStore schrijft niet over een opslag heen die een ander tabblad intussen heeft gewijzigd", () => {
  const { a, b, employeeId } = createTabs();
  a.model.addRegistration(employeeId, "blikje");
  assert.equal(a.model.save(), true);

  b.model.addRegistration(employeeId, "ei");
  assert.equal(b.model.save(), false, "tabblad B had de registratie van A nog niet geladen");
  assert.equal(b.model.saveProblem, "conflict");
  assert.deepEqual(storedRegistrations(), ["blikje"], "de registratie van A is niet overschreven");
});

test("4: persist laadt bij een conflict eerst de nieuwe gegevens en voert de wijziging opnieuw uit", () => {
  const { a, b, employeeId } = createTabs();
  assert.equal(a.app.persist(() => a.model.addRegistration(employeeId, "blikje")), true);

  const saved = b.app.persist(() => b.model.addRegistration(employeeId, "ei"), { action: "Test", details: "tabblad B" });

  assert.equal(saved, true);
  assert.deepEqual(storedRegistrations(), ["blikje", "ei"], "beide registraties zijn bewaard");
  assert.deepEqual(b.model.registrations.map(({ productId }) => productId), ["blikje", "ei"]);
  assert.equal(b.model.auditLog.filter(({ details }) => details === "tabblad B").length, 1, "één logboekregel, niet twee");
  assert.deepEqual(toastTexts(b.view), []);

  // Daarna werkt tabblad A ook verder zonder iets te wissen (het laadt eerst de opslag van B).
  assert.equal(a.app.persist(() => a.model.addRegistration(employeeId, "yoghurt")), true);
  assert.deepEqual(storedRegistrations(), ["blikje", "ei", "yoghurt"]);
});

test("4: past de wijziging na het opnieuw laden niet meer, dan wordt er niets opgeslagen met een melding", () => {
  const { a, b } = createTabs();
  const productId = a.model.products.at(-1).id;
  // Tabblad A verwijdert intussen het product dat B wil wijzigen.
  a.model.state.products = a.model.products.filter(({ id }) => id !== productId);
  assert.equal(a.model.save(), true);

  const saved = b.app.persist(() => (b.model.findProduct(productId) ? undefined : false));

  assert.equal(saved, false);
  assert.deepEqual(toastTexts(b.view), ["Er is niets gewijzigd: de gegevens zijn intussen veranderd."]);
  assert.equal(b.model.findProduct(productId), undefined, "B toont nu de gegevens van A");
});

test("4: na Alle gegevens wissen en na opnieuw laden telt de nieuwe opslag als de laatst geziene", () => {
  const { a, b, employeeId } = createTabs();
  assert.equal(a.model.wipeAll(), true);
  assert.equal(a.model.save(), true, "na wissen slaat A de nieuwe demogegevens op");
  assert.equal(b.model.reload(), true);
  assert.equal(b.app.persist(() => b.model.addRegistration(b.model.employees[0].id, "ei")), true);
  assert.equal(storedRegistrations().length, 1);
  assert.ok(employeeId);
});

// ------------------------------------------------------------------
// 6. Telling: verwacht, geteld en verschil
// ------------------------------------------------------------------

const stockInput = (productId, field, value) => {
  const input = createFakeElement({ value });
  input.dataset = { productId, stockField: field };
  return input;
};

test("6: een telling zet de verwachte voorraad, de getelde voorraad en het verschil in het logboek", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;
  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "blikje");

  app.saveStockField(stockInput("blikje", "stock", "20"));

  assert.equal(model.findPoint(point.id).products.blikje.stock, 20);
  assert.equal(model.auditLog.at(-1).action, "Voorraad geteld");
  assert.equal(model.auditLog.at(-1).details, "Blikje op TVB · Hoofdkantoor: verwacht 22, geteld 20, verschil -2");
});

test("6: het verschil heeft altijd dezelfde vorm, met + bij meer dan verwacht", () => {
  assert.equal(StockController.countText(20, 23), "verwacht 20, geteld 23, verschil +3");
  assert.equal(StockController.countText(20, 20), "verwacht 20, geteld 20, verschil 0");
  assert.equal(StockController.countText(-1, 0), "verwacht -1, geteld 0, verschil +1");
});

test("6: een minimum wijzigen blijft een gewone regel zonder verwacht en geteld", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;
  app.saveStockField(stockInput("blikje", "minimum", "8"));
  assert.equal(model.auditLog.at(-1).details, "Blikje op TVB · Hoofdkantoor: 8");
});

// ------------------------------------------------------------------
// 7. Oude en nieuwe waarde in het logboek
// ------------------------------------------------------------------

const fillForm = (view, formSelector, values, requiredSelectors = []) => {
  for (const [selector, value] of Object.entries(values)) view.$(selector).value = value;
  const form = view.$(formSelector);
  form.querySelectorAll = (query) => (query === "[required]" ? requiredSelectors.map((selector) => view.$(selector)) : []);
  return form;
};
const submitEvent = () => ({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

test("7: een gewijzigde prijs staat met de oude en de nieuwe prijs in het logboek", () => {
  const { app, model, view } = createApp();
  const form = fillForm(view, "#productForm", { "#productName": "Blikje", "#productPrice": "0.70" }, ["#productName", "#productPrice"]);
  form.dataset.editingId = "blikje";

  app.saveProduct(submitEvent());

  assert.equal(model.findProduct("blikje").price, 0.7);
  assert.equal(model.auditLog.at(-1).action, "Product gewijzigd");
  assert.equal(model.auditLog.at(-1).details, "Blikje: prijs van € 0,65 naar € 0,70");
});

test("7: een product wijzigen zonder andere prijs geeft alleen de naam", () => {
  const { app, model, view } = createApp();
  const form = fillForm(view, "#productForm", { "#productName": "Blikje frisdrank", "#productPrice": "0.65" }, ["#productName", "#productPrice"]);
  form.dataset.editingId = "blikje";

  app.saveProduct(submitEvent());

  assert.equal(model.auditLog.at(-1).details, "Blikje frisdrank");
});

test("7: gewijzigde looncode en personeelsnummer staan oud en nieuw in het logboek, het pasnummer nooit", () => {
  const { app, model, view, point } = createApp();
  const form = fillForm(view, "#employeeForm", {
    "#newEmployeeFirstName": "Test",
    "#newEmployeeLastName": "Medewerker",
    "#newEmployeePayrollCode": "101",
    "#newEmployeePersonnelNumber": "5001",
    "#newEmployeeEmployerNumber": "",
    "#newEmployeeCompany": point.companyId,
    "#newEmployeePoint": point.id,
    "#newEmployeeBadgeId": "04FFEEDD"
  }, ["#newEmployeeFirstName", "#newEmployeeLastName", "#newEmployeePayrollCode", "#newEmployeePersonnelNumber", "#newEmployeeCompany"]);
  form.dataset.editingId = "employee-1";

  app.saveEmployee(submitEvent());

  assert.equal(model.findEmployee("employee-1").badgeId, "04FFEEDD");
  assert.equal(model.auditLog.at(-1).action, "Medewerker gewijzigd");
  assert.equal(model.auditLog.at(-1).details, "Test Medewerker: looncode van leeg naar 101, personeelsnummer van leeg naar 5001");
  assert.equal(JSON.stringify(model.auditLog).includes("04FFEEDD"), false);
  assert.equal(JSON.stringify(model.auditLog).includes("04A1B2C3"), false);
});

test("7: een gewijzigd werkgevernummer van een bedrijf staat oud en nieuw in het logboek", () => {
  const { app, model, view, point } = createApp();
  const company = model.findCompany(point.companyId);
  const form = fillForm(view, "#companyForm", { "#companyName": company.name, "#companyEmployerNumber": "4711" }, ["#companyName"]);
  form.dataset.editingId = company.id;

  app.saveCompany(submitEvent());

  assert.equal(model.auditLog.at(-1).details, `${company.name}: werkgevernummer van leeg naar 4711`);
});

test("7: een heel lange logboekregel wordt ingekort, zodat hij na herladen niet als beschadigd wordt overgeslagen", () => {
  const { model } = createModel();
  model.logAdminAction("Medewerker gewijzigd", "x".repeat(700));
  assert.equal(model.auditLog.at(-1).details.length, MAX_AUDIT_DETAILS);
  assert.equal(model.auditLog.at(-1).details.endsWith("…"), true);
  assert.equal(new DataStore("test").isValidAuditEntry(model.auditLog.at(-1)), true);
  assert.equal(FormController.changeText(null, { price: 1 }, [["price", "prijs"]]), "", "bij toevoegen geen oude waarde");
});

// ------------------------------------------------------------------
// 9 en 10. Tikdoelen en hover
// ------------------------------------------------------------------

test("9: Zelfde als vorige keer is minstens 44 pixels hoog", () => {
  const start = css.indexOf("\n.suggestion .secondary-button {");
  assert.notEqual(start, -1);
  assert.match(css.slice(start, css.indexOf("}", start)), /min-height:44px/);
});

// De stylesheet zonder de blokken @media (hover:hover) { ... }.
const withoutHoverMedia = (source) => {
  let result = "";
  let index = 0;
  for (;;) {
    const start = source.indexOf("@media (hover:hover) {", index);
    if (start === -1) return result + source.slice(index);
    result += source.slice(index, start);
    let depth = 0;
    let position = source.indexOf("{", start);
    for (; position < source.length; position += 1) {
      if (source[position] === "{") depth += 1;
      if (source[position] === "}") depth -= 1;
      if (depth === 0) break;
    }
    index = position + 1;
  }
};

test("10: de hover-stijlen van medewerkerrijen en + en − staan alleen binnen @media (hover:hover)", () => {
  const outside = withoutHoverMedia(css);
  for (const selector of [".employee-row:hover", ".employee-row-clickable:hover", ".personal-product-plus:hover", ".personal-product-minus:hover"]) {
    assert.ok(css.includes(selector), `${selector} bestaat`);
    assert.equal(outside.includes(selector), false, `${selector} staat buiten @media (hover:hover)`);
  }
  // De focusrand voor het toetsenbord blijft wel altijd gelden.
  assert.match(outside, /\.personal-product-plus:focus-visible \{/);
});

// ------------------------------------------------------------------
// 11. Registreren bij voorraad 0
// ------------------------------------------------------------------

test("11: registreren bij voorraad 0 mag (TO hoofdstuk 8) en geeft voorraad -1 met de status Leeg", () => {
  const { model, point } = createModel();
  model.setStock(point.id, "blikje", 0);
  // Een registratie op een later tijdstip dan de telling.
  model.addRegistration("employee-1", "blikje", { createdAt: new Date(Date.now() + 1000) });

  const entry = model.stockEntry(point.id, "blikje");
  assert.equal(entry.stock, -1);
  assert.equal(STOCK_STATUS[model.stockStatus(entry)], "Leeg");
  assert.ok(model.stockAlerts().some(({ product, status }) => product.id === "blikje" && status === "out"));
  assert.match(to, /Een negatieve voorraad mag \(er is dan meer geregistreerd dan geteld\)/);
});

// ------------------------------------------------------------------
// 12. CSV: negatieve getallen in getalkolommen
// ------------------------------------------------------------------

test("12: een negatief getal in een getalkolom krijgt geen apostrof, tekst wel", () => {
  const csv = new CsvExport(null);
  assert.equal(csv.escapeField("-0,65", { numeric: true }), "-0,65");
  assert.equal(csv.escapeField(-1, { numeric: true }), "-1");
  assert.equal(csv.escapeField("-0,65"), "'-0,65", "in een tekstkolom blijft de bescherming");
  // Iets dat geen getal is, wordt ook in een getalkolom beschermd.
  assert.equal(csv.escapeField("-1+1", { numeric: true }), "'-1+1");
  assert.equal(csv.escapeField("=1+1", { numeric: true }), "'=1+1");
  assert.equal(csv.escapeField(" -1", { numeric: true }), "' -1");
});

test("12: toCsv laat negatieve aantallen en bedragen staan en beschermt de tekstkolommen", () => {
  const csv = new CsvExport(null);
  const text = csv.toCsv([{ Jaar: 2026, Maand: 11, Looncode: "-5", Personeelsnummer: "12", Werkgevernummer: "", Naam: "@Jan", Totaal: -1, Prijs: "-0,65" }]);
  const [header, row] = text.split("\r\n");
  assert.equal(header, CsvExport.COLUMNS.join(";"));
  assert.equal(row, "2026;11;'-5;12;;'@Jan;-1;-0,65");
});

// ------------------------------------------------------------------
// 13. Productieschema
// ------------------------------------------------------------------

test("13: de maand in monthly_employee_consumption wordt in Nederlandse tijd bepaald", () => {
  const view = schema.slice(schema.indexOf("CREATE OR REPLACE VIEW monthly_employee_consumption"));
  const matches = view.match(/date_trunc\('month', r\.registered_at AT TIME ZONE 'Europe\/Amsterdam'\)::date/g) || [];
  assert.equal(matches.length, 2, "in de SELECT en in de GROUP BY");
  assert.equal(/date_trunc\('month', r\.registered_at\)/.test(schema), false, "geen date_trunc in de tijdzone van de sessie");
});

test("13: stock_alerts zegt Leeg, net als de demo", () => {
  const view = schema.slice(schema.indexOf("CREATE OR REPLACE VIEW stock_alerts"), schema.indexOf("CREATE TABLE", schema.indexOf("CREATE OR REPLACE VIEW stock_alerts")));
  assert.match(view, /CASE WHEN pp\.stock <= 0 THEN 'Leeg' ELSE 'Bijbestellen' END AS status/);
  assert.equal(view.includes("'Op'"), false);
});

// ------------------------------------------------------------------
// 14. TO: melding bij volle opslag, tijdzone in de CI en grootte van een registratie
// ------------------------------------------------------------------

test("14: hoofdstuk 13 noemt bij een volle opslag de eigen melding uit versie 3.11", () => {
  const row = to.split("\n").find((line) => line.startsWith("| Opslag kan vollopen |"));
  assert.ok(row);
  assert.match(row, /De opslag van de browser is vol\. Er is niets opgeslagen\. Vraag de beheerder om de registraties te exporteren en oude gegevens te wissen\./);
  assert.equal(row.includes("Opslaan mislukt. Probeer het opnieuw."), false);
});

test("14: hoofdstuk 15 zegt per CI-job welke tijdzone geldt, zoals ci.yml het instelt", () => {
  const ci = read("../.github/workflows/ci.yml");
  assert.match(ci, /TZ: Europe\/Amsterdam/);
  const strategy = to.slice(to.indexOf("### Teststrategie"), to.indexOf("### Testplan herkenningsnauwkeurigheid"));
  assert.equal(strategy.includes("De CI-workflow draait op `ubuntu-latest` en stelt geen tijdzone in"), false);
  assert.match(strategy, /De job met de unit tests stelt geen tijdzone in/);
  assert.match(strategy, /De job met de browsertests zet `TZ: Europe\/Amsterdam`/);
});

test("14: de grootte van een registratie in het TO is gemeten met DataStore (243 tekens met, 219 zonder werkgevernummer)", () => {
  fakeLocalStorageWithKeys();
  const model = new RegistrationModel(new DataStore("tvb-grootte"));
  const employeeId = model.employees[0].id;
  model.save();
  // Hoeveel tekens de opgeslagen tekst langer wordt door één registratie (de eerste registratie in de
  // lijst heeft nog geen komma ervoor, daarom wordt de tweede gemeten).
  const measure = () => {
    model.addRegistration(employeeId, "blikje");
    model.save();
    const before = localStorage.getItem("tvb-grootte").length;
    model.addRegistration(employeeId, "blikje");
    model.save();
    return localStorage.getItem("tvb-grootte").length - before;
  };
  const withoutEmployerNumber = measure();
  model.state.employees = model.employees.map((employee) => (employee.id === employeeId ? { ...employee, employerNumber: "4711" } : employee));
  model.state.registrations = [];
  const withEmployerNumber = measure();

  // Plus 1 voor de komma tussen twee registraties in de lijst.
  assert.equal(withoutEmployerNumber, 219 + 1);
  assert.equal(withEmployerNumber, 243 + 1);
  assert.equal(/\b245 tekens\b/.test(to), false, "het TO noemt nergens meer 245 tekens");
  assert.match(to, /243 tekens/);
  assert.match(to, /219 tekens/);
});

// ------------------------------------------------------------------
// 15. Logboek past in het beheervenster
// ------------------------------------------------------------------

test("15: in het logboek mag de kolom Details afbreken, zodat Datum & tijd zichtbaar blijft", () => {
  assert.match(css, /#auditTab \.admin-table-wrap td:nth-child\(2\) \{\s*white-space:normal;/);
});
