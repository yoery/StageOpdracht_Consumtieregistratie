// Tests voor de slimme koelkast (demo, TO bijlage B optie C): het omrekenen van gewicht naar
// aantallen (SmartFridge), het nagebootste slot (SimulatedLock) en de nagebootste weegschaal
// (SimulatedShelfScale), de regels in het model (indeling, opening, registraties en voorraad), de
// controle en migratie in DataStore, en de controller (pas, pakken, deur dicht, meldingen en tijden).
// De tijd wordt nagebootst met een nep-klok, zodat er niet echt gewacht hoeft te worden.
import test from "node:test";
import assert from "node:assert/strict";

import { SMART_FRIDGE } from "../assets/js/config.js";
import { SmartFridge } from "../assets/js/fridge/SmartFridge.js";
import { SimulatedLock } from "../assets/js/fridge/SimulatedLock.js";
import { SimulatedShelfScale } from "../assets/js/fridge/SimulatedShelfScale.js";
import { FridgeLock } from "../assets/js/fridge/FridgeLock.js";
import { ShelfScale } from "../assets/js/fridge/ShelfScale.js";
import { FridgeController } from "../assets/js/controllers/FridgeController.js";
import { RegistrationApp } from "../assets/js/RegistrationApp.js";
import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { FaceRecognitionDemo } from "../assets/js/FaceRecognitionDemo.js";
import { CsvExport } from "../assets/js/CsvExport.js";
import { DataStore } from "../assets/js/DataStore.js";
import { createModel, addEmployee, createRecordingView, createFakeElement, createDataStore, createStore, fakeLocalStorageWithKeys, asAdmin } from "./helpers.js";

// Instellingen zoals in config.js, maar zonder afwijking per product (de gewichten zijn dan precies).
const SETTINGS = { ...SMART_FRIDGE, weightVariation: 0 };

