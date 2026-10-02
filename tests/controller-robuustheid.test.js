// Tests voor de robuustheid van de controller en de view: de tablet die dag en nacht aan staat,
// correcties in een oude maand, logboek en wijziging in één keer opslaan, invoercontrole bij de
// voorraad, verouderde formulieren en knoppen (na een wijziging in een ander tabblad), de demo
// gezichtsherkenning, de focus na het sluiten van een venster, veilige HTML en het wissen van
// alle gegevens. De pagina wordt nagebootst met een nep-view en nep-elementen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView, cssAttributeValue } from "../assets/js/RegistrationView.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { createModel, createRecordingView, createFakeElement, addEmployee, registration } from "./helpers.js";

// Controller met het testmodel (employee-1 op Hoofdkantoor van TVB) en een nep-view.
const createApp = ({ storeOptions, faceDemo } = {}) => {
  globalThis.document = { activeElement: null, querySelectorAll: () => [] };
  const { model, point } = createModel(storeOptions);
  const view = createRecordingView();
  const demo = faceDemo || new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  return { app: new RegistrationApp(model, view, undefined, demo), model, view, point };
};

const toastTexts = (view) => view.toasts.map(({ message }) => message);
const calledNames = (view) => view.calls.map(([name]) => name);

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

// Vult de velden van een formulier en zegt welke velden verplicht zijn en welke vinkjes aan staan.
const fillForm = (view, formSelector, values, requiredSelectors = [], checkedValues = []) => {
  for (const [selector, value] of Object.entries(values)) view.$(selector).value = value;
  const form = view.$(formSelector);
  form.querySelectorAll = (query) =>
    query === "[required]" ? requiredSelectors.map((selector) => view.$(selector)) : checkedValues.map((value) => ({ value }));
  return form;
};
const submitEvent = () => ({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

// Opslag die doet alsof een ander tabblad intussen nieuwe gegevens heeft opgeslagen.
const otherTabStore = (state, loadProblem = null) => ({ key: "tvb-test", loadProblem, load: () => state, save: () => true });

// Een datum (lokale tijd, midden in de maand) een aantal maanden voor vandaag.
const monthsAgo = (months) => {
  const date = new Date();
  date.setDate(15);
  date.setHours(12, 0, 0, 0);
  date.setMonth(date.getMonth() - months);
  return date;
};

// ------------------------------------------------------------------
// De tablet staat dag en nacht aan
// ------------------------------------------------------------------

test("op dezelfde dag worden datum en totalen niet opnieuw getekend", () => {
  const { app, view } = createApp();
  app.currentDay = new Date(2026, 9, 2, 8, 0).toDateString();

  const changed = app.refreshIfNewDay(new Date(2026, 9, 2, 23, 59));

  assert.equal(changed, false);
  assert.equal(calledNames(view).includes("renderStats"), false);
});

test("na middernacht worden de datum en de tegels Vandaag en Deze maand bijgewerkt", () => {
  const { app, view } = createApp();
  app.currentDay = new Date(2026, 9, 2, 23, 59).toDateString();

  const changed = app.refreshIfNewDay(new Date(2026, 9, 3, 0, 1));

  assert.equal(changed, true);
  assert.equal(view.$("#todayLabel").textContent, "3 oktober 2026");
  assert.ok(calledNames(view).includes("renderStats"));
  assert.equal(app.refreshIfNewDay(new Date(2026, 9, 3, 0, 2)), false, "dezelfde nieuwe dag telt maar één keer");
});

// ------------------------------------------------------------------
// Correctie "−" in een oude maand
// ------------------------------------------------------------------

test("correctie '−' van een registratie uit een vorige maand vraagt eerst om bevestiging met de maandnaam", () => {
  const { app, model } = createApp();
  const oldDate = monthsAgo(1);
  model.state.registrations = [registration("oud", "employee-1", "blikje", oldDate.toISOString())];
  const questions = [];
  globalThis.window = { confirm: (question) => { questions.push(question); return false; } };

  app.removeCorrection("employee-1", "blikje");

  const monthName = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(oldDate);
  assert.deepEqual(questions, [`Deze registratie is van ${monthName}. Die loonmaand is mogelijk al verwerkt. Toch verwijderen?`]);
  assert.equal(model.registrations.length, 1, "Annuleren verandert niets");
  assert.equal(model.auditLog.length, 0);
});

test("correctie '−' van een oude maand gaat door als de beheerder bevestigt", () => {
  const { app, model } = createApp();
  model.state.registrations = [registration("oud", "employee-1", "blikje", monthsAgo(2).toISOString())];
  globalThis.window = { confirm: () => true };

  app.removeCorrection("employee-1", "blikje");

  assert.equal(model.registrations.length, 0);
  assert.equal(model.auditLog.at(-1).action, "Registratie verwijderd");
});

test("correctie '−' in de huidige maand vraagt niet om bevestiging", () => {
  const { app, model } = createApp();
  model.addRegistration("employee-1", "blikje");
  let asked = false;
  globalThis.window = { confirm: () => { asked = true; return false; } };

  app.removeCorrection("employee-1", "blikje");

  assert.equal(asked, false);
  assert.equal(model.registrations.length, 0);
});

// ------------------------------------------------------------------
// Wijziging en logboekregel in één keer opslaan
// ------------------------------------------------------------------

test("een wijziging en de logboekregel worden in één keer opgeslagen", () => {
  const { app, model } = createApp();
  const counter = countSaves(model);

  app.removeProduct("boter");

  assert.equal(counter.saves, 1);
  assert.equal(model.findProduct("boter"), undefined);
  assert.equal(model.auditLog.at(-1).action, "Product verwijderd");
});

test("mislukt opslaan draait de wijziging én de logboekregel samen terug", () => {
  const { app, model, view } = createApp({ storeOptions: { failSave: true } });
  model.addRegistration("employee-1", "blikje");

  app.toggleEmployee("employee-1");
  app.addCorrection("employee-1", "ei");

  assert.equal(model.findEmployee("employee-1").active, true);
  assert.equal(model.registrations.length, 1);
  assert.equal(model.auditLog.length, 0);
  assert.deepEqual(toastTexts(view), ["Opslaan mislukt. Probeer het opnieuw.", "Opslaan mislukt. Probeer het opnieuw."]);
});

test("persist zonder logboekregel werkt nog zoals voorheen", () => {
  const { app, model } = createApp();

  assert.equal(app.persist(() => model.addRegistration("employee-1", "blikje")), true);
  assert.equal(model.registrations.length, 1);
  assert.equal(model.auditLog.length, 0);
});

test("na een beheerwijziging wordt niet nog eens apart opgeslagen en wordt de registratietabel opnieuw getekend", () => {
  const { app, model, view } = createApp();
  const counter = countSaves(model);

  app.finishAdminChange("Product gewijzigd");

  assert.equal(counter.saves, 0);
  assert.ok(calledNames(view).includes("renderAdmin"));
});

// ------------------------------------------------------------------
// Invoercontrole bij de voorraad
// ------------------------------------------------------------------

const stockInput = (productId, field, value) => createFakeElement({ value, dataset: { productId, stockField: field } });

test("voorraad tellen: een negatief aantal of meer dan 100.000 wordt geweigerd", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;

  const negative = stockInput("blikje", "stock", "-1");
  app.saveStockField(negative);
  app.saveStockField(stockInput("blikje", "stock", "100001"));
  app.saveStockField(stockInput("blikje", "minimum", "100001"));

  assert.equal(negative.value, 24, "het veld springt terug");
  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
  assert.equal(model.findPoint(point.id).products.blikje.minimum, 6);
  assert.deepEqual(toastTexts(view), [
    "Vul een geheel aantal van 0 of hoger in",
    "Vul een aantal van hooguit 100.000 in",
    "Vul een aantal van hooguit 100.000 in"
  ]);
});

test("voorraad tellen: 0 en 100.000 zijn toegestaan", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;

  app.saveStockField(stockInput("blikje", "stock", "100000"));
  app.saveStockField(stockInput("ei", "stock", "0"));

  assert.equal(model.findPoint(point.id).products.blikje.stock, 100000);
  assert.equal(model.findPoint(point.id).products.ei.stock, 0);
});

