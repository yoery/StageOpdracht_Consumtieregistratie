// Tests voor de regels in RegistrationModel die nog niet in basis.test.js staan.
import test from "node:test";
import assert from "node:assert/strict";

import { COLORS, DEFAULT_PRODUCTS } from "../assets/js/config.js";
import { createModel, addEmployee, registration } from "./helpers.js";

// Registraties en snapshot/restore

test("snapshot en restore zetten een wijziging volledig terug", () => {
  const { model, point } = createModel();
  const before = model.snapshot();

  model.addRegistration("employee-1", "blikje");
  model.saveCompany({ name: "Nieuw bedrijf", employerNumber: "" });
  model.restore(before);

  assert.equal(model.registrations.length, 0);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
  assert.equal(model.companies.some(({ name }) => name === "Nieuw bedrijf"), false);
});

test("removeLastRegistration zonder product verwijdert de laatste registratie", () => {
  const { model } = createModel();

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "boter");
  model.removeLastRegistration("employee-1");

  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["blikje"]);
});

test("registratie zonder consumptiepunt verandert geen voorraad", () => {
  const { model, point } = createModel();
  addEmployee(model);

  model.addRegistration("employee-2", "blikje");

  assert.equal(model.registrations[0].pointId, null);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
});

test("registratie van een onbekende medewerker krijgt geen consumptiepunt", () => {
  const { model } = createModel();

  model.addRegistration("bestaat-niet", "blikje");

  assert.equal(model.registrations[0].pointId, null);
});

test("correctie zet voorraad terug op het oude punt, ook na verhuizing van de medewerker", () => {
  const { model, point } = createModel();
  model.savePoint({ name: "Tweede punt", companyId: point.companyId, offeredProductIds: ["blikje"] });
  const secondPoint = model.points.find(({ name }) => name === "Tweede punt");

  model.addRegistration("employee-1", "blikje");
  model.updateEmployee("employee-1", { ...model.findEmployee("employee-1"), pointId: secondPoint.id });
  model.removeLastRegistration("employee-1", "blikje");

  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
  assert.equal(model.findPoint(secondPoint.id).products.blikje.stock, 0);
});

test("totaalbedrag telt een onbekend product als 0", () => {
  const { model } = createModel();

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "verwijderd-product");

  assert.equal(model.totalCostForEmployee("employee-1"), 0.65);
});

test("countForDate telt geen registraties van een andere dag", () => {
  const { model } = createModel();
  model.state.registrations = [
    registration("1", "employee-1", "blikje", "2026-09-15T12:00:00"),
    registration("2", "employee-1", "blikje", "2026-09-16T12:00:00")
  ];

  assert.equal(model.countForDate(new Date(2026, 8, 15)), 1);
});

test("countForMonth telt dezelfde maand van een ander jaar niet mee", () => {
  const { model } = createModel();
  model.state.registrations = [
    registration("1", "employee-1", "blikje", "2026-09-15T12:00:00"),
    registration("2", "employee-1", "blikje", "2025-09-15T12:00:00")
  ];

  assert.equal(model.countForMonth(new Date(2026, 8, 1)), 1);
});

test("monthKey vult maanden onder de 10 aan met een nul", () => {
  const { model } = createModel();

  assert.equal(model.monthKey(new Date(2026, 0, 5)), "2026-01");
  assert.equal(model.monthKey(new Date(2026, 11, 5)), "2026-12");
});

// Medewerkers

test("nieuwe medewerker krijgt een unieke id en een kleur uit de reeks", () => {
  const { model } = createModel();

  model.addEmployee({ firstName: "Jan", lastName: "Jansen", companyId: null, pointId: null });
  model.addEmployee({ firstName: "Piet", lastName: "Pieters", companyId: null, pointId: null });

  const [, jan, piet] = model.employees;
  assert.notEqual(jan.id, piet.id);
  assert.equal(jan.color, COLORS[1 % COLORS.length]);
  assert.equal(piet.color, COLORS[2 % COLORS.length]);
});

