/**
 * FaceController — het cameravenster van de demo gezichtsherkenning: herkennen met "Herken mij",
 * de korte scan na een tik op het standby-scherm (tik om te scannen) en een gezicht instellen of
 * uitzetten.
 *
 * Verantwoordelijkheid:
 *   - het cameravenster openen en sluiten, met de juiste teksten en de focus;
 *   - het herkenningsmodel laden en de camera starten en stoppen, ook als het venster intussen
 *     is gesloten (ieder venster krijgt daarvoor een eigen sessienummer);
 *   - zoeken naar een bekend gezicht tot iemand is herkend of de tijd om is. Daarna gaat de camera
 *     altijd uit. Na herkenning bepaalt RecognitionController wat er opent (koelkast of productvenster);
 *   - een gezicht vastleggen, alleen met toestemming (vinkje) en als de camera echt aan staat, en
 *     het opslaan in het model met de datum (persist), met een logboekregel zonder kenmerken;
 *   - de opgeslagen gezichten in het geheugen van FaceRecognitionDemo zetten (loadSavedFaces) en
 *     verlopen gezichtsinstellingen wissen (expireFaces).
 *
 * De camera gaat alleen aan na een bewuste handeling van de medewerker: de knop "Herken mij", de
 * link "Gezichtsherkenning instellen", "Ja, instellen" bij de vraag na een passcan, of een tik op
 * het standby-scherm (startWakeScan). Nooit vanzelf.
 *
 * Verbonden met:
 *   - FaceRecognitionDemo: laadt face-api, bedient de camera en vergelijkt gezichten;
 *   - RegistrationApp: maakt deze class en geeft de methodes en velden door;
 *   - RegistrationModel (via RegistrationApp): slaat de gezichtsinstellingen op en wist ze;
 *   - RecognitionController (via RegistrationApp): opent na herkennen de koelkast of het productvenster;
 *   - EmployeeController (via RegistrationApp): tekent het productvenster opnieuw na instellen of uitzetten;
 *   - ModalManager (via RegistrationApp): opent en sluit het cameravenster;
 *   - RegistrationView: zoekt de elementen op en toont meldingen.
 */
export class FaceController {
  // Meldingen op de beginpagina na de korte scan (tik om te scannen).
  static WAKE_MESSAGES = {
    notRecognized: "Je bent niet herkend. Kies je naam in de lijst of houd je pas tegen de lezer.",
    noCamera: "De camera kon niet starten. Kies je naam in de lijst of houd je pas tegen de lezer."
  };

  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  constructor(app) {
    this.app = app;
    this.faceSession = 0;          // telt op bij ieder openen en sluiten van het cameravenster
    this.faceMode = null;          // "recognize" (Herken mij), "wake" (scan na een tik) of "enroll" (instellen)
    this.faceEmployeeId = null;    // de medewerker voor wie een gezicht wordt ingesteld
    this.cameraReady = false;      // staat de camera echt aan om een gezicht vast te leggen?
    this.captureSession = null;    // sessienummer van het vastleggen dat nu loopt (zie get capturing)
    this.enrollTimer = null;       // time-out die de camera uitzet als er niets wordt vastgelegd (zie scheduleEnrollTimeout)
    this.enrollContinuation = null; // wat er na het instellen verder gaat (na "Ja, instellen" bij de vraag na een passcan)
  }

  // Onderdelen van de app die deze class gebruikt (model, view, faceDemo). Die komen steeds
  // van RegistrationApp, zodat er maar één verwijzing naar ieder onderdeel bestaat.
  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  get faceDemo() {
    return this.app.faceDemo;
  }

  // Wordt er op dit moment een gezicht vastgelegd in het venster dat nu open is?
  // Dat is alleen zo als het vastleggen bij de huidige sessie hoort. Een vastlegging uit een
  // eerder (gesloten) venster mag een opnieuw geopend venster niet blokkeren.
  get capturing() {
    return this.captureSession !== null && this.captureSession === this.faceSession;
  }

