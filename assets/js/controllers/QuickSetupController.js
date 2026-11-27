import { ControllerPart } from "./ControllerPart.js";
import { FACE_DEMO } from "../config.js";

/**
 * QuickSetupController — "Snellere optie instellen" (besluit van de administratie van 25 november 2026,
 * punt 3 tot en met 7, FR-100).
 *
 * TVB levert geen foto's. Iedereen begint daarom met zichzelf opzoeken. In het productvenster staat
 * daarna de vraag of hij sneller wil registreren: met gezichtsherkenning, met zijn pasje of met
 * allebei. Wie dat niet wil, kiest "Nee, liever niet". De vraag komt dan pas na een jaar terug.
 * Een gezicht is een jaar geldig. Daarna zijn de kenmerken gewist en komt de vraag opnieuw.
 *
 * Alleen met een server (de echte app). In de demo blijft het zoals het was: instellen na de pas of
 * via de beheerder (FR-87, FR-88).
 *
 * Controle: geen. TVB heeft op 26 november 2026 gekozen om niet te controleren of iemand echt
 * zichzelf heeft gekozen. Iemand kan dus de naam van een collega kiezen en daar zijn eigen gezicht of
 * pas aan koppelen. Iedere koppeling komt in het logboek, met de naam, en de beheerder kan haar
 * terugdraaien. Zie het TO, hoofdstuk 13, voor dit bewust geaccepteerde risico.
 *
 * Verbonden met:
 *   - EmployeeController.renderProductWindow: vraagt `quickSetupState` voor de regel in het venster;
 *   - FaceController.startQuickFaceEnrollment: het cameravenster voor het gezicht;
 *   - BadgeController.recognizeBadge: geeft een scan door aan `linkScannedBadge` zolang het venster
 *     "Houd je pas tegen de lezer" open is.
 */
export class QuickSetupController extends ControllerPart {
  static TEXTS = {
    offer: "Sneller registreren? Stel gezichtsherkenning of je pasje in.",
    expired: "Je gezichtsherkenning is na een jaar verlopen. Stel hem opnieuw in.",
    declined: "Prima. We vragen het over een jaar opnieuw.",
    badgeLinked: "Je pas is gekoppeld. Voortaan houd je je pas tegen de lezer.",
    badgeTaken: "Deze pas is al gekoppeld aan iemand anders. Vraag het de beheerder.",
    badgeFailed: "De pas kon niet worden gekoppeld. Probeer het opnieuw."
  };

  // Hoe lang "Nee, liever niet" geldt, in dagen.
  static DECLINE_DAYS = 365;

  constructor(app) {
    super(app);
    this.quickSetupEmployeeId = null;    // voor wie het keuzevenster open is
    this.badgeLinkEmployeeId = null;     // voor wie "Houd je pas tegen de lezer" open is
  }

  // ------------------------------------------------------------------
  // Wat kan er voor deze medewerker?
  // ------------------------------------------------------------------

  // Welke snellere opties kan deze medewerker nog instellen? Een gezicht als de gezichtsherkenning aan
  // staat, er een camera kan zijn en hij nog geen geldig gezicht heeft. Een pas als de pasjeslezer aan
  // staat en hij nog geen pas heeft. Een gast en een inactieve medewerker: niets.
  quickSetupOptions(employeeId, now = new Date()) {
    const employee = this.model.findEmployee(employeeId);
    if (!this.app.server || !employee?.active || employee.guest) return { face: false, badge: false };
    const face = this.app.faceSetupState?.() === "ready" &&
      !this.model.hasValidFaceEnrollment(employeeId, now, FACE_DEMO.validityDays);
    // Met een server kent de tablet het pasnummer niet, alleen of er een pas is (badgeLinked).
    const badge = Boolean(this.app.badgeReader?.isEnabled?.()) && !employee.badgeId && !employee.badgeLinked;
    return { face, badge };
  }

  // Wat staat er in het productvenster: null (niets), "offer" (de vraag) of "expired" (de vraag, want
  // het gezicht is verlopen). Na "Nee, liever niet" een jaar lang niets.
  quickSetupState(employeeId, now = new Date()) {
    const { face, badge } = this.quickSetupOptions(employeeId, now);
    if (!face && !badge) return null;
    if (this.model.declinedQuickSetup(employeeId, now, QuickSetupController.DECLINE_DAYS)) return null;
    return face && this.model.faceOfferAnswer(employeeId) === "expired" ? "expired" : "offer";
  }

  // ------------------------------------------------------------------
  // Kiezen
  // ------------------------------------------------------------------

  // Knop "Snellere optie instellen" in het productvenster: het keuzevenster met alleen de opties die kunnen.
  openQuickSetup() {
    const employeeId = this.app.selectedEmployeeId;
    const { face, badge } = this.quickSetupOptions(employeeId);
    if (!face && !badge) return false;

    this.quickSetupEmployeeId = employeeId;
    this.view.$("#quickSetupName").textContent = this.model.findEmployee(employeeId).name;
    this.view.$("#quickSetupFace").classList.toggle("hidden", !face);
    this.view.$("#quickSetupBadge").classList.toggle("hidden", !badge);
    this.view.$("#quickSetupBoth").classList.toggle("hidden", !(face && badge));
    this.app.openModal("#quickSetupModal");
    return true;
  }

