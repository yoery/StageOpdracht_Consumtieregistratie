// Tests voor versie 3.21: het zwarte startscherm met het ovaal en "Handmatig zoeken", en het
// automatisch scannen met de intentie-drempel (FACE_DEMO.scanMode "auto"). Met een nep-klok, een
// nep-camera (mediaDevices) en zonder face-api: het zoeken naar gezichten (detectFaces) en het berekenen
// van de kenmerken (describeFace) worden nagebootst, zodat de test bepaalt wat de camera "ziet".
//
// Het camerabeeld is 320 bij 240 pixels. Het ovaal toont daarvan het midden: 180 pixels breed en 240
// hoog (FaceIntent.ovalFor), met het midden op (160, 120). Een gezicht telt als dichtbij vanaf 45 procent
// van de breedte van het ovaal: 81 pixels.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { CsvExport } from "../assets/js/CsvExport.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { FaceIntent } from "../assets/js/FaceIntent.js";
import { BadgeReader } from "../assets/js/BadgeReader.js";
import { SmartFridge } from "../assets/js/fridge/SmartFridge.js";
import { AutoScanController } from "../assets/js/controllers/AutoScanController.js";
import { StandbyController } from "../assets/js/controllers/StandbyController.js";
import { SMART_FRIDGE, STANDBY, FACE_DEMO } from "../assets/js/config.js";
import { createModel, addEmployee, createRecordingView, createFakeElement } from "./helpers.js";
import { face3d, project, photo } from "./helpers-gezicht.js";

const START = Date.UTC(2026, 9, 26, 8, 0);
const TICK = FACE_DEMO.autoScan.detectIntervalMs;
// Zo lang duurt het vanaf het moment dat iemand stil in het ovaal komt staan tot de eerste keer kenmerken:
// de eerste scan ziet hem (het stilstaan begint), daarna nog zo veel scans als nodig voor stillMs.
const FIRST_DESCRIPTOR_MS = TICK * (1 + Math.ceil(FACE_DEMO.autoScan.stillMs / TICK));

// Een "gezicht" van 128 getallen, allemaal met dezelfde waarde.
const face = (value) => new Array(128).fill(value);

// Wat de camera ziet (pixels van een beeld van 320 bij 240).
const VIDEO = { width: 320, height: 240 };
const frame = (...faces) => ({ ...VIDEO, faces });
const NEAR_IN_OVAL = { x: 110, y: 60, width: 100, height: 120 };   // dichtbij, midden (160, 120)
const FAR_IN_OVAL = { x: 140, y: 95, width: 40, height: 50 };      // op afstand, midden in het ovaal
const NEAR_OUTSIDE = { x: 225, y: 60, width: 90, height: 110 };    // dichtbij, midden (270, 115): buiten het ovaal
const shifted = (box, dx) => ({ ...box, x: box.x + dx });

// Nep-klok: de tijd gaat alleen vooruit met advance(); timers lopen dan af.
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

// Laat beloftes (async code) die nu klaarstaan, eerst uitlopen.
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Nep-camera: telt hoe vaak de camera aangaat, met welke resolutie, en of hij aan staat.
const createCamera = ({ hasCamera = true, fails = null } = {}) => {
  const camera = { starts: 0, stops: 0, on: false, constraints: null };
  camera.mediaDevices = {
    getUserMedia: async (constraints) => {
      camera.starts += 1;
      camera.constraints = constraints;
      if (fails) throw new DOMException("Geen toegang", fails);
      camera.on = true;
      return { getTracks: () => [{ stop: () => { camera.stops += 1; camera.on = false; } }] };
    },
    enumerateDevices: async () => (hasCamera ? [{ kind: "videoinput" }] : [{ kind: "audioinput" }])
  };
  return camera;
};

// De echte FaceRecognitionDemo met de nep-camera. Laden is direct klaar. `scene.frame` is wat
// detectFaces ziet, `scene.descriptor` wat describeFace teruggeeft. describeFace houdt bij voor welk
// gezicht het is aangeroepen (`scene.described`).
const createDemo = (camera, settings = {}) => {
  const scene = { frame: frame(), descriptor: face(0.1), described: [], detections: 0 };
  const demo = new FaceRecognitionDemo({ ...FACE_DEMO, scanMode: "auto", ...settings }, camera.mediaDevices);
  demo.load = async () => {};
  demo.detectFaces = async () => {
    scene.detections += 1;
    return scene.frame;
  };
  demo.describeFace = async (video, box) => {
    scene.described.push(box);
    return scene.descriptor;
  };
  return { demo, scene };
};

const MODALS = ["#adminModal", "#employeeProductsModal", "#fridgeModal", "#faceOfferModal", "#faceModal"];

