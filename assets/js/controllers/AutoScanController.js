import { FACE_DEMO } from "../config.js";
import { FaceIntent } from "../FaceIntent.js";

/**
 * AutoScanController — het automatisch scannen op het startscherm (demo gezichtsherkenning,
 * FACE_DEMO.scanMode "auto", sinds versie 3.21). Wie stil in het ovaal kijkt, wordt zonder tik herkend.
 *
 * De camera staat alleen aan als alles hiervan klopt (shouldAutoScan):
 *   - de app draait (de timer van StandbyController loopt) en het startscherm is in beeld;
 *   - FACE_DEMO.enabled staat aan en FACE_DEMO.scanMode is "auto";
 *   - de tablet heeft zeker een camera (detectCamera vond er een) en die is niet eerder geweigerd of
 *     mislukt. Zolang niet bekend is of er een camera is, blijft hij uit (bij "tap" mag de tik het proberen);
 *   - minstens één actieve medewerker heeft een geldige gezichtsinstelling (anders is er niemand te
 *     herkennen en is de camera niet nodig);
 *   - het tabblad is zichtbaar (visibilitychange);
 *   - er wordt niet net iemand begroet.
 * In alle andere gevallen staat hij uit: na "Handmatig zoeken", bij ieder venster (koelkast,
 * productvenster, beheer, de vraag na een passcan), in een verborgen tabblad, zonder camera of
 * toestemming, met FACE_DEMO uit of als niemand een gezicht heeft ingesteld.
 *
 * Het scannen (scanTick, FACE_DEMO.autoScan.detectIntervalMs, 3 keer per seconde):
 *   1. de camera zoekt alleen gezichten, zonder kenmerken (FaceRecognitionDemo.detectFaces);
 *   2. FaceIntent beslist of de intentie-drempel is gehaald: precies één gezicht dichtbij, met het midden
 *      in het ovaal, dat ongeveer een seconde stil staat. Het ovaal wordt groen met "Even stil blijven…";
 *   3. pas dan worden de kenmerken van dat ene gezicht berekend (FaceRecognitionDemo.describeFace) en
 *      vergeleken met de actieve medewerkers. Dezelfde medewerker moet twee keer achter elkaar worden
 *      gevonden (FaceRecognitionDemo.confirm);
 *   4. herkend: de camera gaat uit, het ovaal toont de begroeting ("Goedemorgen Lotte.") en na
 *      autoScan.greetingMs opent RecognitionController de koelkast of het productvenster;
 *   5. na autoScan.attempts vergelijkingen zonder resultaat, terwijl het gezicht in het ovaal blijft:
 *      "Je bent niet herkend. Houd je pas tegen de lezer of zoek handmatig." en een pauze van
 *      autoScan.retryPauseMs. Daarna probeert hij het opnieuw.
 * Er worden geen beelden bewaard of verstuurd. Een mislukte start van de camera geeft geen melding in de
 * console: het startscherm toont dan alleen de pas en "Handmatig zoeken".
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class en geeft de methodes en velden door;
 *   - StandbyController (via RegistrationApp): standbyActive, standbyTimer en refreshStartScreen;
 *   - FaceIntent: de intentie-drempel;
 *   - FaceRecognitionDemo: camera, detectFaces, describeFace, findMatch en confirm;
 *   - FaceController (via RegistrationApp): hasActiveFace en expireFaces;
 *   - RecognitionController (via RegistrationApp): continueAfterRecognition na herkennen;
 *   - RegistrationView: setStartScreenCamera en setStartScreenState (het ovaal en de tekst eronder);
 *   - config.js: FACE_DEMO (enabled, scanMode en autoScan).
 */
export class AutoScanController {
  // De teksten onder het ovaal tijdens het scannen.
  static MESSAGES = {
    multiple: "Graag één persoon tegelijk",
    steady: "Even stil blijven…",
    notRecognized: "Je bent niet herkend. Houd je pas tegen de lezer of zoek handmatig.",
    notRecognizedNoBadge: "Je bent niet herkend. Zoek je naam met Handmatig zoeken."
  };

