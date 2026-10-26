// Tests voor het persoonlijke welkom, de aanbeveling "zelfde als vorige keer" en de logica van
// de demo gezichtsherkenning (zonder camera: alleen het onthouden en vergelijken van gezichten).
import test from "node:test";
import assert from "node:assert/strict";

import { RegistrationView } from "../assets/js/RegistrationView.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { createModel, registration } from "./helpers.js";

// Nep-view die alles negeert (zie ook view-en-controller.test.js).
const createFakeView = () => new Proxy({ toasts: [], $: () => ({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, focus() {}, setAttribute() {} }) }, {
  get: (object, property) => (property in object ? object[property] : () => {})
});

// Demo met vaste instellingen, zodat de test niet van config.js afhangt.
const createDemo = (overrides = {}) => new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5, scanTimeoutMs: 1000, ...overrides });

// Een "gezicht" van 128 getallen, allemaal met dezelfde waarde.
const face = (value) => new Array(128).fill(value);

// Aanbeveling: wat koos de medewerker de vorige keer?

test("vorige keer: de laatste registratie plus alles binnen een minuut daarvoor", () => {
  const { model } = createModel();
  model.state.registrations = [
    registration("1", "employee-1", "ei", "2026-09-01T08:00:00"),
    registration("2", "employee-1", "blikje", "2026-09-02T12:00:00"),
    registration("3", "employee-1", "blikje", "2026-09-02T12:00:20"),
    registration("4", "employee-1", "boter", "2026-09-02T12:00:30")
  ];

  assert.deepEqual(model.lastSelection("employee-1"), { blikje: 2, boter: 1 });
});

test("vorige keer: zonder registraties is er geen aanbeveling", () => {
  const { model } = createModel();

  assert.deepEqual(model.lastSelection("employee-1"), {});
});

test("vorige keer: producten die het punt niet meer aanbiedt, vallen weg", () => {
  const { model, point } = createModel();
  model.state.registrations = [
    registration("1", "employee-1", "blikje", "2026-09-02T12:00:00"),
    registration("2", "employee-1", "ei", "2026-09-02T12:00:10")
  ];
  model.savePoint({ id: point.id, name: point.name, companyId: point.companyId, offeredProductIds: ["blikje"] });

  assert.deepEqual(model.lastSelection("employee-1"), { blikje: 1 });
});

test("'Zelfde als vorige keer' zet de keuze klaar, maar registreert nog niets", () => {
  const { model } = createModel();
  model.state.registrations = [registration("1", "employee-1", "blikje", "2026-09-02T12:00:00")];
  const app = new RegistrationApp(model, createFakeView(), undefined, createDemo());
  app.openEmployeeProducts("employee-1", { recognizedBy: "badge" });

  app.repeatLastSelection();

  assert.deepEqual(app.selectedProducts, { blikje: 1 });
  assert.equal(model.registrations.length, 1);
});

test("'Zelfde als vorige keer' doet niets als de medewerker op naam is gekozen", () => {
  const { model } = createModel();
  model.state.registrations = [registration("1", "employee-1", "blikje", "2026-09-02T12:00:00")];
  const app = new RegistrationApp(model, createFakeView(), undefined, createDemo());
  app.openEmployeeProducts("employee-1");

  app.repeatLastSelection();

  assert.deepEqual(app.selectedProducts, {});
});

// Privacy: "welkom terug" en de keuze van de vorige keer alleen na herkenning met pas of camera.
// Iedereen kan op de naam van een collega tikken; dan mag niet zichtbaar worden of die collega
// al eens iets registreerde en wat hij de vorige keer nam.

// Nep-pagina voor renderEmployeeProducts: per selector altijd hetzelfde nep-element.
const createWindowView = (model) => {
  const view = new RegistrationView(model);
  const elements = new Map();
  view.$ = (selector) => {
    if (!elements.has(selector)) {
      const classes = new Set();
      const attributes = {};
      elements.set(selector, {
        textContent: "",
        innerHTML: "",
        attributes,
        setAttribute: (name, value) => { attributes[name] = String(value); },
        removeAttribute: (name) => { delete attributes[name]; },
        getAttribute: (name) => attributes[name] ?? null,
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          toggle: (name, force) => ((force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name)),
          contains: (name) => classes.has(name)
        }
      });
    }
    return elements.get(selector);
  };
  return view;
};

