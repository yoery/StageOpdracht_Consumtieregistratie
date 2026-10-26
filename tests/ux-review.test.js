// Tests voor de verbeteringen uit de UX-review van oktober 2026 (versie 3.12 van het TO):
//   1. het productvenster sluit vanzelf na 75 seconden zonder invoer (FR-70), met een waarschuwing;
//   2. een pas vervangt het open productvenster van een collega (FR-71);
//   3. de knop Registreren blijft onderaan in beeld (sticky knopbalk);
//   4. na registreren en na automatisch sluiten zijn zoekveld en bedrijfsfilter weer leeg;
//   5. compacte banner bij weinig hoogte (liggende tablet);
//   6. de hint voor de pas boven het zoekveld;
//   7. een product met een keuze valt op;
//   8. tikdoelen van minstens 44 pixels;
//   9. schermlezer: alleen het aantal gevonden medewerkers en twee vaste meldingsregio's;
//  10. leesbaarheid van meldingen en kleine kopjes;
//  11. kortere teksten ("Tik op je naam", "Tik om te kiezen", "Leeg");
//  12. Registreren zonder keuze: aria-disabled met uitleg in plaats van een foutmelding.
//  13. een productvenster zonder producten toont geen knopbalk, geen lege strook en geen dubbele lijn (W11);
//  14. vensters openen altijd bovenaan, ook na herkenning met de camera of de pas (W14).
// De browsertests in tests/e2e/app.e2e.test.js controleren 1, 2, 3, 4, 12, 13 en 14 in een echte browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationView } from "../assets/js/RegistrationView.js";
import { STOCK_STATUS } from "../assets/js/RegistrationModel.js";
import { BadgeController } from "../assets/js/controllers/BadgeController.js";
import { EmployeeController } from "../assets/js/controllers/EmployeeController.js";
import { BadgeReader } from "../assets/js/BadgeReader.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { EMPLOYEE_IDLE_CLOSE_MS, EMPLOYEE_IDLE_WARNING_MS } from "../assets/js/config.js";
import { createModel, addEmployee, createRecordingView, createFakeElement, disabledFridge, readAllCss } from "./helpers.js";

const SECOND = 1000;
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const css = readAllCss();

// Nep-klok: de tijd staat stil tot de test hem verzet. setInterval onthoudt alleen de actie.
const createClock = () => {
  const clock = {
    time: 1_000_000,
    intervals: [],
    cleared: [],
    now: () => clock.time,
    setInterval(action, delay) {
      clock.intervals.push({ action, delay });
      return clock.intervals.length;
    },
    clearInterval(timer) {
      clock.cleared.push(timer);
    }
  };
  return clock;
};

// Controller met een nep-view, een nep-klok en een nep-document. `openModals` bepaalt welke vensters
// open staan (zie RegistrationApp.topModal). De view onthoudt de aanroepen van showIdleWarning.
// employee-1 (Test Medewerker) heeft pas 04A1B2C3, employee-2 (Tweede Medewerker) geen pas.
const createApp = ({ badgeEnabled = true } = {}) => {
  const { model, point } = createModel();
  model.state.employees[0].badgeId = "04A1B2C3";
  addEmployee(model, { companyId: point.companyId, pointId: point.id });
  const view = createRecordingView();
  view.$("#faceModal").classList.add("hidden"); // zoals in index.html: het cameravenster is dicht
  view.idleWarnings = [];
  view.showIdleWarning = (shown) => view.idleWarnings.push(shown);
  const clock = createClock();
  const reader = new BadgeReader({ enabled: badgeEnabled, minLength: 4, maxKeyIntervalMs: 40, endDelayMs: 120 }, {
    now: () => 0, setTimeout: () => 0, clearTimeout: () => {}
  });
  const demo = new FaceRecognitionDemo({ enabled: false }, null);
  // Zonder koelkast: deze tests gaan over het productvenster na een passcan (zie disabledFridge).
  const app = new RegistrationApp(model, view, undefined, demo, reader, clock, disabledFridge());
  const openModals = [];
  globalThis.document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? openModals : [])
  };
  // Het productvenster telt als open venster zolang er een medewerker is gekozen.
  const productModal = view.$("#employeeProductsModal");
  const open = (employeeId, options) => {
    app.openEmployeeProducts(employeeId, options);
    if (!openModals.includes(productModal)) openModals.push(productModal);
  };
  return { app, model, view, clock, openModals, open, productModal };
};

const toastTexts = (view) => view.toasts.map(({ message }) => message);

// Relatieve helderheid en contrast volgens WCAG 2.x.
const luminance = (hex) => {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}` : hex;
  const [r, g, b] = full.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
// De waarde van een kleurvariabele in het lichte (:root) of donkere thema.
const themeColor = (name, dark = false) => {
  const block = dark ? css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)[1] : css.match(/:root \{([^}]*)\}/)[1];
  return block.match(new RegExp(`--${name}:(#[0-9a-f]{3,6})`, "i"))[1];
};
// De declaraties van een CSS-regel (de eerste regel met precies deze selector).
const rule = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `regel ${selector} niet gevonden`);
  return css.slice(start, css.indexOf("}", start));
};

// ------------------------------------------------------------------
// 1. Productvenster sluit vanzelf (FR-70)
// ------------------------------------------------------------------

