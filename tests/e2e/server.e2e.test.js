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

const ADMIN_EMAIL = "beheer@voorbeeld.test";
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
      env: { ...environment, CR_BEHEER_EMAIL: ADMIN_EMAIL, CR_BEHEER_WACHTWOORD: ADMIN_PASSWORD },
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
    const login = await call("POST", "/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
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
    assert.equal(await browser.evaluate(`document.activeElement?.id`), "serverGateEmail");
  });

  scenario("een fout wachtwoord in het inlogscherm geeft een melding", async () => {
    await browser.click("#serverGateEmail");
    await browser.insertText(ADMIN_EMAIL);
    await browser.click("#serverGatePassword");
    await browser.insertText("verkeerd-wachtwoord");
    await browser.click("#serverGateForm button[type=submit]");
    await browser.waitFor(`!document.querySelector("#serverGateError").classList.contains("hidden")`);

    assert.equal(await browser.evaluate(`document.querySelector("#serverGateError").textContent`), "Het e-mailadres of het wachtwoord klopt niet.");
    assert.equal(await browser.evaluate(`document.querySelector("#serverGatePassword").value`), "");
    // Het fout ingevoerde wachtwoord geeft een 401, en die staat als fout in de console van de browser.
    browser.errors.length = 0;
  });

  scenario("de beheerder logt in, ziet alle gegevens en koppelt deze browser als tablet bij Hoofdkantoor", async () => {
    await browser.click("#serverGatePassword");
    await browser.insertText(ADMIN_PASSWORD);
    await browser.click("#serverGateForm button[type=submit]");
    // De pagina start opnieuw en het beheer gaat meteen open.
    await browser.waitFor(`!document.querySelector("#adminView")?.classList.contains("hidden")`, { message: "Het beheer ging niet open na inloggen." });

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
    assert.equal(session.email, null);
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

    const pulled = (await asAdmin("GET", "/changes?since=0")).json.changes;
    const guest = pulled.find((change) => change.collection === "employees" && change.data.name === "Ilse de Wit").data;
    assert.deepEqual([guest.guest, guest.phone, guest.personnelNumber], [true, "06 12345678", ""]);
    assert.ok(pulled.some((change) => change.collection === "registrations" && change.data.employeeId === guest.id), "de registratie van de gast staat niet op de server");
    const audit = pulled.filter((change) => change.collection === "auditLog").map((change) => change.data);
    assert.ok(audit.some((entry) => entry.action === "Gast geregistreerd" && entry.details === "Ilse de Wit"));
    assert.ok(!JSON.stringify(audit).includes("12345678"), "het telefoonnummer staat in het logboek");
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
