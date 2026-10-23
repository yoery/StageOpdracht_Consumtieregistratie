// Tests voor de fouten uit de generale repetitie van de demo (oktober 2026, TO versie 3.19): de demo
// doorlopen zoals hij wordt gepresenteerd, op een laptop (1366×768 en 1920×1080) en een tablet
// (810×1080 en 1080×810), zonder camera en zonder pasjeslezer, via localhost en als los bestand.
//   1. Een pas die tegen de lezer wordt gehouden terwijl de focus in een ander tekstveld staat (het
//      e-mailadres bij het inloggen, een zoekveld in het beheer, de naam in het medewerkersformulier),
//      liet het pasnummer in dat veld staan, bijvoorbeeld "04A1B2C3admin@tvb.nl". Nu krijgt het veld
//      zijn oude inhoud terug, net als het zoekveld en het bedrijfsfilter op de beginpagina.
//   2. Startte de camera niet, dan stond er altijd "Geen toegang tot de camera. Geef toestemming in de
//      browser", ook op een laptop zonder camera of met een camera die al in een videogesprek zit.
//      Nu krijgt iedere reden een eigen melding.
//   3. In het tabblad Voorraad was op een tablet "Aantal" in het leveringsveld afgekapt ("Aanta").
//   4. Via Live Server stond er een foutmelding in de console omdat de browser om /favicon.ico vroeg.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { BadgeReader } from "../assets/js/BadgeReader.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { BadgeController } from "../assets/js/controllers/BadgeController.js";
import { FaceController } from "../assets/js/controllers/FaceController.js";
import { createModel, createRecordingView, createFakeElement, asAdmin, disabledFridge } from "./helpers.js";

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), "utf8");

// ------------------------------------------------------------------
// 1. Een pas in een ander tekstveld
// ------------------------------------------------------------------

const SETTINGS = { enabled: true, minLength: 6, maxKeyIntervalMs: 40, endDelayMs: 120 };

// Nep-klok voor de BadgeReader (zoals in tests/pasjeslezer.test.js).
const createClock = () => {
  const timers = new Map();
  let nextId = 1;
  const clock = {
    time: 0,
    now: () => clock.time,
    setTimeout: (action, delay) => {
      const id = nextId++;
      timers.set(id, { action, at: clock.time + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    advance: (ms) => {
      clock.time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock.time) {
          timers.delete(id);
          timer.action();
        }
      }
    }
  };
  return clock;
};

const keyEvent = (key) => {
  const event = { key, prevented: false, preventDefault() { event.prevented = true; }, stopPropagation() {} };
  return event;
};

// Controller met een pasjeslezer, een nep-document en een veld met de focus. `openModals` bepaalt
// welke vensters open staan (RegistrationApp.topModal).
const createApp = () => {
  const { model } = createModel();
  model.state.employees[0].badgeId = "04A1B2C3";
  const view = createRecordingView();
  const clock = createClock();
  const reader = new BadgeReader(SETTINGS, clock);
  const demo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  const app = asAdmin(new RegistrationApp(model, view, undefined, demo, reader, undefined, disabledFridge()));
  const openModals = [];
  globalThis.document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? openModals : [])
  };
  return { app, view, clock, openModals };
};

// Een tekstveld dat de input-events onthoudt die erop worden afgevuurd.
const createField = (props) => {
  const events = [];
  const field = createFakeElement({ tagName: "INPUT", type: "text", ...props, dispatchEvent: (event) => events.push(event.type) });
  field.events = events;
  return field;
};

// De lezer typt het pasnummer in het veld met de focus (de tekens komen ná de keydown in het veld,
// net als in de browser), gevolgd door Enter. `intervalMs` is de tijd tussen twee toetsen.
const typeInto = (app, clock, field, text, { intervalMs = 4, terminator = "Enter" } = {}) => {
  for (const character of text) {
    app.handleBadgeKey(keyEvent(character));
    field.value += character;
    clock.advance(intervalMs);
  }
  if (terminator) app.handleBadgeKey(keyEvent(terminator));
};

