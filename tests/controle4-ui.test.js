// Regressietests voor de vierde codecontrole (controller en view). De letters verwijzen naar
// de punten uit die controle. De pagina wordt nagebootst met een nep-view en nep-elementen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { createModel, createRecordingView, createFakeElement, addEmployee, asAdmin } from "./helpers.js";

// Controller met het testmodel (employee-1 op Hoofdkantoor van TVB), een nep-view en een
// ingelogde beheerder.
const createApp = ({ faceDemo } = {}) => {
  const { model, point } = createModel();
  const view = createRecordingView();
  const demo = faceDemo || new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  return { app: asAdmin(new RegistrationApp(model, view, undefined, demo)), model, view, point };
};

const toastTexts = (view) => view.toasts.map(({ message }) => message);
const calledNames = (view) => view.calls.map(([name]) => name);

// Vult het medewerkersformulier; de verplichte velden worden door querySelectorAll teruggegeven.
const fillEmployeeForm = (view, values = {}) => {
  const fields = {
    "#newEmployeeFirstName": "Jan",
    "#newEmployeeLastName": "de Vries",
    "#newEmployeePayrollCode": "12",
    "#newEmployeePersonnelNumber": "345",
    "#newEmployeeEmployerNumber": "",
    "#newEmployeeCompany": "",
    "#newEmployeePoint": "",
    ...values
  };
  for (const [selector, value] of Object.entries(fields)) view.$(selector).value = value;
  const form = view.$("#employeeForm");
  form.querySelectorAll = () => ["#newEmployeeFirstName", "#newEmployeePersonnelNumber"].map((selector) => view.$(selector));
  return form;
};
const submitEvent = () => ({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

// ------------------------------------------------------------------
// C. Correctielijst en registratietabel na wijzigen van een medewerker
// ------------------------------------------------------------------

test("C: na toevoegen, (de)activeren en verwijderen van een medewerker worden correctielijst en registratietabel opnieuw getekend", () => {
  const { app, view } = createApp();
  globalThis.window = { confirm: () => true };

  fillEmployeeForm(view);
  app.saveEmployee(submitEvent());
  assert.ok(calledNames(view).includes("renderCorrectionEmployees"), "saveEmployee");
  assert.ok(calledNames(view).includes("renderAdmin"), "saveEmployee");

  view.calls.length = 0;
  app.toggleEmployee("employee-1");
  assert.ok(calledNames(view).includes("renderCorrectionEmployees"), "toggleEmployee");
  assert.ok(calledNames(view).includes("renderAdmin"), "toggleEmployee");

  view.calls.length = 0;
  app.removeEmployee("employee-1");
  assert.ok(calledNames(view).includes("renderCorrectionEmployees"), "removeEmployee");
  assert.ok(calledNames(view).includes("renderAdmin"), "removeEmployee");
});

test("C: correctie '+' voor een medewerker die niet meer bestaat, slaat niets op", () => {
  const { app, model, view } = createApp();

  const result = app.addCorrection("verdwenen", "blikje");

  assert.equal(result, false);
  assert.equal(model.registrations.length, 0);
  assert.equal(model.auditLog.length, 0);
  assert.equal(view.toasts[0].tone, "error");
});

// ------------------------------------------------------------------
// D. Voorraad na een correctie
// ------------------------------------------------------------------

test("D: na een correctie '+' of '−' wordt het tabblad Voorraad opnieuw getekend", () => {
  const { app, view } = createApp();

  app.addCorrection("employee-1", "blikje");
  assert.ok(calledNames(view).includes("renderStock"), "addCorrection");

  view.calls.length = 0;
  app.removeCorrection("employee-1", "blikje");
  assert.ok(calledNames(view).includes("renderStock"), "removeCorrection");
});

// ------------------------------------------------------------------
// G. Bedrijfsfilter na typen en kiezen
// ------------------------------------------------------------------

test("G: na het kiezen van een bedrijf zijn alle bedrijven in de keuzelijst weer zichtbaar", () => {
  const { app, view } = createApp();
  const options = ["Alle bedrijven", "Klik", "TVB"].map((textContent) => createFakeElement({ textContent }));
  view.$("#companyFilterOptions").querySelectorAll = () => options;

  app.filterCompanyOptions("#companyFilterOptions", "kl");
  app.selectCompanyFilterOption(createFakeElement({ dataset: { companyValue: "klik" }, textContent: "Klik" }));

  assert.deepEqual(options.map((option) => option.classList.contains("hidden")), [false, false, false]);
});

// ------------------------------------------------------------------
// H. Sluiten via de donkere achtergrond
// ------------------------------------------------------------------

test("H: muis indrukken in een invoerveld en loslaten op de achtergrond sluit het venster niet", () => {
  const { app, view } = createApp();
  globalThis.document = { querySelectorAll: () => [] };
  let closed = 0;
  app.registerModalClose("#employeeFormModal", "[data-close-employee-modal]", () => { closed += 1; });
  const modal = view.$("#employeeFormModal");
  const input = createFakeElement();

  modal.listeners.mousedown({ target: input });
  modal.listeners.click({ target: modal });
  assert.equal(closed, 0);

  modal.listeners.mousedown({ target: modal });
  modal.listeners.click({ target: modal });
  assert.equal(closed, 1);
});

// ------------------------------------------------------------------
// I. Focus in de correctielijst
// ------------------------------------------------------------------

test("I: na '+' of '−' in de correctielijst krijgt dezelfde knop de focus terug", () => {
  const { app, model, view } = createApp();
  const plusSelector = '[data-correction-plus="employee-1"][data-correction-product="blikje"]';
  const minusSelector = '[data-correction-minus="employee-1"][data-correction-product="blikje"]';

  globalThis.document = { activeElement: createFakeElement({ dataset: { correctionPlus: "employee-1", correctionProduct: "blikje" } }) };
  app.addCorrection("employee-1", "blikje");
  assert.equal(view.$(plusSelector).focused, true);

  globalThis.document = { activeElement: createFakeElement({ dataset: { correctionMinus: "employee-1", correctionProduct: "blikje" } }) };
  app.removeCorrection("employee-1", "blikje");
  assert.equal(view.$(minusSelector).focused, true);
  assert.equal(model.registrations.length, 0);
});

// ------------------------------------------------------------------
// J. Gezicht vastleggen alleen met toestemming en een werkende camera
// ------------------------------------------------------------------

// Nep-demo waarbij de test zelf bepaalt wanneer laden en de camera klaar zijn.
const createControlledDemo = ({ cameraFails = false } = {}) => {
  const demo = {
    enrolled: [],
    settings: { scanTimeoutMs: 1000 },
    load: () => new Promise((resolve) => { demo.finishLoading = resolve; }),
    startCamera: () => (cameraFails ? Promise.reject(new Error("geen camera")) : Promise.resolve(true)),
    stopCamera() {},
    readFace: async () => [0.1, 0.2],
    enroll: (id, descriptor) => demo.enrolled.push(id),
    isAvailable: () => true,
    isEnrolled: () => false
  };
  return demo;
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("J: het vinkje zet 'Gezicht vastleggen' pas aan als de camera echt aan staat", async () => {
  const demo = createControlledDemo();
  const { app, view } = createApp({ faceDemo: demo });
  const button = view.$("#faceEnrollButton");

  const opening = app.openFaceModal("enroll", "employee-1");
  view.$("#faceConsent").checked = true;
  app.updateEnrollButton(); // dit doet de change-listener van het vinkje
  assert.equal(button.disabled, true, "model laadt nog");

  demo.finishLoading();
  await opening;
  assert.equal(app.cameraReady, true);
  assert.equal(button.disabled, false);

  view.$("#faceConsent").checked = false;
  app.updateEnrollButton();
  assert.equal(button.disabled, true, "vinkje weer uit");
});

test("J: werkt de camera niet, dan blijft 'Gezicht vastleggen' uit, ook met het vinkje", async () => {
  const demo = createControlledDemo({ cameraFails: true });
  const { app, view } = createApp({ faceDemo: demo });

  const opening = app.openFaceModal("enroll", "employee-1");
  demo.finishLoading();
  await opening;
  view.$("#faceConsent").checked = true;
  app.updateEnrollButton();

  assert.equal(app.cameraReady, false);
  assert.equal(view.$("#faceEnrollButton").disabled, true);
});

test("J: wordt het vinkje weggehaald tijdens het vastleggen, dan wordt het gezicht niet onthouden", async () => {
  const demo = createControlledDemo();
  const { app, view } = createApp({ faceDemo: demo });
  const opening = app.openFaceModal("enroll", "employee-1");
  demo.finishLoading();
  await opening;
  view.$("#faceConsent").checked = true;
  // Het vinkje gaat uit terwijl het gezicht wordt gelezen.
  demo.readFace = async () => { view.$("#faceConsent").checked = false; return [0.1, 0.2]; };

  await app.captureEnrollment();

  assert.deepEqual(demo.enrolled, []);
  assert.equal(view.$("#faceStatus").dataset.tone, "error");
  assert.equal(view.$("#faceModal").classList.contains("hidden"), false);
});

test("J: tijdens het vastleggen blijft de knop uit en start een tweede klik niets", async () => {
  const demo = createControlledDemo();
  const { app, view } = createApp({ faceDemo: demo });
  const opening = app.openFaceModal("enroll", "employee-1");
  demo.finishLoading();
  await opening;
  view.$("#faceConsent").checked = true;
  let finishReading;
  let reads = 0;
  demo.readFace = () => { reads += 1; return new Promise((resolve) => { finishReading = () => resolve([0.1, 0.2]); }); };

  const capturing = app.captureEnrollment();
  app.updateEnrollButton(); // het vinkje opnieuw aanzetten tijdens het vastleggen
  assert.equal(view.$("#faceEnrollButton").disabled, true);
  await app.captureEnrollment(); // tweede klik
  assert.equal(reads, 1);

  finishReading();
  await capturing;
  assert.deepEqual(demo.enrolled, ["employee-1"]);
  assert.equal(app.capturing, false);
});

test("J: na sluiten van het cameravenster staat de camera niet meer klaar", async () => {
  const demo = createControlledDemo();
  const { app } = createApp({ faceDemo: demo });
  const opening = app.openFaceModal("enroll", "employee-1");
  demo.finishLoading();
  await opening;

  app.closeFaceModal();

  assert.equal(app.cameraReady, false);
  await tick();
});

// ------------------------------------------------------------------
// K. Oude loginfout
// ------------------------------------------------------------------

test("K: na een mislukte login en opnieuw openen is de foutmelding weg", () => {
  const { app, view } = createApp();
  view.$("#loginEmail").value = "admin@tvb.nl";
  view.$("#loginPassword").value = "";
  app.login({ preventDefault() {} });
  assert.equal(view.$("#loginError").classList.contains("hidden"), false);

  app.closeAdmin();
  app.openAdmin();

  assert.equal(view.$("#loginError").classList.contains("hidden"), true);
});

// ------------------------------------------------------------------
// L. aria-describedby blijft behouden
// ------------------------------------------------------------------

// Nep-document met getElementById en createElement, genoeg voor showFieldError.
const createFieldDocument = () => {
  const byId = new Map();
  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    createElement: () => {
      const element = createFakeElement({ innerHTML: "", querySelector: () => ({ textContent: "" }) });
      element.remove = () => byId.delete(element.id);
      return element;
    }
  };
  return byId;
};

test("L: een foutmelding vult aria-describedby aan en daarna komt de oude waarde terug", () => {
  const byId = createFieldDocument();
  const view = new RegistrationView(null);
  const field = createFakeElement({
    id: "newEmployeeEmployerNumber",
    closest: () => null,
    after: (error) => byId.set(error.id, error),
    removeAttribute(name) { delete field.attributes[name]; }
  });
  field.setAttribute("aria-describedby", "employerNumberHint");

  view.showFieldError(field, "Gebruik alleen cijfers.");
  assert.equal(field.getAttribute("aria-describedby"), "employerNumberHint newEmployeeEmployerNumber-error");

  view.showFieldError(field, "Gebruik alleen cijfers.");
  assert.equal(field.getAttribute("aria-describedby"), "employerNumberHint newEmployeeEmployerNumber-error");

  view.clearFieldError(field);
  assert.equal(field.getAttribute("aria-describedby"), "employerNumberHint");
  assert.equal(field.getAttribute("aria-invalid"), null);
});

test("L: een veld zonder aria-describedby heeft die na het wissen van de fout ook weer niet", () => {
  const byId = createFieldDocument();
  const view = new RegistrationView(null);
  const field = createFakeElement({
    id: "newEmployeeFirstName",
    closest: () => null,
    after: (error) => byId.set(error.id, error),
    removeAttribute(name) { delete field.attributes[name]; }
  });

  view.showFieldError(field, "Vul dit veld in.");
  assert.equal(field.getAttribute("aria-describedby"), "newEmployeeFirstName-error");

  view.clearFieldError(field);
  assert.equal(field.getAttribute("aria-describedby"), null);
});

// ------------------------------------------------------------------
// N. Keuze met producten die niet meer worden aangeboden
// ------------------------------------------------------------------

test("N: producten die niet meer worden aangeboden, tellen niet mee en worden niet geregistreerd", () => {
  const { app, model, view, point } = createApp();
  app.openEmployeeProducts("employee-1");
  app.selectedProducts = { blikje: 1, ei: 2, verwijderd: 1 };
  // Een ander tabblad haalt "ei" uit het aanbod.
  model.savePoint({ id: point.id, name: point.name, companyId: point.companyId, offeredProductIds: ["blikje"] });

  app.renderProductWindow();
  const lastRender = view.calls.filter(([name]) => name === "renderEmployeeProducts").at(-1);
  assert.deepEqual(lastRender[2], { blikje: 1 });

  app.selectedProducts.ei = 3;
  app.registerSelectedProducts();
  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["blikje"]);
});

// ------------------------------------------------------------------
// O. Waarschuwing na opnieuw laden uit een ander tabblad
// ------------------------------------------------------------------

test("O: waren de gegevens uit een ander tabblad beschadigd, dan komt er een waarschuwing", () => {
  const { app, model, view } = createApp();
  const state = model.snapshot();
  model.store = { key: "tvb-test", loadProblem: "skipped", load: () => state, save: () => true };

  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(view.toasts.at(-1).tone, "error");
  assert.match(view.toasts.at(-1).message, /beschadigd/);
});

// ------------------------------------------------------------------
// P. Medewerker met registraties niet verwijderen
// ------------------------------------------------------------------

test("P: een medewerker met registraties wordt niet verwijderd en er wordt niet om bevestiging gevraagd", () => {
  const { app, model, view } = createApp();
  model.addRegistration("employee-1", "blikje");
  model.setEmployeeActive("employee-1", false);
  let asked = false;
  globalThis.window = { confirm: () => { asked = true; return true; } };

  app.removeEmployee("employee-1");

  assert.equal(asked, false);
  assert.ok(model.findEmployee("employee-1"));
  assert.deepEqual(toastTexts(view), [
    "Deze medewerker heeft registraties en kan niet definitief worden verwijderd. Deactiveren is voldoende."
  ]);
});

test("P: 'Verwijderen' staat alleen bij inactieve medewerkers zonder registraties", () => {
  const { model } = createModel();
  model.setEmployeeActive("employee-1", false);
  model.addRegistration("employee-1", "blikje");
  addEmployee(model, { active: false });
  addEmployee(model, { id: "employee-3", name: "Actief Iemand", active: true });
  const view = new RegistrationView(model);
  const elements = {
    "#employeeManagementSearch": createFakeElement(),
    "#adminEmployeeList": createFakeElement({ innerHTML: "" })
  };
  view.$ = (selector) => elements[selector];

  view.renderAdminEmployees();

  const html = elements["#adminEmployeeList"].innerHTML;
  assert.equal(html.includes('data-remove-employee="employee-1"'), false);
  assert.equal(html.includes('data-remove-employee="employee-2"'), true);
  assert.equal(html.includes('data-remove-employee="employee-3"'), false);
});

// ------------------------------------------------------------------
// Q. Sluiten van het admin-venster logt uit
// ------------------------------------------------------------------

test("Q: sluiten van het admin-venster (ook met Escape of de achtergrond) logt de beheerder uit", () => {
  const { app, view } = createApp();
  globalThis.document = { querySelectorAll: () => [] };
  app.registerAdminEvents();
  view.$("#loginEmail").value = "admin@tvb.nl";
  view.$("#loginPassword").value = "geheim";
  app.openAdmin();
  app.login({ preventDefault() {} });
  assert.equal(app.adminLoggedIn, true);

  // Dezelfde sluitactie hoort bij de sluitknop, de achtergrond en de Escape-toets.
  app.modalCloseActions.get(view.$("#adminModal"))();

  assert.equal(app.adminLoggedIn, false);
  assert.equal(view.$("#loginPassword").value, "");
  assert.equal(view.$("#adminModal").classList.contains("hidden"), true);

  app.openAdmin();
  assert.equal(view.$("#loginView").classList.contains("hidden"), false);
  assert.equal(view.$("#adminView").classList.contains("hidden"), true);
});

test("Q: het commentaar in index.html beschrijft dat sluiten uitlogt", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.equal(html.includes("de admin blijft ingelogd"), false);
  assert.match(html, /logt de admin uit/);
});