  // Heeft minstens één actieve medewerker een ingesteld gezicht (in het geheugen)?
  hasActiveFace() {
    return this.faceDemo.enrolledIds().some((id) => this.model.findEmployee(id)?.active);
  }

  // ------------------------------------------------------------------
  // Opgeslagen gezichten laden en laten verlopen
  // ------------------------------------------------------------------

  // Zet de geldige opgeslagen gezichtsinstellingen (actieve medewerkers, niet verlopen) in het geheugen
  // van FaceRecognitionDemo. Andere gezichten in het geheugen vervallen. Wordt aangeroepen bij het
  // starten, na een wijziging in een ander tabblad, na (de)activeren, verwijderen en wissen.
  loadSavedFaces(now = new Date()) {
    this.faceDemo.loadFaces?.(this.model.validFaceEnrollments(now, this.faceDemo.settings?.validityDays));
  }

  // Wist de gezichtsinstellingen die ouder zijn dan FACE_DEMO.validityDays (een jaar), met één regel
  // in het logboek (alleen de namen, geen kenmerken). Het model onthoudt per medewerker dat zijn
  // instelling is verlopen, zodat de vraag bij de volgende passcan "verlopen" zegt. Ook als opslaan
  // niet lukt, telt een verlopen gezicht nooit meer mee bij herkennen (loadSavedFaces).
  // Geeft de id's van de verlopen medewerkers terug.
  expireFaces(now = new Date()) {
    const days = this.faceDemo.settings?.validityDays;
    const expiredIds = this.model.faceEnrollments
      .filter((entry) => this.model.isFaceEnrollmentExpired(entry, now, days))
      .map(({ employeeId }) => employeeId);
    if (expiredIds.length === 0) return [];

    const names = expiredIds.map((employeeId) => this.app.employeeLabel(employeeId)).join(", ");
    this.app.persist(
      () => { this.model.expireFaceEnrollments(now, days); },
      { action: "Gezichtsherkenning verlopen", details: `${names}: na een jaar gewist` }
    );
    this.loadSavedFaces(now);
    return expiredIds;
  }

  // ------------------------------------------------------------------
  // Het cameravenster openen
  // ------------------------------------------------------------------

  // Knop "Herken mij met de camera (demo)" op de beginpagina.
  // Alleen actieve medewerkers kunnen worden herkend. Is er geen gezicht van een actieve
  // medewerker ingesteld, dan opent de camera niet.
  startFaceRecognition() {
    this.expireFaces();
    if (!this.hasActiveFace()) {
      this.view.showToast(
        "Er is nog niemand ingesteld voor gezichtsherkenning. Kies je naam en zet het aan in het productvenster.",
        { tone: "error", duration: 5000 }
      );
      return;
    }
    this.openFaceModal("recognize");
  }

  // Tik om te scannen: na een tik op het standby-scherm (StandbyController.wakeFromStandby) start een
  // korte scan, maar alleen als de demo aan staat, de tablet misschien een camera heeft en minstens één
  // actieve medewerker een geldige gezichtsinstelling heeft. Anders gebeurt er niets en staat de
  // beginpagina klaar (naam kiezen of pas). Geeft true terug als de scan start.
  startWakeScan() {
    if (!this.faceDemo.isAvailable() || this.faceDemo.mayHaveCamera?.() === false) return false;
    this.expireFaces();
    if (!this.hasActiveFace()) return false;
    this.openFaceModal("wake");
    return true;
  }

  // Link "Gezichtsherkenning instellen (demo)" in het productvenster van een medewerker.
  startFaceEnrollment() {
    this.enrollContinuation = null;
    this.openFaceModal("enroll", this.app.selectedEmployeeId);
  }

  // "Ja, instellen" bij de vraag na een passcan (RecognitionController): het instelvenster voor deze
  // medewerker, zonder productvenster eronder. `continuation` gaat daarna verder met de koelkast of
  // het productvenster, na vastleggen en ook na Annuleren.
  startFaceEnrollmentFor(employeeId, continuation) {
    this.openFaceModal("enroll", employeeId);
    this.enrollContinuation = continuation;
  }

