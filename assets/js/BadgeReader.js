import { BADGE_READER } from "./config.js";

/**
 * BadgeReader — herkent een pas die tegen een USB-NFC-lezer wordt gehouden.
 *
 * Hoe het werkt: de meeste USB-NFC-lezers gedragen zich als een toetsenbord ("keyboard wedge").
 * Bij het aanbieden van een pas "typen" ze razendsnel het pasnummer (bijvoorbeeld 04A1B2C3),
 * meestal gevolgd door Enter (soms Tab of niets). De website heeft daarvoor geen bibliotheek,
 * driver of licentie nodig: deze class kijkt alleen naar de toetsaanslagen.
 *
 * Een "scan" is:
 *   - minstens `minLength` tekens;
 *   - elk teken binnen `maxKeyIntervalMs` na het vorige (een mens typt veel trager);
 *   - afgesloten met Enter of Tab, óf `endDelayMs` stilte na de laatste toets (voor lezers
 *     die geen Enter sturen).
 * Typt iemand gewoon met de hand, dan wordt de buffer steeds opnieuw begonnen en ontstaat er
 * nooit een scan.
 *
 * Verantwoordelijkheid:
 *   - een buffer bijhouden van snel getypte tekens met het tijdstip van de laatste toets;
 *   - bepalen of die tekens samen een scan zijn;
 *   - het pasnummer gelijk maken (normalize) en doorgeven via de callback onScan(code).
 *
 * Verbonden met:
 *   - config.js: BADGE_READER (aan/uit, minimale lengte en de tijden);
 *   - BadgeController (onderdeel van de controller RegistrationApp): geeft iedere keydown door
 *     aan handleKey() en zet de callbacks onScan (medewerker zoeken en productvenster openen) en
 *     onStart (inhoud van het zoekveld onthouden, zodat die na een scan kan worden teruggezet);
 *   - main.js: maakt de BadgeReader en geeft die aan de controller.
 *
 * Let op (beveiliging): het nummer van een pas is niet geheim en kan met goedkope apparatuur
 * worden gekopieerd. Herkennen met de pas is gemak, geen bewijs van identiteit.
 */
export class BadgeReader {
  // `settings` zijn de instellingen uit config.js. `clock` levert de tijd en de timers; die kan
  // worden meegegeven, zodat de unit tests met een nep-klok kunnen werken in plaats van echt te wachten.
  constructor(settings = BADGE_READER, clock = BadgeReader.realClock()) {
    this.settings = settings;
    this.clock = clock;
    this.buffer = "";          // de snel getypte tekens tot nu toe
    this.lastKeyTime = 0;      // tijdstip (ms) van de laatste toets in de buffer
    this.endTimer = null;      // timer voor lezers zonder Enter (zie scheduleEnd)
    this.onScan = () => {};    // wordt aangeroepen met het genormaliseerde pasnummer
    this.onStart = () => {};   // wordt aangeroepen als er een nieuwe buffer begint
  }

  // De echte klok van de browser: Date.now() en setTimeout/clearTimeout.
  static realClock() {
    return {
      now: () => Date.now(),
      setTimeout: (action, delay) => setTimeout(action, delay),
      clearTimeout: (timer) => clearTimeout(timer)
    };
  }

  // Maakt een pasnummer gelijk: spaties, ":" en "-" weg en alles in hoofdletters.
  // Zo zijn "04:a1:b2:c3" en "04A1B2C3" hetzelfde pasnummer. Wordt ook door het
  // medewerkersformulier gebruikt, zodat het opgeslagen nummer altijd dezelfde vorm heeft.
  static normalize(code) {
    return String(code ?? "").replace(/[\s:-]/g, "").toUpperCase();
  }

  // Staat de pasjeslezer aan in config.js?
  isEnabled() {
    return Boolean(this.settings?.enabled);
  }

