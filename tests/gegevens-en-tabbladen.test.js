// Tests voor het bewaren van gegevens en het samenwerken met andere tabbladen:
// prijsgrens van 1000 euro, voorraad van een verdwenen punt, focus na "Registreren",
// persist bij "niets gewijzigd", verouderde keuzes en formulieren, en een gewiste opslag.
// Waar de controller elementen opzoekt, wordt de strenge nep-view (createStrictView) gebruikt:
// een verkeerde selector geeft dan null en de test faalt.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationModel, MAX_PRICE } from "../assets/js/RegistrationModel.js";
import { DataStore } from "../assets/js/DataStore.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import {
  createModel,
  createStrictView,
  createFakeElement,
  createDataStore,
  fakeLocalStorageWithKeys,
  addEmployee
} from "./helpers.js";

// Alle formulieren en vensters die closeStaleForms en handleStorageCleared opzoeken.
const FORM_SELECTORS = [
  "#employeeForm", "#employeeFormModal",
  "#productForm", "#productFormModal",
  "#companyForm", "#companyFormModal",
  "#pointForm", "#pointFormModal"
];

// Controller met een strenge nep-view die alleen de opgegeven selectors kent.
// Zonder `model` wordt het testmodel gebruikt (employee-1 op Hoofdkantoor van TVB).
const createApp = (selectors, { model = createModel().model } = {}) => {
  globalThis.document = { activeElement: null };
  const view = createStrictView(selectors);
  const demo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  return { app: new RegistrationApp(model, view, undefined, demo), model, view };
};

// Een "submit"-event van een formulier.
const submitEvent = () => ({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });

// Opslag die doet alsof een ander tabblad intussen deze gegevens heeft opgeslagen.
const otherTabStore = (state, loadProblem = null) => ({
  key: "tvb-test",
  loadProblem,
  load: () => state,
  save: () => true
});

const toastTexts = (view) => view.toasts.map(({ message }) => message);
const calledNames = (view) => view.calls.map(([name]) => name);

// ------------------------------------------------------------------
// Bug 1: prijs boven 1000 euro
// ------------------------------------------------------------------

const PRODUCT_SELECTORS = ["#productForm", "#productFormModal", "#productName", "#productPrice"];

// Vult het productformulier; naam en prijs zijn verplicht.
const fillProductForm = (view, name, price) => {
  view.$("#productName").value = name;
  view.$("#productPrice").value = price;
  view.$("#productForm").querySelectorAll = () => [view.$("#productName"), view.$("#productPrice")];
};

test("een prijs van precies 1000 euro blijft na opslaan en opnieuw laden bewaard", () => {
  const store = createDataStore();
  const { app, view } = createApp(PRODUCT_SELECTORS, { model: new RegistrationModel(store) });

  fillProductForm(view, "Taart", "1000");
  app.saveProduct(submitEvent());

  const reloaded = new RegistrationModel(new DataStore("test"));
  assert.equal(reloaded.products.find(({ name }) => name === "Taart")?.price, 1000);
  assert.equal(reloaded.loadProblem, null);
});

test("een prijs van 1000,01 euro wordt door het formulier geweigerd met een duidelijke melding", () => {
  const store = createDataStore();
  const { app, view } = createApp(PRODUCT_SELECTORS, { model: new RegistrationModel(store) });

  fillProductForm(view, "Taart", "1000.01");
  app.saveProduct(submitEvent());

  assert.equal(localStorage.getItem("test"), null, "er is niets opgeslagen");
  assert.equal(view.fieldErrors.at(-1).field, view.$("#productPrice"));
  assert.equal(view.fieldErrors.at(-1).message, "Vul een prijs van 0 tot en met 1000 euro in, met hooguit twee decimalen.");
  assert.equal(view.$("#productPrice").focused, true);
});

test("het model weigert een prijs boven 1000 euro, ook na opslaan en opnieuw laden", () => {
  const store = createDataStore();
  const model = new RegistrationModel(store);
  const before = JSON.stringify(model.products);

  assert.equal(model.saveProduct({ id: "taart", name: "Taart", price: "1000.01" }), false);
  assert.equal(model.saveProduct({ id: "blikje", name: "Blikje", price: "5000" }), false);
  assert.equal(model.saveProduct({ id: "soep", name: "Soep", price: "-1" }), false);
  assert.equal(model.saveProduct({ id: "thee", name: "Thee", price: "abc" }), false);
  assert.equal(JSON.stringify(model.products), before);

  assert.equal(model.saveProduct({ id: "taart", name: "Taart", price: String(MAX_PRICE) }), true);
  model.save();
  const reloaded = new RegistrationModel(new DataStore("test"));
  assert.equal(reloaded.products.find(({ name }) => name === "Taart")?.price, 1000);
  assert.equal(reloaded.findProduct("blikje").price, model.findProduct("blikje").price);
});