  // Link "Uitzetten": wist de gezichtsinstelling van deze medewerker uit het model (opgeslagen) en
  // uit het geheugen, met de logboekregel "Gezichtsherkenning uitgezet" (zonder kenmerken).
  forgetFace() {
    const employeeId = this.app.selectedEmployeeId;
    const saved = this.app.persist(
      () => { this.model.removeFaceEnrollment(employeeId); },
      { action: "Gezichtsherkenning uitgezet", details: this.app.employeeLabel(employeeId) }
    );
    if (!saved) return;
    this.faceDemo.forget(employeeId);
    this.app.renderProductWindow();
    this.app.focusProductWindowAction();
    this.view.showToast("Gezichtsherkenning staat uit voor deze medewerker. De kenmerken zijn gewist.", { tone: "success" });
  }

  // Toont een statustekst in het cameravenster ("info" of "error").
  setFaceStatus(message, tone = "info") {
    const status = this.view.$("#faceStatus");
    status.textContent = message;
    status.dataset.tone = tone;
  }

  // De teksten van het cameravenster per soort venster.
  faceTexts(mode, name) {
    if (mode === "enroll") {
      return {
        title: `Gezichtsherkenning instellen voor ${name}`,
        help: "Plaats je gezicht binnen het kader. Zet het vinkje en klik op Gezicht vastleggen.",
        close: "Annuleren"
      };
    }
    if (mode === "wake") {
      const seconds = Math.round(this.faceDemo.settings.wakeScanMs / 1000);
      return {
        title: "Even kijken wie je bent",
        help: `Kijk in de camera. Na hooguit ${seconds} seconden gaat de camera weer uit. Alles blijft op deze tablet.`,
        close: "Stoppen"
      };
    }
    return { title: "Herken mij", help: "Plaats je gezicht binnen het kader en kijk recht in de camera.", close: "Annuleren" };
  }

  // Opent het cameravenster om te herkennen ("recognize" of "wake") of om een gezicht in te stellen
  // ("enroll"). Iedere keer openen krijgt een nieuw sessienummer; sluit de gebruiker het venster
  // terwijl er nog geladen wordt, dan ziet de code aan het nummer dat ze moet stoppen.
  async openFaceModal(mode, employeeId = null) {
    this.faceSession += 1;
    const session = this.faceSession;
    this.faceMode = mode;
    this.faceEmployeeId = employeeId;
    this.cameraReady = false;

    const enrolling = mode === "enroll";
    const wake = mode === "wake";
    const texts = this.faceTexts(mode, enrolling ? this.app.employeeLabel(employeeId) : "");
    this.view.$("#faceTitle").textContent = texts.title;
    this.view.$("#faceHelp").textContent = texts.help;
    const closeButton = this.view.$("#faceModal .employee-form-actions [data-close-face-modal]");
    if (closeButton) closeButton.textContent = texts.close;
    this.view.$("#faceModal .face-modal")?.classList.toggle("is-wake", wake);
    this.view.$("#faceConsent").checked = false;
    this.view.$("#faceConsentLabel").classList.toggle("hidden", !enrolling);
    this.view.$("#faceEnrollButton").classList.toggle("hidden", !enrolling);
    this.view.$("#faceEnrollButton").disabled = true;
    this.app.openModal("#faceModal");
    // Focus in het venster: bij instellen op het toestemmingsvinkje, anders op "Annuleren" of "Stoppen".
    // preventScroll: het venster begint bovenaan (openModal) en blijft daar, zodat de titel en het
    // camerabeeld in beeld staan, ook als de knop op een telefoon onder de rand van het scherm valt.
    this.view.$(enrolling ? "#faceConsent" : "#faceModal .employee-form-actions [data-close-face-modal]")?.focus({ preventScroll: true });

    const video = this.view.$("#faceVideo");
    this.setFaceStatus("Herkenningsmodel laden. De eerste keer kan dit even duren.");

    try {
      await this.faceDemo.load();
    } catch (error) {
      if (session !== this.faceSession) return;
      if (wake) {
        this.endWakeScan(FaceController.WAKE_MESSAGES.noCamera);
        return;
      }
      this.setFaceStatus("De demo kon niet worden geladen. Herlaad de pagina en probeer het opnieuw.", "error");
      return;
    }
    if (session !== this.faceSession) return;

    this.setFaceStatus("Camera starten…");
    try {
      // Is het venster gesloten terwijl de camera startte, dan zet startCamera hem zelf weer uit.
      const started = await this.faceDemo.startCamera(video, () => session === this.faceSession);
      if (!started) return;
    } catch (error) {
      // Ging het mis nadat de camera al aan stond (bijvoorbeeld omdat video.play() mislukte),
      // dan wordt de camera hier uitgezet; anders blijft het cameralampje branden.
      // Alleen bij de huidige sessie: is het venster intussen gesloten, dan heeft closeFaceModal
      // de camera al uitgezet, en een nieuw geopend venster moet zijn eigen camera houden.
      if (session === this.faceSession) {
        this.faceDemo.stopCamera(video);
        if (wake) {
          this.endWakeScan(FaceController.WAKE_MESSAGES.noCamera);
          return;
        }
        this.setFaceStatus("Geen toegang tot de camera. Geef toestemming in de browser, of kies je naam in de lijst.", "error");
      }
      return;
    }
    // Is het venster daarna nog gesloten? Dan heeft closeFaceModal de camera al uitgezet.
    if (session !== this.faceSession) return;

    if (enrolling) {
      // Pas nu de camera echt aan staat, kan "Gezicht vastleggen" aan (als het vinkje staat).
      this.cameraReady = true;
      this.updateEnrollButton();
      this.setFaceStatus("Camera staat aan.");
      this.scheduleEnrollTimeout(session);
    } else {
      this.scanForFace(session, wake ? this.faceDemo.settings.wakeScanMs : this.faceDemo.settings.scanTimeoutMs);
    }
  }