// Nep-klok met setTimeout (het slot) en setInterval (de controller). `advance(ms)` laat de tijd
// verstrijken en voert de timers uit die in die tijd aflopen.
const createClock = (start = Date.UTC(2026, 9, 19, 10, 0)) => {
  const timers = new Map();
  let nextId = 1;
  const clock = {
    time: start,
    now: () => clock.time,
    setTimeout: (action, delay) => {
      const id = nextId++;
      timers.set(id, { action, at: clock.time + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (action, delay) => {
      const id = nextId++;
      timers.set(id, { action, at: clock.time + delay, every: delay });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    advance: (ms) => {
      const end = clock.time + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        clock.time = timer.at;
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        timer.action();
      }
      clock.time = end;
    },
    timerCount: () => timers.size
  };
  return clock;
};

// Een koelkast met drie schappen en een nep-klok. Schap 1: 10 blikjes van 350 g, schap 2: 5
// yoghurt van 150 g, schap 3: leeg.
const createFridge = ({ clock = createClock(), settings = SETTINGS, random } = {}) => {
  const fridge = SmartFridge.createSimulated(settings, { clock, random });
  fridge.scale(1).fill(10, 350);
  fridge.scale(2).fill(5, 150);
  return { fridge, clock };
};

const LAYOUT = [
  { shelf: 1, productId: "blikje", unitWeight: 350 },
  { shelf: 2, productId: "yoghurt", unitWeight: 150 },
  { shelf: 3, productId: null, unitWeight: null }
];

// ------------------------------------------------------------------
// Omrekenen van gewicht naar aantallen
// ------------------------------------------------------------------

test("koelkast: een gewichtsverschil van precies 2 blikjes telt als 2", () => {
  assert.deepEqual(SmartFridge.countShelf(700, 350, SETTINGS), { count: 2, flag: null });
});

test("koelkast: een verschil binnen de tolerantie wordt afgerond op een heel aantal", () => {
  // 15 procent van 350 gram is 52,5 gram.
  assert.deepEqual(SmartFridge.countShelf(700 + 52, 350, SETTINGS), { count: 2, flag: null });
  assert.deepEqual(SmartFridge.countShelf(700 - 52, 350, SETTINGS), { count: 2, flag: null });
  assert.deepEqual(SmartFridge.countShelf(352, 350, SETTINGS), { count: 1, flag: null });
});

test("koelkast: een verschil buiten de tolerantie wordt niet geteld maar gemarkeerd", () => {
  assert.deepEqual(SmartFridge.countShelf(525, 350, SETTINGS), { count: 0, flag: "mismatch" });
  assert.deepEqual(SmartFridge.countShelf(-120, 350, SETTINGS), { count: 0, flag: "mismatch" });
});

test("koelkast: gepakt en teruggelegd (bijna geen verschil) telt als niets gepakt", () => {
  assert.deepEqual(SmartFridge.countShelf(0, 350, SETTINGS), { count: 0, flag: null });
  assert.deepEqual(SmartFridge.countShelf(-6, 350, SETTINGS), { count: 0, flag: null });
  assert.equal(Object.is(SmartFridge.countShelf(-6, 350, SETTINGS).count, 0), true, "geen -0");
});

test("koelkast: er een heel product bij leggen geeft de markering 'added'", () => {
  assert.deepEqual(SmartFridge.countShelf(-350, 350, SETTINGS), { count: 0, flag: "added" });
});

test("koelkast: een leeg schap telt nooit mee en valt alleen op bij een groot verschil", () => {
  assert.deepEqual(SmartFridge.countShelf(10, null, SETTINGS), { count: 0, flag: null });
  assert.deepEqual(SmartFridge.countShelf(-120, null, SETTINGS), { count: 0, flag: "unknown" });
});

test("koelkast: meerdere schappen, dezelfde producten op twee schappen worden opgeteld", () => {
  const layout = [
    { shelf: 1, productId: "blikje", unitWeight: 350 },
    { shelf: 2, productId: "blikje", unitWeight: 350 },
    { shelf: 3, productId: "ei", unitWeight: 60 }
  ];
  const shelves = SmartFridge.evaluate(layout, [3500, 3500, 600], [2800, 3150, 480], SETTINGS);

  assert.deepEqual(shelves.map(({ count }) => count), [2, 1, 2]);
  assert.deepEqual(SmartFridge.takenProducts(shelves), { blikje: 3, ei: 2 });
  assert.equal(SmartFridge.statusOf(shelves), "registered");
});

test("koelkast: een schap met een markering telt niet mee, de andere schappen wel (status check)", () => {
  const shelves = SmartFridge.evaluate(LAYOUT, [3500, 750, 0], [3620, 600, 0], SETTINGS);

  assert.deepEqual(SmartFridge.takenProducts(shelves), { yoghurt: 1 });
  assert.equal(shelves[0].flag, "mismatch");
  assert.equal(SmartFridge.statusOf(shelves), "check");
  assert.equal(SmartFridge.issueText(shelves[0], "Blikje"), "Schap 1 (Blikje): 120 g erbij, geen heel aantal");
});

test("koelkast: niets gepakt geeft de status nothing, te lang open altijd check", () => {
  const shelves = SmartFridge.evaluate(LAYOUT, [3500, 750, 0], [3500, 750, 0], SETTINGS);

  assert.equal(SmartFridge.statusOf(shelves), "nothing");
  assert.equal(SmartFridge.statusOf(shelves, true), "check");
});

// ------------------------------------------------------------------
// Hardware: interfaces, slot en weegschaal
// ------------------------------------------------------------------

test("koelkast: de interfaces FridgeLock en ShelfScale moeten in een eigen class worden gemaakt", () => {
  assert.throws(() => new FridgeLock().unlock(), /eigen class/);
  assert.throws(() => new FridgeLock().isLocked(), /eigen class/);
  assert.throws(() => new ShelfScale(1).read(), /eigen class/);
  assert.equal(new SimulatedLock() instanceof FridgeLock, true);
  assert.equal(new SimulatedShelfScale(1) instanceof ShelfScale, true);
});

test("slot: open en dicht, en vanzelf weer dicht als de deur niet op tijd opengaat", () => {
  const clock = createClock();
  const lock = new SimulatedLock({ autoLockMs: 10000, clock });
  let autoLocked = 0;
  lock.onAutoLock = () => { autoLocked += 1; };

  assert.equal(lock.isLocked(), true);
  lock.unlock();
  assert.equal(lock.isLocked(), false);
  clock.advance(9999);
  assert.equal(lock.isLocked(), false);
  clock.advance(1);
  assert.equal(lock.isLocked(), true);
  assert.equal(autoLocked, 1);
});

test("slot: na cancelAutoLock (deur open) blijft het slot open tot lock()", () => {
  const clock = createClock();
  const lock = new SimulatedLock({ autoLockMs: 10000, clock });
  lock.unlock();
  lock.cancelAutoLock();
  clock.advance(60000);
  assert.equal(lock.isLocked(), false);
  lock.lock();
  assert.equal(lock.isLocked(), true);
  assert.equal(clock.timerCount(), 0);
});

test("weegschaal: vullen, pakken, terugleggen en iets anders erop leggen", () => {
  const scale = new SimulatedShelfScale(1, { random: () => 1 }); // ieder product 2 procent zwaarder
  scale.fill(3, 350, 0.02);

  assert.equal(scale.itemCount(), 3);
  assert.equal(scale.read(), 3 * 357);
  const weight = scale.takeItem();
  assert.equal(weight, 357);
  assert.equal(scale.read(), 714);
  scale.returnItem(weight);
  scale.addWeight(120);
  assert.equal(scale.read(), 1191);
  scale.fill(0, 350);
  assert.equal(scale.takeItem(), null);
  scale.addWeight(-50);
  assert.equal(scale.read(), 0, "nooit minder dan 0");
});

// ------------------------------------------------------------------
// SmartFridge: een hele opening
// ------------------------------------------------------------------

test("koelkast: openen, 2 blikjes pakken en de deur sluiten geeft 2 blikjes en het slot dicht", () => {
  const { fridge, clock } = createFridge();

  assert.equal(fridge.start("employee-1", "punt-1", LAYOUT), true);
  assert.equal(fridge.lock.isLocked(), false);
  fridge.openDoor();
  fridge.scale(1).takeItem();
  fridge.scale(1).takeItem();
  clock.advance(15000);
  const result = fridge.finish();

  assert.equal(fridge.lock.isLocked(), true);
  assert.equal(fridge.isOpen(), false);
  assert.deepEqual(result.taken, { blikje: 2 });
  assert.equal(result.status, "registered");
  assert.equal(result.doorOpenMs, 15000);
  assert.deepEqual(result.shelves.map(({ before, after }) => [before, after]), [[3500, 2800], [750, 750], [0, 0]]);
});

test("koelkast: met producten die niet allemaal even zwaar zijn, telt de tolerantie", () => {
  // Afwisselend 2 procent lichter en 2 procent zwaarder.
  let toggle = 0;
  const random = () => (toggle++ % 2 === 0 ? 0 : 1);
  const { fridge } = createFridge({ settings: { ...SETTINGS, weightVariation: 0.02 }, random });
  fridge.scale(1).fill(10, 350, 0.02);

  fridge.start("employee-1", "punt-1", LAYOUT);
  fridge.openDoor();
  for (let count = 0; count < 3; count += 1) fridge.scale(1).takeItem();

  assert.deepEqual(fridge.finish().taken, { blikje: 3 });
});

test("koelkast: iets pakken en weer terugleggen in dezelfde opening registreert niets", () => {
  const { fridge } = createFridge();
  fridge.start("employee-1", "punt-1", LAYOUT);
  fridge.openDoor();
  const weight = fridge.scale(2).takeItem();
  fridge.scale(2).returnItem(weight);

  const result = fridge.finish();
  assert.deepEqual(result.taken, {});
  assert.equal(result.status, "nothing");
});

test("koelkast: er kan maar één opening tegelijk zijn", () => {
  const { fridge } = createFridge();
  assert.equal(fridge.start("employee-1", "punt-1", LAYOUT), true);
  assert.equal(fridge.start("employee-2", "punt-1", LAYOUT), false);
  assert.equal(fridge.opening.employeeId, "employee-1");
});

test("koelkast: gaat de deur niet op tijd open, dan sluit het slot en wordt de opening afgebroken", () => {
  const { fridge, clock } = createFridge();
  const notOpened = [];
  fridge.onNotOpened = (employeeId) => notOpened.push(employeeId);

  fridge.start("employee-1", "punt-1", LAYOUT);
  clock.advance(SETTINGS.autoLockMs);

  assert.equal(fridge.lock.isLocked(), true);
  assert.equal(fridge.isOpen(), false);
  assert.deepEqual(notOpened, ["employee-1"]);
  assert.equal(fridge.finish(), null);
});

test("koelkast: staat de deur langer open dan doorAlertMs, dan krijgt de opening de status check", () => {
  const { fridge, clock } = createFridge();
  fridge.start("employee-1", "punt-1", LAYOUT);
  fridge.openDoor();
  fridge.scale(1).takeItem();
  clock.advance(SETTINGS.doorAlertMs);

  const result = fridge.finish();
  assert.equal(result.longOpen, true);
  assert.equal(result.status, "check");
  assert.deepEqual(result.taken, { blikje: 1 }, "wat klopt, wordt toch geregistreerd");
});

test("koelkast: abort sluit het slot zonder resultaat", () => {
  const { fridge } = createFridge();
  fridge.start("employee-1", "punt-1", LAYOUT);
  fridge.openDoor();
  fridge.abort();
  assert.equal(fridge.lock.isLocked(), true);
  assert.equal(fridge.isOpen(), false);
});

// ------------------------------------------------------------------
// Model: indeling, opening, registraties en voorraad
// ------------------------------------------------------------------

test("model: zonder eigen indeling geldt de standaardindeling uit config.js", () => {
  const { model, point } = createModel();
  assert.deepEqual(model.fridgeLayout(point.id), [
    { shelf: 1, productId: "blikje", unitWeight: 350 },
    { shelf: 2, productId: "yoghurt", unitWeight: 150 },
    { shelf: 3, productId: "ei", unitWeight: 60 }
  ]);
  assert.deepEqual(model.fridgeLayout("bestaat-niet"), []);
});

test("model: een product dat het punt niet aanbiedt, is een leeg schap", () => {
  const { model, point } = createModel();
  model.savePoint({ id: point.id, name: point.name, companyId: point.companyId, offeredProductIds: ["blikje", "ei"] });

  assert.deepEqual(model.fridgeLayout(point.id).map(({ productId }) => productId), ["blikje", null, "ei"]);
});

test("model: de beheerder slaat een indeling op, ongeldige indelingen worden geweigerd", () => {
  const { model, point } = createModel();

  assert.equal(model.saveFridgeShelves(point.id, [
    { shelf: 1, productId: "ei", unitWeight: 62 },
    { shelf: 2, productId: null, unitWeight: null },
    { shelf: 3, productId: "blikje", unitWeight: 345 }
  ]), true);
  assert.deepEqual(model.fridgeLayout(point.id).map(({ productId, unitWeight }) => [productId, unitWeight]), [["ei", 62], [null, null], ["blikje", 345]]);

  const before = model.fridgeShelves;
  assert.equal(model.saveFridgeShelves(point.id, [{ shelf: 1, productId: "ei", unitWeight: 0 }]), false, "gewicht 0");
  assert.equal(model.saveFridgeShelves(point.id, [{ shelf: 1, productId: "ei", unitWeight: 5001 }]), false, "te zwaar");
  assert.equal(model.saveFridgeShelves(point.id, [{ shelf: 1, productId: "ei", unitWeight: 60.5 }]), false, "geen heel getal");
  assert.equal(model.saveFridgeShelves(point.id, [{ shelf: 4, productId: "ei", unitWeight: 60 }]), false, "schap bestaat niet");
  assert.equal(model.saveFridgeShelves(point.id, [{ shelf: 1, productId: "onbekend", unitWeight: 60 }]), false, "onbekend product");
  assert.equal(model.saveFridgeShelves("bestaat-niet", []), false, "onbekend punt");
  assert.equal(model.fridgeShelves, before, "er is niets veranderd");
});

test("model: een opening registreert ieder product als gewone registratie met source fridge", () => {
  const { model, point } = createModel();
  const { fridge } = createFridge();
  fridge.start("employee-1", point.id, model.fridgeLayout(point.id));
  fridge.openDoor();
  fridge.scale(1).takeItem();
  fridge.scale(1).takeItem();
  const result = fridge.finish();

  const opening = model.addFridgeOpening(result);

  assert.equal(model.registrations.length, 2);
  assert.deepEqual(model.registrations.map(({ productId, source, openingId }) => [productId, source, openingId]), [
    ["blikje", "fridge", opening.id],
    ["blikje", "fridge", opening.id]
  ]);
  assert.equal(model.registrations[0].createdAt, new Date(result.closedAt).toISOString());
  assert.equal(model.findPoint(point.id).products.blikje.stock, 22, "de voorraad gaat omlaag");
  assert.equal(model.fridgeOpenings.length, 1);
  assert.equal(opening.status, "registered");
  assert.deepEqual(model.fridgeOpeningTaken(opening), { blikje: 2 });
  // De registraties tellen gewoon mee in de totalen en de export.
  assert.equal(model.countForEmployee("employee-1"), 2);
  assert.equal(model.totalCostForEmployee("employee-1"), 1.3);
  const rows = new CsvExport(model).buildRows("all", "all");
  assert.deepEqual(rows.map(({ Naam, Totaal, Prijs }) => [Naam, Totaal, Prijs]), [["Test Medewerker", 2, 1.3]]);
});

test("model: een opening van een onbekende medewerker of met een onbekende status wordt geweigerd", () => {
  const { model, point } = createModel();
  const result = { employeeId: "employee-1", pointId: point.id, openedAt: 0, closedAt: 1000, status: "registered", shelves: [], taken: {} };

  assert.equal(model.addFridgeOpening({ ...result, employeeId: "niemand" }), false);
  assert.equal(model.addFridgeOpening({ ...result, status: "onbekend" }), false);
  assert.equal(model.fridgeOpenings.length, 0);
});

test("model: de laatste openingen staan nieuwste eerst en zijn begrensd", () => {
  const { model, point } = createModel();
  for (let index = 0; index < 12; index += 1) {
    model.addFridgeOpening({ employeeId: "employee-1", pointId: point.id, openedAt: index * 60000, closedAt: index * 60000 + 1000, status: "nothing", shelves: [], taken: {} });
  }
  const recent = model.recentFridgeOpenings();

  assert.equal(recent.length, SMART_FRIDGE.recentOpenings);
  assert.equal(Date.parse(recent[0].closedAt) > Date.parse(recent[1].closedAt), true);
});

test("model: snapshot en restore zetten ook de koelkast terug, wipeAll wist de openingen", () => {
  const { model, point } = createModel();
  const before = model.snapshot();
  model.saveFridgeShelves(point.id, [{ shelf: 1, productId: "ei", unitWeight: 60 }]);
  model.addFridgeOpening({ employeeId: "employee-1", pointId: point.id, openedAt: 0, closedAt: 1000, status: "nothing", shelves: [], taken: {} });
  model.restore(before);

  assert.deepEqual(model.fridgeShelves, []);
  assert.deepEqual(model.fridgeOpenings, []);

  model.addFridgeOpening({ employeeId: "employee-1", pointId: point.id, openedAt: 0, closedAt: 1000, status: "nothing", shelves: [], taken: {} });
  model.wipeAll();
  assert.deepEqual(model.fridgeOpenings, []);
  assert.deepEqual(model.fridgeShelves, []);
});

test("model: gegevens van vóór de koelkast (zonder de lijsten) werken gewoon", () => {
  const { model, point } = createModel();
  delete model.state.fridgeShelves;
  delete model.state.fridgeOpenings;

  assert.deepEqual(model.fridgeOpenings, []);
  assert.equal(model.fridgeLayout(point.id)[0].productId, "blikje");
  assert.deepEqual(model.snapshot().fridgeOpenings, []);
});

test("model: een consumptiepunt verwijderen neemt de indeling mee, de openingen blijven", () => {
  const { model, point } = createModel();
  const klik = model.companies.find(({ name }) => name === "Klik");
  model.savePoint({ name: "Kantine", companyId: klik.id, offeredProductIds: ["ei"] });
  const kantine = model.points.find(({ name }) => name === "Kantine");
  model.saveFridgeShelves(kantine.id, [{ shelf: 1, productId: "ei", unitWeight: 60 }]);
  model.saveFridgeShelves(point.id, [{ shelf: 1, productId: "blikje", unitWeight: 350 }]);

  assert.equal(model.removePoint(kantine.id), true);
  assert.deepEqual(model.fridgeShelves.map(({ pointId }) => pointId), [point.id]);
});

// ------------------------------------------------------------------
// DataStore: controle en migratie
// ------------------------------------------------------------------

const storedState = (extra = {}) => {
  const model = new RegistrationModel(createStore(null));
  return { ...model.state, ...extra };
};

const validOpening = (employeeId, pointId) => ({
  id: "opening-1",
  employeeId,
  pointId,
  openedAt: "2026-10-19T10:00:00.000Z",
  closedAt: "2026-10-19T10:00:20.000Z",
  status: "registered",
  longOpen: false,
  shelves: [{ shelf: 1, productId: "blikje", unitWeight: 350, before: 3500, after: 2800, count: 2, flag: null }]
});

test("DataStore: oude gegevens zonder de koelkastlijsten krijgen lege lijsten, zonder melding", () => {
  const state = storedState();
  delete state.fridgeShelves;
  delete state.fridgeOpenings;
  const store = createDataStore(state);

  const data = store.load(new Date("2026-10-19T12:00:00Z"));
  assert.deepEqual(data.fridgeShelves, []);
  assert.deepEqual(data.fridgeOpenings, []);
  assert.equal(store.loadProblem, null);
});

test("DataStore: geldige openingen, indelingen en registraties van de koelkast blijven bewaard", () => {
  const base = storedState();
  const employee = base.employees[0];
  const point = base.points[0];
  const state = {
    ...base,
    fridgeShelves: [{ id: "schap-1", pointId: point.id, shelf: 1, productId: "blikje", unitWeight: 350 }, { id: "schap-2", pointId: point.id, shelf: 2, productId: null, unitWeight: null }],
    fridgeOpenings: [validOpening(employee.id, point.id)],
    registrations: [{ id: "r1", employeeId: employee.id, productId: "blikje", pointId: point.id, createdAt: "2026-10-19T10:00:20.000Z", source: "fridge", openingId: "opening-1" }]
  };
  const store = createDataStore(state);

  const data = store.load(new Date("2026-10-19T12:00:00Z"));
  assert.equal(store.loadProblem, null);
  assert.equal(data.fridgeShelves.length, 2);
  assert.equal(data.fridgeOpenings.length, 1);
  assert.equal(data.registrations[0].source, "fridge");
});

test("DataStore: beschadigde openingen en indelingen worden overgeslagen met een reservekopie", () => {
  const base = storedState();
  const employee = base.employees[0];
  const point = base.points[0];
  const good = validOpening(employee.id, point.id);
  const state = {
    ...base,
    fridgeShelves: [
      { id: "s1", pointId: point.id, shelf: 1, productId: "blikje", unitWeight: 0 },
      { id: "s2", pointId: point.id, shelf: 99, productId: "blikje", unitWeight: 350 },
      { id: "s3", pointId: point.id, shelf: 1, productId: null, unitWeight: 350 }
    ],
    fridgeOpenings: [
      good,
      { ...good, id: "o2", status: "half" },
      { ...good, id: "o3", closedAt: "2026-10-19T09:00:00.000Z" },
      { ...good, id: "o4", shelves: [{ ...good.shelves[0], flag: "<script>" }] },
      { ...good, id: "o5", shelves: [{ ...good.shelves[0], count: -1 }] },
      { ...good, id: "__proto__" },
      { ...good, id: "o7", openedAt: "2099-01-01T00:00:00.000Z", closedAt: "2099-01-01T00:01:00.000Z" }
    ],
    registrations: [
      { id: "r1", employeeId: employee.id, productId: "blikje", pointId: null, createdAt: "2026-10-19T10:00:00.000Z", source: "kast" },
      { id: "r2", employeeId: employee.id, productId: "blikje", pointId: null, createdAt: "2026-10-19T10:00:00.000Z", openingId: "a b" }
    ]
  };
  const store = createDataStore(state);

  const data = store.load(new Date("2026-10-19T12:00:00Z"));
  assert.deepEqual(data.fridgeShelves, []);
  assert.deepEqual(data.fridgeOpenings.map(({ id }) => id), ["opening-1"]);
  assert.deepEqual(data.registrations, []);
  assert.equal(store.loadProblem, "skipped");
});

test("DataStore: een koelkastlijst die geen lijst is, maakt de gegevens onleesbaar (geen stil verlies)", () => {
  const store = createDataStore(storedState({ fridgeOpenings: { kapot: true } }));
  assert.equal(store.load(), null);
  assert.equal(store.loadProblem, "unreadable");
});

test("DataStore: Alle gegevens wissen wist ook de openingen uit de opslag", () => {
  fakeLocalStorageWithKeys();
  const store = new DataStore("tvb-test");
  const model = new RegistrationModel(store);
  model.addFridgeOpening({ employeeId: model.employees[0].id, pointId: model.points[0].id, openedAt: 0, closedAt: 1000, status: "nothing", shelves: [], taken: {} });
  model.save();
  assert.equal(JSON.parse(localStorage.getItem("tvb-test")).fridgeOpenings.length, 1);

  assert.equal(model.wipeAll(), true);
  assert.equal(localStorage.getItem("tvb-test"), null);
  assert.deepEqual(model.fridgeOpenings, []);
});

// ------------------------------------------------------------------
// Controller: het koelkastvenster
// ------------------------------------------------------------------

// Controller met het testmodel (employee-1 heeft pas 04A1B2C3), een nep-view, een nep-klok en een
// koelkast met dezelfde nep-klok. `openModals` bepaalt welke vensters open staan (topModal).
const createApp = ({ failSave = false, settings = SETTINGS } = {}) => {
  const { model, point } = createModel({ failSave });
  model.state.employees[0].badgeId = "04A1B2C3";
  const view = createRecordingView();
  const clock = createClock();
  const smartFridge = SmartFridge.createSimulated(settings, { clock, random: () => 0.5 });
  const demo = new FaceRecognitionDemo({ enabled: false }, null);
  const app = new RegistrationApp(model, view, undefined, demo, undefined, clock, smartFridge);
  app.fridge.settings = settings;
  const openModals = [];
  globalThis.document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === ".modal-backdrop:not(.hidden)" ? openModals : [])
  };
  return { app, model, view, clock, smartFridge, point, openModals };
};

const fridgeStatuses = (view) => view.calls.filter(([name]) => name === "setFridgeStatus").map(([, text]) => text);
const lastWindow = (view) => view.calls.filter(([name]) => name === "renderFridgeWindow").at(-1)?.[1];

test("koelkastvenster: openen toont de deur dicht en start de timer", () => {
  const { app, view, clock } = createApp();
  app.openFridgeWindow();

  assert.equal(app.fridgePhase, "waiting");
  assert.equal(lastWindow(view).phase, "waiting");
  assert.equal(view.$("#fridgeModal").classList.contains("hidden"), false);
  assert.equal(clock.timerCount(), 1);
});

test("koelkastvenster: een onbekende pas laat de koelkast dicht met een melding", () => {
  const { app, view, smartFridge } = createApp();
  app.openFridgeWindow();

  assert.equal(app.fridgeScan("DEADBEEF"), false);

  assert.equal(app.fridgePhase, "waiting");
  assert.equal(smartFridge.lock.isLocked(), true);
  assert.equal(fridgeStatuses(view).at(-1), "Deze pas is niet gekoppeld aan een medewerker. De koelkast blijft dicht.");
});

test("koelkastvenster: de pas van een inactieve medewerker krijgt dezelfde melding", () => {
  const { app, model, view, smartFridge } = createApp();
  model.setEmployeeActive("employee-1", false);
  app.openFridgeWindow();

  app.fridgeScan("04A1B2C3");

  assert.equal(smartFridge.lock.isLocked(), true);
  assert.equal(fridgeStatuses(view).at(-1), FridgeController.MESSAGES.unknownBadge);
});

test("koelkastvenster: een bekende pas opent de koelkast met de voorraad op de schappen", () => {
  const { app, view, smartFridge } = createApp();
  app.openFridgeWindow();

  assert.equal(app.fridgeScan("04A1B2C3"), true);

  assert.equal(app.fridgePhase, "open");
  assert.equal(app.fridgeEmployeeId, "employee-1");
  assert.equal(smartFridge.lock.isLocked(), false);
  assert.equal(smartFridge.isDoorOpen(), true);
  assert.deepEqual(lastWindow(view).shelves.map(({ productId, onShelf }) => [productId, onShelf]), [["blikje", 24], ["yoghurt", 24], ["ei", 24]]);
  assert.equal(view.calls.some(([name, text]) => name === "announceFridge" && text === FridgeController.MESSAGES.opened), true);
});

test("koelkastvenster: een tweede scan terwijl de deur open is, opent niets en noemt op wiens naam de koelkast open is", () => {
  const { app, model, view } = createApp();
  addEmployee(model, { badgeId: "0499AABB", pointId: model.points[0].id, companyId: model.points[0].companyId });
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");

  // Dezelfde pas nog een keer: alleen de melding dat de koelkast al open is.
  app.fridgeScan("04A1B2C3");
  assert.equal(fridgeStatuses(view).at(-1), "De koelkast is al open. Sluit eerst de deur.");

  // De pas van een collega (sinds versie 3.16): de koelkast blijft op naam van de eerste, met een
  // melding die dat zegt (de opening krijgt de status Controle nodig, zie tests/rollenspel-oktober.test.js).
  app.fridgeScan("0499AABB");
  assert.equal(app.fridgeEmployeeId, "employee-1");
  assert.equal(fridgeStatuses(view).at(-1), "De koelkast is al open op naam van Test Medewerker. Sluit eerst de deur en open dan met je eigen pas. De beheerder kijkt naar deze opening.");
});

test("koelkastvenster: 2 blikjes pakken en de deur sluiten registreert 2 blikjes met één logboekregel", () => {
  const { app, model, view, point, smartFridge } = createApp();
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");

  app.takeFromShelf("1");
  app.takeFromShelf("1");
  assert.equal(app.handText(), "2× Blikje");
  assert.equal(app.closeFridgeDoor(), true);

  assert.equal(smartFridge.lock.isLocked(), true);
  assert.equal(app.fridgePhase, "summary");
  assert.deepEqual(lastWindow(view).result.taken, { blikje: 2 });
  assert.equal(model.registrations.length, 2);
  assert.equal(model.registrations.every(({ source }) => source === "fridge"), true);
  assert.equal(model.findPoint(point.id).products.blikje.stock, 22);
  assert.equal(model.auditLog.length, 1);
  assert.equal(model.auditLog[0].action, "Koelkast geopend");
  assert.equal(model.auditLog[0].details, "Test Medewerker: 2× Blikje geregistreerd (TVB · Hoofdkantoor)");
  assert.equal(model.fridgeOpenings[0].status, "registered");
  assert.equal(view.calls.some(([name, text]) => name === "announceFridge" && text === "Je hebt gepakt: 2× Blikje. Dit is geregistreerd."), true);
});

test("koelkastvenster: iets terugleggen telt niet mee", () => {
  const { app, model } = createApp();
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");
  app.takeFromShelf("1");
  app.takeFromShelf("2");
  app.returnToShelf("1");
  app.closeFridgeDoor();

  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["yoghurt"]);
});