test("levering: meer dan 100.000 wordt geweigerd", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;
  view.$('[data-delivery-amount="blikje"]').value = "100001";

  app.bookDelivery("blikje");

  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
  assert.deepEqual(toastTexts(view), ["Vul een geleverd aantal van hooguit 100.000 in"]);
});

// ------------------------------------------------------------------
// Dubbele tik op "Toevoegen" bij een levering
// ------------------------------------------------------------------

test("een tweede tik op 'Toevoegen' vlak na een levering wordt genegeerd", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;
  const amountField = view.$('[data-delivery-amount="blikje"]');

  amountField.value = "5";
  app.bookDelivery("blikje");
  amountField.value = ""; // de tabel is opnieuw getekend, het veld is leeg
  app.bookDelivery("blikje");

  assert.equal(model.findPoint(point.id).products.blikje.stock, 29);
  assert.deepEqual(toastTexts(view), ["Levering toegevoegd aan de voorraad"]);

  // Later (na 800 ms) telt een klik weer gewoon, dus ook de controle van het lege veld.
  app.lastDelivery.time -= 1000;
  app.bookDelivery("blikje");
  assert.equal(toastTexts(view).at(-1), "Vul een geleverd aantal van minimaal 1 in");
});

// ------------------------------------------------------------------
// Verouderde formulieren (gegeven in een ander tabblad verwijderd)
// ------------------------------------------------------------------

