// Regressietests: voor iedere opgeloste bug een test die laat zien dat de bug weg is
// en die faalt als de bug ooit terugkomt. De nummers verwijzen naar de bugs uit de codecontrole.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { ThemeManager } from "../assets/js/ThemeManager.js";
import { CsvExport } from "../assets/js/csvExport.js";
import { DEFAULT_PRODUCTS } from "../assets/js/config.js";
import { DataStore } from "../assets/js/DataStore.js";
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import {
  createModel, createDataStore, createRecordingView, createFakeElement, fakeLocalStorage, registration, asAdmin
} from "./helpers.js";

console.warn = () => {};

// Controller met het testmodel, een nep-view en een ingelogde beheerder.
const createApp = ({ storeOptions } = {}) => {
  const { model, point } = createModel(storeOptions);
  const view = createRecordingView();
  const faceDemo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  return { app: asAdmin(new RegistrationApp(model, view, undefined, faceDemo)), model, view, point, faceDemo };
};
const toastTexts = (view) => view.toasts.map(({ message }) => message);

// Nep-camerastream: onthoudt of het beeld is uitgezet.
const fakeStream = () => {
  const track = { stopped: false, stop() { track.stopped = true; } };
  return { track, getTracks: () => [track] };
};

// Bug 1 en 2: initialen

test("bug 1: initialen worden veilig in de HTML gezet", () => {
  const { model } = createModel();
  model.state.employees[0].name = "<b Jansen";
  const view = new RegistrationView(model);
  const elements = {
    "#employeeSearch": createFakeElement({ value: "" }),
    "#employeeCompanyFilter": createFakeElement(),
    "#employeeCount": createFakeElement(),
    "#emptyState": createFakeElement(),
    "#employeeList": createFakeElement({ innerHTML: "" })
  };
  view.$ = (selector) => elements[selector];

  view.renderEmployees();

  const html = elements["#employeeList"].innerHTML;
  assert.ok(html.includes("&lt;J"));
  assert.equal(html.includes("<J"), false);
  assert.equal(html.includes("<b"), false);
});

test("bug 2: meerdere spaties tellen als één bij de initialen", () => {
  const view = new RegistrationView(null);

  assert.equal(view.initials("Anna  Marie Berg"), "AM");
  assert.equal(view.initials("  Anna Berg "), "AB");
});

// Bug 3: verkeerde melding bij product verwijderen

test("bug 3: mislukt opslaan bij product verwijderen geeft alleen 'Opslaan mislukt'", () => {
  const { app, model, view } = createApp({ storeOptions: { failSave: true } });
  globalThis.window = { confirm: () => true }; // product verwijderen vraagt nu eerst om bevestiging

  app.removeProduct("boter");

  assert.ok(model.findProduct("boter"));
  assert.deepEqual(toastTexts(view), ["Opslaan mislukt. Probeer het opnieuw."]);
});

// Bug 4: logboek klapt terug naar 20 regels

test("bug 4: na 'Meer laden' blijft het logboek even lang na een wijziging", () => {
  const { app, view } = createApp();

  app.loadMoreAudit();
  app.addCorrection("employee-1", "blikje");

  const limits = view.calls.filter(([name]) => name === "renderAuditLog").map(([, limit]) => limit);
  assert.deepEqual(limits, [40, 40]);
});

// Bug 5: gezicht blijft bewaard na verwijderen

test("bug 5: een verwijderde medewerker wordt ook in de demo gezichtsherkenning vergeten", () => {
  const { app, model, faceDemo } = createApp();
  faceDemo.enroll("employee-1", [0.1, 0.2]);
  model.setEmployeeActive("employee-1", false); // alleen een inactieve medewerker kan worden verwijderd
  globalThis.window = { confirm: () => true };

  app.removeEmployee("employee-1");

  assert.equal(model.findEmployee("employee-1"), undefined);
  assert.equal(faceDemo.isEnrolled("employee-1"), false);
  assert.equal(faceDemo.hasEnrolledFaces(), false);
});