// Controller met een nep-view, nep-klok, nep-camera en een nagebootste koelkast. employee-1 (Test
// Medewerker) heeft pas 04A1B2C3 en hoort bij het demo-consumptiepunt met de standaardindeling.
const createApp = ({ model = createModel().model, hasCamera = true, fails = null, faceSettings = {}, target = "fridge", standby = STANDBY, badge = true } = {}) => {
  model.state.employees[0].badgeId = "04A1B2C3";
  const view = createRecordingView();
  for (const selector of MODALS) view.$(selector).classList.add("hidden");
  view.$("#faceVideo").play = async () => {};
  view.$("#startVideo").play = async () => {};
  view.greeting = () => "Goedemorgen";
  const clock = createClock();
  const camera = createCamera({ hasCamera, fails });
  const { demo, scene } = createDemo(camera, faceSettings);
  const reader = new BadgeReader({ enabled: badge, minLength: 4, maxKeyIntervalMs: 40, endDelayMs: 120 }, { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} });
  const smartFridge = SmartFridge.createSimulated({ ...SMART_FRIDGE, weightVariation: 0 }, { clock });
  const app = new RegistrationApp(model, view, new CsvExport(model), demo, reader, clock, smartFridge);
  app.recognition.recognitionTargetSetting = target;
  app.standby.standbySettings = standby;
  globalThis.document = {
    activeElement: null,
    visibilityState: "visible",
    hidden: false,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? MODALS.map((modal) => view.$(modal)).filter((element) => !element.classList.contains("hidden")) : [])
  };
  return { app, model, view, clock, camera, demo, scene };
};

// Een actieve medewerker met een opgeslagen gezicht, in het geheugen gezet zoals bij het starten.
const enrollInModel = (app, model, employeeId = "employee-1", value = 0.1) => {
  model.saveFaceEnrollment(employeeId, face(value));
  app.loadSavedFaces();
};

// Start de app zoals RegistrationApp.initialize: de app kijkt of er een camera is (zonder hem aan te
// zetten), start de timer van het startscherm en toont het startscherm.
const startOnStartScreen = async (app) => {
  await app.faceDemo.detectCamera();
  app.startStandbyWatch();
  app.enterStandby();
  await flush();
  await flush();
};

// Laat de tijd `ms` vooruitgaan in stappen van één scan, en laat na iedere stap de async code uitlopen.
const run = async (clock, ms) => {
  for (let passed = 0; passed < ms; passed += TICK) {
    clock.advance(Math.min(TICK, ms - passed));
    await flush();
    await flush();
  }
};

const isOpen = (view, selector) => !view.$(selector).classList.contains("hidden");
const calls = (view, name) => view.calls.filter(([call]) => call === name).map(([, ...args]) => args);
const lastState = (view) => calls(view, "setStartScreenState").at(-1);
const stop = (app) => app.stopStandbyWatch();

// ------------------------------------------------------------------
// Het startscherm verschijnt: bij het openen, na inactiviteit en na afloop
// ------------------------------------------------------------------

test("startscherm: verschijnt bij het openen van de website (initialize)", async () => {
  const { app, view } = createApp();
  app.registerEventListeners = () => {};
  globalThis.window = { addEventListener() {} };

  app.initialize();
  try {
    assert.equal(app.standbyActive, true);
    assert.deepEqual(calls(view, "showStartScreen"), [[true]]);
    const [texts] = calls(view, "renderStartScreen").at(-1);
    assert.equal(texts.mode, "badge", "nog niemand heeft een gezicht ingesteld");
    assert.equal(texts.status, "Houd je pas tegen de lezer");
  } finally {
    clearInterval(app.dayTimer);
    app.stopIdleWatch();
    app.stopProductIdleWatch();
    stop(app);
  }
});

test("startscherm: met STANDBY.enabled = false opent de website op de lijst en komt het startscherm niet terug", async () => {
  const { app, view, clock } = createApp({ standby: { enabled: false, idleMs: 1000 } });
  app.registerEventListeners = () => {};
  globalThis.window = { addEventListener() {} };
  app.initialize();
  try {
    clock.advance(60 * 60 * 1000);
    assert.equal(app.returnToStartScreen(), false);
    assert.equal(app.standbyActive, false);
    assert.deepEqual(calls(view, "showStartScreen"), []);
  } finally {
    clearInterval(app.dayTimer);
    app.stopIdleWatch();
    app.stopProductIdleWatch();
    stop(app);
  }
});

test("startscherm: komt terug na STANDBY.idleMs zonder invoer op de beginpagina", () => {
  const { app, clock } = createApp();
  app.startStandbyWatch();
  app.enterStandby();
  app.handleManualSearch({ detail: 1 });
  assert.equal(app.standbyActive, false);

  clock.advance(STANDBY.idleMs - 1000);
  assert.equal(app.standbyActive, false);
  clock.advance(1000);
  assert.equal(app.standbyActive, true);
  stop(app);
});