test("updateEmployee houdt id, kleur en status vast", () => {
  const { model } = createModel();
  model.setEmployeeActive("employee-1", false);

  model.updateEmployee("employee-1", { firstName: "Nieuw", lastName: "Naam" });

  const employee = model.findEmployee("employee-1");
  assert.equal(employee.id, "employee-1");
  assert.equal(employee.color, "#d8f1e8");
  assert.equal(employee.active, false);
  assert.equal(employee.name, "Nieuw Naam");
});

test("updateEmployee van een onbekende medewerker verandert niets", () => {
  const { model } = createModel();
  const before = JSON.stringify(model.employees);

  model.updateEmployee("bestaat-niet", { firstName: "X", lastName: "Y" });

  assert.equal(JSON.stringify(model.employees), before);
});

test("verwijderde medewerker laat zijn registraties staan", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");

  model.removeEmployee("employee-1");

  assert.equal(model.registrations.length, 1);
  assert.equal(model.findEmployee("employee-1"), undefined);
});

test("employerNumberFor geeft een lege tekst zonder bedrijf en zonder eigen nummer", () => {
  const { model } = createModel();
  const employee = addEmployee(model);

  assert.equal(model.employerNumberFor(employee), "");
  assert.equal(model.employerNumberFor(undefined), "");
});

// Producten

test("nieuw product krijgt een eigen id en prijs als getal", () => {
  const { model } = createModel();

  model.saveProduct({ id: "tijdelijk", name: "Soep", price: "1.25" });

  const soup = model.products.find(({ name }) => name === "Soep");
  assert.notEqual(soup.id, "tijdelijk");
  assert.equal(soup.price, 1.25);
});

test("product wijzigen verandert geen voorraad of aanbod", () => {
  const { model, point } = createModel();

  model.saveProduct({ id: "blikje", name: "Blikje cola", price: "0.75" });

  assert.equal(model.productName("blikje"), "Blikje cola");
  assert.deepEqual(model.findPoint(point.id).products.blikje, { offered: true, stock: 24, minimum: 6 });
});

// Bedrijven

test("nieuw bedrijf wordt toegevoegd met een unieke id", () => {
  const { model } = createModel();
  const before = model.companies.length;

  model.saveCompany({ name: "Nieuw BV", employerNumber: "55" });

  const company = model.companies.find(({ name }) => name === "Nieuw BV");
  assert.equal(model.companies.length, before + 1);
  assert.equal(company.employerNumber, "55");
  assert.ok(company.id);
});

test("sortedCompanies staat op alfabet zonder de originele lijst te wijzigen", () => {
  const { model } = createModel();
  const originalFirst = model.companies[0].name;

  const names = model.sortedCompanies().map(({ name }) => name);

  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "nl")));
  assert.equal(model.companies[0].name, originalFirst);
});

test("companyName geeft 'Onbekend bedrijf' voor een onbekende id", () => {
  const { model } = createModel();

  assert.equal(model.companyName("bestaat-niet"), "Onbekend bedrijf");
  assert.equal(model.companyName(null), "Onbekend bedrijf");
});

test("bedrijf met alleen een consumptiepunt (zonder medewerkers) kan niet worden verwijderd", () => {
  const { model } = createModel();
  const klik = model.companies.find(({ name }) => name === "Klik");
  model.savePoint({ name: "Kantine Klik", companyId: klik.id, offeredProductIds: [] });

  assert.equal(model.removeCompany(klik.id), false);
});

// Consumptiepunten

test("nieuw consumptiepunt krijgt voorraadregels voor alle producten", () => {
  const { model } = createModel();
  const klik = model.companies.find(({ name }) => name === "Klik");

  model.savePoint({ name: "Kantine Klik", companyId: klik.id, offeredProductIds: ["blikje", "ei"] });

  const point = model.points.find(({ name }) => name === "Kantine Klik");
  assert.equal(Object.keys(point.products).length, DEFAULT_PRODUCTS.length);
  assert.deepEqual(point.products.blikje, { stock: 0, minimum: 0, offered: true });
  assert.equal(point.products.boter.offered, false);
});

