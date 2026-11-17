// Tests voor versie 3.17: de standby van de tablet, tik om te scannen, wat er opent na herkennen
// (koelkast of productvenster), de vraag "Gezichtsherkenning nog niet ingesteld. Wil je dit?" na een
// passcan, het jaarlijks verlopen van een gezichtsinstelling en het opslaan, controleren en wissen van
// de gezichtskenmerken. Met een nep-klok, een nep-camera (mediaDevices) en zonder face-api: het laden
// en het lezen van een gezicht worden nagebootst.
// Sinds versie 3.21 is de standby het startscherm (zie tests/startscherm.test.js). De tests in dit bestand
// gaan over tik om te scannen en draaien daarom met FACE_DEMO.scanMode "tap": zo werkt het nog zoals vroeger.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { DataStore } from "../assets/js/DataStore.js";
import { CsvExport } from "../assets/js/CsvExport.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { BadgeReader } from "../assets/js/BadgeReader.js";
import { SmartFridge } from "../assets/js/fridge/SmartFridge.js";
import { StandbyController } from "../assets/js/controllers/StandbyController.js";
import { RecognitionController } from "../assets/js/controllers/RecognitionController.js";
import { FaceController } from "../assets/js/controllers/FaceController.js";
import { SMART_FRIDGE, STANDBY, FACE_DEMO, RECOGNITION_TARGET } from "../assets/js/config.js";
import { createModel, addEmployee, createRecordingView, createFakeElement, createStore, fakeLocalStorage, asAdmin } from "./helpers.js";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 21, 8, 0);

// Een "gezicht" van 128 getallen, allemaal met dezelfde waarde.
const face = (value) => new Array(128).fill(value);

// Nep-klok: de tijd gaat alleen vooruit met advance(); timers lopen dan af. Er blijft niets open
// staan dat Node na de test laat wachten.
const createClock = (start = START) => {
  const timers = new Map();
  let nextId = 1;
  const clock = {
    time: start,
    now: () => clock.time,
    setInterval: (action, delay) => {
      const id = nextId++;
      timers.set(id, { action, at: clock.time + delay, every: delay });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    setTimeout: (action, delay) => {
      const id = nextId++;
      timers.set(id, { action, at: clock.time + delay, once: true });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    advance: (ms) => {
      const end = clock.time + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        clock.time = timer.at;
        if (timer.once) timers.delete(id);
        else timer.at += timer.every;
        timer.action();
      }
      clock.time = end;
    }
  };
  return clock;
};

// Nep-camera: telt hoe vaak de camera aangaat en hoe vaak een spoor weer wordt uitgezet.
const createCamera = ({ hasCamera = true } = {}) => {
  const camera = { starts: 0, stops: 0, on: false };
  camera.mediaDevices = {
    getUserMedia: async () => {
      camera.starts += 1;
      camera.on = true;
      return { getTracks: () => [{ stop: () => { camera.stops += 1; camera.on = false; } }] };
    },
    enumerateDevices: async () => (hasCamera ? [{ kind: "videoinput" }] : [{ kind: "audioinput" }])
  };
  return camera;
};

// De echte FaceRecognitionDemo met de nep-camera. Laden is direct klaar en readFace geeft het
// "gezicht" terug dat de test kiest (of null: geen gezicht in beeld).
const createDemo = (camera, { settings = {}, seen = () => null } = {}) => {
  const demo = new FaceRecognitionDemo({ ...FACE_DEMO, scanTimeoutMs: 60, wakeScanMs: 60, scanMode: "tap", ...settings }, camera.mediaDevices);
  demo.load = async () => {};
  demo.readFace = async () => seen();
  demo.confirm = (employeeId) => employeeId; // direct bevestigd, zodat de test niet hoeft te wachten
  return demo;
};

// De vensters in de volgorde van index.html (het laatste open venster ligt bovenaan).
const MODALS = ["#adminModal", "#employeeProductsModal", "#fridgeModal", "#faceOfferModal", "#faceModal"];

// Controller met een nep-view, nep-klok, nep-camera en een nagebootste koelkast. employee-1 (Test
// Medewerker) heeft pas 04A1B2C3 en hoort bij het demo-consumptiepunt met de standaardindeling.
const createApp = ({ model = createModel().model, hasCamera = true, faceSettings = {}, seen, fridge = true, target = RECOGNITION_TARGET, standby = STANDBY } = {}) => {
  model.state.employees[0].badgeId = "04A1B2C3";
  const view = createRecordingView();
  for (const selector of MODALS) view.$(selector).classList.add("hidden");
  view.$("#faceVideo").play = async () => {};
  view.$("#startScreen").classList.add("hidden");
  const clock = createClock();
  const camera = createCamera({ hasCamera });
  const demo = createDemo(camera, { settings: faceSettings, seen });
  const reader = new BadgeReader({ enabled: true, minLength: 4, maxKeyIntervalMs: 40, endDelayMs: 120 }, { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} });
  const smartFridge = SmartFridge.createSimulated({ ...SMART_FRIDGE, enabled: fridge, weightVariation: 0 }, { clock });
  const app = new RegistrationApp(model, view, new CsvExport(model), demo, reader, clock, smartFridge);
  app.recognition.recognitionTargetSetting = target;
  app.standby.standbySettings = standby;
  globalThis.document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? MODALS.map((modal) => view.$(modal)).filter((element) => !element.classList.contains("hidden")) : [])
  };
  return { app, model, view, clock, camera, demo };
};

