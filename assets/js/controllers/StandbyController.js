import { STANDBY } from "../config.js";

/**
 * StandbyController — het startscherm van de tablet (sinds versie 3.21). Het startscherm vervangt het
 * gedimde standby-scherm van versie 3.17 tot en met 3.20 als rustscherm. In de code heet de toestand
 * "standby" nog zo: standbyActive betekent dat het startscherm in beeld is.
 *
 * Het startscherm is zwart, met bovenaan klein het TVB-logo, in het midden een ovaal voor het gezicht,
 * daaronder een korte tekst en de knop "Handmatig zoeken". Er zijn drie manieren om te beginnen:
 *   - de pas: werkt altijd, ook op het startscherm (BadgeController). Het startscherm verdwijnt zodra
 *     het venster van de medewerker opent (RecognitionController roept wakeFromStandby aan);
 *   - het gezicht: met FACE_DEMO.scanMode "auto" kijkt de camera in het ovaal en herkent wie er stil in
 *     kijkt (AutoScanController). Met "tap" tikt de medewerker op het ovaal en start de korte scan van
 *     versie 3.17 (FaceController.startWakeScan);
 *   - "Handmatig zoeken": de beginpagina met de lijst, het zoekveld en het bedrijfsfilter.
 *
 * Verantwoordelijkheid:
 *   - het startscherm tonen bij het openen van de website (RegistrationApp.initialize), na afloop van een
 *     registratie of koelkastopening (returnToStartScreen) en na STANDBY.idleMs zonder invoer op de
 *     beginpagina zonder open venster (checkStandby);
 *   - de teksten van het startscherm kiezen naar wat er kan: camera, tikken of alleen pas en handmatig
 *     (startScreenTexts), en ze opnieuw tekenen als dat verandert (refreshStartScreen);
 *   - het startscherm verbergen: met "Handmatig zoeken", met een tik op het ovaal (scanMode "tap") of als
 *     er een venster opent na herkennen (wakeFromStandby);
 *   - bijhouden wanneer de tablet het laatst is gebruikt (iedere tik, toets, scroll of passcan);
 *   - voorkomen dat de tik op "Handmatig zoeken" een knop eronder indrukt (geen "klik-door"): klikken vlak
 *     na het verbergen tellen niet (isStandbyGhostClick);
 *   - één timer (iedere seconde) die ook de vraag na een passcan sluit als niemand antwoordt en eens per
 *     minuut verlopen gezichtsinstellingen wist.
 *
 * De camera wordt hier niet bediend. Na iedere wijziging van het startscherm vraagt deze class
 * AutoScanController (updateAutoScan) om de camera aan of uit te zetten: aan alleen op het startscherm.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, koppelt de events en geeft de methodes en velden door;
 *   - ModalManager (via RegistrationApp): topModal (met een open venster komt het startscherm niet);
 *   - AutoScanController (via RegistrationApp): startScreenMode, updateAutoScan en stopAutoScan;
 *   - FaceController (via RegistrationApp): startWakeScan (scanMode "tap") en expireFaces;
 *   - RecognitionController (via RegistrationApp): closeFaceOfferIfIdle;
 *   - RegistrationView: showStartScreen en renderStartScreen;
 *   - config.js: STANDBY (enabled en idleMs).
 */
export class StandbyController {
  // Zo vaak (ms) kijkt de timer of het startscherm moet verschijnen.
  static TICK_MS = 1000;

  // Zo vaak (ms) kijkt de timer of er gezichtsinstellingen zijn verlopen.
  static EXPIRY_CHECK_MS = 60 * 1000;

  // Zo lang (ms) na het verbergen van het startscherm telt een klik niet (zoals EmployeeController.GHOST_CLICK_MS).
  static GHOST_CLICK_MS = 500;

  // De teksten van het startscherm. `status` staat groot onder het ovaal, `hint` kleiner daaronder en
  // `privacy` onderaan bij het slotje. De uitleg voor een schermlezer maakt startScreenHelp.
  static TEXTS = {
    auto: "Kijk in het ovaal",
    tap: "Tik op het ovaal om je gezicht te laten scannen",
    badge: "Houd je pas tegen de lezer",
    manualOnly: "Tik op Handmatig zoeken om je naam te kiezen",
    orBadge: "Of houd je pas tegen de lezer.",
    noFaces: "Gezichtsherkenning stel je in na een passcan of via de beheerder.",
    privacyAuto: "De camera zoekt alleen een gezicht dichtbij in het ovaal. Er worden geen beelden bewaard of verstuurd."
  };

