// Tests voor versie 3.22: gezichtsherkenning veilig instellen (TO hoofdstuk 13, risico "Registreren op
// naam van een ander", en bijlage B punt 8).
//   - Zelf instellen kan alleen na herkenning met de pas (de vraag na een passcan, of de link in het
//     productvenster als dat opende na de pas). Na kiezen op naam staat de link er niet en weigert de
//     controller het instellen. Zo kan niemand zijn eigen gezicht onder de naam van een collega zetten.
//   - Zelf uitzetten kan alleen na herkenning met de pas of de camera, niet na kiezen op naam.
//   - De beheerder kan per medewerker instellen en uitzetten in het tabblad Medewerkers, alleen ingelogd.
//   - Na een jaar verloopt een instelling. Opnieuw instellen kan alleen na de pas of via de beheerder,
//     altijd met een nieuw toestemmingsvinkje. Het moment van toestemming (consentAt) wordt bewaard.
// Met een nep-klok, een nep-camera (mediaDevices) en zonder face-api.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { DataStore } from "../assets/js/DataStore.js";
import { CsvExport } from "../assets/js/CsvExport.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { BadgeReader } from "../assets/js/BadgeReader.js";
import { SmartFridge } from "../assets/js/fridge/SmartFridge.js";
import { FaceController } from "../assets/js/controllers/FaceController.js";
import { SMART_FRIDGE, STANDBY, FACE_DEMO, RECOGNITION_TARGET } from "../assets/js/config.js";
import { createModel, addEmployee, createRecordingView, createFakeElement, createStore, fakeLocalStorage } from "./helpers.js";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 27, 8, 0);
const face = (value) => new Array(128).fill(value);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Nep-klok zonder echte timers (zoals in standby-en-gezicht.test.js).
const createClock = (start = START) => {
  const timers = new Map();
  let nextId = 1;
  const clock = {
    time: start,
    now: () => clock.time,
    setInterval: (action, delay) => { const id = nextId++; timers.set(id, { action, at: clock.time + delay, every: delay }); return id; },
    clearInterval: (id) => timers.delete(id),
    setTimeout: (action, delay) => { const id = nextId++; timers.set(id, { action, at: clock.time + delay, once: true }); return id; },
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

// Nep-camera: telt hoe vaak de camera aangaat.
const createCamera = ({ hasCamera = true } = {}) => {
  const camera = { starts: 0, on: false };
  camera.mediaDevices = {
    getUserMedia: async () => {
      camera.starts += 1;
      camera.on = true;
      return { getTracks: () => [{ stop: () => { camera.on = false; } }] };
    },
    enumerateDevices: async () => (hasCamera ? [{ kind: "videoinput" }] : [{ kind: "audioinput" }])
  };
  return camera;
};

const MODALS = ["#adminModal", "#employeeProductsModal", "#fridgeModal", "#faceOfferModal", "#faceModal"];

// Controller met een nep-view, nep-klok en nep-camera. employee-1 (Test Medewerker) heeft pas 04A1B2C3.
// Na herkennen opent het productvenster (geen koelkast), zodat de test het venster kan bekijken.
const createApp = async ({ hasCamera = true, faceSettings = {}, seen = () => face(0.2) } = {}) => {
  const { model } = createModel();
  model.state.employees[0].badgeId = "04A1B2C3";
  addEmployee(model);
  const view = createRecordingView();
  for (const selector of MODALS) view.$(selector).classList.add("hidden");
  view.$("#faceVideo").play = async () => {};
  view.$("#startScreen").classList.add("hidden");
  const clock = createClock();
  const camera = createCamera({ hasCamera });
  const demo = new FaceRecognitionDemo({ ...FACE_DEMO, scanTimeoutMs: 60, wakeScanMs: 60, scanMode: "tap", ...faceSettings }, camera.mediaDevices);
  demo.load = async () => {};
  demo.readFace = async () => seen();
  const reader = new BadgeReader({ enabled: true, minLength: 4, maxKeyIntervalMs: 40, endDelayMs: 120 }, { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} });
  const fridge = SmartFridge.createSimulated({ ...SMART_FRIDGE, enabled: false }, { clock });
  const app = new RegistrationApp(model, view, new CsvExport(model), demo, reader, clock, fridge);
  app.recognition.recognitionTargetSetting = "products";
  app.standby.standbySettings = { ...STANDBY, enabled: false };
  globalThis.document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? MODALS.map((modal) => view.$(modal)).filter((element) => !element.classList.contains("hidden")) : [])
  };
  await demo.detectCamera();
  return { app, model, view, clock, camera, demo };
};

