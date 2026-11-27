// Tests voor de andere manieren voor wat AFAS niet geeft (26 november 2026):
//   - FR-101: looncodes importeren uit een CSV-bestand van de loonadministratie (PayrollImport);
//   - FR-102: de afdeling uit AFAS (organisatorische eenheid) koppelen aan een consumptiepunt.
// De namen en nummers zijn verzonnen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { PayrollImport } from "../assets/js/PayrollImport.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { createModel, addEmployee, createRecordingView, createDataStore, asAdmin } from "./helpers.js";

// Een model met drie medewerkers: 5001 (looncode 101), 0012 (geen looncode) en een gast.
const createPayrollModel = () => {
  const { model, point } = createModel();
  model.state.employees[0] = { ...model.state.employees[0], name: "Lotte van Dijk", personnelNumber: "5001", payrollCode: "101" };
  addEmployee(model, { name: "Mark Jansen", personnelNumber: "0012", payrollCode: "", companyId: point.companyId, pointId: point.id });
  model.addGuest({ firstName: "Ilse", lastName: "de Wit", phone: "06 12345678" });
  return model;
};

const file = (text) => ({ size: text.length, text: async () => text });

// ------------------------------------------------------------------
// PayrollImport: het bestand lezen
// ------------------------------------------------------------------

test("looncode-import: een bestand van Excel met puntkomma's, BOM en extra kolommen", () => {
  const parsed = PayrollImport.parse("﻿Naam;Personeelsnummer;Looncode\r\nLotte van Dijk;5001;102\r\n\r\nMark Jansen;12;205\r\n");

  assert.deepEqual(parsed.rows, [
    { line: 2, personnelNumber: "5001", payrollCode: "102" },
    { line: 4, personnelNumber: "12", payrollCode: "205" }
  ]);
});

test("looncode-import: komma's, tabs, aanhalingstekens en andere namen voor de kolommen", () => {
  assert.deepEqual(PayrollImport.parse("Medewerker,Looncode\n\"5001\",\"102\"\n").rows, [{ line: 2, personnelNumber: "5001", payrollCode: "102" }]);
  assert.deepEqual(PayrollImport.parse("personeels nummer\tLOONCODE\n5001\t102").rows, [{ line: 2, personnelNumber: "5001", payrollCode: "102" }]);
  assert.deepEqual(PayrollImport.splitLine("\"de Wit; Ilse\";5001;\"zei \"\"hoi\"\"\"", ";"), ["de Wit; Ilse", "5001", "zei \"hoi\""]);
});

test("looncode-import: zonder de juiste kolommen of leeg geeft een duidelijke melding", () => {
  assert.equal(PayrollImport.parse("").error, "Het bestand is leeg.");
  assert.equal(PayrollImport.parse("Naam;Bedrag\nLotte;1").error, "Het bestand moet een kopregel hebben met de kolommen Personeelsnummer en Looncode.");
  assert.equal(PayrollImport.parse("5001;102\n5002;103").error, PayrollImport.MESSAGES.noColumns, "zonder kopregel");
});

// ------------------------------------------------------------------
// PayrollImport: bepalen wat er verandert
// ------------------------------------------------------------------

test("looncode-import: vindt medewerkers op personeelsnummer, ook als Excel de voorloopnullen weghaalde", () => {
  const model = createPayrollModel();
  const result = PayrollImport.plan(model.employees, [
    { line: 2, personnelNumber: "5001", payrollCode: "101" },
    { line: 3, personnelNumber: "12", payrollCode: "205" },
    { line: 4, personnelNumber: "9999", payrollCode: "300" },
    { line: 5, personnelNumber: "5001", payrollCode: "999" },
    { line: 6, personnelNumber: "", payrollCode: "1" },
    { line: 7, personnelNumber: "5001", payrollCode: "1.0" }
  ]);

  assert.deepEqual(result.updates, [{ employeeId: "employee-2", payrollCode: "205" }]);
  assert.equal(result.unchanged, 1);
  assert.deepEqual(result.unknown, [4]);
  assert.deepEqual(result.invalid, [6, 7]);
  assert.deepEqual(result.repeated, [5]);
  assert.equal(PayrollImport.summary(result), "1 bijgewerkt, 1 al goed, 1 onbekend personeelsnummer, 2 ongeldig, 1 dubbel");
  assert.equal(PayrollImport.problemLines(result), "4, 5, 6, 7");
});

test("looncode-import: zonder voorloopnullen telt het alleen als het bij precies één medewerker past", () => {
  const model = createPayrollModel();
  addEmployee(model, { id: "employee-3", name: "Tom de Groot", personnelNumber: "012", payrollCode: "" });

  const result = PayrollImport.plan(model.employees, [{ line: 2, personnelNumber: "12", payrollCode: "205" }]);

  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.unknown, [2], "0012 en 012 passen allebei");
});

