// Tests voor ServerMode: opstarten met een server (wie is deze browser, welke gegevens komen er, wat
// als er geen verbinding is) en inloggen en uitloggen van de beheerder.
// De server en de pagina zijn nagebootst. Er gaat geen verzoek naar een echte server, en de namen en
// nummers zijn verzonnen.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { ServerMode } from "../assets/js/ServerMode.js";
import { ServerError } from "../assets/js/ServerApi.js";
import { createRecordingView, createFakeElement } from "./helpers.js";

const LOTTE = {
  id: "mw-lotte", name: "Lotte van Dijk", firstName: "Lotte", lastName: "van Dijk", payrollCode: "101", personnelNumber: "5001",
  employerNumber: "", companyId: "bedrijf-tvb", pointId: "punt-hk", active: true, color: "#d8f1e8", badgeId: ""
};
const BASE = [
  { collection: "companies", id: "bedrijf-tvb", data: { id: "bedrijf-tvb", name: "TVB", employerNumber: "01" } },
  { collection: "products", id: "blikje", data: { id: "blikje", name: "Blikje", price: 0.65 } },
  { collection: "points", id: "punt-hk", data: { id: "punt-hk", name: "Hoofdkantoor", companyId: "bedrijf-tvb", products: { blikje: { offered: true, stock: 24, minimum: 6 } } } }
];

// Nagebootste server. `role` is wie de browser nu is. Een tablet krijgt de medewerkers zonder looncode
// en personeelsnummer, net als bij de echte server (Policy.php).
const createApi = ({ role = null, device = null, configured = true } = {}) => {
  const api = {
    role, device, configured, offline: false, calls: [], pushed: [], password: "een-lang-nepwachtwoord",
    check() { if (api.offline) throw new ServerError(0, "Geen verbinding met de server."); },
    employee() { return api.role === "admin" ? LOTTE : { ...LOTTE, payrollCode: "", personnelNumber: "" }; },
    session: async () => { api.calls.push("session"); api.check(); return { ok: true, role: api.role, device: api.role ? api.device : null, username: api.role === "admin" ? "beheerder" : null, configured: api.configured }; },
    login: async (username, password) => {
      api.calls.push("login");
      api.check();
      if (password !== api.password) throw new ServerError(401, "De gebruikersnaam of het wachtwoord klopt niet.");
      api.role = "admin";
      return { ok: true, role: "admin", username, device: api.device };
    },
    logout: async () => { api.calls.push("logout"); api.check(); api.role = api.device ? "device" : null; return { ok: true, role: api.role, device: api.device }; },
    pull: async (since) => {
      api.calls.push(`pull ${since}`);
      api.check();
      if (!api.role) throw new ServerError(401, "Niet ingelogd.");
      return { ok: true, version: 9, changes: since >= 9 ? [] : [...BASE, { collection: "employees", id: "mw-lotte", data: api.employee() }] };
    },
    push: async (changes) => { api.calls.push("push"); api.check(); api.pushed.push(...changes); return { ok: true, version: 9, saved: changes.length, rejected: [] }; }
  };
  return api;
};

// Nagebootste pagina: geeft per selector altijd hetzelfde nep-element terug.
const createDoc = () => {
  const elements = new Map();
  return {
    elements,
    querySelector: (selector) => {
      if (!elements.has(selector)) elements.set(selector, createFakeElement({ previousElementSibling: createFakeElement() }));
      return elements.get(selector);
    }
  };
};

const createCache = () => {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};

const noTimers = { setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} };

const createMode = (api, { cache = createCache() } = {}) => {
  const state = { reloads: 0, doc: createDoc(), cache };
  state.server = new ServerMode({ api, key: "tvb-test", cache, doc: state.doc, timers: noTimers, reload: () => { state.reloads += 1; } });
  return state;
};

// Start de website zoals main.js dat doet, met een nep-view.
const startApp = (server) => {
  const model = new RegistrationModel(server.store);
  const view = createRecordingView();
  const app = new RegistrationApp(model, view);
  app.server = server;
  app.loadSavedFaces = () => {};
  app.handleStorageChange = () => { model.reload(); app.reloaded = (app.reloaded ?? 0) + 1; };
  server.attach(app);
  return { model, view, app };
};