  // Zet de knop "Gezicht vastleggen" aan of uit. De knop werkt alleen als de medewerker
  // toestemming heeft gegeven (vinkje) én de camera echt aan staat. Zo kan er niets worden
  // vastgelegd terwijl het model nog laadt of als de camera niet werkt. Tijdens het vastleggen
  // blijft de knop uit, zodat er niet twee keer tegelijk kan worden vastgelegd.
  updateEnrollButton() {
    const consentGiven = this.view.$("#faceConsent").checked;
    this.view.$("#faceEnrollButton").disabled = !(consentGiven && this.cameraReady && !this.capturing);
  }

  // ------------------------------------------------------------------
  // Herkennen
  // ------------------------------------------------------------------

  // Kijkt steeds opnieuw of er een bekend gezicht in beeld is, tot iemand is herkend, het venster
  // wordt gesloten of de tijd om is (`timeoutMs`: FACE_DEMO.scanTimeoutMs bij "Herken mij",
  // FACE_DEMO.wakeScanMs bij de scan na een tik). Na herkenning gaat het venster dicht (de camera
  // gaat uit) en opent RecognitionController de koelkast of het productvenster. Is de tijd om, dan
  // gaat de camera uit (zie stopCameraAfterTimeout). Anders zou de camera blijven filmen tot iemand
  // het venster sluit, ook als de medewerker al is weggelopen. Bij de scan na een tik gaat dan ook het
  // venster dicht, met een korte melding, en staat de beginpagina klaar.
  async scanForFace(session, timeoutMs = this.faceDemo.settings.scanTimeoutMs) {
    const video = this.view.$("#faceVideo");
    const deadline = Date.now() + timeoutMs;
    const wake = this.faceMode === "wake";
    this.setFaceStatus("Zoeken naar een bekend gezicht…");
    this.faceDemo.resetConfirmation();

    while (session === this.faceSession && Date.now() < deadline) {
      const descriptor = await this.faceDemo.readFace(video);
      if (session !== this.faceSession) return;

      // Alleen gezichten van actieve medewerkers die nog bestaan, doen mee (zie findMatch).
      // Pas als dezelfde actieve medewerker twee keer achter elkaar is gevonden, telt het.
      const activeIds = this.model.employees.filter((employee) => employee.active).map((employee) => employee.id);
      const match = descriptor ? this.faceDemo.findMatch(descriptor, activeIds) : null;
      const candidate = match && this.model.findEmployee(match)?.active ? match : null;
      const employeeId = this.faceDemo.confirm(candidate);
      if (employeeId) {
        this.closeFaceModal();
        this.app.continueAfterRecognition(employeeId, "face");
        return;
      }

      let status = "Geen gezicht in beeld. Plaats je gezicht binnen het kader.";
      if (candidate) status = "Bijna herkend. Blijf even rustig in het kader kijken.";
      else if (descriptor) status = "Gezicht gevonden, maar niet herkend. Blijf rustig in het kader kijken.";
      this.setFaceStatus(status);
      await new Promise((resolve) => setTimeout(resolve, Math.min(400, Math.max(0, deadline - Date.now()))));
    }

    if (session !== this.faceSession) return;
    if (wake) {
      this.endWakeScan(FaceController.WAKE_MESSAGES.notRecognized);
      return;
    }
    this.stopCameraAfterTimeout();
    this.setFaceStatus("Niet herkend. De camera is uitgezet. Sluit dit venster en kies je naam in de lijst.", "error");
  }

