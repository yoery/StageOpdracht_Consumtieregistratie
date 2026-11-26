// Tests voor registreren als gast (FR-98): het formulier, het model, de opslag, de weergave en de
// export. Een gast is iemand van buiten TVB die niet in AFAS staat. De namen en telefoonnummers zijn
// verzonnen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { CsvExport } from "../assets/js/CsvExport.js";
import { GuestController } from "../assets/js/controllers/GuestController.js";
import { createModel, createRecordingView, createFakeElement, createDataStore, registration, asAdmin, addEmployee } from "./helpers.js";

const GUEST = { firstName: "Ilse", lastName: "de Wit", phone: "06 12345678" };

// Controller met een nep-view. Het productvenster wordt niet echt geopend, alleen onthouden.
const createApp = () => {
  const { model } = createModel();
  const view = createRecordingView();
  const app = new RegistrationApp(model, view);
  app.opened = [];
  app.openEmployeeProducts = (id) => app.opened.push(id);
  return { app, model, view };
};

const fillGuestForm = (view, { firstName = GUEST.firstName, lastName = GUEST.lastName, phone = GUEST.phone } = {}) => {
  view.$("#guestFirstName").value = firstName;
  view.$("#guestLastName").value = lastName;
  view.$("#guestPhone").value = phone;
};

const submit = () => ({ preventDefault() {} });

// ------------------------------------------------------------------
// Telefoonnummer
// ------------------------------------------------------------------

test("gast: een telefoonnummer heeft 8 tot 15 cijfers en alleen cijfers, spaties, +, - en haakjes", () => {
  for (const valid of ["0612345678", "06 12345678", "+31 6 12345678", "(010) 123-4567", "0031612345678"]) {
    assert.equal(GuestController.isValidPhone(valid), true, valid);
  }
  for (const invalid of ["", "1234567", "06-1234", "bel mij", "06 1234 5678 9999 12", "06123456781234567", "=1+1 12345678", null]) {
    assert.equal(GuestController.isValidPhone(invalid), false, String(invalid));
  }
});

// ------------------------------------------------------------------
// Model en opslag
// ------------------------------------------------------------------

test("gast: het model maakt een gast zonder looncode, personeelsnummer, bedrijf en pas", () => {
  const { model } = createModel();
  const id = model.addGuest(GUEST);
  const guest = model.findEmployee(id);

  assert.deepEqual(
    [guest.name, guest.guest, guest.phone, guest.payrollCode, guest.personnelNumber, guest.companyId, guest.pointId, guest.badgeId, guest.active],
    ["Ilse de Wit", true, "06 12345678", "", "", null, null, "", true]
  );
});

test("gast: dezelfde naam en hetzelfde telefoonnummer geven dezelfde gast, ook met andere spaties of hoofdletters", () => {
  const { model } = createModel();
  const first = model.addGuest(GUEST);

  assert.equal(model.addGuest({ firstName: "ilse", lastName: "De Wit", phone: "0612345678" }), first);
  assert.notEqual(model.addGuest({ ...GUEST, phone: "06 87654321" }), first, "een ander telefoonnummer is een andere gast");
  model.findEmployee(first).active = false;
  assert.notEqual(model.addGuest(GUEST), first, "een inactieve gast wordt niet opnieuw gebruikt");
});

test("gast: een gast blijft na opslaan en laden een gast, en een kapotte gast wordt overgeslagen", () => {
  const store = createDataStore({
    employees: [
      { id: "gast-1", name: "Ilse de Wit", firstName: "Ilse", lastName: "de Wit", payrollCode: "", personnelNumber: "", employerNumber: "", companyId: null, pointId: null, active: true, color: "#d8f1e8", badgeId: "", guest: true, phone: "06 12345678" },
      { id: "gast-2", name: "Kapot", firstName: "Kapot", lastName: "", payrollCode: "", personnelNumber: "", employerNumber: "", companyId: null, pointId: null, active: true, color: "#d8f1e8", badgeId: "", guest: "ja" },
      { id: "gast-3", name: "Te lang", firstName: "Te", lastName: "lang", payrollCode: "", personnelNumber: "", employerNumber: "", companyId: null, pointId: null, active: true, color: "#d8f1e8", badgeId: "", guest: true, phone: "0".repeat(40) }
    ],
    registrations: [], products: [], companies: [], points: [], auditLog: []
  });
  const data = store.load();

  assert.deepEqual(data.employees.map((employee) => [employee.id, employee.guest, employee.phone]), [["gast-1", true, "06 12345678"]]);
  assert.equal(store.loadProblem, "skipped");
});