// Bug 6: voorraad van een product dat het punt niet aanbiedt

test("bug 6: een product dat het punt niet aanbiedt, gaat niet van de voorraad af (en ook niet terug)", () => {
  const { model, point } = createModel();
  model.savePoint({ id: point.id, name: point.name, companyId: point.companyId, offeredProductIds: ["blikje"] });

  model.addRegistration("employee-1", "ei");
  assert.equal(model.findPoint(point.id).products.ei.stock, 24);
  assert.equal(model.registrations[0].pointId, null);

  model.removeLastRegistration("employee-1", "ei");
  assert.equal(model.findPoint(point.id).products.ei.stock, 24);
});

test("bug 6: een aangeboden product gaat wel van de voorraad af en onthoudt het punt", () => {
  const { model, point } = createModel();

  model.addRegistration("employee-1", "blikje");

  assert.equal(model.findPoint(point.id).products.blikje.stock, 23);
  assert.equal(model.registrations[0].pointId, point.id);
});

// Bug 7: correcties tellen als "vorige keer"

test("bug 7: een correctie van de beheerder telt niet mee als 'vorige keer'", () => {
  const { app, model } = createApp();
  model.state.registrations = [registration("1", "employee-1", "blikje", "2026-09-02T12:00:00")];

  app.addCorrection("employee-1", "yoghurt");

  assert.equal(model.registrations.at(-1).correction, true);
  assert.deepEqual(model.lastSelection("employee-1"), { blikje: 1 });
});

test("bug 7: alleen correcties en geen eigen keuze geeft geen voorstel", () => {
  const { app, model } = createApp();

  app.addCorrection("employee-1", "yoghurt");

  assert.deepEqual(model.lastSelection("employee-1"), {});
});

// Bug 8: prijs met meer dan twee decimalen

