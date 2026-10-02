// Tests voor het werkgevernummer per registratie en de datum bij een correctie "+".
//   - Het werkgevernummer wordt bij iedere registratie bewaard, zodat een oude loonmaand in de
//     CSV-export hetzelfde blijft als de medewerker of het bedrijf later verandert.
//   - Bij een correctie "+" kan de beheerder een eerdere datum kiezen; valt die in een eerdere
//     maand, dan vraagt de app eerst om bevestiging.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { CsvExport } from "../assets/js/csvExport.js";
import { createModel, createDataStore, createRecordingView, registration } from "./helpers.js";

// Controller met het testmodel (employee-1 op Hoofdkantoor van TVB) en een nep-view.
const createApp = () => {
  globalThis.document = { activeElement: null, querySelectorAll: () => [] };
  const { model, point } = createModel();
  const view = createRecordingView();
  const app = new RegistrationApp(model, view, undefined, new FaceRecognitionDemo({ enabled: false }, null));
  return { app, model, view, point };
};

// Het bedrijf van employee-1 met een werkgevernummer.
const companyOf = (model) => {
  const company = model.findCompany(model.findEmployee("employee-1").companyId);
  company.employerNumber = "W-100";
  return company;
};

// Een vast "nu": 2 oktober 2026, 10:00 uur lokale tijd.
const NOW = new Date(2026, 9, 2, 10, 0, 0);

// ------------------------------------------------------------------
// Werkgevernummer per registratie
// ------------------------------------------------------------------

test("een registratie bewaart het werkgevernummer van dat moment", () => {
  const { model } = createModel();
  companyOf(model);

  model.addRegistration("employee-1", "blikje");

  assert.equal(model.registrations[0].employerNumber, "W-100");
});

test("verandert het nummer van het bedrijf later, dan houdt een oude maand in de export het oude nummer", () => {
  const { model } = createModel();
  const company = companyOf(model);
  model.addRegistration("employee-1", "blikje");

  company.employerNumber = "W-200";

  assert.equal(new CsvExport(model).buildRows("all", "all")[0].Werkgevernummer, "W-100");
});

test("gaat een medewerker binnen een maand naar een ander nummer, dan komen er twee exportregels", () => {
  const { model } = createModel();
  const company = companyOf(model);
  model.addRegistration("employee-1", "blikje");
  company.employerNumber = "W-200";
  model.addRegistration("employee-1", "blikje");

  const rows = new CsvExport(model).buildRows("all", "all");

  assert.deepEqual(rows.map((row) => [row.Werkgevernummer, row.Totaal]).sort(), [["W-100", 1], ["W-200", 1]]);
});

test("een oude registratie zonder werkgevernummer gebruikt het huidige nummer", () => {
  const { model } = createModel();
  companyOf(model);
  model.state.registrations = [registration("r1", "employee-1", "blikje", "2026-09-10T10:00:00.000Z")];

  assert.equal(model.registrationEmployerNumber(model.registrations[0]), "W-100");
  assert.equal(new CsvExport(model).buildRows("all", "all")[0].Werkgevernummer, "W-100");
});

test("was er bij het registreren nog geen nummer, dan wordt niets bewaard en telt later het ingevulde nummer", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");
  assert.equal("employerNumber" in model.registrations[0], false);

  companyOf(model); // nu pas ingevuld

  assert.equal(new CsvExport(model).buildRows("all", "all")[0].Werkgevernummer, "W-100");
});

test("een afwijkend werkgevernummer bij de medewerker wordt ook per registratie bewaard", () => {
  const { model } = createModel();
  companyOf(model);
  model.findEmployee("employee-1").employerNumber = "TEAM-7";

  model.addRegistration("employee-1", "blikje");

  assert.equal(model.registrations[0].employerNumber, "TEAM-7");
});

test("bij het laden blijft een geldig werkgevernummer bewaard en wordt een ongeldig nummer overgeslagen", () => {
  const base = { id: "r1", employeeId: "e1", productId: "blikje", pointId: null, createdAt: "2026-09-10T10:00:00.000Z" };
  const store = createDataStore({ employees: [], registrations: [], products: [], companies: [], points: [] });

  assert.equal(store.isValidRegistration({ ...base, employerNumber: "W-100" }), true);
  assert.equal(store.isValidRegistration({ ...base }), true); // oude registratie zonder nummer
  assert.equal(store.isValidRegistration({ ...base, employerNumber: 100 }), false);
  assert.equal(store.isValidRegistration({ ...base, employerNumber: "x".repeat(65) }), false);
});

// ------------------------------------------------------------------
// Registratie met een eerdere datum (model)
// ------------------------------------------------------------------

test("een registratie met een eerdere datum krijgt die datum", () => {
  const { model } = createModel();
  const earlier = new Date(2026, 8, 14, 12);

  model.addRegistration("employee-1", "blikje", { correction: true, createdAt: earlier });

  assert.equal(model.registrations[0].createdAt, earlier.toISOString());
  assert.equal(model.registrations[0].correction, true);
});