test("koelkastvenster: niets gepakt geeft geen registratie, met Escape sluit het venster met een korte melding", () => {
  const { app, model, view } = createApp();
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");

  app.closeFridgeWindow(); // Escape of de sluitknop terwijl de deur open is

  assert.equal(model.registrations.length, 0);
  assert.equal(model.fridgeOpenings[0].status, "nothing");
  assert.equal(app.fridgePhase, "closed");
  assert.equal(view.$("#fridgeModal").classList.contains("hidden"), true);
  assert.equal(view.toasts.at(-1).message, "Je hebt niets gepakt. Er is niets geregistreerd.");
});

test("koelkastvenster: met iets in de hand toont Escape eerst het overzicht", () => {
  const { app, model } = createApp();
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");
  app.takeFromShelf("3");

  app.closeFridgeWindow();
  assert.equal(app.fridgePhase, "summary");
  assert.equal(model.registrations.length, 1);

  app.closeFridgeWindow();
  assert.equal(app.fridgePhase, "closed");
});

test("koelkastvenster: een onverklaarbaar verschil registreert wat klopt en markeert de opening", () => {
  const { app, model } = createApp();
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");
  app.takeFromShelf("2");
  app.addForeignWeight("1");
  app.closeFridgeDoor();

  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["yoghurt"]);
  assert.equal(model.fridgeOpenings[0].status, "check");
  assert.equal(model.fridgeOpenings[0].shelves[0].flag, "mismatch");
  assert.equal(model.auditLog[0].action, "Koelkast: controle nodig");
  assert.match(model.auditLog[0].details, /Controle nodig: Schap 1 \(Blikje\): 120 g erbij, geen heel aantal/);
});