test("op naam gekozen: geen 'welkom terug' en geen keuze van de vorige keer", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "ei");
  const view = createWindowView(model);

  view.renderEmployeeProducts("employee-1");

  assert.equal(view.$("#employeeWelcome").textContent.includes("welkom terug"), false);
  assert.ok(view.$("#employeeWelcome").textContent.endsWith("Test."));
  assert.equal(view.$("#employeeSuggestion").classList.contains("hidden"), true);
  assert.equal(view.$("#employeeSuggestion").innerHTML, "");
});

test("herkend met de pas: 'welkom terug' en de keuze van de vorige keer", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "ei");
  const view = createWindowView(model);

  view.renderEmployeeProducts("employee-1", {}, { recognizedByBadge: true });

  assert.ok(view.$("#employeeWelcome").textContent.endsWith("Test, welkom terug. Je bent herkend met je pas."));
  assert.equal(view.$("#employeeSuggestion").classList.contains("hidden"), false);
  assert.match(view.$("#employeeSuggestion").innerHTML, /Vorige keer koos je 1× Blikje en 1× Ei\./);
  assert.match(view.$("#employeeSuggestion").innerHTML, /data-repeat-last/);
});

test("herkend met de camera: 'welkom terug' en de keuze van de vorige keer", () => {
  const { model } = createModel();
  model.addRegistration("employee-1", "blikje");
  const view = createWindowView(model);

  view.renderEmployeeProducts("employee-1", {}, { recognized: true });

  assert.ok(view.$("#employeeWelcome").textContent.endsWith("Test, welkom terug. Je bent herkend met de camera."));
  assert.equal(view.$("#employeeSuggestion").classList.contains("hidden"), false);
});

test("de controller geeft door hoe de medewerker is herkend (op naam, pas of camera)", () => {
  const { model } = createModel();
  const calls = [];
  const view = new Proxy({ $: () => null, renderEmployeeProducts: (...args) => calls.push(args[2]) }, {
    get: (object, property) => (property in object ? object[property] : () => {})
  });
  const app = new RegistrationApp(model, view, undefined, createDemo());

  app.openEmployeeProducts("employee-1");
  app.openEmployeeProducts("employee-1", { recognizedBy: "badge" });
  app.openEmployeeProducts("employee-1", { recognized: true });

  assert.deepEqual(calls.map(({ recognized, recognizedByBadge }) => [recognized, recognizedByBadge]), [
    [false, false],
    [false, true],
    [true, false]
  ]);
});

// Welkom

test("begroeting past bij het tijdstip", () => {
  const view = new RegistrationView(null);

  assert.equal(view.greeting(new Date(2026, 9, 1, 8, 30)), "Goedemorgen");
  assert.equal(view.greeting(new Date(2026, 9, 1, 12, 0)), "Goedemiddag");
  assert.equal(view.greeting(new Date(2026, 9, 1, 18, 0)), "Goedenavond");
});

test("keuze wordt als leesbare zin beschreven", () => {
  const { model } = createModel();
  const view = new RegistrationView(model);

  assert.equal(view.describeSelection({ blikje: 2 }), "2× Blikje");
  assert.equal(view.describeSelection({ blikje: 2, ei: 1, boter: 3 }), "2× Blikje, 1× Ei en 3× Boter");
});

test("herkend met de camera wordt onthouden tot het productvenster sluit", () => {
  const { model } = createModel();
  const app = new RegistrationApp(model, createFakeView(), undefined, createDemo());

  app.openEmployeeProducts("employee-1", { recognized: true });
  assert.equal(app.recognizedByFace, true);

  app.closeEmployeeProducts();
  assert.equal(app.recognizedByFace, false);
});

// Demo gezichtsherkenning (alleen de logica; de camera zelf kan in Node niet worden getest)

test("demo is niet beschikbaar als die is uitgezet of als er geen camera-functie is", () => {
  assert.equal(createDemo({ enabled: false }).isAvailable(), false);
  // In Node bestaat navigator.mediaDevices niet, dus ook aan staat de demo hier niet beschikbaar.
  assert.equal(createDemo().isAvailable(), false);
});

