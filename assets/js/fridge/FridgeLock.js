/**
 * FridgeLock — de afspraak (interface) voor het slot van de slimme koelkast.
 *
 * Deze class doet zelf niets: ze beschrijft alleen welke methodes ieder slot heeft. SmartFridge
 * gebruikt een slot alleen via deze methodes en weet dus niet of het slot echt of nagebootst is.
 * In de demo is dat SimulatedLock. In productie komt er een andere class met dezelfde methodes,
 * die de opdracht via de backend naar de kastcontroller stuurt (zie TO bijlage B, ontwerpschets).
 *
 * Belangrijk voor productie: de browser mag het echte slot nooit zelf openen. Een opdracht uit de
 * browser is na te maken door iedereen die bij de tablet kan. Alleen de backend controleert de pas
 * en stuurt daarna het slot aan. De productieversie van deze class vraagt de backend dus alleen om
 * de koelkast te openen en leest de status terug. Alleen SimulatedLock (en SimulatedShelfScale)
 * worden dan vervangen: SmartFridge, de controller en de rest van de app blijven hetzelfde.
 *
 * Verantwoordelijkheid:
 *   - unlock(): het slot openen, zodat de deur open kan;
 *   - lock(): het slot sluiten;
 *   - cancelAutoLock(): de deur is open, het slot hoeft niet vanzelf weer dicht;
 *   - isLocked(): zit het slot dicht?
 *   - onAutoLock: wordt aangeroepen als het slot vanzelf weer dichtgaat omdat de deur niet op tijd
 *     werd geopend. SmartFridge zet deze callback.
 *
 * Verbonden met:
 *   - SimulatedLock: het nagebootste slot van de demo (breidt deze class uit);
 *   - SmartFridge: gebruikt het slot bij het openen en sluiten van de koelkast.
 */
export class FridgeLock {
  constructor() {
    this.onAutoLock = () => {};
  }

  // Opent het slot. Iedere echte class moet deze methode zelf maken.
  unlock() {
    throw new Error("FridgeLock.unlock moet in een eigen class worden gemaakt.");
  }

  // Sluit het slot.
  lock() {
    throw new Error("FridgeLock.lock moet in een eigen class worden gemaakt.");
  }

  // De deur is open: het slot hoeft niet meer vanzelf dicht te gaan. Niet ieder slot kent een
  // tijd waarna het vanzelf dichtgaat, daarom doet deze methode standaard niets.
  cancelAutoLock() {}

  // Zit het slot dicht?
  isLocked() {
    throw new Error("FridgeLock.isLocked moet in een eigen class worden gemaakt.");
  }
}