  // `app` is de controller (RegistrationApp). `clock` levert de tijd en de timer (dezelfde klok als de
  // andere onderdelen, in de unit tests een nep-klok). `settings` is STANDBY uit config.js.
  constructor(app, clock, settings = STANDBY) {
    this.app = app;
    this.clock = clock;
    this.standbySettings = settings;
    this.standbyActive = false;           // staat het startscherm nu in beeld?
    this.lastStandbyActivity = null;      // tijdstip (ms) van de laatste invoer
    this.standbyTimer = null;             // timer die iedere seconde tickStandby aanroept
    this.standbyWokeAt = -Infinity;       // tijdstip (ms) waarop het startscherm het laatst met een tik verdween
    this.lastExpiryCheck = -Infinity;     // tijdstip (ms) van de laatste controle op verlopen gezichten
    this.renderedStartTexts = null;       // de teksten van het startscherm die nu getekend zijn (als JSON)
  }

  get view() {
    return this.app.view;
  }

  // Staat het startscherm aan in config.js?
  isStandbyEnabled() {
    return Boolean(this.standbySettings?.enabled);
  }

  // Start de timer (één keer, bij het starten van de app, zie RegistrationApp.initialize).
  startStandbyWatch() {
    if (this.standbyTimer !== null) return;
    this.lastStandbyActivity = this.clock.now();
    this.standbyTimer = this.clock.setInterval(() => this.tickStandby(), StandbyController.TICK_MS);
  }

  // Stopt de timer (bijvoorbeeld in een test). De camera van het startscherm gaat dan ook uit.
  stopStandbyWatch() {
    if (this.standbyTimer === null) return;
    this.clock.clearInterval(this.standbyTimer);
    this.standbyTimer = null;
    this.app.stopAutoScan?.();
  }