// ------------------------------------------------------------------
// Opstarten
// ------------------------------------------------------------------

test("ServerMode: een browser die niets is, krijgt alleen het inlogscherm en geen gegevens", async () => {
  const api = createApi();
  const { server, doc, cache } = createMode(api);
  cache.setItem("tvb-test-server", JSON.stringify({ version: 3, text: JSON.stringify({ employees: [LOTTE] }), pending: [] }));

  assert.equal(await server.prepare(), "gate");

  assert.deepEqual(api.calls, ["session"], "er zijn geen gegevens opgevraagd");
  assert.equal(server.store.text, null);
  assert.equal(doc.querySelector("#serverGate").classList.contains("hidden"), false);
  assert.equal(doc.querySelector("#serverGateText").textContent, ServerMode.MESSAGES.gate);
  assert.equal(doc.querySelector(".app-shell").getAttribute("inert"), "");
  assert.equal(cache.getItem("tvb-test-server"), null, "wat een eerdere tablet had bewaard, is gewist");
});

test("ServerMode: zonder beheerder op de server zegt het inlogscherm wat er moet gebeuren, zonder formulier", async () => {
  const { server, doc } = createMode(createApi({ configured: false }));

  assert.equal(await server.prepare(), "gate");
  assert.equal(doc.querySelector("#serverGateText").textContent, ServerMode.MESSAGES.notConfigured);
  assert.equal(doc.querySelector("#serverGateForm").classList.contains("hidden"), true);
});

test("ServerMode: een gekoppelde tablet start met de gegevens voor een tablet en bewaart ze in de browser", async () => {
  const api = createApi({ role: "device", device: { id: "tablet-1", name: "Tablet kantine", pointId: "punt-hk" } });
  const { server, cache } = createMode(api);

  assert.equal(await server.prepare(), "ready");
  const { model } = startApp(server);

  assert.equal(server.role, "device");
  assert.equal(server.pointId, "punt-hk");
  assert.deepEqual(model.employees.map((employee) => [employee.name, employee.personnelNumber, employee.payrollCode]), [["Lotte van Dijk", "", ""]]);
  assert.ok(cache.getItem("tvb-test-server").includes("Lotte van Dijk"));
  assert.ok(!cache.getItem("tvb-test-server").includes("5001"), "het personeelsnummer staat in de browser");
});

test("ServerMode: de beheerder start met alle gegevens en er wordt niets in de browser bewaard", async () => {
  const { server, cache } = createMode(createApi({ role: "admin" }));

  assert.equal(await server.prepare(), "ready");
  const { model } = startApp(server);

  assert.equal(model.findEmployee("mw-lotte").personnelNumber, "5001");
  assert.equal(cache.getItem("tvb-test-server"), null);
});

test("ServerMode: zonder verbinding en zonder bewaarde gegevens komt er een melding met 'Opnieuw proberen'", async () => {
  const api = createApi({ role: "device" });
  api.offline = true;
  const { server, doc } = createMode(api);

  assert.equal(await server.prepare(), "gate");
  assert.equal(doc.querySelector("#serverGateText").textContent, ServerMode.MESSAGES.noConnection);
  assert.equal(doc.querySelector("#serverGateRetry").classList.contains("hidden"), false);
  assert.equal(doc.querySelector("#serverGateForm").classList.contains("hidden"), true);
});

test("ServerMode: een tablet zonder verbinding start met de bewaarde gegevens en stuurt de wachtrij later weg", async () => {
  const cache = createCache();
  const device = { id: "tablet-1", name: "Tablet kantine", pointId: "punt-hk" };
  const first = createMode(createApi({ role: "device", device }), { cache });
  await first.server.prepare();
  const started = startApp(first.server);
  started.model.addRegistration("mw-lotte", "blikje");
  started.model.save();

  // De tablet start opnieuw en de server is niet bereikbaar.
  const api = createApi({ role: "device", device });
  api.offline = true;
  const second = createMode(api, { cache });
  assert.equal(await second.server.prepare(), "ready");
  const { model, view } = startApp(second.server);

  assert.equal(model.registrations.length, 1);
  assert.equal(second.server.store.pendingChanges().length, 2);
  assert.deepEqual(view.toasts.map((toast) => toast.message), [ServerMode.MESSAGES.offline]);

  api.offline = false;
  await second.server.sync.push();
  assert.deepEqual(api.pushed.map((change) => change.collection).sort(), ["points", "registrations"]);
  assert.deepEqual(second.server.store.pendingChanges(), []);
});

