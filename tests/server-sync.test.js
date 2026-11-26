// Tests voor de website met een server: de opslag in het geheugen met een wachtrij (ServerDataStore),
// het uitwisselen met de server (ServerSync) en de verzoeken zelf (ServerApi).
// De server is nagebootst in het geheugen (FakeServer). Er gaat geen verzoek naar een echte server,
// en de namen en nummers zijn verzonnen.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { ServerDataStore, SYNC_LISTS } from "../assets/js/ServerDataStore.js";
import { ServerSync } from "../assets/js/ServerSync.js";
import { ServerApi, ServerError } from "../assets/js/ServerApi.js";
import { SERVER_API } from "../assets/js/deployment.js";

// Nagebootste server: bewaart regels met een oplopend volgnummer, net als RecordStore.php.
// `reject(change)` bepaalt welke wijzigingen worden geweigerd, `rewrite(change)` vult een regel aan
// zoals de echte server dat bij een registratie doet.
class FakeServer {
  constructor() {
    this.version = 0;
    this.rows = []; // { collection, id, data, version }
    this.pushes = [];
    this.pulls = [];
    this.offline = false;
    this.reject = () => false;
    this.rewrite = (change) => change.data;
  }

  put(collection, data) {
    this.version += 1;
    const row = this.rows.find((item) => item.collection === collection && item.id === data.id);
    if (row) Object.assign(row, { data: structuredClone(data), version: this.version });
    else this.rows.push({ collection, id: data.id, data: structuredClone(data), version: this.version });
  }

  api() {
    return {
      pull: async (since) => {
        if (this.offline) throw new ServerError(0, "Geen verbinding met de server.");
        this.pulls.push(since);
        const changes = this.rows
          .filter((row) => row.version > since && (since > 0 || row.data !== null))
          .map(({ collection, id, data }) => ({ collection, id, data: structuredClone(data) }));
        return { ok: true, version: this.version, changes };
      },
      push: async (changes) => {
        if (this.offline) throw new ServerError(0, "Geen verbinding met de server.");
        this.pushes.push(structuredClone(changes));
        const rejected = [];
        for (const change of structuredClone(changes)) {
          if (this.reject(change)) {
            rejected.push({ collection: change.collection, id: change.id });
            continue;
          }
          const data = change.data === null ? null : this.rewrite(change);
          this.version += 1;
          const row = this.rows.find((item) => item.collection === change.collection && item.id === change.id);
          if (row) Object.assign(row, { data, version: this.version });
          else this.rows.push({ collection: change.collection, id: change.id, data, version: this.version });
        }
        return { ok: true, version: this.version, saved: changes.length - rejected.length, rejected };
      }
    };
  }

  ids(collection) {
    return this.rows.filter((row) => row.collection === collection && row.data !== null).map((row) => row.id);
  }

  get(collection, id) {
    return this.rows.find((row) => row.collection === collection && row.id === id)?.data ?? null;
  }
}

// Nagebootste tijd: timers lopen alleen als de test `advance` aanroept.
const createTimers = () => {
  const pending = new Map();
  let nextId = 1;
  let now = 0;
  const timers = {
    setTimeout: (action, delay) => { const id = nextId++; pending.set(id, { action, at: now + delay }); return id; },
    clearTimeout: (id) => pending.delete(id),
    setInterval: (action, delay) => { const id = nextId++; pending.set(id, { action, at: now + delay, every: delay }); return id; },
    clearInterval: (id) => pending.delete(id),
    count: () => pending.size,
    // Laat de tijd verstrijken en wacht tot wat daardoor start (ook de verzoeken) klaar is.
    advance: async (ms) => {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at > now) continue;
        if (timer.every) timer.at = now + timer.every;
        else pending.delete(id);
        timer.action();
      }
      for (let round = 0; round < 20; round += 1) await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return timers;
};

// Nagebootste opslag van de browser.
const createCache = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
};

