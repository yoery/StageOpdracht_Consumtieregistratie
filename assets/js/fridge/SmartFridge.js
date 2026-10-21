import { SMART_FRIDGE } from "../config.js";
import { SimulatedLock } from "./SimulatedLock.js";
import { SimulatedShelfScale } from "./SimulatedShelfScale.js";

/**
 * SmartFridge — de slimme koelkast: een slot en een weegschaal per schap, met de pas als sleutel
 * (TO bijlage B, optie C). Deze class bepaalt uit het gewicht wat een medewerker heeft gepakt.
 *
 * Het verloop van één opening:
 *   1. start(): het gewicht van ieder schap wordt onthouden (de beginmeting) en het slot gaat open;
 *   2. openDoor(): de deur gaat open. Het slot gaat daarna niet meer vanzelf dicht;
 *   3. de medewerker pakt wat hij wil (en legt eventueel iets terug);
 *   4. finish(): het slot gaat dicht, ieder schap wordt opnieuw gewogen (de eindmeting) en per schap
 *      wordt het verschil omgerekend naar een aantal producten (countShelf).
 * Gaat de deur na start() niet open, dan sluit het slot vanzelf (SimulatedLock) en wordt de opening
 * afgebroken zonder registratie (onNotOpened).
 *
 * Omrekenen (countShelf): het verschil in gram gedeeld door het gewicht van één product, afgerond op
 * een heel aantal. Dat aantal telt alleen als het verschil binnen de tolerantie van dat hele aantal
 * valt (toleranceRatio maal het gewicht van één product). Als gewicht van één product geldt het
 * gemeten gemiddelde van het schap (gewicht bij de beginmeting gedeeld door het aantal producten op
 * het schap), zolang dat niet meer dan measuredWeightRange afwijkt van het ingestelde gewicht (zie
 * effectiveUnitWeight). Zo telt het ook goed als de producten structureel zwaarder of lichter zijn
 * dan ingesteld, bijvoorbeeld eieren van klasse L (gemiddeld 68 gram) bij een ingesteld gewicht van
 * 60 gram: anders worden 6 gepakte eieren (408 gram) soms als 7 geteld (7 × 60 = 420 gram).
 * Voorbeelden bij een blikje van 350 gram en 15 procent tolerantie (52 gram):
 *   - 705 gram weg: 2 blikjes;
 *   - een blikje gepakt en teruggelegd: ongeveer 0 gram weg, dus niets gepakt;
 *   - 520 gram weg: geen heel aantal, het schap krijgt de markering "mismatch" en telt niet mee;
 *   - 120 gram erbij: de markering "added" (er is iets op het schap gelegd).
 * Een schap zonder product (leeg schap) telt nooit mee. Verandert het gewicht daar meer dan
 * emptyShelfToleranceGrams, dan krijgt het de markering "unknown".
 * Een opening met een markering, waarbij de deur langer dan doorAlertMs open stond of waarbij een
 * collega zijn pas scande terwijl de deur open was (noteOtherBadge), krijgt de status "check"
 * (controle nodig door de beheerder). De schappen die wel kloppen, worden geregistreerd.
 *
 * Hardware: SmartFridge gebruikt het slot alleen via FridgeLock en de weegschalen alleen via
 * ShelfScale. In de demo zijn dat SimulatedLock en SimulatedShelfScale (zie createSimulated). In
 * productie stuurt de backend het echte slot en de weegschalen aan; dan worden alleen die twee
 * Simulated-classes vervangen door classes die via de backend werken. In productie hoort ook het
 * omrekenen in de backend (TO bijlage B, stap 10), omdat de browser niet te vertrouwen is. Deze class
 * is dan het voorbeeld voor die code. De browser opent het echte slot nooit zelf.
 *
 * Verantwoordelijkheid:
 *   - bijhouden of er een opening bezig is, door wie en sinds wanneer de deur open is;
 *   - de begin- en eindmeting doen en het verschil per schap omrekenen naar aantallen;
 *   - de status van de opening bepalen ("registered", "nothing" of "check").
 *
 * Verbonden met:
 *   - FridgeLock en ShelfScale (in de demo SimulatedLock en SimulatedShelfScale);
 *   - config.js: SMART_FRIDGE (tolerantie, tijden, aantal schappen);
 *   - FridgeController: start en sluit de opening en geeft het resultaat aan het model;
 *   - RegistrationModel: addFridgeOpening slaat het resultaat van finish() op.
 */
export class SmartFridge {
  // `lock` is een FridgeLock, `scales` een lijst met één ShelfScale per schap (schap 1 eerst).
  // `settings` zijn de instellingen uit config.js. `clock` levert de tijd (now); de tests geven een
  // nep-klok mee.
  constructor({ lock, scales, settings = SMART_FRIDGE, clock = { now: () => Date.now() } }) {
    this.lock = lock;
    this.scales = scales;
    this.settings = settings;
    this.clock = clock;
    this.opening = null;           // de opening die nu bezig is, of null
    this.onNotOpened = () => {};   // de deur is na start() niet op tijd geopend
    this.lock.onAutoLock = () => this.handleAutoLock();
  }

