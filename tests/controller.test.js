// Tests voor RegistrationApp (de controller): formulieren, verwijderen, voorraad, inloggen,
// toetsen en de demo gezichtsherkenning. De pagina wordt nagebootst met een nep-view
// (createRecordingView), zodat alles zonder browser kan draaien.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { createModel, createRecordingView, createFakeElement, asAdmin } from "./helpers.js";

// Controller met het testmodel (employee-1 op Hoofdkantoor van TVB), een nep-view en een
// ingelogde beheerder.
const createApp = ({ storeOptions, faceDemo } = {}) => {
  const { model, point } = createModel(storeOptions);
  const view = createRecordingView();
  const demo = faceDemo || new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  return { app: asAdmin(new RegistrationApp(model, view, undefined, demo)), model, view, point };
};

// Vult de velden van een formulier en zegt welke velden verplicht zijn en welke vinkjes aan staan.
const fillForm = (view, formSelector, values, requiredSelectors = [], checkedValues = []) => {
  for (const [selector, value] of Object.entries(values)) view.$(selector).value = value;
  const form = view.$(formSelector);
  form.querySelectorAll = (query) =>
    query === "[required]" ? requiredSelectors.map((selector) => view.$(selector)) : checkedValues.map((value) => ({ value }));
  return form;
};

// Een "submit"-event van een formulier, met de knop waarmee is opgeslagen.
const submitEvent = (saveMode = "close") => ({ preventDefault() {}, submitter: { dataset: { saveMode } } });

const toastTexts = (view) => view.toasts.map(({ message }) => message);
const companyByName = (model, name) => model.companies.find((company) => company.name === name);

// ------------------------------------------------------------------
// Producten
// ------------------------------------------------------------------

const fillProductForm = (view, name, price) =>
  fillForm(view, "#productForm", { "#productName": name, "#productPrice": price }, ["#productName", "#productPrice"]);

test("product toevoegen: nieuw product, logboekregel en melding", () => {
  const { app, model, view } = createApp();
  fillProductForm(view, "Soep", "1.25");

  app.saveProduct(submitEvent());

  const product = model.products.at(-1);
  assert.equal(product.name, "Soep");
  assert.equal(product.price, 1.25);
  assert.equal(model.auditLog.at(-1).action, "Product toegevoegd");
  assert.deepEqual(toastTexts(view), ["Product toegevoegd — zet het aan bij de consumptiepunten die het aanbieden"]);
});

test("product toevoegen: negatieve prijs of geen getal wordt geweigerd", () => {
  for (const price of ["-1", "1e3", "abc"]) {
    const { app, model, view } = createApp();
    fillProductForm(view, "Soep", price);

    app.saveProduct(submitEvent());

    assert.equal(model.products.length, 8, `prijs ${price}`);
    assert.equal(view.fieldErrors[0].message, "Vul een prijs van 0 tot en met 1000 euro in, met hooguit twee decimalen.");
    assert.equal(view.$("#productPrice").focused, true);
  }
});

test("product toevoegen: een bestaande naam wordt geweigerd, ook met andere hoofdletters", () => {
  const { app, model, view } = createApp();
  fillProductForm(view, "BLIKJE", "0.70");

  app.saveProduct(submitEvent());

  assert.equal(model.products.length, 8);
  assert.equal(view.fieldErrors[0].message, "Er bestaat al een product met deze naam.");
});

test("product toevoegen: een leeg veld krijgt een melding en de focus", () => {
  const { app, model, view } = createApp();
  fillProductForm(view, "", "0.50");

  app.saveProduct(submitEvent());

  assert.equal(model.products.length, 8);
  assert.equal(view.fieldErrors[0].field, view.$("#productName"));
  assert.equal(view.fieldErrors[0].message, "Vul dit veld in.");
  assert.equal(view.$("#productName").focused, true);
});