const isOpen = (view, selector) => !view.$(selector).classList.contains("hidden");
const standbyCalls = (view) => view.calls.filter(([name]) => name === "showStartScreen").map(([, shown]) => shown);
const toastTexts = (view) => view.toasts.map(({ message }) => message);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Een actieve medewerker met een opgeslagen gezicht, in het geheugen gezet zoals bij het starten.
const enrollInModel = (app, model, employeeId = "employee-1", value = 0.1) => {
  model.saveFaceEnrollment(employeeId, face(value));
  app.loadSavedFaces();
};

// ------------------------------------------------------------------
// Standby
// ------------------------------------------------------------------

test("startscherm: pas na STANDBY.idleMs zonder invoer op de beginpagina komt het startscherm terug", () => {
  const { app, view, clock } = createApp();
  app.startStandbyWatch();

  clock.advance(STANDBY.idleMs - 1000);
  assert.equal(app.standbyActive, false);
  clock.advance(1000);

  assert.equal(app.standbyActive, true);
  assert.deepEqual(standbyCalls(view), [true]);
  app.stopStandbyWatch();
});

test("standby: iedere invoer begint de tijd opnieuw", () => {
  const { app, clock } = createApp();
  app.startStandbyWatch();

  clock.advance(STANDBY.idleMs - 5000);
  app.noteStandbyActivity();
  clock.advance(STANDBY.idleMs - 5000);

  assert.equal(app.standbyActive, false);
  app.stopStandbyWatch();
});

test("standby: niet met een open venster of een open productvenster", () => {
  const { app, view, clock } = createApp();
  app.startStandbyWatch();
  view.$("#fridgeModal").classList.remove("hidden");
  clock.advance(STANDBY.idleMs * 3);
  assert.equal(app.standbyActive, false);

  view.$("#fridgeModal").classList.add("hidden");
  app.selectedEmployeeId = "employee-1";
  clock.advance(STANDBY.idleMs * 3);
  assert.equal(app.standbyActive, false);

  // Na het sluiten telt de tijd vanaf dat moment.
  app.selectedEmployeeId = null;
  clock.advance(STANDBY.idleMs - 2000);
  assert.equal(app.standbyActive, false);
  clock.advance(3000);
  assert.equal(app.standbyActive, true);
  app.stopStandbyWatch();
});

test("standby: met STANDBY.enabled = false gaat de tablet nooit in standby", () => {
  const { app, clock } = createApp({ standby: { enabled: false, idleMs: 1000 } });
  app.startStandbyWatch();
  clock.advance(60 * 60 * 1000);
  assert.equal(app.standbyActive, false);
  app.stopStandbyWatch();
});

test("standby: het zoekveld wordt leeggemaakt als het startscherm verschijnt", () => {
  const { app, view } = createApp();
  view.$("#employeeSearch").value = "Lot";

  app.enterStandby();

  assert.equal(view.$("#employeeSearch").value, "");
});