test("koelkastvenster: mislukt opslaan draait alles terug en meldt dat er niets is geregistreerd", () => {
  const { app, model, view } = createApp({ failSave: true });
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");
  app.takeFromShelf("1");

  assert.equal(app.closeFridgeDoor(), false);

  assert.equal(model.registrations.length, 0);
  assert.equal(model.fridgeOpenings.length, 0);
  assert.equal(model.auditLog.length, 0);
  assert.equal(model.findPoint(model.points[0].id).products.blikje.stock, 24);
  assert.equal(lastWindow(view).saveFailed, true);
  assert.equal(fridgeStatuses(view).at(-1), "De registratie kon niet worden opgeslagen. Er is niets geregistreerd.");
  assert.equal(view.toasts.at(-1).message, "Opslaan mislukt. Probeer het opnieuw.");
});

test("koelkastvenster: herladen terwijl de deur open is, breekt de opening veilig af (geen halve registratie)", () => {
  const { model: oldModel } = createModel();
  let saved = null;
  const store = { load: () => saved, save: (state) => { saved = JSON.parse(JSON.stringify(state)); return true; } };
  oldModel.store = store;
  oldModel.save();
  const view = createRecordingView();
  const clock = createClock();
  const app = new RegistrationApp(oldModel, view, undefined, new FaceRecognitionDemo({ enabled: false }, null), undefined, clock, SmartFridge.createSimulated(SETTINGS, { clock }));
  globalThis.document = { activeElement: null, querySelectorAll: () => [] };
  view.$("#fridgeDemoEmployee").value = "employee-1";
  app.openFridgeWindow();
  app.openFridgeForDemo();
  app.takeFromShelf("1");

  // De pagina wordt herladen: een nieuw model leest de opslag. Er staat niets van de opening in.
  const reloaded = new RegistrationModel(store);
  assert.equal(reloaded.registrations.length, 0);
  assert.equal(reloaded.fridgeOpenings.length, 0);
  // Het slot van een nieuwe pagina begint dicht.
  assert.equal(SmartFridge.createSimulated(SETTINGS).lock.isLocked(), true);
});

