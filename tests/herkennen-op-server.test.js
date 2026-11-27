// Tests voor herkennen op de server (security audit AF-07 en AF-08): met een server vergelijkt de
// server de gezichten en zoekt hij de pasnummers op. De kenmerken van gezichten en de pasnummers van
// anderen komen niet in de browser. In de demo (zonder server) blijft herkennen in de browser.
// De server is nagebootst. De namen, pasnummers en kenmerken zijn verzonnen.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { FaceController } from "../assets/js/controllers/FaceController.js";
import { AutoScanController } from "../assets/js/controllers/AutoScanController.js";
import { BadgeController } from "../assets/js/controllers/BadgeController.js";
import { ServerMode } from "../assets/js/ServerMode.js";
import { ServerApi, ServerError } from "../assets/js/ServerApi.js";
import { createModel, addEmployee, createRecordingView, createDataStore } from "./helpers.js";

const DESCRIPTOR = Array(128).fill(0.125);

// Een nagebootste server zoals ServerMode hem aan de controller geeft.
const createServer = ({ face = "employee-1", badge = { ok: true, employeeId: "employee-1" }, link = { ok: true } } = {}) => {
  const server = { role: "device", calls: [], recognitionOffline: false };
  server.recognizeFace = async (descriptor) => { server.calls.push(["face", descriptor]); return typeof face === "function" ? face() : face; };
  server.recognizeBadge = async (code) => { server.calls.push(["badge", code]); return typeof badge === "function" ? badge() : badge; };
  server.linkBadge = async (employeeId, code) => { server.calls.push(["link", employeeId, code]); return link; };
  return server;
};

const createApp = ({ server = createServer(), badgeReader = true } = {}) => {
  const { model, point } = createModel();
  model.state.employees[0].name = "Lotte van Dijk";
  addEmployee(model, { id: "mw-mark", name: "Mark Jansen", companyId: point.companyId, pointId: point.id });
  const view = createRecordingView();
  const faceDemo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, validityDays: 365, scanTimeoutMs: 0 }, { getUserMedia() {} });
  const app = new RegistrationApp(model, view, undefined, faceDemo, { isEnabled: () => badgeReader, handleKey() {} });
  app.server = server;
  app.topModal = () => app.openModalElement ?? null;
  app.afterRecognition = (employeeId, how) => app.recognized.push([employeeId, how]);
  app.recognized = [];
  app.renderProductWindow = () => {};
  return { app, model, view, faceDemo };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ------------------------------------------------------------------
// Gezicht
// ------------------------------------------------------------------

test("herkennen op de server: met een server vraagt de tablet de server wie het gezicht is, en vergelijkt hij zelf niets", async () => {
  const { app, faceDemo } = createApp();
  faceDemo.findMatch = () => { throw new Error("de browser vergelijkt zelf"); };

  assert.equal(await app.matchFace(DESCRIPTOR, ["employee-1"]), "employee-1");
  assert.deepEqual(app.server.calls, [["face", DESCRIPTOR]]);
});

test("herkennen op de server: in de demo vergelijkt de browser zelf met de gezichten in het geheugen", async () => {
  const { app, faceDemo } = createApp({ server: null });
  faceDemo.enroll("employee-1", DESCRIPTOR);

  assert.equal(await app.matchFace(DESCRIPTOR, ["employee-1"]), "employee-1");
  assert.equal(await app.matchFace(Array(128).fill(0.9), ["employee-1"]), null);
});

test("herkennen op de server: een gezicht zonder kenmerken in het geheugen telt als ingesteld, maar wordt nooit vergeleken", () => {
  const faceDemo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5 });
  faceDemo.loadFaces([{ employeeId: "employee-1" }, { employeeId: "mw-mark", descriptor: DESCRIPTOR }]);

  assert.equal(faceDemo.isEnrolled("employee-1"), true);
  assert.equal(faceDemo.findMatch(DESCRIPTOR), "mw-mark");
  assert.equal(faceDemo.findMatch(Array(128).fill(0.9)), null);
});

test("herkennen op de server: op het startscherm telt de uitkomst van de server, twee keer achter elkaar en met een levend gezicht", async () => {
  const { app } = createApp();
  const autoScan = app.autoScan;
  const greeted = [];
  autoScan.greet = (employeeId) => greeted.push(employeeId);
  autoScan.setScanState = () => {};
  app.faceDemo.describeFace = async () => DESCRIPTOR;
  app.faceDemo.checkLiveness = () => "alive";
  autoScan.scanSession = 7;

  await autoScan.recognizeFace({}, 7);
  assert.deepEqual(greeted, [], "na één keer nog niet");
  await autoScan.recognizeFace({}, 7);
  assert.deepEqual(greeted, ["employee-1"]);
  assert.equal(app.server.calls.filter(([kind]) => kind === "face").length, 2);
});

