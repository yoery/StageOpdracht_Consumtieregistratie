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

import { launch, sleep } from "./browser.js";

// Maximale duur van één test, in milliseconden (een vastgelopen test stopt dan vanzelf).
const TEST_TIMEOUT = 30000;

// Selector voor de rij van een medewerker op de beginpagina.
const row = (name) => `[data-open-employee][aria-label="Product kiezen voor ${name}"]`;

describe("Browsertests (end-to-end)", { timeout: 240000 }, () => {
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
  // Er zijn twee vaste meldingsregio's: #toast (gewone meldingen) en #toastAlert (foutmeldingen).
  const waitForToast = (expected) => browser.waitFor(
    `[...document.querySelectorAll("#toast, #toastAlert")].some((toast) => !toast.classList.contains("hidden") && toast.textContent.includes(${JSON.stringify(expected)}))`,
    { message: `Melding verscheen niet: ${expected}` }
  );
  // Is er nu een melding in beeld (in een van de twee regio's)?
  const visibleToastText = () => browser.evaluate(
    `[...document.querySelectorAll("#toast, #toastAlert")].filter((toast) => !toast.classList.contains("hidden")).map((toast) => toast.textContent.trim()).join(" ")`
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
    // Een klik op een medewerkerrij binnen 500 ms na het sluiten telt niet (bescherming tegen een
    // dubbelklik op "Registreren", zie EmployeeController.isGhostRowClick). Een echte gebruiker is
    // nooit zo snel; de test wacht daarom even voordat hij verdergaat.
    await sleep(550);
  };

  // Dubbelklik met de muis in het midden van een element: twee keer indrukken en loslaten, de
  // tweede keer met clickCount 2 (zoals de browser een echte dubbelklik doorgeeft).
  const doubleClick = async (selector) => {
    const point = await browser.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element.scrollIntoView({ block: "center" });
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    for (const clickCount of [1, 2]) {
      const mouse = { x: point.x, y: point.y, button: "left", clickCount };
      await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", ...mouse });
      await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...mouse });
    }
  };

  // Het actieve element: id of de waarde van een data-attribuut, zodat een test kan zien waar de focus staat.
  const activeData = (name) => browser.evaluate(`document.activeElement?.dataset?.${name} ?? document.activeElement?.tagName`);

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
    // Onderaan staat de korte uitleg over de inhouding op het loon.
    assert.equal(await text("#employeePrivacyNote"), "Wat je registreert, wordt maandelijks ingehouden op je loon. Meer informatie staat in de privacyverklaring voor medewerkers.");

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

    // Wie opnieuw op de naam tikt, krijgt een gewone begroeting zonder "welkom terug" en zonder
    // de keuze van de vorige keer: iedereen kan op de naam van een collega tikken (privacy).
    // Na herkenning met de pas verschijnen ze wel (zie de test met de pas hieronder).
    await browser.click(row("Lotte van Dijk"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    assert.match(await text("#employeeWelcome"), /^Goede(morgen|middag|navond) Lotte\.$/);
    assert.equal(await isHidden("#employeeSuggestion"), true);
    assert.equal(await text("#employeeSuggestion"), "");
  });

  test("UX 12: zonder keuze is Registreren uitgeschakeld met uitleg, een tik benadrukt de uitleg en slaat niets op", { timeout: TEST_TIMEOUT }, async () => {
    await browser.click(row("Mark Jansen"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

    // aria-disabled (niet disabled): de knop blijft bereikbaar en heeft de uitleg als beschrijving.
    const button = `document.querySelector("#registerSelectedProductsButton")`;
    assert.equal(await browser.evaluate(`${button}.getAttribute("aria-disabled")`), "true");
    assert.equal(await browser.evaluate(`${button}.disabled`), false);
    assert.equal(await browser.evaluate(`${button}.getAttribute("aria-describedby")`), "registerHint");
    assert.equal(await isHidden("#registerHint"), false);
    assert.equal(await text("#registerHint"), "Kies eerst een product met +");

    await browser.click("#registerSelectedProductsButton");
    await browser.waitFor(`document.querySelector("#registerHint").classList.contains("register-hint-emphasis")`);
    await sleep(200);
    // Geen foutmelding meer, het venster blijft open en er is niets opgeslagen.
    assert.equal(await visibleToastText(), "");
    assert.equal(await isHidden("#employeeProductsModal"), false);
    assert.equal((await browser.storedData())?.registrations.length ?? 0, 0);

    // Na een keuze is de knop ingeschakeld en verdwijnt de uitleg. De rij krijgt de keuze-opmaak.
    await browser.click(`[data-product-increment="blikje"]`);
    await browser.waitFor(`${button}.getAttribute("aria-disabled") === "false"`);
    assert.equal(await isHidden("#registerHint"), true);
    assert.equal(await browser.evaluate(`${button}.hasAttribute("aria-describedby")`), false);
    assert.equal(await browser.evaluate(`document.querySelector('[data-product-increment="blikje"]').closest(".personal-product-item").classList.contains("is-selected")`), true);
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
    // Lotte heeft al eens zelf iets geregistreerd (voor "welkom terug" na de scan).
    await registerProduct("Lotte van Dijk", "blikje", 1);
    await waitForToast("Lotte van Dijk: 1× Blikje geregistreerd");

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
    // In het veld komt het gelijkgemaakte pasnummer te staan.
    await browser.click("#newEmployeeBadgeId");
    await browser.scanBadge("04:a1:b2:c3");
    await browser.waitFor(`document.querySelector("#newEmployeeBadgeId").value === "04A1B2C3"`);
    assert.equal(await isHidden("#employeeFormModal"), false);

    // Een tweede scan in hetzelfde veld vervangt het nummer, in plaats van het erachter te plakken
    // (review oktober 2026, U1: eerst stond er "04A1B2C30499AABB").
    await browser.scanBadge("04:99:aa:bb");
    await browser.waitFor(`document.querySelector("#newEmployeeBadgeId").value === "0499AABB"`);
    await browser.scanBadge("04:a1:b2:c3");
    await browser.waitFor(`document.querySelector("#newEmployeeBadgeId").value === "04A1B2C3"`);

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
    assert.match(await text("#employeeWelcome"), /Lotte, welkom terug\. Je bent herkend met je pas\./);
    // Na herkenning met de pas staat de keuze van de vorige keer klaar om over te nemen.
    assert.equal(await isHidden("#employeeSuggestion"), false);
    assert.match(await text("#employeeSuggestion"), /Vorige keer koos je 1× Blikje\./);
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
    assert.equal(await browser.evaluate(`!document.querySelector("#toastAlert").classList.contains("hidden")`), false);
  });

  // ------------------------------------------------------------------
  // Review oktober 2026 (TO versie 3.11)
  // ------------------------------------------------------------------

  test("U2: een dubbelklik op Registreren opent niet het productvenster van de medewerker eronder", { timeout: TEST_TIMEOUT }, async () => {
    await browser.click(row("Lotte van Dijk"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.click(`[data-product-increment="blikje"]`);

    await doubleClick("#registerSelectedProductsButton");
    await waitForToast("Lotte van Dijk: 1× Blikje geregistreerd");
    await sleep(300);

    // De tweede klik viel op de medewerkerrij onder de knop, maar opende geen venster.
    assert.equal(await isHidden("#employeeProductsModal"), true);
    assert.equal((await browser.storedData()).registrations.length, 1);
  });

  test("U4 en U7c: een scan in het bedrijfsfilter laat geen pasnummer achter en Escape sluit de keuzelijst", { timeout: TEST_TIMEOUT }, async () => {
    // Een bedrijf kiezen in het filter.
    await browser.click("#employeeCompanyFilter");
    await browser.waitFor(`!document.querySelector("#companyFilterOptions").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").getAttribute("aria-expanded")`), "true");
    const companyId = await browser.evaluate(`document.querySelector('#companyFilterOptions [data-company-value]:not([data-company-value="all"])').dataset.companyValue`);
    await browser.click(`#companyFilterOptions [data-company-value="${companyId}"]`);
    assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").getAttribute("aria-expanded")`), "false");
    assert.equal(await browser.evaluate(`document.querySelector('[data-company-value="${companyId}"]').getAttribute("aria-selected")`), "true");
    const chosenText = await browser.evaluate(`document.querySelector("#employeeCompanyFilter").value`);

    // Met de focus in het filter een (onbekende) pas aanbieden.
    await browser.click("#employeeCompanyFilter");
    await browser.scanBadge("DEADBEEF");
    await waitForToast("Deze pas is niet gekoppeld aan een medewerker.");

    assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").value`), chosenText);
    assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").dataset.value`), companyId);
    assert.equal(await isHidden("#companyFilterOptions"), true);
    assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 8);

    // Escape sluit een open keuzelijst; er gaat geen venster open of dicht.
    await browser.click("#employeeCompanyFilter");
    await browser.waitFor(`!document.querySelector("#companyFilterOptions").classList.contains("hidden")`);
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#companyFilterOptions").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").getAttribute("aria-expanded")`), "false");
    assert.equal(await browser.evaluate(`document.querySelectorAll(".modal-backdrop:not(.hidden)").length`), 0);
  });

  test("U5: na opslaan van een wijzigformulier en na (de)activeren staat de focus weer op de knop", { timeout: TEST_TIMEOUT }, async () => {
    await loginAsAdmin();

    // Product: eerst opnieuw tekenen, dan het formulier sluiten.
    await browser.click(`.tab[data-tab="products"]`);
    assert.equal(await browser.evaluate(`document.querySelector('.tab[data-tab="products"]').getAttribute("aria-selected")`), "true");
    await browser.click(`[data-edit-product="blikje"]`);
    await browser.waitFor(`!document.querySelector("#productFormModal").classList.contains("hidden")`);
    await browser.click(`#productForm [data-save-mode="close"]`);
    await browser.waitFor(`document.querySelector("#productFormModal").classList.contains("hidden")`);
    assert.equal(await activeData("editProduct"), "blikje");

    // Bedrijf: eerst het formulier sluiten, dan opnieuw tekenen.
    await browser.click(`.tab[data-tab="companies"]`);
    const companyId = await browser.evaluate(`document.querySelector("[data-edit-company]").dataset.editCompany`);
    await browser.click(`[data-edit-company="${companyId}"]`);
    await browser.waitFor(`!document.querySelector("#companyFormModal").classList.contains("hidden")`);
    await browser.click(`#companyForm button[type="submit"]`);
    await browser.waitFor(`document.querySelector("#companyFormModal").classList.contains("hidden")`);
    assert.equal(await activeData("editCompany"), companyId);

    // Medewerker (de)activeren: de knop wisselt van tekst, maar houdt de focus.
    await browser.click(`.tab[data-tab="employees"]`);
    const employeeId = await browser.evaluate(`document.querySelector("[data-toggle-employee]").dataset.toggleEmployee`);
    await browser.click(`[data-toggle-employee="${employeeId}"]`);
    await waitForToast("Medewerkerstatus gewijzigd");
    assert.equal(await activeData("toggleEmployee"), employeeId);
  });

  test("R1: letters in een cijferveld geven 'Gebruik alleen cijfers.' en er wordt niets opgeslagen", { timeout: TEST_TIMEOUT }, async () => {
    await loginAsAdmin();
    await browser.click(`.tab[data-tab="employees"]`);
    await browser.click("#addEmployeeButton");
    await browser.waitFor(`!document.querySelector("#employeeFormModal").classList.contains("hidden")`);

    await browser.click("#newEmployeeFirstName");
    await browser.insertText("Test");
    await browser.click("#newEmployeeLastName");
    await browser.insertText("Persoon");
    await browser.click("#newEmployeePayrollCode");
    await browser.insertText("12a");
    await browser.click("#newEmployeePersonnelNumber");
    await browser.insertText("999");
    await browser.evaluate(`(() => { const select = document.querySelector("#newEmployeeCompany"); select.value = select.options[1].value; select.dispatchEvent(new Event("change")); })()`);
    await browser.evaluate(`(() => { const select = document.querySelector("#newEmployeePoint"); if (select.options.length > 1) select.value = select.options[1].value; })()`);
    // Het veld houdt "12a" vast (bij type="number" bleef er stil "12" over).
    assert.equal(await browser.evaluate(`document.querySelector("#newEmployeePayrollCode").value`), "12a");

    await browser.click(`#employeeForm [data-save-mode="close"]`);
    await browser.waitFor(`Boolean(document.querySelector("#newEmployeePayrollCode-error"))`);
    assert.equal(await text("#newEmployeePayrollCode-error"), "Gebruik alleen cijfers.");
    assert.equal(await isHidden("#employeeFormModal"), false);
    const stored = await browser.storedData();
    assert.equal(stored?.employees.some((employee) => employee.firstName === "Test") ?? false, false);
  });

  // ------------------------------------------------------------------
  // UX-review oktober 2026 (TO versie 3.12)
  // ------------------------------------------------------------------

  // Zet het schermformaat (CSS-pixels) en zet het na afloop terug op het standaardscherm van browser.js.
  const withViewport = async (width, height, action) => {
    await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    try {
      await action();
    } finally {
      await browser.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    }
  };

  // Koppelt een pas aan een demomedewerker zonder het beheer: na één registratie staan de gegevens in
  // localStorage. Daar komt het pasnummer bij, en daarna wordt de pagina opnieuw geladen.
  const linkBadgeDirectly = async (name, badgeId) => {
    await registerProduct("Daan Smit", "blikje", 1);
    await browser.evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("tvb-blikjesregistratie"));
      data.employees.find((employee) => employee.name === ${JSON.stringify(name)}).badgeId = ${JSON.stringify(badgeId)};
      localStorage.setItem("tvb-blikjesregistratie", JSON.stringify(data));
      window.oudePagina = true;
    })()`);
    await browser.send("Page.reload");
    await browser.waitFor(`!window.oudePagina && document.readyState === "complete" && document.querySelectorAll("[data-open-employee]").length > 0`);
  };

  test("UX 1: het productvenster sluit vanzelf na 75 seconden zonder invoer, met eerst een waarschuwing", { timeout: TEST_TIMEOUT }, async () => {
    // Nep-klok voor de pagina: Date.now() loopt zo veel milliseconden voor als de test aangeeft. Zo
    // hoeft de test niet 75 seconden te wachten. De app gebruikt Date.now() via AdminController.realClock.
    const { identifier } = await browser.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "(() => { const echt = Date.now.bind(Date); window.klokVooruit = 0; Date.now = () => echt() + window.klokVooruit; })()"
    });
    try {
      await browser.openApp();
      await browser.click("#employeeSearch");
      await browser.insertText("Lotte");
      await browser.waitFor(`document.querySelectorAll("[data-open-employee]").length === 1`);
      await browser.click(row("Lotte van Dijk"));
      await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
      await browser.click(`[data-product-increment="blikje"]`);
      assert.equal(await text("#productIdleWarning"), "");

      // 66 seconden niets gedaan: de waarschuwing staat in het venster.
      await browser.evaluate("window.klokVooruit = 66000");
      await browser.waitFor(`document.querySelector("#productIdleWarning").textContent === "Venster sluit zo. Tik om door te gaan."`, { timeout: 4000 });
      assert.equal(await browser.evaluate(`document.querySelector("#productIdleWarning").getAttribute("role")`), "status");

      // Een tik in het venster begint de tijd opnieuw: de waarschuwing verdwijnt en het venster blijft open.
      await browser.click("#employeeProductsTitle");
      await browser.waitFor(`document.querySelector("#productIdleWarning").textContent === ""`);
      await sleep(1200);
      assert.equal(await isHidden("#employeeProductsModal"), false);

      // Daarna 76 seconden niets: het venster gaat dicht zonder op te slaan, het zoekveld is leeg.
      await browser.evaluate("window.klokVooruit = 66000 + 76000");
      await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`, { timeout: 4000 });
      assert.equal((await browser.storedData())?.registrations.length ?? 0, 0);
      assert.equal(await browser.evaluate(`document.querySelector("#employeeSearch").value`), "");
      assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 8);
      assert.equal(await text("#productIdleWarning"), "");
    } finally {
      await browser.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  });

  test("UX 2: een pas vervangt het open productvenster van een collega en geeft een melding bij een ander venster", { timeout: TEST_TIMEOUT }, async () => {
    await linkBadgeDirectly("Lotte van Dijk", "04A1B2C3");

    // Mark kiest iets, maar registreert niet en loopt weg. Lotte houdt haar pas tegen de lezer.
    await browser.click(row("Mark Jansen"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.click(`[data-product-increment="ei"]`);
    await browser.scanBadge("04A1B2C3");

    await browser.waitFor(`document.querySelector("#employeeProductsTitle").textContent === "Product kiezen voor Lotte van Dijk"`);
    assert.match(await text("#employeeWelcome"), /Je bent herkend met je pas\.$/);
    assert.equal(await text("#registerSelectedProductsButton"), "Registreren");
    // De keuze van Mark is niet opgeslagen (alleen de registratie van Daan uit de voorbereiding).
    assert.equal((await browser.storedData()).registrations.length, 1);

    // Dezelfde pas nog een keer: het venster van Lotte blijft open, met haar keuze.
    await browser.click(`[data-product-increment="blikje"]`);
    await browser.scanBadge("04A1B2C3");
    await sleep(400);
    assert.equal(await text("#employeeProductsTitle"), "Product kiezen voor Lotte van Dijk");
    assert.equal(await text("#registerSelectedProductsButton"), "Registreren (1)");

    // Staat een ander venster open (hier het beheer), dan opent er niets en volgt een melding.
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.click("#adminOpenButton");
    await browser.waitFor(`!document.querySelector("#adminModal").classList.contains("hidden")`);
    await browser.click("#adminTitle");
    await browser.scanBadge("04A1B2C3");
    await waitForToast("Sluit eerst het open venster om je pas te gebruiken.");
    assert.equal(await isHidden("#employeeProductsModal"), true);
    assert.equal(await isHidden("#adminModal"), false);
  });

  test("UX 3: de knop Registreren blijft in beeld op een liggende tablet, een telefoon en bij 200% zoom", { timeout: TEST_TIMEOUT }, async () => {
    // [breedte, hoogte] in CSS-pixels. 540 × 405 is een liggende tablet van 1080 × 810 bij 200% zoom.
    for (const [width, height] of [[1080, 810], [390, 844], [540, 405]]) {
      await withViewport(width, height, async () => {
        await browser.click(row("Lotte van Dijk"));
        await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

        const inView = () => browser.evaluate(`(() => {
          const button = document.querySelector("#registerSelectedProductsButton");
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return { top: box.top, bottom: box.bottom, height: box.height, fontSize: getComputedStyle(button).fontSize,
            covered: !(hit === button || button.contains(hit)), viewport: innerHeight };
        })()`);
        const scroller = `document.querySelector("#employeeProductsModal .modal")`;
        // Het venster is hier hoger dan het scherm: de productlijst scrolt.
        assert.ok(await browser.evaluate(`${scroller}.scrollHeight > ${scroller}.clientHeight`), `${width}×${height}: het venster scrolt niet`);

        for (const position of ["top", "middle"]) {
          if (position === "middle") await browser.evaluate(`${scroller}.scrollTop = ${scroller}.scrollHeight / 3`);
          const button = await inView();
          assert.ok(button.top >= 0 && button.bottom <= button.viewport, `${width}×${height} (${position}): Registreren staat buiten beeld (${button.top}-${button.bottom})`);
          assert.equal(button.covered, false, `${width}×${height} (${position}): Registreren wordt bedekt`);
          assert.ok(button.height >= 52 && button.height <= 56, `${width}×${height}: hoogte ${button.height}`);
          assert.equal(button.fontSize, "19px");
        }

        await browser.press("Escape");
        await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
        await sleep(550);
      });
    }
  });

  test("UX 4: na registreren zijn zoekveld en bedrijfsfilter leeg en staat de lijst bovenaan in beeld", { timeout: TEST_TIMEOUT }, async () => {
    await withViewport(390, 844, async () => {
      // Een bedrijf kiezen in het filter en een zoekterm typen.
      await browser.click("#employeeCompanyFilter");
      await browser.waitFor(`!document.querySelector("#companyFilterOptions").classList.contains("hidden")`);
      const companyId = await browser.evaluate(`document.querySelector('#companyFilterOptions [data-company-value]:not([data-company-value="all"])').dataset.companyValue`);
      await browser.click(`#companyFilterOptions [data-company-value="${companyId}"]`);
      await browser.click("#employeeSearch");
      await browser.insertText("de");
      await browser.waitFor(`document.querySelectorAll("[data-open-employee]").length === 2`);
      const name = await browser.evaluate(`[...document.querySelectorAll("[data-open-employee] .employee-name")].at(-1).textContent`);

      // De laatste medewerker in de lijst kiest een product. De pagina erachter staat naar beneden gescrold.
      await browser.click(row(name));
      await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
      await browser.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      assert.ok(await browser.evaluate(`document.querySelector(".directory-card").getBoundingClientRect().top < 0`), "de pagina is niet naar beneden gescrold");
      await browser.click(`[data-product-increment="blikje"]`);
      await browser.click("#registerSelectedProductsButton");
      await waitForToast(`${name}: 1× Blikje geregistreerd`);

      assert.equal(await browser.evaluate(`document.querySelector("#employeeSearch").value`), "");
      assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").value`), "");
      assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").dataset.value`), "all");
      assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").getAttribute("aria-expanded")`), "false");
      assert.equal(await browser.evaluate(`document.querySelector('#companyFilterOptions [data-company-value="all"]').getAttribute("aria-selected")`), "true");
      assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 8);
      // De medewerkerskaart staat bovenaan in beeld en de focus staat op de rij van deze medewerker.
      assert.ok(await browser.evaluate(`document.querySelector(".directory-card").getBoundingClientRect().top >= 0`));
      assert.equal(await browser.evaluate(`document.activeElement.getAttribute("aria-label")`), `Product kiezen voor ${name}`);
    });
  });

  test("W11: zonder producten op het consumptiepunt staan er geen knopbalk, geen lege strook en geen dubbele lijn", { timeout: TEST_TIMEOUT }, async () => {
    // Het consumptiepunt Hoofdkantoor biedt niets meer aan (rechtstreeks in localStorage, daarna herladen).
    await registerProduct("Daan Smit", "blikje", 1);
    await browser.evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("tvb-blikjesregistratie"));
      for (const point of data.points) for (const entry of Object.values(point.products)) entry.offered = false;
      localStorage.setItem("tvb-blikjesregistratie", JSON.stringify(data));
      window.oudePagina = true;
    })()`);
    await browser.send("Page.reload");
    await browser.waitFor(`!window.oudePagina && document.readyState === "complete" && document.querySelectorAll("[data-open-employee]").length > 0`);

    await browser.click(row("Lotte van Dijk"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    assert.match(await text("#employeeProductList"), /Geen producten op jouw consumptiepunt\./);

    const layout = await browser.evaluate(`(() => {
      const shown = (selector) => getComputedStyle(document.querySelector(selector)).display !== "none";
      const actions = document.querySelector("#employeeProductsActions");
      const style = getComputedStyle(actions);
      // Alle zichtbare scheidingslijnen (border-top) in het venster.
      const lines = [...document.querySelectorAll("#employeeProductsModal .modal *")]
        .filter((element) => element.getClientRects().length > 0 && parseFloat(getComputedStyle(element).borderTopWidth) > 0
          && !element.closest(".personal-product-list"));
      return {
        button: shown("#registerSelectedProductsButton"), hint: shown("#registerHint"),
        help: shown("#employeeProductsHelp"), note: shown("#employeePrivacyNote"),
        actionsHeight: actions.getBoundingClientRect().height, actionsBorder: style.borderTopWidth, actionsPosition: style.position,
        lines: lines.map((element) => element.id || element.className)
      };
    })()`);
    assert.equal(layout.button, false, "de knop Registreren staat er nog");
    assert.equal(layout.hint, false, "de uitleg 'Kies eerst een product met +' staat er nog");
    assert.equal(layout.help, false, "de uitleg 'Tik op + ...' staat er nog");
    assert.equal(layout.note, false, "de regel over de inhouding op het loon staat er nog");
    assert.equal(layout.actionsHeight, 0, "de knopbalk laat een lege strook achter");
    assert.equal(layout.actionsBorder, "0px");
    assert.equal(layout.actionsPosition, "static");
    assert.deepEqual(layout.lines, [], `er staan nog scheidingslijnen in het venster: ${layout.lines.join(", ")}`);
    // De focus staat op het kruisje (er is geen "+").
    assert.equal(await browser.evaluate(`document.activeElement.classList.contains("modal-close")`), true);
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await sleep(550);

    // Bij een medewerker met producten verandert niets: knop, uitleg, knopbalk en de regel over het loon staan er.
    await browser.evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("tvb-blikjesregistratie"));
      for (const point of data.points) for (const entry of Object.values(point.products)) entry.offered = true;
      localStorage.setItem("tvb-blikjesregistratie", JSON.stringify(data));
      window.oudePagina = true;
    })()`);
    await browser.send("Page.reload");
    await browser.waitFor(`!window.oudePagina && document.readyState === "complete" && document.querySelectorAll("[data-open-employee]").length > 0`);
    await browser.click(row("Lotte van Dijk"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    for (const selector of ["#registerSelectedProductsButton", "#registerHint", "#employeeProductsHelp", "#employeePrivacyNote"]) {
      assert.equal(await isHidden(selector), false, `${selector} is verborgen`);
    }
    assert.equal(await browser.evaluate(`document.querySelector("#employeeProductsActions").classList.contains("is-empty")`), false);
    assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector("#employeeProductsActions")).position`), "sticky");
  });

  test("W14: het productvenster opent altijd bovenaan met het kruisje en de titel in beeld (naam en pas)", { timeout: TEST_TIMEOUT }, async () => {
    // Na herkenning met de camera, met de pas en na een tik op de naam opent hetzelfde productvenster
    // (EmployeeController.openEmployeeProducts). Eerder onthield de browser de scrollpositie van het
    // verborgen venster: stond de focus de vorige keer op Registreren onderaan, dan opende het venster
    // de volgende keer omlaag gescrold. Hier wordt dat nagebootst door het venster omlaag te scrollen
    // en te sluiten, en het daarna opnieuw te openen.
    await linkBadgeDirectly("Lotte van Dijk", "04A1B2C3");
    const scroller = `document.querySelector("#employeeProductsModal .modal")`;
    const header = () => browser.evaluate(`(() => {
      const top = (selector) => document.querySelector(selector).getBoundingClientRect().top;
      return { scrollTop: ${scroller}.scrollTop, close: top("#employeeProductsModal .modal-close"),
        kicker: top("#employeeProductsModal .section-kicker"), title: top("#employeeProductsTitle"),
        modal: top("#employeeProductsModal .modal"), focus: document.activeElement?.dataset?.productIncrement };
    })()`);
    const openedAndScrolledDown = async (open) => {
      await open();
      await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
      // Een klein stukje omlaag, zodat de eerste "+" in beeld blijft (zoals bij W14: na "Gezichtsherkenning
      // instellen" stond het venster 26 pixels omlaag). Een focus op die "+" scrolt het venster dan niet
      // vanzelf terug, en zonder het terugzetten van de scrollpositie opende het venster zo omlaag gescrold.
      await browser.evaluate(`${scroller}.scrollTop = 40`);
      assert.equal(await browser.evaluate(`${scroller}.scrollTop`), 40, "het venster scrolt niet");
      await browser.press("Escape");
      await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
      await sleep(550);
    };

    for (const [width, height] of [[390, 844], [1080, 810]]) {
      await withViewport(width, height, async () => {
        for (const [how, open] of [
          ["naam", () => browser.click(row("Lotte van Dijk"))],
          ["pas", () => browser.scanBadge("04A1B2C3")]
        ]) {
          await openedAndScrolledDown(open);
          await open();
          await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
          await sleep(300); // de openingsanimatie (0,22 s) laten uitlopen
          const box = await header();
          assert.equal(box.scrollTop, 0, `${width}×${height} (${how}): het venster opent omlaag gescrold`);
          assert.ok(box.close >= 0 && box.kicker >= box.modal && box.title >= 0, `${width}×${height} (${how}): kruisje of titel buiten beeld (${JSON.stringify(box)})`);
          assert.equal(box.focus, "blikje", `${width}×${height} (${how}): de focus staat niet op de eerste +`);
          await browser.press("Escape");
          await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
          await sleep(550);
        }
      });
    }
  });

  // ------------------------------------------------------------------
  // Slimme koelkast (demo, TO versie 3.14)
  // ------------------------------------------------------------------

  test("koelkast: pas koppelen, openen met de pas, 2 blikjes pakken, deur dicht en de registratie in de totalen en het beheer", { timeout: TEST_TIMEOUT }, async () => {
    // Pas koppelen bij Lotte in het medewerkersformulier (de lezer typt in het veld Pasnummer).
    await loginAsAdmin();
    await browser.click(`.tab[data-tab="employees"]`);
    await browser.waitFor(`!document.querySelector("#employeesTab").classList.contains("hidden")`);
    const lotteId = await browser.evaluate(`[...document.querySelectorAll("[data-edit-employee]")]
      .find((button) => button.closest(".admin-employee-item").textContent.includes("Lotte van Dijk")).dataset.editEmployee`);
    await browser.click(`[data-edit-employee="${lotteId}"]`);
    await browser.waitFor(`!document.querySelector("#employeeFormModal").classList.contains("hidden")`);
    await browser.click("#newEmployeePayrollCode");
    await browser.insertText("101");
    await browser.click("#newEmployeePersonnelNumber");
    await browser.insertText("5001");
    await browser.click("#newEmployeeBadgeId");
    await browser.scanBadge("04:a1:b2:c3");
    await browser.waitFor(`document.querySelector("#newEmployeeBadgeId").value === "04A1B2C3"`);
    await browser.click(`#employeeForm [data-save-mode="close"]`);
    await browser.waitFor(`document.querySelector("#employeeFormModal").classList.contains("hidden")`);
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#adminModal").classList.contains("hidden")`);

    // Het koelkastvenster: de deur is dicht en op slot.
    await browser.click("#fridgeOpenButton");
    await browser.waitFor(`!document.querySelector("#fridgeModal").classList.contains("hidden")`);
    assert.equal(await text("#fridgeTitle"), "Koelkast openen");
    assert.match(await text("#fridgeBody"), /Houd je pas tegen de lezer om de koelkast te openen/);
    assert.equal(await isHidden("#fridgeCloseDoorButton"), true);

    // De pas opent de koelkast (en niet het productvenster).
    await browser.scanBadge("04A1B2C3");
    await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is open"`);
    assert.equal(await isHidden("#employeeProductsModal"), true);
    assert.match(await text("#fridgeBody"), /Lotte\. Pak wat je wilt en sluit de deur\./);
    assert.match(await text(`.fridge-shelf`), /Schap 1 · Blikje\s*24 op het schap/);

    // Twee blikjes pakken: de tegels van schap 1 zijn één knop. Daarna de deur dicht.
    await browser.click(`[data-fridge-take="1"]`);
    await browser.click(`[data-fridge-take="1"]`);
    await browser.waitFor(`document.querySelector("#fridgeHandText").textContent === "2× Blikje"`);
    // Een tweede scan terwijl de deur open is, telt niet.
    await browser.scanBadge("04A1B2C3");
    await browser.waitFor(`document.querySelector("#fridgeStatus").textContent === "De koelkast is al open. Sluit eerst de deur."`);
    await browser.click("#fridgeCloseDoorButton");
    await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is dicht"`);
    assert.equal(await text("#fridgeSummaryHeading"), "Je hebt gepakt: 2× Blikje");
    assert.match(await text("#fridgeBody"), /Dit is geregistreerd op naam van Lotte van Dijk\. De koelkast is weer op slot\./);
    assert.equal(await browser.evaluate(`document.activeElement?.hasAttribute("data-fridge-done")`), true);

    // Klaar: het venster sluit en de totalen zijn bijgewerkt.
    await browser.press("Enter");
    await browser.waitFor(`document.querySelector("#fridgeModal").classList.contains("hidden")`);
    assert.equal(await text("#todayTotal"), "2");
    assert.equal(await text("#monthTotal"), "2");

    const stored = await browser.storedData();
    assert.deepEqual(stored.registrations.map(({ productId, source }) => [productId, source]), [["blikje", "fridge"], ["blikje", "fridge"]]);
    assert.equal(stored.points[0].products.blikje.stock, 22);
    assert.equal(stored.fridgeOpenings.length, 1);
    assert.equal(stored.fridgeOpenings[0].status, "registered");

    // In het beheer: de registraties met het label Koelkast, de opening en één logboekregel.
    await loginAsAdmin();
    const rows = await browser.evaluate(`[...document.querySelectorAll("#adminTableBody tr")].map((tr) => [...tr.cells].slice(0, 3).map((td) => td.textContent.trim().replace(/\\s+/g, " ")))`);
    assert.deepEqual(rows, [["Lotte van Dijk", "Blikje Koelkast", "+1"], ["Lotte van Dijk", "Blikje Koelkast", "+1"]]);
    await browser.click(`.tab[data-tab="fridge"]`);
    await browser.waitFor(`!document.querySelector("#fridgeTab").classList.contains("hidden")`);
    const opening = await browser.evaluate(`[...document.querySelector("#fridgeOpeningsBody tr").cells].slice(1).map((td) => td.textContent.trim())`);
    assert.deepEqual(opening, ["Lotte van Dijk", "2× Blikje", "Geregistreerd"]);
    await browser.click(`.tab[data-tab="audit"]`);
    assert.equal(await text("#auditTableBody tr td"), "Koelkast geopend");
    assert.match(await text("#auditTableBody tr td:nth-child(2)"), /^Lotte van Dijk: 2× Blikje geregistreerd \(TVB · Hoofdkantoor\)$/);
  });

  test("koelkast: een onbekende pas laat de koelkast dicht, Escape sluit het venster", { timeout: TEST_TIMEOUT }, async () => {
    await browser.click("#fridgeOpenButton");
    await browser.waitFor(`!document.querySelector("#fridgeModal").classList.contains("hidden")`);

    await browser.scanBadge("DEADBEEF");
    await browser.waitFor(`document.querySelector("#fridgeStatus").textContent === "Deze pas is niet gekoppeld aan een medewerker. De koelkast blijft dicht."`);
    assert.equal(await browser.evaluate(`document.querySelector("#fridgeStatus").getAttribute("role")`), "status");
    assert.equal(await text("#fridgeTitle"), "Koelkast openen");
    assert.equal(await isHidden("#employeeProductsModal"), true);
    assert.equal(await browser.evaluate(`Boolean(document.querySelector("[data-fridge-take]"))`), false);

    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#fridgeModal").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.activeElement?.id`), "fridgeOpenButton");
    assert.equal((await browser.storedData())?.fridgeOpenings?.length ?? 0, 0);
  });
});
