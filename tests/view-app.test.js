// Tests voor de onderdelen van RegistrationView en RegistrationApp die zonder browser werken.
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationView } from "../assets/js/RegistrationView.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { createModel } from "./helpers.js";

// Nep-view: onthoudt meldingen, en iedere render-methode doet niets.
// `$` geeft een nep-element terug, zodat classList-aanroepen werken.
const createFakeView = () => {
  const fakeElement = { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {}, value: "", focus() {}, setAttribute() {} };
  const target = { toasts: [], $: () => fakeElement };
  target.showToast = (message) => target.toasts.push(message);

  return new Proxy(target, {
    get: (object, property) => (property in object ? object[property] : () => {})
  });
};

const createApp = (storeOptions) => {
  const { model, point } = createModel(storeOptions);
  const view = createFakeView();
  return { app: new RegistrationApp(model, view), model, view, point };
};

// RegistrationView

test("escapeHtml maakt HTML-tekens onschadelijk", () => {
  const view = new RegistrationView(null);

  assert.equal(
    view.escapeHtml(`<img src=x onerror="alert('x')">&`),
    "&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt;&amp;"
  );
});

test("escapeHtml werkt ook met getallen, null en undefined", () => {
  const view = new RegistrationView(null);

  assert.equal(view.escapeHtml(42), "42");
  assert.equal(view.escapeHtml(null), "");
  assert.equal(view.escapeHtml(undefined), "");
});

test("initials geeft maximaal twee hoofdletters", () => {
  const view = new RegistrationView(null);

  assert.equal(view.initials("lotte van dijk"), "LV");
  assert.equal(view.initials("Mark"), "M");
});

// RegistrationApp

test("persist geeft true terug en bewaart de wijziging als opslaan lukt", () => {
  const { app, model } = createApp();

  assert.equal(app.persist(() => model.addRegistration("employee-1", "blikje")), true);
  assert.equal(model.registrations.length, 1);
});

test("persist draait de wijziging terug en toont een melding als opslaan mislukt", () => {
  const { app, model, view, point } = createApp({ failSave: true });

  assert.equal(app.persist(() => model.addRegistration("employee-1", "blikje")), false);
  assert.equal(model.registrations.length, 0);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 24);
  assert.deepEqual(view.toasts, ["Opslaan mislukt. Probeer het opnieuw."]);
});

test("gekozen producten worden in één keer als losse registraties opgeslagen", () => {
  const { app, model, view, point } = createApp();
  app.selectedEmployeeId = "employee-1";
  app.selectedProducts = { blikje: 2, boter: 1 };

  app.registerSelectedProducts();

  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["blikje", "blikje", "boter"]);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 22);
  assert.deepEqual(app.selectedProducts, {});
  assert.equal(app.selectedEmployeeId, null);
  assert.deepEqual(view.toasts, ["Test Medewerker: 2× Blikje, 1× Boter geregistreerd"]);
});

test("registreren zonder gekozen product slaat niets op", () => {
  const { app, model, view } = createApp();
  app.selectedEmployeeId = "employee-1";
  app.selectedProducts = { blikje: 0 };

  app.registerSelectedProducts();

  assert.equal(model.registrations.length, 0);
  assert.deepEqual(view.toasts, ["Kies eerst minimaal één product"]);
});

test("correctie van de beheerder komt in het logboek met product- en medewerkernaam", () => {
  const { app, model, view } = createApp();

  app.addCorrection("employee-1", "blikje");

  assert.equal(model.registrations.length, 1);
  assert.equal(model.auditLog.at(-1).details, "Blikje voor Test Medewerker");
  assert.deepEqual(view.toasts, ["Blikje toegevoegd voor medewerker"]);
});

test("export zonder registraties toont een melding", () => {
  const { app, view } = createApp();

  app.adminLoggedIn = true;
  app.exportCsv();

  assert.deepEqual(view.toasts, ["Geen registraties om te exporteren voor deze filters."]);
});

test("controller gebruikt de meegegeven export (compositie)", () => {
  const { model } = createModel();
  const calls = [];
  const fakeExport = { download: (employee, month) => { calls.push([employee, month]); return true; } };
  const view = createFakeView();

  const app = new RegistrationApp(model, view, fakeExport);
  app.adminLoggedIn = true;
  app.exportCsv();

  assert.equal(calls.length, 1);
  assert.deepEqual(view.toasts, []);
});

test("+ in het productvenster telt het gekozen aantal op", () => {
  const { app } = createApp();
  app.openEmployeeProducts("employee-1");

  app.incrementProduct("blikje");
  app.incrementProduct("blikje");

  assert.deepEqual(app.selectedProducts, { blikje: 2 });
});

test("− in het productvenster haalt er één af, maar niet onder 0", () => {
  const { app } = createApp();
  app.openEmployeeProducts("employee-1");

  app.incrementProduct("blikje");
  app.incrementProduct("blikje");
  app.decrementProduct("blikje");
  app.decrementProduct("ei");

  assert.deepEqual(app.selectedProducts, { blikje: 1 });

  app.decrementProduct("blikje");
  app.decrementProduct("blikje");

  assert.deepEqual(app.selectedProducts, { blikje: 0 });
});

test("producten die weer op 0 staan, worden niet geregistreerd en niet genoemd", () => {
  const { app, model, view } = createApp();
  app.selectedEmployeeId = "employee-1";
  app.selectedProducts = { blikje: 1, ei: 0 };

  app.registerSelectedProducts();

  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["blikje"]);
  assert.deepEqual(view.toasts, ["Test Medewerker: 1× Blikje geregistreerd"]);
});

test("employeeLabel valt terug op de id als de medewerker niet bestaat", () => {
  const { app } = createApp();

  assert.equal(app.employeeLabel("employee-1"), "Test Medewerker");
  assert.equal(app.employeeLabel("weg"), "medewerker weg");
});

test("pointLabel toont bedrijf en naam van het consumptiepunt", () => {
  const { app, point } = createApp();

  assert.equal(app.pointLabel(point.id), "TVB · Hoofdkantoor");
  assert.equal(app.pointLabel("weg"), "onbekend consumptiepunt");
});

test("lege toestand toont kop, uitleg en knop, met veilige tekst", () => {
  const view = new RegistrationView(null);

  const html = view.emptyState({ title: "Geen <b>data</b>", text: "Voeg iets toe.", action: "<button>Actie</button>" });

  assert.ok(html.includes("<svg"));
  assert.ok(html.includes("Geen &lt;b&gt;data&lt;/b&gt;"));
  assert.ok(html.includes("<p>Voeg iets toe.</p>"));
  assert.ok(html.includes("<button>Actie</button>"));
});

test("lege toestand in een tabel beslaat alle kolommen", () => {
  const view = new RegistrationView(null);

  assert.ok(view.emptyTableRow(4, { title: "Leeg" }).startsWith('<tr><td colspan="4"'));
});

test("maand in het filter toont ook de loonmaand", () => {
  const { model } = createModel();
  const view = new RegistrationView(model);

  assert.equal(view.monthLabel("2026-09"), "september 2026 (loonmaand oktober 2026)");
  assert.equal(view.monthLabel("2026-12"), "december 2026 (loonmaand januari 2027)");
});

test("lege keuze en lege naam geven een lege tekst", () => {
  const { model } = createModel();
  const view = new RegistrationView(model);

  assert.equal(view.describeSelection({}), "");
  assert.equal(view.initials(""), "");
});