test("herkennen op de server: is het startscherm intussen gestopt, dan telt het antwoord van de server niet", async () => {
  let release;
  const server = createServer({ face: () => new Promise((resolve) => { release = () => resolve("employee-1"); }) });
  const { app } = createApp({ server });
  const autoScan = app.autoScan;
  const greeted = [];
  autoScan.greet = (employeeId) => greeted.push(employeeId);
  autoScan.setScanState = () => {};
  app.faceDemo.describeFace = async () => DESCRIPTOR;
  app.faceDemo.checkLiveness = () => "alive";
  app.faceDemo.confirm = (candidate) => candidate; // meteen bevestigd
  autoScan.scanSession = 3;

  const pending = autoScan.recognizeFace({}, 3);
  await flush();
  autoScan.scanSession = 4; // de camera is gestopt
  release();
  await pending;

  assert.deepEqual(greeted, []);
});

// Een nagebootste server die niet bereikbaar is: zoals ServerMode.recognizeFace dan doet.
const offlineFaceServer = () => {
  const server = createServer();
  server.recognizeFace = async (descriptor) => { server.calls.push(["face", descriptor]); server.recognitionOffline = true; return null; };
  return server;
};

test("herkennen op de server: zonder verbinding zegt het startscherm dat meteen, in plaats van 'niet herkend'", async () => {
  const { app } = createApp({ server: offlineFaceServer() });
  const states = [];
  app.autoScan.setScanState = (state, message) => states.push([state, message]);
  app.faceDemo.describeFace = async () => DESCRIPTOR;
  app.autoScan.scanSession = 2;

  await app.autoScan.recognizeFace({}, 2);

  assert.deepEqual(states.at(-1), ["unknown", AutoScanController.MESSAGES.offline], "al na de eerste poging, niet pas na drie");
  assert.ok(app.autoScan.scanPausedUntil > 0, "daarna een pauze, zodat de tablet niet blijft vragen");
  assert.equal(AutoScanController.MESSAGES.offline, "Herkennen werkt nu niet: geen verbinding met de server. Zoek je naam met de knop hieronder.");
});

test("herkennen op de server: een oude fout van de server telt op het startscherm niet mee", () => {
  const server = createServer();
  server.recognitionOffline = true; // van een eerdere poging
  const { app } = createApp({ server });
  const states = [];
  app.autoScan.setScanState = (state, message) => states.push([state, message]);

  app.autoScan.pauseAfterUnknown(0);

  assert.deepEqual(states, [["unknown", AutoScanController.MESSAGES.notRecognizedSetup]]);
});

test("herkennen op de server: zonder verbinding stopt het cameravenster meteen en zegt het dat", async () => {
  const server = offlineFaceServer();
  const { app, view } = createApp({ server });
  app.faceDemo.readFace = async () => DESCRIPTOR;
  app.face.faceSession = 5;
  app.face.faceMode = "recognize";

  await app.face.scanForFace(5, 60000);

  assert.equal(view.$("#faceStatus").textContent, FaceController.OFFLINE_MESSAGE);
  assert.equal(server.calls.length, 1, "na de eerste keer zonder verbinding vraagt het venster niet opnieuw");
});

test("herkennen op de server: een oude fout van de server telt in het cameravenster niet mee", async () => {
  const server = createServer({ face: null });
  server.recognitionOffline = true; // van een eerdere scan
  const { app, view } = createApp({ server });
  app.face.faceSession = 5;
  app.face.faceMode = "recognize";

  await app.face.scanForFace(5, 0);

  assert.notEqual(view.$("#faceStatus").textContent, FaceController.OFFLINE_MESSAGE);
  assert.match(view.$("#faceStatus").textContent, /^Niet herkend/);
});

// ------------------------------------------------------------------
// Pas
// ------------------------------------------------------------------

test("herkennen op de server: met een server zoekt de server de pas op en opent het productvenster van die medewerker", async () => {
  const { app, model } = createApp();
  model.findEmployeeByBadge = () => { throw new Error("de browser zoekt zelf"); };

  await app.recognizeBadge("04A1B2C3");

  assert.deepEqual(app.server.calls, [["badge", "04A1B2C3"]]);
  assert.deepEqual(app.recognized, [["employee-1", "badge"]]);
});