test("product wijzigen houdt de id en mag zijn eigen naam houden", () => {
  const { app, model, view } = createApp();
  const form = fillProductForm(view, "Blikje", "0.70");
  form.dataset.editingId = "blikje";

  app.saveProduct(submitEvent());

  assert.equal(model.findProduct("blikje").price, 0.7);
  assert.equal(model.products.length, 8);
  assert.equal(model.auditLog.at(-1).action, "Product gewijzigd");
});

test("'Opslaan + opnieuw' houdt het productformulier open, 'Opslaan' sluit het", () => {
  const { app, view } = createApp();

  fillProductForm(view, "Soep", "1");
  app.saveProduct(submitEvent("continue"));
  assert.equal(view.$("#productFormModal").classList.contains("hidden"), false);

  fillProductForm(view, "Thee", "0.30");
  app.saveProduct(submitEvent("close"));
  assert.equal(view.$("#productFormModal").classList.contains("hidden"), true);
});

test("een gebruikt product kan niet worden verwijderd", () => {
  const { app, model, view } = createApp();
  model.addRegistration("employee-1", "blikje");

  app.removeProduct("blikje");

  assert.ok(model.findProduct("blikje"));
  assert.deepEqual(toastTexts(view), ["Dit product wordt al gebruikt en kan niet worden verwijderd"]);
});

// ------------------------------------------------------------------
// Bedrijven en consumptiepunten
// ------------------------------------------------------------------

test("bedrijf toevoegen: nieuw bedrijf met werkgevernummer en logboekregel", () => {
  const { app, model, view } = createApp();
  fillForm(view, "#companyForm", { "#companyName": "Nieuw BV", "#companyEmployerNumber": "123" }, ["#companyName"]);

  app.saveCompany(submitEvent());

  assert.equal(companyByName(model, "Nieuw BV").employerNumber, "123");
  assert.equal(model.auditLog.at(-1).action, "Bedrijf toegevoegd");
});

test("bedrijf toevoegen: bestaande naam en werkgevernummer met letters worden geweigerd", () => {
  const { app, model, view } = createApp();

  fillForm(view, "#companyForm", { "#companyName": "tvb", "#companyEmployerNumber": "" }, ["#companyName"]);
  app.saveCompany(submitEvent());
  assert.equal(view.fieldErrors.at(-1).message, "Er bestaat al een bedrijf met deze naam.");

  fillForm(view, "#companyForm", { "#companyName": "Nieuw BV", "#companyEmployerNumber": "12a" }, ["#companyName"]);
  app.saveCompany(submitEvent());
  assert.equal(view.fieldErrors.at(-1).message, "Gebruik alleen cijfers.");

  assert.equal(model.companies.length, 13);
});

test("consumptiepunt: dezelfde naam mag niet bij hetzelfde bedrijf, wel bij een ander bedrijf", () => {
  const { app, model, view, point } = createApp();
  const klik = companyByName(model, "Klik");

  fillForm(view, "#pointForm", { "#pointName": "hoofdkantoor", "#pointCompany": point.companyId }, ["#pointName", "#pointCompany"]);
  app.savePoint(submitEvent());
  assert.equal(view.fieldErrors.at(-1).message, "Dit bedrijf heeft al een consumptiepunt met deze naam.");
  assert.equal(model.points.length, 1);

  fillForm(view, "#pointForm", { "#pointName": "Hoofdkantoor", "#pointCompany": klik.id }, ["#pointName", "#pointCompany"], ["blikje"]);
  app.savePoint(submitEvent());
  assert.equal(model.points.length, 2);
  assert.deepEqual(model.offeredProducts(model.points[1].id).map(({ id }) => id), ["blikje"]);
});

test("consumptiepunt naar een ander bedrijf: de medewerkers verhuizen mee", () => {
  const { app, model, view, point } = createApp();
  const klik = companyByName(model, "Klik");
  const form = fillForm(view, "#pointForm", { "#pointName": "Hoofdkantoor", "#pointCompany": klik.id }, ["#pointName", "#pointCompany"], ["blikje"]);
  form.dataset.editingId = point.id;

  app.savePoint(submitEvent());

  assert.equal(model.findPoint(point.id).companyId, klik.id);
  assert.equal(model.findEmployee("employee-1").companyId, klik.id);
  assert.equal(model.auditLog.at(-1).action, "Consumptiepunt gewijzigd");
});

