// Regressietests voor de vierde codecontrole (model en opslag): voor iedere opgeloste bug een
// test die laat zien dat de bug weg is en die faalt als de bug ooit terugkomt.
// De letters verwijzen naar de punten uit de codecontrole.
import test from "node:test";
import assert from "node:assert/strict";

import { createId } from "../assets/js/ids.js";
import { CsvExport } from "../assets/js/csvExport.js";
import { DEFAULT_PRODUCTS } from "../assets/js/config.js";
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { createModel, createDataStore, registration } from "./helpers.js";

console.warn = () => {};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Geldige opgeslagen gegevens die per test kunnen worden aangepast.
const storedData = () => ({
  employees: [{ id: "e1", name: "Jan Jansen", color: "#fff", active: true }],
  registrations: [],
  products: DEFAULT_PRODUCTS,
  companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
  points: [{ id: "p1", name: "Kantine", companyId: "c1", products: { blikje: { offered: true, stock: 10, minimum: 2 } } }],
  auditLog: []
});

// Punt A: crypto.randomUUID ontbreekt op een gewoon http-adres

test("controle 4, punt A: zonder crypto.randomUUID maakt createId toch een geldige UUID", () => {
  // randomUUID tijdelijk "weghalen", zoals op http://192.168.x.x; daarna weer herstellen.
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });

  try {
    const ids = Array.from({ length: 50 }, () => createId());

    for (const id of ids) assert.match(id, UUID_V4);
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    delete crypto.randomUUID;
  }

  assert.equal(typeof crypto.randomUUID, "function");
});

test("controle 4, punt A: het model start ook zonder crypto.randomUUID", () => {
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });

  try {
    const model = new RegistrationModel(createDataStore());

    assert.ok(model.employees.length > 0);
    assert.ok(model.companies.every(({ id }) => UUID_V4.test(id)));
  } finally {
    delete crypto.randomUUID;
  }
});

test("controle 4, punt A: createId gebruikt crypto.randomUUID als die er is", () => {
  assert.match(createId(), UUID_V4);
  assert.notEqual(createId(), createId());
});

// Punt B: een oude maand houdt de prijs van het moment van registreren

test("controle 4, punt B: een registratie bewaart de prijs van dat moment", () => {
  const { model } = createModel();

  model.addRegistration("employee-1", "blikje");

  assert.equal(model.registrations[0].price, 0.65);
});

test("controle 4, punt B: na een prijswijziging houden CSV en totaal de oude prijs", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");
  const month = model.monthKey(new Date(model.registrations[0].createdAt));

  model.saveProduct({ id: "blikje", name: "Blikje", price: "1.00" });

  const [row] = new CsvExport(model).buildRows("all", month);
  assert.equal(row.Prijs, 0.65);
  assert.equal(model.totalCostForEmployee("employee-1"), 0.65);
});

test("controle 4, punt B: een oude registratie zonder prijs telt met de huidige prijs", () => {
  const { model } = createModel();
  model.state.registrations = [registration("1", "employee-1", "blikje", "2026-09-10T12:00:00")];
  model.saveProduct({ id: "blikje", name: "Blikje", price: "0.80" });

  const [row] = new CsvExport(model).buildRows("all", "2026-09");

  assert.equal(row.Prijs, 0.8);
  assert.equal(model.totalCostForEmployee("employee-1"), 0.8);
  assert.equal(model.registrationPrice(model.registrations[0]), 0.8);
});

test("controle 4, punt B: een registratie met een kapotte prijs wordt bij het laden overgeslagen", () => {
  const data = storedData();
  data.registrations = [
    { id: "r1", employeeId: "e1", productId: "blikje", price: 0.65, createdAt: "2026-09-10T10:00:00.000Z" },
    { id: "r2", employeeId: "e1", productId: "blikje", price: "abc", createdAt: "2026-09-10T10:00:00.000Z" },
    { id: "r3", employeeId: "e1", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z" }
  ];
  const store = createDataStore(data);

  const loaded = store.load();

  assert.deepEqual(loaded.registrations.map(({ id }) => id), ["r1", "r3"]);
  assert.equal(store.loadProblem, "skipped");
});

// Punt E: alle producten verwijderd

test("controle 4, punt E: een lege productlijst blijft leeg na herladen", () => {
  const data = storedData();
  data.products = [];

  const loaded = createDataStore(data).load();

  assert.deepEqual(loaded.products, []);
});

test("controle 4, punt E: oude gegevens zonder productlijst krijgen de standaardproducten", () => {
  const data = storedData();
  delete data.products;

  const loaded = createDataStore(data).load();

  assert.equal(loaded.products.length, DEFAULT_PRODUCTS.length);
});

// Punt F: beschadigde bedrijvenlijst

test("controle 4, punt F: een beschadigde bedrijvenlijst vervangt de consumptiepunten niet", () => {
  const data = storedData();
  data.companies = "kapot";
  const store = createDataStore(data);

  assert.equal(store.load(), null);
  assert.equal(store.loadProblem, "unreadable");
  assert.equal(localStorage.getItem("test-backup"), JSON.stringify(data));
});

test("controle 4, punt F: ontbreekt de bedrijvenlijst helemaal, dan worden bedrijven aangemaakt", () => {
  const data = storedData();
  delete data.companies;
  delete data.points; // zo zagen gegevens uit de oude versie eruit
  const store = createDataStore(data);

  const loaded = store.load();

  assert.ok(loaded.companies.length > 0);
  assert.equal(store.loadProblem, null);
});

// Punt O: reload werkt loadProblem bij

test("controle 4, punt O: reload neemt het probleem van de opslag over", () => {
  const store = createDataStore(storedData());
  const model = new RegistrationModel(store);
  assert.equal(model.loadProblem, null);

  localStorage.setItem("test", "{kapot");
  assert.equal(model.reload(), false);
  assert.equal(model.loadProblem, "unreadable");

  localStorage.setItem("test", JSON.stringify(storedData()));
  assert.equal(model.reload(), true);
  assert.equal(model.loadProblem, null);
});

// Punt P: medewerker met registraties verwijderen

test("controle 4, punt P: een medewerker met registraties wordt niet verwijderd", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");

  assert.equal(model.employeeHasRegistrations("employee-1"), true);
  assert.equal(model.removeEmployee("employee-1"), false);
  assert.ok(model.findEmployee("employee-1"));
});

test("controle 4, punt P: een inactieve medewerker zonder registraties wordt wel verwijderd", () => {
  const { model } = createModel();
  model.setEmployeeActive("employee-1", false);

  assert.equal(model.employeeHasRegistrations("employee-1"), false);
  assert.equal(model.removeEmployee("employee-1"), true);
  assert.equal(model.findEmployee("employee-1"), undefined);
});