// Een server met het bedrijf TVB, het punt Hoofdkantoor met Blikje, en Lotte.
const seededServer = () => {
  const server = new FakeServer();
  server.put("companies", { id: "bedrijf-tvb", name: "TVB", employerNumber: "01" });
  server.put("products", { id: "blikje", name: "Blikje", price: 0.65 });
  server.put("points", { id: "punt-hk", name: "Hoofdkantoor", companyId: "bedrijf-tvb", products: { blikje: { offered: true, stock: 24, minimum: 6 } } });
  server.put("employees", {
    id: "mw-lotte", name: "Lotte van Dijk", firstName: "Lotte", lastName: "van Dijk", payrollCode: "", personnelNumber: "",
    employerNumber: "", companyId: "bedrijf-tvb", pointId: "punt-hk", active: true, color: "#d8f1e8", badgeId: ""
  });
  return server;
};

// Een browser die met de server werkt: opslag, uitwisselen en het model, na de eerste keer ophalen.
const createClient = async (server, { cache = null } = {}) => {
  const store = new ServerDataStore("tvb-test", cache);
  const timers = createTimers();
  const statuses = [];
  const client = { store, timers, statuses, reloads: 0 };
  client.sync = new ServerSync({
    api: server.api(),
    store,
    timers,
    onRemoteChange: () => { client.reloads += 1; client.model?.reload(); },
    onStatus: (...status) => statuses.push(status)
  });
  await client.sync.fullPull();
  client.model = new RegistrationModel(store);
  return client;
};

// ------------------------------------------------------------------
// De instelling
// ------------------------------------------------------------------

test("server: in de repository staat de website op demo (geen server), zodat de tests zonder server draaien", () => {
  assert.equal(SERVER_API, "");
});

test("server: de lijsten die worden uitgewisseld, zijn de lijsten van de server", () => {
  assert.deepEqual(SYNC_LISTS, ["employees", "registrations", "products", "companies", "points", "auditLog", "faceEnrollments", "faceOffers"]);
});

// ------------------------------------------------------------------
// ServerDataStore met het model
// ------------------------------------------------------------------

test("server: het model start met de gegevens van de server en niet met de demogegevens", async () => {
  const { model, store } = await createClient(seededServer());

  assert.deepEqual(model.employees.map((employee) => employee.name), ["Lotte van Dijk"]);
  assert.deepEqual(model.companies.map((company) => company.name), ["TVB"]);
  assert.equal(model.loadProblem, null);
  assert.deepEqual(store.pendingChanges(), []);
});

test("server: een lege server geeft lege lijsten, geen demomedewerkers en niets om weg te sturen", async () => {
  const { model, store } = await createClient(new FakeServer());

  assert.deepEqual(model.employees, []);
  assert.deepEqual(model.companies, []);
  assert.deepEqual(model.products, []);
  assert.equal(model.save(), true);
  assert.deepEqual(store.pendingChanges(), []);
});

test("server: een registratie komt in de wachtrij, samen met de gewijzigde voorraad, en gaat naar de server", async () => {
  const server = seededServer();
  const { model, store, sync } = await createClient(server);

  model.addRegistration("mw-lotte", "blikje");
  assert.equal(model.save(), true);

  assert.deepEqual(store.pendingChanges().map((change) => change.collection).sort(), ["points", "registrations"]);
  assert.equal(await sync.push(), true);
  assert.deepEqual(store.pendingChanges(), []);
  assert.equal(server.ids("registrations").length, 1);
  assert.equal(server.get("points", "punt-hk").products.blikje.stock, 23);
  assert.equal(server.pushes.length, 1, "één verzoek voor beide wijzigingen");
});

test("server: alleen wat is veranderd gaat naar de server, niet alle gegevens", async () => {
  const server = seededServer();
  const { model, store, sync } = await createClient(server);

  model.updateEmployee("mw-lotte", { ...model.findEmployee("mw-lotte"), payrollCode: "101" });
  model.save();

  assert.deepEqual(store.pendingChanges().map(({ collection, id }) => [collection, id]), [["employees", "mw-lotte"]]);
  await sync.push();
  assert.equal(server.get("employees", "mw-lotte").payrollCode, "101");
});

