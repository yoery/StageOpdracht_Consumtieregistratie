// Regressietests voor de punten uit de beveiligingsscan (TO versie 3.7):
//   1. beheeracties controleren zelf of er een beheerder is ingelogd (requireAdmin);
//   2. product-id's als "__proto__", "constructor" of "toString" in de voorraadlijst van een
//      consumptiepunt (bij het laden, in het model en in de controller);
//   3. de camera gaat uit als de tijd om is (herkennen en instellen);
//   4. strengere controle van codes en tijdstippen bij het laden;
//   5. de CI draait op een ondersteunde Node.js-versie;
//   6. het logboek in het databaseschema is alleen-toevoegen;
//   7. de licentie van TensorFlow.js staat bij face-api.
// De pagina wordt nagebootst met een nep-view en nep-elementen; de bestanden worden alleen gelezen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { DataStore } from "../assets/js/DataStore.js";
import {
  createModel,
  createRecordingView,
  createFakeElement,
  createDataStore,
  fakeLocalStorage,
  addEmployee,
  asAdmin
} from "./helpers.js";

// Console-waarschuwingen van DataStore horen bij deze tests; ze maken de uitvoer alleen onrustig.
console.warn = () => {};

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

// Nep-demo gezichtsherkenning die direct laadt en bijhoudt hoe vaak de camera is uitgezet.
const createFaceDemo = (overrides = {}) => ({
  stopped: 0,
  settings: { scanTimeoutMs: 1000 },
  load: async () => {},
  startCamera: async () => true,
  stopCamera() { this.stopped += 1; },
  readFace: async () => null,
  findMatch: () => null,
  confirm: () => null,
  resetConfirmation() {},
  enroll() {},
  isAvailable: () => true,
  isEnrolled: () => false,
  ...overrides
});

// Controller met het testmodel (employee-1 op Hoofdkantoor van TVB) en een nep-view.
// Er is nog geen beheerder ingelogd. `exports` onthoudt iedere aanroep van de CSV-export.
const createApp = ({ faceDemo = createFaceDemo() } = {}) => {
  globalThis.document = { activeElement: null, querySelectorAll: () => [] };
  globalThis.window = { confirm: () => true };
  const { model, point } = createModel();
  const view = createRecordingView();
  const exports = [];
  const csvExport = { download: (...args) => { exports.push(args); return true; } };
  const app = new RegistrationApp(model, view, csvExport, faceDemo);
  return { app, model, view, point, exports, faceDemo };
};

const submitEvent = () => ({ preventDefault() {}, submitter: { dataset: { saveMode: "close" } } });
const lastToast = (view) => view.toasts.at(-1)?.message;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------
// 1. Beheeracties alleen voor een ingelogde beheerder
// ------------------------------------------------------------------

// Alle beheeracties die de controller kent, met geldige invoer. Zonder login mag geen enkele
// iets veranderen of een formulier openen.
const adminActions = (app, view, point) => {
  view.$("#stockPointSelect").value = point.id;
  view.$('[data-delivery-amount="blikje"]').value = "5";
  view.$("#productName").value = "Nieuw product";
  view.$("#productPrice").value = "1.00";
  view.$("#companyName").value = "Nieuw bedrijf";
  view.$("#pointName").value = "Nieuw punt";
  view.$("#pointCompany").value = point.companyId;
  view.$("#newEmployeeFirstName").value = "Nieuwe";
  view.$("#newEmployeeLastName").value = "Collega";
  const stockInput = createFakeElement({ value: "3", dataset: { productId: "blikje", stockField: "stock" } });

  return {
    addCorrection: () => app.addCorrection("employee-1", "blikje"),
    removeCorrection: () => app.removeCorrection("employee-1", "blikje"),
    toggleEmployee: () => app.toggleEmployee("employee-1"),
    removeEmployee: () => app.removeEmployee("employee-2"),
    removeProduct: () => app.removeProduct("yoghurt"),
    removeCompany: () => app.removeCompany(app.model.companies.at(-1).id),
    removePoint: () => app.removePoint(point.id),
    saveEmployee: () => app.saveEmployee(submitEvent()),
    saveProduct: () => app.saveProduct(submitEvent()),
    saveCompany: () => app.saveCompany(submitEvent()),
    savePoint: () => app.savePoint(submitEvent()),
    bookDelivery: () => app.bookDelivery("blikje"),
    saveStockField: () => app.saveStockField(stockInput),
    exportCsv: () => app.exportCsv(),
    wipeAllData: () => app.wipeAllData(),
    openEmployeeForm: () => app.openEmployeeForm(),
    openEditEmployeeForm: () => app.openEditEmployeeForm("employee-1"),
    openProductForm: () => app.openProductForm(),
    openEditProductForm: () => app.openEditProductForm("blikje"),
    openCompanyForm: () => app.openCompanyForm(),
    openEditCompanyForm: () => app.openEditCompanyForm(point.companyId),
    openPointForm: () => app.openPointForm(null, point.companyId),
    openEditPointForm: () => app.openEditPointForm(point.id)
  };
};