test("herkennen op de server: een onbekende pas of een inactieve medewerker geeft de gewone melding", async () => {
  const unknown = createApp({ server: createServer({ badge: { ok: true, employeeId: null } }) });
  await unknown.app.recognizeBadge("FFFFFFFF");
  assert.deepEqual(unknown.app.recognized, []);
  assert.equal(unknown.view.toasts.at(-1).message, BadgeController.NOT_LINKED);

  const inactive = createApp({ server: createServer({ badge: { ok: true, employeeId: "mw-mark" } }) });
  inactive.model.findEmployee("mw-mark").active = false;
  await inactive.app.recognizeBadge("AABBCCDD");
  assert.deepEqual(inactive.app.recognized, []);
});

test("herkennen op de server: zonder verbinding zegt een melding dat, en opent er niets", async () => {
  const { app, view } = createApp({ server: createServer({ badge: { ok: false, message: ServerMode.MESSAGES.badgeOffline } }) });

  await app.recognizeBadge("04A1B2C3");

  assert.deepEqual(app.recognized, []);
  assert.equal(view.toasts.at(-1).message, "Herkennen met de pas werkt nu niet: geen verbinding met de server. Zoek je naam in de lijst.");
});

test("herkennen op de server: gaat er tijdens het opzoeken een ander venster open, dan opent het productvenster niet", async () => {
  let release;
  const server = createServer({ badge: () => new Promise((resolve) => { release = () => resolve({ ok: true, employeeId: "employee-1" }); }) });
  const { app, view } = createApp({ server });

  const pending = app.recognizeBadge("04A1B2C3");
  await flush();
  app.openModalElement = { id: "adminModal" };
  release();
  await pending;

  assert.deepEqual(app.recognized, []);
  assert.equal(view.toasts.at(-1).message, BadgeController.CLOSE_WINDOW_FIRST);
});

test("herkennen op de server: opent een collega intussen zijn eigen productvenster, dan vervangt een laat antwoord dat niet", async () => {
  let release;
  const server = createServer({ badge: () => new Promise((resolve) => { release = () => resolve({ ok: true, employeeId: "employee-1" }); }) });
  const { app, view } = createApp({ server });

  const pending = app.recognizeBadge("04A1B2C3");
  await flush();
  app.selectedEmployeeId = "mw-mark";
  app.openModalElement = view.$("#employeeProductsModal");
  release();
  await pending;

  assert.deepEqual(app.recognized, []);
  assert.equal(app.selectedEmployeeId, "mw-mark");
});

test("herkennen op de server: bij twee scans kort na elkaar telt alleen de laatste", async () => {
  let release;
  let calls = 0;
  const server = createServer({
    badge: () => {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => { release = () => resolve({ ok: true, employeeId: "employee-1" }); });
      return { ok: true, employeeId: "mw-mark" };
    }
  });
  const { app } = createApp({ server });

  const first = app.recognizeBadge("04A1B2C3");
  await flush();
  await app.recognizeBadge("AABBCCDD");
  release();
  await first;

  assert.deepEqual(app.recognized, [["mw-mark", "badge"]]);
});

// ------------------------------------------------------------------
// Pas koppelen (Snellere optie instellen)
// ------------------------------------------------------------------

test("herkennen op de server: een pas koppelen gaat via de server, en daarna sluit het venster met een melding", async () => {
  const { app, model, view } = createApp();
  app.selectedEmployeeId = "mw-mark";
  app.startBadgeLink("mw-mark");

  await app.recognizeBadge("AABBCCDD");
  await flush();

  assert.deepEqual(app.server.calls, [["link", "mw-mark", "AABBCCDD"]]);
  assert.equal(app.badgeLinkEmployeeId, null);
  assert.equal(view.toasts.at(-1).message, "Je pas is gekoppeld. Voortaan houd je je pas tegen de lezer.");
  assert.ok(!model.findEmployee("mw-mark").badgeId, "de tablet zet het pasnummer niet zelf");
  assert.deepEqual(model.auditLog, [], "het logboek schrijft de server");
});

test("herkennen op de server: hoort de pas bij iemand anders, dan blijft het venster open met de melding van de server", async () => {
  const message = "Deze pas is al gekoppeld aan iemand anders. Vraag het de beheerder.";
  const { app, view } = createApp({ server: createServer({ link: { ok: false, message } }) });
  app.startBadgeLink("mw-mark");

  app.linkScannedBadge("04A1B2C3");
  await flush();

  assert.equal(app.badgeLinkEmployeeId, "mw-mark");
  assert.equal(view.$("#badgeLinkStatus").textContent, message);
});