  // `app` is de controller (RegistrationApp). `clock` levert de tijd en de timers (dezelfde klok als de
  // andere onderdelen, in de unit tests een nep-klok).
  constructor(app, clock) {
    this.app = app;
    this.clock = clock;
    this.scanSession = 0;          // telt op bij iedere start en stop van de camera
    this.scanCamera = "off";       // "off", "starting" (camera start), "loading" (camera aan, model laadt) of "on"
    this.scanTimer = null;         // de timer die scanTick aanroept zolang de camera aan staat
    this.scanBusy = false;         // loopt er nog een scanTick (de vorige is nog niet klaar)?
    this.scanAttempts = 0;         // vergelijkingen zonder resultaat met het gezicht in het ovaal
    this.scanPausedUntil = 0;      // tijdstip (ms) tot wanneer de pauze na "niet herkend" duurt
    this.scanState = "idle";       // wat het ovaal nu toont: idle, multiple, steady, recognized of unknown
    this.cameraBlocked = false;    // is het starten van de camera mislukt (geen camera of geen toestemming)?
    this.greetingTimer = null;     // time-out tussen de begroeting en het openen van het venster
    this.greetingFor = null;       // de medewerker die nu wordt begroet
    this.descriptorCount = 0;      // hoe vaak er kenmerken zijn berekend (voor de tests en het TO)
    this.intent = new FaceIntent(this.autoSettings);
  }

  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  get faceDemo() {
    return this.app.faceDemo;
  }

  // De instellingen van de demo (FACE_DEMO), aangevuld met de standaardwaarden uit config.js.
  get scanSettings() {
    return { ...FACE_DEMO, ...this.faceDemo.settings };
  }

  // De instellingen van het automatisch scannen (FACE_DEMO.autoScan).
  get autoSettings() {
    return { ...FACE_DEMO.autoScan, ...this.faceDemo.settings?.autoScan };
  }

  // "auto" of "tap" (FACE_DEMO.scanMode). Alles behalve "tap" telt als "auto".
  scanMode() {
    return this.scanSettings.scanMode === "tap" ? "tap" : "auto";
  }

  // Kan de camera iemand herkennen? De demo staat aan, minstens één actieve medewerker heeft een gezicht
  // ingesteld en er is een camera die niet eerder is geweigerd. Bij "auto" moet zeker zijn dat er een
  // camera is (detectCamera), zodat een tablet zonder camera de bibliotheek nooit laadt. Bij "tap" mag
  // de tik het proberen als niet zeker is dat er geen camera is (zoals in versie 3.17).
  canUseFace() {
    const camera = this.scanMode() === "auto" ? this.faceDemo.hasCameraDevice?.() === true : this.faceDemo.mayHaveCamera?.() !== false;
    return this.faceDemo.isAvailable() && camera && !this.cameraBlocked && this.app.hasActiveFace();
  }

  // Kan een medewerker gezichtsherkenning instellen (demo aan en een camera), terwijl nog niemand dat heeft
  // gedaan? Dan zegt het startscherm hoe dat moet.
  faceSetupPossible() {
    return this.faceDemo.isAvailable() && this.faceDemo.mayHaveCamera?.() !== false &&
      !this.cameraBlocked && !this.app.hasActiveFace();
  }

  // Welke soort startscherm: "auto" (de camera kijkt), "tap" (tik op het ovaal) of "badge" (alleen de pas
  // en "Handmatig zoeken").
  startScreenMode() {
    if (!this.canUseFace()) return "badge";
    return this.scanMode();
  }

  // Is het tabblad verborgen (een ander tabblad of de tablet vergrendeld)?
  static isPageHidden() {
    const document = globalThis.document;
    return document?.visibilityState === "hidden" || document?.hidden === true;
  }

  // Moet de camera nu aan staan? Zie het commentaar bovenaan.
  shouldAutoScan() {
    return Boolean(this.app.standbyActive) && this.app.standbyTimer !== null && this.greetingFor === null &&
      this.scanMode() === "auto" && this.canUseFace() && !AutoScanController.isPageHidden();
  }