test("startscherm: komt terug na een registratie, en de bevestiging blijft staan", () => {
  const { app, view } = createApp();
  app.startStandbyWatch();
  app.enterStandby();
  app.handleManualSearch({ detail: 1 });

  app.openEmployeeProducts("employee-1");
  app.incrementProduct("blikje");
  app.registerSelectedProducts();

  assert.equal(app.standbyActive, true);
  assert.deepEqual(calls(view, "showStartScreen"), [[true], [false], [true]]);
  assert.equal(view.toasts.at(-1).message, "Test Medewerker: 1× Blikje geregistreerd");
  stop(app);
});

test("startscherm: komt terug na afloop van een koelkastopening, maar niet bij de knop naar het productvenster", () => {
  const { app, model, demo } = createApp({ hasCamera: false });
  demo.hasCamera = false;
  app.startStandbyWatch();
  app.enterStandby();

  app.recognizeBadge("04A1B2C3");
  assert.equal(app.fridgePhase, "open");
  assert.equal(app.standbyActive, false, "de pas op het startscherm opent de koelkast en het startscherm verdwijnt");
  app.takeFromShelf("1");
  app.closeFridgeDoor();
  assert.equal(app.standbyActive, false, "het overzicht staat nog open");
  app.finishFridgeWindow();
  assert.equal(app.standbyActive, true);
  assert.equal(model.registrations.length, 1);

  // De knop "Liever brood of beleg?" opent het productvenster: dan geen startscherm ertussen.
  app.recognizeBadge("04A1B2C3");
  assert.equal(app.switchFridgeToProducts(), true);
  assert.equal(app.standbyActive, false);
  assert.equal(app.selectedEmployeeId, "employee-1");

  // Sluiten zonder registreren van een venster dat na de pas opende: het startscherm komt terug.
  app.dismissEmployeeProducts();
  assert.equal(app.standbyActive, true);
  stop(app);
});

test("startscherm: na sluiten zonder registreren van een naam uit de lijst blijft de lijst staan", () => {
  const { app } = createApp();
  app.startStandbyWatch();
  app.enterStandby();
  app.handleManualSearch({ detail: 1 });

  app.openEmployeeProducts("employee-1");
  app.dismissEmployeeProducts();

  assert.equal(app.standbyActive, false);
  stop(app);
});

test("startscherm: het productvenster sluit vanzelf en dan komt het startscherm terug", () => {
  const { app, clock } = createApp();
  app.startStandbyWatch();
  app.startProductIdleWatch();
  app.enterStandby();
  app.handleManualSearch({ detail: 1 });
  app.openEmployeeProducts("employee-1");

  clock.advance(app.idleCloseMs + 1000);

  assert.equal(app.selectedEmployeeId, null);
  assert.equal(app.standbyActive, true);
  app.stopProductIdleWatch();
  stop(app);
});

// ------------------------------------------------------------------
// Handmatig zoeken, de pas en de teksten
// ------------------------------------------------------------------

test("Handmatig zoeken: toont de beginpagina, met het toetsenbord gaat de focus naar het zoekveld", () => {
  const { app, view } = createApp();
  app.startStandbyWatch();
  app.enterStandby();

  app.handleManualSearch({ detail: 0, preventDefault() {}, stopPropagation() {} });

  assert.equal(app.standbyActive, false);
  assert.equal(view.$("#employeeSearch").focused, true);
  assert.equal(app.isStandbyGhostClick(), true, "een klik vlak daarna telt niet (geen klik-door)");

  // Met een tik (detail 1) blijft de focus uit het zoekveld, anders schuift het schermtoetsenbord omhoog.
  const second = createApp();
  second.app.enterStandby();
  second.app.handleManualSearch({ detail: 1 });
  assert.equal(second.view.$("#employeeSearch").focused, false);
  stop(app);
});

test("Handmatig zoeken: een klik op het startscherm zelf wordt nooit tegengehouden", () => {
  const { app } = createApp();
  app.enterStandby();
  app.handleManualSearch({ detail: 1 });
  const onStart = { target: createFakeElement({ closest: (selector) => (selector === "#startScreen" ? {} : null) }), preventDefault() {}, stopPropagation() {} };
  assert.equal(app.swallowStandbyGhostClick(onStart), false);
});

test("pas: een passcan op het startscherm opent de koelkast (of het productvenster) en het startscherm verdwijnt", () => {
  const products = createApp({ target: "products" });
  products.app.enterStandby();
  products.app.recognizeBadge("04A1B2C3");
  assert.equal(products.app.standbyActive, false);
  assert.equal(products.app.selectedEmployeeId, "employee-1");
  assert.equal(products.app.recognizedBy, "badge");

  const fridge = createApp();
  fridge.demo.hasCamera = false;
  fridge.app.enterStandby();
  fridge.app.recognizeBadge("04A1B2C3");
  assert.equal(fridge.app.standbyActive, false);
  assert.equal(fridge.app.fridgePhase, "open");
  assert.equal(fridge.app.fridgeRecognizedBy, "badge");
  fridge.app.finishFridgeWindow();
});