test("startscherm: Handmatig zoeken verbergt het startscherm en gaat niet door naar de pagina (geen klik-door)", () => {
  const { app, view, clock } = createApp();
  app.enterStandby();
  let stopped = false;
  let prevented = false;

  app.handleManualSearch({ detail: 1, preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });

  assert.equal(app.standbyActive, false);
  assert.deepEqual(standbyCalls(view), [true, false]);
  assert.equal(prevented && stopped, true);

  // Een klik die de browser vlak daarna naar een knop onder het standby-scherm stuurt, telt niet.
  const ghost = { target: createFakeElement({ id: "fridgeOpenButton" }), stopped: false, preventDefault() {}, stopPropagation() { this.stopped = true; } };
  assert.equal(app.swallowStandbyGhostClick(ghost), true);
  assert.equal(ghost.stopped, true);

  // Na een halve seconde werkt klikken weer gewoon.
  clock.advance(StandbyController.GHOST_CLICK_MS);
  assert.equal(app.swallowStandbyGhostClick({ target: createFakeElement({ id: "fridgeOpenButton" }), preventDefault() {}, stopPropagation() {} }), false);
});

test("startscherm (tap): een tik op het ovaal doet niets zolang niemand een gezicht heeft ingesteld", () => {
  const { app, camera } = createApp();
  app.enterStandby();

  assert.equal(app.handleStandbyTap({}), false);

  assert.equal(app.standbyActive, true);
  assert.equal(app.faceMode, null);
  assert.equal(camera.starts, 0);
});

test("standby: een passcan op het startscherm wordt meteen verwerkt en het startscherm verdwijnt", () => {
  const { app, view, camera } = createApp({ target: "products" });
  app.enterStandby();

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.standbyActive, false);
  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.recognizedBy, "badge");
  assert.equal(camera.starts, 0);
  assert.equal(isOpen(view, "#faceModal"), false);
});

test("startscherm (tap): de tekst zegt vooraf dat de camera na de tik hooguit 10 seconden kijkt", () => {
  const { app, model } = createApp({ faceSettings: { wakeScanMs: 10000 } });
  const before = app.startScreenTexts();
  assert.equal(before.mode, "badge");
  assert.equal(before.status, "Houd je pas tegen de lezer");
  assert.equal(before.hint, "Gezichtsherkenning stel je in na een passcan of via de beheerder.");

  enrollInModel(app, model);
  const after = app.startScreenTexts();
  assert.equal(after.mode, "tap");
  assert.equal(after.status, "Tik op het ovaal om je gezicht te laten scannen");
  assert.equal(after.hint, "Of houd je pas tegen de lezer.");
  assert.equal(after.privacy, "Na de tik kijkt de camera hooguit 10 seconden. Alles blijft op deze tablet.");
  assert.equal(after.help, "Startscherm. Begin zo: houd je pas tegen de lezer, tik op het ovaal om herkend te worden met de camera of kies Handmatig zoeken om je naam in de lijst te zoeken.");
});

// ------------------------------------------------------------------
// Tik om te scannen: de camera alleen na een tik, en daarna altijd weer uit
// ------------------------------------------------------------------

test("camera: gaat nooit vanzelf aan, ook niet in standby of bij het wakker worden zonder tik", async () => {
  const { app, model, clock, camera } = createApp();
  enrollInModel(app, model);
  app.startStandbyWatch();

  clock.advance(STANDBY.idleMs * 5);
  assert.equal(app.standbyActive, true);
  app.handleManualSearch({ detail: 1 });
  clock.advance(STANDBY.idleMs * 5);
  await wait(20);

  assert.equal(camera.starts, 0);
  app.stopStandbyWatch();
});

test("camera: gaat aan na een tik op het standby-scherm en na de scantijd weer uit (niet herkend)", async () => {
  const { app, view, model, camera } = createApp({ seen: () => null });
  enrollInModel(app, model);
  app.enterStandby();

  app.handleStandbyTap({ preventDefault() {}, stopPropagation() {} });
  await wait(10);
  assert.equal(camera.starts, 1, "de camera staat aan na de tik");
  assert.equal(app.faceMode, "wake");
  assert.equal(view.$("#faceTitle").textContent, "Even kijken wie je bent");
  assert.equal(view.$("#faceModal .employee-form-actions [data-close-face-modal]").textContent, "Stoppen");

  await wait(200);
  assert.equal(camera.on, false, "na de scantijd staat de camera uit");
  assert.equal(camera.stops, 1);
  assert.equal(isOpen(view, "#faceModal"), false, "het scanvenster is dicht");
  assert.deepEqual(toastTexts(view), [FaceController.WAKE_MESSAGES.notRecognized]);
  assert.equal(app.selectedEmployeeId, null);
  assert.equal(app.fridgePhase, "closed");
});

