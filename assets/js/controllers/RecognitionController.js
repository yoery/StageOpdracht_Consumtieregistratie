import { FACE_DEMO, RECOGNITION_TARGET } from "../config.js";

/**
 * RecognitionController — wat er gebeurt nadat een medewerker is herkend, met de pas of met de
 * camera (demo), en de vraag "Gezichtsherkenning nog niet ingesteld. Wil je dit?" na een passcan.
 *
 * Na herkennen (continueAfterRecognition):
 *   - RECOGNITION_TARGET "fridge" (standaard): de slimme koelkast gaat open voor deze medewerker (het
 *     slot eraf, de weegschalen tellen wat hij pakt), als de koelkast aan staat en het consumptiepunt
 *     van de medewerker een schapindeling met producten heeft. In het koelkastvenster staat een knop
 *     om in plaats daarvan het productvenster te openen (brood, beleg);
 *   - anders, of met RECOGNITION_TARGET "products": het productvenster, zoals vóór versie 3.17.
 *
 * De vraag na een passcan (afterRecognition met "badge"): heeft een actieve medewerker nog geen
 * geldige gezichtsinstelling en heeft hij niet eerder Nee gezegd, dan komt eerst het venster
 * #faceOfferModal. Alleen als de demo gezichtsherkenning aan staat en de tablet een camera heeft.
 *   - "Ja, instellen": het instelvenster met het toestemmingsvinkje (FaceController). Daarna, of na
 *     Annuleren, gaat de oorspronkelijke flow verder (koelkast of productvenster);
 *   - "Nee": wordt onthouden (RegistrationModel.declineFaceOffer), de vraag komt niet meer terug, en
 *     de flow gaat verder. De medewerker kan het later zelf aanzetten in het productvenster;
 *   - kruisje, Escape of achtergrond: niets onthouden, de flow gaat verder (de vraag komt dus terug);
 *   - niemand antwoordt binnen FACE_DEMO.offerIdleCloseMs: het venster sluit zonder iets te onthouden
 *     en zonder verder te gaan, zodat het niet open blijft staan op de gedeelde tablet.
 * Is de gezichtsinstelling verlopen (na een jaar), dan zegt de vraag "Je gezichtsherkenning is verlopen.
 * Opnieuw instellen?".
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class en geeft de methodes en velden door;
 *   - BadgeController (via RegistrationApp): roept afterRecognition aan na een geldige passcan;
 *   - FaceController (via RegistrationApp): roept continueAfterRecognition aan na herkennen met de
 *     camera, wist verlopen instellingen (expireFaces) en opent het instelvenster;
 *   - FridgeController (via RegistrationApp): canOpenFridgeFor en openFridgeFor;
 *   - EmployeeController (via RegistrationApp): openEmployeeProducts;
 *   - RegistrationModel: hasValidFaceEnrollment, faceOfferAnswer en declineFaceOffer;
 *   - FaceRecognitionDemo: of de demo aan staat en of er een camera is;
 *   - ModalManager (via RegistrationApp): opent en sluit #faceOfferModal;
 *   - config.js: RECOGNITION_TARGET en FACE_DEMO (offerAfterBadge, offerIdleCloseMs).
 */
export class RecognitionController {
  // De titels van de vraag na een passcan en de uitleg in één zin.
  static OFFER_TITLES = {
    new: "Gezichtsherkenning nog niet ingesteld. Wil je dit?",
    expired: "Je gezichtsherkenning is verlopen. Opnieuw instellen?"
  };

  static OFFER_HELP = "Het is vrijwillig, alleen kenmerken van je gezicht (geen foto) worden op deze tablet bewaard en na een jaar vanzelf gewist, en je pas blijft altijd werken.";