test("pas: na een passcan blijft de vraag 'Gezichtsherkenning nog niet ingesteld. Wil je dit?' zoals hij was", async () => {
  const { app, view, demo } = createApp();
  await demo.detectCamera();
  app.enterStandby();

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.standbyActive, false);
  assert.equal(isOpen(view, "#faceOfferModal"), true);
  assert.equal(view.$("#faceOfferTitle").textContent, "Gezichtsherkenning nog niet ingesteld. Wil je dit?");
});

test("teksten: per soort startscherm, met de uitleg voor een schermlezer", async () => {
  const { app, model } = createApp();
  let texts = app.startScreenTexts();
  assert.equal(texts.mode, "badge");
  assert.equal(texts.status, "Houd je pas tegen de lezer");
  assert.equal(texts.hint, "Gezichtsherkenning stel je in na een passcan of via de beheerder.");
  assert.equal(texts.help, "Startscherm. Begin zo: houd je pas tegen de lezer of kies Handmatig zoeken om je naam in de lijst te zoeken.");

  enrollInModel(app, model);
  assert.equal(app.startScreenTexts().mode, "badge", "nog niet bekend of er een camera is");
  await app.faceDemo.detectCamera();
  texts = app.startScreenTexts();
  assert.deepEqual(texts, {
    mode: "auto",
    status: "Kijk in het ovaal",
    hint: "Of houd je pas tegen de lezer.",
    privacy: "De camera zoekt alleen een gezicht dichtbij in het ovaal. Er worden geen beelden bewaard of verstuurd.",
    help: "Startscherm. Begin zo: houd je pas tegen de lezer, kijk in het ovaal om herkend te worden met de camera of kies Handmatig zoeken om je naam in de lijst te zoeken."
  });

  // Zonder pasjeslezer.
  const noBadge = createApp({ badge: false });
  assert.equal(noBadge.app.startScreenTexts().status, "Tik op Handmatig zoeken om je naam te kiezen");
  assert.equal(noBadge.app.startScreenTexts().help, "Startscherm. Begin zo: kies Handmatig zoeken om je naam in de lijst te zoeken.");
});

// ------------------------------------------------------------------
// De camera staat alleen aan op het startscherm
// ------------------------------------------------------------------

test("camera: pas aan als zeker is dat er een camera is, en eerst de camera, daarna het model", async () => {
  const { app, model, camera, demo } = createApp();
  enrollInModel(app, model);
  const order = [];
  demo.load = async () => { order.push(camera.on ? "model na camera" : "model zonder camera"); };
  app.startStandbyWatch();
  app.enterStandby();
  await flush();
  assert.equal(camera.starts, 0, "zolang niet bekend is of er een camera is, blijft hij uit");

  await demo.detectCamera();
  app.refreshStartScreen();
  await flush();
  await flush();
  assert.equal(camera.on, true);
  assert.deepEqual(order, ["model na camera"]);
  stop(app);
});

test("camera: alleen aan op het startscherm, in lage resolutie, en uit bij Handmatig zoeken en ieder venster", async () => {
  const { app, model, camera, view } = createApp();
  enrollInModel(app, model);

  await startOnStartScreen(app);
  assert.equal(camera.on, true);
  assert.equal(app.scanCamera, "on");
  assert.deepEqual(camera.constraints.video.width, { ideal: 320 });
  assert.deepEqual(camera.constraints.video.height, { ideal: 240 });
  assert.equal(camera.constraints.audio, false);
  assert.deepEqual(calls(view, "setStartScreenCamera").at(-1), [true]);

  // Handmatig zoeken: uit.
  app.handleManualSearch({ detail: 1 });
  assert.equal(camera.on, false);
  assert.equal(app.scanCamera, "off");

  // Terug naar het startscherm: weer aan.
  app.enterStandby();
  await flush();
  await flush();
  assert.equal(camera.on, true);

  // Een venster (hier het beheer) opent: uit.
  app.openModal("#adminModal");
  assert.equal(app.standbyActive, false);
  assert.equal(camera.on, false);
  assert.equal(camera.starts, 2);
  stop(app);
});

test("camera: uit in een verborgen tabblad en weer aan als het tabblad terugkomt", async () => {
  const { app, model, camera } = createApp();
  enrollInModel(app, model);
  await startOnStartScreen(app);
  assert.equal(camera.on, true);

  globalThis.document.visibilityState = "hidden";
  app.updateAutoScan();
  assert.equal(camera.on, false);

  globalThis.document.visibilityState = "visible";
  app.updateAutoScan();
  await flush();
  await flush();
  assert.equal(camera.on, true);
  stop(app);
  assert.equal(camera.on, false, "stopStandbyWatch zet de camera ook uit");
});

