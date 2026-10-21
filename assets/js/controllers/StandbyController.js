import { STANDBY } from "../config.js";

/**
 * StandbyController — de standby van de tablet: na een tijd zonder invoer op de beginpagina wordt
 * het scherm gedimd met "Tik op het scherm om te beginnen". Eén tik maakt de tablet wakker, en na die
 * tik start (als dat kan) de korte scan van de demo gezichtsherkenning: tik om te scannen.
 *
 * Verantwoordelijkheid:
 *   - bijhouden wanneer de tablet het laatst is gebruikt (iedere tik, toets, scroll of passcan);
 *   - na STANDBY.idleMs zonder invoer, op de beginpagina zonder open venster, de standby tonen;
 *   - wakker maken: een tik (of Enter of spatie op het standby-scherm) maakt wakker en start de
 *     scan (FaceController.startWakeScan, die zelf controleert of de scan kan). Een andere toets, ook
 *     het eerste teken van een passcan, maakt alleen wakker: de pas wordt daarna gewoon verwerkt;
 *   - voorkomen dat de tik een knop onder het standby-scherm indrukt (geen "klik-door"): de tik valt
 *     op het standby-scherm zelf, en klikken vlak na het wakker worden tellen niet (isStandbyGhostClick);
 *   - één timer (iedere seconde) die ook de vraag na een passcan sluit als niemand antwoordt en eens
 *     per minuut verlopen gezichtsinstellingen wist.
 *
 * De camera gaat hier nooit aan. Alleen wakeFromStandby met `scan: true` (na een bewuste tik) vraagt
 * FaceController om de scan, en die zet de camera na de scantijd altijd weer uit.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, koppelt de events en geeft de methodes en velden door;
 *   - ModalManager (via RegistrationApp): topModal (met een open venster gaat de tablet niet in standby);
 *   - FaceController (via RegistrationApp): startWakeScan en expireFaces;
 *   - RecognitionController (via RegistrationApp): closeFaceOfferIfIdle;
 *   - RegistrationView: showStandby (het gedimde scherm tonen of verbergen);
 *   - config.js: STANDBY (enabled en idleMs).
 */
export class StandbyController {
  // Zo vaak (ms) kijkt de timer of de tablet in standby moet.
  static TICK_MS = 1000;

  // Zo vaak (ms) kijkt de timer of er gezichtsinstellingen zijn verlopen.
  static EXPIRY_CHECK_MS = 60 * 1000;

  // Zo lang (ms) na het wakker worden telt een klik niet (zoals EmployeeController.GHOST_CLICK_MS).
  static GHOST_CLICK_MS = 500;

  // `app` is de controller (RegistrationApp). `clock` levert de tijd en de timer (dezelfde klok als de
  // andere onderdelen, in de unit tests een nep-klok). `settings` is STANDBY uit config.js.
  constructor(app, clock, settings = STANDBY) {
    this.app = app;
    this.clock = clock;
    this.standbySettings = settings;
    this.standbyActive = false;           // staat het gedimde scherm nu in beeld?
    this.lastStandbyActivity = null;      // tijdstip (ms) van de laatste invoer
    this.standbyTimer = null;             // timer die iedere seconde tickStandby aanroept
    this.standbyWokeAt = -Infinity;       // tijdstip (ms) van het laatste wakker worden
    this.lastExpiryCheck = -Infinity;     // tijdstip (ms) van de laatste controle op verlopen gezichten
  }

  get view() {
    return this.app.view;
  }

  // Staat de standby aan in config.js?
  isStandbyEnabled() {
    return Boolean(this.standbySettings?.enabled);
  }

  // Start de timer (één keer, bij het starten van de app, zie RegistrationApp.initialize).
  startStandbyWatch() {
    if (this.standbyTimer !== null) return;
    this.lastStandbyActivity = this.clock.now();
    this.standbyTimer = this.clock.setInterval(() => this.tickStandby(), StandbyController.TICK_MS);
  }

  // Stopt de timer (bijvoorbeeld in een test).
  stopStandbyWatch() {
    if (this.standbyTimer === null) return;
    this.clock.clearInterval(this.standbyTimer);
    this.standbyTimer = null;
  }

  // Wordt iedere seconde aangeroepen: de vraag na een passcan sluiten als niemand antwoordt, eens per
  // minuut verlopen gezichtsinstellingen wissen, en kijken of de tablet in standby moet.
  tickStandby(now = this.clock.now()) {
    this.app.closeFaceOfferIfIdle(now);
    if (now - this.lastExpiryCheck >= StandbyController.EXPIRY_CHECK_MS) {
      this.lastExpiryCheck = now;
      this.app.expireFaces(new Date(now));
    }
    return this.checkStandby(now);
  }

