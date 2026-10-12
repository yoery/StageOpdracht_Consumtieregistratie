/**
 * FaceController — het cameravenster van de demo gezichtsherkenning: herkennen met "Herken mij"
 * en een gezicht instellen of uitzetten vanuit het productvenster.
 *
 * Verantwoordelijkheid:
 *   - het cameravenster openen en sluiten, met de juiste teksten en de focus;
 *   - het herkenningsmodel laden en de camera starten en stoppen, ook als het venster intussen
 *     is gesloten (ieder venster krijgt daarvoor een eigen sessienummer);
 *   - zoeken naar een bekend gezicht tot iemand is herkend of de tijd om is;
 *   - een gezicht vastleggen, alleen met toestemming (vinkje) en als de camera echt aan staat.
 *
 * Verbonden met:
 *   - FaceRecognitionDemo: laadt face-api, bedient de camera en vergelijkt gezichten;
 *   - RegistrationApp: maakt deze class en geeft de methodes en velden door;
 *   - EmployeeController (via RegistrationApp): opent het productvenster na herkennen en tekent
 *     het opnieuw na instellen of uitzetten;
 *   - ModalManager (via RegistrationApp): opent en sluit het cameravenster;
 *   - RegistrationView: zoekt de elementen op en toont meldingen.
 */