test("koelkastvenster: zonder producten op de schappen blijft de koelkast dicht", () => {
  const { app, model, view, point } = createApp();
  model.saveFridgeShelves(point.id, [{ shelf: 1, productId: null }, { shelf: 2, productId: null }, { shelf: 3, productId: null }]);
  app.openFridgeWindow();

  assert.equal(app.fridgeScan("04A1B2C3"), false);
  assert.match(fridgeStatuses(view).at(-1), /^Er liggen geen producten in de koelkast/);
});

test("koelkastvenster: de demokeuze opent de koelkast alleen voor een actieve medewerker", () => {
  const { app, model, view } = createApp();
  app.openFridgeWindow();
  view.$("#fridgeDemoEmployee").value = "employee-1";
  model.setEmployeeActive("employee-1", false);
  assert.equal(app.openFridgeForDemo(), false);
  assert.equal(fridgeStatuses(view).at(-1), FridgeController.MESSAGES.unknownEmployee);

  model.setEmployeeActive("employee-1", true);
  assert.equal(app.openFridgeForDemo(), true);
  assert.equal(app.fridgePhase, "open");
});

test("koelkastvenster: na 60 seconden open verschijnt de waarschuwing, het venster blijft open", () => {
  const { app, view, clock } = createApp();
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");

  clock.advance(59000);
  assert.equal(view.calls.some(([name, shown]) => name === "setDoorWarning" && shown === true), false);
  clock.advance(1000);
  assert.equal(view.calls.filter(([name]) => name === "setDoorWarning").at(-1)[1], true);
  clock.advance(10 * 60 * 1000);
  assert.equal(app.fridgePhase, "open");

  app.takeFromShelf("1");
  app.closeFridgeDoor();
  assert.equal(view.calls.filter(([name]) => name === "setDoorWarning").at(-1)[1], false);
  assert.equal(app.fridgeResult.status, "check", "langer dan 5 minuten open: controle nodig");
});

