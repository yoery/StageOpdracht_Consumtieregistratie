// Tests voor de opslaglaag: lezen, controleren, omzetten en opslaan.
import test from "node:test";
import assert from "node:assert/strict";

import { DataStore } from "../assets/js/DataStore.js";
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { CsvExport } from "../assets/js/CsvExport.js";
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

// Aangepast bij de review van oktober 2026: een logboek dat er wel staat maar geen lijst is, werd
// stil een lege lijst (en de volgende keer opslaan wiste het oude logboek). Nu telt dat als
// onleesbaar, met een reservekopie, net als een beschadigde bedrijvenlijst.
test("een logboek dat geen lijst is, maakt de gegevens onleesbaar (met reservekopie)", () => {
  const data = validData();
  data.auditLog = "kapot";
  const store = createDataStore(data);

  assert.equal(store.load(), null);
  assert.equal(store.loadProblem, "unreadable");
  assert.equal(localStorage.getItem("test-backup"), JSON.stringify(data));
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

// ------------------------------------------------------------------
// Oude gegevens van de vervallen slimme koelkast (weegschaal en slot)
// ------------------------------------------------------------------
//
// Tot en met versie 3.32 stonden in de opgeslagen gegevens ook de lijsten fridgeShelves (de indeling
// van de schappen) en fridgeOpenings (de openingen), en had een registratie van de koelkast de velden
// `source: "fridge"` en `openingId`. De functie is vervallen. Gegevens waarin dat nog staat, moeten
// gewoon blijven laden: de lijsten en de twee velden vallen stil weg, zonder melding en zonder
// reservekopie, en de registraties blijven gewone registraties.
const oldFridgeData = () => ({
  ...validData(),
  registrations: [
    { id: "r1", employeeId: "e1", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z" },
    { id: "r2", employeeId: "e1", productId: "blikje", price: 0.65, pointId: null, createdAt: "2026-10-19T10:00:20.000Z", source: "fridge", openingId: "opening-1" },
    { id: "r3", employeeId: "e1", productId: "ei", price: 0.5, pointId: null, createdAt: "2026-10-19T10:00:20.000Z", source: "fridge", openingId: "opening-1" }
  ],
  fridgeShelves: [
    { id: "schap-1", pointId: "p1", shelf: 1, productId: "blikje", unitWeight: 350 },
    { id: "schap-2", pointId: "p1", shelf: 2, productId: null, unitWeight: null }
  ],
  fridgeOpenings: [{
    id: "opening-1",
    employeeId: "e1",
    pointId: null,
    openedAt: "2026-10-19T10:00:00.000Z",
    closedAt: "2026-10-19T10:00:20.000Z",
    status: "registered",
    longOpen: false,
    shelves: [{ shelf: 1, productId: "blikje", unitWeight: 350, before: 3500, after: 3150, count: 1, flag: null }]
  }]
});

const backupKeys = () => ["test-backup", "test-backup-datum", "test-backup-laatste", "test-backup-laatste-datum"];

test("oude gegevens met de lijsten van de slimme koelkast laden zonder melding en zonder reservekopie", () => {
  const store = createDataStore(oldFridgeData());

  const data = store.load(new Date("2026-11-26T12:00:00.000Z"));

  assert.equal(store.loadProblem, null, "geen melding 'beschadigde regels'");
  for (const key of backupKeys()) assert.equal(localStorage.getItem(key), null, `geen reservekopie (${key})`);
  assert.equal(Object.hasOwn(data, "fridgeShelves"), false, "de indeling van de schappen valt weg");
  assert.equal(Object.hasOwn(data, "fridgeOpenings"), false, "de openingen vallen weg");
  assert.equal(data.employees.length, 1);
  assert.equal(data.registrations.length, 3, "alle registraties blijven");
});

test("een registratie van de slimme koelkast wordt een gewone registratie en blijft in de export", () => {
  const model = new RegistrationModel(createDataStore(oldFridgeData()));

  assert.equal(model.loadProblem, null);
  assert.deepEqual(model.registrations.map(({ id }) => id), ["r1", "r2", "r3"]);
  for (const registration of model.registrations) {
    assert.equal(Object.hasOwn(registration, "source"), false, `${registration.id} heeft geen source meer`);
    assert.equal(Object.hasOwn(registration, "openingId"), false, `${registration.id} heeft geen openingId meer`);
  }
  // De prijs en het tijdstip van toen blijven, zodat de loonmaand en het bedrag niet veranderen.
  assert.deepEqual(model.registrations[1], { id: "r2", employeeId: "e1", productId: "blikje", price: 0.65, pointId: null, createdAt: "2026-10-19T10:00:20.000Z" });

  // In de export: september (loonmaand 10) één registratie, oktober (loonmaand 11) de twee van de koelkast.
  const rows = new CsvExport(model).buildRows("all", "all");
  assert.deepEqual(rows.map(({ Naam, Maand, Totaal }) => [Naam, Maand, Totaal]), [["Jan Jansen", 10, 1], ["Jan Jansen", 11, 2]]);
});

test("na de eerste keer opslaan staan de lijsten en velden van de slimme koelkast niet meer in de opslag", () => {
  const model = new RegistrationModel(createDataStore(oldFridgeData()));

  assert.equal(model.save(), true);

  const stored = JSON.parse(localStorage.getItem("test"));
  assert.equal(Object.hasOwn(stored, "fridgeShelves"), false);
  assert.equal(Object.hasOwn(stored, "fridgeOpenings"), false);
  assert.equal(stored.registrations.length, 3);
  assert.equal(JSON.stringify(stored).includes("fridge"), false);
  assert.equal(JSON.stringify(stored).includes("openingId"), false);
});

test("ook beschadigde lijsten van de slimme koelkast geven geen melding: ze worden niet meer gecontroleerd", () => {
  for (const damaged of [
    { fridgeShelves: "kapot", fridgeOpenings: { geen: "lijst" } },
    { fridgeShelves: [null, { id: "<script>", shelf: 99 }], fridgeOpenings: [{ id: "opening-1", status: "onbekend" }, "tekst"] }
  ]) {
    const store = createDataStore({ ...oldFridgeData(), ...damaged });

    const data = store.load(new Date("2026-11-26T12:00:00.000Z"));

    assert.equal(store.loadProblem, null, JSON.stringify(damaged));
    assert.equal(localStorage.getItem("test-backup"), null);
    assert.equal(data.registrations.length, 3);
  }
});

test("een registratie met een onbekende bron of een ongeldige opening-id blijft ook een gewone registratie", () => {
  const data = validData();
  data.registrations = [
    { id: "r1", employeeId: "e1", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z", source: "<script>", openingId: { geen: "id" } }
  ];
  const store = createDataStore(data);

  const loaded = store.load(new Date("2026-11-26T12:00:00.000Z"));

  assert.equal(store.loadProblem, null);
  assert.deepEqual(loaded.registrations, [{ id: "r1", employeeId: "e1", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z" }]);
});
