// Tests voor de pasjes-dataset (FR-99): het openbare serienummer van iedere gekoppelde pas met de
// persoon erbij, als CSV-bestand dat alleen de beheerder kan exporteren. De namen en pasnummers zijn
// verzonnen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { CsvExport } from "../assets/js/CsvExport.js";
import { createModel, addEmployee, createRecordingView, createDataStore, asAdmin } from "./helpers.js";

const createBadgeModel = () => {
  const { model, point } = createModel();
  model.state.employees[0] = { ...model.state.employees[0], name: "Mark Jansen", personnelNumber: "5002", badgeId: "04A1B2C3", badgeLinkedAt: "2026-11-20T09:15:00.000Z" };
  addEmployee(model, { name: "Lotte van Dijk", personnelNumber: "5001", badgeId: "0499FFEE", active: false, companyId: point.companyId, pointId: point.id });
  addEmployee(model, { id: "employee-3", name: "Sanne Bakker", badgeId: "" });
  return model;
};

test("pasjes: alleen medewerkers met een pas staan in de dataset, op naam, met actief en de datum van koppelen", () => {
  const rows = new CsvExport(createBadgeModel()).badgeRows();

  assert.deepEqual(rows, [
    { Serienummer: "0499FFEE", Personeelsnummer: "5001", Naam: "Lotte van Dijk", Actief: "nee", "Gekoppeld op": "" },
    { Serienummer: "04A1B2C3", Personeelsnummer: "5002", Naam: "Mark Jansen", Actief: "ja", "Gekoppeld op": new CsvExport(null).localDate("2026-11-20T09:15:00.000Z") }
  ]);
});

test("pasjes: het bestand heeft de vaste kolommen en een naam die met = begint, wordt geen formule", () => {
  const model = createBadgeModel();
  model.state.employees[0].name = "=HYPERLINK(\"x\")";
  const csvExport = new CsvExport(model);
  const csv = csvExport.toCsv(csvExport.badgeRows(), CsvExport.BADGE_COLUMNS);

  assert.equal(csv.split("\r\n")[0], "Serienummer;Personeelsnummer;Naam;Actief;Gekoppeld op");
  assert.ok(csv.includes(`;"'=HYPERLINK(""x"")";`), csv);
});

test("pasjes: zonder gekoppelde pas wordt er niets gedownload", () => {
  const { model } = createModel();
  assert.equal(new CsvExport(model).downloadBadges(), 0);
});

test("pasjes: een nieuwe of andere pas krijgt het moment van koppelen, zonder pas valt het weg", () => {
  const { model, point } = createModel();
  assert.equal(model.addEmployee({ firstName: "Ilse", lastName: "de Wit", payrollCode: "1", personnelNumber: "9", employerNumber: "", companyId: point.companyId, pointId: point.id, badgeId: "" }), true);
  const withoutBadge = model.employees.at(-1);
  assert.equal("badgeLinkedAt" in withoutBadge, false);

  model.updateEmployee(withoutBadge.id, { ...withoutBadge, badgeId: "04AABBCC" });
  const linked = model.findEmployee(withoutBadge.id).badgeLinkedAt;
  assert.ok(Date.parse(linked) > 0);

  model.findEmployee(withoutBadge.id).badgeLinkedAt = "2026-01-01T00:00:00.000Z";
  model.updateEmployee(withoutBadge.id, { ...model.findEmployee(withoutBadge.id), firstName: "Ilse" });
  assert.equal(model.findEmployee(withoutBadge.id).badgeLinkedAt, "2026-01-01T00:00:00.000Z", "dezelfde pas houdt zijn datum");

  model.updateEmployee(withoutBadge.id, { ...model.findEmployee(withoutBadge.id), badgeId: "" });
  assert.equal("badgeLinkedAt" in model.findEmployee(withoutBadge.id), false);
});

test("pasjes: een ongeldige datum van koppelen maakt de medewerker ongeldig bij het laden", () => {
  const employee = { id: "mw-1", name: "Mark Jansen", firstName: "Mark", lastName: "Jansen", payrollCode: "", personnelNumber: "", employerNumber: "", companyId: null, pointId: null, active: true, color: "#d8f1e8", badgeId: "04A1B2C3" };
  const store = createDataStore({
    employees: [{ ...employee, badgeLinkedAt: "2026-11-20T09:15:00.000Z" }, { ...employee, id: "mw-2", badgeId: "04A1B2C4", badgeLinkedAt: "gisteren" }],
    registrations: [], products: [], companies: [], points: [], auditLog: []
  });

  assert.deepEqual(store.load().employees.map((item) => item.id), ["mw-1"]);
});

test("pasjes: alleen een ingelogde beheerder kan exporteren, en het logboek krijgt alleen het aantal", () => {
  const model = createBadgeModel();
  const view = createRecordingView();
  let downloads = 0;
  const app = new RegistrationApp(model, view, { downloadBadges: () => { downloads += 1; return 2; } });

  app.exportBadges();
  assert.equal(downloads, 0, "zonder beheerder is er gedownload");

  asAdmin(app);
  app.exportBadges();
  assert.equal(downloads, 1);
  const entry = model.auditLog.at(-1);
  assert.deepEqual([entry.action, entry.details], ["Pasjes geëxporteerd", "2 pasjes"]);
  assert.ok(!JSON.stringify(model.auditLog).includes("04A1B2C3"), "een pasnummer staat in het logboek");
});

test("pasjes: zonder gekoppelde pas zegt een melding dat", () => {
  const { model } = createModel();
  const view = createRecordingView();
  const app = asAdmin(new RegistrationApp(model, view, { downloadBadges: () => 0 }));

  app.exportBadges();

  assert.deepEqual(view.toasts, [{ message: "Er zijn nog geen pasjes gekoppeld.", tone: "error" }]);
  assert.deepEqual(model.auditLog, []);
});

test("pasjes: de knop 'Pasjes exporteren' staat in het tabblad Medewerkers van het beheer", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tab = html.match(/<div id="employeesTab"[\s\S]*?<div id="productsTab"/)?.[0] ?? "";

  assert.ok(tab.includes('id="exportBadgesButton"'));
  assert.ok(tab.includes("Pasjes exporteren"));
});