test("scan 1: zonder ingelogde beheerder doet geen enkele beheeractie iets en volgt een melding", () => {
  const { app, model, view, point, exports } = createApp();
  addEmployee(model, { active: false });
  model.addRegistration("employee-1", "blikje");
  const before = JSON.stringify(model.state);

  for (const [name, action] of Object.entries(adminActions(app, view, point))) {
    const toastCount = view.toasts.length;
    action();

    assert.equal(JSON.stringify(model.state), before, `${name} heeft iets gewijzigd`);
    assert.equal(view.toasts.length, toastCount + 1, `${name} geeft geen melding`);
    assert.equal(lastToast(view), "Log eerst in als beheerder.", name);
  }

  assert.equal(exports.length, 0, "er is niets geëxporteerd");
  assert.equal(app.modalOpeners.size, 0, "er is geen venster geopend");
  const formCalls = view.calls.filter(([name]) => ["renderPointForm", "populateEmployeeCompanySelects", "clearFieldErrors"].includes(name));
  assert.deepEqual(formCalls, [], "er is geen formulier gevuld");
});

test("scan 1: na inloggen werkt een correctie wel, na het sluiten van het beheer niet meer", () => {
  const { app, model, view } = createApp();
  view.$("#loginEmail").value = "admin@tvb.nl";
  view.$("#loginPassword").value = "geheim";

  app.login({ preventDefault() {} });
  assert.equal(app.addCorrection("employee-1", "blikje"), true);
  assert.equal(model.registrations.length, 1);

  app.closeAdmin();
  assert.equal(app.addCorrection("employee-1", "blikje"), false);
  assert.equal(model.registrations.length, 1);
  assert.equal(lastToast(view), "Log eerst in als beheerder.");
});

test("scan 1: sluiten van het beheer verbergt ook het dashboard in het venster", () => {
  const { app, view } = createApp();
  asAdmin(app);
  view.$("#adminView").classList.remove("hidden");

  app.closeAdmin();

  assert.equal(view.$("#adminView").classList.contains("hidden"), true);
  assert.equal(app.adminLoggedIn, false);
});

test("scan 1: registreren door een medewerker zelf vraagt geen login", () => {
  const { app, model } = createApp();

  app.openEmployeeProducts("employee-1");
  app.incrementProduct("blikje");
  app.registerSelectedProducts();

  assert.equal(model.registrations.length, 1);
});

test("scan 1: een correctie '+' voor een product dat niet bestaat, slaat niets op", () => {
  const { app, model, view } = createApp();
  asAdmin(app);

  assert.equal(app.addCorrection("employee-1", "toString"), false);

  assert.equal(model.registrations.length, 0);
  assert.equal(model.auditLog.length, 0);
  assert.equal(lastToast(view), "Dit product bestaat niet meer; er is niets opgeslagen.");
});

// ------------------------------------------------------------------
// 2. Speciale namen als product-id in de voorraadlijst
// ------------------------------------------------------------------

// Opgeslagen gegevens als JSON-tekst. Een object in JavaScript kan "__proto__" niet als gewone
// sleutel bevatten, JSON-tekst wel; daarom staat het hier als tekst (zoals in localStorage).
const TAMPERED_JSON = `{
  "employees": [],
  "registrations": [],
  "auditLog": [],
  "products": [
    { "id": "blikje", "name": "Blikje", "price": 0.65 },
    { "id": "constructor", "name": "Geknoeid", "price": 1 },
    { "id": "__proto__", "name": "Ook geknoeid", "price": 1 }
  ],
  "companies": [{ "id": "c1", "name": "TVB", "employerNumber": "" }],
  "points": [{
    "id": "p1", "name": "Hoofdkantoor", "companyId": "c1",
    "products": {
      "__proto__": { "blikje": { "offered": true, "stock": "7" } },
      "constructor": { "offered": true, "stock": 5 },
      "toString": { "offered": true, "stock": 3 },
      "kapot id": { "offered": true, "stock": 2 }
    }
  }]
}`;