test("server: verwijderen gaat als verwijdering naar de server", async () => {
  const server = seededServer();
  server.put("employees", { id: "mw-mark", name: "Mark Jansen", firstName: "Mark", lastName: "Jansen", payrollCode: "", personnelNumber: "", employerNumber: "", companyId: "bedrijf-tvb", pointId: "punt-hk", active: false, color: "#e3eef6", badgeId: "" });
  const { model, store, sync } = await createClient(server);

  assert.equal(model.removeEmployee("mw-mark"), true);
  model.save();

  assert.deepEqual(store.pendingChanges(), [{ collection: "employees", id: "mw-mark", data: null }]);
  await sync.push();
  assert.deepEqual(server.ids("employees"), ["mw-lotte"]);
});

test("server: een regel die de controle bij het laden afkeurt, blijft op de server staan en wordt niet verwijderd", async () => {
  const server = seededServer();
  server.put("employees", { id: "mw-kapot", name: "", active: "ja" });
  const { model, store, sync } = await createClient(server);

  assert.deepEqual(model.employees.map((employee) => employee.id), ["mw-lotte"], "het model ziet de kapotte regel niet");
  assert.equal(model.loadProblem, "skipped");
  model.addRegistration("mw-lotte", "blikje");
  model.save();
  await sync.push();

  assert.ok(!store.pendingChanges().some((change) => change.id === "mw-kapot"));
  assert.ok(server.get("employees", "mw-kapot"), "de regel is van de server verwijderd");
});

test("server: de opslag maakt geen reservekopieën en kan niet alles wissen", () => {
  const store = new ServerDataStore("tvb-test");

  assert.equal(store.clearAll(), false);
  assert.equal(store.keepBackup("x"), undefined);
  assert.equal(store.pruneBackups(), undefined);
});

// ------------------------------------------------------------------
// Twee browsers
// ------------------------------------------------------------------

test("server: een registratie op de ene tablet is na ophalen te zien op de andere", async () => {
  const server = seededServer();
  const tablet = await createClient(server);
  const other = await createClient(server);

  tablet.model.addRegistration("mw-lotte", "blikje");
  tablet.model.save();
  await tablet.sync.push();

  assert.equal(other.model.registrations.length, 0);
  assert.equal(await other.sync.pull(), true);
  assert.equal(other.reloads, 1);
  assert.equal(other.model.registrations.length, 1);
  assert.equal(other.model.findPoint("punt-hk").products.blikje.stock, 23);
  assert.equal(await other.sync.pull(), false, "een tweede keer ophalen verandert niets");
  assert.equal(other.reloads, 1);
});

test("server: beide browsers registreren tegelijk en beide registraties blijven bewaard", async () => {
  const server = seededServer();
  const first = await createClient(server);
  const second = await createClient(server);

  first.model.addRegistration("mw-lotte", "blikje");
  first.model.save();
  second.model.addRegistration("mw-lotte", "blikje");
  second.model.save();
  await first.sync.push();
  await second.sync.push();
  await first.sync.pull();

  assert.equal(server.ids("registrations").length, 2);
  assert.equal(first.model.registrations.length, 2);
  assert.equal(second.model.registrations.length, 2);
  // De eigen registratie staat op iedere tablet vooraan tot alles opnieuw wordt opgehaald. Daarna is
  // de volgorde overal die van de server (de volgorde van binnenkomen).
  assert.deepEqual(first.model.registrations.map((item) => item.id).sort(), second.model.registrations.map((item) => item.id).sort());
  await second.sync.fullPull();
  second.model.reload();
  assert.deepEqual(second.model.registrations.map((item) => item.id), first.model.registrations.map((item) => item.id), "na opnieuw ophalen dezelfde volgorde");
});