test("herkennen op de server: zolang het koppelen loopt, telt een tweede scan niet", async () => {
  let release;
  const server = createServer();
  server.linkBadge = (employeeId, code) => { server.calls.push(["link", employeeId, code]); return new Promise((resolve) => { release = () => resolve({ ok: true }); }); };
  const { app } = createApp({ server });
  app.startBadgeLink("mw-mark");

  app.linkScannedBadge("AABBCCDD");
  app.linkScannedBadge("AABBCCDD");
  release();
  await flush();

  assert.equal(server.calls.length, 1);
});

test("herkennen op de server: wie al een pas heeft (badgeLinked), krijgt de optie 'Pasje' niet", () => {
  const { app, model } = createApp();
  model.findEmployee("mw-mark").badgeLinked = true;

  assert.equal(app.quickSetupOptions("mw-mark").badge, false);
  assert.equal(app.quickSetupOptions("employee-1").badge, true);
});

// ------------------------------------------------------------------
// ServerMode en ServerApi
// ------------------------------------------------------------------

const createMode = (api) => new ServerMode({ api, key: "tvb-test", cache: null, doc: { querySelector: () => null }, timers: { setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {} }, reload() {} });

test("herkennen op de server: ServerMode geeft de uitkomst door, en onthoudt of de server niet bereikbaar was", async () => {
  let reply = { ok: true, employeeId: "employee-1" };
  const api = { recognizeFace: async () => { if (reply instanceof Error) throw reply; return reply; } };
  const mode = createMode(api);

  assert.equal(await mode.recognizeFace(DESCRIPTOR), "employee-1");
  assert.equal(mode.recognitionOffline, false);

  reply = new ServerError(0, "Geen verbinding met de server.");
  assert.equal(await mode.recognizeFace(DESCRIPTOR), null);
  assert.equal(mode.recognitionOffline, true);

  reply = new ServerError(429, "Te veel verzoeken.");
  assert.equal(await mode.recognizeFace(DESCRIPTOR), null);
  assert.equal(mode.recognitionOffline, false, "te veel verzoeken is geen probleem met de verbinding");

  reply = { ok: true, employeeId: null };
  assert.equal(await mode.recognizeFace(DESCRIPTOR), null);
});

test("herkennen op de server: ServerMode geeft bij de pas de melding van de server door, en haalt na koppelen op", async () => {
  const pulls = [];
  const api = {
    recognizeBadge: async (code) => { if (code === "OFFLINE") throw new ServerError(0, "x"); return { ok: true, employeeId: code === "04A1B2C3" ? "employee-1" : null }; },
    linkBadge: async (employeeId) => { if (employeeId === "bezet") throw new ServerError(409, "Deze pas is al gekoppeld aan iemand anders. Vraag het de beheerder."); return { ok: true }; }
  };
  const mode = createMode(api);
  mode.sync.pull = async () => { pulls.push("pull"); return true; };

  assert.deepEqual(await mode.recognizeBadge("04A1B2C3"), { ok: true, employeeId: "employee-1" });
  assert.deepEqual(await mode.recognizeBadge("FFFFFFFF"), { ok: true, employeeId: null });
  assert.deepEqual(await mode.recognizeBadge("OFFLINE"), { ok: false, message: ServerMode.MESSAGES.badgeOffline });
  assert.deepEqual(await mode.linkBadge("bezet", "04A1B2C3"), { ok: false, message: "Deze pas is al gekoppeld aan iemand anders. Vraag het de beheerder." });
  assert.deepEqual(pulls, []);
  assert.deepEqual(await mode.linkBadge("mw-mark", "AABBCCDD"), { ok: true });
  assert.deepEqual(pulls, ["pull"]);
});