test("camera: Stoppen zet de camera meteen uit", async () => {
  const { app, model, camera } = createApp({ faceSettings: { wakeScanMs: 5000 }, seen: () => null });
  enrollInModel(app, model);
  app.enterStandby();
  app.handleStandbyTap({ preventDefault() {}, stopPropagation() {} });
  await wait(10);

  app.closeFaceModal();
  await wait(450);

  assert.equal(camera.on, false);
  assert.equal(camera.starts, 1);
});

test("tik om te scannen: geen scan zonder demo, zonder camera of zonder actief ingesteld gezicht", async () => {
  const noFaces = createApp();
  noFaces.app.enterStandby();
  noFaces.app.handleStandbyTap({});
  assert.equal(noFaces.app.faceMode, null);

  const noCamera = createApp({ hasCamera: false });
  enrollInModel(noCamera.app, noCamera.model);
  await noCamera.demo.detectCamera();
  assert.equal(noCamera.app.startWakeScan(), false);

  const disabled = createApp({ faceSettings: { enabled: false } });
  enrollInModel(disabled.app, disabled.model);
  assert.equal(disabled.app.startWakeScan(), false);

  const inactive = createApp();
  enrollInModel(inactive.app, inactive.model);
  inactive.model.state.employees[0] = { ...inactive.model.employees[0], active: false };
  assert.equal(inactive.app.startWakeScan(), false);

  for (const { camera } of [noFaces, noCamera, disabled, inactive]) assert.equal(camera.starts, 0);
});

test("tik om te scannen: herkend opent de koelkast met de begroeting en zet de camera uit", async () => {
  const { app, view, model, camera } = createApp({ seen: () => face(0.1) });
  enrollInModel(app, model);
  app.enterStandby();

  app.handleStandbyTap({});
  await wait(30);

  assert.equal(app.fridgePhase, "open");
  assert.equal(app.fridgeEmployeeId, "employee-1");
  assert.equal(app.fridgeRecognizedBy, "face");
  const lastWindow = view.calls.filter(([name]) => name === "renderFridgeWindow").at(-1)[1];
  assert.equal(lastWindow.recognizedBy, "face");
  assert.equal(camera.on, false);
  assert.equal(isOpen(view, "#faceModal"), false);
  app.finishFridgeWindow();
});

test("tik om te scannen: met RECOGNITION_TARGET 'products' opent het productvenster", async () => {
  const { app, model } = createApp({ seen: () => face(0.1), target: "products" });
  enrollInModel(app, model);
  app.enterStandby();

  app.handleStandbyTap({});
  await wait(30);

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.recognizedBy, "face");
  assert.equal(app.fridgePhase, "closed");
});

test("tik om te scannen: zonder schapindeling op het consumptiepunt opent het productvenster", async () => {
  const { app, model } = createApp({ seen: () => face(0.1) });
  model.saveFridgeShelves(model.points[0].id, [{ shelf: 1, productId: null }, { shelf: 2, productId: null }, { shelf: 3, productId: null }]);
  enrollInModel(app, model);
  app.enterStandby();

  app.handleStandbyTap({});
  await wait(30);

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.fridgePhase, "closed");
});

test("tik om te scannen: een gezicht van een inactieve collega telt niet (allowedIds)", async () => {
  const { model } = createModel();
  addEmployee(model, { id: "employee-2", pointId: model.points[0].id, companyId: model.points[0].companyId });
  const { app } = createApp({ model, seen: () => face(0.1), target: "products" });
  enrollInModel(app, model, "employee-2", 0.1);
  enrollInModel(app, model, "employee-1", 0.12);
  model.state.employees[1] = { ...model.employees[1], active: false };
  app.enterStandby();

  app.handleStandbyTap({});
  await wait(30);

  assert.equal(app.selectedEmployeeId, "employee-1");
});

// ------------------------------------------------------------------
// Na een passcan: koelkast of productvenster, en de vraag over gezichtsherkenning
// ------------------------------------------------------------------

test("pas: opent de koelkast voor de medewerker met 'Je bent herkend met je pas.'", async () => {
  const { app, view, demo } = createApp({ hasCamera: false });
  await demo.detectCamera();

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.fridgePhase, "open");
  assert.equal(app.fridgeRecognizedBy, "badge");
  assert.equal(isOpen(view, "#faceOfferModal"), false, "zonder camera geen vraag");
  app.finishFridgeWindow();
});