test("camera: niet nodig als niemand een gezicht heeft ingesteld, met FACE_DEMO uit of zonder camera", async () => {
  const noFaces = createApp();
  await startOnStartScreen(noFaces.app);

  const disabled = createApp({ faceSettings: { enabled: false } });
  enrollInModel(disabled.app, disabled.model);
  await startOnStartScreen(disabled.app);

  const noCamera = createApp({ hasCamera: false });
  enrollInModel(noCamera.app, noCamera.model);
  await noCamera.demo.detectCamera();
  await startOnStartScreen(noCamera.app);

  for (const { app, camera } of [noFaces, disabled, noCamera]) {
    assert.equal(camera.starts, 0);
    assert.equal(app.startScreenMode(), "badge");
    stop(app);
  }
  assert.equal(noFaces.app.startScreenTexts().hint, "Gezichtsherkenning stel je in na een passcan of via de beheerder.");
  assert.equal(noCamera.app.startScreenTexts().hint, "", "zonder camera geen uitleg over instellen");
});

test("camera: zonder toestemming alleen pas en Handmatig zoeken, zonder melding in de console en zonder nieuwe pogingen", async () => {
  const { app, model, camera, view } = createApp({ fails: "NotAllowedError" });
  enrollInModel(app, model);
  const logged = [];
  const original = { warn: console.warn, error: console.error };
  console.warn = (...args) => logged.push(args);
  console.error = (...args) => logged.push(args);
  try {
    await startOnStartScreen(app);
    await flush();
  } finally {
    console.warn = original.warn;
    console.error = original.error;
  }

  assert.equal(camera.starts, 1);
  assert.equal(app.cameraBlocked, true);
  assert.equal(app.startScreenMode(), "badge");
  assert.equal(calls(view, "renderStartScreen").at(-1)[0].status, "Houd je pas tegen de lezer");
  assert.deepEqual(logged, []);
  assert.deepEqual(view.toasts, []);

  // Het startscherm komt terug: de camera wordt niet opnieuw geprobeerd.
  app.handleManualSearch({ detail: 1 });
  app.enterStandby();
  await flush();
  assert.equal(camera.starts, 1);
  stop(app);
});

test("camera: scanMode 'tap' werkt zoals vroeger: de camera blijft uit tot een tik op het ovaal", async () => {
  const { app, model, camera, view, clock } = createApp({ faceSettings: { scanMode: "tap", wakeScanMs: 60 } });
  enrollInModel(app, model);
  await startOnStartScreen(app);
  clock.advance(STANDBY.idleMs * 3);
  await flush();
  assert.equal(camera.starts, 0);
  assert.equal(app.startScreenMode(), "tap");
  assert.equal(calls(view, "renderStartScreen").at(-1)[0].status, "Tik op het ovaal om je gezicht te laten scannen");

  // De tik op het ovaal: het startscherm verdwijnt en de korte scan van versie 3.17 start.
  assert.equal(app.handleStandbyTap({}), true);
  await flush();
  await flush();
  assert.equal(app.standbyActive, false);
  assert.equal(app.faceMode, "wake");
  assert.equal(isOpen(view, "#faceModal"), true);
  assert.equal(camera.starts, 1);
  app.closeFaceModal();
  assert.equal(camera.on, false);
  stop(app);
});

// ------------------------------------------------------------------
// De intentie-drempel: kenmerken alleen bij groot, in het ovaal en stil
// ------------------------------------------------------------------

test("drempel: een gezicht op afstand krijgt nooit kenmerken, ook niet als het lang in het ovaal staat", async () => {
  const { app, model, scene, clock, view } = createApp();
  enrollInModel(app, model);
  await startOnStartScreen(app);

  scene.frame = frame(FAR_IN_OVAL);
  await run(clock, 10000);

  assert.ok(scene.detections >= 25, "de camera heeft wel steeds gekeken");
  assert.deepEqual(scene.described, []);
  assert.equal(app.descriptorCount, 0);
  assert.notEqual(lastState(view)?.[0], "steady");
  stop(app);
});

test("drempel: een gezicht dichtbij maar buiten het ovaal krijgt nooit kenmerken", async () => {
  const { app, model, scene, clock } = createApp();
  enrollInModel(app, model);
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_OUTSIDE);
  await run(clock, 10000);

  assert.deepEqual(scene.described, []);
  assert.equal(app.descriptorCount, 0);
  stop(app);
});

test("drempel: twee gezichten dichtbij krijgen geen kenmerken ('Graag één persoon tegelijk')", async () => {
  const { app, model, scene, clock, view } = createApp();
  enrollInModel(app, model);
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL, shifted(NEAR_IN_OVAL, 20));
  await run(clock, 5000);

  assert.deepEqual(scene.described, []);
  assert.deepEqual(lastState(view), ["multiple", "Graag één persoon tegelijk"]);
  stop(app);
});

test("drempel: een gezicht dat blijft bewegen krijgt geen kenmerken", async () => {
  const { app, model, scene, clock } = createApp();
  enrollInModel(app, model);
  await startOnStartScreen(app);

  for (let step = 0; step < 30; step += 1) {
    scene.frame = frame(shifted(NEAR_IN_OVAL, step % 2 === 0 ? -25 : 25));
    await run(clock, TICK);
  }

  assert.deepEqual(scene.described, []);
  stop(app);
});