// ------------------------------------------------------------------
// Inloggen en uitloggen op een tablet
// ------------------------------------------------------------------

test("ServerMode: na inloggen op een tablet heeft de beheerder alle gegevens, na uitloggen zijn ze weer weg", async () => {
  const api = createApi({ role: "device", device: { id: "tablet-1", name: "Tablet kantine", pointId: "punt-hk" } });
  const { server, cache, reloads } = createMode(api);
  await server.prepare();
  const { model, app } = startApp(server);
  const cached = cache.getItem("tvb-test-server");

  assert.deepEqual(await server.login("beheer@voorbeeld.test", "een-lang-nepwachtwoord"), { ok: true });
  assert.equal(server.role, "admin");
  assert.equal(model.findEmployee("mw-lotte").personnelNumber, "5001");
  assert.equal(app.reloaded, 1);
  assert.equal(cache.getItem("tvb-test-server"), cached, "de gegevens van de beheerder zijn in de browser bewaard");

  await server.logout();
  assert.equal(server.role, "device");
  assert.equal(model.findEmployee("mw-lotte").personnelNumber, "");
  assert.ok(!server.store.text.includes("5001"), "het personeelsnummer staat nog in het geheugen");
  assert.equal(reloads, 0, "een tablet blijft gewoon draaien");
});

test("ServerMode: een fout wachtwoord geeft de melding van de server en verandert niets", async () => {
  const api = createApi({ role: "device", device: { id: "tablet-1", name: "Tablet", pointId: null } });
  const { server } = createMode(api);
  await server.prepare();
  const { model } = startApp(server);

  assert.deepEqual(await server.login("beheerder", "verkeerd-wachtwoord"), { ok: false, message: "De gebruikersnaam of het wachtwoord klopt niet." });
  assert.equal(server.role, "device");
  assert.equal(model.findEmployee("mw-lotte").personnelNumber, "");
});

test("ServerMode: wat de tablet nog in de wachtrij had, gaat weg vóór het inloggen van de beheerder", async () => {
  const api = createApi({ role: "device", device: { id: "tablet-1", name: "Tablet", pointId: "punt-hk" } });
  const { server } = createMode(api);
  await server.prepare();
  const { model } = startApp(server);
  model.addRegistration("mw-lotte", "blikje");
  model.save();

  await server.login("beheer@voorbeeld.test", "een-lang-nepwachtwoord");

  assert.ok(api.calls.indexOf("push") < api.calls.indexOf("login"), api.calls.join(", "));
  assert.equal(api.pushed.filter((change) => change.collection === "registrations").length, 1);
});

test("ServerMode: uitloggen op een browser die geen tablet is, gaat terug naar het inlogscherm", async () => {
  const state = createMode(createApi({ role: "admin" }));
  await state.server.prepare();
  startApp(state.server);

  await state.server.logout();
  assert.equal(state.reloads, 1);
});

test("ServerMode: is de sessie verlopen of de tablet ingetrokken, dan start de pagina opnieuw", async () => {
  const state = createMode(createApi({ role: "device", device: { id: "tablet-1", name: "Tablet", pointId: null } }));
  await state.server.prepare();
  startApp(state.server);

  state.server.handleStatus("signed-out");
  assert.equal(state.reloads, 1);
});

// ------------------------------------------------------------------
// Het beheer met een server
// ------------------------------------------------------------------

