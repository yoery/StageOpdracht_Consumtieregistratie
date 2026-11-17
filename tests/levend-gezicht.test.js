// Tests voor versie 3.23: de stille controle op een levend gezicht (FaceLiveness, FACE_DEMO.liveness).
// Een foto van een collega, geprint of op een telefoon, mag niet als die collega worden herkend en mag
// niet als gezicht worden ingesteld. De medewerker hoeft niets te doen: de controle kijkt mee tijdens het
// herkennen of het gezicht knippert of licht vervormt. Een foto beweegt als één plat geheel.
// Met nagebootste gezichtspunten (helpers-gezicht.js), een nep-camera en zonder face-api.
import test from "node:test";
import assert from "node:assert/strict";

import { FaceLiveness } from "../assets/js/FaceLiveness.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { CsvExport } from "../assets/js/CsvExport.js";
import { BadgeReader } from "../assets/js/BadgeReader.js";
import { SmartFridge } from "../assets/js/fridge/SmartFridge.js";
import { SMART_FRIDGE, STANDBY, FACE_DEMO } from "../assets/js/config.js";
import { createModel, addEmployee, createRecordingView } from "./helpers.js";
import { face3d, project, photo, jitter } from "./helpers-gezicht.js";

const SETTINGS = FACE_DEMO.liveness;
const STEP = 333; // zo vaak kijkt het automatisch scannen (FACE_DEMO.autoScan.detectIntervalMs)
const HEAD = face3d();
const STRAIGHT = project(HEAD);
const descriptor = (value) => new Array(128).fill(value);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Een foto die in de hand wordt gehouden: hij schuift, draait, wordt groter en kantelt een beetje, met
// een kleine ruis van de detectie.
const photoFrames = (count, noise = 0.5) => Array.from({ length: count }, (_, index) =>
  jitter(photo(STRAIGHT, { dx: index * 2, dy: -index, angle: index * 1.5, scale: 1 + index * 0.02, shear: index * 0.01 }), noise, index + 1));

// Een echt hoofd dat licht heen en weer beweegt (een paar graden), met dezelfde ruis.
const headFrames = (count, degrees = 8, noise = 0.5) => Array.from({ length: count }, (_, index) =>
  jitter(project(HEAD, { yaw: index % 2 ? degrees : -degrees / 2, pitch: index % 3 }), noise, index + 1));

// Laat de controle `frames` zien, één beeld per STEP. Geeft de uitkomsten per beeld terug.
const show = (liveness, frames, start = 0) => frames.map((points, index) => liveness.check(points, start + index * STEP));

// ------------------------------------------------------------------
// FaceLiveness: de rekenregels
// ------------------------------------------------------------------

test("FaceLiveness: een foto die schuift, draait en kantelt is nooit levend en faalt na maxMs", () => {
  const liveness = new FaceLiveness(SETTINGS);
  const frames = photoFrames(Math.ceil(SETTINGS.maxMs / STEP) + 2);
  const results = show(liveness, frames);

  assert.equal(results.includes("alive"), false);
  assert.equal(results.at(-1), "failed");
  assert.equal(results[0], "checking");
  assert.equal(FaceLiveness.deformation(STRAIGHT, photo(STRAIGHT, { dx: 9, angle: 12, scale: 1.2, shear: 0.15 })) < 1e-9, true, "een plat vlak blijft een plat vlak");
});

test("FaceLiveness: een echt hoofd dat een paar graden beweegt, is binnen een paar beelden levend", () => {
  const liveness = new FaceLiveness(SETTINGS);
  const results = show(liveness, headFrames(6));
  assert.equal(results.includes("alive"), true);
  assert.ok(results.indexOf("alive") <= 3, `levend na ${results.indexOf("alive") + 1} beelden`);
  assert.equal(liveness.check(null, 10 * SETTINGS.maxMs), "alive", "eenmaal levend blijft levend tot reset");
});

test("FaceLiveness: een knipper telt als levend, ook als het hoofd helemaal stil staat", () => {
  const liveness = new FaceLiveness(SETTINGS);
  const open = project(face3d());
  const closed = project(face3d({ eyeOpen: 0.08 }));
  assert.deepEqual(show(liveness, [open, open, closed]), ["checking", "checking", "alive"]);
  assert.ok(FaceLiveness.eyesRatio(closed) < SETTINGS.blinkRatio * FaceLiveness.eyesRatio(open));
});