test("pointsForCompany geeft alleen de punten van dat bedrijf, op alfabet", () => {
  const { model } = createModel();
  const klik = model.companies.find(({ name }) => name === "Klik");
  model.savePoint({ name: "Zolder", companyId: klik.id, offeredProductIds: [] });
  model.savePoint({ name: "Begane grond", companyId: klik.id, offeredProductIds: [] });

  assert.deepEqual(model.pointsForCompany(klik.id).map(({ name }) => name), ["Begane grond", "Zolder"]);
});

test("consumptiepunt zonder medewerkers kan worden verwijderd; registraties blijven", () => {
  const { model, point } = createModel();
  model.addRegistration("employee-1", "blikje");
  model.updateEmployee("employee-1", { ...model.findEmployee("employee-1"), pointId: null });

  assert.equal(model.removePoint(point.id), true);
  assert.equal(model.findPoint(point.id), undefined);
  assert.equal(model.registrations[0].pointId, point.id);
});

test("medewerker van een verwijderd consumptiepunt ziet geen producten", () => {
  const { model, point } = createModel();

  model.state.points = model.points.filter(({ id }) => id !== point.id);

  assert.deepEqual(model.productsForEmployee("employee-1"), []);
});

test("offeredProducts volgt de volgorde van de productlijst", () => {
  const { model, point } = createModel();
  model.savePoint({ id: point.id, name: point.name, companyId: point.companyId, offeredProductIds: ["yoghurt", "blikje"] });

  assert.deepEqual(model.offeredProducts(point.id).map(({ id }) => id), ["blikje", "yoghurt"]);
});

// Voorraad

test("setStock en setMinimum passen alleen het gekozen product aan", () => {
  const { model, point } = createModel();

  model.setStock(point.id, "blikje", 5);
  model.setMinimum(point.id, "blikje", 10);

  const products = model.findPoint(point.id).products;
  assert.deepEqual(products.blikje, { offered: true, stock: 5, minimum: 10 });
  assert.deepEqual(products.boter, { offered: true, stock: 24, minimum: 6 });
});

test("voorraad wijzigen van een onbekend product of punt doet niets", () => {
  const { model, point } = createModel();
  const before = JSON.stringify(model.points);

  model.changeStock(point.id, "bestaat-niet", 5);
  model.changeStock("bestaat-niet", "blikje", 5);

  assert.equal(JSON.stringify(model.points), before);
});

test("voorraad kan negatief worden als er meer is geregistreerd dan geteld", () => {
  const { model, point } = createModel();
  model.setStock(point.id, "blikje", 0);

  model.addRegistration("employee-1", "blikje");

  assert.equal(model.findPoint(point.id).products.blikje.stock, -1);
  assert.equal(model.stockStatus(model.findPoint(point.id).products.blikje), "out");
});

test("voorraadwijziging maakt een nieuw object, zodat een snapshot niet meeverandert", () => {
  const { model, point } = createModel();
  const snapshot = model.snapshot();

  model.changeStock(point.id, "blikje", -4);

  assert.equal(snapshot.points[0].products.blikje.stock, 24);
});

test("bijbestellijst toont 'op' en 'bijbestellen' over meerdere punten", () => {
  const { model, point } = createModel();
  const klik = model.companies.find(({ name }) => name === "Klik");
  model.savePoint({ name: "Kantine Klik", companyId: klik.id, offeredProductIds: ["ei"] });
  model.setStock(point.id, "blikje", 2);

  const alerts = model.stockAlerts().map(({ point: alertPoint, product, status }) => [alertPoint.name, product.id, status]);

  assert.deepEqual(alerts, [
    ["Hoofdkantoor", "blikje", "low"],
    ["Kantine Klik", "ei", "out"]
  ]);
});

test("bijbestellijst is leeg als alles boven het minimum zit", () => {
  const { model } = createModel();

  assert.deepEqual(model.stockAlerts(), []);
});
