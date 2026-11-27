// Browsertests met de server: de echte pagina in een browser, met de echte API in PHP en een eigen
// database (SQLite in een tijdelijke map). Zo is te zien dat inloggen, een tablet koppelen en
// registreren samenwerken zoals in de container.
//
// De server is de ontwikkelserver (backend/dev-server.php). Die leest een .env alleen uit een lege
// tijdelijke map (CR_ENV_MAP), nooit de .env van het project. Het adres van AFAS is een nepadres dat
// de koppeling weigert, dus er gaat nooit een verzoek naar AFAS. Alle namen zijn verzonnen.
//
// Nodig: PHP 8.3 of hoger (in PATH, of PHP_PATH). Zonder PHP worden deze tests overgeslagen.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { launch, sleep, PROJECT_ROOT } from "./browser.js";

const PHP = process.env.PHP_PATH || "php";
const phpAvailable = spawnSync(PHP, ["-v"], { stdio: "ignore" }).status === 0;

const ADMIN_USERNAME = "beheerder";
// Bij iedere testrun een nieuw willekeurig wachtwoord voor de tijdelijke testdatabase. Zo staat er
// geen vast wachtwoord in de code (gitleaks zou dat terecht als mogelijk geheim melden).
const ADMIN_PASSWORD = `nep-${randomUUID()}`;
const TEST_TIMEOUT = 60000;

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

// Eén verzoek aan de API, zoals de website het doet (met Origin en de kopregel van de website).
// Geeft de status, de inhoud en de cookies die de server zette.
const apiCall = (baseUrl, method, pathname, { body = null, cookies = {}, csrf = null } = {}) => new Promise((resolve, reject) => {
  const headers = { Accept: "application/json" };
  const cookieText = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ");
  if (cookieText) headers.Cookie = cookieText;
  const text = body === null ? null : JSON.stringify(body);
  if (method !== "GET") {
    Object.assign(headers, { Origin: baseUrl, "X-CR-Client": "1", "Content-Type": "application/json" });
    if (csrf) headers["X-CSRF-Token"] = csrf;
    headers["Content-Length"] = Buffer.byteLength(text ?? "");
  }
  const request = http.request(`${baseUrl}/api${pathname}`, { method, headers }, (response) => {
    let data = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { data += chunk; });
    response.on("end", () => {
      const set = {};
      for (const line of response.headers["set-cookie"] ?? []) {
        const [pair] = line.split(";");
        const [name, value] = pair.split("=");
        set[name.trim()] = value;
      }
      let json = null;
      try {
        json = JSON.parse(data);
      } catch {
        json = null;
      }
      resolve({ status: response.statusCode, json, cookies: set });
    });
  });
  request.on("error", reject);
  if (text !== null) request.write(text);
  request.end();
});