test("FaceLiveness: een stilstaand hoofd zonder knipper is na maxMs niet levend (de foto-grens geldt voor iedereen)", () => {
  const liveness = new FaceLiveness(SETTINGS);
  const frames = Array.from({ length: Math.ceil(SETTINGS.maxMs / STEP) + 1 }, (_, index) => jitter(STRAIGHT, 0.5, index + 1));
  assert.equal(show(liveness, frames).at(-1), "failed");
});

test("FaceLiveness: zonder gezichtspunten telt alleen de tijd, en reset begint opnieuw zonder punten", () => {
  const liveness = new FaceLiveness(SETTINGS);
  assert.equal(liveness.check(null, 0), "checking");
  assert.equal(liveness.check(null, SETTINGS.maxMs), "failed");

  liveness.reset();
  liveness.check(STRAIGHT, 0);
  assert.equal(liveness.frames.length, 1);
  liveness.reset();
  assert.deepEqual(liveness.frames, []);
  assert.equal(liveness.startedAt, null);
});

test("FaceLiveness: gezichtspunten staan hooguit windowMs in het geheugen en worden na 'levend' gewist", () => {
  const liveness = new FaceLiveness(SETTINGS);
  const frames = photoFrames(12);
  show(liveness, frames);
  const oldest = Math.min(...liveness.frames.map(({ time }) => time));
  assert.ok((frames.length - 1) * STEP - oldest <= SETTINGS.windowMs);

  const alive = new FaceLiveness(SETTINGS);
  show(alive, headFrames(6));
  assert.deepEqual(alive.frames, []);
});

test("FaceLiveness: met enabled false is ieder gezicht levend (niet aan te raden, maar in te stellen)", () => {
  const liveness = new FaceLiveness({ ...SETTINGS, enabled: false });
  assert.equal(liveness.check(STRAIGHT, 0), "alive");
});

test("FaceLiveness: debug zet de gemeten waarden in de console, zonder gezichtspunten", () => {
  const liveness = new FaceLiveness({ ...SETTINGS, debug: true });
  const logged = [];
  const original = console.info;
  console.info = (...args) => logged.push(args);
  try {
    show(liveness, photoFrames(2));
  } finally {
    console.info = original;
  }
  assert.equal(logged.length, 2);
  assert.deepEqual(Object.keys(logged[1][1]), ["frames", "eyes", "deformation"]);
});

test("instellingen: FACE_DEMO.liveness staat aan met de waarden uit het TO", () => {
  assert.deepEqual(FACE_DEMO.liveness, { enabled: true, windowMs: 3000, maxMs: 5000, blinkRatio: 0.6, minDeformation: 0.03, minFrames: 2, debug: false });
});

// ------------------------------------------------------------------
// FaceRecognitionDemo: de gezichtspunten van describeFace en checkLiveness
// ------------------------------------------------------------------

// Een nagebootste face-api die bij detectSingleFace de gegeven punten als gezichtspunten teruggeeft.
const fakeFaceApi = (points) => ({
  TinyFaceDetectorOptions: class {},
  detectSingleFace: () => ({
    withFaceLandmarks: () => ({
      withFaceDescriptor: async () => ({ descriptor: Float32Array.from(descriptor(0.1)), landmarks: { positions: points } })
    })
  })
});

const withCanvas = async (action) => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
  try {
    return await action();
  } finally {
    globalThis.document = previous;
  }
};

test("FaceRecognitionDemo: describeFace geeft de gezichtspunten door aan checkLiveness, die ze daarna vergeet", async () => {
  const demo = new FaceRecognitionDemo(FACE_DEMO, {});
  demo.faceapi = fakeFaceApi(STRAIGHT);
  const video = { videoWidth: 320, videoHeight: 240 };
  const box = { x: 110, y: 60, width: 100, height: 120 };

  await withCanvas(() => demo.describeFace(video, box));
  assert.equal(demo.lastLandmarks.length, 68);
  assert.equal(demo.checkLiveness(0), "checking");
  assert.equal(demo.lastLandmarks, null);

  // Een foto blijft "checking" en faalt na maxMs. resetConfirmation begint opnieuw.
  assert.equal(demo.checkLiveness(SETTINGS.maxMs), "failed");
  demo.resetConfirmation();
  assert.deepEqual(demo.liveness.frames, []);
  assert.equal(demo.liveness.startedAt, null);
});

test("FaceRecognitionDemo: een echt hoofd is na een paar keer describeFace levend", async () => {
  const demo = new FaceRecognitionDemo(FACE_DEMO, {});
  const video = { videoWidth: 320, videoHeight: 240 };
  const box = { x: 110, y: 60, width: 100, height: 120 };
  const results = [];
  for (const [index, points] of headFrames(5).entries()) {
    demo.faceapi = fakeFaceApi(points);
    await withCanvas(() => demo.describeFace(video, box));
    results.push(demo.checkLiveness(index * STEP));
  }
  assert.equal(results.includes("alive"), true);
});