// ------------------------------------------------------------------
// Het formulier
// ------------------------------------------------------------------

test("gast: na opslaan komt de gast in de gegevens en opent zijn productvenster, het telefoonnummer staat niet in het logboek", () => {
  const { app, model, view } = createApp();
  app.openGuestForm();
  fillGuestForm(view);

  app.saveGuest(submit());

  const guest = model.employees.find((employee) => employee.guest);
  assert.equal(guest.name, "Ilse de Wit");
  assert.deepEqual(app.opened, [guest.id]);
  const entry = model.auditLog.at(-1);
  assert.deepEqual([entry.action, entry.details], ["Gast geregistreerd", "Ilse de Wit"]);
  assert.ok(!JSON.stringify(model.auditLog).includes("12345678"));
  assert.equal(view.$("#employeeSearch").value, "");
});

test("gast: zonder naam of met een ongeldig telefoonnummer wordt er niets opgeslagen", () => {
  const { app, model, view } = createApp();
  const before = model.employees.length;

  // Lege verplichte velden: de controle van het formulier vindt ze.
  const first = createFakeElement({ id: "guestFirstName", value: "" });
  view.$("#guestForm").querySelectorAll = (selector) => (selector === "[required]" ? [first] : []);
  app.saveGuest(submit());
  assert.equal(model.employees.length, before);
  assert.equal(view.fieldErrors[0].message, "Vul dit veld in.");

  // Een ongeldig telefoonnummer.
  view.$("#guestForm").querySelectorAll = () => [];
  fillGuestForm(view, { phone: "bel mij" });
  app.saveGuest(submit());
  assert.equal(model.employees.length, before);
  assert.equal(view.fieldErrors.at(-1).message, "Vul een telefoonnummer in, bijvoorbeeld 06 12345678.");
  assert.deepEqual(app.opened, []);
});

test("gast: dezelfde gast twee keer registreren geeft geen tweede gast", () => {
  const { app, model, view } = createApp();
  fillGuestForm(view);
  app.saveGuest(submit());
  fillGuestForm(view, { phone: "0612345678" });
  app.saveGuest(submit());

  assert.equal(model.employees.filter((employee) => employee.guest).length, 1);
  assert.equal(app.opened[0], app.opened[1]);
});

// ------------------------------------------------------------------
// Weergave
// ------------------------------------------------------------------

test("gast: op de beginpagina staat een gast in de groep 'Gasten'", () => {
  const { model } = createModel();
  model.state.employees[0].name = "Lotte van Dijk";
  model.addGuest(GUEST);
  const view = new RegistrationView(model);
  const elements = new Map();
  view.$ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createFakeElement({ innerHTML: "" }));
    return elements.get(selector);
  };
  view.$("#employeeCompanyFilter").dataset.value = "all";

  view.renderEmployees();

  const html = view.$("#employeeList").innerHTML;
  assert.ok(/<h3>Gasten<\/h3>[\s\S]*Ilse de Wit/.test(html), html);
  assert.ok(!html.includes("12345678"), "het telefoonnummer staat op de beginpagina");
});

test("gast: in het beheer heeft een gast het label 'Gast' en zijn telefoonnummer, en geen 'Wijzigen' of 'Geen looncode'", () => {
  const { model } = createModel();
  model.state.employees = [];
  model.addGuest(GUEST);
  const view = new RegistrationView(model);
  const list = { innerHTML: "" };
  view.$ = (selector) => (selector === "#employeeManagementSearch" ? { value: "" } : list);

  view.renderAdminEmployees();

  assert.ok(list.innerHTML.includes('<span class="badge-linked">Gast</span>'));
  assert.ok(list.innerHTML.includes("tel. 06 12345678"));
  assert.ok(!list.innerHTML.includes("Geen looncode"));
  assert.ok(!list.innerHTML.includes("data-edit-employee"));
  assert.ok(list.innerHTML.includes("data-toggle-employee"), "deactiveren kan wel");
});

// ------------------------------------------------------------------
// Export
// ------------------------------------------------------------------