test("UX 1: de tijden in config.js zijn 75 seconden en 10 seconden waarschuwing", () => {
  assert.equal(EMPLOYEE_IDLE_CLOSE_MS, 75 * SECOND);
  assert.equal(EMPLOYEE_IDLE_WARNING_MS, 10 * SECOND);
  const { app } = createApp();
  assert.equal(app.idleCloseMs, 75 * SECOND);
  assert.equal(app.idleWarningMs, 10 * SECOND);
  assert.equal(RegistrationView.IDLE_WARNING_TEXT, "Venster sluit zo. Tik om door te gaan.");
});

test("UX 1: na 65 seconden verschijnt de waarschuwing één keer, na 75 seconden sluit het venster zonder opslaan", () => {
  const { app, model, view, clock, open } = createApp();
  open("employee-1");
  app.selectedProducts = { blikje: 2 };

  clock.time += 65 * SECOND - 1;
  assert.equal(app.closeProductWindowIfIdle(), false);
  assert.deepEqual(view.idleWarnings, []);

  clock.time += 1;
  assert.equal(app.closeProductWindowIfIdle(), false);
  clock.time += SECOND;
  app.closeProductWindowIfIdle();
  assert.deepEqual(view.idleWarnings, [true], "de waarschuwing wordt niet iedere seconde opnieuw gezet");

  clock.time += 9 * SECOND;
  assert.equal(app.closeProductWindowIfIdle(), true);
  assert.equal(app.selectedEmployeeId, null);
  assert.deepEqual(app.selectedProducts, {});
  assert.equal(model.registrations.length, 0);
  assert.equal(view.$("#employeeProductsModal").classList.contains("hidden"), true);
  assert.deepEqual(view.idleWarnings, [true, false]);
  assert.deepEqual(view.toasts, []);
});

test("UX 1: iedere invoer in het venster begint de tijd opnieuw en verbergt de waarschuwing", () => {
  const { app, view, clock, open } = createApp();
  open("employee-1");

  clock.time += 70 * SECOND;
  app.closeProductWindowIfIdle();
  assert.deepEqual(view.idleWarnings, [true]);

  app.noteProductActivity();
  assert.equal(app.lastProductActivity, clock.time);
  assert.deepEqual(view.idleWarnings, [true, false]);

  clock.time += 74 * SECOND;
  assert.equal(app.closeProductWindowIfIdle(), false);
  assert.equal(app.selectedEmployeeId, "employee-1");
});

test("UX 1: na automatisch sluiten zijn zoekveld en bedrijfsfilter leeg en krijgt de rij de focus zonder te scrollen", () => {
  const { app, view, clock, open } = createApp();
  view.$("#employeeSearch").value = "tes";
  view.$("#employeeCompanyFilter").value = "TVB";
  view.$("#employeeCompanyFilter").dataset.value = "company-tvb";
  const row = view.$('[data-open-employee="employee-1"]');
  let focusOptions = null;
  row.focus = (options) => { focusOptions = options; };
  open("employee-1");

  clock.time += 75 * SECOND;
  app.closeProductWindowIfIdle();

  assert.equal(view.$("#employeeSearch").value, "");
  assert.equal(view.$("#employeeCompanyFilter").value, "");
  assert.equal(view.$("#employeeCompanyFilter").dataset.value, "all");
  assert.equal(view.$("#employeeCompanyFilter").getAttribute("aria-expanded"), "false");
  assert.ok(view.calls.some(([name]) => name === "renderAll"));
  assert.ok(view.calls.some(([name]) => name === "scrollEmployeeListToTop"));
  assert.deepEqual(focusOptions, { preventScroll: true });
});

test("UX 1: ook een venster na herkenning met de pas sluit vanzelf", () => {
  const { app, clock, open } = createApp();
  open("employee-1", { recognizedBy: "badge" });

  clock.time += 75 * SECOND;
  assert.equal(app.closeProductWindowIfIdle(), true);
  assert.equal(app.recognizedBy, null);
});

test("UX 1: zonder open productvenster doet de controle niets, en met het cameravenster erboven loopt de tijd niet", () => {
  const { app, view, clock, open } = createApp();
  assert.equal(app.closeProductWindowIfIdle(), false);
  app.noteProductActivity();
  assert.equal(app.lastProductActivity, null);

  open("employee-1");
  view.$("#faceModal").classList.remove("hidden"); // gezicht instellen (demo) boven het productvenster
  clock.time += 80 * SECOND;
  assert.equal(app.closeProductWindowIfIdle(), false);
  assert.equal(app.lastProductActivity, clock.time);
  assert.equal(app.selectedEmployeeId, "employee-1");
});

test("UX 1: de timer controleert iedere seconde, start maar één keer en is te stoppen", () => {
  const { app, clock, open } = createApp();
  app.startProductIdleWatch();
  app.startProductIdleWatch();
  assert.equal(clock.intervals.length, 1);
  assert.equal(clock.intervals[0].delay, EmployeeController.PRODUCT_IDLE_CHECK_MS);
  assert.equal(EmployeeController.PRODUCT_IDLE_CHECK_MS, SECOND);

  open("employee-1");
  clock.time += 75 * SECOND;
  clock.intervals[0].action();
  assert.equal(app.selectedEmployeeId, null);

  app.stopProductIdleWatch();
  assert.deepEqual(clock.cleared, [1]);
  assert.equal(app.productIdleTimer, null);
});

