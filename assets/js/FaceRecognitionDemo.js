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
 *   - op het startscherm alleen gezichten zoeken (detectFaces, zonder kenmerken) en pas na de
 *     intentie-drempel de descriptor van dat ene gezicht maken (describeFace);
 *   - gezichten van medewerkers in het geheugen houden en een gezicht herkennen.
 *
 * Verbonden met:
 *   - config.js: FACE_DEMO (adres van de bibliotheek en modellen, drempelwaarde, tijdslimiet);
 *   - FaceController (onderdeel van de controller RegistrationApp): stuurt de demo aan
 *     (instellen, herkennen, venster openen en sluiten);
 *   - AutoScanController: het automatisch scannen op het startscherm (detectFaces en describeFace);
 *   - index.html: het venster #faceModal met het videobeeld #faceVideo, en #startVideo op het startscherm.
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
  // startscherm (scanMode "tap") of het automatisch scannen het proberen. Mislukt het starten, dan gaat de scan netjes dicht.
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
  // `size` ({ width, height }) is de gevraagde resolutie. Standaard 640 bij 480. Het startscherm vraagt
  // een lagere resolutie (FACE_DEMO.autoScan), zodat de tablet niet warm wordt.
  async startCamera(video, isCurrent = () => true, size = { width: 640, height: 480 }) {
    const stream = await this.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: size.width }, height: { ideal: size.height } },
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
    // Eerst alleen de gezichten zoeken (zonder kenmerken). Daarna worden alleen van het grootste
    // gezicht, de persoon die vooraan staat, de kenmerken berekend via describeFace. Zo krijgen andere
    // gezichten in beeld nooit kenmerken, net als bij het automatisch scannen op het startscherm.
    let detections;
    try {
      const options = new this.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 });
      detections = await this.faceapi.detectAllFaces(video, options);
    } catch (error) {
      console.warn("Gezicht lezen mislukt. Er wordt opnieuw gezocht.", error);
      return null;
    }

    const closest = this.largestFace(detections.map(({ box }) => ({
      area: box.width * box.height,
      box: { x: box.x, y: box.y, width: box.width, height: box.height }
    })));

    return closest ? this.describeFace(video, closest.box) : null;
  }

  // Alleen gezichten zoeken, zonder kenmerken (het automatisch scannen op het startscherm, zie
  // AutoScanController). Geeft { width, height, faces } terug: de grootte van het camerabeeld en per
  // gezicht alleen de rechthoek { x, y, width, height } in pixels. Er wordt geen descriptor berekend, ook
  // niet van voorbijgangers. Is er nog geen beeld, of gaat er in de bibliotheek iets mis, dan telt dat
  // als "geen gezicht", zonder melding in de console (het scannen loopt de hele tijd door).
  async detectFaces(video) {
    const width = video?.videoWidth || 0;
    const height = video?.videoHeight || 0;
    if (!this.faceapi || !width || !height) return { width, height, faces: [] };
    try {
      const options = new this.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
      const detections = await this.faceapi.detectAllFaces(video, options);
      const faces = detections.map(({ box }) => ({ x: box.x, y: box.y, width: box.width, height: box.height }));
      return { width, height, faces };
    } catch (error) {
      return { width, height, faces: [] };
    }
  }

  // De kenmerken (descriptor) van precies dit ene gezicht (`face` is een rechthoek uit detectFaces), voor
  // het automatisch scannen nadat de intentie-drempel is gehaald (FaceIntent). Alleen het stuk van het
  // beeld rond dit gezicht gaat naar de herkenning, zodat andere gezichten in beeld geen kenmerken
  // krijgen. Dat stuk staat even in een canvas in het geheugen en wordt daarna meteen leeggemaakt. Geeft
  // de descriptor terug, of null als er in dat stuk geen gezicht wordt gevonden.
  async describeFace(video, face) {
    if (!this.faceapi || !face || typeof globalThis.document?.createElement !== "function") return null;
    const margin = 0.3;
    const sx = Math.max(0, Math.floor(face.x - face.width * margin));
    const sy = Math.max(0, Math.floor(face.y - face.height * margin));
    const sw = Math.min((video.videoWidth || 0) - sx, Math.ceil(face.width * (1 + margin * 2)));
    const sh = Math.min((video.videoHeight || 0) - sy, Math.ceil(face.height * (1 + margin * 2)));
    if (sw <= 0 || sh <= 0) return null;

    const canvas = globalThis.document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    try {
      canvas.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      const options = new this.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
      const result = await this.faceapi.detectSingleFace(canvas, options).withFaceLandmarks(true).withFaceDescriptor();
      return result ? Array.from(result.descriptor) : null;
    } catch (error) {
      return null;
    } finally {
      // Het stukje beeld wordt niet bewaard: het canvas wordt leeggemaakt.
      canvas.width = 0;
      canvas.height = 0;
    }
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
