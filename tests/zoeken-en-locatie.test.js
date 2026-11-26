// Tests voor zoeken op een tablet met een server (FR-96 en FR-97): pas namen na typen, en de
// medewerkers van de locatie van de tablet bovenaan. In de demo (zonder server) blijft de lijst
// zoals hij was. De namen zijn verzonnen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationView } from "../assets/js/RegistrationView.js";
import { createModel, addEmployee, createFakeElement, registration } from "./helpers.js";

// Een model met vier medewerkers: twee bij Hoofdkantoor (het punt van de demo) en twee bij een
// tweede punt "Kantine IT" van een ander bedrijf.
const createDirectory = () => {
  const { model, point } = createModel();
  const other = { id: "punt-it", name: "Kantine IT", companyId: "bedrijf-it", products: {} };
  model.state.companies = [...model.state.companies, { id: "bedrijf-it", name: "IT Supervision", employerNumber: "" }];
  model.state.points = [...model.state.points, other];
  model.state.employees[0].name = "Lotte van Dijk";
  addEmployee(model, { id: "mw-mark", name: "Mark Jansen", companyId: point.companyId, pointId: point.id });
  addEmployee(model, { id: "mw-sanne", name: "Sanne Bakker", companyId: "bedrijf-it", pointId: "punt-it" });
  addEmployee(model, { id: "mw-tom", name: "Tom de Groot", companyId: "bedrijf-it", pointId: "punt-it" });

  const view = new RegistrationView(model);
  const elements = new Map();
  view.$ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createFakeElement({ innerHTML: "" }));
    return elements.get(selector);
  };
  view.$("#employeeCompanyFilter").dataset.value = "all";
  return { model, view, point, el: (selector) => view.$(selector) };
};

// De namen in de lijst, per groep: [["Groep", ["Naam", ...]], ...].
const groups = (html) => [...html.matchAll(/<h3>([^<]*)<\/h3>([\s\S]*?)<\/section>/g)].map(([, title, body]) =>
  [title, [...body.matchAll(/class="employee-name">([^<]*)</g)].map((match) => match[1])]);

const search = (directory, text) => {
  directory.el("#employeeSearch").value = text;
  directory.view.renderEmployees();
  return groups(directory.el("#employeeList").innerHTML);
};

test("zoeken: in de demo staat de hele lijst er meteen, zonder uitleg", () => {
  const directory = createDirectory();

  assert.deepEqual(search(directory, ""), [
    ["IT Supervision", ["Sanne Bakker", "Tom de Groot"]],
    ["TVB", ["Lotte van Dijk", "Mark Jansen"]]
  ]);
  assert.equal(directory.el("#searchPrompt").classList.contains("hidden"), true);
});

test("zoeken met een server: zolang er niets is getypt, staan er geen namen in beeld maar de uitleg", () => {
  const directory = createDirectory();
  directory.view.directory = () => ({ searchFirst: true, pointId: null, deviceId: null });

  assert.deepEqual(search(directory, ""), []);
  assert.equal(directory.el("#employeeList").innerHTML, "");
  assert.equal(directory.el("#searchPrompt").classList.contains("hidden"), false);
  assert.equal(directory.el("#emptyState").classList.contains("hidden"), true, "'Geen medewerker gevonden' staat er");
  assert.equal(directory.el("#employeeCount").textContent, "");
  assert.equal(directory.el("#employeeListHint").classList.contains("hidden"), true);
  assert.equal(directory.el("#employeeResultsStatus").textContent, "");

  // Alleen spaties telt ook als niets.
  assert.deepEqual(search(directory, "   "), []);
});

test("zoeken met een server: na één letter verschijnen de namen die passen", () => {
  const directory = createDirectory();
  directory.view.directory = () => ({ searchFirst: true, pointId: null, deviceId: null });

  assert.deepEqual(search(directory, "s"), [["IT Supervision", ["Sanne Bakker"]], ["TVB", ["Mark Jansen"]]]);
  assert.equal(directory.el("#searchPrompt").classList.contains("hidden"), true);
  assert.equal(directory.el("#employeeCount").textContent, "2 totaal");

  assert.deepEqual(search(directory, "xyz"), []);
  assert.equal(directory.el("#emptyState").classList.contains("hidden"), false, "'Geen medewerker gevonden' ontbreekt");
  assert.equal(directory.el("#searchPrompt").classList.contains("hidden"), true);
});

test("locatie: de medewerkers van de locatie van de tablet staan bovenaan, in een groep met de naam van de locatie", () => {
  const directory = createDirectory();
  directory.view.directory = () => ({ searchFirst: true, pointId: "punt-it", deviceId: null });

  assert.deepEqual(search(directory, "e"), [
    ["Kantine IT", ["Sanne Bakker", "Tom de Groot"]],
    ["TVB", ["Lotte van Dijk", "Mark Jansen"]]
  ]);
});