test("pas: de knop in de open koelkast opent in plaats daarvan het productvenster", async () => {
  const { app, model, demo } = createApp({ hasCamera: false });
  await demo.detectCamera();
  app.recognizeBadge("04A1B2C3");

  assert.equal(app.switchFridgeToProducts(), true);

  assert.equal(app.fridgePhase, "closed");
  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.recognizedBy, "badge");
  assert.equal(model.registrations.length, 0);
});

test("pas: met iets in de hand opent de knop het productvenster niet", async () => {
  const { app, demo } = createApp({ hasCamera: false });
  await demo.detectCamera();
  app.recognizeBadge("04A1B2C3");
  app.takeFromShelf(1);

  assert.equal(app.switchFridgeToProducts(), false);
  assert.equal(app.fridgePhase, "open");
  app.finishFridgeWindow();
});

test("vraag: na een passcan zonder gezichtsinstelling, met camera", async () => {
  const { app, view, demo } = createApp();
  await demo.detectCamera();

  app.recognizeBadge("04A1B2C3");

  assert.equal(isOpen(view, "#faceOfferModal"), true);
  assert.equal(view.$("#faceOfferTitle").textContent, "Gezichtsherkenning nog niet ingesteld. Wil je dit?");
  assert.equal(view.$("#faceOfferHelp").textContent, RecognitionController.OFFER_HELP);
  assert.equal(view.$("#faceOfferNoButton").focused, true);
  assert.equal(app.fridgePhase, "closed", "de koelkast opent pas na het antwoord");
});

test("vraag: Nee wordt onthouden en daarna gaat de koelkast open. De volgende keer komt de vraag niet", async () => {
  const { app, view, model, demo } = createApp();
  await demo.detectCamera();
  app.recognizeBadge("04A1B2C3");

  app.declineFaceOffer();

  assert.equal(isOpen(view, "#faceOfferModal"), false);
  assert.equal(model.faceOfferAnswer("employee-1"), "declined");
  assert.equal(app.fridgePhase, "open");
  assert.equal(model.auditLog.length, 0, "Nee komt niet in het logboek");
  app.finishFridgeWindow();

  app.recognizeBadge("04A1B2C3");
  assert.equal(isOpen(view, "#faceOfferModal"), false);
  assert.equal(app.fridgePhase, "open");
  app.finishFridgeWindow();
});

test("vraag: kruisje of Escape onthoudt niets, de flow gaat wel verder", async () => {
  const { app, view, model, demo } = createApp({ target: "products" });
  await demo.detectCamera();
  app.recognizeBadge("04A1B2C3");

  app.dismissFaceOffer();

  assert.equal(model.faceOfferAnswer("employee-1"), null);
  assert.equal(app.selectedEmployeeId, "employee-1");
  app.closeEmployeeProducts();
  app.recognizeBadge("04A1B2C3");
  assert.equal(isOpen(view, "#faceOfferModal"), true);
});

test("vraag: Ja opent het instelvenster met het vinkje. Na vastleggen opgeslagen en daarna de koelkast", async () => {
  const { app, view, model, demo, camera } = createApp({ seen: () => face(0.2) });
  await demo.detectCamera();
  app.recognizeBadge("04A1B2C3");

  app.acceptFaceOffer();
  await wait(10);
  assert.equal(app.faceMode, "enroll");
  assert.equal(app.faceEmployeeId, "employee-1");
  assert.equal(isOpen(view, "#faceConsentLabel"), true);
  assert.equal(camera.starts, 1);

  view.$("#faceConsent").checked = true;
  await app.captureEnrollment();

  assert.equal(model.hasValidFaceEnrollment("employee-1"), true);
  assert.equal(model.faceEnrollment("employee-1").descriptor.length, 128);
  assert.equal(demo.isEnrolled("employee-1"), true);
  assert.equal(camera.on, false);
  assert.equal(app.fridgePhase, "open", "na het instellen gaat de koelkast open");
  assert.deepEqual(model.auditLog.map(({ action, details }) => [action, details]), [["Gezichtsherkenning ingesteld", "Test Medewerker"]]);
  app.finishFridgeWindow();

  // De volgende passcan: geen vraag meer.
  app.recognizeBadge("04A1B2C3");
  assert.equal(isOpen(view, "#faceOfferModal"), false);
  app.finishFridgeWindow();
});

