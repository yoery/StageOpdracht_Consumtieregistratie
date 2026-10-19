/**
 * ShelfScale — de afspraak (interface) voor de weegschaal onder één schap van de slimme koelkast.
 *
 * Ieder schap ligt op weegcellen. Een weegschaal geeft het gewicht van alles wat op het schap ligt,
 * in hele grammen. Meer hoeft SmartFridge niet te weten: uit het gewicht vóór en na een opening
 * rekent SmartFridge uit hoeveel producten er zijn gepakt.
 *
 * In de demo is de weegschaal nagebootst (SimulatedShelfScale). In productie leest de kastcontroller
 * de weegcellen uit en stuurt de backend de gewichten door. Dan komt er een andere class met dezelfde
 * methode read(), die het gewicht via de backend opvraagt. Alleen die class wordt vervangen.
 *
 * Verantwoordelijkheid:
 *   - shelf: het nummer van het schap (1 = bovenste schap);
 *   - read(): het gewicht op het schap in hele grammen.
 *
 * Verbonden met:
 *   - SimulatedShelfScale: de nagebootste weegschaal van de demo (breidt deze class uit);
 *   - SmartFridge: leest bij het openen en sluiten van de koelkast alle weegschalen.
 */
export class ShelfScale {
  // `shelf` is het nummer van het schap (1, 2, 3, ...).
  constructor(shelf) {
    this.shelf = shelf;
  }

  // Het gewicht op het schap in hele grammen. Iedere echte class moet deze methode zelf maken.
  read() {
    throw new Error("ShelfScale.read moet in een eigen class worden gemaakt.");
  }
}