test("UX 1: tik, toets, aanraking en scroll in het productvenster tellen als invoer (capture-fase)", () => {
  const { app, view, clock, open } = createApp();
  const added = [];
  view.$("#employeeProductsModal").addEventListener = (type, listener, options) => added.push({ type, listener, options });
  globalThis.document.addEventListener = () => {};
  app.registerPageEvents();

  const types = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"];
  const activity = added.filter(({ type }) => types.includes(type));
  assert.deepEqual(activity.map(({ type }) => type), types);
  assert.ok(activity.every(({ options }) => options?.capture === true && options?.passive === true));

  open("employee-1");
  for (const { listener } of activity) {
    clock.time += 30 * SECOND;
    listener({});
    assert.equal(app.lastProductActivity, clock.time);
  }
});

test("UX 1: de echte klok van EmployeeController gebruikt Date.now", () => {
  const clock = EmployeeController.realClock();
  assert.ok(clock.now() >= Date.now() - 5);
  assert.equal(typeof clock.setInterval, "function");
  assert.equal(typeof clock.clearInterval, "function");
});

test("UX 1: de waarschuwing is een vaste statusregel in de knopbalk van het productvenster", () => {
  assert.match(html, /<div class="employee-products-actions" id="employeeProductsActions">\s*<p class="idle-warning" id="productIdleWarning" role="status"><\/p>/);
  assert.match(css, /\.idle-warning:not\(:empty\) \{[^}]*background:var\(--warning-bg\)/);

  const view = new RegistrationView(null);
  const warning = createFakeElement();
  view.$ = (selector) => (selector === "#productIdleWarning" ? warning : null);
  view.showIdleWarning(true);
  assert.equal(warning.textContent, "Venster sluit zo. Tik om door te gaan.");
  view.showIdleWarning(false);
  assert.equal(warning.textContent, "");
});

// ------------------------------------------------------------------
// 2. Pas terwijl een venster open is (FR-71)
// ------------------------------------------------------------------

test("UX 2: een pas sluit het open productvenster van een collega zonder opslaan en opent het eigen venster", () => {
  const { app, model, view, open } = createApp();
  open("employee-2");
  app.selectedProducts = { ei: 1 };
  view.$("#employeeSearch").value = "twee";

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(app.recognizedBy, "badge");
  assert.deepEqual(app.selectedProducts, {});
  assert.equal(model.registrations.length, 0);
  assert.equal(view.$("#employeeSearch").value, "");
  assert.deepEqual(view.toasts, []);
});

test("UX 2: is het eigen venster al open, dan blijft het open met de keuze en is de medewerker herkend", () => {
  const { app, view, clock, open } = createApp();
  open("employee-1");
  app.selectedProducts = { blikje: 1 };
  clock.time += 50 * SECOND;

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.deepEqual(app.selectedProducts, { blikje: 1 });
  assert.equal(app.recognizedBy, "badge");
  assert.equal(app.lastProductActivity, clock.time, "de scan telt als invoer");
  assert.deepEqual(view.toasts, []);
  const render = view.calls.filter(([name]) => name === "renderEmployeeProducts").at(-1);
  assert.equal(render[3].recognizedByBadge, true);
});

test("UX 2: na herkenning met de camera blijft het eigen venster bij een scan op 'camera' staan", () => {
  const { app, open } = createApp();
  open("employee-1", { recognized: true });

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.recognizedBy, "face");
});

test("UX 2: staat een ander venster open, dan opent er niets en volgt de melding", () => {
  for (const modal of ["#adminModal", "#employeeFormModal", "#faceModal", "#removeRegistrationModal"]) {
    const { app, view, openModals } = createApp();
    openModals.push(view.$(modal));

    app.recognizeBadge("04A1B2C3");

    assert.equal(app.selectedEmployeeId, null, modal);
    assert.deepEqual(toastTexts(view), ["Sluit eerst het open venster om je pas te gebruiken."], modal);
    assert.equal(view.toasts[0].tone, "error");
  }
  assert.equal(BadgeController.CLOSE_WINDOW_FIRST.includes(";"), false);
});

test("UX 2: het cameravenster boven het productvenster telt als ander venster", () => {
  const { app, view, openModals, open } = createApp();
  open("employee-2");
  openModals.push(view.$("#faceModal"));

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.selectedEmployeeId, "employee-2");
  assert.deepEqual(toastTexts(view), [BadgeController.CLOSE_WINDOW_FIRST]);
});

test("UX 2: een onbekende pas laat het open productvenster staan", () => {
  const { app, view, open } = createApp();
  open("employee-2");

  app.recognizeBadge("FFFF0000");

  assert.equal(app.selectedEmployeeId, "employee-2");
  assert.match(toastTexts(view)[0], /^Deze pas is niet gekoppeld aan een medewerker\./);
});

test("UX 2: in het veld Pasnummer van het medewerkersformulier wordt de pas nog steeds ingevuld", () => {
  const { app, view, openModals } = createApp();
  openModals.push(view.$("#adminModal"), view.$("#employeeFormModal"));
  app.scanStart = { focusId: "newEmployeeBadgeId", search: "", filterText: "", filterValue: undefined };

  app.recognizeBadge("0499AABB");

  assert.equal(view.$("#newEmployeeBadgeId").value, "0499AABB");
  assert.deepEqual(view.toasts, []);
});