test("opslaan van een product dat intussen is verwijderd, maakt het niet opnieuw aan", () => {
  const { app, model, view } = createApp();
  const form = fillForm(view, "#productForm", { "#productName": "Spook", "#productPrice": "1" }, ["#productName", "#productPrice"]);
  form.dataset.editingId = "bestaat-niet";

  app.saveProduct(submitEvent());

  assert.equal(model.findProduct("bestaat-niet"), undefined);
  assert.equal(model.products.some(({ name }) => name === "Spook"), false);
  assert.deepEqual(toastTexts(view), ["Dit product bestaat niet meer; er is niets opgeslagen."]);
  assert.equal(view.$("#productFormModal").classList.contains("hidden"), true);
  assert.equal(form.dataset.editingId, undefined);
});

test("opslaan van een bedrijf, medewerker of consumptiepunt dat intussen is verwijderd, slaat niets op", () => {
  const { app, model, view } = createApp();
  const before = JSON.stringify(model.state);

  fillForm(view, "#companyForm", { "#companyName": "Nieuw BV", "#companyEmployerNumber": "" }, ["#companyName"]).dataset.editingId = "weg";
  app.saveCompany(submitEvent());
  fillForm(view, "#employeeForm", { "#newEmployeeFirstName": "Jan", "#newEmployeeLastName": "Jansen", "#newEmployeePayrollCode": "", "#newEmployeePersonnelNumber": "9", "#newEmployeeEmployerNumber": "" }).dataset.editingId = "weg";
  app.saveEmployee(submitEvent());
  fillForm(view, "#pointForm", { "#pointName": "Kantine", "#pointCompany": model.companies[0].id }, ["#pointName"]).dataset.editingId = "weg";
  app.savePoint(submitEvent());

  assert.equal(JSON.stringify(model.state), before);
  assert.deepEqual(toastTexts(view), [
    "Dit bedrijf bestaat niet meer; er is niets opgeslagen.",
    "Deze medewerker bestaat niet meer; er is niets opgeslagen.",
    "Dit consumptiepunt bestaat niet meer; er is niets opgeslagen."
  ]);
  for (const modal of ["#companyFormModal", "#employeeFormModal", "#pointFormModal"]) {
    assert.equal(view.$(modal).classList.contains("hidden"), true, modal);
  }
});