const isOpen = (view, selector) => !view.$(selector).classList.contains("hidden");
const toastTexts = (view) => view.toasts.map(({ message }) => message);
const logLines = (model) => model.auditLog.map(({ action, details }) => [action, details]);
const lastFaceArea = (view) => view.calls.filter(([name]) => name === "renderEmployeeProducts").at(-1)?.[3];

// Een gezicht vastleggen in het venster dat nu open is: het vinkje zetten en op Gezicht vastleggen klikken.
const captureWithConsent = async (app, view) => {
  await wait(10); // de camera staat aan
  view.$("#faceConsent").checked = true;
  await app.captureEnrollment();
};

// De regel over gezichtsherkenning in het productvenster, met de echte view.
const faceArea = (face) => new RegistrationView(createModel().model).faceAreaHtml({ available: true, camera: true, badgeReader: true, ...face });

// ------------------------------------------------------------------
// Productvenster: wat er staat na kiezen op naam, na de pas en na de camera
// ------------------------------------------------------------------

test("productvenster: na kiezen op naam geen link en geen Uitzetten, wel de uitleg met de pas of de beheerder", () => {
  for (const enrolled of [false, true]) {
    const html = faceArea({ enrolled });
    assert.equal(html.includes("data-face-enroll"), false);
    assert.equal(html.includes("data-face-forget"), false);
    assert.equal(html.includes("Gezichtsherkenning staat aan"), false, "niet te zien of een collega het gebruikt");
    assert.match(html, /Gezichtsherkenning instellen\? Houd je pas tegen de lezer of vraag het de beheerder\./);
  }
  assert.match(faceArea({ badgeReader: false }), /Gezichtsherkenning instellen\? Vraag het de beheerder\./);
});

test("productvenster: na de pas de link als er nog niets is ingesteld, anders Uitzetten", () => {
  assert.match(faceArea({ recognizedByBadge: true, enrolled: false }), /data-face-enroll[^>]*>.*Gezichtsherkenning instellen \(demo\)/s);
  const enrolled = faceArea({ recognizedByBadge: true, enrolled: true });
  assert.equal(enrolled.includes("data-face-enroll"), false);
  assert.equal(enrolled.includes("data-face-forget"), true);
});

test("productvenster: na de camera geen instellen, wel Uitzetten van het eigen gezicht", () => {
  const html = faceArea({ recognized: true, enrolled: true });
  assert.equal(html.includes("data-face-enroll"), false);
  assert.equal(html.includes("data-face-forget"), true);
  assert.equal(faceArea({ recognized: true, enrolled: false }), "");
});

test("productvenster: zonder camera of met de demo uit staat er geen link en geen uitleg", () => {
  assert.equal(faceArea({ camera: false }), "");
  assert.equal(faceArea({ camera: false, recognizedByBadge: true }), "");
  assert.equal(faceArea({ available: false, recognizedByBadge: true }), "");
  assert.equal(faceArea({ camera: false, recognizedByBadge: true, enrolled: true }).includes("data-face-forget"), true, "uitzetten kan ook zonder camera");
});

test("productvenster: de controller geeft door hoe de medewerker is herkend en of er een camera is", async () => {
  const { app, view } = await createApp();
  app.openEmployeeProducts("employee-1");
  assert.deepEqual(
    (({ recognized, recognizedByBadge, camera, badgeReader }) => ({ recognized, recognizedByBadge, camera, badgeReader }))(lastFaceArea(view)),
    { recognized: false, recognizedByBadge: false, camera: true, badgeReader: true }
  );
});

// ------------------------------------------------------------------
// Controller: zelf instellen en uitzetten
// ------------------------------------------------------------------