test("generale repetitie 1: een pas in het e-mailveld van het inloggen laat het e-mailadres staan", () => {
  const { app, view, clock, openModals } = createApp();
  openModals.push(view.$("#adminModal"));
  const email = createField({ id: "loginEmail", type: "email", value: "admin@tvb.nl" });
  globalThis.document.activeElement = email;

  typeInto(app, clock, email, "04A1B2C3");

  assert.equal(email.value, "admin@tvb.nl", "eerst stond hier 04A1B2C3admin@tvb.nl");
  assert.deepEqual(email.events, ["input"]);
  assert.deepEqual(view.toasts.map(({ message }) => message), [BadgeController.CLOSE_WINDOW_FIRST]);
  assert.equal(app.selectedEmployeeId, null);
});

test("generale repetitie 1: een pas in een zoekveld van het beheer of in de voornaam laat geen pasnummer achter", () => {
  for (const [id, before] of [["adminEmployeeSearch", "lot"], ["employeeManagementSearch", ""], ["newEmployeeFirstName", "Lotte"], ["loginPassword", "geheim"]]) {
    const { app, view, clock, openModals } = createApp();
    openModals.push(view.$("#adminModal"));
    const field = createField({ id, value: before, type: id === "loginPassword" ? "password" : "text" });
    globalThis.document.activeElement = field;

    typeInto(app, clock, field, "04A1B2C3");

    assert.equal(field.value, before, id);
    assert.deepEqual(field.events, ["input"], `${id}: de lijst wordt opnieuw getekend met de oude zoektekst`);
  }
});

test("generale repetitie 1: in het veld Pasnummer komt nog steeds het gescande nummer", () => {
  const { app, view, clock, openModals } = createApp();
  openModals.push(view.$("#employeeFormModal"));
  const badgeField = view.$("#newEmployeeBadgeId");
  badgeField.id = "newEmployeeBadgeId";
  badgeField.value = "OUDNUMMER";
  globalThis.document.activeElement = badgeField;

  typeInto(app, clock, badgeField, "04:aa:bb:cc");

  assert.equal(badgeField.value, "04AABBCC");
  assert.deepEqual(view.toasts, []);
});

test("generale repetitie 1: gewoon typen in een tekstveld blijft staan (dat is geen scan)", () => {
  const { app, view, clock, openModals } = createApp();
  openModals.push(view.$("#adminModal"));
  const email = createField({ id: "loginEmail", type: "email", value: "" });
  globalThis.document.activeElement = email;

  typeInto(app, clock, email, "beheer@tvb.nl", { intervalMs: 150, terminator: null });
  clock.advance(1000);

  assert.equal(email.value, "beheer@tvb.nl");
  assert.deepEqual(email.events, []);
  assert.deepEqual(view.toasts, []);
});

test("generale repetitie 1: welke velden worden na een scan teruggezet", () => {
  const field = (props) => createFakeElement({ tagName: "INPUT", type: "text", ...props });
  assert.equal(BadgeController.isOtherTextField(field({ id: "loginEmail", type: "email" })), true);
  assert.equal(BadgeController.isOtherTextField(field({ id: "", type: "number" })), true, "voorraadveld");
  assert.equal(BadgeController.isOtherTextField(field({ id: "x", tagName: "TEXTAREA", type: undefined })), true);
  // Het zoekveld en het bedrijfsfilter hebben hun eigen herstel, in Pasnummer hoort het nummer.
  for (const id of ["employeeSearch", "employeeCompanyFilter", "newEmployeeBadgeId"]) {
    assert.equal(BadgeController.isOtherTextField(field({ id })), false, id);
  }
  assert.equal(BadgeController.isOtherTextField(field({ id: "faceConsent", type: "checkbox" })), false);
  assert.equal(BadgeController.isOtherTextField(createFakeElement({ tagName: "BUTTON" })), false);
  assert.equal(BadgeController.isOtherTextField(null), false);
});