test("een open wijzigformulier sluit als het gegeven in een ander tabblad is verwijderd", () => {
  const { app, model, view } = createApp();
  view.$("#productForm").dataset.editingId = "blikje";
  const otherTabState = { ...model.snapshot(), products: model.products.filter(({ id }) => id !== "blikje") };
  model.store = otherTabStore(otherTabState);

  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(view.$("#productFormModal").classList.contains("hidden"), true);
  assert.equal(view.$("#productForm").dataset.editingId, undefined);
  assert.equal(view.toasts.at(-1).tone, "error");
});

test("is de medewerker in een ander tabblad verwijderd, dan sluiten productvenster en camera met een melding", () => {
  const { app, model, view } = createApp();
  app.openEmployeeProducts("employee-1");
  const sessionBefore = app.faceSession;
  model.store = otherTabStore({ ...model.snapshot(), employees: [] });

  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(app.selectedEmployeeId, null);
  assert.equal(view.$("#faceModal").classList.contains("hidden"), true);
  assert.ok(app.faceSession > sessionBefore, "de camera is gestopt");
  assert.match(toastTexts(view).at(-1), /in een ander venster verwijderd of gedeactiveerd/);
});

test("waren de gegevens uit een ander tabblad onbruikbaar, dan komt er toch een waarschuwing", () => {
  const { app, model, view } = createApp();
  model.store = otherTabStore(null, "unreadable");

  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(view.toasts.at(-1).tone, "error");
  assert.match(view.toasts.at(-1).message, /onleesbaar/);
});

test("typt de beheerder in de voorraadtabel, dan blijft die tabel staan bij een wijziging uit een ander tabblad", () => {
  const { app, model, view } = createApp();
  const input = createFakeElement({ value: "1" });
  globalThis.document = { activeElement: input };
  view.$("#stockTableBody").contains = (element) => element === input;
  model.store = otherTabStore(model.snapshot());

  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(calledNames(view).includes("renderStock"), false);
  assert.ok(calledNames(view).includes("renderStockAlerts"));
  assert.equal(input.value, "1");
});

// ------------------------------------------------------------------
// Verouderde knoppen
// ------------------------------------------------------------------

test("knoppen van een gegeven dat niet meer bestaat geven een melding in plaats van een fout", () => {
  const { app, view } = createApp();
  globalThis.window = { confirm: () => true };

  app.toggleEmployee("weg");
  app.openEditEmployeeForm("weg");
  app.openEditProductForm("weg");
  app.openEditCompanyForm("weg");
  app.openEditPointForm("weg");
  app.removeCompany("weg");
  app.removePoint("weg");

  assert.deepEqual(toastTexts(view), [
    "Deze medewerker bestaat niet meer; er is niets opgeslagen.",
    "Deze medewerker bestaat niet meer; er is niets opgeslagen.",
    "Dit product bestaat niet meer; er is niets opgeslagen.",
    "Dit bedrijf bestaat niet meer; er is niets opgeslagen.",
    "Dit consumptiepunt bestaat niet meer; er is niets opgeslagen.",
    "Dit bedrijf bestaat niet meer; er is niets opgeslagen.",
    "Dit consumptiepunt bestaat niet meer; er is niets opgeslagen."
  ]);
});

// ------------------------------------------------------------------
// Consumptiepunt naar een ander bedrijf
// ------------------------------------------------------------------

test("verhuist een consumptiepunt naar een ander bedrijf, dan verhuizen de medewerkers mee met hun naam ongewijzigd", () => {
  const { app, model, view, point } = createApp();
  model.state.employees[0] = { ...model.state.employees[0], name: "Oude Schrijfwijze" };
  const otherCompany = model.companies.find(({ id }) => id !== point.companyId);
  const form = fillForm(view, "#pointForm", { "#pointName": point.name, "#pointCompany": otherCompany.id }, ["#pointName"], ["blikje"]);
  form.dataset.editingId = point.id;

  app.savePoint(submitEvent());

  const employee = model.findEmployee("employee-1");
  assert.equal(employee.companyId, otherCompany.id);
  assert.equal(employee.name, "Oude Schrijfwijze");
  assert.equal(model.auditLog.at(-1).action, "Consumptiepunt gewijzigd");
});

// ------------------------------------------------------------------
// Demo gezichtsherkenning
// ------------------------------------------------------------------

