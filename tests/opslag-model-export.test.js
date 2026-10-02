// Tests voor de opslag (reservekopieën, wissen, strengere controle bij het laden),
// de voorraadtelling, de nieuwe modelmethodes en de beveiliging van de CSV-export.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DataStore } from "../assets/js/DataStore.js";
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { CsvExport } from "../assets/js/csvExport.js";
import { COLORS, DEFAULT_PRODUCTS } from "../assets/js/config.js";
import { createModel, createDataStore, fakeLocalStorage, registration } from "./helpers.js";

// Geldige opgeslagen gegevens; iedere test past er één ding in aan.
const validData = () => ({
  employees: [{ id: "e1", name: "Jan Jansen", color: "#d8f1e8", active: true, companyId: "c1", pointId: "p1" }],
  registrations: [{ id: "r1", employeeId: "e1", productId: "blikje", pointId: "p1", price: 0.65, createdAt: "2026-09-10T10:00:00.000Z" }],
  products: DEFAULT_PRODUCTS.map((product) => ({ ...product })),
  companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
  points: [{ id: "p1", name: "Kantine", companyId: "c1", products: { blikje: { offered: true, stock: 5, minimum: 1 } } }],
  auditLog: [{ id: "a1", action: "Test", details: "Regel", createdAt: "2026-09-10T10:00:00.000Z" }]
});

// ------------------------------------------------------------------
// Reservekopieën en alles wissen
// ------------------------------------------------------------------

test("er zijn hooguit twee reservekopieën, hoe vaak er ook beschadigde gegevens worden geladen", () => {
  fakeLocalStorage();
  const keys = [];
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => { keys.push(key); setItem(key, value); };

  for (const broken of ["{kapot 1", "{kapot 2", "{kapot 3"]) {
    localStorage.setItem("test", broken);
    new DataStore("test").load();
  }

  const backupKeys = new Set(keys.filter((key) => key.startsWith("test-backup")));
  assert.deepEqual([...backupKeys].sort(), ["test-backup", "test-backup-laatste"]);
  assert.equal(localStorage.getItem("test-backup"), "{kapot 1");
  assert.equal(localStorage.getItem("test-backup-laatste"), "{kapot 3");
});

test("dezelfde beschadigde gegevens opnieuw laden maakt geen tweede reservekopie", () => {
  fakeLocalStorage();
  localStorage.setItem("test", "{kapot");

  new DataStore("test").load();
  new DataStore("test").load();

  assert.equal(localStorage.getItem("test-backup"), "{kapot");
  assert.equal(localStorage.getItem("test-backup-laatste"), null);
});

test("clearAll wist de gegevens en beide reservekopieën", () => {
  fakeLocalStorage();
  localStorage.setItem("test", "{}");
  localStorage.setItem("test-backup", "a");
  localStorage.setItem("test-backup-laatste", "b");
  localStorage.setItem("ander-bestand", "blijft");

  assert.equal(new DataStore("test").clearAll(), true);

  assert.equal(localStorage.getItem("test"), null);
  assert.equal(localStorage.getItem("test-backup"), null);
  assert.equal(localStorage.getItem("test-backup-laatste"), null);
  assert.equal(localStorage.getItem("ander-bestand"), "blijft");
});

test("clearAll wist ook oude reservekopieën met een tijdstempel als de opslag sleutels kan opsommen", () => {
  fakeLocalStorage();
  const items = new Map([["test", "{}"], ["test-backup-1726000000000", "oud"], ["test-backup-tekst", "blijft"]]);
  globalThis.localStorage = {
    get length() { return items.size; },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key)
  };

  new DataStore("test").clearAll();

  assert.deepEqual([...items.keys()], ["test-backup-tekst"]);
});

test("wipeAll wist de opslag en start opnieuw met demogegevens", () => {
  const store = createDataStore(validData());
  localStorage.setItem("test-backup", "kopie");
  const model = new RegistrationModel(store);
  model.loadProblem = "skipped";

  model.wipeAll();

  assert.equal(localStorage.getItem("test"), null);
  assert.equal(localStorage.getItem("test-backup"), null);
  assert.equal(model.loadProblem, null);
  assert.equal(model.registrations.length, 0);
  assert.equal(model.points[0].name, "Hoofdkantoor");
});