test("server: zijn er wijzigingen opgehaald die het model nog niet heeft geladen, dan meldt opslaan een conflict", async () => {
  const server = seededServer();
  const client = await createClient(server);
  client.sync.onRemoteChange = () => {}; // het model laadt hier bewust nog niet opnieuw
  server.put("products", { id: "ei", name: "Ei", price: 0.5 });
  await client.sync.pull();

  client.model.addRegistration("mw-lotte", "blikje");
  assert.equal(client.model.save(), false);
  assert.equal(client.model.saveProblem, "conflict");

  // Zoals RegistrationApp.persist doet: opnieuw laden en de wijziging nog een keer uitvoeren.
  assert.equal(client.model.reload(), true);
  client.model.addRegistration("mw-lotte", "blikje");
  assert.equal(client.model.save(), true);
  assert.deepEqual(client.model.products.map((product) => product.id), ["blikje", "ei"]);
  assert.equal(client.model.registrations.length, 1);
});

test("server: een eigen wijziging die nog onderweg is, wordt niet overschreven door wat er wordt opgehaald", async () => {
  const server = seededServer();
  const client = await createClient(server);

  client.model.updateEmployee("mw-lotte", { ...client.model.findEmployee("mw-lotte"), payrollCode: "101" });
  client.model.save();
  server.put("employees", { ...server.get("employees", "mw-lotte"), payrollCode: "999" });
  await client.sync.pull();

  assert.equal(client.model.findEmployee("mw-lotte").payrollCode, "101");
  await client.sync.push();
  assert.equal(server.get("employees", "mw-lotte").payrollCode, "101");
});

// ------------------------------------------------------------------
// De server vult aan of weigert
// ------------------------------------------------------------------

test("server: vult de server een registratie aan (prijs, werkgevernummer), dan krijgt de tablet die versie terug", async () => {
  const server = seededServer();
  server.rewrite = (change) => (change.collection === "registrations" ? { ...change.data, price: 0.7, employerNumber: "77" } : change.data);
  const { model, sync } = await createClient(server);

  model.addRegistration("mw-lotte", "blikje");
  model.save();
  await sync.push();

  assert.equal(model.registrations[0].price, 0.7);
  assert.equal(model.registrations[0].employerNumber, "77");
});

test("server: weigert de server een wijziging, dan komen de gegevens van de server terug en volgt een melding", async () => {
  const server = seededServer();
  server.reject = (change) => change.collection === "employees";
  const { model, store, sync, statuses } = await createClient(server);

  model.updateEmployee("mw-lotte", { ...model.findEmployee("mw-lotte"), firstName: "Iemand", lastName: "Anders" });
  model.save();
  assert.equal(model.findEmployee("mw-lotte").name, "Iemand Anders");
  await sync.push();

  assert.equal(model.findEmployee("mw-lotte").name, "Lotte van Dijk");
  assert.deepEqual(store.pendingChanges(), []);
  assert.deepEqual(statuses, [["rejected", 1]]);
});

// ------------------------------------------------------------------
// Zonder verbinding
// ------------------------------------------------------------------

test("server: zonder verbinding blijft een registratie in de wachtrij en gaat ze later alsnog weg", async () => {
  const server = seededServer();
  const client = await createClient(server);
  client.sync.start();
  server.offline = true;

  client.model.addRegistration("mw-lotte", "blikje");
  client.model.save();
  await client.timers.advance(ServerSync.PUSH_DELAY_MS);

  assert.equal(client.store.pendingChanges().length, 2);
  assert.deepEqual(client.statuses, [["offline"]]);
  assert.equal(client.model.registrations.length, 1, "de registratie staat wel op de tablet");

  server.offline = false;
  await client.timers.advance(ServerSync.RETRY_MS);
  assert.deepEqual(client.store.pendingChanges(), []);
  assert.equal(server.ids("registrations").length, 1);
  assert.deepEqual(client.statuses, [["offline"], ["online"]]);
  client.sync.stop();
  assert.equal(client.timers.count(), 0);
});

test("server: een paar wijzigingen kort na elkaar gaan in één verzoek", async () => {
  const server = seededServer();
  const client = await createClient(server);
  client.sync.start();

  for (let count = 0; count < 3; count += 1) {
    client.model.addRegistration("mw-lotte", "blikje");
    client.model.save();
    await client.timers.advance(50);
  }
  assert.equal(server.pushes.length, 0, "nog niets verstuurd");
  await client.timers.advance(ServerSync.PUSH_DELAY_MS);

  assert.equal(server.pushes.length, 1);
  assert.equal(server.ids("registrations").length, 3);
  assert.equal(server.get("points", "punt-hk").products.blikje.stock, 21);
  client.sync.stop();
});