const exportModel = () => {
  const { model, point } = createModel();
  model.state.employees[0].payrollCode = "101";
  const guestId = model.addGuest(GUEST);
  model.state.registrations = [
    registration("r1", "employee-1", "blikje", "2026-11-10T12:00:00"),
    registration("r2", guestId, "blikje", "2026-11-11T12:00:00"),
    registration("r3", guestId, "blikje", "2026-10-11T12:00:00")
  ];
  return { model, point, guestId };
};

test("gast: een gast staat niet in het bestand voor de loonadministratie en telt niet als 'geen looncode'", () => {
  const { model, guestId } = exportModel();
  const csvExport = new CsvExport(model);

  assert.deepEqual(csvExport.buildRows("all", "all").map((row) => row.Naam), ["Test Medewerker"]);
  assert.equal(csvExport.countMissingPayrollCodes("all", "all"), 0);
  assert.equal(csvExport.countGuests("all", "all"), 1);
  assert.equal(csvExport.countGuests("all", "2026-10"), 1);
  assert.equal(csvExport.countGuests("employee-1", "all"), 0);
  assert.deepEqual(csvExport.buildRows(guestId, "all"), []);
});

test("gast: na het exporteren zegt een melding dat de gasten niet in het bestand staan", () => {
  const { model } = exportModel();
  const view = createRecordingView();
  const real = new CsvExport(model);
  const app = asAdmin(new RegistrationApp(model, view, {
    download: (...filters) => real.buildRows(...filters).length > 0,
    countGuests: (...filters) => real.countGuests(...filters),
    countMissingPayrollCodes: (...filters) => real.countMissingPayrollCodes(...filters)
  }));
  view.$("#filterEmployee").value = "all";
  view.$("#filterMonth").value = "all";

  app.exportCsv();
  assert.deepEqual(view.toasts.at(-1), {
    message: "1 gast staat niet in het bestand. Hun naam en telefoonnummer staan in het tabblad Medewerkers.",
    tone: "info",
    duration: 8000
  });

  // Alleen registraties van gasten (oktober): er is niets voor de loonadministratie.
  view.$("#filterMonth").value = "2026-10";
  app.exportCsv();
  assert.equal(view.toasts.at(-1).message, "Er zijn voor deze filters alleen registraties van gasten. Gasten staan niet in het bestand voor de loonadministratie.");
  assert.equal(view.toasts.at(-1).tone, "error");
});

test("gast: zonder looncode en met een gast komen beide meldingen samen", () => {
  const { model } = exportModel();
  model.state.employees[0].payrollCode = "";
  addEmployee(model);
  const view = createRecordingView();
  const real = new CsvExport(model);
  const app = asAdmin(new RegistrationApp(model, view, {
    download: () => true,
    countGuests: (...filters) => real.countGuests(...filters),
    countMissingPayrollCodes: (...filters) => real.countMissingPayrollCodes(...filters)
  }));
  view.$("#filterEmployee").value = "all";
  view.$("#filterMonth").value = "all";

  app.exportCsv();
  assert.equal(view.toasts.at(-1).message,
    "Het bestand is gemaakt, maar 1 medewerker heeft geen looncode. Vul die in bij Medewerkers en exporteer opnieuw. 1 gast staat niet in het bestand. Hun naam en telefoonnummer staan in het tabblad Medewerkers.");
  assert.equal(view.toasts.at(-1).tone, "error");
});

// ------------------------------------------------------------------
// De pagina
// ------------------------------------------------------------------

test("gast: index.html heeft het gastformulier en de knop 'Ik ben een gast' bij 'Typ je naam' en bij 'Geen medewerker gevonden'", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const modal = html.match(/<div class="modal-backdrop hidden" id="guestModal"[\s\S]*?<\/form>/)?.[0] ?? "";

  for (const field of ['id="guestFirstName"', 'id="guestLastName"', 'id="guestPhone" type="tel"']) assert.ok(modal.includes(field), field);
  assert.ok(modal.includes("Je telefoonnummer ziet alleen de beheerder."));
  for (const id of ["searchPrompt", "emptyState"]) {
    const block = html.match(new RegExp(`<div class="empty-state hidden" id="${id}">[\\s\\S]*?</div>`))?.[0] ?? "";
    assert.ok(block.includes("data-open-guest>Ik ben een gast</button>"), id);
  }
});