test("drempel: pas na stillMs stil in het ovaal worden de kenmerken berekend, alleen van dat ene gezicht", async () => {
  const { app, model, scene, clock, view } = createApp({ target: "products" });
  enrollInModel(app, model);
  scene.descriptor = face(0.9); // niet herkend, zodat er niets opent
  await startOnStartScreen(app);

  // Een voorbijganger op afstand en iemand die dichtbij in het ovaal komt staan.
  scene.frame = frame(FAR_IN_OVAL, NEAR_IN_OVAL);
  await run(clock, TICK);
  assert.deepEqual(lastState(view), ["steady", "Even stil blijven…"], "het ovaal wordt groen");
  await run(clock, FIRST_DESCRIPTOR_MS - 2 * TICK);
  assert.deepEqual(scene.described, [], "nog geen seconde stil");

  await run(clock, TICK);
  assert.deepEqual(scene.described, [NEAR_IN_OVAL], "alleen het gezicht dichtbij in het ovaal");
  assert.equal(app.descriptorCount, 1);
  stop(app);
});

test("FaceIntent: het ovaal, dichtbij, binnen en stil", () => {
  assert.deepEqual(FaceIntent.ovalFor(320, 240), { cx: 160, cy: 120, rx: 90, ry: 120 });
  assert.deepEqual(FaceIntent.ovalFor(240, 320), { cx: 120, cy: 160, rx: 120, ry: 160 });

  const intent = new FaceIntent({ minFaceWidth: 0.45, stillMs: 1000, maxMovement: 0.12 });
  const oval = FaceIntent.ovalFor(320, 240);
  assert.equal(intent.isNear(NEAR_IN_OVAL, oval), true);
  assert.equal(intent.isNear(FAR_IN_OVAL, oval), false);
  assert.equal(FaceIntent.isInside(NEAR_IN_OVAL, oval), true);
  assert.equal(FaceIntent.isInside(NEAR_OUTSIDE, oval), false);

  assert.equal(intent.update(frame(), 0).state, "none");
  assert.equal(intent.update(frame(FAR_IN_OVAL), 0).state, "far");
  assert.equal(intent.update(frame(NEAR_OUTSIDE), 0).state, "outside");
  assert.equal(intent.update(frame(NEAR_IN_OVAL, NEAR_IN_OVAL), 0).state, "multiple");
  assert.equal(intent.update(frame(NEAR_IN_OVAL), 0).state, "settling");
  assert.equal(intent.update(frame(shifted(NEAR_IN_OVAL, 10)), 600).state, "settling", "10 pixels telt als stil");
  const ready = intent.update(frame(shifted(NEAR_IN_OVAL, 5)), 1000);
  assert.equal(ready.state, "ready");
  assert.deepEqual(ready.face, shifted(NEAR_IN_OVAL, 5));
  assert.equal(intent.update(frame(shifted(NEAR_IN_OVAL, 40)), 1100).state, "settling", "een grote stap begint opnieuw");
  assert.equal(intent.update(frame(FAR_IN_OVAL), 2500).state, "far");
  assert.equal(intent.update(frame(NEAR_IN_OVAL), 2600).state, "settling", "weg en terug begint opnieuw");
});

// ------------------------------------------------------------------
// Herkend en niet herkend
// ------------------------------------------------------------------

test("herkend: twee keer dezelfde medewerker, dan de camera uit, de begroeting en daarna de koelkast", async () => {
  const { app, model, scene, clock, view, camera } = createApp();
  enrollInModel(app, model);
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS + TICK);

  assert.equal(scene.described.length, 2, "bevestigd na twee keer");
  assert.equal(camera.on, false, "de camera gaat meteen uit");
  assert.deepEqual(lastState(view), ["recognized", "Goedemorgen Test."]);
  assert.equal(app.standbyActive, true, "de begroeting staat nog in het ovaal");
  assert.equal(app.fridgePhase, "closed");

  clock.advance(FACE_DEMO.autoScan.greetingMs);
  assert.equal(app.standbyActive, false);
  assert.equal(app.fridgePhase, "open");
  assert.equal(app.fridgeEmployeeId, "employee-1");
  assert.equal(app.fridgeRecognizedBy, "face");
  assert.equal(camera.on, false, "zolang het venster open is, blijft de camera uit");

  // Na afloop komt het startscherm terug en gaat de camera weer aan.
  app.finishFridgeWindow();
  await flush();
  await flush();
  assert.equal(app.standbyActive, true);
  assert.equal(camera.on, true);
  assert.equal(lastState(view)[0], "idle");
  stop(app);
});

test("herkend: met RECOGNITION_TARGET 'products' opent het productvenster", async () => {
  const { app, model, scene, clock } = createApp({ target: "products" });
  enrollInModel(app, model);
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS + TICK + FACE_DEMO.autoScan.greetingMs);

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.recognizedBy, "face");
  stop(app);
});