test("isValidPrice accepteert 1000 euro en weigert alles daarboven", () => {
  for (const price of ["0", "1000", "1000.00", "999.99"]) assert.equal(RegistrationApp.isValidPrice(price), true, price);
  for (const price of ["1000.01", "1001", "99999"]) assert.equal(RegistrationApp.isValidPrice(price), false, price);
});

// ------------------------------------------------------------------
// Bug 2: voorraad van een punt of product dat niet meer bestaat
// ------------------------------------------------------------------

test("voorraad tellen bij een verdwenen consumptiepunt slaat niets op en zet niets in het logboek", () => {
  const { app, model, view } = createApp(["#stockPointSelect"]);
  view.$("#stockPointSelect").value = "verwijderd-punt";
  const input = createFakeElement({ value: "5", dataset: { productId: "blikje", stockField: "stock" } });

  app.saveStockField(input);

  assert.equal(model.auditLog.length, 0);
  assert.deepEqual(toastTexts(view), ["Dit consumptiepunt of product bestaat niet meer; er is niets opgeslagen."]);
  assert.equal(view.toasts[0].tone, "error");
  assert.equal(input.value, "");
  assert.equal(calledNames(view).includes("updateStockStatus"), false);
});

test("een minimum wijzigen van een verdwenen product slaat niets op", () => {
  const { app, model, view } = createApp(["#stockPointSelect"]);
  view.$("#stockPointSelect").value = model.points[0].id;
  const input = createFakeElement({ value: "3", dataset: { productId: "verwijderd-product", stockField: "minimum" } });

  app.saveStockField(input);

  assert.equal(model.auditLog.length, 0);
  assert.equal(view.toasts.some(({ tone }) => tone === "success"), false);
});

// ------------------------------------------------------------------
// Bug 3: focus na "Registreren"
// ------------------------------------------------------------------

test("na registreren gaat het venster eerst dicht en krijgt de nieuwe rij van de medewerker de focus", () => {
  const { model, point } = createModel();
  const employee = addEmployee(model, { id: 'mede"werker', companyId: point.companyId, pointId: point.id });
  const rowSelector = '[data-open-employee="mede\\"werker"]';
  const { app, view } = createApp(["#employeeProductsModal", rowSelector], { model });

  const oldRow = createFakeElement({ isConnected: true });
  globalThis.document = { activeElement: oldRow };
  app.openEmployeeProducts(employee.id);
  app.selectedProducts = { blikje: 1 };

  let modalHiddenDuringRender = null;
  view.renderAll = () => {
    modalHiddenDuringRender = view.$("#employeeProductsModal").classList.contains("hidden");
    oldRow.isConnected = false; // de lijst wordt opnieuw getekend: de oude rij verdwijnt
  };
  app.registerSelectedProducts();

  assert.equal(modalHiddenDuringRender, true, "het venster was al dicht tijdens het tekenen");
  assert.equal(view.$(rowSelector).focused, true);
  assert.equal(model.registrations.length, 1);
  assert.equal(view.toasts.at(-1).tone, "success");
  assert.match(view.toasts.at(-1).message, /geregistreerd/);
});

test("staat de knop waarmee het venster werd geopend er nog, dan houdt die de focus na registreren", () => {
  const rowSelector = '[data-open-employee="employee-1"]';
  const { app, view } = createApp(["#employeeProductsModal", rowSelector]);
  const faceButton = createFakeElement({ isConnected: true });
  globalThis.document = { activeElement: faceButton };
  app.openEmployeeProducts("employee-1");
  app.selectedProducts = { blikje: 1 };

  app.registerSelectedProducts();

  assert.equal(faceButton.focused, true);
  assert.equal(view.$(rowSelector).focused, false);
});

// ------------------------------------------------------------------
// Bug 4: persist bij "niets gewijzigd"
// ------------------------------------------------------------------

