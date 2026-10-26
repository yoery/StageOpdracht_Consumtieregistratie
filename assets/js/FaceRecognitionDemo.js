import { FACE_DEMO } from "./config.js";

/**
 * FaceRecognitionDemo — een demo van gezichtsherkenning met de camera van de tablet of laptop.
 *
 * Belangrijk (privacy): een gezicht is een biometrisch gegeven (AVG artikel 9). Daarom is dit
 * alleen een demo, en zo gebouwd dat er niets wordt verstuurd en zo weinig mogelijk wordt bewaard:
 *   - de herkenning gebeurt volledig in de browser (de bibliotheek face-api draait lokaal);
 *   - er worden geen foto's gemaakt of opgeslagen;
 *   - van een gezicht wordt alleen een reeks van 128 getallen (een "descriptor") onthouden;
 *   - iedere medewerker zet het zelf aan, met een vinkje voor vrijwillige deelname;
 *   - met FACE_DEMO.enabled = false in config.js staat de demo helemaal uit.
 * Vanaf versie 3.17 bewaart het model (RegistrationModel.faceEnrollments) de descriptor met de datum
 * van instellen in de browser, zodat de instelling na herladen blijft werken en na een jaar verloopt.
 * Dat is een bewuste afwijking van "alleen in het geheugen" (zie RegistrationModel en TO hoofdstuk 13).
 * Deze class houdt de geldige descriptors in het geheugen om mee te vergelijken; FaceController zet
 * ze er na het laden in (loadFaces) en haalt verlopen of gewiste gezichten eruit.
 *
 * Verantwoordelijkheid:
 *   - de bibliotheek en modellen laden (pas als iemand de demo gebruikt);
 *   - nagaan of de tablet een camera heeft (detectCamera), zonder die aan te zetten;
 *   - de camera starten en stoppen;
 *   - van het camerabeeld een descriptor maken;
 *   - gezichten van medewerkers in het geheugen houden en een gezicht herkennen.
 *
 * Verbonden met:
 *   - config.js: FACE_DEMO (adres van de bibliotheek en modellen, drempelwaarde, tijdslimiet);
 *   - FaceController (onderdeel van de controller RegistrationApp): stuurt de demo aan
 *     (instellen, herkennen, venster openen en sluiten);
 *   - index.html: het venster #faceModal met het videobeeld #faceVideo.
 */
export class FaceRecognitionDemo {
  // `mediaDevices` is de camera-functie van de browser. Die kan worden meegegeven, zodat de
  // camera in de unit tests (zonder browser) kan worden nagebootst.
  constructor(settings = FACE_DEMO, mediaDevices = globalThis.navigator?.mediaDevices) {
    this.settings = settings;
    this.mediaDevices = mediaDevices;
    this.faceapi = null;          // de bibliotheek, na het laden
    this.stream = null;           // de camerastream, zolang de camera aan staat
    this.knownFaces = new Map();  // employeeId -> descriptor (alleen in het geheugen)
    this.lastCandidate = null;    // voor confirm(): wie het laatst is gevonden
    this.streak = 0;              // voor confirm(): hoe vaak achter elkaar
    this.hasCamera = null;        // heeft de tablet een camera? null = nog niet bekend (zie detectCamera)
  }

  // Staat de demo aan en heeft deze browser een camera-functie?
  isAvailable() {
    return Boolean(this.settings.enabled && this.mediaDevices?.getUserMedia);
  }

  // Kijkt of er een camera is aangesloten, zonder de camera aan te zetten: enumerateDevices noemt de
  // soorten apparaten (ook zonder toestemming, dan zonder naam). Het resultaat staat daarna in
  // `hasCamera` (true of false). Lukt het niet of kent de browser dit niet, dan blijft het null.
  async detectCamera() {
    if (!this.isAvailable() || typeof this.mediaDevices.enumerateDevices !== "function") return this.hasCamera;
    try {
      const devices = await this.mediaDevices.enumerateDevices();
      this.hasCamera = devices.some((device) => device.kind === "videoinput");
    } catch (error) {
      this.hasCamera = null;
    }
    return this.hasCamera;
  }

  // Is er zeker een camera (detectCamera gaf true)? Alleen dan stelt de app na een passcan de vraag
  // "Gezichtsherkenning nog niet ingesteld. Wil je dit?": zonder camera kan niemand het instellen.
  hasCameraDevice() {
    return this.isAvailable() && this.hasCamera === true;
  }

  // Kan er misschien een camera zijn (niet zeker dat er geen is)? Dan mag de scan na een tik op het
  // standby-scherm het proberen. Mislukt het starten, dan gaat de scan netjes dicht.
  mayHaveCamera() {
    return this.isAvailable() && this.hasCamera !== false;
  }

  // ------------------------------------------------------------------
  // Bibliotheek en camera
  // ------------------------------------------------------------------

  // Laadt de bibliotheek en de drie modellen (gezicht vinden, gezichtspunten, herkenning).
  // Gebeurt maar één keer; daarna staat alles klaar.
  async load() {
    if (this.faceapi) return;

    const faceapi = await import(this.settings.libraryUrl);
    await faceapi.nets.tinyFaceDetector.loadFromUri(this.settings.modelUrl);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(this.settings.modelUrl);
    await faceapi.nets.faceRecognitionNet.loadFromUri(this.settings.modelUrl);
    this.faceapi = faceapi;
  }

