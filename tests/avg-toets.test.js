// Tests voor de aanpassingen uit de AVG-toets (versie 3.10 van het TO):
//   - de beheerder wordt automatisch uitgelogd als het beheer 5 minuten niet is gebruikt
//     (FR-68, AdminController.logoutIfIdle), getest met een nep-klok;
//   - de korte uitleg in het productvenster over de inhouding op het loon (FR-69).
// De regel dat "welkom terug" en "Zelfde als vorige keer" alleen na herkenning met de pas of de
// camera verschijnen (FR-49, FR-50), staat in welkom-en-gezichtsherkenning.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { AdminController } from "../assets/js/controllers/AdminController.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { ADMIN_IDLE_LOGOUT_MS } from "../assets/js/config.js";
import { createModel, createRecordingView, readAllCss } from "./helpers.js";

const MINUTE = 60 * 1000;

// Nep-klok: de tijd staat stil tot de test hem verzet. setInterval onthoudt alleen de actie,
// zodat de test zelf bepaalt wanneer de controle draait.
const createClock = () => {
  const clock = {
    time: 1_000_000,
    intervals: [],
    cleared: [],
    now: () => clock.time,
    setInterval(action, delay) {
      clock.intervals.push({ action, delay });
      return clock.intervals.length;
    },
    clearInterval(timer) {
      clock.cleared.push(timer);
    }
  };
  return clock;
};

// Controller met een nep-view, een uitgezette demo gezichtsherkenning en een nep-klok.
const createApp = () => {
  const { model } = createModel();
  const view = createRecordingView();
  const clock = createClock();
  const app = new RegistrationApp(model, view, undefined, new FaceRecognitionDemo({ enabled: false }, null), undefined, clock);
  return { app, model, view, clock };
};

// Logt in via het loginformulier (demo: ieder ingevuld wachtwoord werkt).
const login = (app, view) => {
  view.$("#loginEmail").value = "admin@tvb.nl";
  view.$("#loginPassword").value = "geheim";
  app.openAdmin();
  app.login({ preventDefault() {} });
};

// ------------------------------------------------------------------
// Automatisch uitloggen (FR-68)
// ------------------------------------------------------------------

test("automatisch uitloggen: de standaardtijd in config.js is 5 minuten", () => {
  assert.equal(ADMIN_IDLE_LOGOUT_MS, 5 * MINUTE);
  const { app } = createApp();
  assert.equal(app.idleLogoutMs, 5 * MINUTE);
  assert.equal(app.idleLogoutMessage(), "Je bent automatisch uitgelogd omdat het beheer 5 minuten niet is gebruikt.");
});

test("automatisch uitloggen: bij 1 minuut staat er 'minuut' in de melding", () => {
  const { model } = createModel();
  const admin = new AdminController({ model, view: createRecordingView() }, createClock(), MINUTE);
  assert.equal(admin.idleLogoutMessage(), "Je bent automatisch uitgelogd omdat het beheer 1 minuut niet is gebruikt.");
});

test("automatisch uitloggen: na 5 minuten zonder invoer is de beheerder uitgelogd en het venster dicht", () => {
  const { app, view, clock } = createApp();
  login(app, view);
  assert.equal(app.adminLoggedIn, true);
  assert.equal(app.lastAdminActivity, clock.time);

  // Net onder de 5 minuten: nog ingelogd.
  clock.time += 5 * MINUTE - 1;
  assert.equal(app.logoutIfIdle(), false);
  assert.equal(app.adminLoggedIn, true);

  // Precies 5 minuten: uitgelogd, venster en dashboard dicht, wachtwoord leeg en een melding.
  clock.time += 1;
  assert.equal(app.logoutIfIdle(), true);
  assert.equal(app.adminLoggedIn, false);
  assert.equal(view.$("#adminModal").classList.contains("hidden"), true);
  assert.equal(view.$("#adminView").classList.contains("hidden"), true);
  assert.equal(view.$("#loginPassword").value, "");
  assert.equal(app.lastAdminActivity, null);
  assert.deepEqual(view.toasts.at(-1), {
    message: "Je bent automatisch uitgelogd omdat het beheer 5 minuten niet is gebruikt.",
    duration: 8000
  });

  // Bij opnieuw openen staat het loginformulier er weer.
  app.openAdmin();
  assert.equal(view.$("#loginView").classList.contains("hidden"), false);
});

test("automatisch uitloggen: iedere invoer begint de 5 minuten opnieuw", () => {
  const { app, view, clock } = createApp();
  login(app, view);

  clock.time += 4 * MINUTE;
  app.noteAdminActivity();
  clock.time += 4 * MINUTE; // 8 minuten na inloggen, maar 4 na de laatste invoer
  assert.equal(app.logoutIfIdle(), false);
  assert.equal(app.adminLoggedIn, true);

  clock.time += MINUTE;
  assert.equal(app.logoutIfIdle(), true);
  assert.equal(app.adminLoggedIn, false);
});