test("afstand tussen twee gezichten: 0 bij gelijk, groter bij meer verschil", () => {
  const demo = createDemo();

  assert.equal(demo.distance(face(0.1), face(0.1)), 0);
  assert.ok(demo.distance(face(0.1), face(0.2)) > demo.distance(face(0.1), face(0.12)));
});

test("een ingesteld gezicht wordt herkend, een onbekend gezicht niet", () => {
  const demo = createDemo();
  demo.enroll("employee-1", face(0.10));
  demo.enroll("employee-2", face(0.40));

  // Afstand 128 x 0,01² -> wortel = 0,113: dichtbij medewerker 1.
  assert.equal(demo.findMatch(face(0.11)), "employee-1");
  assert.equal(demo.findMatch(face(0.39)), "employee-2");
  // Ver van iedereen af: niemand herkend.
  assert.equal(demo.findMatch(face(0.9)), null);
});

test("zonder ingestelde gezichten wordt niemand herkend", () => {
  const demo = createDemo();

  assert.equal(demo.hasEnrolledFaces(), false);
  assert.equal(demo.findMatch(face(0.1)), null);
});

test("bij meerdere mensen in beeld telt het grootste gezicht (het dichtst bij de camera)", () => {
  const demo = createDemo();

  const closest = demo.largestFace([
    { area: 900, descriptor: face(0.3) },
    { area: 4200, descriptor: face(0.1) },
    { area: 1600, descriptor: face(0.5) }
  ]);

  assert.deepEqual(closest.descriptor, face(0.1));
  assert.equal(demo.largestFace([]), null);
});

test("iemand telt pas als herkend na twee keer achter elkaar dezelfde persoon", () => {
  const demo = createDemo();
  demo.resetConfirmation();

  assert.equal(demo.confirm("employee-1"), null);
  assert.equal(demo.confirm("employee-2"), null);   // andere persoon: opnieuw tellen
  assert.equal(demo.confirm(null), null);           // geen herkenning: opnieuw tellen
  assert.equal(demo.confirm("employee-2"), null);
  assert.equal(demo.confirm("employee-2"), "employee-2");
});

test("uitzetten vergeet het gezicht", () => {
  const demo = createDemo();
  demo.enroll("employee-1", face(0.1));

  demo.forget("employee-1");

  assert.equal(demo.isEnrolled("employee-1"), false);
  assert.equal(demo.findMatch(face(0.1)), null);
});

test("demo is beschikbaar als die aan staat en er een camera-functie is", () => {
  const demo = new FaceRecognitionDemo({ enabled: true }, { getUserMedia: async () => ({}) });

  assert.equal(demo.isAvailable(), true);
});

test("een afstand precies op de drempel telt niet als herkend, net eronder wel", () => {
  const demo = new FaceRecognitionDemo({ enabled: true, matchThreshold: 0.5 }, null);
  demo.enroll("employee-1", [0]);

  assert.equal(demo.findMatch([0.5]), null);
  assert.equal(demo.findMatch([0.49]), "employee-1");
});

test("camera uitzetten zonder camera geeft geen fout; met camera gaat alles uit", () => {
  const demo = createDemo();
  const video = { srcObject: "beeld" };
  assert.doesNotThrow(() => demo.stopCamera(video));

  const track = { stopped: false, stop() { track.stopped = true; } };
  demo.stream = { getTracks: () => [track] };
  demo.stopCamera(video);

  assert.equal(track.stopped, true);
  assert.equal(demo.stream, null);
  assert.equal(video.srcObject, null);
});

test("confirm werkt ook zonder eerst resetConfirmation aan te roepen", () => {
  const demo = createDemo();

  assert.equal(demo.confirm("employee-1"), null);
  assert.equal(demo.confirm("employee-1"), "employee-1");
});

test("gaat er bij het lezen van een gezicht iets mis, dan telt dat als geen gezicht", async () => {
  const demo = createDemo();
  console.warn = () => {};
  demo.faceapi = {
    TinyFaceDetectorOptions: class {},
    detectAllFaces: () => { throw new Error("beeld weg"); }
  };

  assert.equal(await demo.readFace({}), null);
});