  // `app` is de controller (RegistrationApp). `clock` levert de tijd (dezelfde klok als de andere
  // onderdelen). `target` is RECOGNITION_TARGET uit config.js.
  constructor(app, clock, target = RECOGNITION_TARGET) {
    this.app = app;
    this.clock = clock;
    this.recognitionTargetSetting = target;
    this.offerEmployeeId = null;   // voor wie de vraag nu open staat (null = geen vraag open)
    this.offerHow = null;          // hoe die medewerker is herkend ("badge")
    this.offerKind = null;         // "new" of "expired"
    this.lastOfferActivity = null; // tijdstip (ms) van de laatste invoer in het venster van de vraag
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

  // De instellingen van de demo gezichtsherkenning (FACE_DEMO): dezelfde als die van FaceRecognitionDemo,
  // aangevuld met de standaardwaarden uit config.js.
  get offerSettings() {
    return { ...FACE_DEMO, ...this.faceDemo.settings };
  }

  // ------------------------------------------------------------------
  // Na herkennen: koelkast of productvenster
  // ------------------------------------------------------------------

  // Wat er voor deze medewerker opent: "fridge" of "products" (zie het commentaar bovenaan).
  recognitionTarget(employeeId) {
    if (this.recognitionTargetSetting === "fridge" && this.app.canOpenFridgeFor(employeeId)) return "fridge";
    return "products";
  }

  // Een medewerker is herkend (`how`: "badge" of "face"). Na een passcan komt eerst de vraag over
  // gezichtsherkenning als die van toepassing is (shouldOfferFace). Daarna, of meteen, opent de
  // koelkast of het productvenster.
  afterRecognition(employeeId, how) {
    if (how === "badge") {
      this.app.expireFaces();
      const kind = this.shouldOfferFace(employeeId);
      if (kind) {
        this.openFaceOffer(employeeId, how, kind);
        return;
      }
    }
    this.continueAfterRecognition(employeeId, how);
  }

  // Opent de koelkast of het productvenster voor een (nog steeds actieve) medewerker.
  continueAfterRecognition(employeeId, how) {
    if (!this.model.findEmployee(employeeId)?.active) return;
    if (this.recognitionTarget(employeeId) === "fridge" && this.app.openFridgeFor(employeeId, how)) return;
    this.app.openEmployeeProducts(employeeId, { recognizedBy: how });
  }

  // ------------------------------------------------------------------
  // De vraag na een passcan
  // ------------------------------------------------------------------

  // Moet deze medewerker de vraag krijgen? Geeft "new" (nog niet ingesteld), "expired" (verlopen) of
  // null terug. Niet als de vraag uit staat (FACE_DEMO.offerAfterBadge), de demo uit staat of er geen
  // camera is, de medewerker al een geldige instelling heeft of eerder Nee heeft gezegd.
  shouldOfferFace(employeeId, now = new Date(this.clock.now())) {
    if (!this.offerSettings.offerAfterBadge || !this.faceDemo.hasCameraDevice?.()) return null;
    if (!this.model.findEmployee(employeeId)?.active) return null;
    if (this.model.hasValidFaceEnrollment(employeeId, now, this.offerSettings.validityDays)) return null;
    const answer = this.model.faceOfferAnswer(employeeId);
    if (answer === "declined") return null;
    return answer === "expired" ? "expired" : "new";
  }

  // Staat de vraag nu open?
  isFaceOfferOpen() {
    return this.offerEmployeeId !== null;
  }

  // Opent het venster met de vraag, met de begroeting en de uitleg. De focus gaat naar "Nee": wie
  // niets kiest, stelt niets in.
  openFaceOffer(employeeId, how, kind = "new") {
    this.offerEmployeeId = employeeId;
    this.offerHow = how;
    this.offerKind = kind;
    this.lastOfferActivity = this.clock.now();

    const employee = this.model.findEmployee(employeeId);
    this.view.$("#faceOfferTitle").textContent = RecognitionController.OFFER_TITLES[kind];
    this.view.$("#faceOfferGreeting").textContent =
      `${this.view.greeting(new Date())} ${employee?.firstName || employee?.name || ""}. Je bent herkend met je pas.`;
    this.view.$("#faceOfferHelp").textContent = RecognitionController.OFFER_HELP;
    this.app.openModal("#faceOfferModal");
    this.view.$("#faceOfferNoButton")?.focus({ preventScroll: true });
  }

  // Iedere tik of toets in het venster van de vraag (zie RegistrationApp.registerPageEvents).
  noteFaceOfferActivity() {
    if (!this.isFaceOfferOpen()) return;
    this.lastOfferActivity = this.clock.now();
  }

  // Sluit het venster van de vraag en vergeet voor wie het was. Geeft { employeeId, how } terug.
  closeFaceOffer() {
    if (!this.isFaceOfferOpen()) return null;
    const flow = { employeeId: this.offerEmployeeId, how: this.offerHow };
    this.offerEmployeeId = null;
    this.offerHow = null;
    this.offerKind = null;
    this.lastOfferActivity = null;
    this.app.closeModal("#faceOfferModal");
    return flow;
  }

  // "Ja, instellen": het instelvenster met het toestemmingsvinkje. Daarna gaat de flow verder.
  acceptFaceOffer() {
    const flow = this.closeFaceOffer();
    if (!flow) return;
    this.app.startFaceEnrollmentFor(flow.employeeId, () => this.continueAfterRecognition(flow.employeeId, flow.how));
  }

  // "Nee": onthouden (opgeslagen, zonder logboekregel), daarna gaat de flow verder. Lukt opslaan niet,
  // dan meldt persist dat en gaat de flow toch verder: de vraag komt dan de volgende keer terug.
  declineFaceOffer() {
    const flow = this.closeFaceOffer();
    if (!flow) return;
    this.app.persist(() => this.model.declineFaceOffer(flow.employeeId));
    this.continueAfterRecognition(flow.employeeId, flow.how);
  }

  // Kruisje, Escape of een tik op de achtergrond: niets onthouden, de flow gaat wel verder.
  dismissFaceOffer() {
    const flow = this.closeFaceOffer();
    if (flow) this.continueAfterRecognition(flow.employeeId, flow.how);
  }

  // Sluit de vraag als er FACE_DEMO.offerIdleCloseMs geen invoer is geweest (niemand meer bij de
  // tablet). Er wordt niets onthouden en er opent niets. Geeft true terug als de vraag is gesloten.
  closeFaceOfferIfIdle(now = this.clock.now()) {
    if (!this.isFaceOfferOpen()) return false;
    if (now - this.lastOfferActivity < this.offerSettings.offerIdleCloseMs) return false;
    this.closeFaceOffer();
    return true;
  }
}
