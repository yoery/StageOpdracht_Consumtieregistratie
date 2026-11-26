// Tests voor "Snellere optie instellen" (FR-100, besluit van de administratie van 25 november 2026,
// punt 3 tot en met 7): na zichzelf opzoeken een gezicht, een pas of allebei instellen, of het een jaar
// afwijzen. Alleen met een server. De namen en pasnummers zijn verzonnen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { QuickSetupController } from "../assets/js/controllers/QuickSetupController.js";
import { AutoScanController } from "../assets/js/controllers/AutoScanController.js";
import { createModel, addEmployee, createRecordingView } from "./helpers.js";

const DESCRIPTOR = Array(128).fill(0.125);

// Een controller met een nep-view, een nep-camera en een nep-pasjeslezer. Met `server: false` werkt hij
// als de demo.
const createApp = ({ server = true, camera = true, badgeReader = true } = {}) => {
  const { model, point } = createModel();
  model.state.employees[0].name = "Lotte van Dijk";
  const view = createRecordingView();
  const faceDemo = { isAvailable: () => true, mayHaveCamera: () => camera, isEnrolled: () => false, enroll() {}, forget() {}, settings: { validityDays: 365 } };
  const reader = { isEnabled: () => badgeReader, handleKey() {} };
  const app = new RegistrationApp(model, view, undefined, faceDemo, reader);
  app.server = server ? { role: "device" } : null;
  app.faceStarts = [];
  app.startQuickFaceEnrollment = (employeeId, continuation) => { app.faceStarts.push({ employeeId, continuation }); return true; };
  app.renderProductWindow = () => {};
  app.selectedEmployeeId = "employee-1";
  return { app, model, view, point };
};

// ------------------------------------------------------------------
// Wat kan er?
// ------------------------------------------------------------------

test("snellere optie: met een server, een camera en een pasjeslezer kan iemand zonder gezicht en pas allebei instellen", () => {
  const { app } = createApp();
  assert.deepEqual(app.quickSetupOptions("employee-1"), { face: true, badge: true });
  assert.equal(app.quickSetupState("employee-1"), "offer");
});

test("snellere optie: in de demo (zonder server) is er geen snellere optie", () => {
  const { app } = createApp({ server: false });
  assert.deepEqual(app.quickSetupOptions("employee-1"), { face: false, badge: false });
  assert.equal(app.quickSetupState("employee-1"), null);
});

test("snellere optie: wie al een pas heeft, kan alleen een gezicht instellen, en zonder lezer is er geen pas", () => {
  const { app, model } = createApp();
  model.state.employees[0].badgeId = "04A1B2C3";
  assert.deepEqual(app.quickSetupOptions("employee-1"), { face: true, badge: false });

  const withoutReader = createApp({ badgeReader: false });
  assert.deepEqual(withoutReader.app.quickSetupOptions("employee-1"), { face: true, badge: false });

  const withoutCamera = createApp({ camera: false });
  assert.deepEqual(withoutCamera.app.quickSetupOptions("employee-1"), { face: false, badge: true });
});

test("snellere optie: wie al een geldig gezicht heeft, kan alleen een pas koppelen", () => {
  const { app, model } = createApp();
  model.saveFaceEnrollment("employee-1", DESCRIPTOR);
  assert.deepEqual(app.quickSetupOptions("employee-1"), { face: false, badge: true });
});

test("snellere optie: een gast of een inactieve medewerker krijgt de vraag niet", () => {
  const { app, model } = createApp();
  const guestId = model.addGuest({ firstName: "Ilse", lastName: "de Wit", phone: "06 12345678" });
  addEmployee(model, { active: false });

  assert.equal(app.quickSetupState(guestId), null);
  assert.equal(app.quickSetupState("employee-2"), null);
});

test("snellere optie: na 'Nee, liever niet' komt de vraag een jaar niet, daarna wel", () => {
  const { app, model, view } = createApp();

  app.declineQuickSetup();

  assert.equal(app.quickSetupState("employee-1"), null);
  const entry = model.auditLog.at(-1);
  assert.deepEqual([entry.action, entry.details], ["Snellere optie afgewezen", "Lotte van Dijk"]);
  assert.equal(view.toasts.at(-1).message, "Prima. We vragen het over een jaar opnieuw.");

  const answeredAt = Date.parse(model.faceOffers[0].answeredAt);
  assert.equal(model.declinedQuickSetup("employee-1", new Date(answeredAt + 364 * 86400000)), true);
  assert.equal(model.declinedQuickSetup("employee-1", new Date(answeredAt + 366 * 86400000)), false);
  assert.equal(app.quickSetupState("employee-1", new Date(answeredAt + 366 * 86400000)), "offer");
});

test("snellere optie: is het gezicht na een jaar verlopen, dan zegt de vraag dat", () => {
  const { app, model } = createApp();
  model.setFaceOfferAnswer("employee-1", "expired");
  assert.equal(app.quickSetupState("employee-1"), "expired");
});

// ------------------------------------------------------------------
// Kiezen
// ------------------------------------------------------------------