  // Einde van de scan na een tik zonder herkenning (of zonder camera): de camera gaat uit, het venster
  // dicht en de beginpagina staat klaar, met een korte, vriendelijke melding.
  endWakeScan(message) {
    this.stopCameraAfterTimeout();
    this.closeFaceModal();
    this.view.showToast(message, { duration: 5000 });
  }

  // Zet de camera uit als de tijd om is (bij herkennen en bij instellen), terwijl het venster
  // open blijft met een melding. Het sessienummer gaat omhoog, zodat een lopende zoektocht of
  // vastlegging stopt en een time-out van een eerder venster niets meer doet. "Gezicht
  // vastleggen" kan daarna niet meer (de camera staat uit): de medewerker opent het venster opnieuw.
  stopCameraAfterTimeout() {
    this.faceSession += 1;
    this.cameraReady = false;
    this.faceDemo.stopCamera(this.view.$("#faceVideo"));
    this.updateEnrollButton();
  }

  // ------------------------------------------------------------------
  // Instellen
  // ------------------------------------------------------------------

  // Bij het instellen van een gezicht staat de camera aan tot de medewerker op "Gezicht vastleggen"
  // klikt. Gebeurt dat niet binnen FACE_DEMO.scanTimeoutMs (bijvoorbeeld omdat de medewerker is
  // weggelopen), dan gaat de camera uit. `session` is het venster waarvoor de tijd loopt: is dat
  // venster intussen gesloten of opnieuw geopend, dan doet de time-out niets. Tijdens het
  // vastleggen wordt gewacht tot dat klaar is. closeFaceModal ruimt de wachtende time-out op.
  // Kwam het instellen van de vraag na een passcan (er staat geen venster onder), dan gaat het
  // venster ook dicht, zonder verder te gaan: de medewerker is waarschijnlijk weggelopen.
  scheduleEnrollTimeout(session) {
    const check = () => {
      this.enrollTimer = null;
      if (session !== this.faceSession) return;
      if (this.capturing) {
        this.enrollTimer = setTimeout(check, 500);
        return;
      }
      this.stopCameraAfterTimeout();
      if (this.enrollContinuation) {
        this.closeFaceModal({ continueFlow: false });
        this.view.showToast("De tijd is om en de camera is uitgezet. Er is niets ingesteld.", { tone: "error", duration: 5000 });
        return;
      }
      this.setFaceStatus("De tijd is om en de camera is uitgezet. Sluit dit venster en probeer het opnieuw.", "error");
    };
    clearTimeout(this.enrollTimer);
    this.enrollTimer = setTimeout(check, this.faceDemo.settings.scanTimeoutMs);
  }

