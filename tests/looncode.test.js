// Tests voor de looncode in de export (versie 3.31, FR-94).
// De looncode komt niet uit AFAS: de beheerder vult hem per medewerker in. Een medewerker zonder
// looncode krijgt het label "Geen looncode" in het tabblad Medewerkers, en na een export waarin
// zo'n medewerker staat, zegt een melding hoeveel het er zijn. De namen en nummers zijn verzonnen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { CsvExport } from "../assets/js/CsvExport.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { AdminController } from "../assets/js/controllers/AdminController.js";
import { createModel, addEmployee, createRecordingView, registration, asAdmin, readAllCss } from "./helpers.js";

// Model met twee medewerkers en registraties in september en oktober 2026.
// employee-1 heeft twee registraties (september en oktober), employee-2 één (september).
const createExportModel = ({ first = "", second = "" } = {}) => {
  const { model, point } = createModel();
  model.state.employees[0].payrollCode = first;
  addEmployee(model, { name: "Anna Aalders", payrollCode: second, companyId: point.companyId, pointId: point.id });
  model.state.registrations = [
    registration("1", "employee-1", "blikje", "2026-09-10T12:00:00"),
    registration("2", "employee-1", "blikje", "2026-10-02T12:00:00"),
    registration("3", "employee-2", "boter", "2026-09-20T12:00:00")
  ];
  return model;
};

// Controller met een nep-export: download doet alsof het bestand is gemaakt (er is hier geen
// browser), het tellen van de looncodes is het echte.
const createApp = (model, { exported = true } = {}) => {
  const view = createRecordingView();
  const real = new CsvExport(model);
  const csvExport = {
    download: () => exported,
    countMissingPayrollCodes: (...filters) => real.countMissingPayrollCodes(...filters)
  };
  const app = asAdmin(new RegistrationApp(model, view, csvExport));
  view.$("#filterEmployee").value = "all";
  view.$("#filterMonth").value = "all";
  return { app, view };
};

// De medewerkerslijst van het beheer als HTML.
const renderEmployeeList = (model, query = "") => {
  const view = new RegistrationView(model);
  const list = { innerHTML: "" };
  view.$ = (selector) => (selector === "#employeeManagementSearch" ? { value: query } : list);
  view.renderAdminEmployees();
  return list.innerHTML;
};

// ------------------------------------------------------------------
// CsvExport: tellen wie er zonder looncode in de export staat
// ------------------------------------------------------------------

test("looncode: heeft iedereen een looncode, dan ontbreekt er niets", () => {
  const model = createExportModel({ first: "100", second: "101" });

  assert.equal(new CsvExport(model).countMissingPayrollCodes("all", "all"), 0);
});

test("looncode: een medewerker zonder looncode telt één keer, ook met registraties in twee maanden", () => {
  const model = createExportModel({ first: "", second: "101" });
  const csvExport = new CsvExport(model);

  assert.equal(csvExport.buildRows("all", "all").filter((row) => row.Looncode === "").length, 2, "twee regels zonder looncode");
  assert.equal(csvExport.countMissingPayrollCodes("all", "all"), 1, "maar het is één medewerker");
});

test("looncode: het tellen volgt de filters van de export", () => {
  const model = createExportModel({ first: "100", second: "" });
  const csvExport = new CsvExport(model);

  assert.equal(csvExport.countMissingPayrollCodes("all", "all"), 1);
  assert.equal(csvExport.countMissingPayrollCodes("employee-1", "all"), 0, "alleen de medewerker met looncode");
  assert.equal(csvExport.countMissingPayrollCodes("employee-2", "all"), 1);
  assert.equal(csvExport.countMissingPayrollCodes("all", "2026-10"), 0, "in oktober staat alleen employee-1");
  assert.equal(csvExport.countMissingPayrollCodes("all", "2026-09"), 1);
});

test("looncode: een medewerker zonder registraties telt niet mee, want hij staat niet in het bestand", () => {
  const model = createExportModel({ first: "100", second: "101" });
  addEmployee(model, { id: "employee-3", name: "Cor Claassen", payrollCode: "" });

  assert.equal(new CsvExport(model).countMissingPayrollCodes("all", "all"), 0);
});

test("looncode: alleen spaties is ook geen looncode, en een verwijderde medewerker telt mee", () => {
  const model = createExportModel({ first: "   ", second: "101" });
  model.state.registrations.push(registration("4", "bestaat-niet-meer", "blikje", "2026-09-21T12:00:00"));

  assert.equal(new CsvExport(model).countMissingPayrollCodes("all", "all"), 2);
});

test("looncode: de looncode van de medewerker komt in de kolom Looncode van het bestand", () => {
  const model = createExportModel({ first: "100", second: "" });
  const csvExport = new CsvExport(model);
  const csv = csvExport.toCsv(csvExport.buildRows("all", "2026-09"));

  assert.deepEqual(csv.split("\r\n").map((line) => line.split(";")[2]), ["Looncode", "", "100"]);
});

// ------------------------------------------------------------------
// AdminController: de melding na het exporteren
// ------------------------------------------------------------------