test("koelkastvenster: met de deur dicht sluit het venster vanzelf na de ingestelde tijd zonder invoer", () => {
  const { app, view, clock } = createApp();
  app.openFridgeWindow();
  clock.advance(SETTINGS.idleCloseMs - 1000);
  app.noteFridgeActivity();
  clock.advance(SETTINGS.idleCloseMs - 1000);
  assert.equal(app.fridgePhase, "waiting");

  clock.advance(1000);
  assert.equal(app.fridgePhase, "closed");
  assert.equal(view.$("#fridgeModal").classList.contains("hidden"), true);
  assert.equal(clock.timerCount(), 0, "de timer is gestopt");
});

test("koelkastvenster: de pas gaat naar de koelkast als het koelkastvenster bovenaan staat", () => {
  const { app, openModals, view, smartFridge } = createApp();
  app.openFridgeWindow();
  openModals.push(view.$("#fridgeModal"));

  app.recognizeBadge("04A1B2C3");

  assert.equal(app.fridgePhase, "open");
  assert.equal(app.selectedEmployeeId, null, "geen productvenster");
  assert.equal(smartFridge.isOpen(), true);
});

test("koelkastvenster: gewist in een ander tabblad breekt de opening af zonder registratie", () => {
  const { app, model, smartFridge } = createApp();
  app.openFridgeWindow();
  app.fridgeScan("04A1B2C3");
  app.takeFromShelf("1");

  app.handleStorageCleared({ keepStore: true });

  assert.equal(app.fridgePhase, "closed");
  assert.equal(smartFridge.lock.isLocked(), true);
  assert.equal(model.registrations.length, 0);
});