// ------------------------------------------------------------------
// In de app: "Herken mij" (en de scan na een tik) en het instellen
// ------------------------------------------------------------------

const MODALS = ["#adminModal", "#employeeProductsModal", "#fridgeModal", "#faceOfferModal", "#faceModal"];

// De app met de echte FaceRecognitionDemo. readFace geeft steeds het gezicht van employee-1 terug, met
// de volgende gezichtspunten uit `frames` (een foto of een echt hoofd). De bibliotheek telt als geladen.
const createApp = async (frames, liveness = {}) => {
  const { model } = createModel();
  model.state.employees[0].badgeId = "04A1B2C3";
  addEmployee(model);
  const view = createRecordingView();
  for (const selector of MODALS) view.$(selector).classList.add("hidden");
  view.$("#faceVideo").play = async () => {};
  view.$("#startScreen").classList.add("hidden");
  const mediaDevices = {
    getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
    enumerateDevices: async () => [{ kind: "videoinput" }]
  };
  const demo = new FaceRecognitionDemo({ ...FACE_DEMO, scanTimeoutMs: 1500, scanMode: "tap", liveness: { ...SETTINGS, maxMs: 900, ...liveness } }, mediaDevices);
  demo.load = async () => {};
  demo.faceapi = {};
  let index = 0;
  demo.readFace = async () => {
    demo.lastLandmarks = frames[Math.min(index, frames.length - 1)];
    index += 1;
    return descriptor(0.1);
  };
  const reader = new BadgeReader({ enabled: true, minLength: 4, maxKeyIntervalMs: 40, endDelayMs: 120 }, { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} });
  const fridge = SmartFridge.createSimulated({ ...SMART_FRIDGE, enabled: false }, { clock: { now: () => Date.now(), setInterval, clearInterval, setTimeout, clearTimeout } });
  const app = new RegistrationApp(model, view, new CsvExport(model), demo, reader, undefined, fridge);
  app.recognition.recognitionTargetSetting = "products";
  app.standby.standbySettings = { ...STANDBY, enabled: false };
  globalThis.document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? MODALS.map((modal) => view.$(modal)).filter((element) => !element.classList.contains("hidden")) : [])
  };
  await demo.detectCamera();
  return { app, model, view, demo };
};

test("instellen: een foto wordt niet als gezicht ingesteld, ook niet met de pas en het vinkje", async () => {
  const { app, model, view, demo } = await createApp(photoFrames(20));
  app.openEmployeeProducts("employee-1", { recognizedBy: "badge" });
  assert.equal(app.startFaceEnrollment(), true);
  await wait(10);
  view.$("#faceConsent").checked = true;
  await app.captureEnrollment();

  assert.equal(model.faceEnrollment("employee-1") ?? null, null);
  assert.equal(demo.isEnrolled("employee-1"), false);
  assert.match(view.$("#faceStatus").textContent, /Geen gezicht gevonden\. Plaats je gezicht binnen het kader en probeer het opnieuw\./);
  app.closeFaceModal();
});

test("instellen: een echt hoofd wordt wel ingesteld", async () => {
  const { app, model, view, demo } = await createApp(headFrames(20));
  app.openEmployeeProducts("employee-1", { recognizedBy: "badge" });
  assert.equal(app.startFaceEnrollment(), true);
  await wait(10);
  view.$("#faceConsent").checked = true;
  await app.captureEnrollment();

  assert.notEqual(model.faceEnrollment("employee-1") ?? null, null);
  assert.equal(demo.isEnrolled("employee-1"), true);
});

test("herkennen in het cameravenster: een foto van een ingestelde collega opent niets", async () => {
  const { app, model, view, demo } = await createApp(photoFrames(40));
  model.saveFaceEnrollment("employee-1", descriptor(0.1));
  app.loadSavedFaces();

  await app.openFaceModal("recognize");
  await wait(1700);

  assert.equal(app.selectedEmployeeId, null);
  assert.equal(app.recognizedBy, null);
  assert.match(view.$("#faceStatus").textContent, /Niet herkend/);
  assert.equal(demo.isEnrolled("employee-1"), true);
});

test("herkennen in het cameravenster: een echt hoofd wordt herkend", async () => {
  const { app, model, view } = await createApp(headFrames(40));
  model.saveFaceEnrollment("employee-1", descriptor(0.1));
  app.loadSavedFaces();

  await app.openFaceModal("recognize");
  await wait(1700);

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.recognizedBy, "face");
});