test("wipeAll werkt ook met een opslag zonder clearAll", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");

  model.wipeAll();

  assert.equal(model.registrations.length, 0);
});

// ------------------------------------------------------------------
// Strengere controle bij het laden
// ------------------------------------------------------------------

test("geldige gegevens met UUID's en product-id's worden zonder problemen geladen", () => {
  const data = validData();
  data.employees[0].id = "3f2b8c1e-9a4d-4e2b-8f1a-1234567890ab";
  data.registrations[0].employeeId = data.employees[0].id;
  const store = createDataStore(data);

  const loaded = store.load();

  assert.equal(store.loadProblem, null);
  assert.equal(loaded.employees.length, 1);
  assert.equal(loaded.registrations.length, 1);
});

test("een id met HTML-tekens wordt bij het laden overgeslagen", () => {
  const data = validData();
  data.employees.push({ id: 'x" onclick="alert(1)', name: "Hacker", color: "#d8f1e8", active: true });
  data.products.push({ id: "<img src=x>", name: "Kapot", price: 1 });
  data.companies.push({ id: "c2'><b>", name: "Kapot" });
  data.points.push({ id: "p 2", name: "Kapot", companyId: "c1", products: {} });
  data.registrations.push({ id: "r<2>", employeeId: "e1", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z" });
  data.auditLog.push({ id: "a\"2", action: "Test", details: "Regel", createdAt: "2026-09-10T10:00:00.000Z" });
  const store = createDataStore(data);

  const loaded = store.load();

  assert.equal(store.loadProblem, "skipped");
  assert.deepEqual(loaded.employees.map(({ id }) => id), ["e1"]);
  assert.equal(loaded.products.length, DEFAULT_PRODUCTS.length);
  assert.deepEqual(loaded.companies.map(({ id }) => id), ["c1"]);
  assert.deepEqual(loaded.points.map(({ id }) => id), ["p1"]);
  assert.deepEqual(loaded.registrations.map(({ id }) => id), ["r1"]);
  assert.deepEqual(loaded.auditLog.map(({ id }) => id), ["a1"]);
  assert.equal(localStorage.getItem("test-backup"), JSON.stringify(data));
});

test("een verwijzing met HTML-tekens laat de regel bij het laden overslaan", () => {
  const data = validData();
  data.employees.push({ id: "e2", name: "Piet", color: "#d8f1e8", active: true, companyId: "<x>", pointId: null });
  data.employees.push({ id: "e3", name: "Kees", color: "#d8f1e8", active: true, companyId: null, pointId: "p1\"" });
  data.registrations.push({ id: "r2", employeeId: "e1\">", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z" });
  data.registrations.push({ id: "r3", employeeId: "e1", productId: "<b>", createdAt: "2026-09-10T10:00:00.000Z" });
  data.registrations.push({ id: "r4", employeeId: "e1", productId: "blikje", pointId: "p 1", createdAt: "2026-09-10T10:00:00.000Z" });
  data.points.push({ id: "p2", name: "Kapot", companyId: "c1<", products: {} });
  const store = createDataStore(data);

  const loaded = store.load();

  assert.equal(store.loadProblem, "skipped");
  assert.deepEqual(loaded.employees.map(({ id }) => id), ["e1"]);
  assert.deepEqual(loaded.registrations.map(({ id }) => id), ["r1"]);
  assert.deepEqual(loaded.points.map(({ id }) => id), ["p1"]);
});

test("een medewerker zonder bedrijf of consumptiepunt (null) is geldig", () => {
  const data = validData();
  data.employees[0].companyId = null;
  data.employees[0].pointId = null;
  const store = createDataStore(data);

  assert.equal(store.load().employees.length, 1);
  assert.equal(store.loadProblem, null);
});

test("een ongeldige kleur wordt vervangen door een standaardkleur en de medewerker blijft bewaard", () => {
  const data = validData();
  data.employees[0].color = "red; background: url(https://example.com/x)";
  data.employees.push({ id: "e2", name: "Piet", color: "#fff", active: true });
  const store = createDataStore(data);

  const loaded = store.load();

  assert.equal(loaded.employees.length, 2);
  assert.equal(loaded.employees[0].color, COLORS[0]);
  assert.equal(loaded.employees[1].color, COLORS[1]);
  assert.equal(store.loadProblem, null);
});

test("een product met een negatieve of te hoge prijs wordt overgeslagen", () => {
  const data = validData();
  data.products.push({ id: "negatief", name: "Min", price: -1 });
  data.products.push({ id: "duur", name: "Duur", price: 1000.01 });
  data.products.push({ id: "grens", name: "Grens", price: 1000 });
  const store = createDataStore(data);

  const ids = store.load().products.map(({ id }) => id);

  assert.equal(ids.includes("negatief"), false);
  assert.equal(ids.includes("duur"), false);
  assert.equal(ids.includes("grens"), true);
  assert.equal(store.loadProblem, "skipped");
});

test("een product zonder prijs (null of lege tekst) wordt overgeslagen in plaats van gratis", () => {
  const data = validData();
  data.products.push({ id: "leeg", name: "Leeg", price: null });
  data.products.push({ id: "tekst", name: "Tekst", price: "" });
  data.products.push({ id: "ontbreekt", name: "Ontbreekt" });
  data.products.push({ id: "waar", name: "Waar", price: true });
  data.products.push({ id: "als-tekst", name: "Als tekst", price: "0.70" });
  const store = createDataStore(data);

  const products = store.load().products;
  const ids = products.map(({ id }) => id);

  assert.deepEqual(ids.filter((id) => ["leeg", "tekst", "ontbreekt", "waar"].includes(id)), []);
  assert.equal(products.find(({ id }) => id === "als-tekst").price, 0.7);
});

test("een registratie met een negatieve of te hoge prijs wordt overgeslagen", () => {
  const data = validData();
  data.registrations.push({ id: "r2", employeeId: "e1", productId: "blikje", price: -0.5, createdAt: "2026-09-10T10:00:00.000Z" });
  data.registrations.push({ id: "r3", employeeId: "e1", productId: "blikje", price: 5000, createdAt: "2026-09-10T10:00:00.000Z" });
  data.registrations.push({ id: "r4", employeeId: "e1", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z" });
  const store = createDataStore(data);

  assert.deepEqual(store.load().registrations.map(({ id }) => id), ["r1", "r4"]);
});

test("voorraad mag negatief zijn, maar een negatief minimum wordt 0", () => {
  const data = validData();
  data.points[0].products.blikje = { offered: true, stock: -3, minimum: -2 };
  data.points[0].products.ei = { offered: true, stock: null, minimum: "abc" };
  const store = createDataStore(data);

  const products = store.load().points[0].products;

  assert.equal(products.blikje.stock, -3);
  assert.equal(products.blikje.minimum, 0);
  assert.equal(products.ei.stock, 0);
  assert.equal(products.ei.minimum, 0);
});

test("oude product-id's worden ook in de productlijst en in de voorraad van een punt omgezet", () => {
  const data = validData();
  data.products = [
    { id: "blikje", name: "Blikje", price: 0.65 },
    { id: "melk", name: "Glas melk", price: 0.2 },
    { id: "brood", name: "Sneetje brood", price: 0.1 }
  ];
  data.points[0].products = {
    blikje: { offered: true, stock: 5, minimum: 1 },
    melk: { offered: true, stock: 7, minimum: 2 },
    brood: { offered: true, stock: 3, minimum: 0 }
  };
  data.registrations.push(registration("r2", "e1", "melk", "2026-09-10T11:00:00.000Z"));
  const store = createDataStore(data);

  const loaded = store.load();

  assert.deepEqual(loaded.products.map(({ id }) => id), ["blikje", "glas-melk", "sneetje-brood"]);
  assert.deepEqual(loaded.points[0].products["glas-melk"], { offered: true, stock: 7, minimum: 2 });
  assert.deepEqual(loaded.points[0].products["sneetje-brood"], { offered: true, stock: 3, minimum: 0 });
  assert.equal(loaded.points[0].products.melk, undefined);
  assert.equal(loaded.registrations[1].productId, "glas-melk");
  assert.equal(store.loadProblem, null);
});

// ------------------------------------------------------------------
// Voorraad tellen en correcties
// ------------------------------------------------------------------

test("tellen van de voorraad onthoudt het tijdstip van de telling", () => {
  const { model, point } = createModel();

  model.setStock(point.id, "blikje", 10);

  const entry = model.stockEntry(point.id, "blikje");
  assert.equal(entry.stock, 10);
  assert.equal(Number.isNaN(Date.parse(entry.countedAt)), false);
});

test("stockEntry geeft undefined voor een onbekend punt of product", () => {
  const { model, point } = createModel();

  assert.equal(model.stockEntry("bestaat-niet", "blikje"), undefined);
  assert.equal(model.stockEntry(point.id, "bestaat-niet"), undefined);
  assert.equal(model.stockEntry(point.id, "blikje").stock, 24);
});

test("een correctie van een registratie van vóór de telling verandert de getelde voorraad niet", () => {
  const { model, point } = createModel();
  model.addRegistration("employee-1", "blikje");
  model.state.registrations[0].createdAt = "2026-09-10T10:00:00.000Z";
  model.setStock(point.id, "blikje", 10);

  assert.equal(model.removeLastRegistration("employee-1", "blikje"), true);

  assert.equal(model.registrations.length, 0);
  assert.equal(model.stockEntry(point.id, "blikje").stock, 10);
});

test("een correctie van een registratie van na de telling zet het product terug in de voorraad", () => {
  const { model, point } = createModel();
  model.setStock(point.id, "blikje", 10);
  model.state.points = model.points.map((item) => ({
    ...item,
    products: { ...item.products, blikje: { ...item.products.blikje, countedAt: "2026-09-10T09:00:00.000Z" } }
  }));
  model.addRegistration("employee-1", "blikje");

  model.removeLastRegistration("employee-1", "blikje");

  assert.equal(model.stockEntry(point.id, "blikje").stock, 10);
});

test("zonder telling zet een correctie het product altijd terug in de voorraad", () => {
  const { model, point } = createModel();
  model.addRegistration("employee-1", "blikje");

  model.removeLastRegistration("employee-1", "blikje");

  assert.equal(model.stockEntry(point.id, "blikje").stock, 24);
});

test("het tijdstip van de telling blijft bewaard bij het laden, een ongeldig tijdstip niet", () => {
  const data = validData();
  data.points[0].products.blikje.countedAt = "2026-09-10T12:00:00.000Z";
  data.points[0].products.ei = { offered: true, stock: 1, minimum: 0, countedAt: "gisteren" };
  const store = createDataStore(data);

  const products = store.load().points[0].products;

  assert.equal(products.blikje.countedAt, "2026-09-10T12:00:00.000Z");
  assert.equal("countedAt" in products.ei, false);
});

// ------------------------------------------------------------------
// Nieuwe modelmethodes
// ------------------------------------------------------------------

test("lastRegistration geeft de registratie die removeLastRegistration zou verwijderen", () => {
  const { model } = createModel();
  model.state.registrations = [
    registration("r1", "employee-1", "blikje", "2026-09-10T10:00:00.000Z"),
    registration("r2", "employee-1", "ei", "2026-09-10T11:00:00.000Z"),
    registration("r3", "employee-2", "blikje", "2026-09-10T12:00:00.000Z")
  ];

  assert.equal(model.lastRegistration("employee-1").id, "r2");
  assert.equal(model.lastRegistration("employee-1", "blikje").id, "r1");
  assert.equal(model.lastRegistration("employee-1", "boter"), undefined);

  model.removeLastRegistration("employee-1", "blikje");
  assert.deepEqual(model.registrations.map(({ id }) => id), ["r2", "r3"]);
});

test("moveEmployeesOfPoint verandert alleen het bedrijf van de medewerkers van dat punt", () => {
  const { model, point } = createModel();
  model.state.employees[0] = { ...model.employees[0], name: "Handmatige Naam" };
  model.state.employees.push({ ...model.employees[0], id: "employee-2", pointId: "ander-punt", companyId: "c-oud" });
  const before = model.employees;
  const otherBefore = model.employees[1];

  model.moveEmployeesOfPoint(point.id, "c-nieuw");

  assert.notEqual(model.employees, before);
  assert.equal(model.employees[0].companyId, "c-nieuw");
  assert.equal(model.employees[0].name, "Handmatige Naam");
  assert.equal(before[0].companyId, point.companyId);
  assert.equal(model.employees[1], otherBefore);
});

// ------------------------------------------------------------------
// CSV-export
// ------------------------------------------------------------------

test("een CSV-veld dat met spaties of een enter en daarna een formule begint, wordt onschadelijk gemaakt", () => {
  const csv = new CsvExport(createModel().model);

  assert.equal(csv.escapeField(" =1+1"), "' =1+1");
  assert.equal(csv.escapeField("\t+cmd"), "'\t+cmd");
  assert.equal(csv.escapeField("  @SUM(A1)"), "'  @SUM(A1)");
  assert.equal(csv.escapeField("\n=cmd"), "\"'\n=cmd\"");
  assert.equal(csv.escapeField("\r\n-2"), "\"'\r\n-2\"");
});

test("gewone CSV-velden blijven ongewijzigd", () => {
  const csv = new CsvExport(createModel().model);

  assert.equal(csv.escapeField("Jan Jansen"), "Jan Jansen");
  assert.equal(csv.escapeField(" Jan"), " Jan");
  assert.equal(csv.escapeField(12), "12");
  assert.equal(csv.escapeField("=1+1"), "'=1+1");
  assert.equal(csv.escapeField("a;b"), "\"a;b\"");
});

test("een id met een speciale JavaScript-naam (zoals __proto__) wordt bij het laden overgeslagen", () => {
  const store = createDataStore({
    employees: [{ id: "e1", name: "Jan Jansen", color: "#ffffff", active: true }],
    registrations: [],
    products: [
      { id: "__proto__", name: "Kapot", price: 1 },
      { id: "constructor", name: "Kapot", price: 1 },
      { id: "blikje", name: "Blikje", price: 0.65 }
    ],
    companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
    points: [],
    auditLog: []
  });

  const data = store.load();

  assert.deepEqual(data.products.map(({ id }) => id), ["blikje"]);
  assert.equal(store.loadProblem, "skipped");
});

test("te lange namen of codes worden bij het laden overgeslagen", () => {
  const long = "x".repeat(250);
  const store = createDataStore({
    employees: [
      { id: "e1", name: "Jan Jansen", color: "#ffffff", active: true },
      { id: "e2", name: "Te Lang", firstName: long, lastName: "Lang", color: "#ffffff", active: true },
      { id: "e3", name: "Code Lang", personnelNumber: "1".repeat(70), color: "#ffffff", active: true }
    ],
    registrations: [],
    products: [{ id: "blikje", name: long, price: 0.65 }, { id: "ei", name: "Ei", price: 0.5 }],
    companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
    points: [],
    auditLog: [{ id: "a1", action: "Test", details: "y".repeat(600), createdAt: "2026-09-10T10:00:00.000Z" }]
  });

  const data = store.load();

  assert.deepEqual(data.employees.map(({ id }) => id), ["e1"]);
  assert.deepEqual(data.products.map(({ id }) => id), ["ei"]);
  assert.deepEqual(data.auditLog, []);
});

test("index.html begrenst de lengte van namen in de formulieren tot 100 tekens", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  for (const id of ["productName", "newEmployeeFirstName", "newEmployeeLastName", "companyName", "pointName"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*maxlength="100"`), id);
  }
});

test("kan de browseropslag niet worden gelezen, dan meldt de opslag 'unavailable' (niet 'leeg')", () => {
  globalThis.localStorage = { getItem: () => { throw new Error("geblokkeerd"); }, setItem() {}, removeItem() {} };
  const store = new DataStore("tvb-test");

  assert.equal(store.load(), null);
  assert.equal(store.loadProblem, "unavailable");
});