// ------------------------------------------------------------------
// 3. Knop Registreren altijd in beeld
// ------------------------------------------------------------------

test("UX 3: de knopbalk is sticky, de knop is volle breedte, 54 pixels hoog en 19 pixels vet", () => {
  // bottom is min de ondermarge van het venster, zodat de balk echt tegen de onderrand staat.
  assert.match(rule(".employee-products-actions"), /position:sticky;\s*bottom:calc\(-1 \* var\(--modal-pad-bottom\)\)/);
  assert.match(rule(".employee-products-actions"), /background:var\(--paper\)/);
  const button = rule(".employee-products-actions .register-button");
  assert.match(button, /width:100%/);
  assert.match(button, /min-height:54px/);
  assert.match(button, /font-size:19px/);
  assert.match(button, /font-weight:700/);
  // De demo-link staat op een eigen regel boven de knopbalk, niet meer naast de knop.
  assert.ok(html.indexOf('id="faceEnrollArea"') < html.indexOf('class="employee-products-actions"'));
});

test("UX 3: een melding staat niet in de weg van de knop Registreren", () => {
  // Een tik gaat door de melding heen, en bij het openen van het productvenster verdwijnt een oude melding.
  assert.match(rule(".toast"), /pointer-events:none/);
  const { view, open } = createApp();
  open("employee-1");
  assert.ok(view.calls.some(([name]) => name === "hideToast"));

  const realView = new RegistrationView(null);
  const status = createFakeElement({ textContent: "Lotte van Dijk: 1× Blikje geregistreerd" });
  const alert = createFakeElement();
  realView.$ = (selector) => ({ "#toast": status, "#toastAlert": alert }[selector]);
  realView.hideToast();
  assert.equal(status.classList.contains("hidden"), true);
  assert.equal(status.textContent, "");
  assert.equal(alert.classList.contains("hidden"), true);
});

test("UX 3: wit op --green is 3,56:1, genoeg voor grote tekst (19 pixels vet), in beide thema's", () => {
  for (const dark of [false, true]) {
    const ratio = contrast("#ffffff", themeColor("green", dark));
    assert.ok(ratio >= 3, `contrast ${ratio.toFixed(2)}`);
    assert.equal(ratio.toFixed(2), "3.56");
  }
  // 19 px vet is meer dan 14 punt (18,67 px): grote tekst volgens WCAG 1.4.3.
  assert.ok(19 * 0.75 >= 14);
});

// ------------------------------------------------------------------
// 4. Na registreren: zoekveld en filter leeg, lijst bovenaan
// ------------------------------------------------------------------

test("UX 4: na een geslaagde registratie zijn zoekveld en bedrijfsfilter leeg en staat de lijst bovenaan", () => {
  const { app, model, view, open } = createApp();
  view.$("#employeeSearch").value = "tes";
  view.$("#employeeCompanyFilter").value = "TVB";
  view.$("#employeeCompanyFilter").dataset.value = model.points[0].companyId;
  open("employee-1");
  app.incrementProduct("blikje");

  app.registerSelectedProducts();

  assert.equal(model.registrations.length, 1);
  assert.equal(view.$("#employeeSearch").value, "");
  assert.equal(view.$("#employeeCompanyFilter").value, "");
  assert.equal(view.$("#employeeCompanyFilter").dataset.value, "all");
  assert.equal(view.$("[data-toggle-company-filter]").getAttribute("aria-expanded"), "false");
  assert.ok(view.calls.some(([name]) => name === "scrollEmployeeListToTop"));
  assert.match(view.toasts.at(-1).message, /geregistreerd$/);
});

test("UX 4: de view scrolt de medewerkerskaart alleen in beeld als die boven het scherm is weggescrold", () => {
  const view = new RegistrationView(null);
  const calls = [];
  let top = -250;
  const card = { getBoundingClientRect: () => ({ top }), scrollIntoView: (options) => calls.push(options) };
  view.$ = (selector) => (selector === ".directory-card" ? card : null);

  view.scrollEmployeeListToTop();
  assert.deepEqual(calls, [{ block: "start" }]);

  top = 40;
  view.scrollEmployeeListToTop();
  assert.equal(calls.length, 1);
});

// ------------------------------------------------------------------
// 5. Compacte banner bij weinig hoogte
// ------------------------------------------------------------------