test("bug 8: een prijs met drie decimalen wordt in het formulier geweigerd", () => {
  const { app, model, view } = createApp();
  view.$("#productName").value = "Soep";
  view.$("#productPrice").value = "0.125";
  view.$("#productForm").querySelectorAll = () => [view.$("#productName"), view.$("#productPrice")];

  app.saveProduct({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

  assert.equal(model.products.length, DEFAULT_PRODUCTS.length);
  assert.equal(view.fieldErrors[0].message, "Vul een prijs van 0 tot en met 1000 euro in, met hooguit twee decimalen.");
});

test("bug 8: het model rondt een prijs af op hele centen", () => {
  const { model } = createModel();

  model.saveProduct({ name: "Soep", price: "0.125" });
  model.saveProduct({ name: "Thee", price: "0.29" });

  assert.equal(model.products.at(-2).price, 0.13);
  assert.equal(model.products.at(-1).price, 0.29);
});

test("bug 8: isValidPrice accepteert hele centen en weigert de rest", () => {
  for (const price of ["0", "2", "0.5", "0.65", "12.30"]) assert.equal(RegistrationApp.isValidPrice(price), true, price);
  for (const price of ["", "-1", "0.125", "1e3", "abc", "1,50"]) assert.equal(RegistrationApp.isValidPrice(price), false, price);
});

// Bug 9: naam van één woord in oude gegevens

test("bug 9: een oude naam van één woord wordt alleen de voornaam", () => {
  const data = {
    employees: [{ id: "e1", name: "Anna", color: "#fff", active: true }],
    registrations: [],
    products: DEFAULT_PRODUCTS,
    companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
    points: [],
    auditLog: []
  };

  const employee = createDataStore(data).load().employees[0];

  assert.equal(employee.firstName, "Anna");
  assert.equal(employee.lastName, "");
  assert.equal(employee.name, "Anna");
});

// Bug 10: camera die niet meer uit kan

test("bug 10: is het venster gesloten terwijl de camera startte, dan gaat die camera meteen uit", async () => {
  const stream = fakeStream();
  const demo = new FaceRecognitionDemo({ enabled: true }, { getUserMedia: async () => stream });
  const video = { srcObject: null, play: async () => {} };

  const started = await demo.startCamera(video, () => false);

  assert.equal(started, false);
  assert.equal(stream.track.stopped, true);
  assert.equal(demo.stream, null);
  assert.equal(video.srcObject, null);
});

test("bug 10: een nieuwe camera zet een oudere camera eerst uit", async () => {
  const older = fakeStream();
  const newer = fakeStream();
  const streams = [older, newer];
  const demo = new FaceRecognitionDemo({ enabled: true }, { getUserMedia: async () => streams.shift() });
  const video = { srcObject: null, play: async () => {} };

  await demo.startCamera(video);
  await demo.startCamera(video);

  assert.equal(older.track.stopped, true);
  assert.equal(newer.track.stopped, false);
  assert.equal(video.srcObject, newer);
});

// Bug 11: focus weg in de voorraadtabel

test("bug 11: na het aanpassen van de voorraad wordt de tabel niet opnieuw getekend", () => {
  const { app, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;

  app.saveStockField(createFakeElement({ value: "3", dataset: { productId: "blikje", stockField: "stock" } }));

  const names = view.calls.map(([name]) => name);
  assert.equal(names.includes("renderStock"), false);
  assert.ok(names.includes("renderStockAlerts"));
  assert.deepEqual(view.calls.find(([name]) => name === "updateStockStatus"), ["updateStockStatus", point.id, "blikje"]);
});

test("bug 11: het statuslabel van één product wordt bijgewerkt", () => {
  const { model, point } = createModel();
  const view = new RegistrationView(model);
  const badge = createFakeElement({ className: "stock-badge stock-ok", textContent: "Op voorraad" });
  globalThis.document = { querySelector: (selector) => (selector === '[data-stock-status="blikje"]' ? badge : null) };
  model.setStock(point.id, "blikje", 0);

  view.updateStockStatus(point.id, "blikje");

  assert.equal(badge.className, "stock-badge stock-out");
  assert.equal(badge.textContent, "Op");
});

// Bug 12 (Ctrl + K achter een venster) staat in controller.test.js bij de toetsenbordtests.

// Bug 13: flits bij "Auto"

test("bug 13: ThemeManager onthoudt welk thema zichtbaar is", () => {
  fakeLocalStorage();
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.document = { documentElement: { dataset: {} } };
  const button = () => ({ dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
  const theme = new ThemeManager();
  theme.switchButton = button();
  theme.modeButtons = [];

  theme.mode = "dark";
  theme.apply();
  assert.equal(localStorage.getItem(ThemeManager.LAST_THEME_KEY), "dark");

  theme.mode = "light";
  theme.apply();
  assert.equal(localStorage.getItem(ThemeManager.LAST_THEME_KEY), "light");
});

test("bug 13: het script in index.html gebruikt bij 'Auto' het thema van het vorige bezoek", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const headScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  const run = (stored) => {
    const documentElement = { dataset: {} };
    const storage = { getItem: (key) => stored[key] ?? null };
    new Function("localStorage", "window", "document", headScript)(
      storage,
      { matchMedia: () => ({ matches: false }) },
      { documentElement }
    );
    return documentElement.dataset.theme;
  };

  assert.equal(run({ "tvb-theme": "auto", "tvb-theme-last": "dark" }), "dark");
  assert.equal(run({ "tvb-theme": "auto", "tvb-theme-last": "light" }), undefined);
  assert.equal(run({ "tvb-theme": "dark" }), "dark");
  assert.equal(run({}), undefined);
});

// Kleine risico's uit de codecontrole

test("risico: een beschadigde logboekregel wordt bij het laden overgeslagen", () => {
  const data = {
    employees: [{ id: "e1", name: "Jan Jansen", color: "#fff", active: true }],
    registrations: [],
    products: DEFAULT_PRODUCTS,
    companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
    points: [],
    auditLog: [
      { id: "a1", action: "Product gewijzigd", details: "Blikje", createdAt: "2026-09-10T10:00:00.000Z" },
      { id: "a2", action: "Kapot", details: "geen datum", createdAt: "geen-datum" },
      null
    ]
  };

  const auditLog = createDataStore(data).load().auditLog;

  assert.deepEqual(auditLog.map(({ id }) => id), ["a1"]);
});

test("risico: voorraad als tekst wordt bij het laden een getal, zodat optellen klopt", () => {
  const data = {
    employees: [{ id: "e1", name: "Jan Jansen", color: "#fff", active: true }],
    registrations: [],
    products: DEFAULT_PRODUCTS,
    companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
    points: [{ id: "p1", name: "Kantine", companyId: "c1", products: { blikje: { offered: true, stock: "5", minimum: "2" } } }],
    auditLog: []
  };

  const entry = createDataStore(data).load().points[0].products.blikje;

  assert.deepEqual(entry, { offered: true, stock: 5, minimum: 2 });
  assert.equal(entry.stock + 1, 6);
});

test("risico: de CSV-download ruimt het tijdelijke adres pas na een seconde op", async () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");
  const link = { clicked: false, click() { link.clicked = true; }, remove() {} };
  globalThis.document = { createElement: () => link, body: { append() {} } };
  const revoked = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = (url) => revoked.push(url);

  try {
    assert.equal(new CsvExport(model).download("all", "all"), true);
    assert.equal(link.clicked, true);
    assert.equal(link.download, "blikjesregistratie-alle-periodes.csv");
    assert.deepEqual(revoked, []);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.deepEqual(revoked, ["blob:test"]);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test("risico: een datum uit een ander jaar krijgt het jaartal erbij", () => {
  const view = new RegistrationView(null);
  const now = new Date(2026, 9, 2);

  // Geen exacte tekst vergelijken: de notatie van Intl (scheidingsteken, afkorting van
  // de maand) kan per Node/ICU-versie net anders zijn. Wel controleren waar het om gaat.
  const ditJaar = view.formatDate(new Date(2026, 9, 1, 12, 5).toISOString(), now);
  const anderJaar = view.formatDate(new Date(2025, 9, 1, 12, 5).toISOString(), now);

  assert.doesNotMatch(ditJaar, /2026|2025/);
  assert.match(anderJaar, /2025/);
  for (const tekst of [ditJaar, anderJaar]) {
    assert.match(tekst, /12:05/);
    assert.match(tekst, /\b01\b/);
  }
});

test("risico: de correctielijst telt alle registraties in één keer per medewerker en product", () => {
  const { model } = createModel();
  model.state.registrations = [
    registration("1", "employee-1", "blikje", "2026-09-02T12:00:00"),
    registration("2", "employee-1", "blikje", "2026-09-03T12:00:00"),
    registration("3", "employee-2", "ei", "2026-09-03T12:00:00")
  ];

  const counts = new RegistrationView(model).countRegistrations();

  assert.equal(counts.get("employee-1|blikje"), 2);
  assert.equal(counts.get("employee-2|ei"), 1);
  assert.equal(counts.get("employee-1|ei"), undefined);
});

test("risico: werkgevernummer, looncode en personeelsnummer mogen alleen cijfers bevatten", () => {
  for (const value of ["0", "12", "00123"]) assert.equal(RegistrationApp.isDigitsOnly(value), true, value);
  for (const value of ["", "-5", "1.5", "12a", "1e3"]) assert.equal(RegistrationApp.isDigitsOnly(value), false, value);
});

// ------------------------------------------------------------------
// Tweede codecontrole
// ------------------------------------------------------------------

test("controle 2, punt 1: een prijs zonder 0 vooraan (\".5\") is geldig", () => {
  for (const price of [".5", ".65", "0.50"]) assert.equal(RegistrationApp.isValidPrice(price), true, price);
  for (const price of [".", ".125", "5."]) assert.equal(RegistrationApp.isValidPrice(price), false, price);
});

test("controle 2, punt 1: een product met prijs \".5\" wordt opgeslagen als 0,50", () => {
  const { app, model, view } = createApp();
  view.$("#productName").value = "Soep";
  view.$("#productPrice").value = ".5";
  view.$("#productForm").querySelectorAll = () => [view.$("#productName"), view.$("#productPrice")];

  app.saveProduct({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

  assert.deepEqual(view.fieldErrors, []);
  assert.equal(model.products.at(-1).price, 0.5);
});

// Nep-pagina voor renderEmployeeProducts: per selector altijd hetzelfde nep-element.
const createProductWindowView = (model) => {
  const view = new RegistrationView(model);
  const elements = new Map();
  view.$ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createFakeElement({ innerHTML: "" }));
    return elements.get(selector);
  };
  return view;
};

test("controle 2, punt 2: na alleen een correctie van de beheerder staat er geen 'welkom terug'", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje", { correction: true });
  const view = createProductWindowView(model);

  view.renderEmployeeProducts("employee-1");

  assert.equal(view.$("#employeeWelcome").textContent.includes("welkom terug"), false);
  assert.equal(model.hasOwnRegistration("employee-1"), false);
});

test("controle 2, punt 2: na een eigen registratie staat er wel 'welkom terug'", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");
  const view = createProductWindowView(model);

  view.renderEmployeeProducts("employee-1");

  assert.ok(view.$("#employeeWelcome").textContent.endsWith("Test, welkom terug."));
  assert.equal(model.hasOwnRegistration("employee-1"), true);
});

test("controle 2, punt 3: het zoekveld krijgt een zichtbare focus", () => {
  const css = fs.readFileSync(new URL("../assets/css/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.search-box:focus-within\s*\{\s*border-color\s*:\s*var\(--green\)/);
});

test("controle 2, punt 4: 'Alle bedrijven' kiezen laat het filterveld leeg", () => {
  const { app, view } = createApp();
  const filter = view.$("#employeeCompanyFilter");

  app.selectCompanyFilterOption(createFakeElement({ dataset: { companyValue: "bedrijf-1" }, textContent: "Klik" }));
  assert.equal(filter.value, "Klik");

  app.selectCompanyFilterOption(createFakeElement({ dataset: { companyValue: "all" }, textContent: "Alle bedrijven" }));
  assert.equal(filter.value, "");
  assert.equal(filter.dataset.value, "all");
});

test("controle 2, punt 5: 'Herken mij' opent niet als alleen een inactieve medewerker is ingesteld", () => {
  const { app, model, view, faceDemo } = createApp();
  faceDemo.enroll("employee-1", [0.1]);
  model.setEmployeeActive("employee-1", false);
  view.$("#faceModal").classList.add("hidden");

  app.startFaceRecognition();

  assert.equal(view.$("#faceModal").classList.contains("hidden"), true);
  assert.equal(toastTexts(view).length, 1);
  assert.equal(faceDemo.isEnrolled("employee-1"), true); // het gezicht blijft bewaard
});

test("controle 2, punt 5: enrolledIds geeft de medewerkers met een ingesteld gezicht", () => {
  const demo = new FaceRecognitionDemo({ enabled: true }, null);
  demo.enroll("employee-1", [0.1]);
  demo.enroll("employee-2", [0.2]);

  assert.deepEqual(demo.enrolledIds(), ["employee-1", "employee-2"]);
});

test("controle 2, punt 6: het productvenster zet de focus op de eerste '+'-knop", () => {
  const { app, view } = createApp();

  app.openEmployeeProducts("employee-1");

  assert.equal(view.$("#employeeProductList [data-product-increment]").focused, true);
});

test("controle 2, punt 6: na '+' met het toetsenbord houdt dezelfde knop de focus", () => {
  const { app, view } = createApp();
  app.openEmployeeProducts("employee-1");
  globalThis.document = { activeElement: createFakeElement({ dataset: { productIncrement: "blikje" } }) };

  app.incrementProduct("blikje");

  assert.equal(view.$('[data-product-increment="blikje"]').focused, true);
  assert.equal(app.selectedProducts.blikje, 1);
});

test("controle 2, punt 6: staat het aantal na '−' weer op 0, dan gaat de focus naar de '+' ernaast", () => {
  const { app, view } = createApp();
  app.openEmployeeProducts("employee-1");
  app.selectedProducts = { blikje: 1 };
  view.$('[data-product-decrement="blikje"]').disabled = true; // zo tekent de view de "−" bij 0
  globalThis.document = { activeElement: createFakeElement({ dataset: { productDecrement: "blikje" } }) };

  app.decrementProduct("blikje");

  assert.equal(view.$('[data-product-decrement="blikje"]').focused, false);
  assert.equal(view.$('[data-product-increment="blikje"]').focused, true);
});

test("controle 2, punt 6: wijzigen van een medewerker of product zet de focus op het eerste veld", () => {
  const { app, view } = createApp();

  app.openEditEmployeeForm("employee-1");
  app.openEditProductForm("blikje");

  assert.equal(view.$("#newEmployeeFirstName").focused, true);
  assert.equal(view.$("#productName").focused, true);
});

test("controle 2, punt 7: het admin-venster heet 'Overzicht' na inloggen en 'Welkom terug' na uitloggen", () => {
  const { app, view } = createApp();
  view.$("#loginEmail").value = "admin@tvb.nl";
  view.$("#loginPassword").value = "geheim";

  app.login({ preventDefault() {} });
  assert.equal(view.$("#adminModal").getAttribute("aria-labelledby"), "dashboardTitle");
  assert.equal(view.$(".tab.active").focused, true);

  app.logout();
  assert.equal(view.$("#adminModal").getAttribute("aria-labelledby"), "adminTitle");
  assert.equal(view.$("#loginEmail").focused, true);
});

test("controle 2, punt 7: index.html heeft de kop 'Overzicht' met id dashboardTitle", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<h2 id="dashboardTitle">Overzicht<\/h2>/);
});

// ------------------------------------------------------------------
// Derde codecontrole
// ------------------------------------------------------------------

// Opslag die doet alsof een ander tabblad intussen nieuwe gegevens heeft opgeslagen.
const otherTabStore = (key, getState) => ({ key, loadProblem: null, load: () => getState(), save: () => true });

test("controle 3, punt 1: een wijziging uit een ander tabblad wordt ingeladen en niet overschreven", () => {
  const { app, model } = createApp();
  const otherTabState = { ...model.snapshot(), registrations: [registration("ander-tabblad", "employee-1", "ei", "2026-10-01T10:00:00")] };
  model.store = otherTabStore("tvb-test", () => otherTabState);

  app.handleStorageChange({ key: "tvb-test" });
  model.addRegistration("employee-1", "blikje");

  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["ei", "blikje"]);
});

test("controle 3, punt 1: wijzigingen onder een andere sleutel (zoals het thema) worden genegeerd", () => {
  const { app, model } = createApp();
  let loads = 0;
  model.store = otherTabStore("tvb-test", () => { loads += 1; return model.snapshot(); });

  app.handleStorageChange({ key: "tvb-theme" });
  app.handleStorageChange({ key: "tvb-test-backup" });

  assert.equal(loads, 0);
});

test("controle 3, punt 1: is de medewerker in een ander tabblad verwijderd, dan sluit zijn productvenster", () => {
  const { app, model } = createApp();
  app.openEmployeeProducts("employee-1");
  const withoutEmployee = { ...model.snapshot(), employees: [] };
  model.store = otherTabStore("tvb-test", () => withoutEmployee);

  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(app.selectedEmployeeId, null);
});

test("controle 3, punt 2: onleesbare gegevens worden als reservekopie bewaard", () => {
  fakeLocalStorage();
  localStorage.setItem("tvb-test", "{kapot");
  const store = new DataStore("tvb-test");

  assert.equal(store.load(), null);
  assert.equal(store.loadProblem, "unreadable");
  assert.equal(localStorage.getItem("tvb-test-backup"), "{kapot");
});

test("controle 3, punt 2: een oudere reservekopie wordt niet overschreven", () => {
  fakeLocalStorage();
  localStorage.setItem("tvb-test-backup", "{oude kopie");
  localStorage.setItem("tvb-test", "{nieuwe fout");

  new DataStore("tvb-test").load();

  assert.equal(localStorage.getItem("tvb-test-backup"), "{oude kopie");
});

test("controle 3, punt 2: null in een lijst laat het laden niet vastlopen", () => {
  const data = {
    employees: [{ id: "e1", name: "Jan Jansen", color: "#fff", active: true }, null],
    registrations: [null, { id: "r1", employeeId: "e1", productId: "blikje", createdAt: "2026-09-10T10:00:00.000Z" }],
    products: DEFAULT_PRODUCTS,
    companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
    points: [null],
    auditLog: []
  };
  const store = createDataStore(data);

  const loaded = store.load();

  assert.equal(loaded.employees.length, 1);
  assert.equal(loaded.registrations.length, 1);
  assert.equal(store.loadProblem, "skipped");
});

test("controle 3, punt 2: het model en de controller waarschuwen bij beschadigde gegevens", () => {
  fakeLocalStorage();
  localStorage.setItem("tvb-test", "{kapot");
  const model = new RegistrationModel(new DataStore("tvb-test"));
  const view = createRecordingView();

  new RegistrationApp(model, view, undefined, new FaceRecognitionDemo({ enabled: false }, null)).showLoadProblem();

  assert.equal(model.loadProblem, "unreadable");
  assert.equal(model.employees.length, 8); // demogegevens
  assert.equal(view.toasts[0].tone, "error");
  assert.ok(view.toasts[0].message.includes("reservekopie"));
});

test("kan de browseropslag niet worden gelezen, dan krijgt de gebruiker een waarschuwing", () => {
  globalThis.localStorage = { getItem: () => { throw new Error("geblokkeerd"); }, setItem() {}, removeItem() {} };
  const model = new RegistrationModel(new DataStore("tvb-test"));
  const view = createRecordingView();

  new RegistrationApp(model, view, undefined, new FaceRecognitionDemo({ enabled: false }, null)).showLoadProblem();

  assert.equal(model.loadProblem, "unavailable");
  assert.equal(model.employees.length, 8); // demogegevens
  assert.equal(view.toasts[0].tone, "error");
  assert.ok(view.toasts[0].message.includes("niet worden gelezen"));
});

test("controle 3, punt 3: na 'Zelfde als vorige keer' gaat de focus naar 'Registreren'", () => {
  const { app, model, view } = createApp();
  model.state.registrations = [registration("1", "employee-1", "blikje", "2026-09-02T12:00:00")];
  app.openEmployeeProducts("employee-1");

  app.repeatLastSelection();

  assert.equal(view.$("#registerSelectedProductsButton").focused, true);
});

test("controle 3, punt 3: zonder producten gaat de focus naar de sluitknop", () => {
  const { app, view } = createApp();
  app.openEmployeeProducts("employee-1");
  view.$("#registerSelectedProductsButton").classList.add("hidden");
  view.$("#employeeProductsModal .modal-close").focused = false;

  app.forgetFace();

  assert.equal(view.$("#employeeProductsModal .modal-close").focused, true);
});

test("controle 3, punt 4: consumptiepunt is verplicht als het bedrijf punten heeft", () => {
  const { model, point } = createModel();
  const view = new RegistrationView(model);
  const elements = { "#newEmployeeCompany": createFakeElement(), "#newEmployeePoint": createFakeElement({ innerHTML: "" }) };
  view.$ = (selector) => elements[selector];

  elements["#newEmployeeCompany"].value = point.companyId;
  view.populateEmployeePointSelect();
  assert.equal(elements["#newEmployeePoint"].required, true);

  elements["#newEmployeeCompany"].value = model.companies.find(({ name }) => name === "MVIE").id;
  view.populateEmployeePointSelect();
  assert.equal(elements["#newEmployeePoint"].required, false);
});