describe("Browsertests met de server", { skip: phpAvailable ? false : "PHP is niet gevonden (zet PHP_PATH)", timeout: 300000 }, () => {
  let tempDir;
  let serverProcess;
  let baseUrl;
  let browser;
  // De sessie van de beheerder buiten de browser (om gegevens klaar te zetten en te controleren).
  const admin = { cookies: {}, csrf: null };

  const call = (method, pathname, options = {}) => apiCall(baseUrl, method, pathname, options);
  const asAdmin = (method, pathname, body = null) => call(method, pathname, { body, cookies: admin.cookies, csrf: admin.csrf });

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tvb-server-e2e-"));
    const envDir = path.join(tempDir, "geen-env");
    fs.mkdirSync(envDir);
    const environment = {
      ...process.env,
      CR_DB_DSN: `sqlite:${path.join(tempDir, "consumptie.sqlite")}`,
      CR_ENV_MAP: envDir,
      AFAS_TOKEN: "",
      AFAS_BASE_URL: "https://nep.voorbeeld.test/ProfitRestServices",
      AFAS_CONNECTOR: "Nep_Connector"
    };

    const created = spawnSync(PHP, ["backend/bin/beheerder.php", "--uit-omgeving"], {
      cwd: PROJECT_ROOT,
      env: { ...environment, CR_BEHEER_NAAM: ADMIN_USERNAME, CR_BEHEER_WACHTWOORD: ADMIN_PASSWORD },
      encoding: "utf8"
    });
    assert.equal(created.status, 0, created.stderr);
    assert.ok(!`${created.stdout}${created.stderr}`.includes(ADMIN_PASSWORD), "het wachtwoord staat in de uitvoer");

    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(PHP, ["-S", `127.0.0.1:${port}`, "backend/dev-server.php"], { cwd: PROJECT_ROOT, env: environment, stdio: "ignore" });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await call("GET", "/health")).status === 200) break;
      } catch {
        // De server start nog.
      }
      await sleep(100);
    }

    // Gegevens klaarzetten als beheerder: een bedrijf, een consumptiepunt, een product en twee medewerkers.
    const login = await call("POST", "/login", { body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD } });
    assert.equal(login.status, 200);
    admin.cookies = login.cookies;
    admin.csrf = login.json.csrf;
    const employee = (id, firstName, lastName, number, payrollCode) => ({
      collection: "employees", id,
      data: { id, name: `${firstName} ${lastName}`, firstName, lastName, payrollCode, personnelNumber: number, employerNumber: "", companyId: "bedrijf-tvb", pointId: "punt-hk", active: true, color: "#d8f1e8", badgeId: "" }
    });
    const seeded = await asAdmin("POST", "/changes", { changes: [
      { collection: "companies", id: "bedrijf-tvb", data: { id: "bedrijf-tvb", name: "TVB", employerNumber: "01" } },
      { collection: "products", id: "blikje", data: { id: "blikje", name: "Blikje", price: 0.65 } },
      { collection: "points", id: "punt-hk", data: { id: "punt-hk", name: "Hoofdkantoor", companyId: "bedrijf-tvb", products: { blikje: { offered: true, stock: 24, minimum: 6 } } } },
      employee("mw-lotte", "Lotte", "van Dijk", "5001", "101"),
      employee("mw-mark", "Mark", "Jansen", "5002", "102")
    ] });
    assert.deepEqual(seeded.json.rejected, []);

    browser = await launch({ baseUrl });
  });

  after(async () => {
    await browser?.close();
    serverProcess?.kill();
    await sleep(300);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // Laten staan in de tijdelijke map.
    }
  });

  const scenario = (name, action) => test(name, { timeout: TEST_TIMEOUT }, async () => {
    try {
      await action();
      assert.deepEqual(browser.errors, [], `Er staan fouten in de console van de browser.\n  ${browser.consoleLog.join("\n  ")}`);
    } catch (error) {
      if (error instanceof Error) error.message += await browser.diagnose(name);
      throw error;
    }
  });

  const isHidden = (selector) => browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.classList.contains("hidden") ?? true`);
  const pageText = () => browser.evaluate("document.documentElement.outerHTML");
  const waitForToast = (expected) => browser.waitFor(
    `[...document.querySelectorAll("#toast, #toastAlert")].some((toast) => !toast.classList.contains("hidden") && toast.textContent.includes(${JSON.stringify(expected)}))`,
    { message: `Melding verscheen niet: ${expected}` }
  );

  scenario("zonder inloggen staat er alleen een inlogscherm en geen enkele naam in de pagina", async () => {
    await browser.send("Page.navigate", { url: `${baseUrl}/` });
    await browser.waitFor(`document.readyState === "complete" && !document.querySelector("#serverGate").classList.contains("hidden")`);

    assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 0);
    const html = await pageText();
    for (const hidden of ["Lotte", "Jansen", "5001"]) assert.ok(!html.includes(hidden), `de pagina bevat ${hidden}`);
    assert.equal(await browser.evaluate(`document.querySelector(".app-shell").hasAttribute("inert")`), true);
    assert.equal(await browser.evaluate(`document.activeElement?.id`), "serverGateUsername");
  });

  scenario("een fout wachtwoord in het inlogscherm geeft een melding", async () => {
    await browser.click("#serverGateUsername");
    await browser.insertText(ADMIN_USERNAME);
    await browser.click("#serverGatePassword");
    await browser.insertText("verkeerd-wachtwoord");
    await browser.click("#serverGateForm button[type=submit]");
    await browser.waitFor(`!document.querySelector("#serverGateError").classList.contains("hidden")`);

    assert.equal(await browser.evaluate(`document.querySelector("#serverGateError").textContent`), "De gebruikersnaam of het wachtwoord klopt niet.");
    assert.equal(await browser.evaluate(`document.querySelector("#serverGatePassword").value`), "");
    // Het fout ingevoerde wachtwoord geeft een 401, en die staat als fout in de console van de browser.
    browser.errors.length = 0;
  });

  scenario("de beheerder logt in, ziet alle gegevens en koppelt deze browser als tablet bij Hoofdkantoor", async () => {
    await browser.click("#serverGatePassword");
    await browser.insertText(ADMIN_PASSWORD);
    await browser.click("#serverGateForm button[type=submit]");
    // De pagina start opnieuw en het beheer gaat meteen open. Tijdens het herladen is de pagina even
    // leeg: dan bestaat #adminView nog niet. Daarom eerst wachten tot de nieuwe pagina klaar is (het
    // tabblad van de server staat er) en het beheer echt zichtbaar is.
    await browser.waitFor(`document.readyState === "complete" && document.querySelector("#adminView")?.classList.contains("hidden") === false && document.querySelector("#tab-server")?.classList.contains("hidden") === false`, { message: "Het beheer ging niet open na inloggen." });

    assert.equal(await isHidden("#serverGate"), true);
    assert.equal(await isHidden("#tab-server"), false);
    assert.equal(await isHidden(".login-hint"), true, "de demotekst over het wachtwoord staat er nog");
    assert.equal(await isHidden("#wipeDataButton"), true);

    await browser.click(`.tab[data-tab="employees"]`);
    await browser.waitFor(`document.querySelector("#adminEmployeeList").textContent.includes("5001")`, { message: "De beheerder ziet het personeelsnummer niet." });

    await browser.click(`.tab[data-tab="server"]`);
    await browser.waitFor(`document.querySelector("#serverDevicePoint option[value='punt-hk']") !== null`);
    await browser.click("#serverDeviceName");
    await browser.insertText("Tablet kantine");
    await browser.evaluate(`document.querySelector("#serverDevicePoint").value = "punt-hk"`);
    await browser.click("#serverDeviceForm button[type=submit]");
    await waitForToast("Deze browser is gekoppeld als tablet");
    await browser.waitFor(`document.querySelector("#serverDeviceList").textContent.includes("Tablet kantine (deze tablet)")`);

    const devices = await asAdmin("GET", "/devices");
    assert.deepEqual(devices.json.devices.map((device) => [device.name, device.pointId]), [["Tablet kantine", "punt-hk"]]);
  });

  scenario("na uitloggen is de browser een tablet: namen wel, personeelsnummers en looncodes niet", async () => {
    await browser.click("#logoutButton");
    await browser.waitFor(`!document.querySelector("#loginView").classList.contains("hidden")`);
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#adminModal").classList.contains("hidden")`);
    await browser.manualSearch();

    // Op de tablet staan er pas namen in beeld als iemand begint te typen (FR-96).
    await browser.waitFor(`!document.querySelector("#searchPrompt").classList.contains("hidden")`, { message: "De uitleg 'Typ je naam' staat er niet." });
    assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 0);
    await browser.click("#employeeSearch");
    await browser.insertText("lot");
    await browser.waitFor(`document.querySelectorAll("[data-open-employee]").length === 1`, { message: "Na typen verschijnt Lotte niet." });
    // Lotte werkt bij Hoofdkantoor, de locatie van deze tablet: ze staat in de groep van die locatie (FR-97).
    assert.equal(await browser.evaluate(`document.querySelector("#employeeList .company-group h3").textContent`), "Hoofdkantoor");
    // Na het uitloggen haalt de tablet de gegevens opnieuw op als tablet en bewaart ze dan pas in de browser.
    await browser.waitFor(`(localStorage.getItem("tvb-blikjesregistratie-server") ?? "").includes("Lotte van Dijk")`, { message: "De tablet bewaart de namen niet." });
    assert.ok(!(await pageText()).includes("5001"), "het personeelsnummer staat nog in de pagina");
    const stored = await browser.evaluate(`localStorage.getItem("tvb-blikjesregistratie-server") ?? ""`);
    for (const hidden of ["5001", "5002", "\"101\"", "\"102\""]) assert.ok(!stored.includes(hidden), `de browser bewaart ${hidden}`);

    const session = await browser.evaluate(`fetch("/api/session").then((response) => response.json())`);
    assert.equal(session.role, "device");
    assert.equal(session.username, null);
  });

  scenario("de tablet registreert en de server bewaart het met de prijs, het werkgevernummer en de voorraad van de server", async () => {
    await browser.click(`[data-open-employee][aria-label="Product kiezen voor Lotte van Dijk"]`);
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.click(`[data-product-increment="blikje"]`);
    await browser.waitFor(`document.querySelector("#registerSelectedProductsButton").textContent.trim() === "Registreren (1)"`);
    await browser.click("#registerSelectedProductsButton");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

    let registrations = [];
    for (let attempt = 0; attempt < 50 && registrations.length === 0; attempt += 1) {
      await sleep(200);
      const pulled = await asAdmin("GET", "/changes?since=0");
      registrations = pulled.json.changes.filter((change) => change.collection === "registrations");
    }
    assert.equal(registrations.length, 1, "de registratie kwam niet op de server");
    assert.equal(registrations[0].data.employeeId, "mw-lotte");
    assert.equal(registrations[0].data.price, 0.65);
    assert.equal(registrations[0].data.employerNumber, "01");
    const devices = (await asAdmin("GET", "/devices")).json.devices;
    assert.equal(registrations[0].data.deviceId, devices.find((device) => device.name === "Tablet kantine").id, "de server zet de tablet niet bij de registratie");
    // Na registreren is het zoekveld leeg en staan er weer geen namen in beeld.
    await browser.manualSearch();
    await browser.waitFor(`document.querySelectorAll("[data-open-employee]").length === 0 && !document.querySelector("#searchPrompt").classList.contains("hidden")`);
    const points = (await asAdmin("GET", "/changes?since=0")).json.changes.filter((change) => change.collection === "points");
    assert.equal(points[0].data.products.blikje.stock, 23);
  });

  scenario("een registratie van een tweede tablet verschijnt vanzelf op deze tablet", async () => {
    await browser.manualSearch();
    await browser.waitFor(`document.querySelector("#todayTotal").textContent === "1"`);

    // Een tweede tablet koppelen en daarmee registreren, buiten de browser om.
    const linked = await asAdmin("POST", "/devices", { name: "Tablet hal", pointId: "punt-hk" });
    const tablet = { cookies: { cr_tablet: linked.cookies.cr_tablet } };
    tablet.csrf = (await call("GET", "/session", { cookies: tablet.cookies })).json.csrf;
    const pulled = await call("GET", "/changes?since=0", { cookies: tablet.cookies });
    const mark = pulled.json.changes.find((change) => change.id === "mw-mark").data;
    assert.equal(mark.personnelNumber, "", "de tweede tablet krijgt het personeelsnummer");
    assert.ok(!pulled.json.changes.some((change) => change.collection === "auditLog"), "de tweede tablet krijgt het logboek");

    const pushed = await call("POST", "/changes", {
      cookies: tablet.cookies,
      csrf: tablet.csrf,
      body: { changes: [{ collection: "registrations", id: "reg-tablet-hal", data: { id: "reg-tablet-hal", employeeId: "mw-mark", productId: "blikje", price: 0.01, pointId: "punt-hk", createdAt: new Date().toISOString() } }] }
    });
    assert.deepEqual(pushed.json.rejected, []);

    await browser.waitFor(`document.querySelector("#todayTotal").textContent === "2"`, { timeout: 20000, message: "De registratie van de tweede tablet kwam niet op deze tablet." });
  });

  scenario("een gast registreert zich op de tablet en het telefoonnummer staat daarna alleen op de server", async () => {
    await browser.manualSearch();
    await browser.click("#employeeSearch");
    await browser.insertText("ilse");
    await browser.waitFor(`!document.querySelector("#emptyState").classList.contains("hidden")`, { message: "'Geen medewerker gevonden' verscheen niet." });
    await browser.click(`#emptyState [data-open-guest]`);
    await browser.waitFor(`!document.querySelector("#guestModal").classList.contains("hidden")`);

    await browser.click("#guestFirstName");
    await browser.insertText("Ilse");
    await browser.click("#guestLastName");
    await browser.insertText("de Wit");
    await browser.click("#guestPhone");
    await browser.insertText("06 12345678");
    await browser.click(`#guestForm button[type=submit]`);
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`, { message: "Het productvenster van de gast ging niet open." });
    await browser.click(`[data-product-increment="blikje"]`);
    await browser.click("#registerSelectedProductsButton");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

    // Na het wegsturen haalt de tablet de gast terug van de server, zonder telefoonnummer.
    await browser.waitFor(`(() => { const text = localStorage.getItem("tvb-blikjesregistratie-server") ?? ""; return text.includes("Ilse de Wit") && !text.includes("12345678"); })()`,
      { timeout: 20000, message: "Het telefoonnummer staat nog op de tablet." });

    // De registratie kan nog onderweg zijn (de tablet stuurt wijzigingen kort na elkaar weg).
    let pulled = [];
    let guest = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      pulled = (await asAdmin("GET", "/changes?since=0")).json.changes;
      guest = pulled.find((change) => change.collection === "employees" && change.data.name === "Ilse de Wit")?.data ?? null;
      if (guest && pulled.some((change) => change.collection === "registrations" && change.data.employeeId === guest.id)) break;
      await sleep(200);
    }
    assert.deepEqual([guest.guest, guest.phone, guest.personnelNumber], [true, "06 12345678", ""]);
    assert.ok(pulled.some((change) => change.collection === "registrations" && change.data.employeeId === guest.id), "de registratie van de gast staat niet op de server");
    const audit = pulled.filter((change) => change.collection === "auditLog").map((change) => change.data);
    assert.ok(audit.some((entry) => entry.action === "Gast geregistreerd" && entry.details === "Ilse de Wit"));
    assert.ok(!JSON.stringify(audit).includes("12345678"), "het telefoonnummer staat in het logboek");
  });

  scenario("herkennen met de pas gebeurt op de server: de tablet kent geen pasnummers en geen gezichtskenmerken (AF-07, AF-08)", async () => {
    // De beheerder geeft Lotte een pas en een gezicht, buiten de browser om.
    const changes = (await asAdmin("GET", "/changes?since=0")).json.changes;
    const lotte = changes.find((change) => change.id === "mw-lotte").data;
    const descriptor = Array(128).fill(0.125);
    const pushed = await asAdmin("POST", "/changes", { changes: [
      { collection: "employees", id: "mw-lotte", data: { ...lotte, badgeId: "04A1B2C3" } },
      { collection: "faceEnrollments", id: "g-lotte", data: { id: "g-lotte", employeeId: "mw-lotte", descriptor, enrolledAt: new Date().toISOString(), consentAt: new Date().toISOString() } }
    ] });
    assert.deepEqual(pushed.json.rejected, []);

    // De pas scannen op de tablet: de server zoekt hem op en het productvenster van Lotte gaat open.
    await browser.manualSearch();
    await browser.scanBadge("04:a1:b2:c3");
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`, { message: "Het productvenster ging niet open na de pas." });
    assert.equal(await browser.evaluate(`document.querySelector("#employeeProductsTitle").textContent`), "Product kiezen voor Lotte van Dijk");
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

    // Wat de tablet van de server krijgt en bewaart, bevat geen pasnummer en geen kenmerken.
    await sleep(9000); // het volgende ophalen (iedere 8 seconden)
    const seen = await browser.evaluate(`fetch("/api/changes?since=0").then((response) => response.json())`);
    const lotteOnTablet = seen.changes.find((change) => change.id === "mw-lotte").data;
    assert.deepEqual([lotteOnTablet.badgeId, lotteOnTablet.badgeLinked], ["", true]);
    const face = seen.changes.find((change) => change.id === "g-lotte").data;
    assert.ok(face && !("descriptor" in face), "de tablet krijgt de kenmerken");
    const stored = await browser.evaluate(`localStorage.getItem("tvb-blikjesregistratie-server") ?? ""`);
    assert.ok(stored.includes("Lotte van Dijk"));
    for (const hidden of ["04A1B2C3", "0.125"]) {
      assert.ok(!stored.includes(hidden), `de tablet bewaart ${hidden}`);
      assert.ok(!(await pageText()).includes(hidden), `de pagina bevat ${hidden}`);
    }

    // Herkennen met het gezicht kan alleen via de server, ook voor de beheerder.
    const recognized = await asAdmin("POST", "/recognize/face", { descriptor });
    assert.equal(recognized.json.employeeId, "mw-lotte");
    const adminView = (await asAdmin("GET", "/changes?since=0")).json.changes.find((change) => change.id === "g-lotte").data;
    assert.ok(!("descriptor" in adminView), "de beheerder krijgt de kenmerken");
  });

  scenario("snellere optie: Mark koppelt zelf zijn pas op de tablet en wordt daarna met die pas herkend", async () => {
    await browser.manualSearch();
    await browser.click("#employeeSearch");
    await browser.insertText("mark");
    await browser.waitFor(`document.querySelectorAll("[data-open-employee]").length === 1`);
    await browser.click(`[data-open-employee][aria-label="Product kiezen voor Mark Jansen"]`);
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

    // De vraag staat in het productvenster. De tablet heeft geen camera, dus alleen "Pasje" kan.
    await browser.waitFor(`Boolean(document.querySelector("#faceEnrollArea [data-quick-setup]"))`, { message: "De vraag 'Snellere optie instellen' staat er niet." });
    await browser.click("#faceEnrollArea [data-quick-setup]");
    await browser.waitFor(`!document.querySelector("#quickSetupModal").classList.contains("hidden")`);
    assert.deepEqual(await browser.evaluate(`["#quickSetupFace", "#quickSetupBadge", "#quickSetupBoth"].map((id) => document.querySelector(id).classList.contains("hidden"))`), [true, false, true]);
    await browser.click("#quickSetupBadge");
    await browser.waitFor(`!document.querySelector("#badgeLinkModal").classList.contains("hidden")`);

    // Eerst de pas van Lotte: die hoort al bij iemand anders.
    await browser.scanBadge("04A1B2C3");
    await browser.waitFor(`document.querySelector("#badgeLinkStatus").textContent === "Deze pas is al gekoppeld aan iemand anders. Vraag het de beheerder."`);
    assert.equal(await isHidden("#badgeLinkModal"), false);
    // De server weigert met status 409. Die staat als fout in de console van de browser: dat is hier de bedoeling.
    await sleep(200);
    assert.ok(browser.errors.every((error) => error.includes("status of 409") && error.includes("/api/badge/link")), browser.errors.join(" | "));
    browser.errors.length = 0;

    // Dan een eigen pas.
    await browser.scanBadge("aa:bb:cc:dd");
    await waitForToast("Je pas is gekoppeld. Voortaan houd je je pas tegen de lezer.");
    assert.equal(await isHidden("#badgeLinkModal"), true);
    await browser.waitFor(`!document.querySelector("#faceEnrollArea [data-quick-setup]")`, { message: "De vraag staat er nog, terwijl Mark nu een pas heeft." });
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

    const changes = (await asAdmin("GET", "/changes?since=0")).json.changes;
    assert.equal(changes.find((change) => change.id === "mw-mark").data.badgeId, "AABBCCDD");
    assert.ok(changes.some((change) => change.collection === "auditLog" && change.data.action === "Pas gekoppeld door medewerker" && change.data.details === "Mark Jansen"));

    // Met de nieuwe pas wordt Mark herkend.
    await browser.manualSearch();
    await browser.scanBadge("AABBCCDD");
    await browser.waitFor(`document.querySelector("#employeeProductsTitle").textContent === "Product kiezen voor Mark Jansen" && !document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
  });

  scenario("de beheerder importeert looncodes uit een bestand en koppelt een afdeling uit AFAS aan een consumptiepunt", async () => {
    // Een medewerker zoals hij uit AFAS komt: met een afdeling, zonder looncode en zonder consumptiepunt.
    const seeded = await asAdmin("POST", "/changes", { changes: [{
      collection: "employees", id: "mw-sanne",
      data: { id: "mw-sanne", name: "Sanne Bakker", firstName: "Sanne", lastName: "Bakker", payrollCode: "", personnelNumber: "5003", employerNumber: "", companyId: "bedrijf-tvb", pointId: null, active: true, color: "#e3eef6", badgeId: "", unit: "Service" }
    }] });
    assert.deepEqual(seeded.json.rejected, []);

    // Inloggen als beheerder op deze tablet (eerst weg van het startscherm).
    await browser.manualSearch();
    await browser.click("#adminOpenButton");
    await browser.waitFor(`!document.querySelector("#loginView").classList.contains("hidden")`);
    await browser.click("#loginUsername");
    await browser.insertText(ADMIN_USERNAME);
    await browser.click("#loginPassword");
    await browser.insertText(ADMIN_PASSWORD);
    await browser.click("#loginForm button[type=submit]");
    await browser.waitFor(`!document.querySelector("#adminView").classList.contains("hidden")`, { message: "Het beheer ging niet open." });

    // Looncodes importeren met het verborgen bestandsveld (FR-101).
    await browser.click(`.tab[data-tab="employees"]`);
    const csv = path.join(tempDir, "looncodes.csv");
    fs.writeFileSync(csv, "﻿Personeelsnummer;Looncode\r\n5003;303\r\n9999;1\r\n");
    const { root } = await browser.send("DOM.getDocument");
    const { nodeId } = await browser.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#payrollImportFile" });
    await browser.send("DOM.setFileInputFiles", { nodeId, files: [csv] });
    await waitForToast("Looncodes: 1 bijgewerkt, 0 al goed, 1 onbekend personeelsnummer. Controleer regel 3 van het bestand.");

    // De afdeling Service koppelen aan Hoofdkantoor (FR-102).
    await browser.click(`.tab[data-tab="server"]`);
    await browser.waitFor(`document.querySelector("#serverUnitList").textContent.includes("Service")`, { message: "De afdeling staat niet in de lijst." });
    await browser.evaluate(`document.querySelector('#serverUnitList select[aria-label="Consumptiepunt van Service"]').value = "punt-hk"`);
    await browser.click(`#serverUnitList .table-action`);
    await waitForToast("Service is opgeslagen. 1 medewerker kreeg dit consumptiepunt.");

    // Op de server: de looncode, het consumptiepunt en de afdeling bij het punt.
    let sanne = null;
    let point = null;
    for (let attempt = 0; attempt < 50 && !(sanne?.payrollCode === "303" && sanne?.pointId === "punt-hk"); attempt += 1) {
      await sleep(200);
      const changes = (await asAdmin("GET", "/changes?since=0")).json.changes;
      sanne = changes.find((change) => change.id === "mw-sanne")?.data;
      point = changes.find((change) => change.id === "punt-hk")?.data;
    }
    assert.deepEqual([sanne.payrollCode, sanne.pointId], ["303", "punt-hk"]);
    assert.deepEqual(point.units, ["Service"]);
    assert.equal(point.products.blikje.offered, true, "het aanbod van het punt is veranderd");
    const audit = (await asAdmin("GET", "/changes?since=0")).json.changes.filter((change) => change.collection === "auditLog").map((change) => change.data.action);
    assert.ok(audit.includes("Looncodes geïmporteerd") && audit.includes("Afdeling gekoppeld"), audit.join(", "));
  });

  scenario("de beheerder wijzigt zijn wachtwoord bij Mijn account, en daarna werkt alleen het nieuwe", async () => {
    // Het beheer staat nog open van de vorige test.
    await browser.click(`.tab[data-tab="server"]`);
    await browser.waitFor(`document.querySelector("#serverAccountName").textContent === "Je bent ingelogd als ${ADMIN_USERNAME}."`, { message: "Mijn account noemt de gebruikersnaam niet." });
    const newPassword = `nieuw-${randomUUID()}`;
    const type = async (selector, text) => {
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ""`);
      await browser.click(selector);
      await browser.insertText(text);
    };

    // Twee verschillende nieuwe wachtwoorden: een melding, en de server is niets gevraagd.
    await type("#serverPasswordCurrent", ADMIN_PASSWORD);
    await type("#serverPasswordNew", newPassword);
    await type("#serverPasswordRepeat", `${newPassword}-anders`);
    await browser.click("#serverPasswordForm button[type=submit]");
    await browser.waitFor(`document.querySelector("#serverPasswordError").textContent === "De twee nieuwe wachtwoorden zijn niet gelijk."`);

    await type("#serverPasswordRepeat", newPassword);
    await browser.click("#serverPasswordForm button[type=submit]");
    await waitForToast("Je wachtwoord is gewijzigd. Log voortaan in met het nieuwe wachtwoord.");
    assert.equal(await browser.evaluate(`document.querySelector("#serverPasswordNew").value`), "");

    // Op de server: het oude wachtwoord werkt niet meer, het nieuwe wel. Deze browser blijft ingelogd.
    assert.equal((await call("POST", "/login", { body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD } })).status, 401);
    assert.equal((await call("POST", "/login", { body: { username: ADMIN_USERNAME, password: newPassword } })).status, 200);
    const session = await browser.evaluate(`fetch("/api/session").then((response) => response.json())`);
    assert.deepEqual([session.role, session.username], ["admin", ADMIN_USERNAME]);
  });

  scenario("zonder inloggen geeft de API niets, en de server levert geen andere bestanden uit", async () => {
    assert.equal((await call("GET", "/changes?since=0")).status, 401);
    assert.equal((await call("GET", "/devices")).status, 401);
    for (const pathname of ["/.env", "/backend/src/Server/Api.php", "/docs/TO-CONSUMPTIEREGISTRATIE.md", "/package.json"]) {
      const status = await new Promise((resolve) => http.get(`${baseUrl}${pathname}`, (response) => { response.resume(); resolve(response.statusCode); }));
      assert.equal(status, 404, pathname);
    }
  });
});