test("bedrijf met medewerkers kan niet worden verwijderd", () => {
  const { app, model, view, point } = createApp();

  app.removeCompany(point.companyId);

  assert.ok(model.findCompany(point.companyId));
  assert.deepEqual(toastTexts(view), ["Verwijder of verplaats eerst de medewerkers en consumptiepunten van dit bedrijf"]);
});

test("leeg bedrijf wordt na bevestiging verwijderd en komt in het logboek", () => {
  const { app, model } = createApp();
  const mvie = companyByName(model, "MVIE");
  globalThis.window = { confirm: () => true };

  app.removeCompany(mvie.id);

  assert.equal(model.findCompany(mvie.id), undefined);
  assert.equal(model.auditLog.at(-1).action, "Bedrijf verwijderd");
  assert.equal(model.auditLog.at(-1).details, "MVIE");
});

test("consumptiepunt met medewerkers kan niet worden verwijderd", () => {
  const { app, model, view, point } = createApp();

  app.removePoint(point.id);

  assert.ok(model.findPoint(point.id));
  assert.deepEqual(toastTexts(view), ["Koppel eerst de medewerkers van dit consumptiepunt aan een ander punt"]);
});

// ------------------------------------------------------------------
// Medewerkers
// ------------------------------------------------------------------

const fillEmployeeForm = (view, values) =>
  fillForm(view, "#employeeForm", {
    "#newEmployeeFirstName": "Jan",
    "#newEmployeeLastName": "de Vries",
    "#newEmployeePayrollCode": "12",
    "#newEmployeePersonnelNumber": "345",
    "#newEmployeeEmployerNumber": "",
    "#newEmployeeCompany": "",
    "#newEmployeePoint": "",
    ...values
  }, ["#newEmployeeFirstName", "#newEmployeeLastName", "#newEmployeePayrollCode", "#newEmployeePersonnelNumber", "#newEmployeeCompany"]);

test("medewerker toevoegen met bedrijf en consumptiepunt", () => {
  const { app, model, view, point } = createApp();
  fillEmployeeForm(view, { "#newEmployeeCompany": point.companyId, "#newEmployeePoint": point.id });

  app.saveEmployee(submitEvent());

  const employee = model.employees.at(-1);
  assert.equal(employee.name, "Jan de Vries");
  assert.equal(employee.pointId, point.id);
  assert.equal(employee.payrollCode, "12");
  assert.equal(model.auditLog.at(-1).action, "Medewerker toegevoegd");
  assert.deepEqual(toastTexts(view), ["Medewerker toegevoegd"]);
});

test("medewerker toevoegen: looncode of personeelsnummer met andere tekens dan cijfers wordt geweigerd", () => {
  const { app, model, view, point } = createApp();
  fillEmployeeForm(view, { "#newEmployeeCompany": point.companyId, "#newEmployeePayrollCode": "-5", "#newEmployeePersonnelNumber": "12a" });

  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, 1);
  assert.deepEqual(view.fieldErrors.map(({ message }) => message), ["Gebruik alleen cijfers.", "Gebruik alleen cijfers."]);
  assert.equal(view.$("#newEmployeePayrollCode").focused, true);
});

test("medewerker toevoegen zonder bedrijf geeft 'Maak een keuze.' bij de keuzelijst", () => {
  const { app, model, view } = createApp();
  fillEmployeeForm(view, {});
  view.$("#newEmployeeCompany").tagName = "SELECT";

  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, 1);
  assert.deepEqual(view.fieldErrors.map(({ message }) => message), ["Maak een keuze."]);
});

test("mislukt opslaan bij een medewerker geeft geen logboekregel", () => {
  const { app, model, view, point } = createApp({ storeOptions: { failSave: true } });
  fillEmployeeForm(view, { "#newEmployeeCompany": point.companyId });

  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, 1);
  assert.equal(model.auditLog.length, 0);
  assert.deepEqual(toastTexts(view), ["Opslaan mislukt. Probeer het opnieuw."]);
});