test("koelkastvenster: uitgezet in config.js opent het venster niet en verdwijnen de knop en het tabblad", () => {
  const { app, view } = createApp({ settings: { ...SETTINGS, enabled: false } });
  app.showRecognitionOptions();
  app.openFridgeWindow();

  assert.equal(app.fridgePhase, "closed");
  assert.equal(view.$("#fridgeOpenButton").classList.contains("hidden"), true);
  assert.equal(view.$("#tab-fridge").classList.contains("hidden"), true);
});

// ------------------------------------------------------------------
// Beheer: indeling opslaan
// ------------------------------------------------------------------

// Zet de velden van de indeling klaar in de nep-view: per schap een product en een gewicht.
const fillShelfFields = (view, pointId, rows) => {
  view.$("#fridgePointSelect").value = pointId;
  const fields = rows.map((_, index) => createFakeElement({ dataset: { fridgeShelf: String(index + 1) } }));
  view.$("#fridgeShelfFields").querySelectorAll = () => fields;
  rows.forEach(([productId, weight], index) => {
    view.$(`#fridgeShelfProduct${index + 1}`).value = productId;
    view.$(`#fridgeShelfWeight${index + 1}`).value = weight;
  });
};

test("beheer: de indeling opslaan kan alleen als beheerder en komt in het logboek", () => {
  const { app, model, view, point } = createApp();
  fillShelfFields(view, point.id, [["ei", "62"], ["", ""], ["blikje", "345"]]);

  assert.equal(app.saveFridgeShelves({ preventDefault() {} }), false);
  assert.equal(view.toasts.at(-1).message, "Log eerst in als beheerder.");

  asAdmin(app);
  assert.equal(app.saveFridgeShelves({ preventDefault() {} }), true);
  assert.deepEqual(model.fridgeLayout(point.id).map(({ productId }) => productId), ["ei", null, "blikje"]);
  assert.equal(model.auditLog.at(-1).action, "Koelkastindeling gewijzigd");
  assert.equal(model.auditLog.at(-1).details, "TVB · Hoofdkantoor: schap 1 Ei (62 g), schap 2 leeg, schap 3 Blikje (345 g)");
});

test("beheer: een ongeldig gewicht geeft een foutmelding bij het veld en slaat niets op", () => {
  const { app, model, view, point } = createApp();
  asAdmin(app);
  fillShelfFields(view, point.id, [["ei", "12a"], ["yoghurt", ""], ["blikje", "9000"]]);

  assert.equal(app.saveFridgeShelves({ preventDefault() {} }), false);

  assert.deepEqual(view.fieldErrors.map(({ message }) => message), [
    "Gebruik alleen cijfers.",
    "Vul het gewicht van één stuk in.",
    "Vul een gewicht van 1 tot en met 5000 gram in."
  ]);
  assert.deepEqual(model.fridgeShelves, []);
  assert.equal(model.auditLog.length, 0);
});