// Nep-demo die direct laadt; readFace is per test te vervangen.
const createFaceDemo = (overrides = {}) => ({
  enrolled: [],
  stopped: 0,
  settings: { scanTimeoutMs: 1000 },
  load: async () => {},
  startCamera: async () => true,
  stopCamera() { this.stopped += 1; },
  readFace: async () => [0.1, 0.2],
  resetConfirmation() {},
  enroll(id) { this.enrolled.push(id); },
  isAvailable: () => true,
  isEnrolled: () => false,
  ...overrides
});

test("mislukt de camera nadat het beeld al aan stond, dan wordt de camera uitgezet", async () => {
  const demo = createFaceDemo({
    startCamera: async (video) => {
      video.srcObject = "stream";
      throw new Error("video.play() mislukt");
    }
  });
  const { app, view } = createApp({ faceDemo: demo });

  await app.openFaceModal("enroll", "employee-1");

  assert.equal(demo.stopped, 1);
  assert.equal(view.$("#faceStatus").dataset.tone, "error");
});

test("een vastlegging uit een gesloten cameravenster blokkeert een opnieuw geopend venster niet", async () => {
  let finishReading;
  const demo = createFaceDemo({ readFace: () => new Promise((resolve) => { finishReading = () => resolve([0.1, 0.2]); }) });
  const { app, view } = createApp({ faceDemo: demo });

  await app.openFaceModal("enroll", "employee-1");
  view.$("#faceConsent").checked = true;
  const oldCapture = app.captureEnrollment();
  assert.equal(app.capturing, true);

  app.closeFaceModal();
  await app.openFaceModal("enroll", "employee-1");
  view.$("#faceConsent").checked = true;
  app.updateEnrollButton();

  assert.equal(app.capturing, false);
  assert.equal(view.$("#faceEnrollButton").disabled, false);

  finishReading();
  await oldCapture;
  assert.deepEqual(demo.enrolled, [], "het oude venster legt niets vast");
});

// ------------------------------------------------------------------
// Focus terug naar de knop die het venster opende
// ------------------------------------------------------------------

test("na sluiten van een venster gaat de focus terug naar de knop waarmee het werd geopend", () => {
  const { app } = createApp();
  const opener = createFakeElement({ isConnected: true });
  globalThis.document = { activeElement: opener, querySelectorAll: () => [] };

  app.openProductForm();
  globalThis.document.activeElement = null;
  app.closeProductForm();

  assert.equal(opener.focused, true);
});

test("ook bij sluiten met Escape of de achtergrond gaat de focus terug", () => {
  const { app, view } = createApp();
  const opener = createFakeElement({ isConnected: true });
  globalThis.document = { activeElement: opener, querySelectorAll: () => [] };
  app.registerModalClose("#companyFormModal", "[data-close-company-modal]", () => app.closeCompanyForm());

  app.openCompanyForm();
  app.modalCloseActions.get(view.$("#companyFormModal"))();

  assert.equal(opener.focused, true);
  assert.equal(view.$("#companyFormModal").classList.contains("hidden"), true);
});

test("staat de knop niet meer op de pagina, dan krijgt hij de focus niet terug", () => {
  const { app } = createApp();
  const opener = createFakeElement({ isConnected: false });
  globalThis.document = { activeElement: opener, querySelectorAll: () => [] };

  app.openEmployeeProducts("employee-1");
  app.closeEmployeeProducts();

  assert.equal(opener.focused, false);
});

// ------------------------------------------------------------------
// View: bedrijfsfilter
// ------------------------------------------------------------------

// View met nep-elementen voor de medewerkerlijst en het bedrijfsfilter.
const createFilterView = (model) => {
  const view = new RegistrationView(model);
  const elements = {
    "#employeeSearch": createFakeElement({ value: "" }),
    "#employeeCompanyFilter": createFakeElement(),
    "#employeeCount": createFakeElement(),
    "#emptyState": createFakeElement(),
    "#employeeList": createFakeElement({ innerHTML: "" }),
    "#companyFilterOptions": createFakeElement({ innerHTML: "" })
  };
  view.$ = (selector) => elements[selector];
  return { view, elements };
};