test("instellen na kiezen op naam: geweigerd, de camera gaat niet aan en er wordt niets bewaard", async () => {
  const { app, model, view, camera } = await createApp();
  app.openEmployeeProducts("employee-2"); // de naam van een collega aangetikt

  assert.equal(app.canSelfEnroll(), false);
  assert.equal(app.startFaceEnrollment(), false);
  assert.equal(app.startFaceEnrollmentFor("employee-2", () => {}), false, "zonder pas");
  assert.equal(app.startFaceEnrollmentFor("employee-2", () => {}, "face"), false, "na de camera");
  await wait(10);

  assert.equal(isOpen(view, "#faceModal"), false);
  assert.equal(camera.starts, 0);
  assert.equal(app.faceMode, null);
  assert.deepEqual(model.faceEnrollments, []);
  assert.deepEqual(model.auditLog, []);
  assert.equal(toastTexts(view).at(-1), "Gezichtsherkenning instellen kan alleen na herkenning met je pas, of via de beheerder.");
});

test("instellen na de pas: de link opent het instelvenster met het vinkje uit, vastleggen bewaart met toestemmingsmoment", async () => {
  const { app, model, view, demo } = await createApp();
  app.openEmployeeProducts("employee-1", { recognizedBy: "badge" });

  assert.equal(app.canSelfEnroll(), true);
  view.$("#faceConsent").checked = true; // een oud vinkje telt niet
  assert.equal(app.startFaceEnrollment(), true);
  assert.equal(isOpen(view, "#faceModal"), true);
  assert.equal(view.$("#faceConsent").checked, false);
  assert.equal(view.$("#faceTitle").textContent, "Gezichtsherkenning instellen voor Test Medewerker");
  await captureWithConsent(app, view);

  const entry = model.faceEnrollment("employee-1");
  assert.equal(entry.consentAt, entry.enrolledAt);
  assert.equal(demo.isEnrolled("employee-1"), true);
  assert.deepEqual(logLines(model), [["Gezichtsherkenning ingesteld", "Test Medewerker"]]);
});

test("instellen na de pas via de vraag: Ja opent het instelvenster (how is badge)", async () => {
  const { app, view } = await createApp();
  app.recognizeBadge("04A1B2C3");
  assert.equal(isOpen(view, "#faceOfferModal"), true);

  app.acceptFaceOffer();
  assert.equal(isOpen(view, "#faceModal"), true);
  assert.equal(app.faceEmployeeId, "employee-1");
  app.closeFaceModal();
});

test("instellen na de camera: geen link en geweigerd, wel Uitzetten van het eigen gezicht", async () => {
  const { app, model, view, demo } = await createApp();
  model.saveFaceEnrollment("employee-1", face(0.1));
  app.loadSavedFaces();
  app.openEmployeeProducts("employee-1", { recognizedBy: "face" });

  assert.equal(app.canSelfEnroll(), false);
  assert.equal(app.startFaceEnrollment(), false);
  assert.equal(app.canSelfForget(), true);
  assert.equal(app.forgetFace(), true);

  assert.deepEqual(model.faceEnrollments, []);
  assert.equal(demo.isEnrolled("employee-1"), false);
  assert.deepEqual(logLines(model), [["Gezichtsherkenning uitgezet", "Test Medewerker"]]);
  assert.equal(isOpen(view, "#faceModal"), false);
});

test("uitzetten na kiezen op naam: geweigerd, het gezicht van de collega blijft ingesteld", async () => {
  const { app, model, view, demo } = await createApp();
  model.saveFaceEnrollment("employee-2", face(0.1));
  app.loadSavedFaces();
  app.openEmployeeProducts("employee-2");

  assert.equal(app.canSelfForget(), false);
  assert.equal(app.forgetFace(), false);

  assert.equal(model.faceEnrollments.length, 1);
  assert.equal(demo.isEnrolled("employee-2"), true);
  assert.deepEqual(model.auditLog, []);
  assert.equal(toastTexts(view).at(-1), "Uitzetten kan alleen na herkenning met je pas of de camera, of via de beheerder.");
});

test("een pas tijdens een venster na kiezen op naam: daarna mag instellen wel", async () => {
  const { app, view } = await createApp();
  app.openEmployeeProducts("employee-1");
  view.$("#employeeProductsModal").classList.remove("hidden"); // het venster staat open
  assert.equal(app.canSelfEnroll(), false);
  app.recognizeBadge("04A1B2C3");
  assert.equal(app.recognizedBy, "badge");
  assert.equal(app.canSelfEnroll(), true);
});

// ------------------------------------------------------------------
// Beheerder: instellen en uitzetten in het tabblad Medewerkers
// ------------------------------------------------------------------