test("medewerker deactiveren zet de status om en komt in het logboek", () => {
  const { app, model } = createApp();

  app.toggleEmployee("employee-1");

  assert.equal(model.findEmployee("employee-1").active, false);
  assert.equal(model.auditLog.at(-1).details, "Test Medewerker is inactief gezet");
});

test("medewerker verwijderen: bij 'Annuleren' gebeurt er niets", () => {
  const { app, model } = createApp();
  globalThis.window = { confirm: () => false };

  app.removeEmployee("employee-1");

  assert.ok(model.findEmployee("employee-1"));
  assert.equal(model.auditLog.length, 0);
});

// ------------------------------------------------------------------
// Correcties
// ------------------------------------------------------------------

test("correctie '−' zonder registratie geeft een melding", () => {
  const { app, view } = createApp();

  app.removeCorrection("employee-1", "blikje");

  assert.deepEqual(toastTexts(view), ["Dit product heeft geen registratie voor deze medewerker"]);
});

test("correctie '−' verwijdert de laatste registratie, zet de voorraad terug en logt het", () => {
  const { app, model, view, point } = createApp();
  model.addRegistration("employee-1", "blikje");

  app.removeCorrection("employee-1", "blikje");

  assert.equal(model.registrations.length, 0);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
  assert.equal(model.auditLog.at(-1).details, "Blikje van Test Medewerker");
  assert.deepEqual(toastTexts(view), ["Blikje registratie verwijderd"]);
});

// ------------------------------------------------------------------
// Voorraad
// ------------------------------------------------------------------

test("levering: 0, negatief, een kommagetal of leeg wordt geweigerd", () => {
  for (const amount of ["0", "-2", "1.5", ""]) {
    const { app, model, view, point } = createApp();
    view.$("#stockPointSelect").value = point.id;
    view.$('[data-delivery-amount="blikje"]').value = amount;

    app.bookDelivery("blikje");

    assert.equal(model.findPoint(point.id).products.blikje.stock, 24, `aantal "${amount}"`);
    assert.deepEqual(toastTexts(view), ["Vul een geleverd aantal van minimaal 1 in"]);
  }
});

test("levering van 5 komt bij de voorraad en in het logboek", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;
  view.$('[data-delivery-amount="blikje"]').value = "5";

  app.bookDelivery("blikje");

  assert.equal(model.findPoint(point.id).products.blikje.stock, 29);
  assert.equal(model.auditLog.at(-1).details, "5 × Blikje op TVB · Hoofdkantoor");
});

// Nep-invoerveld uit de voorraadtabel.
const stockInput = (productId, field, value) =>
  createFakeElement({ value, dataset: { productId, stockField: field } });

test("voorraad tellen: leeg of een kommagetal wordt geweigerd en het veld springt terug", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;

  for (const value of ["", "2.5"]) {
    const input = stockInput("blikje", "stock", value);
    app.saveStockField(input);
    assert.equal(input.value, 24);
  }
  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
  assert.deepEqual(toastTexts(view), ["Vul een geheel aantal in", "Vul een geheel aantal in"]);
});

// Een getelde voorraad kan niet negatief zijn. Door registraties kan de voorraad wel onder 0
// komen (dat is bewust), maar bij het tellen vul je in wat er echt staat.
test("minimum en getelde voorraad: een negatief getal wordt geweigerd, 0 mag wel", () => {
  const { app, model, view, point } = createApp();
  view.$("#stockPointSelect").value = point.id;

  app.saveStockField(stockInput("blikje", "minimum", "-1"));
  app.saveStockField(stockInput("blikje", "stock", "-3"));
  const afterRefused = model.findPoint(point.id).products.blikje;
  assert.equal(afterRefused.minimum, 6);
  assert.equal(afterRefused.stock, 24);
  assert.deepEqual(toastTexts(view), ["Vul een geheel aantal van 0 of hoger in", "Vul een geheel aantal van 0 of hoger in"]);

  app.saveStockField(stockInput("blikje", "stock", "0"));
  assert.equal(model.findPoint(point.id).products.blikje.stock, 0);
  assert.equal(model.auditLog.at(-1).details, "Blikje op TVB · Hoofdkantoor: 0");
});