// ------------------------------------------------------------------
// R. Dubbel personeelsnummer
// ------------------------------------------------------------------

test("R: een personeelsnummer dat een ander al heeft, wordt geweigerd", () => {
  const { app, model, view } = createApp();
  addEmployee(model, { personnelNumber: "345" });

  fillEmployeeForm(view, { "#newEmployeePersonnelNumber": "345" });
  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, 2);
  assert.equal(view.fieldErrors.at(-1).field, view.$("#newEmployeePersonnelNumber"));
  assert.equal(view.fieldErrors.at(-1).message, "Er is al een medewerker met dit personeelsnummer.");
  assert.equal(view.$("#newEmployeePersonnelNumber").focused, true);
});

test("R: bij wijzigen mag de medewerker zijn eigen nummer houden, en dubbele namen mogen", () => {
  const { app, model, view } = createApp();
  addEmployee(model, { personnelNumber: "345" });

  const form = fillEmployeeForm(view, { "#newEmployeePersonnelNumber": "345", "#newEmployeeFirstName": "Test", "#newEmployeeLastName": "Medewerker" });
  form.dataset.editingId = "employee-2";
  app.saveEmployee(submitEvent());

  assert.equal(view.fieldErrors.length, 0);
  assert.equal(model.findEmployee("employee-2").name, "Test Medewerker");
  assert.equal(model.employees.filter(({ name }) => name === "Test Medewerker").length, 2);
});