test("server: de browser haalt regelmatig op wat er is veranderd", async () => {
  const server = seededServer();
  const client = await createClient(server);
  client.sync.start();
  server.put("products", { id: "ei", name: "Ei", price: 0.5 });

  await client.timers.advance(ServerSync.PULL_INTERVAL_MS);

  assert.deepEqual(client.model.products.map((product) => product.id), ["blikje", "ei"]);
  client.sync.stop();
});

test("server: is de sessie verlopen, dan meldt het uitwisselen dat en blijft de wachtrij staan", async () => {
  const server = seededServer();
  const client = await createClient(server);
  client.sync.api.push = async () => { throw new ServerError(401, "Niet ingelogd."); };
  client.sync.start();

  client.model.addRegistration("mw-lotte", "blikje");
  client.model.save();
  await client.timers.advance(ServerSync.PUSH_DELAY_MS);

  assert.deepEqual(client.statuses, [["signed-out"]]);
  assert.equal(client.store.pendingChanges().length, 2);
  client.sync.stop();
});

// ------------------------------------------------------------------
// Bewaren in de browser (alleen een tablet)
// ------------------------------------------------------------------

test("server: een tablet bewaart de gegevens en de wachtrij in de browser, en gaat daarmee verder na een herstart", async () => {
  const server = seededServer();
  const cache = createCache();
  const tablet = await createClient(server, { cache });
  server.offline = true;
  tablet.model.addRegistration("mw-lotte", "blikje");
  tablet.model.save();

  // De tablet start opnieuw, nog steeds zonder verbinding.
  const store = new ServerDataStore("tvb-test", cache);
  const version = store.restoreCache();
  assert.equal(version, server.version);
  const model = new RegistrationModel(store);
  assert.equal(model.registrations.length, 1);
  assert.equal(model.findPoint("punt-hk").products.blikje.stock, 23);
  assert.equal(store.pendingChanges().length, 2);

  // De verbinding komt terug: de wachtrij gaat alsnog weg.
  server.offline = false;
  const sync = new ServerSync({ api: server.api(), store, timers: createTimers(), onRemoteChange: () => model.reload() });
  sync.version = version;
  await sync.push();
  assert.equal(server.ids("registrations").length, 1);
  assert.deepEqual(store.pendingChanges(), []);
});

test("server: is de beheerder ingelogd, dan wordt er niets in de browser bewaard", async () => {
  const server = seededServer();
  const cache = createCache();
  const client = await createClient(server, { cache });
  const before = cache.getItem("tvb-test-server");

  client.store.setCaching(false);
  server.put("employees", { ...server.get("employees", "mw-lotte"), personnelNumber: "5001", payrollCode: "101" });
  await client.sync.fullPull();
  client.model.reload();
  client.model.updateEmployee("mw-lotte", { ...client.model.findEmployee("mw-lotte"), payrollCode: "102" });
  client.model.save();

  assert.equal(client.model.findEmployee("mw-lotte").personnelNumber, "5001");
  assert.equal(cache.getItem("tvb-test-server"), before, "de bewaarde gegevens zijn veranderd");
  assert.ok(!cache.getItem("tvb-test-server").includes("5001"));
});

test("server: zonder bewaarde gegevens of met kapotte bewaarde gegevens start de tablet niet uit de browser", () => {
  assert.equal(new ServerDataStore("tvb-test", createCache()).restoreCache(), null);
  assert.equal(new ServerDataStore("tvb-test").restoreCache(), null);

  const cache = createCache();
  cache.setItem("tvb-test-server", "{kapot");
  assert.equal(new ServerDataStore("tvb-test", cache).restoreCache(), null);

  const store = new ServerDataStore("tvb-test", cache);
  cache.setItem("tvb-test-server", JSON.stringify({ version: 3, text: "{}", pending: [] }));
  assert.equal(store.restoreCache(), 3);
  store.forgetCache();
  assert.equal(cache.getItem("tvb-test-server"), null);
});