test("voorraad tellen: mislukt opslaan zet het veld terug op de opgeslagen waarde", () => {
  const { app, model, view, point } = createApp({ storeOptions: { failSave: true } });
  view.$("#stockPointSelect").value = point.id;
  const input = stockInput("blikje", "stock", "10");

  app.saveStockField(input);

  assert.equal(input.value, 24);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
});

// ------------------------------------------------------------------
// Inloggen en het beheerscherm
// ------------------------------------------------------------------

test("inloggen zonder wachtwoord toont de foutmelding en logt niet in", () => {
  const { app, view } = createApp();
  app.adminLoggedIn = false; // deze test begint zonder ingelogde beheerder
  view.$("#loginError").classList.add("hidden");
  view.$("#loginEmail").value = "admin@tvb.nl";
  view.$("#loginPassword").value = "";

  app.login({ preventDefault() {} });

  assert.equal(app.adminLoggedIn, false);
  assert.equal(view.$("#loginError").classList.contains("hidden"), false);
});

test("inloggen met e-mailadres en wachtwoord, en uitloggen wist het wachtwoord", () => {
  const { app, view } = createApp();
  view.$("#loginEmail").value = "admin@tvb.nl";
  view.$("#loginPassword").value = "geheim";

  app.login({ preventDefault() {} });
  assert.equal(app.adminLoggedIn, true);
  assert.equal(view.$("#adminView").classList.contains("hidden"), false);

  app.logout();
  assert.equal(app.adminLoggedIn, false);
  assert.equal(view.$("#loginPassword").value, "");
  assert.equal(view.$("#adminView").classList.contains("hidden"), true);
});

test("'Meer laden' toont steeds 20 regels extra in het logboek", () => {
  const { app, view } = createApp();

  app.loadMoreAudit();
  app.loadMoreAudit();

  assert.equal(app.auditLogLimit, 60);
  assert.deepEqual(view.calls.filter(([name]) => name === "renderAuditLog"), [["renderAuditLog", 40], ["renderAuditLog", 60]]);
});

test("zoekopdracht wissen maakt het zoekveld en het bedrijfsfilter leeg", () => {
  const { app, view } = createApp();
  view.$("#employeeSearch").value = "Willem";
  view.$("#employeeCompanyFilter").dataset.value = "bedrijf-1";

  app.clearSearch();

  assert.equal(view.$("#employeeSearch").value, "");
  assert.equal(view.$("#employeeCompanyFilter").dataset.value, undefined);
  assert.equal(view.$("#employeeSearch").focused, true);
});

test("bedrijfsfilter: typen verbergt de bedrijven die niet passen", () => {
  const { app, view } = createApp();
  const options = ["Alle bedrijven", "Klik", "TVB"].map((textContent) => createFakeElement({ textContent }));
  view.$("#companyFilterOptions").querySelectorAll = () => options;

  app.filterCompanyOptions("#companyFilterOptions", "kl");

  assert.deepEqual(options.map((option) => option.classList.contains("hidden")), [true, false, true]);
});

test("samenvatting van de keuze slaat producten met 0 over", () => {
  const { app } = createApp();
  app.selectedProducts = { blikje: 2, ei: 0, boter: 1 };

  assert.equal(app.selectionSummary(), "2× Blikje, 1× Boter");
});

// ------------------------------------------------------------------
// Toetsenbord: Escape, Tab en Ctrl + K
// ------------------------------------------------------------------

// Nep-document dat de keydown-listener bewaart en zegt welke vensters open zijn.
const createKeyboardApp = () => {
  const setup = createApp();
  const listeners = {};
  const openModals = [];
  globalThis.document = {
    activeElement: null,
    addEventListener: (type, listener) => { listeners[type] = listener; },
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? openModals : [])
  };
  setup.app.registerKeyboardEvents();
  const press = (key, extra = {}) => {
    const event = { key, prevented: false, preventDefault() { event.prevented = true; }, ...extra };
    listeners.keydown(event);
    return event;
  };
  return { ...setup, openModals, press };
};