  // Wordt iedere seconde aangeroepen: de vraag na een passcan sluiten als niemand antwoordt, eens per
  // minuut verlopen gezichtsinstellingen wissen, het startscherm bijwerken (bijvoorbeeld als het laatste
  // gezicht is verlopen) en kijken of het startscherm moet verschijnen.
  tickStandby(now = this.clock.now()) {
    this.app.closeFaceOfferIfIdle(now);
    if (now - this.lastExpiryCheck >= StandbyController.EXPIRY_CHECK_MS) {
      this.lastExpiryCheck = now;
      this.app.expireFaces(new Date(now));
    }
    this.refreshStartScreen();
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

  // Moet het startscherm verschijnen? Dat gebeurt als het startscherm aan staat, de tablet op de
  // beginpagina is zonder open venster, en er STANDBY.idleMs geen invoer is geweest. Zolang er een venster
  // open is, begint de tijd steeds opnieuw: een venster heeft zijn eigen automatische sluiting (FR-70) en
  // daarna telt de tijd vanaf het sluiten. Geeft true terug als het startscherm nu is verschenen.
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

  // Toont het startscherm. Het zoekveld en het bedrijfsfilter worden leeggemaakt (de volgende gebruiker
  // ziet niet naar wie er werd gezocht) en de focus gaat naar "Handmatig zoeken" (zie
  // RegistrationView.showStartScreen). Daarna mag de camera aan (AutoScanController.updateAutoScan).
  enterStandby() {
    if (this.standbyActive) return;
    this.standbyActive = true;
    this.app.resetEmployeeSearch?.();
    this.renderedStartTexts = null;
    this.view.showStartScreen?.(true);
    this.refreshStartScreen();
  }

  // Na afloop van een registratie, een koelkastopening of een venster dat vanzelf sluit: het startscherm
  // komt terug, zodat de volgende persoon weer op het startscherm begint. Alleen als het startscherm aan
  // staat, de app draait (de timer loopt, zie startStandbyWatch) en er geen venster meer open is. Geeft
  // true terug als het startscherm nu in beeld is gekomen.
  returnToStartScreen() {
    if (!this.isStandbyEnabled() || this.standbyActive || this.standbyTimer === null) return false;
    if (!this.isHomeIdle()) return false;
    this.enterStandby();
    return true;
  }

  // Tekent de teksten van het startscherm opnieuw als ze zijn veranderd (bijvoorbeeld omdat bekend is
  // geworden dat er geen camera is, de camera niet start of het laatste gezicht is verlopen), en laat
  // AutoScanController de camera aan of uit zetten. Doet niets als het startscherm niet in beeld is.
  // Zolang de teksten gelijk blijven, wordt er niets getekend, zodat de tekst onder het ovaal ("Even stil
  // blijven…") niet iedere seconde wordt teruggezet.
  refreshStartScreen() {
    if (!this.standbyActive) return;
    const texts = this.startScreenTexts();
    const key = JSON.stringify(texts);
    if (key !== this.renderedStartTexts) {
      this.renderedStartTexts = key;
      this.view.renderStartScreen?.(texts);
      // Het ovaal staat na het tekenen weer in de gewone toestand (zie AutoScanController.setScanState).
      if (this.app.scanState !== "recognized") this.app.scanState = "idle";
    }
    this.app.updateAutoScan?.();
  }

  // De teksten van het startscherm, naar wat er kan (AutoScanController.startScreenMode):
  //   - "auto": de camera kijkt in het ovaal ("Kijk in het ovaal");
  //   - "tap": tikken op het ovaal start de korte scan ("Tik op het ovaal om je gezicht te laten scannen");
  //   - "badge": geen gezichtsherkenning (demo uit, geen camera, geen toestemming of niemand ingesteld).
  //     Dan alleen de pas en "Handmatig zoeken".
  // Geeft { mode, status, hint, privacy, help } terug.
  startScreenTexts() {
    const mode = this.app.startScreenMode?.() ?? "badge";
    const badge = Boolean(this.app.badgeReader?.isEnabled?.());
    const { TEXTS } = StandbyController;
    let status = badge ? TEXTS.badge : TEXTS.manualOnly;
    let hint = "";
    let privacy = "";
    if (mode === "auto" || mode === "tap") {
      status = TEXTS[mode];
      hint = badge ? TEXTS.orBadge : "";
      if (mode === "auto") {
        privacy = TEXTS.privacyAuto;
      } else {
        const seconds = Math.round((this.app.faceDemo?.settings?.wakeScanMs ?? 0) / 1000);
        privacy = `Na de tik kijkt de camera hooguit ${seconds} seconden. Alles blijft op deze tablet.`;
      }
    } else if (this.app.faceSetupPossible?.()) {
      hint = TEXTS.noFaces;
    }
    return { mode, status, hint, privacy, help: this.startScreenHelp(mode, badge) };
  }

  // De uitleg van het startscherm voor een schermlezer: met welke manieren je kunt beginnen.
  startScreenHelp(mode, badge) {
    const ways = [];
    if (badge) ways.push("houd je pas tegen de lezer");
    if (mode === "auto") ways.push("kijk in het ovaal om herkend te worden met de camera");
    if (mode === "tap") ways.push("tik op het ovaal om herkend te worden met de camera");
    ways.push("kies Handmatig zoeken om je naam in de lijst te zoeken");
    const list = ways.length > 1 ? `${ways.slice(0, -1).join(", ")} of ${ways.at(-1)}` : ways[0];
    return `Startscherm. Begin zo: ${list}.`;
  }

  // Verbergt het startscherm en toont de beginpagina. Met `scan: true` (een tik op het ovaal, scanMode
  // "tap") start daarna de korte scan, als dat kan. Met `guardClicks: true` (na een tik) tellen klikken
  // vlak daarna niet (zie isStandbyGhostClick). Geeft true terug als het startscherm in beeld was.
  wakeFromStandby({ scan = false, guardClicks = false } = {}) {
    if (!this.standbyActive) return false;
    const now = this.clock.now();
    this.standbyActive = false;
    if (guardClicks) this.standbyWokeAt = now;
    this.lastStandbyActivity = now;
    this.view.showStartScreen?.(false);
    this.app.updateAutoScan?.();
    if (scan) this.app.startWakeScan();
    return true;
  }

  // De knop "Handmatig zoeken" (ook met Enter of spatie, want het is een knop): de beginpagina met de
  // lijst. Met het toetsenbord (event.detail 0) gaat de focus naar het zoekveld. Na een tik niet: dan zou
  // op een tablet het schermtoetsenbord over de lijst schuiven.
  handleManualSearch(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!this.wakeFromStandby({ guardClicks: true })) return;
    if (event?.detail === 0) this.view.$("#employeeSearch")?.focus?.({ preventScroll: true });
  }

  // Een tik op het ovaal (scanMode "tap"): het startscherm verdwijnt en de korte scan start, als die kan.
  // In de andere soorten startscherm is het ovaal geen knop en gebeurt er niets.
  handleStandbyTap(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this.app.startScreenMode?.() !== "tap") return false;
    return this.wakeFromStandby({ scan: true, guardClicks: true });
  }

  // Is deze klik een "klik-door" vlak na het verbergen van het startscherm? Op een touchscreen kan de
  // browser na de tik nog een klik sturen naar wat er onder het (net verborgen) startscherm ligt. Een klik
  // binnen GHOST_CLICK_MS na een tik op het startscherm telt daarom niet.
  isStandbyGhostClick(now = this.clock.now()) {
    return now - this.standbyWokeAt < StandbyController.GHOST_CLICK_MS;
  }

  // Click-listener in de capture-fase op de hele pagina: houdt een klik-door tegen. Een klik op het
  // startscherm zelf telt altijd.
  swallowStandbyGhostClick(event) {
    if (event?.target?.closest?.("#startScreen") || !this.isStandbyGhostClick()) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }
}