test("herkend: een gezicht van een inactieve collega telt niet", async () => {
  const { model } = createModel();
  addEmployee(model, { id: "employee-2", pointId: model.points[0].id, companyId: model.points[0].companyId });
  const { app, scene, clock } = createApp({ model, target: "products" });
  enrollInModel(app, model, "employee-2", 0.1);
  enrollInModel(app, model, "employee-1", 0.12);
  model.state.employees[1] = { ...model.employees[1], active: false };
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS + TICK + FACE_DEMO.autoScan.greetingMs);

  assert.equal(app.selectedEmployeeId, "employee-1");
  stop(app);
});

test("herkend: Handmatig zoeken tijdens de begroeting opent niets", async () => {
  const { app, model, scene, clock } = createApp();
  enrollInModel(app, model);
  await startOnStartScreen(app);
  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS + TICK);
  assert.equal(app.greetingFor, "employee-1");

  app.handleManualSearch({ detail: 1 });
  clock.advance(FACE_DEMO.autoScan.greetingMs);

  assert.equal(app.fridgePhase, "closed");
  assert.equal(app.selectedEmployeeId, null);
  stop(app);
});

test("niet herkend: na een paar pogingen een vriendelijke melding en een pauze, daarna opnieuw", async () => {
  const { app, model, scene, clock, view } = createApp();
  enrollInModel(app, model);
  scene.descriptor = face(0.9);
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS + (FACE_DEMO.autoScan.attempts - 1) * TICK);
  assert.equal(scene.described.length, FACE_DEMO.autoScan.attempts);
  assert.deepEqual(lastState(view), ["unknown", "Je bent niet herkend. Houd je pas tegen de lezer of zoek handmatig."]);
  assert.equal(app.standbyActive, true);
  assert.equal(app.fridgePhase, "closed");

  // Tijdens de pauze wordt er niet gekeken, ook al staat het gezicht nog in het ovaal.
  const detections = scene.detections;
  await run(clock, FACE_DEMO.autoScan.retryPauseMs - TICK);
  assert.equal(scene.detections, detections);
  assert.equal(scene.described.length, FACE_DEMO.autoScan.attempts);

  // Na de pauze probeert hij het opnieuw (eerst weer een seconde stil).
  await run(clock, 2 * TICK + FIRST_DESCRIPTOR_MS);
  assert.ok(scene.described.length > FACE_DEMO.autoScan.attempts);
  stop(app);
});

test("niet herkend: zonder pasjeslezer noemt de melding alleen Handmatig zoeken", async () => {
  const { app, model, scene, clock, view } = createApp({ badge: false });
  enrollInModel(app, model);
  scene.descriptor = face(0.9);
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS + (FACE_DEMO.autoScan.attempts - 1) * TICK);

  assert.deepEqual(lastState(view), ["unknown", AutoScanController.MESSAGES.notRecognizedNoBadge]);
  stop(app);
});

test("niet herkend: wie wegloopt, begint opnieuw met tellen", async () => {
  const { app, model, scene, clock } = createApp();
  enrollInModel(app, model);
  scene.descriptor = face(0.9);
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS);
  assert.equal(app.scanAttempts, 1);
  scene.frame = frame();
  await run(clock, TICK);
  assert.equal(app.scanAttempts, 0);
  stop(app);
});

// Versie 3.23: de stille controle op een levend gezicht (FaceLiveness). De bibliotheek telt als geladen
// en describeFace geeft bij ieder gezicht de volgende gezichtspunten uit `frames` (een foto of een hoofd).
const withLandmarks = (demo, frames) => {
  demo.faceapi = {};
  const describe = demo.describeFace;
  let index = 0;
  demo.describeFace = async (video, box) => {
    const result = await describe(video, box);
    demo.lastLandmarks = frames[Math.min(index, frames.length - 1)];
    index += 1;
    return result;
  };
};

test("levend gezicht: een foto van een collega in het ovaal opent niets en geeft na maxMs 'niet herkend'", async () => {
  const { app, model, scene, clock, view, demo } = createApp();
  enrollInModel(app, model);
  const still = project(face3d());
  withLandmarks(demo, Array.from({ length: 40 }, (_, index) => photo(still, { dx: index, angle: index, scale: 1 + index * 0.01 })));
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS + FACE_DEMO.liveness.maxMs + TICK);

  assert.equal(app.greetingFor, null);
  assert.equal(app.fridgePhase, "closed");
  assert.equal(app.standbyActive, true);
  assert.deepEqual(lastState(view), ["unknown", "Je bent niet herkend. Houd je pas tegen de lezer of zoek handmatig."]);
  stop(app);
});