test("herkennen op de server: een foutpagina van de proxy of te lang geen antwoord telt als geen verbinding", async () => {
  // Een container die opnieuw start: de proxy geeft een pagina die geen JSON is.
  const unreadable = (status) => async () => ({ ok: false, status, json: async () => { throw new SyntaxError("geen JSON"); } });
  for (const status of [502, 503, 504, 404]) {
    const api = new ServerApi("/api", unreadable(status));
    api.csrf = "sleutel";
    const error = await api.recognizeBadge("04A1B2C3").then(() => null, (thrown) => thrown);
    assert.equal(error.status, status);
    assert.equal(error.unreadable, true);
    assert.equal(ServerError.isUnreachable(error), true, `status ${status}`);
  }
  assert.equal(ServerError.isUnreachable(new ServerError(429, "Te veel verzoeken.")), false, "een leesbaar antwoord van de API");
  assert.equal(ServerError.isUnreachable(new ServerError(409, "Deze pas is al gekoppeld aan iemand anders. Vraag het de beheerder.")), false);
  assert.equal(ServerError.isUnreachable(new ServerError(0, "Geen verbinding met de server.")), true);

  // Geen antwoord: na de tijdslimiet volgt status 0 en wordt het verzoek afgebroken.
  let signal = null;
  const hanging = new ServerApi("/api", (url, options) => { signal = options.signal; return new Promise(() => {}); });
  hanging.csrf = "sleutel";
  const started = Date.now();
  const error = await hanging.request("POST", "/recognize/badge", { code: "04A1B2C3" }, { timeoutMs: 30 }).then(() => null, (thrown) => thrown);
  assert.equal(error.status, 0);
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 2000);
  assert.equal(ServerApi.RECOGNITION_TIMEOUT_MS, 5000);
});

test("herkennen op de server: ServerMode geeft bij een foutpagina van de proxy de melding over de verbinding", async () => {
  const proxyError = () => new ServerError(502, "De server gaf een antwoord dat niet te lezen is.", { unreadable: true });
  const api = {
    recognizeFace: async () => { throw new ServerError(404, "De server gaf een antwoord dat niet te lezen is.", { unreadable: true }); },
    recognizeBadge: async () => { throw proxyError(); },
    linkBadge: async () => { throw proxyError(); }
  };
  const mode = createMode(api);

  assert.equal(await mode.recognizeFace(DESCRIPTOR), null);
  assert.equal(mode.recognitionOffline, true);
  assert.deepEqual(await mode.recognizeBadge("04A1B2C3"), { ok: false, message: ServerMode.MESSAGES.badgeOffline });
  assert.deepEqual(await mode.linkBadge("mw-mark", "AABBCCDD"), { ok: false, message: ServerMode.MESSAGES.linkOffline });
});

test("herkennen op de server: ServerApi stuurt alleen de kenmerken of het pasnummer naar de juiste adressen", async () => {
  const calls = [];
  const api = new ServerApi("/api", async (url, options) => {
    calls.push([url, JSON.parse(options.body)]);
    return { ok: true, status: 200, json: async () => ({ ok: true, employeeId: null }) };
  });
  api.csrf = "sleutel";

  await api.recognizeFace(new Float32Array(128));
  await api.recognizeBadge("04A1B2C3");
  await api.linkBadge("mw-mark", "AABBCCDD");

  assert.deepEqual(calls.map(([url]) => url), ["/api/recognize/face", "/api/recognize/badge", "/api/badge/link"]);
  assert.equal(calls[0][1].descriptor.length, 128);
  assert.ok(Array.isArray(calls[0][1].descriptor), "een gewone lijst, geen Float32Array");
  assert.deepEqual(calls[1][1], { code: "04A1B2C3" });
  assert.deepEqual(calls[2][1], { employeeId: "mw-mark", code: "AABBCCDD" });
});

// ------------------------------------------------------------------
// Opslag
// ------------------------------------------------------------------

test("herkennen op de server: een gezichtsinstelling zonder kenmerken en de vlag badgeLinked blijven na laden staan", () => {
  const employee = { id: "mw-1", name: "Lotte van Dijk", firstName: "Lotte", lastName: "van Dijk", payrollCode: "", personnelNumber: "", employerNumber: "", companyId: null, pointId: null, active: true, color: "#d8f1e8", badgeId: "" };
  const store = createDataStore({
    employees: [{ ...employee, badgeLinked: true }, { ...employee, id: "mw-2", badgeLinked: "ja" }],
    registrations: [], products: [], companies: [], points: [], auditLog: [],
    faceEnrollments: [
      { id: "g-1", employeeId: "mw-1", enrolledAt: "2026-11-20T09:00:00.000Z", consentAt: "2026-11-20T09:00:00.000Z" },
      { id: "g-2", employeeId: "mw-1", descriptor: [1, 2, 3], enrolledAt: "2026-11-20T09:00:00.000Z", consentAt: "2026-11-20T09:00:00.000Z" }
    ]
  });
  const data = store.load(new Date("2026-11-27T09:00:00Z"));

  assert.deepEqual(data.employees.map((item) => [item.id, item.badgeLinked]), [["mw-1", true]]);
  assert.deepEqual(data.faceEnrollments.map((item) => item.id), ["g-1"], "kenmerken die er wel staan, moeten kloppen");
});