test("ServerMode: het demo-inloggen bestaat niet met een server, en 'Alle gegevens wissen' is weg", async () => {
  const api = createApi({ role: "device", device: { id: "tablet-1", name: "Tablet", pointId: null } });
  const { server, doc } = createMode(api);
  await server.prepare();
  const { app, view, model } = startApp(server);

  assert.equal(doc.querySelector(".login-hint").classList.contains("hidden"), true);
  assert.equal(doc.querySelector("#wipeDataButton").classList.contains("hidden"), true);
  assert.equal(doc.querySelector("#tab-server").classList.contains("hidden"), false);
  assert.equal(doc.querySelector("#loginUsername").value, "");

  // Een verkeerd wachtwoord logt niet in, ook al is er iets ingevuld (in de demo zou dat wel werken).
  view.$("#loginUsername").value = "beheerder";
  view.$("#loginPassword").value = "verkeerd-wachtwoord";
  app.login({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.adminLoggedIn, false);
  assert.equal(view.$("#loginError").textContent, "De gebruikersnaam of het wachtwoord klopt niet.");
  assert.equal(view.$("#loginPassword").value, "");

  view.$("#loginPassword").value = "een-lang-nepwachtwoord";
  app.login({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.adminLoggedIn, true);

  // Alles wissen is geblokkeerd: de gegevens staan op de server.
  globalThis.window = { confirm: () => true };
  app.wipeAllData();
  assert.equal(model.employees.length, 1);
  assert.equal(view.toasts.at(-1).message, "Alle gegevens wissen kan niet: de gegevens staan op de server.");
});

test("ServerMode: is de browser al als beheerder ingelogd, dan opent het beheer zonder nog een keer in te loggen", async () => {
  const { server } = createMode(createApi({ role: "admin" }));
  await server.prepare();
  const { app } = startApp(server);

  server.afterStart();
  assert.equal(app.adminLoggedIn, true);
});

test("ServerMode: de meldingen over de verbinding", async () => {
  const { server } = createMode(createApi({ role: "admin" }));
  await server.prepare();
  const { view } = startApp(server);

  server.handleStatus("offline");
  server.handleStatus("online");
  server.handleStatus("rejected");
  server.handleStatus("iets-anders");

  assert.deepEqual(view.toasts.map((toast) => [toast.message, toast.tone]), [
    [ServerMode.MESSAGES.offline, "error"],
    [ServerMode.MESSAGES.online, "success"],
    [ServerMode.MESSAGES.rejected, "error"]
  ]);
});

test("ServerMode: de eerste beheerder op een lege server zet de standaardproducten erop, geen demomedewerkers en geen demobedrijven", async () => {
  const api = createApi({ role: "admin" });
  let stored = [];
  api.pull = async () => ({ ok: true, version: stored.length, changes: stored });
  api.push = async (changes) => { stored = structuredClone(changes); return { ok: true, version: stored.length, saved: stored.length, rejected: [] }; };
  const { server } = createMode(api);

  assert.equal(await server.prepare(), "ready");
  const { model } = startApp(server);

  assert.deepEqual(model.employees, []);
  assert.deepEqual(model.points, []);
  assert.equal(model.products.length, 8);
  // De bedrijven komen uit AFAS, met naam en werkgevernummer (EmployeeSync).
  assert.deepEqual(model.companies, []);
  assert.deepEqual(server.store.pendingChanges(), []);
});

test("ServerMode: een tablet zet niets op een lege server", async () => {
  const api = createApi({ role: "device", device: { id: "tablet-1", name: "Tablet", pointId: null } });
  api.pull = async () => ({ ok: true, version: 0, changes: [] });
  const { server } = createMode(api);

  assert.equal(await server.prepare(), "ready");
  assert.ok(!api.calls.includes("push"));
});

test("ServerMode: uitloggen en daarna meteen sluiten geeft één uitlog bij de server", async () => {
  const api = createApi({ role: "device", device: { id: "tablet-1", name: "Tablet", pointId: null } });
  const { server } = createMode(api);
  await server.prepare();
  startApp(server);
  await server.login("beheer@voorbeeld.test", "een-lang-nepwachtwoord");

  await Promise.all([server.logout(), server.logout()]);
  await server.logout();

  assert.equal(api.calls.filter((call) => call === "logout").length, 1);
  assert.equal(server.role, "device");
});

test("ServerMode: de locatie van de tablet gaat naar het model, en 'Ik ben een gast' staat er alleen met een locatie", async () => {
  const buttons = [createFakeElement(), createFakeElement()];
  for (const button of buttons) button.classList.add("hidden");
  const withLocation = createMode(createApi({ role: "device", device: { id: "tablet-1", name: "Tablet", pointId: "punt-hk" } }));
  withLocation.doc.querySelectorAll = (selector) => (selector === "[data-open-guest]" ? buttons : []);
  await withLocation.server.prepare();
  const { model } = startApp(withLocation.server);

  assert.equal(model.locationPointId, "punt-hk");
  assert.ok(buttons.every((button) => !button.classList.contains("hidden")));

  const without = createMode(createApi({ role: "device", device: { id: "tablet-2", name: "Tablet", pointId: null } }));
  without.doc.querySelectorAll = (selector) => (selector === "[data-open-guest]" ? buttons : []);
  await without.server.prepare();
  const second = startApp(without.server);
  assert.equal(second.model.locationPointId, null);
  assert.ok(buttons.every((button) => button.classList.contains("hidden")));
});

// ------------------------------------------------------------------
// Mijn account: wachtwoord wijzigen
// ------------------------------------------------------------------

test("ServerMode: 'Wachtwoord wijzigen' controleert eerst de velden, daarna het huidige wachtwoord op de server", async () => {
  const api = createApi({ role: "admin" });
  api.changePassword = async (current, next) => {
    api.calls.push("password");
    if (current !== api.password) throw new ServerError(401, "Het huidige wachtwoord klopt niet.");
    api.password = next;
    return { ok: true, role: "admin", csrf: "nieuwe-sleutel" };
  };
  const { server, doc } = createMode(api);
  await server.prepare();
  const { view } = startApp(server);
  assert.equal(server.username, "beheerder");

  const fill = (current, next, repeat) => {
    doc.querySelector("#serverPasswordCurrent").value = current;
    doc.querySelector("#serverPasswordNew").value = next;
    doc.querySelector("#serverPasswordRepeat").value = repeat;
  };
  const submit = () => server.changePassword({ preventDefault() {} });
  const error = () => doc.querySelector("#serverPasswordError").textContent;

  fill("", "", "");
  await submit();
  assert.equal(error(), ServerMode.PASSWORD_TEXTS.required);
  fill("een-lang-nepwachtwoord", "kort", "kort");
  await submit();
  assert.equal(error(), ServerMode.PASSWORD_TEXTS.tooShort);
  fill("een-lang-nepwachtwoord", "een-nieuw-lang-wachtwoord", "een-ander-lang-wachtwoord");
  await submit();
  assert.equal(error(), ServerMode.PASSWORD_TEXTS.different);
  assert.equal(api.calls.includes("password"), false, "de server is nog niets gevraagd");

  // Het huidige wachtwoord klopt niet: de melding van de server, en het veld is leeg.
  fill("verkeerd-wachtwoord", "een-nieuw-lang-wachtwoord", "een-nieuw-lang-wachtwoord");
  await submit();
  assert.equal(error(), "Het huidige wachtwoord klopt niet.");
  assert.equal(doc.querySelector("#serverPasswordCurrent").value, "");

  // Gelukt: een melding, de velden zijn leeg en de beheerder blijft ingelogd.
  fill("een-lang-nepwachtwoord", "een-nieuw-lang-wachtwoord", "een-nieuw-lang-wachtwoord");
  await submit();
  assert.equal(api.password, "een-nieuw-lang-wachtwoord");
  assert.equal(doc.querySelector("#serverPasswordError").classList.contains("hidden"), true);
  assert.deepEqual(["#serverPasswordCurrent", "#serverPasswordNew", "#serverPasswordRepeat"].map((id) => doc.querySelector(id).value), ["", "", ""]);
  assert.equal(view.toasts.at(-1).message, "Je wachtwoord is gewijzigd. Log voortaan in met het nieuwe wachtwoord.");
  assert.equal(server.role, "admin");
});

test("ServerMode: geeft de server na het wijzigen geen nieuwe sessie, dan start de pagina opnieuw (uitgelogd)", async () => {
  const api = createApi({ role: "admin" });
  api.changePassword = async () => ({ ok: true, role: null });
  const state = createMode(api);
  await state.server.prepare();
  startApp(state.server);
  state.doc.querySelector("#serverPasswordCurrent").value = "een-lang-nepwachtwoord";
  state.doc.querySelector("#serverPasswordNew").value = "een-nieuw-lang-wachtwoord";
  state.doc.querySelector("#serverPasswordRepeat").value = "een-nieuw-lang-wachtwoord";

  await state.server.changePassword({ preventDefault() {} });

  assert.equal(state.reloads, 1);
});