test("beheerder: zonder inloggen kan hij niet instellen en niet uitzetten", async () => {
  const { app, model, view, camera } = await createApp();
  model.saveFaceEnrollment("employee-2", face(0.1));

  assert.equal(app.startAdminFaceEnrollment("employee-1"), false);
  assert.equal(app.adminForgetFace("employee-2"), false);
  await wait(10);

  assert.equal(isOpen(view, "#faceModal"), false);
  assert.equal(camera.starts, 0);
  assert.equal(model.faceEnrollments.length, 1);
  assert.deepEqual(toastTexts(view), ["Log eerst in als beheerder.", "Log eerst in als beheerder."]);
});

test("beheerder: instellen opent het cameravenster, de medewerker zet zelf het vinkje, logboekregel zonder kenmerken", async () => {
  const { app, model, view, demo } = await createApp({ seen: () => face(0.271828) });
  app.adminLoggedIn = true;

  assert.equal(app.startAdminFaceEnrollment("employee-1"), true);
  assert.equal(app.enrollByAdmin, true);
  assert.equal(isOpen(view, "#faceModal"), true);
  assert.equal(view.$("#faceConsent").checked, false);
  assert.equal(view.$("#faceHelp").textContent, "Laat Test Medewerker zelf in de camera kijken en het vinkje zetten. Klik daarna op Gezicht vastleggen.");

  // Zonder vinkje niets.
  await wait(10);
  await app.captureEnrollment();
  assert.deepEqual(model.faceEnrollments, []);

  view.$("#faceConsent").checked = true;
  await app.captureEnrollment();

  const entry = model.faceEnrollment("employee-1");
  assert.equal(entry.consentAt, entry.enrolledAt);
  assert.equal(demo.isEnrolled("employee-1"), true);
  assert.equal(isOpen(view, "#faceModal"), false);
  assert.equal(app.enrollByAdmin, false);
  assert.deepEqual(logLines(model), [["Gezichtsherkenning ingesteld door beheerder", "Test Medewerker"]]);
  const log = JSON.stringify(model.auditLog);
  assert.equal(log.includes("0.271828"), false, "geen kenmerken in het logboek");
  assert.equal(log.includes("consentAt"), false, "geen toestemmingsmoment als veld in het logboek");
  assert.ok(view.calls.some(([name]) => name === "renderAdminEmployees"), "de lijst toont de nieuwe status");
});

test("beheerder: uitzetten wist de kenmerken met de logboekregel 'uitgezet door beheerder'", async () => {
  const { app, model, view, demo } = await createApp();
  model.saveFaceEnrollment("employee-2", face(0.1));
  app.loadSavedFaces();
  app.adminLoggedIn = true;

  assert.equal(app.adminForgetFace("employee-2"), true);

  assert.deepEqual(model.faceEnrollments, []);
  assert.equal(demo.isEnrolled("employee-2"), false);
  assert.deepEqual(logLines(model), [["Gezichtsherkenning uitgezet door beheerder", "Tweede Medewerker"]]);
  assert.equal(toastTexts(view).at(-1), "Gezichtsherkenning staat uit voor Tweede Medewerker. De kenmerken zijn gewist.");
});

test("beheerder: zonder camera, met de demo uit of voor een inactieve medewerker opent de camera niet", async () => {
  const noCamera = await createApp({ hasCamera: false });
  noCamera.app.adminLoggedIn = true;
  assert.equal(noCamera.app.faceSetupState(), "noCamera");
  assert.equal(noCamera.app.startAdminFaceEnrollment("employee-1"), false);
  assert.equal(toastTexts(noCamera.view).at(-1), "Geen camera gevonden op deze tablet. Instellen kan alleen met een camera.");

  const off = await createApp({ faceSettings: { enabled: false } });
  off.app.adminLoggedIn = true;
  assert.equal(off.app.faceSetupState(), "off");
  assert.equal(off.app.startAdminFaceEnrollment("employee-1"), false);
  assert.equal(toastTexts(off.view).at(-1), "De demo gezichtsherkenning staat uit.");

  const inactive = await createApp();
  inactive.app.adminLoggedIn = true;
  inactive.model.setEmployeeActive("employee-2", false);
  assert.equal(inactive.app.startAdminFaceEnrollment("employee-2"), false);
  assert.equal(inactive.app.startAdminFaceEnrollment("bestaat-niet"), false);

  for (const { camera } of [noCamera, off, inactive]) assert.equal(camera.starts, 0);
});