  // Het sessienummer van het vastleggen wordt bewaard in captureSession. "capturing" (zie de
  // getter bovenaan) is alleen waar als dat nummer bij het venster hoort dat nu open is.
  // Na het vastleggen wordt de descriptor (alleen de 128 getallen) met de datum van vandaag in het
  // model opgeslagen (persist), met de logboekregel "Gezichtsherkenning ingesteld" zonder kenmerken.
  async captureEnrollment() {
    if (this.capturing) return;

    const session = this.faceSession;
    this.captureSession = session;
    this.updateEnrollButton();
    this.setFaceStatus("Gezicht vastleggen…");

    // Het gezicht lezen kan even duren; "capturing" staat ondertussen aan en gaat daarna
    // (ook als het misgaat of het venster sluit) altijd weer uit. Is er intussen in een nieuw
    // venster een nieuwe vastlegging gestart, dan blijft die van het nieuwe venster staan.
    let descriptor = null;
    try {
      descriptor = await this.readFaceForEnrollment(session);
    } finally {
      if (this.captureSession === session) this.captureSession = null;
    }

    // Is het venster intussen gesloten (en misschien al opnieuw geopend)? Dan niets onthouden,
    // maar de knop van het nieuwe venster wel weer goed zetten.
    if (session !== this.faceSession) {
      this.updateEnrollButton();
      return;
    }

    if (!descriptor || !this.model.isValidDescriptor(descriptor)) {
      this.setFaceStatus("Geen gezicht gevonden. Plaats je gezicht binnen het kader en probeer het opnieuw.", "error");
      this.updateEnrollButton();
      return;
    }

    if (!this.view.$("#faceConsent").checked) {
      this.setFaceStatus("Er is niets vastgelegd, omdat het vinkje voor toestemming niet meer staat.", "error");
      this.updateEnrollButton();
      return;
    }

    const employeeId = this.faceEmployeeId;
    const name = this.app.employeeLabel(employeeId);
    const saved = this.app.persist(
      () => this.model.saveFaceEnrollment(employeeId, descriptor),
      { action: "Gezichtsherkenning ingesteld", details: name }
    );
    if (!saved) {
      this.setFaceStatus("Het gezicht kon niet worden opgeslagen. Er is niets ingesteld.", "error");
      this.updateEnrollButton();
      return;
    }

    this.faceDemo.enroll(employeeId, Array.from(descriptor));
    const fromOffer = Boolean(this.enrollContinuation);
    this.closeFaceModal();
    if (!fromOffer) {
      this.app.renderProductWindow();
      this.app.focusProductWindowAction();
    }
    this.view.showToast(`Gezichtsherkenning staat aan voor ${name}. Na een jaar wordt het vanzelf gewist.`, { tone: "success", duration: 4000 });
  }

  // Probeert een paar keer een gezicht te lezen voor het instellen. Geeft de descriptor terug,
  // of null als er geen gezicht is gevonden of als het venster intussen is gesloten.
  async readFaceForEnrollment(session) {
    const video = this.view.$("#faceVideo");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const descriptor = await this.faceDemo.readFace(video);
      if (session !== this.faceSession) return null;
      if (descriptor) return descriptor;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return null;
  }

  // Sluit het cameravenster en zet de camera uit. Een lopende zoektocht stopt vanzelf,
  // omdat het sessienummer verandert. De focus gaat terug naar de knop of link waarmee het
  // venster werd geopend (zie closeModal).
  // Kwam het instellen van de vraag na een passcan, dan gaat de oorspronkelijke flow daarna verder
  // (koelkast of productvenster), na vastleggen en ook na Annuleren, Escape of het kruisje. Met
  // `continueFlow: false` (wissen in een ander tabblad, of de tijd is om) gaat er niets verder.
  // Bij een klik op het kruisje of de achtergrond krijgt deze methode het klikevent mee; dat telt
  // als gewoon sluiten.
  closeFaceModal(options) {
    this.faceSession += 1;
    this.cameraReady = false;
    clearTimeout(this.enrollTimer);
    this.enrollTimer = null;
    this.faceDemo.stopCamera(this.view.$("#faceVideo"));
    this.app.closeModal("#faceModal");

    const continuation = this.enrollContinuation;
    this.enrollContinuation = null;
    if (continuation && options?.continueFlow !== false) continuation();
  }
}
