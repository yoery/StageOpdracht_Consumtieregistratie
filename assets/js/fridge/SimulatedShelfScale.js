import { ShelfScale } from "./ShelfScale.js";

/**
 * SimulatedShelfScale — de nagebootste weegschaal onder één schap van de slimme koelkast (demo).
 *
 * De demo heeft geen echte koelkast. Deze class bootst daarom ook de producten op het schap na: een
 * lijst met het gewicht van ieder product. Een product pakken haalt er één af, terugleggen legt het
 * terug. read() geeft het totaal, net zoals een echte weegschaal alleen het totaal weet.
 * Producten zijn niet allemaal precies even zwaar: bij het vullen (fill) wijkt ieder product een
 * klein beetje af van het opgegeven gewicht. Daardoor is ook in de demo te zien dat SmartFridge met
 * een tolerantie rekent.
 *
 * In productie wordt deze class vervangen door een class met alleen read(), die het gewicht via de
 * backend van de kastcontroller krijgt (zie ShelfScale). fill, takeItem, returnItem en addWeight
 * bestaan dan niet: daar liggen echte producten op het schap.
 *
 * Verantwoordelijkheid:
 *   - het schap vullen met een aantal producten (fill);
 *   - een product pakken (takeItem) of terugleggen (returnItem);
 *   - iets anders op het schap leggen (addWeight), om een onverklaarbaar verschil te laten zien;
 *   - het totale gewicht teruggeven (read).
 *
 * Verbonden met:
 *   - ShelfScale: de afspraak (interface) die deze class uitvoert;
 *   - SmartFridge: leest het gewicht;
 *   - FridgeController: vult de schappen vóór een opening en pakt of legt producten terug als de
 *     medewerker in het koelkastvenster op een schap tikt.
 */
export class SimulatedShelfScale extends ShelfScale {
  // `random` geeft een getal van 0 tot 1 (zoals Math.random). De tests geven een vaste functie mee.
  constructor(shelf, { random = Math.random } = {}) {
    super(shelf);
    this.random = random;
    this.items = [];      // het gewicht van ieder product op het schap, in grammen
    this.extraWeight = 0; // gewicht van iets anders dan de producten (zie addWeight)
  }

  // Legt `count` producten van ongeveer `unitWeight` gram op een leeg schap. Ieder product wijkt
  // tot `variation` (bijvoorbeeld 0.02 = 2 procent) af van dat gewicht.
  fill(count, unitWeight, variation = 0) {
    this.items = [];
    this.extraWeight = 0;
    const amount = Number.isInteger(count) && count > 0 ? count : 0;
    for (let index = 0; index < amount; index += 1) {
      const deviation = (this.random() * 2 - 1) * variation;
      this.items.push(Math.max(1, Math.round(unitWeight * (1 + deviation))));
    }
  }

  // Hoeveel producten liggen er op het schap?
  itemCount() {
    return this.items.length;
  }

  // Pakt het voorste product van het schap. Geeft het gewicht terug, of null als het schap leeg is.
  takeItem() {
    return this.items.length > 0 ? this.items.pop() : null;
  }

  // Legt een product van `weight` gram terug op het schap.
  returnItem(weight) {
    if (Number.isFinite(weight) && weight > 0) this.items.push(weight);
  }

  // Legt iets anders op het schap (of haalt het eraf met een negatief gewicht).
  addWeight(grams) {
    if (Number.isFinite(grams)) this.extraWeight += grams;
  }

  // Het totale gewicht op het schap in hele grammen (nooit minder dan 0).
  read() {
    const total = this.items.reduce((sum, weight) => sum + weight, 0) + this.extraWeight;
    return Math.max(0, Math.round(total));
  }
}