test("filter 'Onbekend bedrijf' toont ook medewerkers van een bedrijf dat niet meer bestaat", () => {
  const { model } = createModel();
  addEmployee(model, { id: "employee-2", companyId: "bestaat-niet" });
  addEmployee(model, { id: "employee-3", name: "Derde Medewerker", companyId: null });
  const { view, elements } = createFilterView(model);
  globalThis.document = { activeElement: null };
  elements["#employeeCompanyFilter"].dataset.value = "unknown";

  view.renderEmployees();

  const html = elements["#employeeList"].innerHTML;
  assert.ok(html.includes('data-open-employee="employee-2"'));
  assert.ok(html.includes('data-open-employee="employee-3"'));
  assert.equal(html.includes('data-open-employee="employee-1"'), false);
  assert.equal(html.match(/company-group/g).length, 1, "één groep Onbekend bedrijf");
});

test("het bedrijfsfilter overschrijft de tekst niet terwijl de gebruiker typt", () => {
  const { model } = createModel();
  const { view, elements } = createFilterView(model);
  const filter = elements["#employeeCompanyFilter"];
  filter.value = "Kl";

  globalThis.document = { activeElement: filter };
  view.populateCompanyFilter();
  assert.equal(filter.value, "Kl");

  globalThis.document = { activeElement: null };
  view.populateCompanyFilter();
  assert.equal(filter.value, "");
});

// ------------------------------------------------------------------
// View: veilige HTML en selectors
// ------------------------------------------------------------------

test("ids in HTML-attributen worden ge-escapet, zodat ze niet uit het attribuut kunnen breken", () => {
  const { model } = createModel();
  const evilId = 'x" onclick="alert(1)';
  model.state.products = [{ id: evilId, name: "Soep", price: 1 }];
  model.state.employees[0] = { ...model.state.employees[0], id: evilId };
  const view = new RegistrationView(model);
  const elements = {
    "#adminProductList": createFakeElement({ innerHTML: "" }),
    "#adminEmployeeSearch": createFakeElement({ value: "" }),
    "#adminCorrectionList": createFakeElement({ innerHTML: "" })
  };
  view.$ = (selector) => elements[selector];

  view.renderAdminProducts();
  view.renderCorrectionEmployees();

  for (const html of [elements["#adminProductList"].innerHTML, elements["#adminCorrectionList"].innerHTML]) {
    assert.equal(html.includes('onclick="alert'), false);
    assert.ok(html.includes("x&quot; onclick=&quot;alert(1)"));
  }
});

test("waarden in een selector worden veilig gemaakt, met of zonder CSS.escape", () => {
  assert.equal(cssAttributeValue('a"b\\c'), 'a\\"b\\\\c');

  globalThis.CSS = { escape: (value) => `veilig(${value})` };
  try {
    assert.equal(cssAttributeValue("blikje"), "veilig(blikje)");
  } finally {
    delete globalThis.CSS;
  }
});

test("het statuslabel van een product met een aanhalingsteken in de id wordt veilig gezocht", () => {
  const { model, point } = createModel();
  const view = new RegistrationView(model);
  const selectors = [];
  globalThis.document = { querySelector: (selector) => { selectors.push(selector); return null; } };

  view.updateStockStatus(point.id, 'a"b');

  assert.deepEqual(selectors, ['[data-stock-status="a\\"b"]']);
});

// ------------------------------------------------------------------
// Alle gegevens wissen (AVG)
// ------------------------------------------------------------------

test("'Alle gegevens wissen' doet niets als de beheerder een van de twee vragen annuleert", () => {
  for (const answers of [[false], [true, false]]) {
    const { app, model } = createApp();
    model.addRegistration("employee-1", "blikje");
    const given = [...answers];
    globalThis.window = { confirm: () => given.shift() };

    app.wipeAllData();

    assert.equal(model.registrations.length, 1, `antwoorden ${answers}`);
    assert.ok(model.findEmployee("employee-1"));
  }
});

