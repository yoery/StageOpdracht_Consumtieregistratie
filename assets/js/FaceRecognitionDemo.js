import { FACE_DEMO } from "./config.js";

/**
 * FaceRecognitionDemo — een demo van gezichtsherkenning met de camera van de tablet of laptop.
 *
 * Belangrijk (privacy): een gezicht is een biometrisch gegeven (AVG artikel 9). Daarom is dit
 * alleen een demo, en zo gebouwd dat er niets wordt bewaard of verstuurd:
 *   - de herkenning gebeurt volledig in de browser (de bibliotheek face-api draait lokaal);
 *   - er worden geen foto's gemaakt of opgeslagen;
 *   - van een gezicht wordt alleen een reeks van 128 getallen (een "descriptor") onthouden,
 *     en die staat alleen in het geheugen: na het sluiten of herladen van de pagina is alles weg;
 *   - iedere medewerker zet het zelf aan, met een vinkje voor vrijwillige deelname;
 *   - met FACE_DEMO.enabled = false in config.js staat de demo helemaal uit.
 *
 * Verantwoordelijkheid:
 *   - de bibliotheek en modellen laden (pas als iemand de demo gebruikt);
 *   - de camera starten en stoppen;
 *   - van het camerabeeld een descriptor maken;
 *   - gezichten van medewerkers onthouden (in het geheugen) en een gezicht herkennen.
 *
 * Verbonden met:
 *   - config.js: FACE_DEMO (adres van de bibliotheek en modellen, drempelwaarde, tijdslimiet);
 *   - RegistrationApp: stuurt de demo aan (instellen, herkennen, venster openen en sluiten);
 *   - index.html: het venster #faceModal met het videobeeld #faceVideo.
 */
export class FaceRecognitionDemo {
  constructor(settings = FACE_DEMO) {
    this.settings = settings;
    this.faceapi = null;          // de bibliotheek, na het laden
    this.stream = null;           // de camerastream, zolang de camera aan staat
    this.knownFaces = new Map();  // employeeId -> descriptor (alleen in het geheugen)
  }

  // Staat de demo aan en heeft deze browser een camera-functie?
  isAvailable() {
    return Boolean(this.settings.enabled && globalThis.navigator?.mediaDevices?.getUserMedia);
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
  async startCamera(video) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = this.stream;
    await video.play();
  }

  // Zet de camera uit. Altijd aanroepen als het venster sluit.
  stopCamera(video) {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (video) video.srcObject = null;
  }

  // Zoekt gezichten in het huidige camerabeeld en geeft de descriptor (128 getallen) terug van
  // het grootste gezicht: dat is de persoon die het dichtst bij de camera staat. Zo wordt niet
  // per ongeluk iemand op de achtergrond gekozen. Geeft null terug als er geen gezicht te zien is.
  async readFace(video) {
    const options = new this.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 });
    const results = await this.faceapi
      .detectAllFaces(video, options)
      .withFaceLandmarks(true)
      .withFaceDescriptors();

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
  // Gezichten onthouden en herkennen (alleen in het geheugen)
  // ------------------------------------------------------------------

  enroll(employeeId, descriptor) {
    this.knownFaces.set(employeeId, descriptor);
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
  findMatch(descriptor) {
    let bestId = null;
    let bestDistance = Infinity;

    for (const [employeeId, known] of this.knownFaces) {
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