  // Maakt de koelkast van de demo: een nagebootst slot en een nagebootste weegschaal per schap.
  // In productie komt hier een koelkast met classes die via de backend werken.
  static createSimulated(settings = SMART_FRIDGE, { clock, random } = {}) {
    const lock = new SimulatedLock({ autoLockMs: settings.autoLockMs, ...(clock ? { clock } : {}) });
    const scales = Array.from({ length: settings.shelfCount }, (_, index) => new SimulatedShelfScale(index + 1, random ? { random } : {}));
    return new SmartFridge({ lock, scales, settings, ...(clock ? { clock } : {}) });
  }

  // Staat de slimme koelkast aan in config.js?
  isEnabled() {
    return Boolean(this.settings?.enabled);
  }

  // De weegschaal van een schap (1 = eerste schap), of undefined.
  scale(shelf) {
    return this.scales[shelf - 1];
  }

  // Is er nu een opening bezig (slot open of deur open)?
  isOpen() {
    return this.opening !== null;
  }

  // Staat de deur open?
  isDoorOpen() {
    return Boolean(this.opening?.doorOpenedAt);
  }

  // Hoe lang (ms) staat de deur al open? 0 als de deur dicht is.
  doorOpenMs(now = this.clock.now()) {
    return this.isDoorOpen() ? Math.max(0, now - this.opening.doorOpenedAt) : 0;
  }

  // Begint een opening voor deze medewerker. `layout` is de indeling van de schappen
  // (RegistrationModel.fridgeLayout): per schap { shelf, productId, unitWeight }, eventueel met
  // itemCount (hoeveel producten er nu op het schap liggen, zie effectiveUnitWeight). Het gewicht van
  // ieder schap wordt onthouden en het slot gaat open. Geeft false terug (en doet niets) als er al
  // een opening bezig is: er kan maar één persoon tegelijk de koelkast openen.
  start(employeeId, pointId, layout) {
    if (this.isOpen()) return false;

    this.opening = {
      employeeId,
      pointId,
      layout: layout.map((shelf) => ({ ...shelf })),
      before: layout.map((shelf) => this.readShelf(shelf.shelf)),
      openedAt: this.clock.now(),
      doorOpenedAt: null
    };
    this.lock.unlock();
    return true;
  }

  // Leest de weegschaal van één schap. Een schap zonder weegschaal weegt 0 gram.
  readShelf(shelf) {
    return this.scale(shelf)?.read() ?? 0;
  }

  // Een collega scant zijn pas terwijl de deur open is. Er kan maar één opening tegelijk zijn, dus wat
  // hij nu pakt, komt op naam van degene die de koelkast opende. De opening krijgt daarom bij finish()
  // de status "check". Alleen dát er een andere pas is gescand, wordt onthouden, niet van wie
  // (dataminimalisatie). Geeft false terug als er geen opening bezig is.
  noteOtherBadge() {
    if (!this.isOpen()) return false;
    this.opening.otherBadge = true;
    return true;
  }

  // De deur gaat open. Het slot gaat daarna niet meer vanzelf dicht (pas weer bij finish).
  openDoor() {
    if (!this.isOpen() || this.isDoorOpen()) return;
    this.opening.doorOpenedAt = this.clock.now();
    this.lock.cancelAutoLock();
  }

  // Het slot is vanzelf dichtgegaan (zie SimulatedLock.autoLock). Was de deur niet geopend, dan wordt
  // de opening afgebroken zonder registratie en hoort de controller dat via onNotOpened.
  handleAutoLock() {
    if (!this.isOpen() || this.isDoorOpen()) return;
    const employeeId = this.opening.employeeId;
    this.opening = null;
    this.onNotOpened(employeeId);
  }

  // De deur is dicht: het slot gaat dicht, ieder schap wordt opnieuw gewogen en het verschil wordt
  // omgerekend. Geeft het resultaat terug, of null als er geen opening bezig was:
  //   { employeeId, pointId, openedAt, closedAt, doorOpenMs, longOpen, otherBadge, status,
  //     shelves: [{ shelf, productId, unitWeight, before, after, count, flag }],
  //     taken: { productId: aantal } }
  finish() {
    if (!this.isOpen()) return null;

    this.lock.lock();
    const now = this.clock.now();
    const opening = this.opening;
    this.opening = null;

    const after = opening.layout.map((shelf) => this.readShelf(shelf.shelf));
    const shelves = SmartFridge.evaluate(opening.layout, opening.before, after, this.settings);
    const doorOpenMs = opening.doorOpenedAt ? now - opening.doorOpenedAt : 0;
    const longOpen = doorOpenMs >= this.settings.doorAlertMs;
    const otherBadge = Boolean(opening.otherBadge);

    return {
      employeeId: opening.employeeId,
      pointId: opening.pointId,
      openedAt: opening.openedAt,
      closedAt: now,
      doorOpenMs,
      longOpen,
      otherBadge,
      shelves,
      taken: SmartFridge.takenProducts(shelves),
      status: SmartFridge.statusOf(shelves, longOpen, otherBadge)
    };
  }