test("snellere optie: het keuzevenster toont alleen wat kan", () => {
  const { app, model, view } = createApp();
  model.state.employees[0].badgeId = "04A1B2C3";

  assert.equal(app.openQuickSetup(), true);
  assert.equal(view.$("#quickSetupName").textContent, "Lotte van Dijk");
  assert.equal(view.$("#quickSetupFace").classList.contains("hidden"), false);
  assert.equal(view.$("#quickSetupBadge").classList.contains("hidden"), true);
  assert.equal(view.$("#quickSetupBoth").classList.contains("hidden"), true);
  assert.equal(app.quickSetupEmployeeId, "employee-1");
});

test("snellere optie: 'Gezichtsherkenning' opent het cameravenster, 'Allebei' koppelt daarna de pas", () => {
  const { app } = createApp();

  app.openQuickSetup();
  app.chooseQuickSetup("face");
  assert.deepEqual(app.faceStarts.map(({ employeeId, continuation }) => [employeeId, continuation]), [["employee-1", null]]);

  app.openQuickSetup();
  app.chooseQuickSetup("both");
  const { continuation } = app.faceStarts.at(-1);
  assert.equal(typeof continuation, "function");
  continuation();
  assert.equal(app.badgeLinkEmployeeId, "employee-1");
});

test("snellere optie: 'Pasje' koppelt de volgende scan aan de medewerker, zonder het pasnummer in het logboek", () => {
  const { app, model, view } = createApp();
  app.openQuickSetup();
  app.chooseQuickSetup("badge");
  assert.equal(view.$("#badgeLinkName").textContent, "Lotte van Dijk");

  // De scan komt binnen zoals bij de echte lezer (BadgeController.recognizeBadge).
  app.recognizeBadge("04A1B2C3");

  const employee = model.findEmployee("employee-1");
  assert.equal(employee.badgeId, "04A1B2C3");
  assert.ok(Date.parse(employee.badgeLinkedAt) > 0);
  assert.equal(app.badgeLinkEmployeeId, null);
  const entry = model.auditLog.at(-1);
  assert.deepEqual([entry.action, entry.details], ["Pas gekoppeld door medewerker", "Lotte van Dijk"]);
  assert.ok(!JSON.stringify(model.auditLog).includes("04A1B2C3"));
  assert.equal(view.toasts.at(-1).message, "Je pas is gekoppeld. Voortaan houd je je pas tegen de lezer.");
});

test("snellere optie: een pas die al bij iemand anders hoort, wordt niet gekoppeld", () => {
  const { app, model, view } = createApp();
  addEmployee(model, { name: "Mark Jansen", badgeId: "04A1B2C3" });
  app.startBadgeLink("employee-1");

  assert.equal(app.linkScannedBadge("04A1B2C3"), true);

  assert.ok(!model.findEmployee("employee-1").badgeId, "de pas is toch gekoppeld");
  assert.equal(view.$("#badgeLinkStatus").textContent, "Deze pas is al gekoppeld aan iemand anders. Vraag het de beheerder.");
  assert.equal(app.badgeLinkEmployeeId, "employee-1", "het venster blijft open voor een andere pas");
});

test("snellere optie: zonder open venster herkent een scan gewoon iemand en koppelt hij niets", () => {
  const { app } = createApp();
  assert.equal(app.linkScannedBadge("04A1B2C3"), false);
});

// ------------------------------------------------------------------
// Teksten
// ------------------------------------------------------------------

test("snellere optie: in het productvenster staat de vraag met 'Snellere optie instellen' en 'Nee, liever niet'", () => {
  const view = new RegistrationView(createModel().model);

  const offer = view.faceAreaHtml({ server: true, quickSetup: "offer", available: true });
  assert.ok(offer.includes("Sneller registreren? Stel gezichtsherkenning of je pasje in."));
  assert.ok(offer.includes("data-quick-setup>Snellere optie instellen</button>"));
  assert.ok(offer.includes("data-quick-setup-decline>Nee, liever niet</button>"));
  assert.ok(view.faceAreaHtml({ server: true, quickSetup: "expired", available: true }).includes("Je gezichtsherkenning is na een jaar verlopen."));

  // Met een server staat er zonder vraag niets, ook niet de oude uitleg van de demo.
  assert.equal(view.faceAreaHtml({ server: true, quickSetup: null, available: true, camera: true }), "");
  assert.ok(!view.faceAreaHtml({ server: true, available: true, recognized: true, enrolled: true }).includes("(demo)"));
});

test("snellere optie: niet herkend op het startscherm zegt met een server 'Zoek jezelf eerst op'", () => {
  assert.equal(AutoScanController.MESSAGES.notRecognizedSetup, "Zoek jezelf eerst op via de knop hieronder en stel een snellere optie in.");
});

test("snellere optie: het cameravenster voor een snellere optie kan alleen met een server", () => {
  const { model } = createModel();
  const view = createRecordingView();
  const app = new RegistrationApp(model, view);

  assert.equal(app.startQuickFaceEnrollment("employee-1"), false);
  assert.ok(view.toasts.at(-1).message.startsWith("Gezichtsherkenning instellen kan alleen"));
});

test("snellere optie: index.html heeft het keuzevenster en 'Houd je pas tegen de lezer'", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  for (const part of ['id="quickSetupModal"', 'data-quick-choice="face"', 'data-quick-choice="badge"', 'data-quick-choice="both"', 'id="badgeLinkModal"', "Houd je pas tegen de lezer", 'id="badgeLinkStatus"']) {
    assert.ok(html.includes(part), part);
  }
  assert.equal(QuickSetupController.DECLINE_DAYS, 365);
});