test("persist slaat niets op en logt niets als de wijziging meldt dat er niets is gewijzigd", () => {
  const { app, model, view } = createApp([]);
  let saves = 0;
  model.store = { ...model.store, save: () => { saves += 1; return true; } };
  const before = JSON.stringify(model.state);

  const result = app.persist(
    () => {
      model.addRegistration("employee-1", "blikje"); // halverwege iets gewijzigd...
      return false;                                   // ...maar het model meldt "niets gewijzigd"
    },
    { action: "Test", details: "mag niet in het logboek" }
  );

  assert.equal(result, false);
  assert.equal(saves, 0);
  assert.equal(JSON.stringify(model.state), before, "de wijziging is teruggedraaid");
  assert.deepEqual(toastTexts(view), ["Er is niets gewijzigd: de gegevens zijn intussen veranderd."]);
});

test("persist telt een wijziging zonder antwoord (undefined) als gelukt", () => {
  const { app, model } = createApp([]);

  const result = app.persist(() => { model.addRegistration("employee-1", "blikje"); }, { action: "Test", details: "ok" });

  assert.equal(result, true);
  assert.equal(model.auditLog.length, 1);
});

test("persist weigert een medewerker die naar een verwijderd bedrijf wijst", () => {
  const { app, model, view } = createApp([]);

  const result = app.persist(
    () => model.addEmployee({ firstName: "Jan", lastName: "Jansen", companyId: "verwijderd", pointId: null }),
    { action: "Medewerker toegevoegd", details: "Jan Jansen" }
  );

  assert.equal(result, false);
  assert.equal(model.employees.length, 1);
  assert.equal(model.auditLog.length, 0);
  assert.equal(view.toasts.at(-1).tone, "error");
});

// ------------------------------------------------------------------
// Bug 5: verouderde keuze van bedrijf of consumptiepunt in een open formulier
// ------------------------------------------------------------------

const EMPLOYEE_SELECTORS = [
  "#employeeForm", "#employeeFormModal",
  "#newEmployeeFirstName", "#newEmployeeLastName", "#newEmployeePayrollCode",
  "#newEmployeePersonnelNumber", "#newEmployeeEmployerNumber", "#newEmployeeCompany", "#newEmployeePoint"
];

// Vult het medewerkersformulier met een nieuwe medewerker bij het gekozen bedrijf en punt.
const fillEmployeeForm = (view, companyId, pointId) => {
  view.$("#newEmployeeFirstName").value = "Jan";
  view.$("#newEmployeeLastName").value = "Jansen";
  view.$("#newEmployeePersonnelNumber").value = "777";
  view.$("#newEmployeeCompany").value = companyId;
  view.$("#newEmployeePoint").value = pointId;
};

test("een nieuwe medewerker bij een intussen verwijderd bedrijf wordt niet opgeslagen", () => {
  const { app, model, view } = createApp(EMPLOYEE_SELECTORS);
  fillEmployeeForm(view, "verwijderd-bedrijf", "");

  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, 1);
  assert.equal(model.auditLog.length, 0);
  assert.equal(view.fieldErrors.at(-1).field, view.$("#newEmployeeCompany"));
  assert.equal(view.fieldErrors.at(-1).message, "Dit bedrijf bestaat niet meer. Kies opnieuw.");
  assert.equal(view.$("#newEmployeeCompany").focused, true);
  assert.ok(calledNames(view).includes("populateEmployeeCompanySelects"), "de keuzelijsten worden ververst");
});

test("een nieuwe medewerker met een consumptiepunt van een ander bedrijf wordt niet opgeslagen", () => {
  const { app, model, view } = createApp(EMPLOYEE_SELECTORS);
  const tvb = model.points[0].companyId;
  const other = model.companies.find(({ id }) => id !== tvb);
  model.savePoint({ name: "Kantine", companyId: other.id, offeredProductIds: [] });
  const otherPoint = model.points.find(({ companyId }) => companyId === other.id);
  fillEmployeeForm(view, tvb, otherPoint.id);

  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, 1);
  assert.equal(view.fieldErrors.at(-1).field, view.$("#newEmployeePoint"));
  assert.match(view.fieldErrors.at(-1).message, /Kies opnieuw/);
  assert.ok(calledNames(view).includes("populateEmployeePointSelect"));
});

test("een nieuwe medewerker met een bestaand bedrijf en punt, of zonder bedrijf, wordt wel opgeslagen", () => {
  const { app, model, view } = createApp(EMPLOYEE_SELECTORS);
  const point = model.points[0];
  fillEmployeeForm(view, point.companyId, point.id);

  app.saveEmployee(submitEvent());

  assert.equal(model.employees.length, 2);
  assert.equal(view.fieldErrors.length, 0);
  assert.equal(model.addEmployee({ firstName: "Zonder", lastName: "Bedrijf", companyId: null, pointId: null }), true);
});