test("locatie: wie het vaakst op deze tablet registreert, staat bovenaan, ook van een andere locatie", () => {
  const directory = createDirectory();
  directory.view.directory = () => ({ searchFirst: true, pointId: "punt-it", deviceId: "tablet-it" });
  directory.model.state.registrations = [
    { ...registration("r1", "employee-1", "blikje", "2026-11-20T10:00:00"), deviceId: "tablet-it" },
    { ...registration("r2", "employee-1", "blikje", "2026-11-21T10:00:00"), deviceId: "tablet-it" },
    { ...registration("r3", "mw-mark", "blikje", "2026-11-21T10:00:00"), deviceId: "tablet-hal" },
    { ...registration("r4", "mw-tom", "blikje", "2026-11-21T10:00:00"), deviceId: "tablet-it" }
  ];

  // Tom en Sanne werken hier (1000 punten), Tom registreerde hier ook (1 punt). Lotte werkt elders
  // maar pakt hier vaak iets (2 punten). Mark registreerde alleen op een andere tablet.
  assert.deepEqual(search(directory, "e"), [
    ["Kantine IT", ["Tom de Groot", "Sanne Bakker", "Lotte van Dijk"]],
    ["TVB", ["Mark Jansen"]]
  ]);
});

test("locatie: zonder locatie en zonder registraties op deze tablet is er geen eigen groep", () => {
  const directory = createDirectory();
  directory.view.directory = () => ({ searchFirst: true, pointId: null, deviceId: "tablet-nieuw" });

  assert.deepEqual(search(directory, "a").map(([title]) => title), ["IT Supervision", "TVB"]);
});

test("locatie: een inactieve medewerker staat er nooit in, ook niet in de groep van de locatie", () => {
  const directory = createDirectory();
  directory.view.directory = () => ({ searchFirst: true, pointId: "punt-it", deviceId: null });
  directory.model.findEmployee("mw-tom").active = false;

  assert.deepEqual(search(directory, "o"), [["Kantine IT", []], ["TVB", ["Lotte van Dijk"]]].filter(([, names]) => names.length > 0));
});

test("zoeken met een server: index.html heeft de uitleg 'Typ je naam'", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const prompt = html.match(/<div class="empty-state hidden" id="searchPrompt">[\s\S]*?<\/div>/)?.[0] ?? "";

  assert.ok(prompt.includes("<strong>Typ je naam</strong>"));
  assert.ok(prompt.includes("Begin met typen in het zoekveld hierboven."));
});

// ------------------------------------------------------------------
// Producten en voorraad bij de locatie van de tablet (FR-97)
// ------------------------------------------------------------------

test("locatie: op een tablet met een locatie ziet iemand de producten van die locatie en gaat de voorraad daar omlaag", () => {
  const { model, point } = createDirectory();
  model.state.products = [...model.state.products, { id: "koffie", name: "Koffie", price: 0.4 }];
  model.findPoint("punt-it").products = { koffie: { offered: true, stock: 10, minimum: 2 } };

  // Zonder locatie (de demo): de producten en de voorraad van het eigen punt van Lotte.
  assert.ok(model.productsForEmployee("employee-1").some((product) => product.id === "blikje"));
  assert.ok(!model.productsForEmployee("employee-1").some((product) => product.id === "koffie"));

  // De tablet staat bij Kantine IT. Lotte (Hoofdkantoor) pakt daar een koffie.
  model.locationPointId = "punt-it";
  assert.deepEqual(model.productsForEmployee("employee-1").map((product) => product.id), ["koffie"]);
  const before = model.findPoint(point.id).products.blikje.stock;
  model.addRegistration("employee-1", "koffie");

  assert.equal(model.findPoint("punt-it").products.koffie.stock, 9);
  assert.equal(model.findPoint(point.id).products.blikje.stock, before, "de voorraad van haar eigen punt is veranderd");
  assert.equal(model.registrations.at(-1).pointId, "punt-it");
  assert.equal(model.registrations.at(-1).employeeId, "employee-1", "de registratie staat niet op haar eigen naam");
});

test("locatie: een correctie van de beheerder hoort bij het eigen punt van de medewerker, en een onbekende locatie telt niet", () => {
  const { model, point } = createDirectory();
  model.locationPointId = "punt-it";
  model.addRegistration("employee-1", "blikje", { correction: true });
  assert.equal(model.registrations.at(-1).pointId, point.id);

  model.locationPointId = "bestaat-niet";
  assert.equal(model.registrationPointId(model.findEmployee("employee-1")), point.id);
});

test("locatie: een gast pakt iets op de locatie van de tablet", () => {
  const { model } = createDirectory();
  model.state.products = [...model.state.products, { id: "koffie", name: "Koffie", price: 0.4 }];
  model.findPoint("punt-it").products = { koffie: { offered: true, stock: 10, minimum: 2 } };
  const guestId = model.addGuest({ firstName: "Ilse", lastName: "de Wit", phone: "06 12345678" });

  assert.deepEqual(model.productsForEmployee(guestId), [], "zonder locatie heeft een gast geen producten");
  model.locationPointId = "punt-it";
  assert.deepEqual(model.productsForEmployee(guestId).map((product) => product.id), ["koffie"]);
});