test("looncode: de melding noemt het aantal, in enkelvoud en meervoud", () => {
  assert.equal(
    AdminController.missingPayrollCodeMessage(1),
    "Het bestand is gemaakt, maar 1 medewerker heeft geen looncode. Vul die in bij Medewerkers en exporteer opnieuw."
  );
  assert.equal(
    AdminController.missingPayrollCodeMessage(12),
    "Het bestand is gemaakt, maar 12 medewerkers hebben geen looncode. Vul die in bij Medewerkers en exporteer opnieuw."
  );
});

test("looncode: na een export met een medewerker zonder looncode komt er een melding die 8 seconden blijft staan", () => {
  const { app, view } = createApp(createExportModel({ first: "", second: "" }));

  app.exportCsv();

  assert.deepEqual(view.toasts, [{
    message: AdminController.missingPayrollCodeMessage(2),
    tone: "error",
    duration: 8000
  }]);
});

test("looncode: de melding bevat geen naam en geen personeelsnummer", () => {
  const model = createExportModel({ first: "", second: "101" });
  model.state.employees[0].personnelNumber = "4411";
  const { app, view } = createApp(model);

  app.exportCsv();

  assert.equal(view.toasts.length, 1);
  assert.ok(!view.toasts[0].message.includes("Test Medewerker"));
  assert.ok(!view.toasts[0].message.includes("4411"));
});

test("looncode: heeft iedereen in de export een looncode, dan komt er geen melding", () => {
  const { app, view } = createApp(createExportModel({ first: "100", second: "101" }));

  app.exportCsv();

  assert.deepEqual(view.toasts, []);
});

test("looncode: de melding volgt de gekozen filters", () => {
  const { app, view } = createApp(createExportModel({ first: "100", second: "" }));

  view.$("#filterMonth").value = "2026-10";
  app.exportCsv();
  assert.deepEqual(view.toasts, [], "in oktober staat alleen de medewerker met looncode");

  view.$("#filterMonth").value = "2026-09";
  app.exportCsv();
  assert.equal(view.toasts.at(-1).message, AdminController.missingPayrollCodeMessage(1));
});

test("looncode: is er niets te exporteren, dan komt alleen die melding", () => {
  const { app, view } = createApp(createExportModel(), { exported: false });

  app.exportCsv();

  assert.deepEqual(view.toasts.map((toast) => toast.message), ["Geen registraties om te exporteren voor deze filters."]);
});

test("looncode: een export zonder de telling (alleen download) werkt nog", () => {
  const model = createExportModel();
  const view = createRecordingView();
  const app = asAdmin(new RegistrationApp(model, view, { download: () => true }));

  app.exportCsv();

  assert.deepEqual(view.toasts, []);
});

test("looncode: zonder ingelogde beheerder wordt er niets geteld en niets gemeld", () => {
  const { app, view } = createApp(createExportModel());
  app.adminLoggedIn = false;

  app.exportCsv();

  assert.ok(!view.toasts.some((toast) => toast.message.includes("looncode")));
});

// ------------------------------------------------------------------
// RegistrationView: het label in het tabblad Medewerkers
// ------------------------------------------------------------------

test("looncode: alleen de medewerker zonder looncode krijgt het label 'Geen looncode'", () => {
  const html = renderEmployeeList(createExportModel({ first: "100", second: "" }));

  assert.equal(html.match(/class="badge-missing">Geen looncode</g).length, 1);
  const [first, second] = html.split('<div class="admin-employee-item">').slice(1);
  assert.ok(first.includes("Test Medewerker") && !first.includes("badge-missing"));
  assert.ok(second.includes("Anna Aalders") && second.includes("badge-missing"));
});

test("looncode: het label staat er ook bij een inactieve medewerker en naast 'Pas gekoppeld'", () => {
  const model = createExportModel({ first: "", second: "101" });
  model.state.employees[0].active = false;
  model.state.employees[0].badgeId = "04A1B2C3";

  const html = renderEmployeeList(model, "test");

  assert.ok(html.includes('<span class="badge-linked">Pas gekoppeld</span> <span class="badge-missing">Geen looncode</span>'));
});

test("looncode: na het invullen van de looncode verdwijnt het label", () => {
  const model = createExportModel({ first: "", second: "101" });
  assert.ok(renderEmployeeList(model).includes("badge-missing"));

  model.updateEmployee("employee-1", { ...model.findEmployee("employee-1"), payrollCode: "100" });

  assert.ok(!renderEmployeeList(model).includes("badge-missing"));
  assert.equal(new CsvExport(model).countMissingPayrollCodes("all", "all"), 0);
});

test("looncode: het label heeft de vorm van 'Pas gekoppeld' en de kleuren van een waarschuwing", () => {
  const css = readAllCss();

  assert.match(css, /\.admin-employee-item \.badge-linked,\s*\.admin-employee-item \.badge-missing \{[^}]*border-radius:999px/);
  const own = css.match(/\.admin-employee-item \.badge-missing \{([^}]*)\}/g).at(-1);
  assert.ok(own.includes("background:var(--warning-bg)") && own.includes("color:var(--warning-text)"), own);
  assert.ok(
    css.lastIndexOf(".admin-employee-item .badge-missing {") > css.indexOf(".admin-employee-item .badge-linked,"),
    "de kleuren van de waarschuwing staan na de gedeelde vorm, anders winnen de groene kleuren"
  );
});

test("looncode: het formulier vraagt nog steeds om een looncode", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.ok(html.match(/<input id="newEmployeePayrollCode"[^>]*>/)[0].includes("required"));
});