test("vraag: Ja en dan Annuleren in het instelvenster: niets opgeslagen, de koelkast gaat toch open", async () => {
  const { app, model, demo, camera } = createApp();
  await demo.detectCamera();
  app.recognizeBadge("04A1B2C3");
  app.acceptFaceOffer();
  await wait(10);

  app.closeFaceModal();

  assert.equal(model.faceEnrollments.length, 0);
  assert.equal(camera.on, false);
  assert.equal(app.fridgePhase, "open");
  app.finishFridgeWindow();
});

test("vraag: niet als de demo uit staat, als er geen camera is of als offerAfterBadge uit staat", async () => {
  for (const options of [{ faceSettings: { enabled: false } }, { hasCamera: false }, { faceSettings: { offerAfterBadge: false } }]) {
    const { app, view, demo } = createApp({ ...options, target: "products" });
    await demo.detectCamera();
    app.recognizeBadge("04A1B2C3");
    assert.equal(isOpen(view, "#faceOfferModal"), false, JSON.stringify(options));
    assert.equal(app.selectedEmployeeId, "employee-1");
  }
});

test("vraag: zonder antwoord sluit de vraag na offerIdleCloseMs, zonder iets te onthouden of te openen", async () => {
  const { app, view, model, clock, demo } = createApp();
  await demo.detectCamera();
  app.startStandbyWatch();
  app.recognizeBadge("04A1B2C3");

  clock.advance(FACE_DEMO.offerIdleCloseMs - 1000);
  assert.equal(isOpen(view, "#faceOfferModal"), true);
  clock.advance(1000);

  assert.equal(isOpen(view, "#faceOfferModal"), false);
  assert.equal(model.faceOfferAnswer("employee-1"), null);
  assert.equal(app.fridgePhase, "closed");
  app.stopStandbyWatch();
});

test("vraag: met een geldige gezichtsinstelling komt de vraag niet", async () => {
  const { app, view, model, demo } = createApp();
  await demo.detectCamera();
  enrollInModel(app, model);

  app.recognizeBadge("04A1B2C3");

  assert.equal(isOpen(view, "#faceOfferModal"), false);
  assert.equal(app.fridgePhase, "open");
  app.finishFridgeWindow();
});

// ------------------------------------------------------------------
// Jaarlijks opnieuw: verlopen na FACE_DEMO.validityDays
// ------------------------------------------------------------------

test("verlopen: geldig tot 365 dagen na het instellen, daarna verlopen", () => {
  const { model } = createModel();
  model.saveFaceEnrollment("employee-1", face(0.1), new Date(START));
  const entry = model.faceEnrollment("employee-1");

  assert.equal(FACE_DEMO.validityDays, 365);
  assert.equal(model.isFaceEnrollmentExpired(entry, new Date(START + 364 * DAY)), false);
  assert.equal(model.hasValidFaceEnrollment("employee-1", new Date(START + 364 * DAY)), true);
  assert.equal(model.isFaceEnrollmentExpired(entry, new Date(START + 365 * DAY)), true);
  assert.equal(model.hasValidFaceEnrollment("employee-1", new Date(START + 365 * DAY)), false);
  assert.deepEqual(model.validFaceEnrollments(new Date(START + 365 * DAY)), []);
});

test("verlopen: wissen met een logboekregel zonder kenmerken, en de vraag zegt daarna 'verlopen'", async () => {
  const { app, view, model, demo } = createApp();
  await demo.detectCamera();
  model.saveFaceEnrollment("employee-1", face(0.123456), new Date(Date.now() - 366 * DAY));
  app.loadSavedFaces(new Date(Date.now() - 300 * DAY));
  assert.equal(demo.isEnrolled("employee-1"), true);

  assert.deepEqual(app.expireFaces(), ["employee-1"]);

  assert.equal(model.faceEnrollments.length, 0);
  assert.equal(demo.isEnrolled("employee-1"), false, "een verlopen gezicht telt niet meer mee bij herkennen");
  assert.equal(model.faceOfferAnswer("employee-1"), "expired");
  assert.deepEqual(model.auditLog.map(({ action, details }) => [action, details]), [["Gezichtsherkenning verlopen", "Test Medewerker: na een jaar gewist"]]);
  assert.equal(JSON.stringify(model.auditLog).includes("0.123456"), false);

  app.recognizeBadge("04A1B2C3");
  assert.equal(view.$("#faceOfferTitle").textContent, "Je gezichtsherkenning is verlopen. Opnieuw instellen?");
});