test("het model koppelt een medewerker niet aan een bedrijf of punt dat niet (meer) klopt", () => {
  const { model, point } = createModel();
  const other = model.companies.find(({ id }) => id !== point.companyId);
  const before = JSON.stringify(model.employees);

  assert.equal(model.addEmployee({ firstName: "A", lastName: "B", companyId: "weg", pointId: null }), false);
  assert.equal(model.addEmployee({ firstName: "A", lastName: "B", companyId: point.companyId, pointId: "weg" }), false);
  assert.equal(model.addEmployee({ firstName: "A", lastName: "B", companyId: other.id, pointId: point.id }), false);
  assert.equal(model.updateEmployee("employee-1", { firstName: "A", lastName: "B", companyId: "weg" }), false);
  assert.equal(model.updateEmployee("employee-1", { firstName: "A", lastName: "B", companyId: other.id }), false, "het punt hoort niet bij dat bedrijf");
  assert.equal(model.updateEmployee("bestaat-niet", { firstName: "A", lastName: "B" }), false);
  assert.equal(JSON.stringify(model.employees), before);

  assert.equal(model.updateEmployee("employee-1", { firstName: "A", lastName: "B", companyId: other.id, pointId: null }), true);
});

const POINT_SELECTORS = ["#pointForm", "#pointFormModal", "#pointName", "#pointCompany"];

test("een nieuw consumptiepunt bij een intussen verwijderd bedrijf wordt niet opgeslagen", () => {
  const { app, model, view } = createApp(POINT_SELECTORS);
  view.$("#pointName").value = "Kantine";
  view.$("#pointCompany").value = "verwijderd-bedrijf";
  view.$("#pointForm").querySelectorAll = (query) => (query === "[required]" ? [view.$("#pointName")] : []);
  const pointsBefore = model.points.length;

  app.savePoint(submitEvent());

  assert.equal(model.points.length, pointsBefore);
  assert.equal(model.auditLog.length, 0);
  assert.equal(view.fieldErrors.at(-1).field, view.$("#pointCompany"));
  assert.equal(view.fieldErrors.at(-1).message, "Dit bedrijf bestaat niet meer. Kies opnieuw.");
  assert.ok(calledNames(view).includes("populatePointCompanySelect"));
});

test("het model slaat geen consumptiepunt op bij een bedrijf dat niet bestaat", () => {
  const { model } = createModel();
  const before = JSON.stringify(model.points);

  assert.equal(model.savePoint({ name: "Kantine", companyId: "weg", offeredProductIds: [] }), false);
  assert.equal(JSON.stringify(model.points), before);
});

// ------------------------------------------------------------------
// Bug 6: open wijzigformulier van een gegeven dat in een ander tabblad is gewijzigd
// ------------------------------------------------------------------

const STORAGE_SELECTORS = [...FORM_SELECTORS, "#pointFormTitle", "#pointName", "#pointCompany",
  "#employeeFormTitle", "#employeeFormHelp", "#employeeSaveContinueButton",
  "#newEmployeeFirstName", "#newEmployeeLastName", "#newEmployeePayrollCode",
  "#newEmployeePersonnelNumber", "#newEmployeeEmployerNumber"];

test("het aanbod van een punt dat in een ander tabblad is gewijzigd, sluit het open formulier", () => {
  const { app, model, view } = createApp(STORAGE_SELECTORS);
  const point = model.points[0];
  app.openEditPointForm(point.id);

  const otherTab = structuredClone(model.state);
  otherTab.points[0].products.ei.offered = false;
  model.store = otherTabStore(otherTab);
  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(view.$("#pointFormModal").classList.contains("hidden"), true);
  assert.equal(view.$("#pointForm").dataset.editingId, undefined);
  assert.equal(
    toastTexts(view).at(-1),
    "Wat je aan het wijzigen was, is in een ander venster gewijzigd. Open het opnieuw om verder te gaan."
  );
});

test("een andere voorraad (bijvoorbeeld een registratie in een ander tabblad) laat het puntformulier open", () => {
  const { app, model, view } = createApp(STORAGE_SELECTORS);
  app.openEditPointForm(model.points[0].id);

  const otherTab = structuredClone(model.state);
  otherTab.points[0].products.blikje.stock = 23;
  model.store = otherTabStore(otherTab);
  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(view.$("#pointFormModal").classList.contains("hidden"), false);
  assert.equal(view.$("#pointForm").dataset.editingId, model.points[0].id);
  assert.equal(view.toasts.length, 0);
});