test("beheerder: uitgelogd tijdens het instellen (automatisch of met de knop): het venster sluit en er wordt niets bewaard", async () => {
  const { app, model, view, camera } = await createApp();
  app.adminLoggedIn = true;
  app.startAdminFaceEnrollment("employee-1");
  await wait(10);
  app.closeAdmin(); // zoals bij automatisch uitloggen (logoutIfIdle)
  assert.equal(isOpen(view, "#faceModal"), false);
  assert.equal(camera.on, false);

  // Uitgelogd terwijl het venster nog open staat: vastleggen bewaart niets.
  app.adminLoggedIn = true;
  app.startAdminFaceEnrollment("employee-1");
  await wait(10);
  app.adminLoggedIn = false;
  view.$("#faceConsent").checked = true;
  await app.captureEnrollment();
  assert.deepEqual(model.faceEnrollments, []);
  assert.equal(view.$("#faceStatus").textContent, "Je bent uitgelogd als beheerder. Er is niets ingesteld.");
  assert.deepEqual(model.auditLog, []);
});

test("beheer, tabblad Medewerkers: knop instellen, vervaldatum met Uitzetten, zonder camera uitgeschakeld met uitleg", () => {
  const { model } = createModel();
  addEmployee(model);
  addEmployee(model, { id: "employee-3", name: "Inactief Iemand", active: false });
  const enrolledAt = new Date(2026, 9, 27, 12, 0);
  model.saveFaceEnrollment("employee-2", face(0.1), enrolledAt);
  const view = new RegistrationView(model);
  const elements = { "#employeeManagementSearch": createFakeElement(), "#adminEmployeeList": createFakeElement({ innerHTML: "" }) };
  view.$ = (selector) => elements[selector];
  const render = (state) => {
    view.faceSetup = () => ({ state, validityDays: 365 });
    view.renderAdminEmployees();
    return elements["#adminEmployeeList"].innerHTML;
  };

  const ready = render("ready");
  assert.match(ready, /data-admin-face="employee-1" data-admin-face-action="enroll"\s+aria-label="Gezichtsherkenning instellen voor Test Medewerker">Gezichtsherkenning instellen<\/button>/);
  assert.match(ready, /Gezichtsherkenning ingesteld tot 27-10-2027/);
  assert.match(ready, /data-admin-face="employee-2" data-admin-face-action="forget"\s+aria-label="Gezichtsherkenning uitzetten voor Tweede Medewerker">Uitzetten<\/button>/);
  assert.equal(ready.includes('data-admin-face="employee-3"'), false, "niet bij een inactieve medewerker");

  const noCamera = render("noCamera");
  assert.match(noCamera, /data-admin-face="employee-1" data-admin-face-action="enroll" aria-disabled="true"/);
  assert.match(noCamera, /Geen camera gevonden\. Instellen kan alleen met een camera\./);
  assert.match(noCamera, /data-admin-face="employee-2" data-admin-face-action="forget"/, "uitzetten kan zonder camera");

  assert.equal(render("off").includes("data-admin-face"), false, "demo uit: geen knoppen");
  view.faceSetup = null;
  view.renderAdminEmployees();
  assert.equal(elements["#adminEmployeeList"].innerHTML.includes("data-admin-face"), false);
});

test("beheer: een klik op de knop gaat naar instellen of uitzetten", async () => {
  const { app } = await createApp();
  const called = [];
  app.startAdminFaceEnrollment = (id) => called.push(["enroll", id]);
  app.adminForgetFace = (id) => called.push(["forget", id]);
  const button = (action) => ({ dataset: { adminFace: "employee-2", adminFaceAction: action } });
  for (const action of ["enroll", "forget"]) {
    const target = button(action);
    app.handleClick({ target: { closest: (selector) => (selector === "[data-admin-face]" ? target : null) } });
  }
  assert.deepEqual(called, [["enroll", "employee-2"], ["forget", "employee-2"]]);
});

// ------------------------------------------------------------------
// Na een jaar: verlopen en opnieuw instellen (alleen na de pas of via de beheerder)
// ------------------------------------------------------------------