// ------------------------------------------------------------------
// 2. De melding als de camera niet start
// ------------------------------------------------------------------

test("generale repetitie 2: iedere reden waarom de camera niet start, heeft een eigen melding", () => {
  const error = (name) => new DOMException("test", name);
  assert.equal(FaceController.cameraErrorMessage(error("NotAllowedError")), "Geen toegang tot de camera. Geef toestemming in de browser, of kies je naam in de lijst.");
  assert.equal(FaceController.cameraErrorMessage(error("SecurityError")), FaceController.CAMERA_ERRORS.denied);
  assert.equal(FaceController.cameraErrorMessage(error("NotFoundError")), "Geen camera gevonden. Kies je naam in de lijst.");
  assert.equal(FaceController.cameraErrorMessage(error("OverconstrainedError")), FaceController.CAMERA_ERRORS.notFound);
  assert.equal(FaceController.cameraErrorMessage(error("NotReadableError")), "De camera wordt al door een ander programma gebruikt. Sluit dat programma, of kies je naam in de lijst.");
  assert.equal(FaceController.cameraErrorMessage(new Error("onbekend")), FaceController.CAMERA_ERRORS.denied);
  assert.equal(FaceController.cameraErrorMessage(undefined), FaceController.CAMERA_ERRORS.denied);
});

test("generale repetitie 2: zonder camera zegt het cameravenster 'Geen camera gevonden' en niet 'Geef toestemming'", async () => {
  for (const [name, expected] of [["NotFoundError", FaceController.CAMERA_ERRORS.notFound], ["NotReadableError", FaceController.CAMERA_ERRORS.inUse], ["NotAllowedError", FaceController.CAMERA_ERRORS.denied]]) {
    const { model } = createModel();
    const view = createRecordingView();
    let stopped = 0;
    const demo = {
      settings: { scanTimeoutMs: 1000, wakeScanMs: 1000 },
      load: async () => {},
      startCamera: async () => { throw new DOMException("test", name); },
      stopCamera: () => { stopped += 1; },
      isAvailable: () => true,
      isEnrolled: () => false,
      enrolledIds: () => []
    };
    const app = asAdmin(new RegistrationApp(model, view, undefined, demo, undefined, undefined, disabledFridge()));
    globalThis.document = { activeElement: null, querySelectorAll: () => [] };

    await app.openFaceModal("enroll", "employee-1");

    assert.equal(view.$("#faceStatus").textContent, expected, name);
    assert.equal(view.$("#faceStatus").dataset.tone, "error");
    assert.equal(app.cameraReady, false);
    assert.equal(stopped, 1, "de camera wordt uitgezet");
  }
});

// ------------------------------------------------------------------
// 3 en 4. Het leveringsveld op een tablet en het pictogram van het tabblad
// ------------------------------------------------------------------

test("generale repetitie 3: de velden in de voorraadtabel houden 8 pixels binnenruimte, ook in het beheervenster", () => {
  const css = read("../assets/css/styles.css");
  // .modal input (0,1,1) is sterker dan .stock-input (0,1,0). Daarom een regel met .stock-table ervoor.
  assert.match(css, /\.modal input,\.filter-row select,\.add-employee-form input \{[^}]*padding:0 12px/);
  assert.match(css, /\n\.stock-table \.stock-input \{\s*padding:0 8px\s*\}/);
  assert.ok(css.indexOf(".stock-table .stock-input {") > css.indexOf(".modal input,.filter-row select"), "de regel staat na .modal input");
});

test("generale repetitie 4: de pagina heeft een leeg pictogram, zodat de browser niet om /favicon.ico vraagt", () => {
  const html = read("../index.html");
  assert.match(html, /<link rel="icon" href="data:,">/);
  // Een data:-adres valt onder img-src 'self' data: van de CSP en laadt niets van buiten.
  assert.match(html, /img-src 'self' data: blob:/);
});