test("een medewerker die in een ander tabblad is gewijzigd, sluit het open medewerkersformulier", () => {
  const { app, model, view } = createApp(STORAGE_SELECTORS);
  app.openEditEmployeeForm("employee-1");

  const otherTab = structuredClone(model.state);
  otherTab.employees[0].payrollCode = "999";
  model.store = otherTabStore(otherTab);
  app.handleStorageChange({ key: "tvb-test" });

  assert.equal(view.$("#employeeFormModal").classList.contains("hidden"), true);
  assert.match(toastTexts(view).at(-1), /in een ander venster gewijzigd/);
});

// ------------------------------------------------------------------
// Bug 7: de opslag is in een ander tabblad helemaal gewist
// ------------------------------------------------------------------

const WIPE_SELECTORS = [...FORM_SELECTORS, "#faceModal", "#faceVideo", "#employeeProductsModal", "#adminModal", "#loginPassword"];

test("is de opslag in een ander venster gewist, dan wist dit tabblad ook alles en sluit wat open staat", () => {
  const { app, model, view } = createApp(WIPE_SELECTORS);
  let cleared = 0;
  model.store = { ...otherTabStore(null), clearAll: () => { cleared += 1; } };
  app.adminLoggedIn = true;
  app.openEmployeeProducts("employee-1");
  view.$("#productForm").dataset.editingId = "blikje";

  app.handleStorageChange({ key: null });

  assert.equal(cleared, 1);
  assert.equal(model.findEmployee("employee-1"), undefined, "de oude gegevens zijn weg");
  assert.equal(model.auditLog.length, 0);
  assert.equal(app.selectedEmployeeId, null);
  assert.equal(app.adminLoggedIn, false);
  for (const modal of ["#employeeProductsModal", "#faceModal", "#adminModal", "#productFormModal", "#pointFormModal"]) {
    assert.equal(view.$(modal).classList.contains("hidden"), true, modal);
  }
  assert.equal(view.$("#productForm").dataset.editingId, undefined);
  assert.ok(calledNames(view).includes("renderAll"));
  assert.equal(toastTexts(view).at(-1), "De gegevens zijn in een ander venster gewist.");
});

test("met een echte DataStore: na het leegmaken van localStorage schrijft dit tabblad de oude gegevens niet terug", () => {
  const store = createDataStore();
  const model = new RegistrationModel(store);
  model.state.registrations = [];
  model.addRegistration(model.employees[0].id, "blikje");
  model.save();
  const { app } = createApp(WIPE_SELECTORS, { model });

  localStorage.removeItem("test"); // het andere tabblad wist alles (localStorage.clear())
  app.handleStorageChange({ key: null });
  app.persist(() => model.logAdminAction("Test", "eerste wijziging na het wissen"));

  const saved = JSON.parse(localStorage.getItem("test"));
  assert.equal(saved.registrations.length, 0);
  assert.equal(saved.auditLog.length, 1);
});

test("waren de gegevens onleesbaar, dan wordt er bij een lege sleutel niet gewist maar gewaarschuwd", () => {
  const { app, model, view } = createApp(WIPE_SELECTORS);
  model.store = otherTabStore(null, "unreadable");

  app.handleStorageChange({ key: null });

  assert.ok(model.findEmployee("employee-1"), "de gegevens blijven staan");
  assert.match(toastTexts(view).at(-1), /onleesbaar/);
});

// ------------------------------------------------------------------
// DataStore.clearAll met een opslag die sleutels kan opsommen
// ------------------------------------------------------------------

test("clearAll wist ook oude reservekopieën met een tijdstempel, maar laat andere sleutels staan", () => {
  fakeLocalStorageWithKeys();
  for (const key of ["test", "test-backup", "test-backup-laatste", "test-backup-1726000000000",
    "test-backup-abc", "test-backup-12x", "tvb-theme"]) {
    localStorage.setItem(key, "x");
  }

  assert.equal(new DataStore("test").clearAll(), true);

  const left = [];
  for (let index = 0; index < localStorage.length; index += 1) left.push(localStorage.key(index));
  assert.deepEqual(left.sort(), ["test-backup-12x", "test-backup-abc", "tvb-theme"]);
});