  // Is de tablet op de beginpagina zonder open venster (en zonder productvenster)?
  isHomeIdle() {
    return !this.app.topModal() && !this.app.selectedEmployeeId;
  }

  // Iedere tik, klik, toets, aanraking of scroll op de pagina (zie RegistrationApp.registerStandbyEvents).
  noteStandbyActivity(now = this.clock.now()) {
    this.lastStandbyActivity = now;
  }

  // Gaat de tablet in standby? Dat gebeurt als de standby aan staat, de tablet op de beginpagina is
  // zonder open venster, en er STANDBY.idleMs geen invoer is geweest. Zolang er een venster open is,
  // begint de tijd steeds opnieuw: een venster heeft zijn eigen automatische sluiting (FR-70) en daarna
  // telt de tijd vanaf het sluiten. Geeft true terug als de tablet nu in standby is gegaan.
  checkStandby(now = this.clock.now()) {
    if (!this.isStandbyEnabled() || this.standbyActive) return false;
    if (this.lastStandbyActivity === null || !this.isHomeIdle()) {
      this.lastStandbyActivity = now;
      return false;
    }
    if (now - this.lastStandbyActivity < this.standbySettings.idleMs) return false;
    this.enterStandby();
    return true;
  }

  // Toont het gedimde scherm. Het zoekveld en het bedrijfsfilter worden leeggemaakt (de volgende
  // gebruiker ziet niet naar wie er werd gezocht) en de focus gaat naar het standby-scherm (een knop
  // over het hele scherm), zodat Enter of spatie ook wakker maakt.
  enterStandby() {
    if (this.standbyActive) return;
    this.standbyActive = true;
    this.app.resetEmployeeSearch?.();
    this.view.showStandby?.(true, { hint: this.standbyHint() });
  }

  // De tweede regel op het standby-scherm: wat er na de tik gebeurt. Alleen als de scan kan, staat er
  // vooraf bij dat de camera even kijkt (open over de camera, zie TO hoofdstuk 13).
  standbyHint() {
    const faceDemo = this.app.faceDemo;
    const canScan = faceDemo.isAvailable() && faceDemo.mayHaveCamera?.() !== false &&
      faceDemo.enrolledIds().some((id) => this.app.model.findEmployee(id)?.active);
    const badge = Boolean(this.app.badgeReader?.isEnabled?.());
    if (canScan) {
      const seconds = Math.round(faceDemo.settings.wakeScanMs / 1000);
      return `Na de tik kijkt de camera hooguit ${seconds} seconden of hij je herkent. Alles blijft op deze tablet.${badge ? " Je kunt ook je pas tegen de lezer houden." : ""}`;
    }
    return badge ? "Je kunt ook meteen je pas tegen de lezer houden." : "Daarna kies je je naam in de lijst.";
  }

  // Maakt de tablet wakker. Met `scan: true` (na een tik) start daarna de korte scan, als dat kan.
  // Geeft true terug als de tablet in standby was.
  wakeFromStandby({ scan = false } = {}) {
    if (!this.standbyActive) return false;
    const now = this.clock.now();
    this.standbyActive = false;
    this.standbyWokeAt = now;
    this.lastStandbyActivity = now;
    this.view.showStandby?.(false);
    if (scan) this.app.startWakeScan();
    return true;
  }

  // Een tik of klik op het standby-scherm (ook Enter of spatie, want het is een knop). De tik zelf gaat
  // niet verder naar de pagina: hij valt op het standby-scherm, en niet op een knop eronder.
  handleStandbyTap(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.wakeFromStandby({ scan: true });
  }

  // Een toets terwijl de tablet in standby is. Enter en spatie op het standby-scherm zelf worden een
  // klik op die knop (handleStandbyTap) en starten dus ook de scan. Iedere andere toets, ook het eerste
  // teken van een passcan, maakt alleen wakker. De pas wordt daarna gewoon herkend (BadgeController).
  handleStandbyKey(event) {
    if (!this.standbyActive) return;
    const onOverlay = event?.target?.id === "standbyOverlay";
    if (onOverlay && (event.key === "Enter" || event.key === " ")) return;
    this.wakeFromStandby({ scan: false });
  }

  // Is deze klik een "klik-door" vlak na het wakker worden? Op een touchscreen kan de browser na de tik
  // nog een klik sturen naar wat er onder het (net verborgen) standby-scherm ligt. Een klik binnen
  // GHOST_CLICK_MS na het wakker worden telt daarom niet.
  isStandbyGhostClick(now = this.clock.now()) {
    return now - this.standbyWokeAt < StandbyController.GHOST_CLICK_MS;
  }

  // Click-listener in de capture-fase op de hele pagina: houdt een klik-door tegen.
  swallowStandbyGhostClick(event) {
    if (event?.target?.id === "standbyOverlay" || !this.isStandbyGhostClick()) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }
}