test("Escape sluit het bovenste open venster", () => {
  const { app, view, openModals, press } = createKeyboardApp();
  const closed = [];
  app.registerModalClose("#employeeProductsModal", "[data-close-employee-products]", () => closed.push("product"));
  app.registerModalClose("#faceModal", "[data-close-face-modal]", () => closed.push("camera"));
  openModals.push(view.$("#employeeProductsModal"), view.$("#faceModal"));

  const event = press("Escape");

  assert.deepEqual(closed, ["camera"]);
  assert.equal(event.prevented, true);
});

test("Escape zonder open venster doet niets", () => {
  const { press } = createKeyboardApp();

  assert.equal(press("Escape").prevented, false);
});

test("Tab blijft binnen het open venster: na het laatste element komt het eerste", () => {
  const { view, openModals, press } = createKeyboardApp();
  const first = createFakeElement();
  const last = createFakeElement();
  const modal = view.$("#adminModal");
  modal.querySelectorAll = () => [first, last];
  modal.contains = (element) => element === first || element === last;
  openModals.push(modal);

  document.activeElement = last;
  assert.equal(press("Tab").prevented, true);
  assert.equal(first.focused, true);

  document.activeElement = first;
  press("Tab", { shiftKey: true });
  assert.equal(last.focused, true);
});

test("Ctrl + K gaat naar de zoekbalk, maar niet als er een venster open is", () => {
  const { view, openModals, press } = createKeyboardApp();

  openModals.push(view.$("#adminModal"));
  press("k", { ctrlKey: true });
  assert.equal(view.$("#employeeSearch").focused, false);

  openModals.length = 0;
  assert.equal(press("k", { ctrlKey: true }).prevented, true);
  assert.equal(view.$("#employeeSearch").focused, true);
});

// ------------------------------------------------------------------
// Demo gezichtsherkenning
// ------------------------------------------------------------------

test("'Herken mij' zonder ingestelde gezichten geeft een melding en opent de camera niet", () => {
  const { app, view } = createApp();
  view.$("#faceModal").classList.add("hidden");

  app.startFaceRecognition();

  assert.equal(view.$("#faceModal").classList.contains("hidden"), true);
  assert.deepEqual(toastTexts(view), ["Er is nog niemand ingesteld voor gezichtsherkenning. Kies je naam en zet het aan in het productvenster."]);
});

test("'Uitzetten' vergeet het gezicht van de medewerker", () => {
  const { app, view } = createApp();
  app.openEmployeeProducts("employee-1");
  app.faceDemo.enroll("employee-1", [0.1, 0.2]);

  app.forgetFace();

  assert.equal(app.faceDemo.isEnrolled("employee-1"), false);
  assert.deepEqual(toastTexts(view), ["Gezichtsherkenning staat uit voor deze medewerker."]);
});

test("venster gesloten terwijl de camera start: de camera wordt niet getoond", async () => {
  let finishStarting;
  let cameraShown = null;
  const fakeDemo = {
    settings: { scanTimeoutMs: 1000 },
    load: async () => {},
    stopCamera() {},
    // Bootst een trage camera na: pas na finishStarting() vraagt hij of het venster nog open is.
    startCamera: (video, isCurrent) => new Promise((resolve) => {
      finishStarting = () => { cameraShown = isCurrent(); resolve(cameraShown); };
    })
  };
  const { app, view } = createApp({ faceDemo: fakeDemo });

  const opening = app.openFaceModal("enroll", "employee-1");
  await new Promise((resolve) => setTimeout(resolve, 0)); // laden is klaar, camera start
  app.closeFaceModal();
  finishStarting();
  await opening;

  assert.equal(cameraShown, false);
  assert.notEqual(view.$("#faceStatus").textContent, "Camera staat aan.");
});