test("scan 2: bij het laden komen alleen geldige product-id's in de voorraadlijst, als gewoon object", () => {
  fakeLocalStorage();
  localStorage.setItem("test", TAMPERED_JSON);

  const data = new DataStore("test").load();
  const stock = data.points[0].products;

  assert.deepEqual(data.products.map(({ id }) => id), ["blikje"]);
  assert.deepEqual(Object.keys(stock), ["blikje"]);
  assert.equal(Object.getPrototypeOf(stock), Object.prototype, "het prototype is niet vervangen");
  assert.deepEqual(stock.blikje, { offered: false, stock: 0, minimum: 0 }, "niets komt binnen via __proto__");
  assert.equal(({}).blikje, undefined, "Object.prototype is niet vervuild");
});

test("scan 2: renameStockKeys slaat onveilige sleutels over en geeft een object zonder prototype", () => {
  const store = new DataStore("test");
  const stock = JSON.parse('{"__proto__": {"x": 1}, "constructor": {}, "melk": {"stock": 2}, "a b": {}}');

  const renamed = store.renameStockKeys(stock);

  assert.equal(Object.getPrototypeOf(renamed), null);
  assert.deepEqual(Object.keys(renamed), ["glas-melk"]);
  assert.deepEqual(store.renameStockKeys(null), Object.create(null));
});

test("scan 2: isValidPoint keurt een voorraadlijst met een onveilige sleutel of een ander prototype af", () => {
  const store = new DataStore("test");
  const point = (products) => ({ id: "p1", name: "Punt", companyId: "c1", products });

  assert.equal(store.isValidPoint(point({ blikje: { offered: true, stock: 1, minimum: 0 } })), true);
  assert.equal(store.isValidPoint(point(JSON.parse('{"__proto__": {}}'))), false);
  assert.equal(store.isValidPoint(point({ "kapot id": {} })), false);
  assert.equal(store.isValidPoint(point(Object.create({ blikje: {} }))), false);
  assert.equal(store.isValidPoint(point([])), false);
});

test("scan 2: het model vindt bij 'toString' of 'constructor' geen voorraadregel en schrijft er geen", () => {
  const { model, point } = createModel();

  for (const productId of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    assert.equal(model.stockEntry(point.id, productId), undefined, productId);
    model.changeStock(point.id, productId, 5);
    model.setStock(point.id, productId, 5);
    assert.equal(Object.hasOwn(model.findPoint(point.id).products, productId), false, productId);
  }

  model.addRegistration("employee-1", "constructor");
  assert.equal(model.registrations.at(-1).pointId, null, "geen punt: het product wordt daar niet aangeboden");
  assert.equal(model.stockAlerts().length, 0);
  assert.equal(model.pointProduct(null, "blikje"), undefined);
});

test("scan 2: een levering voor 'toString' wordt niet geboekt en niet gelogd", () => {
  const { app, model, view, point } = createApp();
  asAdmin(app);
  view.$("#stockPointSelect").value = point.id;
  view.$('[data-delivery-amount="toString"]').value = "5";

  app.bookDelivery("toString");

  assert.equal(model.auditLog.length, 0);
  assert.equal(Object.hasOwn(model.findPoint(point.id).products, "toString"), false);
  assert.equal(lastToast(view), "Dit consumptiepunt of product bestaat niet meer; er is niets opgeslagen.");
});

// ------------------------------------------------------------------
// 3. De camera gaat uit als de tijd om is
// ------------------------------------------------------------------

test("scan 3: is bij herkennen de tijd om, dan gaat de camera uit en blijft het venster met een melding open", async () => {
  const faceDemo = createFaceDemo({ settings: { scanTimeoutMs: 0 } });
  const { app, view } = createApp({ faceDemo });
  app.faceSession = 1;

  await app.scanForFace(1);

  assert.equal(faceDemo.stopped, 1);
  assert.equal(view.$("#faceStatus").dataset.tone, "error");
  assert.match(view.$("#faceStatus").textContent, /camera is uitgezet/);
  assert.notEqual(app.faceSession, 1, "een lopende zoektocht stopt");
});