test("een registratie van vóór de laatste telling verandert de voorraad niet, ook niet bij terugdraaien", () => {
  const { model, point } = createModel();
  model.setStock(point.id, "blikje", 10); // telling: nu

  model.addRegistration("employee-1", "blikje", { correction: true, createdAt: new Date(2020, 0, 1, 12) });
  assert.equal(model.findPoint(point.id).products.blikje.stock, 10);

  model.removeLastRegistration("employee-1", "blikje");
  assert.equal(model.findPoint(point.id).products.blikje.stock, 10);
});

test("een registratie van na de laatste telling gaat wel van de voorraad af", () => {
  const { model, point } = createModel();
  model.setStock(point.id, "blikje", 10);

  model.addRegistration("employee-1", "blikje");

  assert.equal(model.findPoint(point.id).products.blikje.stock, 9);
});

// ------------------------------------------------------------------
// Correctie "+" met een datum (controller)
// ------------------------------------------------------------------

test("correctie '+' zonder gekozen datum gebruikt nu en vraagt niets", () => {
  const { app, model, view } = createApp();
  let asked = false;
  globalThis.window = { confirm: () => { asked = true; return true; } };
  view.$("#correctionDate").value = "";

  assert.equal(app.addCorrection("employee-1", "blikje", NOW), true);

  assert.equal(asked, false);
  assert.equal(model.registrations[0].createdAt, NOW.toISOString());
});

test("correctie '+' met de datum van vandaag gebruikt het tijdstip van nu", () => {
  const { app, model, view } = createApp();
  globalThis.window = { confirm: () => assert.fail("geen vraag verwacht") };
  view.$("#correctionDate").value = "2026-10-02";

  app.addCorrection("employee-1", "blikje", NOW);

  assert.equal(model.registrations[0].createdAt, NOW.toISOString());
});

test("correctie '+' op een eerdere dag in dezelfde maand: 12:00 uur, zonder vraag, datum in logboek en melding", () => {
  const { app, model, view } = createApp();
  globalThis.window = { confirm: () => assert.fail("geen vraag verwacht") };
  view.$("#correctionDate").value = "2026-10-01";

  app.addCorrection("employee-1", "blikje", NOW);

  assert.equal(model.registrations[0].createdAt, new Date(2026, 9, 1, 12).toISOString());
  assert.ok(model.auditLog.at(-1).details.endsWith("op 1 oktober 2026"));
  assert.ok(view.toasts.at(-1).message.endsWith("op 1 oktober 2026"));
});

test("correctie '+' in een vorige maand vraagt eerst om bevestiging en voegt toe na OK", () => {
  const { app, model, view } = createApp();
  const questions = [];
  globalThis.window = { confirm: (question) => { questions.push(question); return true; } };
  view.$("#correctionDate").value = "2026-09-14";

  assert.equal(app.addCorrection("employee-1", "blikje", NOW), true);

  assert.equal(questions.length, 1);
  assert.ok(questions[0].includes("september 2026"));
  assert.equal(model.monthKey(new Date(model.registrations[0].createdAt)), "2026-09");
  // De export zet een consumptie van september in de loonmaand oktober.
  assert.equal(new CsvExport(model).buildRows("all", "all")[0].Maand, 10);
});

test("correctie '+' in een vorige maand: bij Annuleren verandert er niets", () => {
  const { app, model, view } = createApp();
  globalThis.window = { confirm: () => false };
  view.$("#correctionDate").value = "2026-09-14";

  assert.equal(app.addCorrection("employee-1", "blikje", NOW), false);

  assert.equal(model.registrations.length, 0);
  assert.equal(model.auditLog.length, 0);
});

test("correctie '+' met een datum in de toekomst, een niet-bestaande datum of van vóór 2000 wordt geweigerd", () => {
  for (const value of ["2026-10-03", "2026-02-31", "1999-12-31", "kapot"]) {
    const { app, model, view } = createApp();
    globalThis.window = { confirm: () => true };
    view.$("#correctionDate").value = value;

    assert.equal(app.addCorrection("employee-1", "blikje", NOW), false, value);

    assert.equal(model.registrations.length, 0, value);
    assert.equal(view.fieldErrors.at(-1).field, view.$("#correctionDate"), value);
    assert.equal(view.$("#correctionDate").focused, true, value);
  }
});

test("het dashboard zet het datumveld op vandaag, met vandaag als laatste datum", () => {
  const { app, view } = createApp();
  view.$("#correctionDate").value = "2026-01-01";

  app.resetCorrectionDate(NOW);

  assert.equal(view.$("#correctionDate").value, "2026-10-02");
  assert.equal(view.$("#correctionDate").max, "2026-10-02");
});

test("na middernacht schuift de laatste datum van het datumveld mee", () => {
  const { app, view } = createApp();
  app.currentDay = NOW.toDateString();

  app.refreshIfNewDay(new Date(2026, 9, 3, 0, 1));

  assert.equal(view.$("#correctionDate").max, "2026-10-03");
});

test("index.html heeft een datumveld voor de correctie '+'", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<input type="date" id="correctionDate">/);
});