test("verlopen: ook zonder expireFaces doet een verlopen gezicht niet mee (loadSavedFaces)", () => {
  const { app, model, demo } = createApp();
  model.saveFaceEnrollment("employee-1", face(0.1), new Date(Date.now() - 400 * DAY));

  app.loadSavedFaces();

  assert.equal(demo.isEnrolled("employee-1"), false);
});

test("verlopen: de standby-timer wist verlopen instellingen eens per minuut", () => {
  const { app, model, clock } = createApp();
  // Ten opzichte van de nep-klok (START), niet van de echte datum: met Date.now() slaagde deze test
  // alleen op 21 oktober 2026 (de dag van START) en faalde hij vanaf de dag erna (generale repetitie).
  model.saveFaceEnrollment("employee-1", face(0.1), new Date(clock.now() - 366 * DAY));
  app.startStandbyWatch();

  clock.advance(StandbyController.TICK_MS);

  assert.equal(model.faceEnrollments.length, 0);
  app.stopStandbyWatch();
});

// ------------------------------------------------------------------
// Opslag: bewaren na herladen, controle bij het laden, migratie en wissen
// ------------------------------------------------------------------

test("opslag: de kenmerken blijven na herladen bewaard, als gewone lijst getallen met enrolledAt en consentAt", () => {
  fakeLocalStorage();
  const model = new RegistrationModel(new DataStore("test"));
  const employeeId = model.employees[0].id;
  assert.equal(model.saveFaceEnrollment(employeeId, Float32Array.from(face(0.25))), true);
  model.save();

  const reloaded = new RegistrationModel(new DataStore("test"));

  const entry = reloaded.faceEnrollment(employeeId);
  assert.equal(Array.isArray(entry.descriptor), true);
  assert.deepEqual(entry.descriptor, face(0.25));
  assert.match(entry.enrolledAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(entry).sort(), ["consentAt", "descriptor", "employeeId", "enrolledAt", "id"]);
  assert.equal(entry.consentAt, entry.enrolledAt, "toestemming en instellen op hetzelfde moment (3.22)");
  assert.equal(reloaded.loadProblem, null);
});

test("opslag: het model weigert een descriptor met een verkeerde lengte of geen getallen", () => {
  const { model } = createModel();
  assert.equal(model.saveFaceEnrollment("employee-1", [0.1, 0.2]), false);
  assert.equal(model.saveFaceEnrollment("employee-1", [...face(0.1).slice(1), Number.NaN]), false);
  assert.equal(model.saveFaceEnrollment("employee-1", [...face(0.1).slice(1), "0.1"]), false);
  assert.equal(model.saveFaceEnrollment("employee-1", [...face(0.1).slice(1), 99]), false);
  assert.equal(model.saveFaceEnrollment("onbekend", face(0.1)), false);
  assert.equal(model.faceEnrollments.length, 0);
});

test("opslag: geknoeide kenmerken worden bij het laden overgeslagen", () => {
  fakeLocalStorage();
  const seed = new RegistrationModel(createStore()).state;
  const [first, second, third] = seed.employees;
  const valid = { id: "f1", employeeId: first.id, descriptor: face(0.1), enrolledAt: "2026-10-01T08:00:00.000Z" };
  seed.employees[2] = { ...third, active: false };
  seed.faceEnrollments = [
    valid,
    { ...valid, id: "f2", employeeId: second.id, descriptor: face(0.1).slice(1) },
    { ...valid, id: "f3", employeeId: second.id, descriptor: [...face(0.1).slice(1), "0.1"] },
    { ...valid, id: "f4", employeeId: second.id, photo: "data:image/png;base64,AAAA" },
    { ...valid, id: "f5", employeeId: second.id, enrolledAt: "2099-01-01T00:00:00.000Z" },
    { ...valid, id: "f6", employeeId: third.id },
    { ...valid, id: "f7", employeeId: "bestaat-niet" },
    { ...valid, id: "f8" }
  ];
  seed.faceOffers = [{ id: "o1", employeeId: second.id, answer: "declined", answeredAt: "2026-10-01T08:00:00.000Z" }, { id: "o2", employeeId: second.id, answer: "ja", answeredAt: "2026-10-01T08:00:00.000Z" }];
  localStorage.setItem("test", JSON.stringify(seed));

  const store = new DataStore("test");
  const data = store.load(new Date(START));

  assert.deepEqual(data.faceEnrollments.map(({ id }) => id), ["f1"]);
  assert.deepEqual(data.faceOffers.map(({ id }) => id), ["o1"]);
  assert.equal(store.loadProblem, "skipped");
});