test("UX 5: de compacte banner geldt voor een staande tablet en voor schermen tot 900 pixels hoog", () => {
  assert.match(css, /@media \(min-width:721px\) and \(max-width:1100px\) and \(orientation:portrait\), \(min-width:721px\) and \(max-height:900px\) \{\s*\.hero \{\s*min-height:0;\s*padding:30px 40px/);
  // De knop "Herken mij" staat naast de pashint op één regel in plaats van op een eigen regel.
  assert.match(html, /<div class="directory-tools">\s*<p class="badge-hint hidden" id="badgeHint">[\s\S]*?id="faceRecognizeButton"/);
});

// ------------------------------------------------------------------
// 6. Pashint
// ------------------------------------------------------------------

test("UX 6: de pashint staat boven het zoekveld met een bestaand icoon", () => {
  const hint = html.match(/<p class="badge-hint hidden" id="badgeHint"><span aria-hidden="true" data-icon="(\w+)"><\/span> ([^<]+)<\/p>/);
  assert.ok(hint, "de pashint staat niet in index.html");
  assert.equal(hint[1], "userSearch");
  assert.equal(hint[2], "Houd je pas tegen de lezer, of zoek je naam");
  assert.ok(html.indexOf('id="badgeHint"') < html.indexOf('id="employeeSearch"'));
});

test("UX 6: de pashint is alleen zichtbaar als de pasjeslezer aan staat", () => {
  for (const enabled of [true, false]) {
    const { app, view } = createApp({ badgeEnabled: enabled });
    view.$("#badgeHint").classList.add("hidden");
    app.showRecognitionOptions();
    assert.equal(view.$("#badgeHint").classList.contains("hidden"), !enabled);
  }
});

// ------------------------------------------------------------------
// 7. Productrij met keuze
// ------------------------------------------------------------------

// Echte view met nep-elementen voor het productvenster.
const createWindowView = (model) => {
  const view = new RegistrationView(model);
  const elements = new Map();
  view.$ = (selector) => {
    if (!elements.has(selector)) {
      const element = createFakeElement({ innerHTML: "" });
      element.removeAttribute = (name) => { delete element.attributes[name]; };
      elements.set(selector, element);
    }
    return elements.get(selector);
  };
  return view;
};

test("UX 7: alleen producten met een aantal van 1 of meer krijgen de keuze-opmaak", () => {
  const { model } = createModel();
  const view = createWindowView(model);

  view.renderEmployeeProducts("employee-1", { blikje: 2, ei: 0 });

  const list = view.$("#employeeProductList").innerHTML;
  const items = [...list.matchAll(/<div class="personal-product-item( is-selected)?">[\s\S]*?data-product-decrement="([^"]+)"/g)];
  const selected = items.filter(([, mark]) => mark).map(([, , id]) => id);
  assert.deepEqual(selected, ["blikje"]);
});

test("UX 7: --mint achtergrond, --green rand en een vet aantal, en de − blijft zichtbaar", () => {
  assert.match(rule(".personal-product-item.is-selected"), /background:var\(--mint\);\s*border-color:var\(--green\)/);
  assert.match(rule(".personal-product-item.is-selected .personal-product-amount"), /font-weight:700/);
  assert.match(rule(".personal-product-item.is-selected .personal-product-minus"), /background:var\(--paper\)/);
  // Donker thema: het vette aantal (--green-dark) is goed leesbaar op --mint.
  assert.ok(contrast(themeColor("green-dark", true), themeColor("mint", true)) >= 4.5);
  assert.ok(contrast(themeColor("green-dark"), themeColor("mint")) >= 4.5);
});

// ------------------------------------------------------------------
// 8. Tikdoelen van minstens 44 pixels
// ------------------------------------------------------------------

test("UX 8: bedrijfsfilter, themaknoppen, adminknop en correctieknoppen zijn minstens 40 tot 44 pixels", () => {
  assert.match(rule(".company-combobox input"), /min-height:44px/);
  assert.match(rule(".company-combobox"), /min-height:44px/);
  assert.match(rule(".company-options button"), /min-height:44px/);
  assert.match(css, /\.company-combobox-toggle \{\s*top:50%;\s*height:40px/);
  assert.match(rule(".company-combobox-toggle"), /width:40px/);
  assert.match(rule(".theme-modes button"), /min-height:44px/);
  assert.match(rule(".avatar-button"), /min-height:44px/);
  assert.match(rule(".face-start"), /min-height:44px/);
  assert.match(rule(".correction-button"), /width:44px;\s*height:44px/);
  assert.match(rule(".correction-actions"), /gap:8px/);
});

test("UX 8: op een aanraakscherm zijn − en + in het productvenster 52 pixels", () => {
  assert.match(css, /@media \(pointer:coarse\) \{\s*\.personal-product-step \{\s*width:52px;\s*height:52px/);
});

// ------------------------------------------------------------------
// 9. Schermlezer
// ------------------------------------------------------------------

test("UX 9: de medewerkerslijst heeft geen aria-live meer, een vaste regio meldt alleen het aantal", () => {
  assert.match(html, /<div class="employee-list" id="employeeList"><\/div>/);
  assert.match(html, /<p class="visually-hidden" id="employeeResultsStatus" role="status"><\/p>/);

  const view = new RegistrationView(null);
  assert.equal(view.employeeResultsText(0), "Geen medewerker gevonden");
  assert.equal(view.employeeResultsText(1), "1 medewerker gevonden");
  assert.equal(view.employeeResultsText(3), "3 medewerkers gevonden");
});

test("UX 9: renderEmployees zet het aantal in de statusregel en verbergt 'Tik op je naam' zonder resultaat", () => {
  const { model, point } = createModel();
  addEmployee(model, { companyId: point.companyId, pointId: point.id });
  addEmployee(model, { id: "employee-3", name: "Derde Collega", companyId: point.companyId, pointId: point.id });
  const elements = {
    "#employeeSearch": createFakeElement(),
    "#employeeCompanyFilter": createFakeElement(),
    "#employeeCount": createFakeElement(),
    "#emptyState": createFakeElement(),
    "#employeeList": createFakeElement({ innerHTML: "" }),
    "#employeeListHint": createFakeElement(),
    "#employeeResultsStatus": createFakeElement()
  };
  const view = new RegistrationView(model);
  view.$ = (selector) => elements[selector];

  view.renderEmployees();
  assert.equal(elements["#employeeResultsStatus"].textContent, "3 medewerkers gevonden");
  assert.equal(elements["#employeeListHint"].classList.contains("hidden"), false);

  elements["#employeeSearch"].value = "derde";
  view.renderEmployees();
  assert.equal(elements["#employeeResultsStatus"].textContent, "1 medewerker gevonden");

  elements["#employeeSearch"].value = "niemand";
  view.renderEmployees();
  assert.equal(elements["#employeeResultsStatus"].textContent, "Geen medewerker gevonden");
  assert.equal(elements["#employeeListHint"].classList.contains("hidden"), true);
});

test("UX 9: twee vaste meldingsregio's, een met role=status en een met role=alert", () => {
  assert.match(html, /<div class="toast hidden" id="toast" role="status"><\/div>\s*<div class="toast hidden" id="toastAlert" role="alert"><\/div>/);
  assert.match(css, /\.toast:empty \{\s*opacity:0/);
});

// Nep-meldingsregio die innerHTML en querySelector("span") begrijpt.
const createToastRegion = () => {
  const region = createFakeElement();
  let span = null;
  Object.defineProperty(region, "innerHTML", {
    get: () => (span ? `<span>${span.textContent}</span>` : ""),
    set: (value) => { span = value.includes("<span>") ? { textContent: "" } : null; region.textContent = ""; }
  });
  region.querySelector = (selector) => (selector === "span" ? span : null);
  Object.defineProperty(region, "className", {
    get: () => "",
    set: (value) => {
      for (const name of ["hidden", "show", "toast-info", "toast-success", "toast-error"]) region.classList.remove(name);
      value.split(" ").forEach((name) => region.classList.add(name));
    }
  });
  region.text = () => span?.textContent ?? region.textContent;
  return region;
};

// Nep-timers voor setTimeout en clearTimeout: tick(ms) laat de tijd verstrijken. restore() zet de
// echte timers terug.
const fakeTimers = () => {
  const original = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  globalThis.setTimeout = (action, delay = 0) => {
    timers.set(nextId, { action, at: now + delay });
    return nextId++;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  return {
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].action();
      }
      now = end;
    },
    restore() {
      Object.assign(globalThis, original);
    }
  };
};

test("UX 9: een melding maakt de regio eerst zichtbaar en zet daarna de tekst, in de regio die bij de toon hoort", (t) => {
  const timers = fakeTimers();
  t.after(() => timers.restore());
  const view = new RegistrationView(null);
  const status = createToastRegion();
  const alert = createToastRegion();
  status.classList.add("hidden");
  alert.classList.add("hidden");
  view.$ = (selector) => ({ "#toast": status, "#toastAlert": alert }[selector]);

  view.showToast("Sluit eerst het open venster om je pas te gebruiken.", { tone: "error", duration: 5000 });
  // Stap 1: zichtbaar, maar nog leeg.
  assert.equal(alert.classList.contains("hidden"), false);
  assert.equal(alert.text(), "");
  // Stap 2: daarna de tekst.
  timers.tick(RegistrationView.TOAST_TEXT_DELAY_MS);
  assert.equal(alert.text(), "Sluit eerst het open venster om je pas te gebruiken.");
  assert.equal(alert.classList.contains("toast-error"), true);
  assert.equal(status.classList.contains("hidden"), true);

  // Een gewone melding komt in #toast en verbergt de foutmelding.
  view.showToast("Opgeslagen", { tone: "success" });
  assert.equal(alert.classList.contains("hidden"), true);
  timers.tick(RegistrationView.TOAST_TEXT_DELAY_MS);
  assert.equal(status.text(), "Opgeslagen");
  assert.equal(status.classList.contains("hidden"), false);
  timers.tick(2500);
  assert.equal(status.classList.contains("hidden"), true);
});

// ------------------------------------------------------------------
// 10. Leesbaarheid
// ------------------------------------------------------------------

test("UX 10: meldingen hebben 16 pixels tekst en kleine kopjes de donkergroene huiskleur", () => {
  assert.match(rule(".toast"), /font-size:16px/);
  assert.match(rule(".section-kicker"), /color:var\(--green-dark\)/);
  assert.ok(contrast(themeColor("green-dark"), themeColor("paper")) >= 4.5, "licht thema");
  assert.ok(contrast(themeColor("green-dark", true), themeColor("paper", true)) >= 4.5, "donker thema");
  assert.ok(contrast(themeColor("green"), "#ffffff") < 4.5, "--green alleen was te weinig voor kleine tekst");
});

// ------------------------------------------------------------------
// 11. Teksten
// ------------------------------------------------------------------

test("UX 11: 'Tik op je naam' staat één keer in de kop bij de teller en iedere rij zegt 'Tik om te kiezen'", () => {
  assert.equal(html.split(">Tik op je naam<").length - 1, 1);
  assert.match(html, /<div class="card-heading-meta">\s*<p class="list-hint" id="employeeListHint">Tik op je naam<\/p>\s*<span class="count-badge" id="employeeCount"><\/span>/);
  assert.ok(html.indexOf('id="employeeListHint"') < html.indexOf('id="employeeList"'));

  const { model } = createModel();
  const view = new RegistrationView(model);
  const list = createFakeElement({ innerHTML: "" });
  view.$ = (selector) => (selector === "#employeeList" ? list : createFakeElement());
  view.renderEmployees();
  assert.match(list.innerHTML, /<div class="employee-total">Tik om te kiezen<\/div>/);
});

test("UX 11: de uitleg in het productvenster en het voorraadlabel 'Leeg'", () => {
  assert.match(html, /<p class="muted" id="employeeProductsHelp">Tik op \+ bij wat je pakt\. Tik daarna op Registreren\.<\/p>/);
  assert.equal(STOCK_STATUS.out, "Leeg");
});

test("UX 11 en 12: de oude teksten staan nergens meer in de app", () => {
  const files = [
    "../index.html", "../assets/js/RegistrationView.js", "../assets/js/RegistrationModel.js",
    "../assets/js/controllers/EmployeeController.js"
  ].map(read).join("\n");
  for (const old of ["Klik om een product te kiezen", "Gebruik de plusknoppen", "Kies eerst minimaal één product", 'out: "Op"']) {
    assert.equal(files.includes(old), false, old);
  }
});

// ------------------------------------------------------------------
// 12. Registreren zonder keuze
// ------------------------------------------------------------------

test("UX 12: zonder keuze is de knop aria-disabled met uitleg, met keuze niet", () => {
  const { model } = createModel();
  const view = createWindowView(model);
  const button = view.$("#registerSelectedProductsButton");
  const hint = view.$("#registerHint");

  view.renderEmployeeProducts("employee-1", {});
  assert.equal(button.getAttribute("aria-disabled"), "true");
  assert.equal(button.getAttribute("aria-describedby"), "registerHint");
  assert.equal(button.disabled, false);
  assert.equal(hint.classList.contains("hidden"), false);

  view.renderEmployeeProducts("employee-1", { blikje: 1 });
  assert.equal(button.getAttribute("aria-disabled"), "false");
  assert.equal(button.getAttribute("aria-describedby"), null);
  assert.equal(hint.classList.contains("hidden"), true);
  assert.equal(button.textContent, "Registreren (1)");
});

test("UX 12: een tik zonder keuze benadrukt de uitleg en meldt die aan de schermlezer, zonder toast", () => {
  const { model } = createModel();
  const view = createWindowView(model);
  const hint = view.$("#registerHint");
  hint.textContent = "Kies eerst een product met +";

  view.emphasizeRegisterHint();

  assert.equal(hint.classList.contains("register-hint-emphasis"), true);
  assert.equal(view.$("#productLiveStatus").textContent, "Kies eerst een product met +");
  // Bij het opnieuw tekenen verdwijnt de nadruk weer.
  view.renderEmployeeProducts("employee-1", {});
  assert.equal(hint.classList.contains("register-hint-emphasis"), false);
});

test("UX 12: de controller registreert niets en geeft geen foutmelding zonder keuze", () => {
  const { app, model, view, open } = createApp();
  open("employee-1");

  app.registerSelectedProducts();

  assert.equal(model.registrations.length, 0);
  assert.deepEqual(view.toasts, []);
  assert.ok(view.calls.some(([name]) => name === "emphasizeRegisterHint"));
  assert.equal(app.selectedEmployeeId, "employee-1", "het venster blijft open");
});

test("UX 12: in index.html is de knop aria-disabled (niet disabled) en staat de uitleg ernaast", () => {
  const button = html.match(/<button class="primary-button register-button" id="registerSelectedProductsButton"[^>]*>/)[0];
  assert.match(button, /aria-disabled="true"/);
  assert.match(button, /aria-describedby="registerHint"/);
  assert.equal(/\sdisabled[\s>]/.test(button), false);
  assert.match(html, /<p class="register-hint" id="registerHint">Kies eerst een product met \+<\/p>/);
  assert.match(css, /\.primary-button\[aria-disabled="true"\] \{\s*opacity:\.45/);
});

// ------------------------------------------------------------------
// 13. Productvenster zonder producten (W11)
// ------------------------------------------------------------------

test("13: zonder producten vervallen de uitleg, de knopbalk (is-empty) en de regel over het loon", () => {
  const { model } = createModel();
  addEmployee(model); // employee-2 heeft geen consumptiepunt, dus geen producten
  const view = createWindowView(model);

  view.renderEmployeeProducts("employee-2", {});

  assert.match(view.$("#employeeProductList").innerHTML, /Geen producten op jouw consumptiepunt\./);
  assert.equal(view.$("#registerSelectedProductsButton").classList.contains("hidden"), true);
  assert.equal(view.$("#registerHint").classList.contains("hidden"), true);
  assert.equal(view.$("#employeeProductsHelp").classList.contains("hidden"), true);
  assert.equal(view.$("#employeeProductsActions").classList.contains("is-empty"), true);
  assert.equal(view.$("#employeePrivacyNote").classList.contains("hidden"), true);
});

test("13: met producten verandert er niets, ook niet na een venster zonder producten", () => {
  const { model } = createModel();
  addEmployee(model);
  const view = createWindowView(model);

  view.renderEmployeeProducts("employee-2", {});
  view.renderEmployeeProducts("employee-1", {});

  assert.equal(view.$("#registerSelectedProductsButton").classList.contains("hidden"), false);
  assert.equal(view.$("#registerHint").classList.contains("hidden"), false);
  assert.equal(view.$("#employeeProductsHelp").classList.contains("hidden"), false);
  assert.equal(view.$("#employeeProductsActions").classList.contains("is-empty"), false);
  assert.equal(view.$("#employeePrivacyNote").classList.contains("hidden"), false);
});

test("13: de lege knopbalk heeft geen lijn, geen ruimte en is niet sticky, de waarschuwing blijft mogelijk", () => {
  const empty = rule(".employee-products-actions.is-empty");
  assert.match(empty, /position:static/);
  assert.match(empty, /margin:0/);
  assert.match(empty, /padding:0/);
  assert.match(empty, /border-top:0/);
  assert.match(rule(".employee-products-actions.is-empty .idle-warning:not(:empty)"), /margin-top:16px/);
  // De waarschuwing vlak voor het automatisch sluiten staat nog steeds in de knopbalk.
  assert.match(html, /<div class="employee-products-actions" id="employeeProductsActions">\s*(<!--[\s\S]*?-->\s*)?<p class="idle-warning" id="productIdleWarning"/);
  assert.match(html, /<p class="muted" id="employeeProductsHelp">Tik op \+ bij wat je pakt\. Tik daarna op Registreren\.<\/p>/);
});

test("13: zonder producten krijgt het kruisje de focus, zonder dat het venster scrolt", () => {
  const { app, model, view } = createApp();
  model.state.employees[1].pointId = null;
  const close = view.$("#employeeProductsModal .modal-close");
  let options = null;
  close.focus = (focusOptions) => { options = focusOptions; };
  view.$ = ((original) => (selector) => (selector === "#employeeProductList [data-product-increment]" ? null : original(selector)))(view.$);

  app.openEmployeeProducts("employee-2");

  assert.deepEqual(options, { preventScroll: true });
});

// ------------------------------------------------------------------
// 14. Vensters openen bovenaan (W14)
// ------------------------------------------------------------------

// Geeft het venster (backdrop) een binnenste .modal met een scrollpositie, zoals in index.html.
const withScrolledModal = (view, selector, scrollTop = 26) => {
  const backdrop = view.$(selector);
  const inner = createFakeElement();
  inner.scrollTop = scrollTop;
  backdrop.scrollTop = scrollTop;
  backdrop.querySelector = (query) => (query === ".modal" ? inner : null);
  return { backdrop, inner };
};

test("14: het productvenster begint bovenaan en de focus op de eerste + scrolt niet (naam, pas en camera)", () => {
  for (const options of [{}, { recognizedBy: "badge" }, { recognized: true }]) {
    const { app, view } = createApp();
    const { backdrop, inner } = withScrolledModal(view, "#employeeProductsModal");
    const plus = view.$("#employeeProductList [data-product-increment]");
    let focusOptions = null;
    plus.focus = (given) => { focusOptions = given; };

    app.openEmployeeProducts("employee-1", options);

    assert.equal(inner.scrollTop, 0, `venster omlaag gescrold (${JSON.stringify(options)})`);
    assert.equal(backdrop.scrollTop, 0);
    assert.deepEqual(focusOptions, { preventScroll: true });
  }
});

test("14: na herkenning met de pas opent het venster ook bovenaan (BadgeController)", () => {
  const { app, view } = createApp();
  const { inner } = withScrolledModal(view, "#employeeProductsModal", 40);

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.selectedEmployeeId, "employee-1");
  assert.equal(inner.scrollTop, 0);
});

test("14: ieder venster dat met openModal opengaat, begint bovenaan", () => {
  const { app, view } = createApp();
  for (const selector of ["#adminModal", "#employeeFormModal", "#productFormModal", "#faceModal"]) {
    const { backdrop, inner } = withScrolledModal(view, selector, 120);
    app.openModal(selector);
    assert.equal(backdrop.classList.contains("hidden"), false);
    assert.equal(inner.scrollTop, 0, selector);
    assert.equal(backdrop.scrollTop, 0, selector);
  }
});

test("14: scrollModalToTop werkt ook zonder binnenste venster of zonder element", () => {
  const { app, view } = createApp();
  const backdrop = view.$("#removeRegistrationModal");
  backdrop.scrollTop = 10;
  app.scrollModalToTop("#removeRegistrationModal");
  assert.equal(backdrop.scrollTop, 0);

  view.$ = () => null;
  assert.doesNotThrow(() => app.scrollModalToTop("#bestaatNiet"));
});

test("14: het cameravenster zet de focus zonder te scrollen, zodat titel en camerabeeld in beeld blijven", () => {
  for (const mode of ["recognize", "enroll"]) {
    const { app, view } = createApp();
    const target = view.$(mode === "enroll" ? "#faceConsent" : "#faceModal .employee-form-actions [data-close-face-modal]");
    let focusOptions = null;
    target.focus = (given) => { focusOptions = given; };

    app.openFaceModal(mode, "employee-1").catch(() => {});

    assert.deepEqual(focusOptions, { preventScroll: true }, mode);
  }
});
