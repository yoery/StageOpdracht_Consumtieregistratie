// Browsertests (end-to-end): de echte pagina in headless Edge of Chrome, met echte klikken en
// toetsaanslagen. Waar de unit tests de classes los testen met een nep-DOM, kijken deze tests of
// alles samen werkt in een browser: HTML, CSS, de ES-modules, localStorage en de CSP.
//
// Draaien: npm run test:e2e (of node --test "tests/e2e/*.test.js"). Zie tests/e2e/browser.js voor hoe de
// browser wordt gestart en hoe je met BROWSER_PATH een andere browser kiest.
//
// Iedere test begint met lege opslag (dus met de demogegevens) en eindigt met de controle dat
// er geen fouten in de console van de browser zijn verschenen.
// De correctieknoppen (+ en −) in het beheer worden hier niet getest; die staan in de unit tests.
import { describe, test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { launch } from "./browser.js";

// Maximale duur van één test, in milliseconden (een vastgelopen test stopt dan vanzelf).
const TEST_TIMEOUT = 30000;

// Selector voor de rij van een medewerker op de beginpagina.
const row = (name) => `[data-open-employee][aria-label="Product kiezen voor ${name}"]`;

describe("Browsertests (end-to-end)", { timeout: 120000 }, () => {
  let browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser?.close();
  });

  beforeEach(async () => {
    await browser.openApp();
  });

  // Geen enkele test mag een fout in de console van de browser geven.
  afterEach(() => {
    assert.deepEqual(browser.errors, [], "Er staan fouten in de console van de browser");
  });

  // Hulpfuncties die in meerdere tests terugkomen.
  const text = (selector) => browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim()`);
  const isHidden = (selector) => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).classList.contains("hidden")`);
  const waitForToast = (expected) => browser.waitFor(
    `(() => { const toast = document.querySelector("#toast"); return !toast.classList.contains("hidden") && toast.textContent.includes(${JSON.stringify(expected)}); })()`,
    { message: `Melding verscheen niet: ${expected}` }
  );

  // Registreert via het productvenster `amount` keer het product met deze id voor een medewerker.
  const registerProduct = async (name, productId, amount) => {
    await browser.click(row(name));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    for (let count = 0; count < amount; count += 1) {
      await browser.click(`[data-product-increment="${productId}"]`);
    }
    await browser.waitFor(`document.querySelector("#registerSelectedProductsButton").textContent.trim() === "Registreren (${amount})"`);
    await browser.click("#registerSelectedProductsButton");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
  };

  // Logt in als beheerder met de demo-inloggegevens (ieder ingevuld wachtwoord werkt).
  const loginAsAdmin = async () => {
    await browser.click("#adminOpenButton");
    await browser.waitFor(`document.activeElement?.id === "loginEmail"`);
    await browser.click("#loginPassword");
    await browser.insertText("demo-wachtwoord");
    await browser.click("#loginForm button[type=submit]");
    await browser.waitFor(`!document.querySelector("#adminView").classList.contains("hidden")`);
  };

  test("de pagina laadt met de demogegevens en zonder fouten", { timeout: TEST_TIMEOUT }, async () => {
    assert.equal(await browser.evaluate("document.title"), "Consumptieregistratie | TVB");
    assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 8);
    assert.equal(await text("#todayTotal"), "0");
    assert.equal(await text("#monthTotal"), "0");
    // De datum boven de pagina is ingevuld en de file://-waarschuwing staat er niet.
    assert.notEqual(await text("#todayLabel"), "");
    assert.equal(await browser.evaluate(`document.querySelector(".file-warning")`), null);
    // De lettertypes zijn geladen (ze staan in het project zelf; de CSP blokkeert ze dus niet).
    assert.equal(await browser.evaluate(`document.fonts.ready.then(() => document.fonts.check("16px 'DM Sans'"))`), true);
  });

  test("een medewerker zoeken en het productvenster openen", { timeout: TEST_TIMEOUT }, async () => {
    await browser.click("#employeeSearch");
    await browser.insertText("Lotte");
    await browser.waitFor(`document.querySelectorAll("[data-open-employee]").length === 1`);
    assert.ok(await browser.evaluate(`Boolean(document.querySelector(${JSON.stringify(row("Lotte van Dijk"))}))`));

    await browser.click(row("Lotte van Dijk"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    assert.equal(await text("#employeeProductsTitle"), "Product kiezen voor Lotte van Dijk");
    // De focus staat op de eerste "+"-knop, zodat je met het toetsenbord meteen verder kunt.
    assert.equal(await browser.evaluate(`document.activeElement.dataset.productIncrement`), "blikje");

    // Een zoekterm zonder resultaat toont de lege melding.
    await browser.press("Escape");
    await browser.click("#employeeSearch");
    await browser.insertText("xyz");
    await browser.waitFor(`!document.querySelector("#emptyState").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 0);
  });

  test("een product registreren geeft een bevestiging en werkt de totalen bij", { timeout: TEST_TIMEOUT }, async () => {
    await registerProduct("Lotte van Dijk", "blikje", 2);

    await waitForToast("Lotte van Dijk: 2× Blikje geregistreerd");
    assert.equal(await text("#todayTotal"), "2");
    assert.equal(await text("#monthTotal"), "2");

    // De registraties staan in localStorage, met de prijs van dat moment.
    const data = await browser.storedData();
    assert.equal(data.registrations.length, 2);
    assert.ok(data.registrations.every((registration) => registration.productId === "blikje" && registration.price === 0.65));

    // Bij de volgende keer wordt de medewerker herkend als terugkerend en staat de vorige keuze klaar.
    await browser.click(row("Lotte van Dijk"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    assert.match(await text("#employeeWelcome"), /Lotte, welkom terug\./);
    assert.equal(await isHidden("#employeeSuggestion"), false);
    assert.match(await text("#employeeSuggestion"), /Blikje/);
  });

  test("registreren zonder keuze geeft een melding en slaat niets op", { timeout: TEST_TIMEOUT }, async () => {
    await browser.click(row("Mark Jansen"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.click("#registerSelectedProductsButton");

    await waitForToast("Kies eerst minimaal één product");
    assert.equal(await isHidden("#employeeProductsModal"), false);
    assert.equal((await browser.storedData())?.registrations.length ?? 0, 0);
  });

  test("Escape sluit een venster en de focus gaat terug naar waar die was", { timeout: TEST_TIMEOUT }, async () => {
    // Productvenster: openen met het toetsenbord (Enter op de rij), sluiten met Escape.
    await browser.evaluate(`document.querySelector(${JSON.stringify(row("Mark Jansen"))}).focus()`);
    await browser.press("Enter");
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.activeElement.getAttribute("aria-label")`), "Product kiezen voor Mark Jansen");

    // Beheervenster: openen met de knop, sluiten met Escape; de focus gaat terug naar de knop.
    await browser.click("#adminOpenButton");
    await browser.waitFor(`!document.querySelector("#adminModal").classList.contains("hidden")`);
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#adminModal").classList.contains("hidden")`);
    assert.equal(await browser.evaluate("document.activeElement.id"), "adminOpenButton");
  });

  test("inloggen als beheerder en de registratie zien in het overzicht", { timeout: TEST_TIMEOUT }, async () => {
    await registerProduct("Sophie de Boer", "ei", 1);
    await waitForToast("Sophie de Boer: 1× Ei geregistreerd");

    // Zonder wachtwoord lukt inloggen niet.
    await browser.click("#adminOpenButton");
    await browser.waitFor(`document.activeElement?.id === "loginEmail"`);
    assert.equal(await browser.evaluate(`document.querySelector("#loginEmail").value`), "admin@tvb.nl");
    await browser.click("#loginForm button[type=submit]");
    await browser.waitFor(`!document.querySelector("#loginError").classList.contains("hidden")`);
    assert.equal(await isHidden("#adminView"), true);

    // Met een wachtwoord wel (demo: ieder ingevuld wachtwoord werkt).
    await browser.click("#loginPassword");
    await browser.insertText("demo-wachtwoord");
    await browser.click("#loginForm button[type=submit]");
    await browser.waitFor(`!document.querySelector("#adminView").classList.contains("hidden")`);

    const rows = await browser.evaluate(`[...document.querySelectorAll("#adminTableBody tr")].map((tr) => [...tr.cells].slice(0, 3).map((td) => td.textContent.trim()))`);
    assert.deepEqual(rows, [["Sophie de Boer", "Ei", "+1"]]);

    // Sluiten logt uit: bij opnieuw openen staat het loginformulier er weer.
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#adminModal").classList.contains("hidden")`);
    await browser.click("#adminOpenButton");
    await browser.waitFor(`!document.querySelector("#loginView").classList.contains("hidden")`);
    assert.equal(await isHidden("#adminView"), true);
    assert.equal(await browser.evaluate(`document.querySelector("#loginPassword").value`), "");
  });

  test("het thema wisselen naar donker blijft bewaard na herladen", { timeout: TEST_TIMEOUT }, async () => {
    // Het apparaat staat op licht (zie browser.js), dus de pagina begint licht.
    assert.equal(await browser.evaluate("document.documentElement.dataset.theme"), "light");
    const lightBackground = await browser.evaluate("getComputedStyle(document.body).backgroundColor");

    await browser.click("#themeSwitch");
    await browser.waitFor(`document.documentElement.dataset.theme === "dark"`);
    assert.equal(await browser.evaluate(`document.querySelector("#themeSwitch").getAttribute("aria-checked")`), "true");
    assert.equal(await browser.evaluate(`localStorage.getItem("tvb-theme")`), "dark");
    // De achtergrond wordt echt donker (na de korte overgang van de kleur).
    await browser.waitFor(`getComputedStyle(document.body).backgroundColor !== ${JSON.stringify(lightBackground)}`);

    // Na herladen zet het script in de <head> het donkere thema meteen weer. Het merkteken op
    // window verdwijnt bij het herladen; zo wordt zeker de nieuwe pagina gecontroleerd.
    await browser.evaluate("window.oudePagina = true");
    await browser.send("Page.reload");
    await browser.waitFor(`!window.oudePagina && document.readyState === "complete" && document.querySelectorAll("[data-open-employee]").length > 0`);
    assert.equal(await browser.evaluate("document.documentElement.dataset.theme"), "dark");
    assert.equal(await browser.evaluate(`document.querySelector("#themeSwitch").getAttribute("aria-checked")`), "true");
  });

  test("een pas koppelen en daarna herkennen met de pas (nagebootste lezer)", { timeout: TEST_TIMEOUT }, async () => {
    // Een onbekende pas geeft een melding en opent geen venster.
    await browser.scanBadge("DEADBEEF");
    await waitForToast("Deze pas is niet gekoppeld aan een medewerker.");
    assert.equal(await isHidden("#employeeProductsModal"), true);

    // Pas koppelen bij Lotte in het medewerkersformulier.
    await loginAsAdmin();
    await browser.click(`.tab[data-tab="employees"]`);
    await browser.waitFor(`!document.querySelector("#employeesTab").classList.contains("hidden")`);
    const lotteId = await browser.evaluate(`[...document.querySelectorAll("[data-edit-employee]")]
      .find((button) => button.closest(".admin-employee-item").textContent.includes("Lotte van Dijk")).dataset.editEmployee`);
    await browser.click(`[data-edit-employee="${lotteId}"]`);
    await browser.waitFor(`!document.querySelector("#employeeFormModal").classList.contains("hidden")`);

    // De demomedewerkers hebben nog geen looncode en personeelsnummer; die zijn verplicht.
    await browser.click("#newEmployeePayrollCode");
    await browser.insertText("101");
    await browser.click("#newEmployeePersonnelNumber");
    await browser.insertText("5001");

    // De lezer "typt" het pasnummer met een Enter erachter; die Enter mag het formulier niet versturen.
    await browser.click("#newEmployeeBadgeId");
    await browser.scanBadge("04:a1:b2:c3");
    await browser.waitFor(`document.querySelector("#newEmployeeBadgeId").value === "04:a1:b2:c3"`);
    assert.equal(await isHidden("#employeeFormModal"), false);

    await browser.click(`#employeeForm [data-save-mode="close"]`);
    await browser.waitFor(`document.querySelector("#employeeFormModal").classList.contains("hidden")`);
    const lotte = (await browser.storedData()).employees.find((employee) => employee.id === lotteId);
    assert.equal(lotte.badgeId, "04A1B2C3");
    assert.ok(await browser.evaluate(`[...document.querySelectorAll(".badge-linked")].some((label) => label.closest(".admin-employee-item").textContent.includes("Lotte van Dijk"))`));

    // Beheer sluiten en op de beginpagina de pas aanbieden terwijl de focus in het zoekveld staat.
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#adminModal").classList.contains("hidden")`);
    await browser.click("#employeeSearch");
    await browser.scanBadge("04A1B2C3");

    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    assert.equal(await text("#employeeProductsTitle"), "Product kiezen voor Lotte van Dijk");
    assert.match(await text("#employeeWelcome"), /Je bent herkend met je pas\./);
    // Het pasnummer blijft niet in het zoekveld staan en de lijst is weer compleet.
    assert.equal(await browser.evaluate(`document.querySelector("#employeeSearch").value`), "");
    assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 8);
  });

  test("de CSV-export downloadt een bestand voor de loonadministratie", { timeout: TEST_TIMEOUT }, async () => {
    await loginAsAdmin();

    // Zonder registraties valt er niets te exporteren.
    await browser.click("#exportButton");
    await waitForToast("Geen registraties om te exporteren voor deze filters.");
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#adminModal").classList.contains("hidden")`);

    await registerProduct("Daan Smit", "blikje", 1);
    await waitForToast("Daan Smit: 1× Blikje geregistreerd");
    await loginAsAdmin();

    await browser.allowDownloads();
    const started = browser.waitForEvent("Browser.downloadWillBegin");
    await browser.click("#exportButton");
    const { guid, suggestedFilename } = await started;
    await browser.waitForEvent("Browser.downloadProgress", (params) => params.guid === guid && params.state === "completed");

    assert.match(suggestedFilename, /^blikjesregistratie-(alle-periodes|loonmaand-\d{4}-\d{2})\.csv$/);
    const file = path.join(browser.downloadDir, guid);
    const csv = fs.readFileSync(file, "utf8");
    fs.rmSync(file, { force: true });

    // BOM voor Excel, een kopregel met puntkomma's en één regel voor de registratie (geen totaalregel).
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const lines = csv.slice(1).split("\r\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^Jaar;Maand;Looncode;Personeelsnummer;/);
    assert.match(lines[1], /0,65/);
    // Er verscheen geen foutmelding.
    assert.equal(await browser.evaluate(`document.querySelector("#toast").classList.contains("toast-error") && !document.querySelector("#toast").classList.contains("hidden")`), false);
  });
});