test("scan 3: wordt er bij instellen niets vastgelegd, dan gaat de camera na de tijdslimiet uit", async () => {
  const faceDemo = createFaceDemo({ settings: { scanTimeoutMs: 20 } });
  const { app, view } = createApp({ faceDemo });

  await app.openFaceModal("enroll", "employee-1");
  view.$("#faceConsent").checked = true;
  app.updateEnrollButton();
  assert.equal(view.$("#faceEnrollButton").disabled, false);

  await wait(60);

  assert.equal(faceDemo.stopped, 1);
  assert.equal(app.cameraReady, false);
  assert.equal(view.$("#faceEnrollButton").disabled, true, "vastleggen kan niet meer zonder camera");
  assert.equal(view.$("#faceStatus").dataset.tone, "error");
});

test("scan 3: wordt het cameravenster eerder gesloten, dan doet de tijdslimiet daarna niets meer", async () => {
  const faceDemo = createFaceDemo({ settings: { scanTimeoutMs: 20 } });
  const { app, view } = createApp({ faceDemo });

  await app.openFaceModal("enroll", "employee-1");
  app.closeFaceModal();
  const status = view.$("#faceStatus").textContent;
  await wait(60);

  assert.equal(faceDemo.stopped, 1, "alleen het sluiten zette de camera uit");
  assert.equal(view.$("#faceStatus").textContent, status);
  assert.equal(app.enrollTimer, null);
});

// ------------------------------------------------------------------
// 4. Strengere controle van codes en tijdstippen
// ------------------------------------------------------------------

test("scan 4: een code is tekst van hooguit 64 tekens zonder stuurtekens", () => {
  const store = new DataStore("test");

  for (const value of ["", "123", "LC01", "W-100", "1".repeat(64), null, undefined]) {
    assert.equal(store.isShortCode(value), true, String(value));
  }
  for (const value of [{ a: 1 }, ["=HYPERLINK(1)"], 100, true, "1".repeat(65), "12\t3", "12\n3", "\u0000"]) {
    assert.equal(store.isShortCode(value), false, JSON.stringify(value));
  }
});

test("scan 4: bij het laden wordt een code als getal tekst, en een medewerker met een code als object overgeslagen", () => {
  const { model, point } = createModel();
  const employee = (id, overrides) => ({ ...model.findEmployee("employee-1"), id, ...overrides });
  const store = createDataStore({
    ...model.state,
    employees: [
      employee("e-getal", { personnelNumber: 4411, payrollCode: 7 }),
      employee("e-object", { payrollCode: { a: 1 } }),
      employee("e-lijst", { personnelNumber: ["=HYPERLINK(1)"] })
    ],
    companies: model.companies.map((company) => (company.id === point.companyId ? { ...company, employerNumber: 100 } : company))
  });

  const data = store.load();

  assert.deepEqual(data.employees.map(({ id }) => id), ["e-getal"]);
  assert.equal(data.employees[0].personnelNumber, "4411");
  assert.equal(data.employees[0].payrollCode, "7");
  assert.equal(data.companies.find(({ id }) => id === point.companyId).employerNumber, "100");
  assert.equal(store.loadProblem, "skipped");
});

test("scan 4: een registratie heeft een ISO-tijdstip vanaf 2000 en hooguit een dag in de toekomst", () => {
  const store = new DataStore("test");
  const now = new Date("2026-10-09T12:00:00.000Z");
  const registration = (createdAt) => ({ id: "r1", employeeId: "e1", productId: "blikje", pointId: null, createdAt });

  for (const createdAt of ["2026-10-09T10:00:00.000Z", "2026-10-09T10:00:00", "2026-10-09T10:00", "2026-10-09T10:00:00+02:00", "2000-01-01T00:00:00.000Z"]) {
    assert.equal(store.isValidRegistration(registration(createdAt), now), true, createdAt);
  }
  for (const createdAt of ["1", "10/9/2026", "2026-10-09", "1999-12-31T23:59:59.000Z", "-271821-04-20T00:00:00Z", "+275760-09-13T00:00:00Z", "2026-10-11T12:00:00.000Z", 1728468000000]) {
    assert.equal(store.isValidRegistration(registration(createdAt), now), false, String(createdAt));
  }
});

test("scan 4: een logboekregel ver in de toekomst of vóór 2000 wordt bij het laden overgeslagen", () => {
  const store = new DataStore("test");
  const now = new Date("2026-10-09T12:00:00.000Z");
  const entry = (createdAt) => ({ id: "a1", action: "Product verwijderd", details: "Blikje", createdAt });

  assert.equal(store.isValidAuditEntry(entry("2026-10-09T11:00:00.000Z"), now), true);
  assert.equal(store.isValidAuditEntry(entry("2026-10-10T11:00:00.000Z"), now), true, "binnen een dag mag (klok van de tablet)");
  assert.equal(store.isValidAuditEntry(entry("9999-01-01T00:00:00.000Z"), now), false);
  assert.equal(store.isValidAuditEntry(entry("1970-01-01T00:00:00.000Z"), now), false);
  assert.equal(store.isValidAuditEntry(entry("1"), now), false);
});

