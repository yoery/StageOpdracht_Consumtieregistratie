// Browsertests (end-to-end): de echte pagina in headless Edge of Chrome, met echte klikken en
// toetsaanslagen. Waar de unit tests de classes los testen met een nep-DOM, kijken deze tests of
// alles samen werkt in een browser: HTML, CSS, de ES-modules, localStorage en de CSP.
//
// Draaien: npm run test:e2e (of node --test "tests/e2e/*.test.js"). Zie tests/e2e/browser.js voor hoe de
// browser wordt gestart en hoe je met BROWSER_PATH een andere browser kiest.
//
// Iedere test begint met lege opslag (dus met de demogegevens) en eindigt met de controle dat
// er geen fouten in de console van de browser zijn verschenen. Sinds versie 3.21 opent de website op het
// startscherm: browser.openApp tikt daarna op "Handmatig zoeken", zodat een test op de lijst begint. Komt
// het startscherm terug (na registreren, na de koelkast, na een venster dat na de pas opende), dan tikt
// de test opnieuw op "Handmatig zoeken" (browser.manualSearch).
// De correctieknoppen (+ en −) in het beheer worden hier niet getest; die staan in de unit tests.
import { describe, test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { launch, sleep } from "./browser.js";

// Maximale duur van één test, in milliseconden (een vastgelopen test stopt dan vanzelf). Ruim
// genomen, omdat een server in GitHub Actions veel trager kan zijn dan een laptop.
const TEST_TIMEOUT = 60000;

// Selector voor de rij van een medewerker op de beginpagina.
const row = (name) => `[data-open-employee][aria-label="Product kiezen voor ${name}"]`;

describe("Browsertests (end-to-end)", { timeout: 480000 }, () => {
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
    assert.deepEqual(browser.errors, [], `Er staan fouten in de console van de browser.\nLaatste meldingen:\n  ${browser.consoleLog.join("\n  ")}`);
  });

  // Eén scenario (test). Mislukt het, dan komen achter de foutmelding de naam van het scenario, de
  // toestand van de pagina, de laatste meldingen uit de console en het pad van een schermafdruk
  // (zie browser.diagnose). Zo is een fout in GitHub Actions ook zonder de browser te lezen.
  const scenario = (name, action) => test(name, { timeout: TEST_TIMEOUT }, async () => {
    try {
      await action();
    } catch (error) {
      const details = await browser.diagnose(name);
      if (error instanceof Error) error.message += details;
      throw error;
    }
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
    // Sinds versie 3.21 komt na registreren het startscherm terug, zodat de volgende persoon daar begint.
    // De test tikt op "Handmatig zoeken" om verder te gaan op de lijst (browser.manualSearch wacht daarna
    // even, want een klik binnen 500 ms telt niet).
    await browser.waitFor(`!document.querySelector("#startScreen").classList.contains("hidden")`, { message: "Na registreren kwam het startscherm niet terug." });
    await browser.manualSearch();
  };

  // Dubbelklik met de muis in het midden van een element: twee keer indrukken en loslaten, de
  // tweede keer met clickCount 2 (zoals de browser een echte dubbelklik doorgeeft).
  // Het punt wordt net als bij browser.click pas gemeten als het element stilstaat en niet bedekt is.
  const doubleClick = async (selector) => {
    const point = await browser.clickablePoint(selector);
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

  scenario("de pagina laadt met de demogegevens en zonder fouten", async () => {
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

  scenario("een medewerker zoeken en het productvenster openen", async () => {
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

  scenario("een product registreren geeft een bevestiging en werkt de totalen bij", async () => {
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

  scenario("UX 12: zonder keuze is Registreren uitgeschakeld met uitleg, een tik benadrukt de uitleg en slaat niets op", async () => {
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

  scenario("Escape sluit een venster en de focus gaat terug naar waar die was", async () => {
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

  scenario("inloggen als beheerder en de registratie zien in het overzicht", async () => {
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

  scenario("het thema wisselen naar donker blijft bewaard na herladen", async () => {
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

  scenario("een pas koppelen en daarna herkennen met de pas (nagebootste lezer)", async () => {
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

    // Vanaf 3.17 opent de pas de koelkast voor Lotte (RECOGNITION_TARGET "fridge"). Er is geen camera,
    // dus er komt geen vraag over gezichtsherkenning. Met de knop in de koelkast opent het productvenster.
    await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is open"`);
    assert.equal(await isHidden("#faceOfferModal"), true);
    assert.match(await text("#fridgeBody"), /Lotte\. Je bent herkend met je pas\. Pak wat je wilt en sluit de deur\./);
    await browser.click("[data-fridge-to-products]");
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    assert.equal(await isHidden("#fridgeModal"), true);
    assert.equal(await text("#employeeProductsTitle"), "Product kiezen voor Lotte van Dijk");
    assert.match(await text("#employeeWelcome"), /Lotte, welkom terug\. Je bent herkend met je pas\./);
    // Na herkenning met de pas staat de keuze van de vorige keer klaar om over te nemen.
    assert.equal(await isHidden("#employeeSuggestion"), false);
    assert.match(await text("#employeeSuggestion"), /Vorige keer koos je 1× Blikje\./);
    // Het pasnummer blijft niet in het zoekveld staan en de lijst is weer compleet.
    assert.equal(await browser.evaluate(`document.querySelector("#employeeSearch").value`), "");
    assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 8);
  });

  scenario("de CSV-export downloadt een bestand voor de loonadministratie", async () => {
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

  scenario("U2: een dubbelklik op Registreren opent niet het productvenster van de medewerker eronder", async () => {
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

  scenario("U4 en U7c: een scan in het bedrijfsfilter laat geen pasnummer achter en Escape sluit de keuzelijst", async () => {
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

  scenario("U5: na opslaan van een wijzigformulier en na (de)activeren staat de focus weer op de knop", async () => {
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

  scenario("R1: letters in een cijferveld geven 'Gebruik alleen cijfers.' en er wordt niets opgeslagen", async () => {
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
  // Met `fridge: false` krijgen alle consumptiepunten een koelkast met lege schappen. Dan opent de pas
  // het productvenster (zoals vóór 3.17), want de koelkast kan niet open (RecognitionController).
  const linkBadgeDirectly = async (name, badgeId, { fridge = true } = {}) => {
    await registerProduct("Daan Smit", "blikje", 1);
    await browser.evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("tvb-blikjesregistratie"));
      if (!${fridge}) {
        data.fridgeShelves = data.points.flatMap((point, index) => [1, 2, 3].map((shelf) => ({ id: "e2e-" + index + "-" + shelf, pointId: point.id, shelf, productId: null, unitWeight: null })));
      }
      data.employees.find((employee) => employee.name === ${JSON.stringify(name)}).badgeId = ${JSON.stringify(badgeId)};
      localStorage.setItem("tvb-blikjesregistratie", JSON.stringify(data));
      window.oudePagina = true;
    })()`);
    await browser.send("Page.reload");
    await browser.waitFor(`!window.oudePagina && document.readyState === "complete" && document.querySelectorAll("[data-open-employee]").length > 0`);
    await browser.manualSearch();
  };

  scenario("UX 1: het productvenster sluit vanzelf na 75 seconden zonder invoer, met eerst een waarschuwing", async () => {
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
      await browser.waitFor(`document.querySelector("#productIdleWarning").textContent === "Venster sluit zo. Tik om door te gaan."`);
      assert.equal(await browser.evaluate(`document.querySelector("#productIdleWarning").getAttribute("role")`), "status");

      // Een tik in het venster begint de tijd opnieuw: de waarschuwing verdwijnt en het venster blijft open.
      await browser.click("#employeeProductsTitle");
      await browser.waitFor(`document.querySelector("#productIdleWarning").textContent === ""`);
      await sleep(1200);
      assert.equal(await isHidden("#employeeProductsModal"), false);

      // Daarna 76 seconden niets: het venster gaat dicht zonder op te slaan, het zoekveld is leeg.
      await browser.evaluate("window.klokVooruit = 66000 + 76000");
      await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
      assert.equal((await browser.storedData())?.registrations.length ?? 0, 0);
      assert.equal(await browser.evaluate(`document.querySelector("#employeeSearch").value`), "");
      assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 8);
      assert.equal(await text("#productIdleWarning"), "");
    } finally {
      await browser.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  });

  scenario("UX 2: een pas vervangt het open productvenster van een collega en geeft een melding bij een ander venster", async () => {
    // Zonder schapindeling opent de pas het productvenster (zie linkBadgeDirectly).
    await linkBadgeDirectly("Lotte van Dijk", "04A1B2C3", { fridge: false });

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
    // Het venster van Lotte opende na herkennen met de pas: na Escape komt het startscherm terug (3.21).
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    assert.equal(await browser.manualSearch(), true, "na sluiten kwam het startscherm niet terug");
    await browser.click("#adminOpenButton");
    await browser.waitFor(`!document.querySelector("#adminModal").classList.contains("hidden")`);
    await browser.click("#adminTitle");
    await browser.scanBadge("04A1B2C3");
    await waitForToast("Sluit eerst het open venster om je pas te gebruiken.");
    assert.equal(await isHidden("#employeeProductsModal"), true);
    assert.equal(await isHidden("#adminModal"), false);
  });

  scenario("UX 3: de knop Registreren blijft in beeld op een liggende tablet, een telefoon en bij 200% zoom", async () => {
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

  scenario("UX 4: na registreren zijn zoekveld en bedrijfsfilter leeg en staat de lijst bovenaan in beeld", async () => {
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
      // Sinds versie 3.21 komt na registreren het startscherm terug met de focus op "Handmatig zoeken".
      // Daarachter staat de medewerkerskaart bovenaan in beeld.
      await browser.waitFor(`!document.querySelector("#startScreen").classList.contains("hidden")`);
      assert.equal(await browser.evaluate("document.activeElement.id"), "startManualButton");
      await browser.manualSearch();
      assert.ok(await browser.evaluate(`document.querySelector(".directory-card").getBoundingClientRect().top >= 0`));
    });
  });

  scenario("W11: zonder producten op het consumptiepunt staan er geen knopbalk, geen lege strook en geen dubbele lijn", async () => {
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
    await browser.manualSearch();

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
    await browser.manualSearch();
    await browser.click(row("Lotte van Dijk"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    for (const selector of ["#registerSelectedProductsButton", "#registerHint", "#employeeProductsHelp", "#employeePrivacyNote"]) {
      assert.equal(await isHidden(selector), false, `${selector} is verborgen`);
    }
    assert.equal(await browser.evaluate(`document.querySelector("#employeeProductsActions").classList.contains("is-empty")`), false);
    assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector("#employeeProductsActions")).position`), "sticky");
  });

  scenario("W14: het productvenster opent altijd bovenaan met het kruisje en de titel in beeld (naam en pas)", async () => {
    // Na herkenning met de camera, met de pas en na een tik op de naam opent hetzelfde productvenster
    // (EmployeeController.openEmployeeProducts). Eerder onthield de browser de scrollpositie van het
    // verborgen venster: stond de focus de vorige keer op Registreren onderaan, dan opende het venster
    // de volgende keer omlaag gescrold. Hier wordt dat nagebootst door het venster omlaag te scrollen
    // en te sluiten, en het daarna opnieuw te openen. Zonder schapindeling opent de pas het
    // productvenster en niet de koelkast (zie linkBadgeDirectly).
    await linkBadgeDirectly("Lotte van Dijk", "04A1B2C3", { fridge: false });
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
      // Na de pas komt het startscherm terug (3.21), na een naam uit de lijst niet.
      await browser.manualSearch();
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
          await browser.settle(); // de openingsanimatie laten uitlopen
          const box = await header();
          assert.equal(box.scrollTop, 0, `${width}×${height} (${how}): het venster opent omlaag gescrold`);
          assert.ok(box.close >= 0 && box.kicker >= box.modal && box.title >= 0, `${width}×${height} (${how}): kruisje of titel buiten beeld (${JSON.stringify(box)})`);
          assert.equal(box.focus, "blikje", `${width}×${height} (${how}): de focus staat niet op de eerste +`);
          await browser.press("Escape");
          await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
          await sleep(550);
          await browser.manualSearch();
        }
      });
    }
  });

  // ------------------------------------------------------------------
  // Slimme koelkast (demo, TO versie 3.14)
  // ------------------------------------------------------------------

  scenario("koelkast: pas koppelen, openen met de pas, 2 blikjes pakken, deur dicht en de registratie in de totalen en het beheer", async () => {
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

    // Klaar: het venster sluit, het startscherm komt terug (3.21) en de totalen zijn bijgewerkt.
    await browser.press("Enter");
    await browser.waitFor(`document.querySelector("#fridgeModal").classList.contains("hidden")`);
    assert.equal(await browser.manualSearch(), true, "na Klaar kwam het startscherm niet terug");
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

  scenario("koelkast: een onbekende pas laat de koelkast dicht, Escape sluit het venster", async () => {
    await browser.click("#fridgeOpenButton");
    await browser.waitFor(`!document.querySelector("#fridgeModal").classList.contains("hidden")`);

    await browser.scanBadge("DEADBEEF");
    await browser.waitFor(`document.querySelector("#fridgeStatus").textContent === "Deze pas is niet gekoppeld aan een medewerker. De koelkast blijft dicht."`);
    assert.equal(await browser.evaluate(`document.querySelector("#fridgeStatus").getAttribute("role")`), "status");
    assert.equal(await text("#fridgeTitle"), "Koelkast openen");
    assert.equal(await isHidden("#employeeProductsModal"), true);
    assert.equal(await browser.evaluate(`Boolean(document.querySelector("[data-fridge-take]"))`), false);

    // Na het sluiten van het koelkastvenster komt het startscherm terug (3.21), met de focus op Handmatig zoeken.
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#fridgeModal").classList.contains("hidden")`);
    await browser.waitFor(`!document.querySelector("#startScreen").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.activeElement?.id`), "startManualButton");
    assert.equal((await browser.storedData())?.fridgeOpenings?.length ?? 0, 0);
  });

  // ------------------------------------------------------------------
  // Rollenspeltests en FMEA van oktober 2026 (versie 3.16)
  // ------------------------------------------------------------------

  // Koppelt passen rechtstreeks in localStorage en herlaadt de pagina (zonder registratie vooraf).
  const linkBadges = async (pairs) => {
    await browser.click(row("Daan Smit"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.click(`[data-product-increment="blikje"]`);
    await browser.click("#registerSelectedProductsButton");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("tvb-blikjesregistratie"));
      for (const [name, badgeId] of ${JSON.stringify(pairs)}) data.employees.find((employee) => employee.name === name).badgeId = badgeId;
      localStorage.setItem("tvb-blikjesregistratie", JSON.stringify(data));
      window.oudePagina = true;
    })()`);
    await browser.send("Page.reload");
    await browser.waitFor(`!window.oudePagina && document.readyState === "complete" && document.querySelectorAll("[data-open-employee]").length > 0`);
    await browser.manualSearch();
  };

  // Opent het koelkastvenster en opent de koelkast via de demokeuze voor deze medewerker.
  const openFridgeForDemo = async (name) => {
    await browser.click("#fridgeOpenButton");
    await browser.waitFor(`!document.querySelector("#fridgeModal").classList.contains("hidden")`);
    await browser.evaluate(`(() => {
      const select = document.querySelector("#fridgeDemoEmployee");
      select.value = [...select.options].find((option) => option.textContent === ${JSON.stringify(name)}).value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await browser.waitFor(`!document.querySelector("[data-fridge-demo-open]").disabled`);
    await browser.click("[data-fridge-demo-open]");
    await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is open"`);
  };

  scenario("Rollenspel 1: sluiten met het kruisje of Escape zonder registreren maakt zoekveld en bedrijfsfilter leeg", async () => {
    for (const close of ["kruisje", "Escape"]) {
      await browser.click("#employeeSearch");
      await browser.insertText("Lotte");
      await browser.waitFor(`document.querySelectorAll("[data-open-employee]").length === 1`);
      await browser.click(row("Lotte van Dijk"));
      await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
      await browser.click(`[data-product-increment="blikje"]`);

      if (close === "kruisje") await browser.click("[data-close-employee-products]");
      else await browser.press("Escape");
      await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

      assert.equal(await browser.evaluate(`document.querySelector("#employeeSearch").value`), "", close);
      assert.equal(await browser.evaluate(`document.querySelector("#employeeCompanyFilter").dataset.value`), "all", close);
      assert.equal(await browser.evaluate(`document.querySelectorAll("[data-open-employee]").length`), 8, close);
      assert.equal(await browser.evaluate(`document.activeElement.getAttribute("aria-label")`), "Product kiezen voor Lotte van Dijk", close);
      assert.equal((await browser.storedData())?.registrations.length ?? 0, 0, close);
      await sleep(550);
    }
  });

  scenario("Rollenspel 2: een dubbeltik op Deur dicht laat het overzicht staan", async () => {
    for (const gap of [90, 300]) {
      await openFridgeForDemo("Lotte van Dijk");
      await browser.click(`[data-fridge-take="1"]`);
      const point = await browser.clickablePoint("#fridgeCloseDoorButton");
      const tap = async () => {
        const mouse = { x: point.x, y: point.y, button: "left", clickCount: 1 };
        await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
        await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", ...mouse });
        await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...mouse });
      };
      await tap();
      await sleep(gap);
      await tap();
      await sleep(200);
      assert.equal(await isHidden("#fridgeModal"), false, `${gap} ms: het venster is nog open`);
      assert.equal(await text("#fridgeSummaryHeading"), "Je hebt gepakt: 1× Blikje");

      // Na een halve seconde sluit een tik op de achtergrond het venster wel.
      await sleep(600);
      const corner = { x: 4, y: 4, button: "left", clickCount: 1 };
      await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", ...corner });
      await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...corner });
      await browser.waitFor(`document.querySelector("#fridgeModal").classList.contains("hidden")`);
      await browser.manualSearch();
    }
    assert.equal((await browser.storedData()).registrations.length, 2);
  });

  scenario("Rollenspel 3: de open koelkast noemt de naam, de pas van een collega geeft Controle nodig", async () => {
    const { identifier } = await browser.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "(() => { const echt = Date.now.bind(Date); window.klokVooruit = 0; Date.now = () => echt() + window.klokVooruit; })()"
    });
    try {
      await browser.openApp();
      await linkBadges([["Lotte van Dijk", "04A1B2C3"], ["Mark Jansen", "0499AABB"]]);
      await browser.click("#fridgeOpenButton");
      await browser.waitFor(`!document.querySelector("#fridgeModal").classList.contains("hidden")`);
      await browser.scanBadge("04A1B2C3");
      await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is open"`);
      assert.equal(await text("#fridgeOwner"), "Alles wat je nu pakt, staat op naam van Lotte van Dijk.");
      await browser.click(`[data-fridge-take="1"]`);

      // Na een minuut noemt de waarschuwing op wiens naam de koelkast open is.
      await browser.evaluate("window.klokVooruit = 61000");
      await browser.waitFor(`document.querySelector("#fridgeDoorWarning").textContent === "De deur staat al lang open. Sluit de deur. Wat er nu wordt gepakt, staat op naam van Lotte van Dijk."`);

      // Mark houdt zijn pas ertegen terwijl de deur open is.
      await browser.scanBadge("0499AABB");
      await browser.waitFor(`document.querySelector("#fridgeStatus").textContent === "De koelkast is al open op naam van Lotte van Dijk. Sluit eerst de deur en open dan met je eigen pas. De beheerder kijkt naar deze opening."`);
      await browser.click(`[data-fridge-take="1"]`);
      await browser.click("#fridgeCloseDoorButton");
      await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is dicht"`);
      assert.match(await text("#fridgeBody"), /Dit is geregistreerd op naam van Lotte van Dijk\./);
      assert.match(await text("#fridgeBody"), /Er is een andere pas gescand terwijl de deur open stond\./);

      const stored = await browser.storedData();
      assert.equal(stored.fridgeOpenings[0].status, "check");
      assert.equal(stored.fridgeOpenings[0].otherBadge, true);
    } finally {
      await browser.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  });

  scenario("Rollenspel 4: een registratie die een ander tabblad net opsloeg, wordt niet overschreven", async () => {
    await registerProduct("Daan Smit", "blikje", 1);
    // Een ander tabblad slaat een registratie op. In hetzelfde tabblad komt geen storage-event, net als
    // wanneer dit tabblad opslaat voordat het event van het andere tabblad binnen is.
    await browser.evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("tvb-blikjesregistratie"));
      data.registrations.push({ ...data.registrations[0], id: "andere-tab-1", productId: "ei", price: 0.5 });
      localStorage.setItem("tvb-blikjesregistratie", JSON.stringify(data));
    })()`);

    await registerProduct("Lotte van Dijk", "yoghurt", 1);
    await waitForToast("Lotte van Dijk: 1× Yoghurt geregistreerd");

    const stored = await browser.storedData();
    assert.deepEqual(stored.registrations.map(({ productId }) => productId), ["blikje", "ei", "yoghurt"]);
    assert.equal(await text("#todayTotal"), "3");
  });

  scenario("Rollenspel 8: de demokeuze in de koelkast begint leeg en Openen (demo) staat pas aan na een keuze", async () => {
    await browser.click("#fridgeOpenButton");
    await browser.waitFor(`!document.querySelector("#fridgeModal").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.querySelector("#fridgeDemoEmployee").value`), "");
    assert.equal(await browser.evaluate(`document.querySelector("#fridgeDemoEmployee").selectedOptions[0].textContent`), "Kies een medewerker");
    assert.equal(await browser.evaluate(`document.querySelector("[data-fridge-demo-open]").disabled`), true);
    assert.equal(await browser.evaluate(`document.activeElement?.hasAttribute("data-close-fridge")`), true);
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#fridgeModal").classList.contains("hidden")`);
    await browser.manualSearch();

    await openFridgeForDemo("Mark Jansen");
    assert.match(await text("#fridgeBody"), /Mark\. Pak wat je wilt en sluit de deur\./);
    assert.equal(await text("#fridgeOwner"), "Alles wat je nu pakt, staat op naam van Mark Jansen.");
  });

  // ------------------------------------------------------------------
  // Het startscherm (TO versie 3.21) en de vraag over gezichtsherkenning na een passcan (versie 3.17)
  // ------------------------------------------------------------------

  // Nep-klok voor de pagina (zoals bij UX 1): Date.now() loopt window.klokVooruit milliseconden voor.
  const FAKE_CLOCK = "(() => { const echt = Date.now.bind(Date); window.klokVooruit = 0; Date.now = () => echt() + window.klokVooruit; })()";
  // Nagebootste camera: de app ziet een camera (enumerateDevices), maar aanzetten lukt niet. De camera
  // zelf is headless niet te testen. Dit script komt na het standaardscript zonder camera (browser.js).
  // Het telt hoe vaak de app de camera probeert aan te zetten (window.cameraPogingen).
  const FAKE_CAMERA = `window.cameraPogingen = 0;
    if (navigator.mediaDevices) navigator.mediaDevices.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "e2e", label: "", groupId: "" }];
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.cameraPogingen += 1; throw new DOMException("Geen camera in de test", "NotAllowedError"); };`;
  // Opent de pagina met deze scripts. Met `startScreen: true` blijft het startscherm staan (zie browser.openApp).
  const withPageScripts = async (sources, action, { startScreen = false } = {}) => {
    const identifiers = [];
    for (const source of sources) identifiers.push((await browser.send("Page.addScriptToEvaluateOnNewDocument", { source })).identifier);
    try {
      await browser.openApp({ startScreen });
      await action();
    } finally {
      for (const identifier of identifiers) await browser.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  };
  const openModalIds = () => browser.evaluate(`[...document.querySelectorAll(".modal-backdrop:not(.hidden)")].map((modal) => modal.id)`);
  const startScreenShown = () => browser.evaluate(`!document.querySelector("#startScreen").classList.contains("hidden")`);

  scenario("startscherm: verschijnt bij het openen, zwart, zonder camera alleen pas en Handmatig zoeken, en Handmatig zoeken toont de lijst zonder klik-door", async () => {
    await browser.openApp({ startScreen: true });
    // Wacht tot de app weet dat er geen camera is (enumerateDevices geeft niets, zie browser.js).
    await browser.waitFor(`document.querySelector("#startStatus").textContent === "Houd je pas tegen de lezer"`);
    assert.equal(await browser.evaluate(`document.querySelector("#startScreen").dataset.mode`), "badge");
    assert.equal(await text("#startHint"), "");
    assert.equal(await isHidden("#startPrivacy"), true);
    assert.equal(await isHidden("#startTapButton"), true);
    assert.equal(await text("#startTitle"), "Consumptieregistratie");
    assert.equal(await text("#startManualButton"), "Handmatig zoeken");
    assert.equal(await text("#startHelp"), "Startscherm. Begin zo: houd je pas tegen de lezer of kies Handmatig zoeken om je naam in de lijst te zoeken.");
    assert.equal(await browser.evaluate(`document.querySelector("#startScreen").getAttribute("role")`), "dialog");
    assert.equal(await browser.evaluate(`document.querySelector("#startStatus").getAttribute("role")`), "status");
    // Zwart, ook in het lichte thema, over het hele scherm, en de pagina eronder is niet te bereiken.
    assert.equal(await browser.evaluate("document.documentElement.dataset.theme"), "light");
    assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector("#startScreen")).backgroundColor`), "rgb(5, 13, 15)");
    assert.deepEqual(await browser.evaluate(`(() => { const box = document.querySelector("#startScreen").getBoundingClientRect(); return [box.top, box.left, box.width, box.height]; })()`), [0, 0, 1280, 900]);
    assert.equal(await browser.evaluate(`document.querySelector(".app-shell").inert`), true);
    assert.equal(await browser.evaluate(`document.activeElement?.id`), "startManualButton");
    // De knop is groot genoeg voor een vinger.
    assert.ok(await browser.evaluate(`document.querySelector("#startManualButton").getBoundingClientRect().height >= 44`));
    assert.equal(await browser.evaluate(`document.querySelector("#startVideo").srcObject`), null);

    // Wat er onder de knop ligt: daar zou een klik-door op vallen.
    const under = await browser.evaluate(`(() => {
      const box = document.querySelector("#startManualButton").getBoundingClientRect();
      document.querySelector("#startScreen").style.visibility = "hidden";
      const element = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      document.querySelector("#startScreen").style.visibility = "";
      return element?.closest("button, [data-open-employee]")?.getAttribute("aria-label") ?? "geen knop";
    })()`);
    await browser.click("#startManualButton");
    await browser.waitFor(`document.querySelector("#startScreen").classList.contains("hidden")`);
    await sleep(700);
    assert.deepEqual(await openModalIds(), [], `de tik ging door naar ${under}`);
    assert.equal(await browser.evaluate(`document.querySelector(".app-shell").inert`), false);

    // Daarna werkt de lijst gewoon, ook het beheer (Admin login staat in de bovenbalk van de beginpagina).
    await browser.click(row("Lotte van Dijk"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await browser.click(`[data-product-increment="blikje"]`);
    await browser.click("#registerSelectedProductsButton");
    // Na registreren komt het startscherm terug, met de bevestiging erboven.
    await browser.waitFor(`!document.querySelector("#startScreen").classList.contains("hidden")`);
    await waitForToast("Lotte van Dijk: 1× Blikje geregistreerd");
    assert.equal(await browser.evaluate(`(() => {
      const toast = [...document.querySelectorAll("#toast, #toastAlert")].find((element) => !element.classList.contains("hidden"));
      const layer = (element) => Number(getComputedStyle(element).zIndex);
      return layer(toast) > layer(document.querySelector("#startScreen"));
    })()`), true, "de bevestiging ligt niet boven het startscherm");
    assert.equal(await browser.evaluate(`document.activeElement?.id`), "startManualButton");
    assert.equal(await browser.evaluate(`document.querySelector("#employeeSearch").value`), "");
  });

  scenario("startscherm: komt terug na 2 minuten zonder invoer, en Enter op Handmatig zoeken zet de focus in het zoekveld", async () => {
    await withPageScripts([FAKE_CLOCK], async () => {
      assert.equal(await startScreenShown(), false);
      await browser.evaluate("window.klokVooruit = 100000");
      await sleep(1500);
      assert.equal(await startScreenShown(), false, "vóór 2 minuten nog geen startscherm");
      await browser.evaluate("window.klokVooruit = 121000");
      await browser.waitFor(`!document.querySelector("#startScreen").classList.contains("hidden")`);
      assert.equal(await browser.evaluate(`document.activeElement?.id`), "startManualButton");
      assert.equal(await browser.evaluate(`document.querySelector(".app-shell").inert`), true);

      // Een gewone toets doet niets op het startscherm (alleen een passcan of de knop).
      await browser.press("a");
      await sleep(300);
      assert.equal(await startScreenShown(), true);

      // Met het toetsenbord: Enter op de knop opent de lijst en zet de focus in het zoekveld.
      await browser.press("Enter");
      await browser.waitFor(`document.querySelector("#startScreen").classList.contains("hidden")`);
      assert.equal(await browser.evaluate(`document.activeElement?.id`), "employeeSearch");
      assert.deepEqual(await openModalIds(), []);
    });
  });

  scenario("startscherm: een passcan op het startscherm opent meteen de koelkast, en na Klaar komt het startscherm terug", async () => {
    await linkBadgeDirectly("Lotte van Dijk", "04A1B2C3");
    await browser.evaluate("window.oudePagina = true");
    await browser.send("Page.reload");
    await browser.waitFor(`!window.oudePagina && document.readyState === "complete" && !document.querySelector("#startScreen").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.activeElement?.id`), "startManualButton");

    // De lezer typt het pasnummer met een Enter erachter: die Enter drukt niet op Handmatig zoeken.
    await browser.scanBadge("04A1B2C3");
    await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is open"`);
    assert.equal(await startScreenShown(), false);
    assert.match(await text("#fridgeBody"), /Lotte\. Je bent herkend met je pas\./);
    assert.deepEqual(await openModalIds(), ["fridgeModal"], "zonder camera geen vraag over gezichtsherkenning");

    await browser.click(`[data-fridge-take="1"]`);
    await browser.click("#fridgeCloseDoorButton");
    await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is dicht"`);
    await browser.press("Enter");
    await browser.waitFor(`document.querySelector("#fridgeModal").classList.contains("hidden")`);
    await browser.waitFor(`!document.querySelector("#startScreen").classList.contains("hidden")`);
    assert.equal(await browser.evaluate(`document.activeElement?.id`), "startManualButton");
    assert.equal((await browser.storedData()).registrations.filter(({ source }) => source === "fridge").length, 1);

    // Een onbekende pas op het startscherm: een melding, het startscherm blijft staan.
    await browser.scanBadge("DEADBEEF");
    await waitForToast("Deze pas is niet gekoppeld aan een medewerker.");
    assert.equal(await startScreenShown(), true);
    assert.deepEqual(await openModalIds(), []);
  });

  scenario("startscherm: met een ingesteld gezicht en een camera zonder toestemming blijven alleen pas en Handmatig zoeken over, zonder fouten", async () => {
    // Lotte heeft gezichtsherkenning ingesteld (128 getallen, rechtstreeks in de opslag).
    await linkBadgeDirectly("Lotte van Dijk", "04A1B2C3");
    await browser.evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("tvb-blikjesregistratie"));
      const lotte = data.employees.find((employee) => employee.name === "Lotte van Dijk");
      data.faceEnrollments = [{ id: "e2e-gezicht", employeeId: lotte.id, descriptor: new Array(128).fill(0.1), enrolledAt: new Date().toISOString() }];
      localStorage.setItem("tvb-blikjesregistratie", JSON.stringify(data));
    })()`);
    const { identifier } = await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE_CAMERA });
    try {
      await browser.evaluate("window.oudePagina = true");
      await browser.send("Page.reload");
      await browser.waitFor(`!window.oudePagina && document.readyState === "complete" && !document.querySelector("#startScreen").classList.contains("hidden")`);
      // De camera wordt één keer geprobeerd (alleen op het startscherm). Zonder toestemming toont het
      // startscherm daarna alleen de pas en Handmatig zoeken, zonder foutmelding in beeld of in de console.
      await browser.waitFor("window.cameraPogingen === 1", { message: "De camera werd niet geprobeerd." });
      await browser.waitFor(`document.querySelector("#startScreen").dataset.mode === "badge"`);
      assert.equal(await text("#startStatus"), "Houd je pas tegen de lezer");
      assert.equal(await browser.evaluate(`document.querySelector("#startScreen").classList.contains("has-camera")`), false);
      assert.equal(await visibleToastText(), "");
      await sleep(1500);
      assert.equal(await browser.evaluate("window.cameraPogingen"), 1, "de camera wordt niet steeds opnieuw geprobeerd");

      // Handmatig zoeken: de camera blijft uit.
      await browser.manualSearch();
      await sleep(500);
      assert.equal(await browser.evaluate("window.cameraPogingen"), 1);
    } finally {
      await browser.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  });

  scenario("vraag na een passcan: Nee wordt onthouden en daarna gaat de koelkast open", async () => {
    await withPageScripts([FAKE_CAMERA], async () => {
      await linkBadgeDirectly("Lotte van Dijk", "04A1B2C3");
      await browser.scanBadge("04A1B2C3");

      await browser.waitFor(`!document.querySelector("#faceOfferModal").classList.contains("hidden")`);
      assert.equal(await text("#faceOfferTitle"), "Gezichtsherkenning nog niet ingesteld. Wil je dit?");
      assert.match(await text("#faceOfferGreeting"), /Lotte\. Je bent herkend met je pas\.$/);
      assert.equal(await text("#faceOfferHelp"), "Het is vrijwillig, alleen kenmerken van je gezicht (geen foto) worden op deze tablet bewaard en na een jaar vanzelf gewist, en je pas blijft altijd werken.");
      assert.equal(await browser.evaluate(`document.activeElement?.id`), "faceOfferNoButton");
      assert.equal(await isHidden("#fridgeModal"), true, "de koelkast opent pas na het antwoord");

      await browser.click("#faceOfferNoButton");
      await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is open"`);
      assert.deepEqual(await openModalIds(), ["fridgeModal"]);
      const stored = await browser.storedData();
      const lotte = stored.employees.find(({ name }) => name === "Lotte van Dijk");
      assert.deepEqual(stored.faceOffers.map(({ employeeId, answer }) => [employeeId, answer]), [[lotte.id, "declined"]]);
      assert.deepEqual(stored.faceEnrollments, []);
      assert.equal(stored.auditLog.length, 0, "Nee komt niet in het logboek");

      // Deur dicht zonder iets te pakken, en opnieuw de pas: geen vraag meer.
      await browser.press("Escape");
      await browser.waitFor(`document.querySelector("#fridgeModal").classList.contains("hidden")`);
      await sleep(600);
      await browser.scanBadge("04A1B2C3");
      await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is open" && !document.querySelector("#fridgeModal").classList.contains("hidden")`);
      assert.deepEqual(await openModalIds(), ["fridgeModal"]);
    });
  });

  scenario("vraag na een passcan: Ja opent het instelvenster met het vinkje, Annuleren gaat door naar de koelkast", async () => {
    await withPageScripts([FAKE_CAMERA], async () => {
      await linkBadgeDirectly("Lotte van Dijk", "04A1B2C3");
      await browser.scanBadge("04A1B2C3");
      await browser.waitFor(`!document.querySelector("#faceOfferModal").classList.contains("hidden")`);

      await browser.click("#faceOfferYesButton");
      await browser.waitFor(`!document.querySelector("#faceModal").classList.contains("hidden")`);
      assert.equal(await isHidden("#faceOfferModal"), true);
      assert.equal(await text("#faceTitle"), "Gezichtsherkenning instellen voor Lotte van Dijk");
      assert.equal(await isHidden("#faceConsentLabel"), false);
      assert.equal(await browser.evaluate(`document.querySelector("#faceConsent").checked`), false);
      assert.equal(await browser.evaluate(`document.querySelector("#faceEnrollButton").disabled`), true);

      await browser.click("#faceModal .employee-form-actions [data-close-face-modal]");
      await browser.waitFor(`document.querySelector("#fridgeTitle").textContent === "De deur is open" && !document.querySelector("#fridgeModal").classList.contains("hidden")`);
      assert.deepEqual(await openModalIds(), ["fridgeModal"]);
      const stored = await browser.storedData();
      assert.deepEqual(stored?.faceEnrollments ?? [], []);
      assert.deepEqual(stored?.faceOffers ?? [], [], "Annuleren onthoudt niets");
    });
  });

  scenario("gezicht veilig instellen (3.22): na Handmatig zoeken en een naam geen link, in het beheer de knop (zonder camera uitgeschakeld)", async () => {
    // Met camera: na kiezen op naam geen link en geen Uitzetten, wel de uitleg.
    await withPageScripts([FAKE_CAMERA], async () => {
      await browser.click(row("Mark Jansen"));
      await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
      assert.equal(await browser.evaluate(`document.querySelector("#faceEnrollArea [data-face-enroll], #faceEnrollArea [data-face-forget]")`), null);
      assert.equal(await text("#faceEnrollArea"), "Gezichtsherkenning instellen? Houd je pas tegen de lezer of vraag het de beheerder.");
      await browser.press("Escape");
      await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);

      // In het beheer: de knop opent het instelvenster boven het beheer, met het vinkje uit.
      await loginAsAdmin();
      await browser.click(`.tab[data-tab="employees"]`);
      const lotte = `#adminEmployeeList [data-admin-face][aria-label="Gezichtsherkenning instellen voor Lotte van Dijk"]`;
      await browser.waitFor(`document.querySelector(${JSON.stringify(lotte)})`);
      assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(lotte)}).getAttribute("aria-disabled")`), null);
      await browser.click(lotte);
      await browser.waitFor(`!document.querySelector("#faceModal").classList.contains("hidden")`);
      assert.deepEqual(await openModalIds(), ["adminModal", "faceModal"]);
      assert.equal(await text("#faceTitle"), "Gezichtsherkenning instellen voor Lotte van Dijk");
      assert.equal(await text("#faceHelp"), "Laat Lotte van Dijk zelf in de camera kijken en het vinkje zetten. Klik daarna op Gezicht vastleggen.");
      assert.equal(await browser.evaluate(`document.querySelector("#faceConsent").checked`), false);
      await browser.click("#faceModal .employee-form-actions [data-close-face-modal]");
      await browser.waitFor(`document.querySelector("#faceModal").classList.contains("hidden")`);
      assert.deepEqual(await openModalIds(), ["adminModal"]);
      const stored = await browser.storedData();
      assert.deepEqual(stored?.faceEnrollments ?? [], []);
    });

    // Zonder camera (standaard in de browsertest): geen uitleg in het productvenster en in het beheer
    // een uitgeschakelde knop met de reden.
    await browser.openApp();
    await browser.click(row("Mark Jansen"));
    await browser.waitFor(`!document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    // De app weet na het laden dat er geen camera is (enumerateDevices geeft niets, zie browser.js).
    await browser.waitFor(`document.querySelector("#faceEnrollArea").classList.contains("hidden")`);
    await browser.press("Escape");
    await browser.waitFor(`document.querySelector("#employeeProductsModal").classList.contains("hidden")`);
    await loginAsAdmin();
    await browser.click(`.tab[data-tab="employees"]`);
    const disabled = `#adminEmployeeList [data-admin-face="${await browser.evaluate(`[...document.querySelectorAll("#adminEmployeeList [data-admin-face]")][0]?.dataset.adminFace`)}"]`;
    assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(disabled)}).getAttribute("aria-disabled")`), "true");
    assert.equal(await browser.evaluate(`document.getElementById(document.querySelector(${JSON.stringify(disabled)}).getAttribute("aria-describedby")).textContent`), "Geen camera gevonden. Instellen kan alleen met een camera.");
    await browser.click(disabled);
    await waitForToast("Geen camera gevonden op deze tablet. Instellen kan alleen met een camera.");
    assert.deepEqual(await openModalIds(), ["adminModal"]);
  });

  scenario("generale repetitie: een pas in het inlogvenster of een zoekveld van het beheer laat geen pasnummer achter, en 'Aantal' past op een tablet", async () => {
    // Pas in het e-mailveld van het inloggen: het e-mailadres blijft staan, er komt een melding.
    await browser.click("#adminOpenButton");
    await browser.waitFor(`document.activeElement?.id === "loginEmail"`);
    await browser.scanBadge("04A1B2C3");
    await waitForToast("Sluit eerst het open venster om je pas te gebruiken.");
    assert.equal(await browser.evaluate(`document.querySelector("#loginEmail").value`), "admin@tvb.nl");

    // Pas in het zoekveld van Medewerkers: het veld blijft leeg en de lijst blijft staan.
    await browser.click("#loginPassword");
    await browser.insertText("demo-wachtwoord");
    await browser.click("#loginForm button[type=submit]");
    await browser.waitFor(`!document.querySelector("#adminView").classList.contains("hidden")`);
    await browser.click(`.tab[data-tab="employees"]`);
    await browser.click("#employeeManagementSearch");
    await browser.scanBadge("04A1B2C3");
    await sleep(300);
    assert.equal(await browser.evaluate(`document.querySelector("#employeeManagementSearch").value`), "");
    assert.equal(await browser.evaluate(`document.querySelectorAll("#adminEmployeeList [data-edit-employee]").length`), 8);

    // Voorraad op een staande tablet: "Aantal" past in het leveringsveld (eerst stond er "Aanta").
    try {
      await browser.send("Emulation.setDeviceMetricsOverride", { width: 810, height: 1080, deviceScaleFactor: 1, mobile: false });
      await browser.click(`.tab[data-tab="stock"]`);
      await browser.waitFor(`!document.querySelector("#stockTab").classList.contains("hidden")`);
      const room = await browser.evaluate(`(() => {
        const field = document.querySelector("[data-delivery-amount]");
        const style = getComputedStyle(field);
        const context = document.createElement("canvas").getContext("2d");
        context.font = style.font;
        // Ruimte voor de tekst: binnenbreedte min de binnenruimte en de pijltjes van een getalveld (ongeveer 15 pixels).
        return { text: context.measureText(field.placeholder).width, room: field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 15 };
      })()`);
      assert.ok(room.text <= room.room, `"Aantal" is ${Math.round(room.text)} pixels breed, er is ${Math.round(room.room)} pixels ruimte`);
    } finally {
      await browser.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    }
  });
});