  // Breekt een opening af zonder te wegen of te registreren (bijvoorbeeld als alle gegevens in een
  // ander tabblad worden gewist). Het slot gaat dicht.
  abort() {
    this.lock.lock();
    this.opening = null;
  }

  // ------------------------------------------------------------------
  // Omrekenen van gewicht naar aantallen
  // ------------------------------------------------------------------

  // Rekent het gewichtsverschil van één schap om naar een aantal gepakte producten.
  //   `removed`: zo veel gram is er van het schap verdwenen (negatief = erbij gekomen);
  //   `unitWeight`: het gewicht van één product in gram (null of 0 = leeg schap);
  // Geeft { count, flag } terug. `flag` is null als het verschil klopt, en anders:
  //   "added"    = er is meer dan de tolerantie bij gekomen;
  //   "mismatch" = het verschil past niet bij een heel aantal producten;
  //   "unknown"  = het gewicht van een leeg schap is veranderd.
  // Bij een markering is `count` 0: dat schap wordt niet geregistreerd, de beheerder beslist.
  static countShelf(removed, unitWeight, settings = SMART_FRIDGE) {
    if (!(unitWeight > 0)) {
      return { count: 0, flag: Math.abs(removed) > settings.emptyShelfToleranceGrams ? "unknown" : null };
    }

    const tolerance = unitWeight * settings.toleranceRatio;
    const count = Math.round(removed / unitWeight) + 0; // + 0 maakt van -0 gewoon 0
    const rest = Math.abs(removed - count * unitWeight);

    if (rest > tolerance) return { count: 0, flag: "mismatch" };
    if (count < 0) return { count: 0, flag: "added" };
    return { count, flag: null };
  }

  // Het gewicht van één product waarmee een schap wordt omgerekend. Weet de koelkast hoeveel producten
  // er bij de beginmeting op het schap lagen (`itemCount` in de indeling), dan is dat het gemeten
  // gemiddelde: het gewicht bij de beginmeting gedeeld door dat aantal. Wijkt dat gemiddelde meer dan
  // measuredWeightRange (25 procent) af van het ingestelde gewicht, dan ligt er waarschijnlijk iets
  // anders op het schap of klopt het aantal niet. Dan geldt het ingestelde gewicht, net als zonder
  // aantal of bij een leeg schap.
  static effectiveUnitWeight({ unitWeight, itemCount }, before, settings = SMART_FRIDGE) {
    if (!(unitWeight > 0) || !(itemCount > 0) || !(before > 0)) return unitWeight;
    const measured = before / itemCount;
    const range = settings.measuredWeightRange ?? 0;
    return Math.abs(measured - unitWeight) <= unitWeight * range ? measured : unitWeight;
  }

  // Rekent alle schappen om. `layout`, `before` en `after` hebben dezelfde volgorde.
  static evaluate(layout, before, after, settings = SMART_FRIDGE) {
    return layout.map((shelf, index) => {
      const unitWeight = SmartFridge.effectiveUnitWeight(shelf, before[index], settings);
      const { count, flag } = SmartFridge.countShelf(before[index] - after[index], unitWeight, settings);
      return {
        shelf: shelf.shelf,
        productId: shelf.productId ?? null,
        unitWeight: shelf.unitWeight ?? null,
        before: before[index],
        after: after[index],
        count,
        flag
      };
    });
  }

  // Telt de aantallen per product, bijvoorbeeld { blikje: 2, ei: 1 }. Liggen er op twee schappen
  // dezelfde producten, dan worden ze opgeteld. Schappen met een markering tellen niet mee.
  static takenProducts(shelves) {
    const taken = {};
    for (const { productId, count, flag } of shelves) {
      if (!productId || flag || count <= 0) continue;
      taken[productId] = (taken[productId] || 0) + count;
    }
    return taken;
  }

  // De status van een opening: "check" bij een markering, als de deur te lang open stond of als een
  // collega zijn pas scande terwijl de deur open was, anders "registered" als er iets is gepakt en
  // "nothing" als er niets is gepakt.
  static statusOf(shelves, longOpen = false, otherBadge = false) {
    if (longOpen || otherBadge || shelves.some(({ flag }) => flag)) return "check";
    return shelves.some(({ count }) => count > 0) ? "registered" : "nothing";
  }

  // De tekst bij een markering, voor het beheer en het logboek, bijvoorbeeld
  // "Schap 1 (Blikje): 120 g erbij" of "Schap 2 (Yoghurt): 80 g weg, geen heel aantal".
  // `productName` is de naam van het product op het schap, of null bij een leeg schap.
  static issueText({ shelf, before, after, flag }, productName) {
    const label = `Schap ${shelf} (${productName || "leeg schap"})`;
    const difference = Math.abs(before - after);
    if (flag === "added") return `${label}: ${difference} g erbij`;
    if (flag === "mismatch") return `${label}: ${difference} g ${before >= after ? "weg" : "erbij"}, geen heel aantal`;
    if (flag === "unknown") return `${label}: ${difference} g verschil`;
    return "";
  }
}