  // Start de camera aan de voorkant (de kant van het scherm) en toont het beeld in `video`.
  // Het aanzetten van de camera kan even duren (de browser vraagt om toestemming). `isCurrent`
  // zegt of het venster nog steeds open is; is het intussen gesloten, dan wordt deze camera
  // meteen weer uitgezet en geeft de methode false terug. Zo blijft er nooit een camera aan
  // staan die niemand meer kan uitzetten.
  async startCamera(video, isCurrent = () => true) {
    const stream = await this.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });

    if (!isCurrent()) {
      this.stopTracks(stream);
      return false;
    }

    this.stopCamera(video); // een eventuele oudere camera eerst uitzetten
    this.stream = stream;
    video.srcObject = stream;
    await video.play();
    return true;
  }

  // Zet de camera uit. Altijd aanroepen als het venster sluit.
  stopCamera(video) {
    this.stopTracks(this.stream);
    this.stream = null;
    if (video) video.srcObject = null;
  }

  // Zet alle sporen (beeld) van een camerastream uit.
  stopTracks(stream) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  // Zoekt gezichten in het huidige camerabeeld en geeft de descriptor (128 getallen) terug van
  // het grootste gezicht: dat is de persoon die het dichtst bij de camera staat. Zo wordt niet
  // per ongeluk iemand op de achtergrond gekozen. Geeft null terug als er geen gezicht te zien is.
  // Gaat er in de bibliotheek iets mis (bijvoorbeeld omdat het beeld net wegvalt), dan telt dat
  // als "geen gezicht", zodat het zoeken gewoon doorgaat in plaats van vast te lopen.
  async readFace(video) {
    let results;
    try {
      const options = new this.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 });
      results = await this.faceapi
        .detectAllFaces(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptors();
    } catch (error) {
      console.warn("Gezicht lezen mislukt; er wordt opnieuw gezocht.", error);
      return null;
    }

    const closest = this.largestFace(results.map((result) => ({
      area: result.detection.box.width * result.detection.box.height,
      descriptor: Array.from(result.descriptor)
    })));

    return closest ? closest.descriptor : null;
  }

  // Kiest uit een lijst gevonden gezichten ({ area, descriptor }) het grootste, of null bij een lege lijst.
  largestFace(faces) {
    let largest = null;

    for (const face of faces) {
      if (!largest || face.area > largest.area) largest = face;
    }

    return largest;
  }

  // ------------------------------------------------------------------
  // Gezichten in het geheugen en herkennen
  // ------------------------------------------------------------------

  enroll(employeeId, descriptor) {
    this.knownFaces.set(employeeId, descriptor);
  }

  // Vervangt alle gezichten in het geheugen door deze opgeslagen gezichtsinstellingen
  // ({ employeeId, descriptor }), bijvoorbeeld na het laden, na verlopen of na wissen.
  loadFaces(entries) {
    this.knownFaces = new Map(entries.map(({ employeeId, descriptor }) => [employeeId, descriptor]));
  }

  forget(employeeId) {
    this.knownFaces.delete(employeeId);
  }

  isEnrolled(employeeId) {
    return this.knownFaces.has(employeeId);
  }

  hasEnrolledFaces() {
    return this.knownFaces.size > 0;
  }

  // De id's van alle medewerkers met een ingesteld gezicht.
  enrolledIds() {
    return [...this.knownFaces.keys()];
  }

  // Afstand tussen twee descriptors: hoe kleiner, hoe meer de gezichten op elkaar lijken.
  distance(a, b) {
    let sum = 0;
    for (let index = 0; index < a.length; index += 1) {
      sum += (a[index] - b[index]) ** 2;
    }
    return Math.sqrt(sum);
  }

  // Zoekt de bekende medewerker die het meest lijkt op dit gezicht.
  // Geeft de employeeId terug, of null als niemand dichtbij genoeg is (onder de drempel).
  // `allowedIds` (optioneel) zijn de medewerkers die mogen worden herkend, bijvoorbeeld alleen de
  // actieve medewerkers die nog bestaan. Gezichten van andere medewerkers tellen dan niet mee.
  // Zonder deze lijst zou het gezicht van een inactieve of verwijderde collega dat toevallig iets
  // dichterbij ligt, winnen, en zou de actieve medewerker niet meer worden herkend.
  findMatch(descriptor, allowedIds = null) {
    const allowed = allowedIds ? new Set(allowedIds) : null;
    let bestId = null;
    let bestDistance = Infinity;

    for (const [employeeId, known] of this.knownFaces) {
      if (allowed && !allowed.has(employeeId)) continue;
      const distance = this.distance(descriptor, known);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = employeeId;
      }
    }

    return bestDistance < this.settings.matchThreshold ? bestId : null;
  }

  // Extra zekerheid: iemand telt pas als herkend als dezelfde persoon `required` keer
  // achter elkaar is gevonden. Eén misser (bijv. iets wat even op een gezicht lijkt) leidt
  // dan nooit tot de verkeerde medewerker. Geeft de employeeId terug zodra het genoeg keer
  // achter elkaar dezelfde is, en anders null.
  confirm(employeeId, required = 2) {
    if (employeeId && employeeId === this.lastCandidate) {
      this.streak += 1;
    } else {
      this.lastCandidate = employeeId;
      this.streak = employeeId ? 1 : 0;
    }

    return this.streak >= required ? employeeId : null;
  }

  // Begint opnieuw met tellen (bij iedere nieuwe herkenningspoging).
  resetConfirmation() {
    this.lastCandidate = null;
    this.streak = 0;
  }
}