// ------------------------------------------------------------------
// ServerApi
// ------------------------------------------------------------------

// Nagebootste fetch: onthoudt de verzoeken en geeft de klaargezette antwoorden terug.
const fakeFetch = (responses) => {
  const calls = [];
  const fetchFunction = async (url, options) => {
    calls.push({ url, ...options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => { if (next.body === undefined) throw new Error("geen json"); return next.body; } };
  };
  return { calls, fetchFunction };
};

test("ServerApi: een schrijvend verzoek heeft de kopregel van de eigen website en de sleutel van de sessie", async () => {
  const { calls, fetchFunction } = fakeFetch([
    { status: 200, body: { ok: true, role: "admin", csrf: "sleutel-1" } },
    { status: 200, body: { ok: true, version: 4, saved: 1, rejected: [] } },
    { status: 200, body: { ok: true, version: 4, changes: [] } }
  ]);
  const api = new ServerApi("/api", fetchFunction);

  await api.login("beheer@voorbeeld.test", "een-lang-nepwachtwoord");
  await api.push([{ collection: "products", id: "ei", data: { id: "ei" } }]);
  await api.pull(4);

  assert.equal(calls[0].url, "/api/login");
  assert.equal(calls[0].headers["X-CR-Client"], "1");
  assert.equal(calls[0].headers["X-CSRF-Token"], undefined, "bij inloggen is er nog geen sleutel");
  assert.equal(calls[1].headers["X-CSRF-Token"], "sleutel-1");
  assert.equal(calls[1].credentials, "same-origin");
  assert.equal(calls[2].url, "/api/changes?since=4");
  assert.equal(calls[2].method, "GET");
  assert.equal(calls[2].headers["X-CSRF-Token"], undefined, "lezen heeft geen sleutel nodig");
  assert.equal(calls[2].body, undefined);
});

test("ServerApi: een fout van de server wordt een ServerError met de status en de melding", async () => {
  const { fetchFunction } = fakeFetch([
    { status: 401, body: { ok: false, message: "Het e-mailadres of het wachtwoord klopt niet." } },
    new TypeError("Failed to fetch"),
    { status: 500, body: undefined }
  ]);
  const api = new ServerApi("/api", fetchFunction);

  await assert.rejects(api.login("x", "y"), (error) => error instanceof ServerError && error.status === 401 && error.message === "Het e-mailadres of het wachtwoord klopt niet.");
  await assert.rejects(api.session(), (error) => error.status === 0 && error.message === "Geen verbinding met de server.");
  await assert.rejects(api.session(), (error) => error.status === 500);
});

test("ServerApi: na uitloggen is de sleutel van de sessie weg, en een mislukte synchronisatie met AFAS komt als antwoord terug", async () => {
  const { calls, fetchFunction } = fakeFetch([
    { status: 200, body: { ok: true, role: "admin", csrf: "sleutel-1" } },
    { status: 502, body: { ok: false, message: "AFAS-synchronisatie mislukt (check): AFAS gaf een lege lijst.", notes: [] } },
    { status: 200, body: { ok: true, role: null, csrf: null } },
    { status: 200, body: { ok: true, role: "device", csrf: "sleutel-2" } },
    { status: 200, body: { ok: true, version: 1, saved: 0, rejected: [] } }
  ]);
  const api = new ServerApi("/api", fetchFunction);
  await api.session();

  const result = await api.afasSync();
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("lege lijst"));

  await api.logout();
  assert.equal(api.csrf, null);

  // Zonder sleutel (ook na opstarten zonder verbinding) haalt een schrijvend verzoek die eerst op.
  await api.push([]);
  assert.equal(calls[3].url, "/api/session");
  assert.equal(calls[4].url, "/api/changes");
  assert.equal(calls[4].headers["X-CSRF-Token"], "sleutel-2");
});