test("'Alle gegevens wissen' wist na twee bevestigingen alles, logt uit en zet de demo terug", () => {
  const { app, model, view } = createApp();
  model.addRegistration("employee-1", "blikje");
  model.logAdminAction("Product gewijzigd", "Blikje");
  app.adminLoggedIn = true;
  let questions = 0;
  globalThis.window = { confirm: () => { questions += 1; return true; } };

  app.wipeAllData();

  assert.equal(questions, 2);
  assert.equal(model.registrations.length, 0);
  assert.equal(model.auditLog.length, 0);
  assert.equal(model.findEmployee("employee-1"), undefined);
  assert.ok(model.employees.length > 0, "de demomedewerkers staan er weer");
  assert.equal(app.adminLoggedIn, false);
  assert.equal(view.$("#adminModal").classList.contains("hidden"), true);
  assert.equal(view.toasts.at(-1).tone, "success");
});

test("index.html heeft in het logboek een knop 'Alle gegevens wissen' met uitleg", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="wipeDataButton"[^>]*>Alle gegevens wissen<\/button>/);
  assert.match(html, /reservekopieën op deze tablet en zet de demogegevens terug/);
});

// ------------------------------------------------------------------
// Knoppen van gegevens die in een ander tabblad zijn verwijderd
// ------------------------------------------------------------------

test("medewerker verwijderen die niet meer bestaat: geen logboekregel en een melding", () => {
  const { app, model, view } = createApp();
  globalThis.window = { confirm: () => true };

  app.removeEmployee("bestaat-niet");

  assert.equal(model.auditLog.length, 0);
  assert.deepEqual(toastTexts(view), ["Deze medewerker bestaat niet meer; er is niets opgeslagen."]);
});

test("product verwijderen dat niet meer bestaat: geen logboekregel en een melding", () => {
  const { app, model, view } = createApp();

  app.removeProduct("bestaat-niet");

  assert.equal(model.auditLog.length, 0);
  assert.equal(model.products.length, 8);
  assert.deepEqual(toastTexts(view), ["Dit product bestaat niet meer; er is niets opgeslagen."]);
});

test("levering voor een consumptiepunt dat niet meer bestaat: niets geboekt en een melding", () => {
  const { app, model, view } = createApp();
  view.$("#stockPointSelect").value = "verwijderd-punt";
  view.$('[data-delivery-amount="blikje"]').value = "5";

  app.bookDelivery("blikje");

  assert.equal(model.auditLog.length, 0);
  assert.deepEqual(toastTexts(view), ["Dit consumptiepunt of product bestaat niet meer; er is niets opgeslagen."]);
});

test("alles wissen terwijl opslaan mislukt geeft een eerlijke foutmelding", () => {
  const { app, view } = createApp({ storeOptions: { failSave: true } });
  globalThis.window = { confirm: () => true };
  app.adminLoggedIn = true;

  app.wipeAllData();

  const last = view.toasts.at(-1);
  assert.equal(last.tone, "error");
  assert.ok(last.message.includes("konden niet worden opgeslagen"));
});

test("zonder ingelogde beheerder kun je niet exporteren en niet alles wissen", () => {
  const exports = [];
  const { model } = createModel();
  const view = createRecordingView();
  const app = new RegistrationApp(model, view, { download: (...args) => { exports.push(args); return true; } });
  let asked = 0;
  globalThis.window = { confirm: () => { asked += 1; return true; } };
  model.addRegistration("employee-1", "blikje");

  app.exportCsv();
  app.wipeAllData();

  assert.equal(exports.length, 0);
  assert.equal(asked, 0);
  assert.equal(model.registrations.length, 1);
});

test("kan de opslag even niet worden gelezen, dan wist een melding van een ander tabblad hier niets", () => {
  const { app, model } = createApp();
  model.addRegistration("employee-1", "blikje");
  model.store = { key: "tvb-test", loadProblem: null, load() { this.loadProblem = "unavailable"; return null; }, save: () => true, clearAll() { throw new Error("mag niet worden aangeroepen"); } };

  app.handleStorageChange({ key: null });

  assert.equal(model.registrations.length, 1);
  assert.equal(model.employees.length, 1);
});
