/**
 * ControllerPart — de basisclass van de elf onderdelen van de controller.
 *
 * RegistrationApp verdeelt zijn werk over onderdelen met ieder één taak, zoals AdminController,
 * FormController en StockController. Wat al die onderdelen gemeen hebben, staat hier één keer
 * (overerving): de koppeling met RegistrationApp, de toegang tot het model, de view en de
 * demo-gezichtsherkenning, en de echte klok van de browser. Een onderdeel begint daarom met
 * `class AdminController extends ControllerPart` en roept in zijn constructor `super(app)` aan.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt de onderdelen en geeft zichzelf mee als `app`;
 *   - de elf onderdelen in deze map: erven van deze class.
 */
export class ControllerPart {
  // `app` is de controller (RegistrationApp) waar het onderdeel bij hoort.
  constructor(app) {
    this.app = app;
  }

  // De echte klok van de browser: Date.now() en setInterval/clearInterval. De onderdelen met een
  // timer krijgen de klok mee in hun constructor, zodat de unit tests met een nepklok kunnen werken.
  static realClock() {
    return {
      now: () => Date.now(),
      setInterval: (action, delay) => setInterval(action, delay),
      clearInterval: (timer) => clearInterval(timer)
    };
  }

  // Het model, de view en de demo-gezichtsherkenning komen steeds van RegistrationApp, zodat er
  // maar één verwijzing naar ieder onderdeel bestaat.
  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  get faceDemo() {
    return this.app.faceDemo;
  }
}