test("verlopen: na 365 dagen zijn de kenmerken gewist en herkent de camera de medewerker niet meer", async () => {
  const { app, model, view, demo } = await createApp({ seen: () => face(0.2) });
  app.openEmployeeProducts("employee-1", { recognizedBy: "badge" });
  app.startFaceEnrollment();
  await captureWithConsent(app, view);
  app.closeEmployeeProducts();
  const enrolledAt = Date.parse(model.faceEnrollment("employee-1").enrolledAt);

  assert.deepEqual(app.expireFaces(new Date(enrolledAt + 364 * DAY)), []);
  assert.equal(demo.findMatch(face(0.2), ["employee-1"]), "employee-1");

  assert.deepEqual(app.expireFaces(new Date(enrolledAt + 365 * DAY)), ["employee-1"]);
  assert.equal(model.faceEnrollment("employee-1"), undefined);
  assert.equal(model.faceOfferAnswer("employee-1"), "expired");
  assert.equal(demo.isEnrolled("employee-1"), false);
  assert.equal(demo.findMatch(face(0.2), ["employee-1"]), null);
  assert.deepEqual(logLines(model).at(-1), ["Gezichtsherkenning verlopen", "Test Medewerker: na een jaar gewist"]);
});

// Een medewerker van wie de instelling een jaar geleden is verlopen (gewist, antwoord "expired").
const expiredApp = async () => {
  const setup = await createApp({ seen: () => face(0.3) });
  const { app, model } = setup;
  model.saveFaceEnrollment("employee-1", face(0.2), new Date(Date.now() - 366 * DAY));
  app.loadSavedFaces();
  app.expireFaces();
  model.state.auditLog = [];
  return setup;
};

test("verlopen: opnieuw instellen na de pas, met de vraag 'verlopen', een nieuw vinkje en een nieuw toestemmingsmoment", async () => {
  const { app, model, view, demo } = await expiredApp();
  app.recognizeBadge("04A1B2C3");
  assert.equal(isOpen(view, "#faceOfferModal"), true);
  assert.equal(view.$("#faceOfferTitle").textContent, "Je gezichtsherkenning is verlopen. Opnieuw instellen?");

  view.$("#faceConsent").checked = true; // het oude vinkje telt niet
  app.acceptFaceOffer();
  assert.equal(view.$("#faceConsent").checked, false, "het vinkje staat uit");
  await wait(10);
  await app.captureEnrollment();
  assert.equal(model.faceEnrollment("employee-1"), undefined, "zonder nieuw vinkje niets ingesteld");

  const before = Date.now();
  view.$("#faceConsent").checked = true;
  await app.captureEnrollment();

  const entry = model.faceEnrollment("employee-1");
  assert.ok(Date.parse(entry.consentAt) >= before, "een nieuw toestemmingsmoment");
  assert.equal(entry.consentAt, entry.enrolledAt);
  assert.equal(model.faceOfferAnswer("employee-1"), null);
  assert.equal(demo.isEnrolled("employee-1"), true);
  assert.deepEqual(logLines(model), [["Gezichtsherkenning opnieuw ingesteld", "Test Medewerker"]]);
});

test("verlopen: opnieuw instellen na kiezen op naam kan niet", async () => {
  const { app, model, view, camera } = await expiredApp();
  app.openEmployeeProducts("employee-1");

  assert.equal(app.startFaceEnrollment(), false);
  assert.equal(app.startFaceEnrollmentFor("employee-1", () => {}), false);
  await wait(10);
  assert.equal(camera.starts, 0);
  assert.equal(model.faceEnrollment("employee-1"), undefined);
  assert.equal(isOpen(view, "#faceOfferModal"), false, "de vraag komt alleen na de pas");
});

test("verlopen: een Nee wordt onthouden zoals bij de eerste vraag", async () => {
  const { app, model, view } = await expiredApp();
  app.recognizeBadge("04A1B2C3");
  app.declineFaceOffer();
  assert.equal(model.faceOfferAnswer("employee-1"), "declined");
  app.closeEmployeeProducts();

  app.recognizeBadge("04A1B2C3");
  assert.equal(isOpen(view, "#faceOfferModal"), false);
  assert.equal(app.selectedEmployeeId, "employee-1");
});

