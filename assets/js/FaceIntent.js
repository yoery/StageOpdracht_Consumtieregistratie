import { FACE_DEMO } from "./config.js";

/**
 * FaceIntent — de intentie-drempel van het automatisch scannen op het startscherm (demo
 * gezichtsherkenning, FACE_DEMO.scanMode "auto", sinds versie 3.21).
 *
 * De camera op het startscherm ziet ook mensen die langslopen. Deze class beslist per camerabeeld of
 * er iemand is die echt herkend wil worden. Alleen dan mogen de kenmerken van een gezicht (de
 * descriptor) worden berekend. Dat mag pas als:
 *   1. er precies één gezicht dichtbij is: het gezicht is minstens FACE_DEMO.autoScan.minFaceWidth
 *      (45 procent) zo breed als het ovaal. Kleinere gezichten staan te ver weg en tellen niet mee;
 *   2. het midden van dat gezicht binnen het ovaal valt;
 *   3. het gezicht ongeveer een seconde stil staat (autoScan.stillMs): het midden verschuift in die tijd
 *      niet meer dan autoScan.maxMovement (12 procent van de breedte van het ovaal).
 * Een gezicht op afstand of buiten het ovaal krijgt dus nooit kenmerken.
 *
 * Deze class rekent alleen met de rechthoeken die de gezichtsdetectie teruggeeft (waar en hoe groot,
 * geen beeld en geen kenmerken) en kent de camera, de pagina en face-api niet. Zo is de drempel zonder
 * browser te testen.
 *
 * Het ovaal: op het startscherm toont het ovaal het midden van het camerabeeld (object-fit: cover in een
 * kader van 3 bij 4, zie start-screen.css). ovalFor rekent uit welk deel van het camerabeeld dat is.
 *
 * De toestanden die update teruggeeft:
 *   - "none": geen gezicht in beeld;
 *   - "far": alleen gezichten op afstand (te klein);
 *   - "multiple": meer dan één gezicht dichtbij;
 *   - "outside": één gezicht dichtbij, maar het midden valt buiten het ovaal;
 *   - "settling": één gezicht dichtbij in het ovaal, maar het staat nog niet lang genoeg stil;
 *   - "ready": de drempel is gehaald. Alleen nu mag de descriptor van `face` worden berekend.
 *
 * Verbonden met:
 *   - AutoScanController: geeft ieder camerabeeld door en berekent alleen bij "ready" de descriptor;
 *   - config.js: FACE_DEMO.autoScan (minFaceWidth, stillMs, maxMovement).
 */
export class FaceIntent {
  // De verhouding breedte gedeeld door hoogte van het ovaal op het startscherm (3 bij 4, staand).
  static OVAL_ASPECT = 3 / 4;

  // `settings` is FACE_DEMO.autoScan uit config.js.
  constructor(settings = FACE_DEMO.autoScan) {
    this.settings = settings;
    this.reset();
  }

  // Begint opnieuw met het stilstaan (na herkennen, na een pauze of als het gezicht weg is).
  reset() {
    this.anchor = null;      // het midden van het gezicht toen het stilstaan begon
    this.steadySince = null; // tijdstip (ms) waarop het stilstaan begon
  }

  // Het ovaal in pixels van het camerabeeld ({ cx, cy, rx, ry }). Het ovaal toont het midden van het
  // beeld: bij een liggend beeld (4 bij 3) vallen links en rechts stukken weg.
  static ovalFor(width, height, aspect = FaceIntent.OVAL_ASPECT) {
    const cropWidth = width / height > aspect ? height * aspect : width;
    const cropHeight = width / height > aspect ? height : width / aspect;
    return { cx: width / 2, cy: height / 2, rx: cropWidth / 2, ry: cropHeight / 2 };
  }

  // Het midden van een gezicht ({ x, y, width, height }).
  static center(face) {
    return { x: face.x + face.width / 2, y: face.y + face.height / 2 };
  }

  // Is het gezicht dichtbij (breed genoeg ten opzichte van het ovaal)?
  isNear(face, oval) {
    return face.width >= this.settings.minFaceWidth * oval.rx * 2;
  }

  // Valt het midden van het gezicht binnen het ovaal?
  static isInside(face, oval) {
    const { x, y } = FaceIntent.center(face);
    return ((x - oval.cx) / oval.rx) ** 2 + ((y - oval.cy) / oval.ry) ** 2 <= 1;
  }

  // Verwerkt één camerabeeld: `frame` is { width, height, faces: [{ x, y, width, height }] } (pixels van
  // het camerabeeld) en `now` het tijdstip in milliseconden. Geeft { state, face } terug, met `face` het
  // gezicht dichtbij in het ovaal (alleen bij "settling" en "ready").
  update(frame, now) {
    const faces = frame?.faces ?? [];
    if (!frame?.width || !frame?.height || faces.length === 0) return this.result("none");

    const oval = FaceIntent.ovalFor(frame.width, frame.height);
    const near = faces.filter((face) => this.isNear(face, oval));
    if (near.length === 0) return this.result("far");
    if (near.length > 1) return this.result("multiple");

    const face = near[0];
    if (!FaceIntent.isInside(face, oval)) return this.result("outside");

    const center = FaceIntent.center(face);
    const moved = this.anchor ? Math.hypot(center.x - this.anchor.x, center.y - this.anchor.y) : Infinity;
    if (moved > this.settings.maxMovement * oval.rx * 2) {
      this.anchor = center;
      this.steadySince = now;
    }
    const state = now - this.steadySince >= this.settings.stillMs ? "ready" : "settling";
    return { state, face };
  }

  // Een uitkomst zonder gezicht in het ovaal: het stilstaan begint dan opnieuw.
  result(state) {
    this.reset();
    return { state, face: null };
  }
}