  // Zet de camera aan of uit, naar shouldAutoScan. Wordt aangeroepen als het startscherm verschijnt of
  // verdwijnt, iedere seconde (StandbyController.tickStandby) en als het tabblad zichtbaar of verborgen wordt.
  updateAutoScan() {
    const should = this.shouldAutoScan();
    if (should && this.scanCamera === "off") this.startAutoScan();
    else if (!should && this.scanCamera !== "off") this.stopAutoScan();
    return should;
  }

  // Start de camera in een lage resolutie, laadt daarna het herkenningsmodel en start de timer van
  // scanTick. Eerst de camera: zonder camera of toestemming wordt de bibliotheek dan niet geladen. Gaat het
  // mis (geen camera, geen toestemming, het model laadt niet), dan blijft de camera de rest van de sessie
  // uit en toont het startscherm alleen de pas en "Handmatig zoeken". Zonder melding in de console.
  async startAutoScan() {
    this.scanSession += 1;
    const session = this.scanSession;
    this.scanCamera = "starting";
    const video = this.view.$("#startVideo");
    const { videoWidth, videoHeight } = this.autoSettings;
    try {
      const started = await this.faceDemo.startCamera(video, () => session === this.scanSession, { width: videoWidth, height: videoHeight });
      if (!started || session !== this.scanSession) return;
      this.scanCamera = "loading";
      await this.faceDemo.load();
      if (session !== this.scanSession) return;
    } catch (error) {
      if (session !== this.scanSession) return;
      this.scanCamera = "off";
      this.cameraBlocked = true;
      this.faceDemo.stopCamera(video);
      this.app.refreshStartScreen();
      return;
    }

    this.scanCamera = "on";
    this.resetScan();
    this.scanState = null; // het ovaal begint altijd in de gewone toestand, ook na een begroeting
    this.setScanState("idle");
    this.view.setStartScreenCamera?.(true);
    this.scanTimer = this.clock.setInterval(() => this.scanTick(), this.autoSettings.detectIntervalMs);
  }

  // Zet de camera van het startscherm uit en stopt het scannen. Een tick die nog loopt, stopt vanzelf,
  // omdat het sessienummer verandert. De camera van het cameravenster (#faceVideo) wordt niet aangeraakt.
  stopAutoScan() {
    this.scanSession += 1;
    if (this.scanTimer !== null) this.clock.clearInterval(this.scanTimer);
    this.scanTimer = null;
    if (this.scanCamera === "on" || this.scanCamera === "loading") this.faceDemo.stopCamera(this.view.$("#startVideo"));
    const wasOn = this.scanCamera !== "off";
    this.scanCamera = "off";
    this.scanBusy = false;
    if (wasOn) this.view.setStartScreenCamera?.(false);
  }

  // Begint opnieuw: geen pogingen, geen pauze en het stilstaan opnieuw.
  resetScan() {
    this.scanAttempts = 0;
    this.scanPausedUntil = 0;
    this.intent.settings = this.autoSettings;
    this.intent.reset();
    this.faceDemo.resetConfirmation();
  }

  // Toont in het ovaal en de tekst eronder wat er gebeurt. Alleen als het verandert, zodat een schermlezer
  // de tekst één keer voorleest. `text` is leeg voor de gewone tekst van het startscherm.
  setScanState(state, text = "") {
    if (state === this.scanState && state !== "recognized") return;
    this.scanState = state;
    this.view.setStartScreenState?.(state, text || this.app.startScreenTexts?.().status || "");
  }