  // Verwerkt één keydown. Geeft true terug als deze toets (Enter of Tab) een scan afsloot;
  // die toets wordt dan tegengehouden (preventDefault en stopPropagation), zodat hij geen
  // andere actie start, zoals een medewerkerrij openen of de focus verplaatsen.
  //   - sneltoetsen (Ctrl, Cmd, Alt) en andere speciale toetsen (Backspace, pijltjes) maken
  //     de buffer leeg: dat is iemand die zelf iets doet;
  //   - Shift wordt overgeslagen: sommige lezers drukken Shift in voor hoofdletters;
  //   - een ingedrukt gehouden toets (event.repeat) is geen lezer.
  handleKey(event) {
    if (!this.isEnabled()) return false;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
      this.reset();
      return false;
    }

    const time = this.keyTime(event);

    if (event.key === "Enter" || event.key === "Tab") {
      if (!this.isScan(time)) {
        this.reset();
        return false;
      }
      event.preventDefault();
      event.stopPropagation?.();
      this.finish();
      return true;
    }

    if (event.key === "Shift") return false;
    if (typeof event.key !== "string" || event.key.length !== 1) {
      this.reset();
      return false;
    }

    // Te lang na de vorige toets: dat was een mens. Er begint dan een nieuwe buffer met dit teken.
    if (this.buffer === "" || time - this.lastKeyTime > this.settings.maxKeyIntervalMs) {
      this.reset();
      this.onStart();
    }
    this.buffer += event.key;
    this.lastKeyTime = time;
    this.scheduleEnd();
    return false;
  }

  // Het tijdstip (ms) van een toets: wanneer de toets binnenkwam (event.timeStamp), niet wanneer
  // de pagina hem verwerkt. Op een trage tablet staan de tekens van een scan soms even in de rij,
  // bijvoorbeeld terwijl de lijst opnieuw wordt getekend. Met de verwerkingstijd zaten er dan meer
  // dan maxKeyIntervalMs tussen twee tekens en werd een scan gezien als typen: "DEADBEEF" werd
  // "DBEEF" en "DEA" bleef in het zoekveld staan (gezien met een vier keer tragere processor).
  // Zonder bruikbaar timeStamp (de nep-events van de unit tests) geldt de klok.
  keyTime(event) {
    const stamp = event?.timeStamp;
    return Number.isFinite(stamp) && stamp > 0 ? stamp : this.clock.now();
  }

  // Zijn de tekens in de buffer samen een scan? Er moeten genoeg tekens zijn, en de afsluitende
  // Enter of Tab moet kort na het laatste teken komen (binnen endDelayMs, daarna was de scan al
  // afgerond door de timer).
  isScan(time) {
    return this.buffer.length >= this.settings.minLength && time - this.lastKeyTime <= this.settings.endDelayMs;
  }

  // Start (opnieuw) de timer voor lezers zonder Enter: blijft het endDelayMs stil na de laatste
  // toets, dan wordt gekeken of de buffer een scan is.
  scheduleEnd() {
    this.clock.clearTimeout(this.endTimer);
    this.endTimer = this.clock.setTimeout(() => this.finishAfterSilence(), this.settings.endDelayMs);
  }

  // Wordt door de timer aangeroepen. Genoeg snelle tekens: dat was een scan. Anders was het
  // gewoon typen en wordt de buffer leeggemaakt.
  finishAfterSilence() {
    this.endTimer = null;
    if (this.buffer.length >= this.settings.minLength) this.finish();
    else this.reset();
  }

  // Rondt een scan af: maakt de buffer leeg en geeft het genormaliseerde pasnummer door.
  finish() {
    const code = BadgeReader.normalize(this.buffer);
    this.reset();
    if (code !== "") this.onScan(code);
  }

  // Maakt de buffer leeg en stopt de timer.
  reset() {
    this.clock.clearTimeout(this.endTimer);
    this.endTimer = null;
    this.buffer = "";
    this.lastKeyTime = 0;
  }
}
