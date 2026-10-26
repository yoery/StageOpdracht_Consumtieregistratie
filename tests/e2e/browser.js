// Hulpcode voor de browsertests (end-to-end) in tests/e2e/.
//
// Hiermee draait de echte pagina (index.html) in een browser zonder venster (headless), zonder
// npm-pakketten zoals Playwright of Puppeteer. Er zijn drie onderdelen:
//   1. een kleine webserver met node:http die de projectmap aanbiedt (ES-modules werken niet via file://);
//   2. Microsoft Edge of Google Chrome, gestart met --headless=new en een eigen tijdelijk profiel;
//   3. het Chrome DevTools Protocol (CDP): Node stuurt de browser aan via een WebSocket
//      (ingebouwd in Node.js 22 en hoger). Zo kan de test klikken, toetsen indrukken, JavaScript
//      in de pagina uitvoeren en fouten in de console opvangen.
//
// Welke browser: de omgevingsvariabele BROWSER_PATH, anders Edge op Windows en Google Chrome of
// Chromium op Linux en macOS (zie findBrowser).
//
// Andere omgevingsvariabelen:
//   - E2E_CPU_THROTTLE: maakt de browser een aantal keer trager (bijvoorbeeld 4), om lokaal na te
//     bootsen dat een server in GitHub Actions trager is dan een laptop;
//   - E2E_SCREENSHOT_DIR: de map voor de schermafdrukken van een mislukte test (standaard
//     test-results/e2e in de projectmap). In GitHub Actions wordt die map bij een fout als
//     artifact bewaard.
//
// Dit bestand heet bewust niet *.test.js: het is geen test, maar wordt door de tests gebruikt.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// De map van het project (twee mappen boven tests/e2e/).
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// De tijdzone waarin de browser draait. De app rekent met lokale datums (vandaag, deze maand,
// loonmaand); met een vaste tijdzone maakt het niet uit of de test op een laptop in Nederland
// of op een server in UTC draait.
export const TIME_ZONE = "Europe/Amsterdam";

// Hoe lang er maximaal op iets wordt gewacht, in milliseconden. Ruim genomen: op een drukke server
// in GitHub Actions kan de browser veel trager zijn dan op een laptop. Een test die slaagt, wacht
// nooit zo lang (er wordt steeds opnieuw gekeken, zie waitFor).
const DEFAULT_TIMEOUT = 15000;

// De map voor schermafdrukken van mislukte tests.
export const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR
  ? path.resolve(process.env.E2E_SCREENSHOT_DIR)
  : path.join(PROJECT_ROOT, "test-results", "e2e");

// Hoeveel meldingen uit de console van de pagina worden bewaard voor de foutuitvoer.
const CONSOLE_HISTORY = 30;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bestandstypes die de webserver meestuurt. Een module-script moet als JavaScript worden
// aangeboden, anders weigert de browser het.
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".bin": "application/octet-stream"
};

