import { FACE_DEMO } from "./config.js";

/**
 * FaceLiveness — de stille controle op een levend gezicht (demo gezichtsherkenning, sinds versie 3.23).
 *
 * Een gewone tabletcamera ziet een plat beeld. Zonder controle kan een foto van een collega, geprint of
 * op een telefoon, herkend worden als die collega. Deze class kijkt of het gezicht in beeld leeft, zonder
 * dat de medewerker iets hoeft te doen: geen opdracht om te knipperen of het hoofd te draaien. De controle
 * loopt mee tijdens het herkennen en gebruikt de 68 gezichtspunten (ogen, neus, mond, kaaklijn) die de
 * herkenning toch al berekent. Een gezicht telt als levend als in de laatste windowMs één van deze twee
 * dingen is gezien:
 *   1. een knipper: de ogen gaan even (bijna) dicht. De "ooghoogte" (eye aspect ratio: de hoogte van het
 *      oog gedeeld door de breedte) zakt dan onder blinkRatio keer de gewone ooghoogte;
 *   2. een gezicht dat vervormt: bij een echt hoofd dat licht beweegt, verschuift de neus anders dan de
 *      ogen en de kaaklijn (het hoofd is driedimensionaal) en bewegen de mond en ogen. Een foto beweegt
 *      altijd als één plat geheel: hoe je hem ook schuift, draait of kantelt, de punten blijven op een
 *      vlak (een affiene vervorming). Per beeld wordt het best passende vlak berekend. Wat daarna
 *      overblijft (de afwijking, gedeeld door de afstand tussen de ogen) moet in minstens minFrames
 *      beelden boven minDeformation liggen.
 * Wordt er binnen maxMs na het eerste beeld niets gezien, dan is de uitkomst "failed".
 *
 * Wat dit wel en niet tegenhoudt: een geprinte foto en een stilstaande foto op een telefoon worden
 * tegengehouden. Een video van iemand op een telefoon kan erdoorheen komen. Echt veilig is alleen een
 * camera die diepte meet (infrarood, zoals Face ID en Windows Hello) of de pas (zie TO bijlage B).
 *
 * Privacy: de gezichtspunten staan alleen in het geheugen, hooguit windowMs lang, en worden gewist bij
 * reset (na herkennen, na een pauze en als het gezicht weg is). Ze worden nooit opgeslagen of verstuurd.
 *
 * Deze class rekent alleen met punten en tijden en kent de camera, de pagina en face-api niet. Zo is de
 * controle zonder browser te testen.
 *
 * De uitkomsten van check:
 *   - "checking": nog niets gezien, de tijd is nog niet om;
 *   - "alive": een knipper of een vervorming gezien;
 *   - "failed": maxMs voorbij zonder knipper of vervorming.
 *
 * Verbonden met:
 *   - FaceRecognitionDemo: geeft na iedere berekening de gezichtspunten door (checkLiveness);
 *   - config.js: FACE_DEMO.liveness (enabled, windowMs, maxMs, blinkRatio, minDeformation, minFrames).
 */
export class FaceLiveness {
  // De nummers van de zes punten van het linker- en rechteroog in de 68 gezichtspunten.
  static LEFT_EYE = [36, 37, 38, 39, 40, 41];
  static RIGHT_EYE = [42, 43, 44, 45, 46, 47];

  // `settings` is FACE_DEMO.liveness uit config.js.
  constructor(settings = FACE_DEMO.liveness) {
    this.settings = settings;
    this.reset();
  }

  // Begint opnieuw: alle gezichtspunten uit het geheugen.
  reset() {
    this.frames = [];       // { points, time } van de laatste windowMs
    this.startedAt = null;  // tijdstip (ms) van het eerste beeld
    this.alive = false;
  }