test("levend gezicht: een echt hoofd dat licht beweegt wordt herkend, zonder opdracht en zonder extra tekst", async () => {
  const { app, model, scene, clock, view, demo } = createApp();
  enrollInModel(app, model);
  withLandmarks(demo, Array.from({ length: 40 }, (_, index) => project(face3d(), { yaw: index % 2 ? 8 : -4 })));
  await startOnStartScreen(app);

  scene.frame = frame(NEAR_IN_OVAL);
  await run(clock, FIRST_DESCRIPTOR_MS + 3 * TICK);

  assert.equal(app.greetingFor, "employee-1");
  const texts = calls(view, "setStartScreenState").map(([, text]) => text);
  assert.equal(texts.some((text) => /knipper|draai|beweeg/i.test(text)), false);
  stop(app);
});

test("instellingen: scanMode 'auto' is de standaard en de drempels staan in config.js", () => {
  assert.equal(FACE_DEMO.scanMode, "auto");
  assert.deepEqual(Object.keys(FACE_DEMO.autoScan).sort(), ["attempts", "detectIntervalMs", "greetingMs", "maxMovement", "minFaceWidth", "retryPauseMs", "stillMs", "videoHeight", "videoWidth"]);
  assert.ok(FACE_DEMO.autoScan.detectIntervalMs >= 250 && FACE_DEMO.autoScan.detectIntervalMs <= 500, "2 tot 4 keer per seconde");
  assert.ok(FACE_DEMO.autoScan.videoWidth <= 640 && FACE_DEMO.autoScan.videoHeight <= 480, "lage resolutie");
  assert.equal(StandbyController.TEXTS.auto, "Kijk in het ovaal");
});

// ------------------------------------------------------------------
// FaceRecognitionDemo: alleen zoeken, en kenmerken van één uitgesneden gezicht
// ------------------------------------------------------------------

test("FaceRecognitionDemo: detectFaces zoekt alleen gezichten, zonder kenmerken", async () => {
  const used = [];
  const demo = new FaceRecognitionDemo({ ...FACE_DEMO }, createCamera().mediaDevices);
  demo.faceapi = {
    TinyFaceDetectorOptions: class { constructor(options) { this.options = options; } },
    detectAllFaces: (input, options) => {
      used.push(options.options);
      const result = Promise.resolve([{ box: { x: 1, y: 2, width: 3, height: 4 } }]);
      result.withFaceLandmarks = () => { throw new Error("geen kenmerken bij zoeken"); };
      return result;
    }
  };

  const found = await demo.detectFaces({ videoWidth: 320, videoHeight: 240 });

  assert.deepEqual(found, { width: 320, height: 240, faces: [{ x: 1, y: 2, width: 3, height: 4 }] });
  assert.deepEqual(used, [{ inputSize: 224, scoreThreshold: 0.5 }]);
  assert.deepEqual(await demo.detectFaces({ videoWidth: 0, videoHeight: 0 }), { width: 0, height: 0, faces: [] }, "nog geen beeld");
});

test("FaceRecognitionDemo: describeFace snijdt alleen dat ene gezicht uit en wist het stukje beeld daarna", async () => {
  const drawn = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => drawn.push(args) }) };
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => (tag === "canvas" ? canvas : null) };
  let input = null;
  const demo = new FaceRecognitionDemo({ ...FACE_DEMO }, createCamera().mediaDevices);
  demo.faceapi = {
    TinyFaceDetectorOptions: class {},
    detectSingleFace: (source) => {
      input = source;
      return { withFaceLandmarks: () => ({ withFaceDescriptor: async () => ({ descriptor: new Float32Array(128).fill(0.2) }) }) };
    }
  };
  const video = { videoWidth: 320, videoHeight: 240 };
  try {
    const descriptor = await demo.describeFace(video, NEAR_IN_OVAL);
    assert.equal(descriptor.length, 128);
    assert.equal(input, canvas, "de herkenning krijgt alleen het uitgesneden stukje");
    // Het gezicht met 30 procent rand: x 80 tot 240, y 24 tot 216.
    assert.deepEqual(drawn, [[video, 80, 24, 160, 192, 0, 0, 160, 192]]);
    assert.equal(canvas.width, 0, "het stukje beeld is gewist");
    assert.equal(canvas.height, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("readFace berekent alleen de kenmerken van het grootste gezicht in beeld", async () => {
  const described = [];
  const demo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000 }, null);
  demo.faceapi = {
    TinyFaceDetectorOptions: class {},
    detectAllFaces: async () => [
      { box: { x: 10, y: 10, width: 40, height: 40 } },
      { box: { x: 100, y: 50, width: 120, height: 140 } },
      { box: { x: 250, y: 20, width: 30, height: 30 } }
    ]
  };
  demo.describeFace = async (video, box) => { described.push(box); return [0.1, 0.2]; };

  const descriptor = await demo.readFace({ videoWidth: 320, videoHeight: 240 });

  assert.deepEqual(descriptor, [0.1, 0.2]);
  assert.equal(described.length, 1, "alleen één gezicht krijgt kenmerken");
  assert.deepEqual(described[0], { x: 100, y: 50, width: 120, height: 140 });
});