  closeQuickSetup() {
    this.quickSetupEmployeeId = null;
    this.app.closeModal("#quickSetupModal");
  }

  // Een keuze in het keuzevenster: "face", "badge" of "both". Bij allebei eerst het gezicht, daarna de pas.
  chooseQuickSetup(choice) {
    const employeeId = this.quickSetupEmployeeId;
    if (!employeeId) return;
    this.closeQuickSetup();

    if (choice === "badge") {
      this.startBadgeLink(employeeId);
      return;
    }
    const afterFace = choice === "both" ? () => this.startBadgeLink(employeeId) : null;
    this.app.startQuickFaceEnrollment(employeeId, afterFace);
  }

  // "Nee, liever niet": een jaar geen vraag meer. Het logboek krijgt de naam.
  declineQuickSetup() {
    const employeeId = this.app.selectedEmployeeId;
    const employee = this.model.findEmployee(employeeId);
    if (!employee) return;
    const saved = this.app.persist(
      () => this.model.setFaceOfferAnswer(employeeId, "declined"),
      { action: "Snellere optie afgewezen", details: employee.name }
    );
    if (!saved) return;
    this.app.renderProductWindow();
    this.view.showToast(QuickSetupController.TEXTS.declined, { tone: "success" });
  }

  // ------------------------------------------------------------------
  // De pas koppelen
  // ------------------------------------------------------------------

  // De pas koppelen via de server. Zolang het verzoek loopt, telt een tweede scan niet. Lukt het niet
  // (de pas hoort bij iemand anders, of geen verbinding), dan blijft het venster open met de reden.
  async linkBadgeOnServer(employeeId, code) {
    if (this.linking) return;
    this.linking = true;
    this.view.$("#badgeLinkStatus").textContent = "";
    let result;
    try {
      result = await this.app.server.linkBadge(employeeId, code);
    } finally {
      this.linking = false;
    }
    if (this.badgeLinkEmployeeId !== employeeId) return; // het venster is intussen gesloten
    if (!result.ok) {
      this.view.$("#badgeLinkStatus").textContent = result.message;
      return;
    }

    this.badgeLinkEmployeeId = null;
    this.app.closeModal("#badgeLinkModal");
    if (this.app.selectedEmployeeId === employeeId) this.app.renderProductWindow();
    this.view.showToast(QuickSetupController.TEXTS.badgeLinked, { tone: "success", duration: 5000 });
  }

  // Opent "Houd je pas tegen de lezer". Zolang dit venster open is, koppelt een scan de pas.
  startBadgeLink(employeeId) {
    if (!this.quickSetupOptions(employeeId).badge) return false;
    this.badgeLinkEmployeeId = employeeId;
    this.view.$("#badgeLinkName").textContent = this.model.findEmployee(employeeId).name;
    this.view.$("#badgeLinkStatus").textContent = "";
    this.app.openModal("#badgeLinkModal");
    return true;
  }

  cancelBadgeLink() {
    this.badgeLinkEmployeeId = null;
    this.app.closeModal("#badgeLinkModal");
  }

  // Een scan terwijl "Houd je pas tegen de lezer" open is (BadgeController.recognizeBadge). Geeft
  // true terug als de scan hier is afgehandeld.
  linkScannedBadge(code) {
    const employeeId = this.badgeLinkEmployeeId;
    if (!employeeId) return false;

    // Met een server koppelt de server de pas. Alleen de server weet of de pas al bij iemand anders
    // hoort (de tablet kent de pasnummers van anderen niet). Het logboek schrijft de server zelf.
    if (typeof this.app.server?.linkBadge === "function") {
      this.linkBadgeOnServer(employeeId, code);
      return true;
    }

    if (this.model.isBadgeTaken(code, employeeId)) {
      this.view.$("#badgeLinkStatus").textContent = QuickSetupController.TEXTS.badgeTaken;
      return true;
    }
    const employee = this.model.findEmployee(employeeId);
    const saved = this.app.persist(
      () => this.model.updateEmployee(employeeId, { ...employee, badgeId: code }),
      // Het pasnummer zelf komt niet in het logboek.
      { action: "Pas gekoppeld door medewerker", details: employee.name }
    );
    if (!saved) {
      this.view.$("#badgeLinkStatus").textContent = QuickSetupController.TEXTS.badgeFailed;
      return true;
    }

    this.badgeLinkEmployeeId = null;
    this.app.closeModal("#badgeLinkModal");
    if (this.app.selectedEmployeeId === employeeId) this.app.renderProductWindow();
    this.view.showToast(QuickSetupController.TEXTS.badgeLinked, { tone: "success", duration: 5000 });
    return true;
  }
}