test("looncode-import: een gast heeft geen personeelsnummer en wordt nooit gevonden", () => {
  const model = createPayrollModel();
  const result = PayrollImport.plan(model.employees, [{ line: 2, personnelNumber: "0612345678", payrollCode: "1" }]);
  assert.deepEqual(result.unknown, [2]);
});

test("looncode-import: de melding noemt hooguit tien regels", () => {
  const result = { updates: [], unchanged: 0, unknown: Array.from({ length: 12 }, (_, index) => index + 2), invalid: [], repeated: [] };
  assert.equal(PayrollImport.problemLines(result), "2, 3, 4, 5, 6, 7, 8, 9, 10, 11 en nog 2");
});

// ------------------------------------------------------------------
// Het beheer: importeren
// ------------------------------------------------------------------

test("looncode-import: de beheerder importeert, alleen de looncodes veranderen en het logboek krijgt alleen aantallen", async () => {
  const model = createPayrollModel();
  const view = createRecordingView();
  const app = asAdmin(new RegistrationApp(model, view));

  const result = await app.importPayrollCodes(file("Personeelsnummer;Looncode\n5001;101\n12;205\n"));

  assert.equal(result.updates.length, 1);
  assert.equal(model.findEmployee("employee-2").payrollCode, "205");
  assert.equal(model.findEmployee("employee-2").name, "Mark Jansen", "de naam is veranderd");
  const entry = model.auditLog.at(-1);
  assert.deepEqual([entry.action, entry.details], ["Looncodes geïmporteerd", "1 bijgewerkt, 1 al goed"]);
  assert.deepEqual(view.toasts.at(-1), { message: "Looncodes: 1 bijgewerkt, 1 al goed.", tone: "success", duration: 8000 });
});

test("looncode-import: met fouten in het bestand noemt de melding de regels, en zonder wijziging komt er geen logboekregel", async () => {
  const model = createPayrollModel();
  const view = createRecordingView();
  const app = asAdmin(new RegistrationApp(model, view));

  await app.importPayrollCodes(file("Personeelsnummer;Looncode\n5001;101\n9999;3\n"));

  assert.deepEqual(model.auditLog, []);
  assert.equal(view.toasts.at(-1).message, "Looncodes: 0 bijgewerkt, 1 al goed, 1 onbekend personeelsnummer. Controleer regel 3 van het bestand.");
  assert.equal(view.toasts.at(-1).tone, "error");
});

test("looncode-import: alleen een ingelogde beheerder, en een te groot of onleesbaar bestand geeft een melding", async () => {
  const model = createPayrollModel();
  const view = createRecordingView();
  const app = new RegistrationApp(model, view);

  assert.equal(await app.importPayrollCodes(file("Personeelsnummer;Looncode\n12;205")), null);
  assert.equal(model.findEmployee("employee-2").payrollCode, "", "zonder beheerder is er geïmporteerd");

  asAdmin(app);
  assert.equal(await app.importPayrollCodes({ size: 3 * 1024 * 1024, text: async () => "" }), null);
  assert.equal(view.toasts.at(-1).message, "Het bestand is te groot (hooguit 2 MB).");
  assert.equal(await app.importPayrollCodes({ size: 10, text: async () => { throw new Error("kapot"); } }), null);
  assert.equal(view.toasts.at(-1).message, "Het bestand kon niet worden gelezen.");
  assert.equal(await app.importPayrollCodes(file("Naam\nLotte")), null);
  assert.equal(view.toasts.at(-1).message, PayrollImport.MESSAGES.noColumns);
});

test("looncode-import: index.html heeft de knop en een verborgen bestandsveld voor CSV", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tab = html.match(/<div id="employeesTab"[\s\S]*?<div id="productsTab"/)?.[0] ?? "";

  assert.ok(tab.includes('id="importPayrollButton"'));
  assert.ok(tab.includes("Looncodes importeren"));
  assert.ok(tab.includes('<input type="file" id="payrollImportFile" accept=".csv,text/csv" hidden>'));
});

// ------------------------------------------------------------------
// Afdeling uit AFAS koppelen aan een consumptiepunt (FR-102)
// ------------------------------------------------------------------