// Zoekt de browser. Volgorde: BROWSER_PATH, daarna de standaardplekken van Edge en Chrome.
export function findBrowser() {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;

  const candidates = process.platform === "win32"
    ? [
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Google/Chrome/Application/chrome.exe"
    ]
    : process.platform === "darwin"
      ? [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      ]
      : [
        // Op ubuntu-latest in GitHub Actions staat Google Chrome al geïnstalleerd.
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/microsoft-edge"
      ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Geen browser gevonden. Zet BROWSER_PATH op het pad van Edge of Chrome. Gezocht in: ${candidates.join(", ")}`);
  }
  return found;
}

// Start een webserver op een vrije poort die alleen bestanden uit de projectmap aanbiedt.
// Een pad buiten de projectmap (bijvoorbeeld met ../) krijgt 404.
function startServer(root) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);

    // Het project heeft geen favicon. Sinds versie 3.19 heeft index.html een leeg pictogram
    // (<link rel="icon" href="data:,">), zodat de browser er niet meer om vraagt. Dit antwoord blijft
    // als vangnet: zonder zou een andere pagina een 404-melding in de console geven.
    if (pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);

    if (!file.startsWith(root + path.sep)) {
      response.writeHead(404);
      response.end();
      return;
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": CONTENT_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Wacht tot de browser het bestand DevToolsActivePort in het profiel heeft geschreven. Daarin
// staat de poort van het DevTools Protocol (de browser kiest die zelf met --remote-debugging-port=0,
// zodat twee testruns elkaar niet in de weg zitten).
async function waitForDevToolsPort(profileDir, browserProcess) {
  const file = path.join(profileDir, "DevToolsActivePort");
  const end = Date.now() + 20000;

  while (Date.now() < end) {
    if (browserProcess.startError) {
      throw new Error(`De browser kon niet worden gestart: ${browserProcess.startError.message}. Zet BROWSER_PATH op het pad van Edge of Chrome.`);
    }
    if (browserProcess.exitCode !== null) {
      throw new Error(`De browser stopte meteen (code ${browserProcess.exitCode}).`);
    }
    try {
      const port = Number(fs.readFileSync(file, "utf8").split("\n")[0]);
      if (port > 0) return port;
    } catch {
      // Het bestand bestaat nog niet; even wachten.
    }
    await sleep(100);
  }
  throw new Error("De browser startte niet op tijd (geen DevToolsActivePort).");
}

// Start de webserver en de browser en geeft een object terug waarmee de tests de pagina
// besturen. Roep aan het einde altijd close() aan.
export async function launch() {
  const server = await startServer(PROJECT_ROOT);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Een eigen, leeg profiel per testrun: geen opgeslagen gegevens van een vorige keer.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tvb-e2e-"));
  const profileDir = path.join(tempDir, "profiel");
  const downloadDir = path.join(tempDir, "downloads");
  fs.mkdirSync(downloadDir);

  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--window-size=1280,900",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-features=Translate,MediaRouter",
    "--hide-scrollbars",
    "--mute-audio"
  ];
  // In GitHub Actions (Linux) mag Chrome geen eigen sandbox maken (Ubuntu 24.04 blokkeert dat
  // voor gewone gebruikers). Alleen daar wordt de sandbox uitgezet; lokaal blijft hij aan.
  if (process.env.CI && process.platform === "linux") args.push("--no-sandbox");
  args.push("about:blank");

  const browserProcess = spawn(findBrowser(), args, { stdio: "ignore" });
  // Bestaat het programma niet (verkeerd BROWSER_PATH), dan komt er een error-event. Dat wordt
  // onthouden, zodat waitForDevToolsPort een duidelijke melding geeft in plaats van te crashen.
  browserProcess.once("error", (error) => { browserProcess.startError = error; });

  let ws;
  try {
    const port = await waitForDevToolsPort(profileDir, browserProcess);

    // Het tabblad (target) van de pagina zoeken en daarmee verbinden.
    let page;
    const end = Date.now() + 10000;
    while (!page && Date.now() < end) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        page = targets.find((target) => target.type === "page");
      } catch {
        // De browser is nog niet klaar.
      }
      if (!page) await sleep(100);
    }
    if (!page) throw new Error("Geen tabblad gevonden in de browser.");

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("Geen verbinding met de browser.")), { once: true });
    });
  } catch (error) {
    browserProcess.kill();
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    throw error;
  }

  return createSession({ ws, server, browserProcess, tempDir, downloadDir, baseUrl });
}

// Maakt de functies waarmee de tests de pagina besturen.
async function createSession({ ws, server, browserProcess, tempDir, downloadDir, baseUrl }) {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  // Fouten uit de pagina: niet-afgevangen fouten, console.error en browsermeldingen van het
  // niveau "error" (bijvoorbeeld een bestand dat niet laadt of een blokkade door de CSP).
  const errors = [];
  // De laatste meldingen uit de console (alle soorten), voor de foutuitvoer van een mislukte test.
  const consoleLog = [];
  const remember = (line) => {
    consoleLog.push(line);
    if (consoleLog.length > CONSOLE_HISTORY) consoleLog.shift();
  };

  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      const text = details.exception?.description || details.text;
      errors.push(text);
      remember(`[exception] ${text}`);
    }
    if (message.method === "Runtime.consoleAPICalled") {
      const text = message.params.args.map((arg) => arg.value ?? arg.description).join(" ");
      if (message.params.type === "error") errors.push(text);
      remember(`[console.${message.params.type}] ${text}`);
    }
    if (message.method === "Log.entryAdded") {
      const text = `${message.params.entry.text} ${message.params.entry.url || ""}`.trim();
      if (message.params.entry.level === "error") errors.push(text);
      remember(`[log.${message.params.entry.level}] ${text}`);
    }
    for (const listener of listeners) listener(message);
  });

  // Stuurt één opdracht naar de browser en wacht op het antwoord.
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });

  // Wacht op een gebeurtenis van de browser (bijvoorbeeld het einde van een download).
  const waitForEvent = (method, predicate = () => true, timeout = DEFAULT_TIMEOUT) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`Timeout bij wachten op ${method}`));
      }, timeout);
      const listener = (message) => {
        if (message.method !== method || !predicate(message.params)) return;
        clearTimeout(timer);
        listeners.delete(listener);
        resolve(message.params);
      };
      listeners.add(listener);
    });

  // Voert JavaScript uit in de pagina en geeft de uitkomst terug (ook als dat een Promise is).
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (exceptionDetails) {
      throw new Error(`${exceptionDetails.exception?.description || exceptionDetails.text}\n--- in: ${expression.slice(0, 300)}`);
    }
    return result.value;
  };

  // Wacht tot een uitdrukking in de pagina waar is. Er wordt geen vaste tijd gewacht, maar steeds
  // opnieuw gekeken, tot de timeout.
  const waitFor = async (expression, { timeout = DEFAULT_TIMEOUT, message } = {}) => {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await evaluate(expression);
      if (last) return last;
      await sleep(50);
    }
    throw new Error(message || `Timeout bij wachten op: ${expression}`);
  };

  // Een selector veilig in een stuk JavaScript zetten.
  const quote = (value) => JSON.stringify(value);

  // Wacht tot de pagina stilstaat: twee beelden (animation frames) verder en geen animatie of
  // overgang meer bezig. Gebruik dit voordat een test posities op het scherm meet.
  const settle = ({ timeout = DEFAULT_TIMEOUT } = {}) => waitFor(`(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await frame();
    await frame();
    return !document.getAnimations().some((animation) => animation.playState === "running" || animation.pending);
  })()`, { timeout, message: "De pagina komt niet tot stilstand: er blijft een animatie lopen." });

  // Het punt (midden van een element) waar een gebruiker zou klikken. Er wordt gewacht tot:
  //   - het element zichtbaar is en niet bedekt wordt door iets anders (bijvoorbeeld een venster);
  //   - er geen animatie of overgang (CSS transition) meer loopt en het element twee beelden
  //     (animation frames) na elkaar op dezelfde plek staat.
  // Dat laatste is nodig omdat een overgang ook met prefers-reduced-motion (0,01 ms) pas klaar is
  // bij het volgende beeld. De muisbeweging van CDP wacht op dat beeld. Zonder deze stap werd het
  // punt gemeten vóór dat beeld, schoof het venster daarna nog op en viel de klik ernaast (gezien bij
  // de koelkast: het venster staat in het midden en schuift omhoog als de knopbalk verschijnt).
  const clickablePoint = (selector, { timeout = DEFAULT_TIMEOUT } = {}) => waitFor(`(async () => {
    const element = document.querySelector(${quote(selector)});
    if (!element || element.getClientRects().length === 0) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const place = () => { const box = element.getBoundingClientRect(); return [box.left, box.top, box.width, box.height].join(","); };
    await frame();
    const before = place();
    await frame();
    if (!element.isConnected || place() !== before) return null;
    if (document.getAnimations().some((animation) => animation.playState === "running" || animation.pending)) return null;
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    return hit && (hit === element || element.contains(hit)) ? { x, y } : null;
  })()`, { timeout, message: `Element niet klikbaar (niet zichtbaar, bedekt of nog in beweging): ${selector}` });

  // Klikt met de muis in het midden van een element, zoals een gebruiker (zie clickablePoint).
  // Daarna wordt gecontroleerd dat de klik ook echt op het element viel. Zo niet, dan volgt een
  // duidelijke fout in plaats van een test die later op iets anders vastloopt.
  const click = async (selector, { timeout = DEFAULT_TIMEOUT } = {}) => {
    const point = await clickablePoint(selector, { timeout });
    // Eén luisteraar per pagina onthoudt waar de volgende pointerdown op viel.
    await evaluate(`(() => {
      window.__e2eKlik = { selector: ${quote(selector)}, hit: null };
      if (window.__e2eKlikLuisteraar) return;
      window.__e2eKlikLuisteraar = true;
      addEventListener("pointerdown", (event) => {
        const klik = window.__e2eKlik;
        if (!klik || klik.hit) return;
        const target = event.target;
        klik.hit = target.closest?.(klik.selector) ? "ok"
          : (target.id ? "#" + target.id : target.tagName?.toLowerCase() + (typeof target.className === "string" && target.className ? "." + target.className.trim().split(/\\s+/).join(".") : ""));
      }, { capture: true });
    })()`);

    const mouse = { x: point.x, y: point.y, button: "left", clickCount: 1 };
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...mouse });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...mouse });

    const hit = await evaluate("window.__e2eKlik?.hit");
    if (hit !== "ok") {
      throw new Error(`De klik op ${selector} viel op ${hit || "niets"} (punt ${Math.round(point.x)},${Math.round(point.y)}): het element verschoof of werd bedekt.`);
    }
  };

  // Typt tekst in het element met de focus (zoals plakken: één input-event, geen losse toetsen).
  const insertText = (text) => send("Input.insertText", { text });

  // Speciale toetsen met de codes die de browser verwacht.
  const SPECIAL_KEYS = {
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }
  };

  // De gebeurtenissen (keyDown en keyUp) voor één toets.
  const keyEvents = (key) => {
    const special = SPECIAL_KEYS[key];
    if (special) {
      const { text, ...rest } = special;
      return [
        { type: "keyDown", ...rest, ...(text ? { text } : {}) },
        { type: "keyUp", ...rest }
      ];
    }
    return [
      { type: "keyDown", key, text: key, unmodifiedText: key },
      { type: "keyUp", key }
    ];
  };

  // Drukt één toets in, bijvoorbeeld "Escape", "Enter" of "a".
  const press = async (key) => {
    for (const event of keyEvents(key)) await send("Input.dispatchKeyEvent", event);
  };

  // Bootst een USB-NFC-pasjeslezer na: die "typt" het pasnummer razendsnel, gevolgd door Enter.
  // Alle toetsen worden in één keer verstuurd (zonder op elk antwoord te wachten), zodat er ook
  // op een trage server maar een paar milliseconden tussen twee tekens zitten.
  const scanBadge = async (code) => {
    const events = [...code].flatMap(keyEvents).concat(keyEvents("Enter"));
    await Promise.all(events.map((event) => send("Input.dispatchKeyEvent", event)));
  };

  // Opent de pagina met lege opslag: localStorage van de site wordt eerst gewist, zodat iedere
  // test met de demogegevens begint. Daarna wordt gewacht tot de medewerkers op het scherm staan.
  const openApp = async () => {
    await send("Page.navigate", { url: "about:blank" });
    await send("Storage.clearDataForOrigin", { origin: baseUrl, storageTypes: "local_storage" });
    errors.length = 0;
    consoleLog.length = 0;
    await send("Page.navigate", { url: `${baseUrl}/index.html` });
    await waitFor(`document.readyState === "complete" && document.querySelectorAll("[data-open-employee]").length > 0`, {
      message: "De pagina laadde niet: er verschijnen geen medewerkers."
    });
  };

  // Leest de opgeslagen gegevens van de app uit localStorage.
  const storedData = () => evaluate(`JSON.parse(localStorage.getItem("tvb-blikjesregistratie"))`);

  // Laat downloads in een tijdelijke map opslaan, zodat de test het CSV-bestand kan lezen.
  // Met "allowAndName" krijgt het bestand als naam de guid van de download (zie downloadWillBegin).
  const allowDownloads = () => send("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  // Slaat een schermafdruk van de pagina op als PNG in SCREENSHOT_DIR en geeft het pad terug.
  const screenshot = async (name) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const safeName = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "scenario";
    const file = path.join(SCREENSHOT_DIR, `${safeName}.png`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  };

  // Tekst voor de foutuitvoer van een mislukte test: welk scenario, wat er op de pagina stond (open
  // venster, focus, schermformaat), de laatste meldingen uit de console en het pad van de
  // schermafdruk. Gaat er hierbij zelf iets mis, dan staat dat in de tekst; de oorspronkelijke fout
  // blijft altijd zichtbaar.
  const diagnose = async (name) => {
    const lines = [``, `--- Browsertest mislukt: ${name}`];
    try {
      const state = await Promise.race([
        evaluate(`({
          url: location.href,
          viewport: innerWidth + "×" + innerHeight,
          openModals: [...document.querySelectorAll(".modal-backdrop:not(.hidden)")].map((modal) => "#" + modal.id),
          focus: document.activeElement ? (document.activeElement.id ? "#" + document.activeElement.id : document.activeElement.outerHTML.slice(0, 120)) : null,
          toasts: [...document.querySelectorAll("#toast, #toastAlert")].filter((toast) => !toast.classList.contains("hidden")).map((toast) => toast.textContent.trim())
        })`),
        sleep(3000).then(() => { throw new Error("de pagina reageert niet"); })
      ]);
      lines.push(`Pagina: ${state.url} (${state.viewport}), open vensters: ${state.openModals.join(", ") || "geen"}, focus: ${state.focus}`);
      if (state.toasts.length) lines.push(`Meldingen in beeld: ${state.toasts.join(" | ")}`);
    } catch (error) {
      lines.push(`Toestand van de pagina niet leesbaar: ${error.message}`);
    }
    lines.push(consoleLog.length ? `Laatste meldingen in de console:\n  ${consoleLog.join("\n  ")}` : "Geen meldingen in de console.");
    try {
      lines.push(`Schermafdruk: ${await Promise.race([screenshot(name), sleep(5000).then(() => { throw new Error("timeout"); })])}`);
    } catch (error) {
      lines.push(`Geen schermafdruk: ${error.message}`);
    }
    return lines.join("\n");
  };

  // Sluit de browser en de webserver en ruimt het tijdelijke profiel op.
  const close = async () => {
    try {
      await Promise.race([send("Browser.close"), sleep(2000)]);
    } catch {
      // De browser was al dicht.
    }
    ws.close();
    if (browserProcess.exitCode === null) {
      await Promise.race([new Promise((resolve) => browserProcess.once("exit", resolve)), sleep(3000)]);
      if (browserProcess.exitCode === null) browserProcess.kill();
    }
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };

  // Instellingen voor iedere test: een vast scherm, de tijdzone, licht thema van het apparaat
  // en zo min mogelijk animaties (prefers-reduced-motion), zodat klikken niet op een bewegend
  // element mislukt.
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  await send("Emulation.setTimezoneOverride", { timezoneId: TIME_ZONE });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" }
    ]
  });
  // Geen camera: op een laptop met webcam zou de headless browser anders een camera zien, en dan
  // stelt de app na een passcan de vraag over gezichtsherkenning (demo). Zo werkt iedere test op
  // iedere machine hetzelfde, zoals op een server zonder camera. Een test die een camera nodig heeft,
  // zet daarna zelf een script met een nagebootste camera (zie de scenario's "vraag na een passcan").
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "if (navigator.mediaDevices) navigator.mediaDevices.enumerateDevices = async () => [];"
  });
  // Lokaal een trage server nabootsen (zie E2E_CPU_THROTTLE bovenaan).
  const throttle = Number(process.env.E2E_CPU_THROTTLE);
  if (throttle > 1) await send("Emulation.setCPUThrottlingRate", { rate: throttle });

  return {
    baseUrl,
    downloadDir,
    errors,
    consoleLog,
    send,
    evaluate,
    waitFor,
    waitForEvent,
    settle,
    clickablePoint,
    click,
    screenshot,
    diagnose,
    insertText,
    press,
    scanBadge,
    openApp,
    storedData,
    allowDownloads,
    close
  };
}