test("scan 4: een telling (countedAt) die geen ISO-tijdstip vanaf 2000 is, wordt weggelaten", () => {
  const store = new DataStore("test");
  const now = new Date("2026-10-09T12:00:00.000Z");
  const products = [{ id: "blikje", name: "Blikje", price: 0.65 }];
  const countedAt = (value) => store.completePointStock(
    { id: "p1", name: "Punt", companyId: "c1", products: { blikje: { offered: true, stock: 4, minimum: 0, countedAt: value } } },
    products,
    now
  ).products.blikje.countedAt;

  assert.equal(countedAt("2026-10-08T09:00:00.000Z"), "2026-10-08T09:00:00.000Z");
  assert.equal(countedAt("1"), undefined);
  assert.equal(countedAt("1999-06-01T09:00:00.000Z"), undefined);
  assert.equal(countedAt("2026-10-10T09:00:00.000Z"), undefined, "in de toekomst");
});

// ------------------------------------------------------------------
// 5. CI op een ondersteunde Node.js-versie
// ------------------------------------------------------------------

test("scan 5: de CI gebruikt Node.js 22 of 24 (LTS) en package.json vraagt minstens Node.js 22", () => {
  const workflow = read("../.github/workflows/ci.yml");
  const versions = [...workflow.matchAll(/node-version:\s*(\d+)/g)].map(([, version]) => Number(version));
  const packageJson = JSON.parse(read("../package.json"));

  assert.ok(versions.length > 0, "node-version ontbreekt");
  assert.ok(versions.every((version) => version === 22 || version === 24), `niet ondersteund: ${versions}`);
  assert.equal(packageJson.engines.node, ">=22");
});

// ------------------------------------------------------------------
// 6. Het logboek in het databaseschema is alleen-toevoegen
// ------------------------------------------------------------------

test("scan 6: audit_log heeft triggers die UPDATE, DELETE en TRUNCATE weigeren, en geen ON DELETE SET NULL", () => {
  const schema = read("../docs/DATABASE-SCHEMA.sql").replace(/\r\n/g, "\n");
  const auditTable = schema.slice(schema.indexOf("CREATE TABLE audit_log"), schema.indexOf("CREATE INDEX audit_log_created_at_idx"));
  const activeLines = schema.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

  assert.doesNotMatch(auditTable, /REFERENCES|SET NULL/);
  assert.match(activeLines, /CREATE OR REPLACE FUNCTION audit_log_append_only\(\)[\s\S]*?RAISE EXCEPTION/);
  assert.match(activeLines, /BEFORE UPDATE OR DELETE ON audit_log\s+FOR EACH ROW EXECUTE FUNCTION audit_log_append_only\(\);/);
  assert.match(activeLines, /BEFORE TRUNCATE ON audit_log\s+FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only\(\);/);
  assert.match(activeLines, /REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;/);
});

// ------------------------------------------------------------------
// 7. Licenties van de meegeleverde bibliotheek
// ------------------------------------------------------------------

test("scan 7: de licentie van TensorFlow.js (Apache 2.0) staat naast face-api en in de README", () => {
  const license = read("../assets/vendor/face-api/LICENSE-TENSORFLOWJS");
  const readme = read("../assets/vendor/face-api/README.md");

  assert.match(license, /TensorFlow\.js/);
  assert.match(license, /Copyright \d{4} Google LLC/);
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  assert.match(readme, /`LICENSE-TENSORFLOWJS`/);
  assert.match(readme, /gearchiveerd/);
});

test("scan 7: ieder bestand in assets/vendor/face-api heeft een controlegetal in de README", () => {
  const folder = new URL("../assets/vendor/face-api/", import.meta.url);
  const readme = fs.readFileSync(new URL("README.md", folder), "utf8");
  const listed = new Set([...readme.matchAll(/\| `([^`]+)` \| `[0-9a-f]{64}` \|/g)].map(([, file]) => file));

  const files = fs.readdirSync(folder).filter((file) => file !== "README.md");
  assert.deepEqual(files.filter((file) => !listed.has(file)), []);
});