  // De afstand tussen twee punten.
  static distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Het midden van een paar punten.
  static centerOf(points) {
    const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  // De ooghoogte (eye aspect ratio) van één oog: de twee hoogtes gedeeld door twee keer de breedte.
  static eyeRatio(points, eye) {
    const [p1, p2, p3, p4, p5, p6] = eye.map((index) => points[index]);
    const width = FaceLiveness.distance(p1, p4);
    return width ? (FaceLiveness.distance(p2, p6) + FaceLiveness.distance(p3, p5)) / (2 * width) : 0;
  }

  // De gemiddelde ooghoogte van beide ogen.
  static eyesRatio(points) {
    return (FaceLiveness.eyeRatio(points, FaceLiveness.LEFT_EYE) + FaceLiveness.eyeRatio(points, FaceLiveness.RIGHT_EYE)) / 2;
  }

  // De afstand tussen de middens van de ogen (de maat waarmee de vervorming wordt gedeeld).
  static eyeDistance(points) {
    const left = FaceLiveness.centerOf(FaceLiveness.LEFT_EYE.map((index) => points[index]));
    const right = FaceLiveness.centerOf(FaceLiveness.RIGHT_EYE.map((index) => points[index]));
    return FaceLiveness.distance(left, right);
  }

  // Lost het stelsel van drie vergelijkingen `m` · v = `r` op (regel van Cramer). Geeft null als het
  // stelsel geen oplossing heeft (alle punten op één lijn).
  static solve3(m, r) {
    const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
      a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    const d = det(m);
    if (Math.abs(d) < 1e-9) return null;
    return [0, 1, 2].map((column) => det(m.map((row, index) => row.map((value, c) => (c === column ? r[index] : value)))) / d);
  }

  // Hoe veel `points` afwijken van een plat vlak door `reference`: het best passende affiene beeld
  // (schuiven, draaien, schalen en kantelen) van reference op points, en daarvan de gemiddelde afwijking
  // per punt (wortel van het gemiddelde kwadraat), gedeeld door de afstand tussen de ogen. Een foto geeft
  // (bijna) 0, een echt gezicht dat beweegt meer.
  static deformation(reference, points) {
    const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const rightX = [0, 0, 0];
    const rightY = [0, 0, 0];
    reference.forEach((source, index) => {
      const row = [source.x, source.y, 1];
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) sums[i][j] += row[i] * row[j];
        rightX[i] += row[i] * points[index].x;
        rightY[i] += row[i] * points[index].y;
      }
    });
    const fitX = FaceLiveness.solve3(sums, rightX);
    const fitY = FaceLiveness.solve3(sums, rightY);
    const scale = FaceLiveness.eyeDistance(points);
    if (!fitX || !fitY || !scale) return 0;

    let squared = 0;
    reference.forEach((source, index) => {
      const x = fitX[0] * source.x + fitX[1] * source.y + fitX[2];
      const y = fitY[0] * source.x + fitY[1] * source.y + fitY[2];
      squared += (x - points[index].x) ** 2 + (y - points[index].y) ** 2;
    });
    return Math.sqrt(squared / reference.length) / scale;
  }

  // Verwerkt de gezichtspunten van één beeld (`points`: 68 punten { x, y }) op tijdstip `now` (ms) en
  // geeft de uitkomst terug ("checking", "alive" of "failed"). Zonder `points` wordt alleen de tijd bekeken.
  check(points, now) {
    if (this.settings?.enabled === false || this.alive) return "alive";
    if (this.startedAt === null) this.startedAt = now;

    if (Array.isArray(points) && points.length >= 68) {
      this.frames.push({ points: points.map(({ x, y }) => ({ x, y })), time: now });
      this.frames = this.frames.filter((frame) => now - frame.time <= this.settings.windowMs);
      const blink = this.sawBlink();
      const deformed = this.sawDeformation();
      if (this.settings.debug) console.info("Levend gezicht:", this.measurements());
      if (blink || deformed) {
        this.alive = true;
        this.frames = []; // de punten zijn niet meer nodig
        return "alive";
      }
    }

    return now - this.startedAt >= this.settings.maxMs ? "failed" : "checking";
  }

  // Een knipper: de laagste ooghoogte ligt duidelijk onder de gewone (de hoogste in het venster).
  sawBlink() {
    if (this.frames.length < 2) return false;
    const ratios = this.frames.map(({ points }) => FaceLiveness.eyesRatio(points));
    const open = Math.max(...ratios);
    return open > 0 && Math.min(...ratios) < this.settings.blinkRatio * open;
  }

  // De gemeten waarden van het venster, voor het afstellen op de tablet (liveness.debug): de laagste
  // ooghoogte gedeeld door de hoogste, en de grootste vervorming ten opzichte van het eerste beeld.
  measurements() {
    const ratios = this.frames.map(({ points }) => FaceLiveness.eyesRatio(points));
    const [first, ...rest] = this.frames;
    const deformations = rest.map(({ points }) => FaceLiveness.deformation(first.points, points));
    return {
      frames: this.frames.length,
      eyes: Math.max(...ratios) ? Number((Math.min(...ratios) / Math.max(...ratios)).toFixed(3)) : null,
      deformation: Number(Math.max(0, ...deformations).toFixed(3))
    };
  }

  // Een vervorming: in minstens minFrames beelden wijkt het gezicht te veel af van een plat vlak door
  // het eerste beeld in het venster.
  sawDeformation() {
    const [first, ...rest] = this.frames;
    if (!first) return false;
    const deformed = rest.filter(({ points }) => FaceLiveness.deformation(first.points, points) >= this.settings.minDeformation);
    return deformed.length >= this.settings.minFrames;
  }
}