  // Eén keer kijken (iedere detectIntervalMs). Tijdens de pauze na "niet herkend" wordt er niet gekeken.
  async scanTick(now = this.clock.now()) {
    if (this.scanBusy || this.scanCamera !== "on") return;
    if (now < this.scanPausedUntil) return;
    if (this.scanState === "unknown") this.setScanState("idle");

    const session = this.scanSession;
    this.scanBusy = true;
    try {
      const frame = await this.faceDemo.detectFaces(this.view.$("#startVideo"));
      if (session !== this.scanSession) return;
      const { state, face } = this.intent.update(frame, now);
      if (state === "ready") {
        await this.recognizeFace(face, session);
        return;
      }
      if (state === "settling") {
        this.setScanState("steady", AutoScanController.MESSAGES.steady);
        return;
      }
      // Geen gezicht dichtbij in het ovaal: opnieuw beginnen met tellen.
      this.scanAttempts = 0;
      this.faceDemo.resetConfirmation();
      if (state === "multiple") this.setScanState("multiple", AutoScanController.MESSAGES.multiple);
      else this.setScanState("idle");
    } finally {
      if (session === this.scanSession) this.scanBusy = false;
    }
  }

  // De intentie-drempel is gehaald: alleen nu worden de kenmerken van dit ene gezicht berekend en
  // vergeleken met de actieve medewerkers (zoals FaceController.scanForFace).
  async recognizeFace(face, session) {
    this.setScanState("steady", AutoScanController.MESSAGES.steady);
    this.descriptorCount += 1;
    const descriptor = await this.faceDemo.describeFace(this.view.$("#startVideo"), face);
    if (session !== this.scanSession) return;

    const activeIds = this.model.employees.filter((employee) => employee.active).map((employee) => employee.id);
    const match = descriptor ? this.faceDemo.findMatch(descriptor, activeIds) : null;
    const candidate = match && this.model.findEmployee(match)?.active ? match : null;
    const employeeId = this.faceDemo.confirm(candidate);
    if (employeeId) {
      this.greet(employeeId);
      return;
    }
    if (candidate) return; // één keer gevonden: bij de volgende keer kijken telt de bevestiging

    this.scanAttempts += 1;
    if (this.scanAttempts >= this.autoSettings.attempts) this.pauseAfterUnknown();
  }

  // Niet herkend na autoScan.attempts keer: een vriendelijke melding en een pauze.
  pauseAfterUnknown(now = this.clock.now()) {
    const badge = Boolean(this.app.badgeReader?.isEnabled?.());
    const { MESSAGES } = AutoScanController;
    this.setScanState("unknown", badge ? MESSAGES.notRecognized : MESSAGES.notRecognizedNoBadge);
    this.resetScan();
    this.scanPausedUntil = now + this.autoSettings.retryPauseMs;
  }

  // Herkend: de camera gaat meteen uit, het ovaal toont de begroeting en na greetingMs opent de koelkast
  // of het productvenster (RecognitionController.continueAfterRecognition, die het startscherm verbergt).
  // Is het startscherm intussen verdwenen (bijvoorbeeld met "Handmatig zoeken"), dan opent er niets.
  greet(employeeId) {
    this.greetingFor = employeeId;
    this.stopAutoScan();
    const employee = this.model.findEmployee(employeeId);
    this.setScanState("recognized", `${this.view.greeting?.(new Date(this.clock.now())) ?? "Hallo"} ${employee?.firstName || employee?.name || ""}.`);

    const open = () => {
      this.greetingTimer = null;
      this.greetingFor = null;
      this.scanState = "idle";
      if (!this.app.standbyActive) return;
      this.app.continueAfterRecognition(employeeId, "face");
    };
    const delay = this.autoSettings.greetingMs;
    if (!delay) {
      open();
      return;
    }
    const setTimer = this.clock.setTimeout ? this.clock.setTimeout.bind(this.clock) : setTimeout;
    this.greetingTimer = setTimer(open, delay);
  }

  // Breekt een begroeting af die nog loopt (bijvoorbeeld als alle gegevens in een ander tabblad worden gewist).
  cancelGreeting() {
    if (this.greetingTimer === null) return;
    const clearTimer = this.clock.clearTimeout ? this.clock.clearTimeout.bind(this.clock) : clearTimeout;
    clearTimer(this.greetingTimer);
    this.greetingTimer = null;
    this.greetingFor = null;
    this.scanState = "idle";
  }
}