export class FaceController {
  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  constructor(app) {
    this.app = app;
    this.faceSession = 0;          // telt op bij ieder openen en sluiten van het cameravenster
    this.faceMode = null;          // "recognize" (herkennen) of "enroll" (instellen)
    this.faceEmployeeId = null;    // de medewerker voor wie een gezicht wordt ingesteld
    this.cameraReady = false;      // staat de camera echt aan om een gezicht vast te leggen?
    this.captureSession = null;    // sessienummer van het vastleggen dat nu loopt (zie get capturing)
    this.enrollTimer = null;       // time-out die de camera uitzet als er niets wordt vastgelegd (zie scheduleEnrollTimeout)
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

  // Knop "Herken mij met de camera (demo)" op de beginpagina.
  // Alleen actieve medewerkers kunnen worden herkend. Is er alleen een gezicht ingesteld van een
  // gedeactiveerde medewerker, dan opent de camera niet (dat gezicht blijft wel bewaard, zodat het
  // na opnieuw activeren weer werkt).
  startFaceRecognition() {
    const hasActiveFace = this.faceDemo.enrolledIds().some((id) => this.model.findEmployee(id)?.active);
    if (!hasActiveFace) {
      this.view.showToast(
        "Er is nog niemand ingesteld voor gezichtsherkenning. Kies je naam en zet het aan in het productvenster.",
        { tone: "error", duration: 5000 }
      );
      return;
    }
    this.openFaceModal("recognize");
  }

  // Link "Gezichtsherkenning instellen (demo)" in het productvenster van een medewerker.
  startFaceEnrollment() {
    this.openFaceModal("enroll", this.app.selectedEmployeeId);
  }

  // Link "Uitzetten": vergeet het gezicht van deze medewerker.
  forgetFace() {
    this.faceDemo.forget(this.app.selectedEmployeeId);
    this.app.renderProductWindow();
    this.app.focusProductWindowAction();
    this.view.showToast("Gezichtsherkenning staat uit voor deze medewerker.", { tone: "success" });
  }

  // Toont een statustekst in het cameravenster ("info" of "error").
  setFaceStatus(message, tone = "info") {
    const status = this.view.$("#faceStatus");
    status.textContent = message;
    status.dataset.tone = tone;
  }

  // Opent het cameravenster om te herkennen ("recognize") of om een gezicht in te stellen ("enroll").
  // Iedere keer openen krijgt een nieuw sessienummer; sluit de gebruiker het venster terwijl er
  // nog geladen wordt, dan ziet de code aan het nummer dat ze moet stoppen.
  async openFaceModal(mode, employeeId = null) {
    this.faceSession += 1;
    const session = this.faceSession;
    this.faceMode = mode;
    this.faceEmployeeId = employeeId;
    this.cameraReady = false;

    const enrolling = mode === "enroll";
    const name = enrolling ? this.app.employeeLabel(employeeId) : "";
    this.view.$("#faceTitle").textContent = enrolling ? `Gezichtsherkenning instellen voor ${name}` : "Herken mij";
    this.view.$("#faceHelp").textContent = enrolling
      ? "Plaats je gezicht binnen het kader. Zet het vinkje en klik op Gezicht vastleggen."
      : "Plaats je gezicht binnen het kader en kijk recht in de camera.";
    this.view.$("#faceConsent").checked = false;
    this.view.$("#faceConsentLabel").classList.toggle("hidden", !enrolling);
    this.view.$("#faceEnrollButton").classList.toggle("hidden", !enrolling);
    this.view.$("#faceEnrollButton").disabled = true;
    this.app.openModal("#faceModal");
    // Focus in het venster: bij instellen op het toestemmingsvinkje, bij herkennen op "Annuleren".
    this.view.$(enrolling ? "#faceConsent" : "#faceModal .employee-form-actions [data-close-face-modal]")?.focus();

    const video = this.view.$("#faceVideo");
    this.setFaceStatus("Herkenningsmodel laden. De eerste keer kan dit even duren.");

    try {
      await this.faceDemo.load();
    } catch (error) {
      if (session === this.faceSession) {
        this.setFaceStatus("De demo kon niet worden geladen. Herlaad de pagina en probeer het opnieuw.", "error");
      }
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
      this.scanForFace(session);
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

  // Kijkt steeds opnieuw of er een bekend gezicht in beeld is, tot iemand is herkend,
  // het venster wordt gesloten of de tijd (FACE_DEMO.scanTimeoutMs) om is.
  // Is de tijd om, dan wordt de camera uitgezet (zie stopCameraAfterTimeout). Anders zou de
  // camera blijven filmen tot iemand het venster sluit, ook als de medewerker al is weggelopen.
  async scanForFace(session) {
    const video = this.view.$("#faceVideo");
    const deadline = Date.now() + this.faceDemo.settings.scanTimeoutMs;
    this.setFaceStatus("Zoeken naar een bekend gezicht…");
    this.faceDemo.resetConfirmation();

    while (session === this.faceSession && Date.now() < deadline) {
      const descriptor = await this.faceDemo.readFace(video);
      if (session !== this.faceSession) return;

      // Pas als dezelfde actieve medewerker twee keer achter elkaar is gevonden, telt het.
      const match = descriptor ? this.faceDemo.findMatch(descriptor) : null;
      const candidate = match && this.model.findEmployee(match)?.active ? match : null;
      const employeeId = this.faceDemo.confirm(candidate);
      if (employeeId) {
        this.closeFaceModal();
        this.app.openEmployeeProducts(employeeId, { recognized: true });
        return;
      }

      let status = "Geen gezicht in beeld. Plaats je gezicht binnen het kader.";
      if (candidate) status = "Bijna herkend. Blijf even rustig in het kader kijken.";
      else if (descriptor) status = "Gezicht gevonden, maar niet herkend. Blijf rustig in het kader kijken.";
      this.setFaceStatus(status);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (session === this.faceSession) {
      this.stopCameraAfterTimeout();
      this.setFaceStatus("Niet herkend. De camera is uitgezet. Sluit dit venster en kies je naam in de lijst.", "error");
    }
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

  // Bij het instellen van een gezicht staat de camera aan tot de medewerker op "Gezicht vastleggen"
  // klikt. Gebeurt dat niet binnen FACE_DEMO.scanTimeoutMs (bijvoorbeeld omdat de medewerker is
  // weggelopen), dan gaat de camera uit. `session` is het venster waarvoor de tijd loopt: is dat
  // venster intussen gesloten of opnieuw geopend, dan doet de time-out niets. Tijdens het
  // vastleggen wordt gewacht tot dat klaar is. closeFaceModal ruimt de wachtende time-out op.
  scheduleEnrollTimeout(session) {
    const check = () => {
      this.enrollTimer = null;
      if (session !== this.faceSession) return;
      if (this.capturing) {
        this.enrollTimer = setTimeout(check, 500);
        return;
      }
      this.stopCameraAfterTimeout();
      this.setFaceStatus("De tijd is om en de camera is uitgezet. Sluit dit venster en probeer het opnieuw.", "error");
    };
    clearTimeout(this.enrollTimer);
    this.enrollTimer = setTimeout(check, this.faceDemo.settings.scanTimeoutMs);
  }

  // Het sessienummer van het vastleggen wordt bewaard in captureSession. "capturing" (zie de
  // getter bovenaan) is alleen waar als dat nummer bij het venster hoort dat nu open is.
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

    if (!descriptor) {
      this.setFaceStatus("Geen gezicht gevonden. Plaats je gezicht binnen het kader en probeer het opnieuw.", "error");
      this.updateEnrollButton();
      return;
    }

    if (!this.view.$("#faceConsent").checked) {
      this.setFaceStatus("Er is niets vastgelegd, omdat het vinkje voor toestemming niet meer staat.", "error");
      this.updateEnrollButton();
      return;
    }

    this.faceDemo.enroll(this.faceEmployeeId, descriptor);
    const name = this.app.employeeLabel(this.faceEmployeeId);
    this.closeFaceModal();
    this.app.renderProductWindow();
    this.app.focusProductWindowAction();
    this.view.showToast(`Gezichtsherkenning staat aan voor ${name}, alleen tijdens deze sessie.`, { tone: "success", duration: 4000 });
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
  closeFaceModal() {
    this.faceSession += 1;
    this.cameraReady = false;
    clearTimeout(this.enrollTimer);
    this.enrollTimer = null;
    this.faceDemo.stopCamera(this.view.$("#faceVideo"));
    this.app.closeModal("#faceModal");
  }
}
