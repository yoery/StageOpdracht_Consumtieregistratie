import { FridgeLock } from "./FridgeLock.js";

/**
 * SimulatedLock — het nagebootste slot van de slimme koelkast in de demo.
 *
 * Er is geen echt slot: deze class onthoudt alleen of het slot open of dicht is. Na unlock() gaat
 * het slot na `autoLockMs` vanzelf weer dicht, tenzij de deur intussen is geopend (cancelAutoLock).
 * Zo werkt ook een echt slot met een deursensor: wie zijn pas toont maar de deur niet opent, laat
 * de koelkast niet open achter (TO bijlage B, stap 6 van de ontwerpschets).
 *
 * In productie wordt deze class vervangen door een class met dezelfde methodes die via de backend
 * werkt (zie FridgeLock). De browser opent het echte slot nooit zelf.
 *
 * Verantwoordelijkheid:
 *   - de status bijhouden ("locked" of "unlocked");
 *   - na unlock() een timer zetten en het slot vanzelf sluiten als de deur niet op tijd opengaat;
 *   - dan onAutoLock aanroepen, zodat SmartFridge de opening kan afbreken.
 *
 * Verbonden met:
 *   - FridgeLock: de afspraak (interface) die deze class uitvoert;
 *   - SmartFridge: maakt het slot open en dicht;
 *   - config.js: SMART_FRIDGE.autoLockMs (via SmartFridge.createSimulated).
 */
export class SimulatedLock extends FridgeLock {
  // `autoLockMs` is de tijd tot het slot vanzelf weer dichtgaat. `clock` levert de timers; de unit
  // tests geven een nep-klok mee, zodat ze niet echt hoeven te wachten.
  constructor({ autoLockMs = 10000, clock = SimulatedLock.realClock() } = {}) {
    super();
    this.autoLockMs = autoLockMs;
    this.clock = clock;
    this.status = "locked";
    this.autoLockTimer = null;
  }

  // De echte klok van de browser: setTimeout en clearTimeout.
  static realClock() {
    return {
      setTimeout: (action, delay) => setTimeout(action, delay),
      clearTimeout: (timer) => clearTimeout(timer)
    };
  }

  // Opent het slot en zet de timer voor het vanzelf weer sluiten.
  unlock() {
    this.cancelAutoLock();
    this.status = "unlocked";
    this.autoLockTimer = this.clock.setTimeout(() => this.autoLock(), this.autoLockMs);
  }

  // Wordt door de timer aangeroepen: de deur is niet op tijd geopend. Het slot gaat dicht en
  // SmartFridge hoort dat via onAutoLock.
  autoLock() {
    this.autoLockTimer = null;
    if (this.status !== "unlocked") return;
    this.status = "locked";
    this.onAutoLock();
  }

  // De deur is open: de timer stopt. Het slot gaat pas weer dicht met lock() (deur dicht).
  cancelAutoLock() {
    if (this.autoLockTimer === null) return;
    this.clock.clearTimeout(this.autoLockTimer);
    this.autoLockTimer = null;
  }

  // Sluit het slot en stopt de timer.
  lock() {
    this.cancelAutoLock();
    this.status = "locked";
  }

  isLocked() {
    return this.status === "locked";
  }
}