const createUnitModel = () => {
  const { model, point } = createModel();
  model.state.points = [...model.state.points, { id: "punt-it", name: "Kantine IT", companyId: "bedrijf-it", products: {} }];
  model.state.companies = [...model.state.companies, { id: "bedrijf-it", name: "IT Supervision", employerNumber: "" }];
  model.state.employees[0] = { ...model.state.employees[0], unit: "Service", pointId: null };
  addEmployee(model, { id: "mw-mark", name: "Mark Jansen", unit: "service", companyId: point.companyId, pointId: point.id });
  addEmployee(model, { id: "mw-tom", name: "Tom de Groot", unit: "Service", companyId: "bedrijf-it", pointId: null });
  addEmployee(model, { id: "mw-sanne", name: "Sanne Bakker", unit: "Installatie", companyId: point.companyId, pointId: null, active: false });
  return { model, point };
};

test("afdeling: het overzicht noemt iedere afdeling één keer, met het aantal actieve medewerkers en het punt", () => {
  const { model } = createUnitModel();

  assert.deepEqual(model.unitsOverview(), [{ unit: "Service", count: 3, pointId: null }]);
  model.assignUnitToPoint("Service", model.points[0].id);
  assert.deepEqual(model.unitsOverview(), [{ unit: "Service", count: 3, pointId: model.points[0].id }]);
});

test("afdeling: koppelen geeft medewerkers zonder punt van het eigen bedrijf het punt, en een gekozen punt blijft", () => {
  const { model, point } = createUnitModel();
  model.findEmployee("mw-mark").pointId = "punt-it-oud";

  assert.equal(model.assignUnitToPoint("SERVICE", point.id), 1);

  assert.equal(model.findEmployee("employee-1").pointId, point.id, "Lotte had geen punt");
  assert.equal(model.findEmployee("mw-mark").pointId, "punt-it-oud", "het punt dat de beheerder koos, is veranderd");
  assert.equal(model.findEmployee("mw-tom").pointId, null, "Tom hoort bij een ander bedrijf");
  assert.equal(model.findEmployee("mw-sanne").pointId, null);
  assert.deepEqual(model.findPoint(point.id).units, ["SERVICE"]);
  assert.equal(model.pointForUnit("service").id, point.id);
});

test("afdeling: een afdeling hoort bij hooguit één punt, en los koppelen kan ook", () => {
  const { model, point } = createUnitModel();
  model.assignUnitToPoint("Service", point.id);
  model.assignUnitToPoint("Service", "punt-it");

  assert.deepEqual(model.findPoint(point.id).units, []);
  assert.deepEqual(model.findPoint("punt-it").units, ["Service"]);
  assert.equal(model.findEmployee("mw-tom").pointId, "punt-it");

  assert.equal(model.assignUnitToPoint("Service", null), 0);
  assert.equal(model.pointForUnit("Service"), undefined);
  assert.equal(model.assignUnitToPoint("Service", "bestaat-niet"), false);
  assert.equal(model.assignUnitToPoint("  ", point.id), false);
});

test("afdeling: de afdeling en de afdelingen van een punt blijven na opslaan en laden, en een kapotte waarde wordt overgeslagen", () => {
  const base = { firstName: "A", lastName: "B", payrollCode: "", personnelNumber: "", employerNumber: "", companyId: null, pointId: null, active: true, color: "#d8f1e8", badgeId: "" };
  const store = createDataStore({
    employees: [{ ...base, id: "mw-1", name: "A B", unit: "Service" }, { ...base, id: "mw-2", name: "C D", unit: ["lijst"] }],
    registrations: [], products: [], companies: [{ id: "c1", name: "TVB", employerNumber: "" }],
    points: [
      { id: "p1", name: "Hoofdkantoor", companyId: "c1", products: {}, units: ["Service"] },
      { id: "p2", name: "Kapot", companyId: "c1", products: {}, units: "Service" }
    ],
    auditLog: []
  });
  const data = store.load();

  assert.deepEqual(data.employees.map((employee) => [employee.id, employee.unit]), [["mw-1", "Service"]]);
  assert.deepEqual(data.points.map((point) => [point.id, point.units]), [["p1", ["Service"]]]);
});

test("afdeling: de beheerder ziet de afdeling in de lijst met medewerkers", () => {
  const { model } = createUnitModel();
  const view = new RegistrationView(model);
  const list = { innerHTML: "" };
  view.$ = (selector) => (selector === "#employeeManagementSearch" ? { value: "" } : list);

  view.renderAdminEmployees();

  assert.ok(list.innerHTML.includes("· afd. Service"));
});

test("afdeling: index.html heeft de lijst met afdelingen in het tabblad Tablets en AFAS", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tab = html.match(/<div id="serverTab"[\s\S]*?<\/div>\n        <\/div>|<div id="serverTab"[\s\S]*?id="serverUnitList"/)?.[0] ?? "";

  assert.ok(tab.includes("<h3>Afdelingen uit AFAS</h3>"));
  assert.ok(tab.includes('id="serverUnitList"'));
});