test("opslag: gegevens van vóór 3.17 krijgen lege lijsten (migratie)", () => {
  fakeLocalStorage();
  const old = new RegistrationModel(createStore()).state;
  delete old.faceEnrollments;
  delete old.faceOffers;
  localStorage.setItem("test", JSON.stringify(old));

  const store = new DataStore("test");
  const data = store.load(new Date(START));

  assert.deepEqual(data.faceEnrollments, []);
  assert.deepEqual(data.faceOffers, []);
  assert.equal(store.loadProblem, null);
});

test("wissen: Uitzetten wist de kenmerken uit het model met de logboekregel 'Gezichtsherkenning uitgezet'", () => {
  const { app, model, demo } = createApp();
  enrollInModel(app, model);
  app.openEmployeeProducts("employee-1", { recognizedBy: "face" }); // Uitzetten na herkenning met de camera (3.22)

  app.forgetFace();

  assert.equal(model.faceEnrollments.length, 0);
  assert.equal(demo.isEnrolled("employee-1"), false);
  assert.deepEqual(model.auditLog.map(({ action, details }) => [action, details]), [["Gezichtsherkenning uitgezet", "Test Medewerker"]]);
});

test("wissen: deactiveren en weer activeren wist de kenmerken", () => {
  const { app, model, demo } = createApp();
  asAdmin(app);
  enrollInModel(app, model);

  app.toggleEmployee("employee-1");

  assert.equal(model.faceEnrollments.length, 0);
  assert.equal(demo.isEnrolled("employee-1"), false);
  enrollInModel(app, model);
  model.setEmployeeActive("employee-1", false);
  model.setEmployeeActive("employee-1", true);
  assert.equal(model.faceEnrollments.length, 0);
});

test("wissen: verwijderen wist de kenmerken en het antwoord, Alle gegevens wissen wist alles", () => {
  const { model } = createModel();
  model.saveFaceEnrollment("employee-1", face(0.1));
  model.declineFaceOffer("employee-1");
  model.setEmployeeActive("employee-1", false);
  model.state.faceEnrollments = [{ id: "x", employeeId: "employee-1", descriptor: face(0.1), enrolledAt: new Date().toISOString() }];

  assert.equal(model.removeEmployee("employee-1"), true);
  assert.deepEqual(model.faceEnrollments, []);
  assert.deepEqual(model.faceOffers, []);

  const other = createModel().model;
  other.saveFaceEnrollment("employee-1", face(0.1));
  other.wipeAll();
  assert.deepEqual(other.faceEnrollments, []);
  assert.deepEqual(other.faceOffers, []);
});

test("privacy: de kenmerken staan niet in de CSV-export en niet in het logboek", async () => {
  const { app, model, view, demo } = createApp({ seen: () => face(0.314159) });
  await demo.detectCamera();
  model.addRegistration("employee-1", "blikje");
  app.recognizeBadge("04A1B2C3");
  app.acceptFaceOffer();
  await wait(10);
  view.$("#faceConsent").checked = true;
  await app.captureEnrollment();
  app.finishFridgeWindow();

  const csv = app.csvExport.toCsv(app.csvExport.buildRows("all", "all"));
  assert.equal(csv.includes("0.314159"), false);
  assert.equal(JSON.stringify(model.auditLog).includes("0.314159"), false);
  assert.equal(model.faceEnrollment("employee-1").descriptor[0], 0.314159, "wel opgeslagen in de state");
});

test("camera-detectie: zonder camera false, met camera true, zonder enumerateDevices onbekend", async () => {
  const withCamera = new FaceRecognitionDemo({ ...FACE_DEMO }, createCamera().mediaDevices);
  const without = new FaceRecognitionDemo({ ...FACE_DEMO }, createCamera({ hasCamera: false }).mediaDevices);
  const unknown = new FaceRecognitionDemo({ ...FACE_DEMO }, { getUserMedia: async () => ({}) });

  assert.equal(await withCamera.detectCamera(), true);
  assert.equal(await without.detectCamera(), false);
  assert.equal(await unknown.detectCamera(), null);
  assert.equal(withCamera.hasCameraDevice(), true);
  assert.equal(unknown.hasCameraDevice(), false);
  assert.equal(unknown.mayHaveCamera(), true);
  assert.equal(without.mayHaveCamera(), false);
});