test("verlopen: de beheerder kan opnieuw instellen, met de logboekregel 'opnieuw ingesteld door beheerder'", async () => {
  const { app, model, view } = await expiredApp();
  app.adminLoggedIn = true;
  app.startAdminFaceEnrollment("employee-1");
  await captureWithConsent(app, view);

  assert.equal(model.hasValidFaceEnrollment("employee-1"), true);
  assert.deepEqual(logLines(model), [["Gezichtsherkenning opnieuw ingesteld door beheerder", "Test Medewerker"]]);
});

// ------------------------------------------------------------------
// Opslag: het moment van toestemming (consentAt)
// ------------------------------------------------------------------

test("opslag: een instelling van vóór 3.22 krijgt consentAt gelijk aan enrolledAt (migratie)", () => {
  fakeLocalStorage();
  const seed = new RegistrationModel(createStore()).state;
  const employeeId = seed.employees[0].id;
  seed.faceEnrollments = [{ id: "f1", employeeId, descriptor: face(0.1), enrolledAt: "2026-10-01T08:00:00.000Z" }];
  localStorage.setItem("test", JSON.stringify(seed));

  const store = new DataStore("test");
  const data = store.load(new Date(START));

  assert.deepEqual(data.faceEnrollments.map(({ consentAt, enrolledAt }) => [consentAt, enrolledAt]), [["2026-10-01T08:00:00.000Z", "2026-10-01T08:00:00.000Z"]]);
  assert.equal(store.loadProblem, null);
});

test("opslag: een ongeldig toestemmingsmoment of toestemming na het instellen valt af bij het laden", () => {
  fakeLocalStorage();
  const seed = new RegistrationModel(createStore()).state;
  const [first, second, third] = seed.employees;
  const valid = { id: "f1", employeeId: first.id, descriptor: face(0.1), enrolledAt: "2026-10-01T08:00:00.000Z", consentAt: "2026-10-01T08:00:00.000Z" };
  seed.faceEnrollments = [
    valid,
    { ...valid, id: "f2", employeeId: second.id, consentAt: "2026-10-02T08:00:00.000Z" },
    { ...valid, id: "f3", employeeId: third.id, consentAt: "gisteren" },
    { ...valid, id: "f4", employeeId: third.id, consentAt: null }
  ];
  localStorage.setItem("test", JSON.stringify(seed));

  const store = new DataStore("test");
  const data = store.load(new Date(START));

  assert.deepEqual(data.faceEnrollments.map(({ id }) => id), ["f1"]);
  assert.equal(store.loadProblem, "skipped");
});

test("opslag: het model weigert toestemming na het moment van instellen", () => {
  const { model } = createModel();
  const enrolledAt = new Date(START);
  assert.equal(model.saveFaceEnrollment("employee-1", face(0.1), enrolledAt, new Date(START + 1000)), false);
  assert.equal(model.saveFaceEnrollment("employee-1", face(0.1), enrolledAt, new Date(Number.NaN)), false);
  assert.deepEqual(model.faceEnrollments, []);
  assert.equal(model.saveFaceEnrollment("employee-1", face(0.1), enrolledAt, new Date(START - 1000)), true);
  assert.equal(model.faceEnrollment("employee-1").consentAt, new Date(START - 1000).toISOString());
  assert.equal(model.faceEnrollmentValidUntil("employee-1", 365).getTime(), START + 365 * DAY);
  assert.equal(model.faceEnrollmentValidUntil("employee-2", 365), null);
});

test("privacy: het toestemmingsmoment en de kenmerken staan niet in de CSV-export", async () => {
  const { app, model, view } = await createApp({ seen: () => face(0.161803) });
  model.addRegistration("employee-1", "blikje");
  app.openEmployeeProducts("employee-1", { recognizedBy: "badge" });
  app.startFaceEnrollment();
  await captureWithConsent(app, view);

  const csv = app.csvExport.toCsv(app.csvExport.buildRows("all", "all"));
  assert.equal(csv.includes("0.161803"), false);
  assert.equal(csv.includes(model.faceEnrollment("employee-1").consentAt), false);
  assert.equal(csv.toLowerCase().includes("toestemming"), false);
});

test("meldingen staan in FaceController.SETUP_MESSAGES, zonder puntkomma", () => {
  for (const message of Object.values(FaceController.SETUP_MESSAGES)) assert.equal(message.includes(";"), false);
});