test("automatisch uitloggen: zonder ingelogde beheerder telt invoer niet en gebeurt er niets", () => {
  const { app, view, clock } = createApp();

  app.noteAdminActivity();
  assert.equal(app.lastAdminActivity, null);

  clock.time += 60 * MINUTE;
  assert.equal(app.logoutIfIdle(), false);
  assert.equal(view.toasts.length, 0);
});

test("automatisch uitloggen: open beheerformulieren en het venster 'Registratie verwijderen' gaan dicht", () => {
  const { app, view, clock } = createApp();
  login(app, view);
  view.$("#employeeFormModal").classList.remove("hidden");
  view.$("#pointFormModal").classList.remove("hidden");
  view.$("#productFormModal").classList.add("hidden");
  view.$("#companyFormModal").classList.add("hidden");
  view.$("#removeRegistrationModal").classList.remove("hidden");
  app.removalTarget = { employeeId: "employee-1", productId: "blikje" };

  clock.time += 5 * MINUTE;
  app.logoutIfIdle();

  for (const selector of ["#employeeFormModal", "#pointFormModal", "#productFormModal", "#companyFormModal", "#removeRegistrationModal", "#adminModal"]) {
    assert.equal(view.$(selector).classList.contains("hidden"), true, `${selector} is niet dicht`);
  }
  assert.equal(app.removalTarget, null);
  assert.equal(app.adminLoggedIn, false);
});

test("automatisch uitloggen: na uitloggen of sluiten telt de oude tijd niet meer mee", () => {
  const { app, view, clock } = createApp();
  login(app, view);
  app.logout();
  assert.equal(app.lastAdminActivity, null);

  login(app, view);
  app.closeAdmin();
  assert.equal(app.lastAdminActivity, null);

  // Opnieuw inloggen begint een nieuwe periode van 5 minuten.
  clock.time += 10 * MINUTE;
  login(app, view);
  clock.time += 4 * MINUTE;
  assert.equal(app.logoutIfIdle(), false);
});

test("automatisch uitloggen: zonder bekend tijdstip van invoer begint de tijd bij de eerste controle", () => {
  const { app, clock } = createApp();
  app.adminLoggedIn = true; // ingelogd zonder het loginformulier, zoals asAdmin in andere tests

  assert.equal(app.logoutIfIdle(), false);
  assert.equal(app.lastAdminActivity, clock.time);
  clock.time += 5 * MINUTE;
  assert.equal(app.logoutIfIdle(), true);
});

test("automatisch uitloggen: de timer controleert iedere 10 seconden en start maar één keer", () => {
  const { app, view, clock } = createApp();
  app.startIdleWatch();
  app.startIdleWatch();
  assert.equal(clock.intervals.length, 1);
  assert.equal(clock.intervals[0].delay, 10 * 1000);

  // De actie van de timer is logoutIfIdle met de tijd van de klok.
  login(app, view);
  clock.time += 5 * MINUTE;
  clock.intervals[0].action();
  assert.equal(app.adminLoggedIn, false);

  app.stopIdleWatch();
  assert.deepEqual(clock.cleared, [1]);
  assert.equal(app.idleTimer, null);
});

test("automatisch uitloggen: muis, toets, aanraking en scroll tellen als invoer", () => {
  const { app, view, clock } = createApp();
  const listeners = [];
  globalThis.document = {
    querySelectorAll: () => [],
    addEventListener: (type, listener, options) => listeners.push({ type, listener, options })
  };
  app.registerAdminEvents();

  const activityTypes = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"];
  const activity = listeners.filter(({ type }) => activityTypes.includes(type));
  assert.deepEqual(activity.map(({ type }) => type), activityTypes);
  assert.ok(activity.every(({ options }) => options?.capture === true));

  login(app, view);
  for (const { listener } of activity) {
    clock.time += MINUTE;
    listener({});
    assert.equal(app.lastAdminActivity, clock.time);
  }
});

test("automatisch uitloggen: de echte klok gebruikt Date.now", () => {
  const clock = AdminController.realClock();
  const before = Date.now();
  assert.ok(clock.now() >= before);
  assert.equal(typeof clock.setInterval, "function");
  assert.equal(typeof clock.clearInterval, "function");
});

// ------------------------------------------------------------------
// Uitleg in het productvenster (FR-69)
// ------------------------------------------------------------------

test("productvenster: korte uitleg over de inhouding op het loon, zonder link", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const modal = html.slice(html.indexOf('id="employeeProductsModal"'), html.indexOf('id="employeeFormModal"'));

  const note = modal.match(/<p class="muted privacy-note" id="employeePrivacyNote">([^<]*)<\/p>/);
  assert.ok(note, "de uitleg staat niet in het productvenster");
  assert.equal(note[1], "Wat je registreert, wordt maandelijks ingehouden op je loon. Meer informatie staat in de privacyverklaring voor medewerkers.");
  assert.equal(note[1].includes(";"), false);
});

test("productvenster: de uitleg gebruikt de bestaande kleur voor uitlegtekst (--muted)", () => {
  const css = readAllCss();

  assert.match(css, /\.muted,\.login-hint \{\s*color:var\(--muted\)/);
  assert.match(css, /\.privacy-note \{[^}]*border-top:1px solid var\(--line\)/);
});
