// Tests voor de opslaglaag: lezen, controleren, omzetten en opslaan.
import test from "node:test";
import assert from "node:assert/strict";

import { DataStore } from "../assets/js/DataStore.js";
import { DEFAULT_PRODUCTS, DEFAULT_COMPANIES } from "../assets/js/config.js";
import { createDataStore, fakeLocalStorage } from "./helpers.js";

// Console-waarschuwingen horen bij deze tests; ze maken de uitvoer alleen onrustig.
console.warn = () => {};
console.error = () => {};

const validData = () => ({
  employees: [{ id: "e1", name: "Jan Jansen", color: "#fff", active: true }],
  registrations: [{ id: "r1", employeeId: "e1", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z" }],
  products: DEFAULT_PRODUCTS,
  companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
  points: [],
  auditLog: []
});

test("zonder opgeslagen gegevens geeft load null terug", () => {
  fakeLocalStorage();

  assert.equal(new DataStore("leeg").load(), null);
});

test("geldige gegevens worden geladen", () => {
  const data = createDataStore(validData()).load();

  assert.equal(data.employees[0].name, "Jan Jansen");
  assert.equal(data.registrations.length, 1);
  assert.equal(data.companies[0].name, "TVB");
});

// Een beschadigde regel wordt overgeslagen; de rest van de gegevens blijft bewaard en er komt
// een reservekopie van de oorspronkelijke gegevens onder "<sleutel>-backup".
const loadWithDamage = (damage) => {
  const data = validData();
  damage(data);
  const store = createDataStore(data);
  return { store, loaded: store.load(), original: JSON.stringify(data) };
};

test("medewerker zonder naam wordt overgeslagen, de rest blijft", () => {
  const { store, loaded, original } = loadWithDamage((data) => {
    data.employees[0].name = "   ";
    data.employees.push({ id: "e2", name: "Piet Pieters", color: "#fff", active: true });
  });

  assert.deepEqual(loaded.employees.map(({ id }) => id), ["e2"]);
  assert.equal(loaded.registrations.length, 1);
  assert.equal(store.loadProblem, "skipped");
  assert.equal(localStorage.getItem("test-backup"), original);
});

test("registratie met ongeldige datum wordt overgeslagen, de andere registraties blijven", () => {
  const { store, loaded } = loadWithDamage((data) => {
    data.registrations.push({ id: "r2", employeeId: "e1", productId: "ei", createdAt: "geen datum" });
  });

  assert.deepEqual(loaded.registrations.map(({ id }) => id), ["r1"]);
  assert.equal(store.loadProblem, "skipped");
});

test("product met ongeldige prijs wordt overgeslagen", () => {
  const { loaded } = loadWithDamage((data) => {
    data.products = [{ id: "x", name: "Kapot", price: "abc" }, { id: "blikje", name: "Blikje", price: 0.65 }];
  });

  assert.deepEqual(loaded.products.map(({ id }) => id), ["blikje"]);
});

test("consumptiepunt zonder bedrijf wordt overgeslagen", () => {
  const { loaded } = loadWithDamage((data) => {
    data.points = [{ id: "p1", name: "Kantine", products: {} }];
  });

  assert.deepEqual(loaded.points, []);
});

test("goede gegevens geven geen melding en geen reservekopie", () => {
  const store = createDataStore(validData());

  store.load();

  assert.equal(store.loadProblem, null);
  assert.equal(localStorage.getItem("test-backup"), null);
});

test("opgeslagen JSON die geen object is start de demo opnieuw", () => {
  fakeLocalStorage();
  localStorage.setItem("test", "null");

  assert.equal(new DataStore("test").load(), null);
});

test("prijs als tekst wordt omgezet naar een getal", () => {
  const data = validData();
  data.products = [{ id: "blikje", name: "Blikje", price: "0.70" }];

  assert.equal(createDataStore(data).load().products[0].price, 0.7);
});

test("registratie zonder product wordt een blikje", () => {
  const data = validData();
  delete data.registrations[0].productId;

  assert.equal(createDataStore(data).load().registrations[0].productId, "blikje");
});

test("medewerker zonder actief-veld is actief en krijgt een kleur", () => {
  const data = validData();
  data.employees = [{ id: "e1", name: "Jan Jansen" }];

  const employee = createDataStore(data).load().employees[0];

  assert.equal(employee.active, true);
  assert.equal(typeof employee.color, "string");
});

test("naam wordt opgesplitst in voornaam en achternaam", () => {
  const data = validData();
  data.employees = [{ id: "e1", name: "Anna van der Berg", color: "#fff", active: true }];

  const employee = createDataStore(data).load().employees[0];

  assert.equal(employee.firstName, "Anna van der");
  assert.equal(employee.lastName, "Berg");
});

test("naam wordt samengesteld uit voornaam en achternaam", () => {
  const data = validData();
  data.employees = [{ id: "e1", firstName: "Piet", lastName: "Pieters", color: "#fff", active: true }];

  assert.equal(createDataStore(data).load().employees[0].name, "Piet Pieters");
});

test("ieder consumptiepunt krijgt een voorraadregel voor nieuwe producten", () => {
  const data = validData();
  data.points = [{
    id: "p1",
    name: "Kantine",
    companyId: "c1",
    products: { blikje: { offered: true, stock: 10, minimum: 2 } }
  }];

  const point = createDataStore(data).load().points[0];

  assert.deepEqual(point.products.blikje, { offered: true, stock: 10, minimum: 2 });
  assert.deepEqual(point.products.ei, { offered: false, stock: 0, minimum: 0 });
  assert.equal(Object.keys(point.products).length, DEFAULT_PRODUCTS.length);
});

test("oude gegevens zonder bedrijf krijgen de 13 standaardbedrijven en geen consumptiepunt", () => {
  const data = createDataStore({
    employees: [{ id: "e1", name: "Jan Jansen", color: "#fff", active: true }],
    registrations: []
  }).load();

  assert.deepEqual(data.companies.map(({ name }) => name), DEFAULT_COMPANIES);
  assert.deepEqual(data.points, []);
  assert.equal(data.employees[0].companyId, null);
  assert.equal(data.employees[0].pointId, null);
});

test("oude onbekende bedrijfsnaam wordt een nieuw bedrijf", () => {
  const data = createDataStore({
    employees: [{ id: "e1", name: "Jan Jansen", employerName: "Nieuw BV", color: "#fff", active: true }],
    registrations: []
  }).load();

  const company = data.companies.find(({ name }) => name === "Nieuw BV");

  assert.ok(company);
  assert.equal(data.companies.length, DEFAULT_COMPANIES.length + 1);
  assert.equal(data.employees[0].companyId, company.id);
});

test("collega's van hetzelfde oude bedrijf delen één consumptiepunt", () => {
  const data = createDataStore({
    employees: [
      { id: "e1", name: "Jan Jansen", employerName: "STB", color: "#fff", active: true },
      { id: "e2", name: "Piet Pieters", employerName: "stb", color: "#fff", active: true }
    ],
    registrations: []
  }).load();

  assert.equal(data.points.length, 1);
  assert.equal(data.employees[0].pointId, data.employees[1].pointId);
});

test("save schrijft de gegevens als JSON weg", () => {
  const store = createDataStore();

  assert.equal(store.save({ employees: [] }), true);
  assert.equal(localStorage.getItem("test"), '{"employees":[]}');
});

test("save geeft false terug als de browseropslag vol is", () => {
  const store = createDataStore(undefined, { failSet: true });

  assert.equal(store.save({ employees: [] }), false);
});

test("een logboek dat geen lijst is, wordt een lege lijst", () => {
  const data = validData();
  data.auditLog = "kapot";

  assert.deepEqual(createDataStore(data).load().auditLog, []);
});

test("isValidAuditEntry vraagt een actie, details en een geldige datum", () => {
  const store = new DataStore("test");

  assert.equal(store.isValidAuditEntry({ action: "A", details: "B", createdAt: "2026-09-10T10:00:00.000Z" }), true);
  assert.equal(store.isValidAuditEntry({ action: "A", details: "B", createdAt: "gisteren" }), false);
  assert.equal(store.isValidAuditEntry({ action: "A", createdAt: "2026-09-10T10:00:00.000Z" }), false);
  assert.equal(store.isValidAuditEntry(null), false);
});

test("voorraad zonder getal wordt 0 en 'aangeboden' moet echt true zijn", () => {
  const data = validData();
  data.points = [{ id: "p1", name: "Kantine", companyId: "c1", products: { blikje: { offered: "ja", stock: "veel", minimum: null } } }];

  assert.deepEqual(createDataStore(data).load().points[0].products.blikje, { offered: false, stock: 0, minimum: 0 });
});
