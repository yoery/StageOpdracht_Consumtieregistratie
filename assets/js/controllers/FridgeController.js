import { SMART_FRIDGE } from "../config.js";
import { cssAttributeValue } from "../RegistrationView.js";
import { SmartFridge } from "../fridge/SmartFridge.js";

/**
 * FridgeController — de slimme koelkast (demo): het koelkastvenster voor de medewerker en het
 * tabblad Koelkast in het beheer (TO bijlage B, optie C).
 *
 * Het koelkastvenster opent op twee manieren: met de knop "Slimme koelkast (demo)" (de deur is dicht
 * en het venster wacht op een pas), of na herkenning op de beginpagina met de pas of de camera
 * (openFridgeFor, via RecognitionController en RECOGNITION_TARGET "fridge"): dan gaat de koelkast
 * meteen open voor die medewerker. In de open koelkast staat dan ook de knop om in plaats daarvan het
 * productvenster te openen (switchFridgeToProducts), voor wie brood of beleg wil.
 *
 * Het koelkastvenster kent drie stappen (`fridgePhase`):
 *   - "waiting": de deur is dicht en op slot. "Houd je pas tegen de lezer om de koelkast te openen".
 *     Voor de demo kan ook een medewerker worden gekozen (zonder pasjeslezer);
 *   - "open": het slot is open en de deur staat open. De medewerker tikt op een schap om een product
 *     te pakken en op Terugleggen om het terug te zetten. Er is geen keuze met "+" en "−";
 *   - "summary": de deur is dicht, het slot zit erop en het overzicht toont wat er is geregistreerd,
 *     bijvoorbeeld "Je hebt gepakt: 2× Blikje".
 * Zonder open venster is de stap "closed".
 *
 * Een pas die wordt gescand terwijl het koelkastvenster open is, gaat naar deze class (fridgeScan,
 * via BadgeController). Bij het sluiten van de deur rekent SmartFridge het gewichtsverschil om naar
 * aantallen. Deze class slaat het resultaat in één keer op via persist: de opening, een registratie
 * per gepakt product (de voorraad gaat mee omlaag) en één logboekregel. Lukt opslaan niet, dan wordt
 * alles teruggedraaid en staat er "Er is niets geregistreerd". Wordt de pagina herladen terwijl de
 * deur open is, dan is er nog niets opgeslagen: de opening is dan veilig afgebroken.
 *
 * Simulatie: in de demo zijn er geen echte producten. Vlak voor het openen worden de nagebootste
 * weegschalen gevuld met de voorraad van het consumptiepunt (stockSimulatedShelves), en een tik op een
 * schap haalt een product van de nagebootste weegschaal. In productie vervallen die stappen: daar
 * pakt de medewerker echte producten en stuurt de backend het echte slot en de weegschalen aan.
 *
 * Verantwoordelijkheid:
 *   - het koelkastvenster openen, tekenen en sluiten, met de focus en de meldingen;
 *   - de pas controleren (een actieve medewerker met een gekoppelde pas, anders blijft het slot dicht);
 *   - pakken en terugleggen nabootsen, de deur sluiten en het resultaat opslaan;
 *   - de waarschuwing als de deur te lang open staat, en het venster vanzelf sluiten als het niet
 *     wordt gebruikt terwijl de deur dicht is;
 *   - in het beheer de indeling van de schappen opslaan en de laatste openingen tonen.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, levert persist, employeeLabel en pointLabel en de koelkast
 *     (smartFridge);
 *   - SmartFridge (met in de demo SimulatedLock en SimulatedShelfScale): het slot en de weging;
 *   - BadgeController (via RegistrationApp): stuurt een scan door als het koelkastvenster open is;
 *   - RegistrationModel: fridgeLayout, saveFridgeShelves, addFridgeOpening en de voorraad;
 *   - RegistrationView (met FridgeView): tekent het venster en het tabblad Koelkast;
 *   - AdminController (via RegistrationApp): requireAdmin, showMissing en finishAdminChange;
 *   - ModalManager (via RegistrationApp): opent en sluit het venster en zet de focus terug;
 *   - config.js: SMART_FRIDGE (de tijden en grenzen).
 */
export class FridgeController {
  // Zo vaak (ms) kijkt de app of de deur te lang open staat of het venster te lang niet is gebruikt.
  static TICK_MS = 1000;

  // Zo lang (ms) na een nieuwe stap in het venster (bijvoorbeeld van de open deur naar het overzicht)
  // telt een klik op de achtergrond, de sluitknop of "Klaar" niet. Bij een dubbeltik op "Deur dicht"
  // valt de tweede tik anders op het lagere overzicht of de achtergrond en sluit het overzicht meteen,
  // zodat de medewerker niet ziet wat er is geregistreerd. Dezelfde tijd als
  // EmployeeController.GHOST_CLICK_MS bij het productvenster.
  static GHOST_CLICK_MS = 500;

  // Meldingen in de statusregel van het koelkastvenster.
  static MESSAGES = {
    opened: "De deur is open. Pak wat je wilt en sluit de deur.",
    unknownBadge: "Deze pas is niet gekoppeld aan een medewerker. De koelkast blijft dicht.",
    unknownEmployee: "Deze medewerker kan de koelkast niet openen. De koelkast blijft dicht.",
    alreadyOpen: "De koelkast is al open. Sluit eerst de deur.",
    noProducts: "Er liggen geen producten in de koelkast van jouw consumptiepunt. De koelkast blijft dicht. Vraag de beheerder om de schappen in te delen.",
    notOpened: "De deur is niet geopend. De koelkast is weer op slot.",
    nothingTaken: "Je hebt niets gepakt. Er is niets geregistreerd.",
    saveFailed: "De registratie kon niet worden opgeslagen. Er is niets geregistreerd."
  };

  // De melding als een collega zijn pas scant terwijl de deur open is op naam van een ander. Wat er
  // nu wordt gepakt, komt op naam van degene die de koelkast opende. Daarom krijgt de opening de
  // status "Controle nodig" (zie fridgeScan).
  static otherBadgeMessage(name) {
    return `De koelkast is al open op naam van ${name}. Sluit eerst de deur en open dan met je eigen pas. De beheerder kijkt naar deze opening.`;
  }

  // `app` is de controller (RegistrationApp) waar deze class bij hoort. `clock` levert de tijd en de
  // timer (dezelfde klok als AdminController). `settings` zijn de instellingen uit config.js.
  constructor(app, clock = FridgeController.realClock(), settings = SMART_FRIDGE) {
    this.app = app;
    this.clock = clock;
    this.settings = settings;
    this.fridgePhase = "closed";      // "closed", "waiting", "open" of "summary" (zie hierboven)
    this.fridgeEmployeeId = null;     // wie de koelkast nu open heeft of net heeft gesloten
    this.fridgeLayoutNow = [];        // de indeling van de schappen bij de opening die bezig is
    this.fridgeHeld = {};             // per schapnummer de gewichten van wat de medewerker in de hand heeft
    this.fridgeResult = null;         // het resultaat van de laatste opening (voor het overzicht)
    this.fridgeSaveFailed = false;    // is het opslaan van de laatste opening mislukt?
    this.lastFridgeActivity = null;   // tijdstip (ms) van de laatste invoer in het venster
    this.fridgeTimer = null;          // timer die iedere seconde checkFridgeTimers aanroept
    this.doorWarningShown = false;    // staat "De deur staat al lang open." in beeld?
    this.fridgePhaseChangedAt = -Infinity; // tijdstip (ms) van de laatste nieuwe stap (zie isFridgeGhostClick)
    this.fridgeRecognizedBy = null;   // geopend na herkenning op de beginpagina: "badge", "face" of null
    if (this.smartFridge) this.smartFridge.onNotOpened = () => this.handleFridgeNotOpened();
  }

  // Zet het venster in een nieuwe stap en onthoudt wanneer dat gebeurde (voor isFridgeGhostClick).
  setFridgePhase(phase) {
    this.fridgePhase = phase;
    this.fridgePhaseChangedAt = this.clock.now();
  }

  // Is deze klik (op de achtergrond, de sluitknop of "Klaar") een "spookklik"? Dat is zo als het de
  // tweede klik van een dubbelklik of dubbeltik is (event.detail > 1), of als het venster minder dan
  // GHOST_CLICK_MS (500 ms) geleden een nieuwe stap kreeg. Escape en Enter tellen nooit als
  // spookklik: zonder event, of met event.detail 0 (een "klik" met het toetsenbord).
  // `now` is mee te geven, zodat dit te testen is.
  isFridgeGhostClick(event, now = this.clock.now()) {
    if (!event || !(event.detail > 0)) return false;
    if (event.detail > 1) return true;
    return now - this.fridgePhaseChangedAt < FridgeController.GHOST_CLICK_MS;
  }

  // De echte klok van de browser (zoals AdminController).
  static realClock() {
    return {
      now: () => Date.now(),
      setInterval: (action, delay) => setInterval(action, delay),
      clearInterval: (timer) => clearInterval(timer)
    };
  }

  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  get smartFridge() {
    return this.app.smartFridge;
  }

  // Staat de slimme koelkast aan (SMART_FRIDGE.enabled in config.js)?
  isFridgeAvailable() {
    return Boolean(this.smartFridge?.isEnabled?.());
  }

  // ------------------------------------------------------------------
  // Het koelkastvenster openen, tekenen en sluiten
  // ------------------------------------------------------------------

  // Knop "Slimme koelkast (demo)" op de beginpagina: opent het venster met de deur dicht.
  openFridgeWindow() {
    if (!this.isFridgeAvailable() || this.fridgePhase !== "closed") return;

    this.app.openModal("#fridgeModal");
    this.setFridgePhase("waiting");
    this.view.setFridgeStatus("");
    this.view.announceFridge("");
    this.renderFridge();
    this.noteFridgeActivity();
    this.startFridgeTimer();
    // De knop "Openen (demo)" staat pas aan als er een medewerker is gekozen. Tot die tijd krijgt de
    // sluitknop de focus (niet de keuzelijst: een scan van de pas zou daar een naam kiezen).
    (this.view.$("[data-fridge-demo-open]:not([disabled])") || this.view.$("#fridgeModal .modal-close"))?.focus({ preventScroll: true });
  }

  // Demo: de knop "Openen (demo)" staat alleen aan als er in de keuzelijst een medewerker is gekozen.
  // De keuzelijst begint leeg ("Kies een medewerker"), zodat niemand de koelkast per ongeluk opent op
  // naam van de collega die bovenaan de lijst staat.
  updateFridgeDemoButton() {
    const button = this.view.$("[data-fridge-demo-open]");
    if (button) button.disabled = !this.view.$("#fridgeDemoEmployee")?.value;
  }

  // Tekent het venster opnieuw met de stap waarin het nu is.
  renderFridge() {
    this.view.renderFridgeWindow({
      phase: this.fridgePhase,
      employeeId: this.fridgeEmployeeId,
      badgeReader: Boolean(this.app.badgeReader?.isEnabled?.()),
      shelves: this.fridgePhase === "open" ? this.openShelves() : [],
      result: this.fridgeResult,
      saveFailed: this.fridgeSaveFailed,
      recognizedBy: this.fridgeRecognizedBy
    });
  }

  // Per schap: het product, hoeveel er nog op het (nagebootste) schap liggen en hoeveel de
  // medewerker van dat schap in de hand heeft.
  openShelves() {
    return this.fridgeLayoutNow.map(({ shelf, productId }) => ({
      shelf,
      productId,
      onShelf: this.smartFridge.scale(shelf)?.itemCount?.() ?? 0,
      held: this.fridgeHeld[shelf]?.length ?? 0
    }));
  }

  // Sluitknop, klik op de achtergrond en Escape. Staat de deur open, dan gaat de deur dicht
  // (closeFridgeDoor met cancel: heeft de medewerker niets gepakt, dan sluit het venster meteen met een
  // korte melding, anders verschijnt het overzicht). Anders gaat het venster dicht.
  // `event` is de klik op de achtergrond of de sluitknop (bij Escape ontbreekt het). Een spookklik
  // vlak na een nieuwe stap wordt genegeerd (isFridgeGhostClick).
  closeFridgeWindow(event) {
    if (this.isFridgeGhostClick(event)) return;
    if (this.fridgePhase === "open") {
      this.closeFridgeDoor({ cancel: true });
      return;
    }
    this.finishFridgeWindow();
  }

  // Sluit het venster en vergeet de opening. Knop "Klaar", Escape, en vanzelf na een tijd zonder
  // invoer (checkFridgeTimers). Is er toch nog een opening bezig, dan wordt die afgebroken.
  finishFridgeWindow() {
    if (this.fridgePhase === "closed") return;
    if (this.smartFridge?.isOpen()) this.smartFridge.abort();

    this.setFridgePhase("closed");
    this.fridgeEmployeeId = null;
    this.fridgeLayoutNow = [];
    this.fridgeHeld = {};
    this.fridgeResult = null;
    this.fridgeSaveFailed = false;
    this.fridgeRecognizedBy = null;
    this.lastFridgeActivity = null;
    this.stopFridgeTimer();
    this.setFridgeDoorWarning(false);
    this.view.setFridgeStatus("");
    this.app.closeModal("#fridgeModal");
  }

  // Alle gegevens zijn gewist (in een ander tabblad): een opening die bezig is, wordt afgebroken
  // zonder te registreren en het venster gaat dicht.
  abortFridge() {
    this.finishFridgeWindow();
  }

  // ------------------------------------------------------------------
  // De koelkast openen met de pas (of de demokeuze)
  // ------------------------------------------------------------------

  // Een pas is gescand terwijl het koelkastvenster open is (zie BadgeController.recognizeBadge).
  //   - de deur staat al open en het is de pas van een andere (actieve) medewerker: de scan opent niets,
  //     want er kan maar één opening tegelijk zijn. Wat de collega nu pakt, komt op naam van degene die
  //     de koelkast opende. Daarom krijgt de opening de status "Controle nodig" (SmartFridge.noteOtherBadge)
  //     en zegt de melding op wiens naam de koelkast open is (otherBadgeMessage). De beheerder ziet de
  //     opening bij de laatste openingen en in het logboek en kan zo nodig corrigeren;
  //   - de deur staat al open en het is dezelfde pas (of een onbekende pas): de scan telt niet, met de
  //     melding "De koelkast is al open. Sluit eerst de deur.";
  //   - een onbekende pas en de pas van een inactieve medewerker krijgen dezelfde melding, zoals bij
  //     het herkennen met de pas. Het slot blijft dicht;
  //   - anders gaat de koelkast open voor deze medewerker (ook vanuit het overzicht van de vorige).
  fridgeScan(code) {
    this.noteFridgeActivity();
    if (this.fridgePhase === "open") {
      const other = this.model.findEmployeeByBadge(code);
      if (other?.active && other.id !== this.fridgeEmployeeId) {
        this.smartFridge.noteOtherBadge?.();
        this.view.setFridgeStatus(FridgeController.otherBadgeMessage(this.app.employeeLabel(this.fridgeEmployeeId)), "error");
        return false;
      }
      this.view.setFridgeStatus(FridgeController.MESSAGES.alreadyOpen, "error");
      return false;
    }

    const employee = this.model.findEmployeeByBadge(code);
    if (!employee?.active) {
      this.view.setFridgeStatus(FridgeController.MESSAGES.unknownBadge, "error");
      return false;
    }
    this.fridgeRecognizedBy = null; // geopend in het koelkastvenster zelf, niet na herkenning op de beginpagina
    return this.startFridgeOpening(employee.id);
  }

  // Kan de koelkast voor deze medewerker open na herkenning (RecognitionController)? Dat kan als de
  // slimme koelkast aan staat, de medewerker actief is en op minstens één schap van zijn consumptiepunt
  // een product ligt volgens de indeling (fridgeLayout).
  canOpenFridgeFor(employeeId) {
    const employee = this.model.findEmployee(employeeId);
    if (!this.isFridgeAvailable() || !employee?.active) return false;
    return this.model.fridgeLayout(employee.pointId, this.settings).some(({ productId }) => productId);
  }

  // Na herkenning op de beginpagina (met de pas of de camera, zie RecognitionController): het
  // koelkastvenster opent en de koelkast gaat meteen open voor deze medewerker, met dezelfde stappen
  // als na een geldige passcan in het koelkastvenster (startFridgeOpening). De begroeting zegt hoe hij
  // is herkend ("Je bent herkend met de camera." of "Je bent herkend met je pas."). `how` is "badge"
  // of "face". Geeft false terug (en opent niets) als het venster al open is of de koelkast voor deze
  // medewerker niet open kan.
  openFridgeFor(employeeId, how = null) {
    if (this.fridgePhase !== "closed" || !this.canOpenFridgeFor(employeeId)) return false;

    this.app.openModal("#fridgeModal");
    this.setFridgePhase("waiting");
    this.fridgeRecognizedBy = how;
    this.view.setFridgeStatus("");
    this.view.announceFridge("");
    this.noteFridgeActivity();
    this.startFridgeTimer();
    if (this.startFridgeOpening(employeeId)) return true;
    // Ging het openen toch mis, dan blijft het venster open met de foutmelding en wacht het op een pas.
    this.fridgeRecognizedBy = null;
    this.renderFridge();
    return true;
  }

  // Knop "Liever brood of beleg? Open het productvenster" in de open koelkast: de deur gaat dicht
  // zonder iets te registreren (de medewerker heeft nog niets in zijn hand), het koelkastvenster sluit
  // en het productvenster van dezelfde medewerker opent, met dezelfde herkenning. De knop staat er
  // alleen zolang er niets in de hand is (FridgeView.openHtml). Geeft true terug als het lukte.
  switchFridgeToProducts() {
    if (this.fridgePhase !== "open" || this.handText()) return false;
    const employeeId = this.fridgeEmployeeId;
    const how = this.fridgeRecognizedBy;
    this.closeFridgeDoor({ cancel: true });
    this.finishFridgeWindow();
    this.app.openEmployeeProducts(employeeId, { recognizedBy: how });
    return true;
  }

  // Demo zonder pasjeslezer: de gekozen medewerker opent de koelkast alsof hij zijn pas toont.
  openFridgeForDemo() {
    this.noteFridgeActivity();
    const employee = this.model.findEmployee(this.view.$("#fridgeDemoEmployee")?.value);
    if (!employee?.active) {
      this.view.setFridgeStatus(FridgeController.MESSAGES.unknownEmployee, "error");
      return false;
    }
    this.fridgeRecognizedBy = null; // geopend in het koelkastvenster zelf, niet na herkenning op de beginpagina
    return this.startFridgeOpening(employee.id);
  }

  // Opent de koelkast voor deze (actieve) medewerker: de indeling van zijn consumptiepunt, de
  // beginmeting, het slot open en de deur open. Ligt er op geen enkel schap een product, dan blijft
  // de koelkast dicht. Geeft true terug als de koelkast open is.
  startFridgeOpening(employeeId) {
    if (this.fridgePhase === "open" || this.smartFridge.isOpen()) {
      this.view.setFridgeStatus(FridgeController.MESSAGES.alreadyOpen, "error");
      return false;
    }

    const employee = this.model.findEmployee(employeeId);
    const layout = this.model.fridgeLayout(employee?.pointId, this.settings);
    if (!layout.some(({ productId }) => productId)) {
      this.view.setFridgeStatus(FridgeController.MESSAGES.noProducts, "error");
      return false;
    }

    // Per schap gaat ook mee hoeveel producten erop liggen (itemCount). Daarmee rekent SmartFridge met
    // het gemeten gemiddelde gewicht van één stuk in plaats van alleen het ingestelde gewicht (zie
    // SmartFridge.effectiveUnitWeight). In de demo is dat het aantal waarmee het schap net is gevuld.
    // In productie weet de backend het uit de laatste vulbeurt en de registraties sindsdien.
    const counts = this.stockSimulatedShelves(employee.pointId, layout);
    const measuredLayout = layout.map((shelf) => (counts[shelf.shelf] > 0 ? { ...shelf, itemCount: counts[shelf.shelf] } : shelf));
    if (!this.smartFridge.start(employeeId, employee.pointId, measuredLayout)) return false;
    // In de demo opent de medewerker de deur meteen nadat het slot opengaat. Bij een echte koelkast
    // meldt de deursensor dat; gaat de deur niet open, dan sluit het slot vanzelf (handleFridgeNotOpened).
    this.smartFridge.openDoor();

    this.setFridgePhase("open");
    this.fridgeEmployeeId = employeeId;
    this.fridgeLayoutNow = layout;
    this.fridgeHeld = {};
    this.fridgeResult = null;
    this.fridgeSaveFailed = false;
    this.setFridgeDoorWarning(false);
    // De begroeting in het venster zegt al wat er moet gebeuren. Een schermlezer hoort het via de
    // live region; de statusregel wordt leeg (een oude foutmelding verdwijnt).
    this.view.setFridgeStatus("");
    this.renderFridge();
    this.view.announceFridge(FridgeController.MESSAGES.opened);
    this.app.scrollModalToTop("#fridgeModal");
    this.view.$("[data-fridge-take]:not([disabled])")?.focus({ preventScroll: true });
    return true;
  }

  // Alleen voor de simulatie: legt op ieder nagebootst schap zoveel producten als er volgens de
  // voorraad van het consumptiepunt zijn (geen negatieve aantallen). Een echte weegschaal heeft geen
  // fill(); dan wordt dit schap overgeslagen. Geeft per schapnummer terug hoeveel producten er nu op
  // liggen, bijvoorbeeld { 1: 24, 2: 24, 3: 0 }.
  stockSimulatedShelves(pointId, layout) {
    const counts = {};
    for (const { shelf, productId, unitWeight } of layout) {
      const scale = this.smartFridge.scale(shelf);
      if (typeof scale?.fill !== "function") continue;
      const stock = productId ? Number(this.model.stockEntry(pointId, productId)?.stock) || 0 : 0;
      scale.fill(Math.max(0, Math.floor(stock)), unitWeight ?? 0, this.settings.weightVariation);
      counts[shelf] = scale.itemCount?.() ?? 0;
    }
    return counts;
  }

  // Het slot is vanzelf dichtgegaan omdat de deur niet op tijd werd geopend (SmartFridge). Er is
  // niets gepakt en niets geregistreerd; het venster wacht weer op een pas.
  handleFridgeNotOpened() {
    if (this.fridgePhase !== "open") return;
    this.setFridgePhase("waiting");
    this.fridgeEmployeeId = null;
    this.fridgeHeld = {};
    this.view.setFridgeStatus(FridgeController.MESSAGES.notOpened, "error");
    this.renderFridge();
    this.noteFridgeActivity();
  }

  // ------------------------------------------------------------------
  // Pakken en terugleggen (simulatie)
  // ------------------------------------------------------------------

  // Tik op een schap: één product gaat van het nagebootste schap in de hand van de medewerker.
  takeFromShelf(shelf) {
    const number = Number(shelf);
    if (this.fridgePhase !== "open") return;
    const weight = this.smartFridge.scale(number)?.takeItem?.();
    if (weight === null || weight === undefined) return;

    this.fridgeHeld[number] = [...(this.fridgeHeld[number] || []), weight];
    this.afterHandChange(number, "gepakt", "[data-fridge-take]");
  }

  // Knop "Terugleggen": het laatst gepakte product van dit schap gaat terug op het schap.
  returnToShelf(shelf) {
    const number = Number(shelf);
    if (this.fridgePhase !== "open" || !(this.fridgeHeld[number]?.length > 0)) return;

    const weights = [...this.fridgeHeld[number]];
    const weight = weights.pop();
    this.fridgeHeld[number] = weights;
    this.smartFridge.scale(number)?.returnItem?.(weight);
    this.afterHandChange(number, "teruggelegd", "[data-fridge-return]");
  }

  // Demo: legt iets anders op een schap, zodat bij het sluiten een onverklaarbaar verschil ontstaat.
  addForeignWeight(shelf) {
    const number = Number(shelf);
    if (this.fridgePhase !== "open") return;
    this.smartFridge.scale(number)?.addWeight?.(this.settings.foreignWeightGrams);
    this.view.announceFridge(`Er ligt nu iets anders op schap ${number} (demo).`);
  }

  // Na pakken of terugleggen: het venster opnieuw tekenen, voorlezen wat er gebeurde en de focus op
  // dezelfde knop (of de andere knop van dat schap) terugzetten.
  afterHandChange(shelf, verb, buttonSelector) {
    this.noteFridgeActivity();
    this.renderFridge();
    const productId = this.fridgeLayoutNow.find((item) => item.shelf === shelf)?.productId;
    this.view.announceFridge(`${this.model.productName(productId)} ${verb}. In je hand: ${this.handText() || "niets"}.`);

    const same = this.view.$(`${buttonSelector.slice(0, -1)}="${cssAttributeValue(shelf)}"]`);
    const take = this.view.$(`[data-fridge-take="${cssAttributeValue(shelf)}"]`);
    const target = same && !same.disabled ? same : take && !take.disabled ? take : this.view.$("#fridgeCloseDoorButton");
    target?.focus?.({ preventScroll: true });
  }

  // Wat de medewerker in de hand heeft, bijvoorbeeld "2× Blikje, 1× Ei".
  handText() {
    const held = {};
    for (const { shelf, productId } of this.fridgeLayoutNow) {
      const amount = this.fridgeHeld[shelf]?.length ?? 0;
      if (productId && amount > 0) held[productId] = (held[productId] || 0) + amount;
    }
    return this.takenText(held);
  }

  // Zet aantallen per product om naar tekst, bijvoorbeeld { blikje: 2 } wordt "2× Blikje".
  takenText(taken) {
    return Object.entries(taken)
      .map(([productId, amount]) => `${amount}× ${this.model.productName(productId)}`)
      .join(", ");
  }

  // ------------------------------------------------------------------
  // De deur sluiten en registreren
  // ------------------------------------------------------------------

  // Knop "Deur dicht" (of Escape): het slot gaat dicht, SmartFridge weegt de schappen en rekent het
  // verschil om. In één keer (persist) worden de opening, de registraties (met de voorraad) en één
  // logboekregel opgeslagen. Daarna toont het venster het overzicht.
  // Met `cancel` (Escape of de sluitknop) en niets gepakt gaat het venster meteen dicht, met een korte
  // melding. De opening wordt ook dan opgeslagen: de deur is open geweest.
  // Lukt opslaan niet, dan draait persist alles terug en staat er "Er is niets geregistreerd".
  closeFridgeDoor({ cancel = false } = {}) {
    if (this.fridgePhase !== "open") return false;

    const result = this.smartFridge.finish();
    this.fridgeHeld = {};
    this.setFridgeDoorWarning(false);
    if (!result) {
      this.finishFridgeWindow();
      return false;
    }

    const saved = this.app.persist(() => this.model.addFridgeOpening(result), this.openingAudit(result));
    this.view.renderStats();
    this.fridgeResult = result;
    this.fridgeSaveFailed = !saved;
    this.setFridgePhase("summary");
    this.noteFridgeActivity();

    if (cancel && saved && result.status === "nothing") {
      this.finishFridgeWindow();
      this.view.showToast(FridgeController.MESSAGES.nothingTaken, { duration: 4000 });
      return true;
    }

    this.view.setFridgeStatus(saved ? "" : FridgeController.MESSAGES.saveFailed, saved ? "info" : "error");
    this.renderFridge();
    this.app.scrollModalToTop("#fridgeModal");
    const taken = this.takenText(result.taken);
    if (saved) this.view.announceFridge(taken ? `Je hebt gepakt: ${taken}. Dit is geregistreerd.` : FridgeController.MESSAGES.nothingTaken);
    this.view.$("[data-fridge-done]")?.focus?.({ preventScroll: true });
    return saved;
  }

  // De logboekregel van een opening, bijvoorbeeld
  // { action: "Koelkast geopend", details: "Lotte van Dijk: 2× Blikje geregistreerd (TVB · Hoofdkantoor)" }.
  // Bij een markering is de actie "Koelkast: controle nodig" en staat de reden erbij, zodat de
  // beheerder het in het logboek terugvindt.
  openingAudit(result) {
    const taken = this.takenText(result.taken);
    const issues = result.shelves
      .filter(({ flag }) => flag)
      .map((shelf) => SmartFridge.issueText(shelf, shelf.productId ? this.model.productName(shelf.productId) : null));
    if (result.longOpen) issues.push("deur stond lang open");
    if (result.otherBadge) issues.push("pas van een collega gescand terwijl de deur open stond");

    const what = taken ? `${taken} geregistreerd` : "niets gepakt";
    const extra = issues.length ? `. Controle nodig: ${issues.join(", ")}` : "";
    return {
      action: result.status === "check" ? "Koelkast: controle nodig" : "Koelkast geopend",
      details: `${this.app.employeeLabel(result.employeeId)}: ${what}${extra} (${this.app.pointLabel(result.pointId)})`
    };
  }

  // ------------------------------------------------------------------
  // Tijd: deur te lang open en venster vanzelf sluiten
  // ------------------------------------------------------------------

  // Start de timer zodra het venster opengaat (stopt bij het sluiten).
  startFridgeTimer() {
    if (this.fridgeTimer !== null) return;
    this.fridgeTimer = this.clock.setInterval(() => this.checkFridgeTimers(), FridgeController.TICK_MS);
  }

  stopFridgeTimer() {
    if (this.fridgeTimer === null) return;
    this.clock.clearInterval(this.fridgeTimer);
    this.fridgeTimer = null;
  }

  // Iedere tik, klik, toets of scroll in het koelkastvenster (zie RegistrationApp.registerPageEvents).
  noteFridgeActivity() {
    if (this.fridgePhase === "closed") return;
    this.lastFridgeActivity = this.clock.now();
  }

  // Wordt iedere seconde aangeroepen zolang het venster open is:
  //   - deur open: na SMART_FRIDGE.doorWarningMs (60 seconden) verschijnt de waarschuwing. Het venster
  //     blijft open, want de deur moet echt dicht. Wat er is gepakt, wordt na het sluiten gewogen;
  //   - deur dicht (wachten of overzicht): na SMART_FRIDGE.idleCloseMs zonder invoer gaat het venster
  //     vanzelf dicht, zodat het niet open blijft staan op de gedeelde tablet.
  // Geeft true terug als het venster is gesloten.
  checkFridgeTimers(now = this.clock.now()) {
    if (this.fridgePhase === "closed") return false;
    if (this.fridgePhase === "open") {
      this.setFridgeDoorWarning(this.smartFridge.doorOpenMs(now) >= this.settings.doorWarningMs);
      return false;
    }
    if (this.lastFridgeActivity === null) {
      this.lastFridgeActivity = now;
      return false;
    }
    if (now - this.lastFridgeActivity < this.settings.idleCloseMs) return false;
    this.finishFridgeWindow();
    return true;
  }

  // Toont of verbergt de waarschuwing; de view wordt alleen aangeroepen als er iets verandert, zodat
  // een schermlezer de waarschuwing één keer voorleest. De waarschuwing noemt ook op wiens naam de
  // koelkast open is: wie de deur open ziet staan en iets pakt, weet dan dat het niet op zijn eigen
  // naam komt.
  setFridgeDoorWarning(shown) {
    if (this.doorWarningShown === shown) return;
    this.doorWarningShown = shown;
    this.view.setDoorWarning(shown, shown && this.fridgeEmployeeId ? this.app.employeeLabel(this.fridgeEmployeeId) : null);
  }

  // ------------------------------------------------------------------
  // Beheer: tabblad Koelkast
  // ------------------------------------------------------------------

  // Tekent het tabblad Koelkast opnieuw (ook als een ander consumptiepunt wordt gekozen).
  renderFridgeAdmin() {
    this.view.renderFridgeAdmin();
  }

  // Formulier "Indeling opslaan": per schap een product (of leeg) en het gewicht van één stuk.
  // Een gewicht moet een heel getal van 1 tot en met SMART_FRIDGE.maxUnitWeight gram zijn. Een fout
  // staat onder het veld. De wijziging komt met een logboekregel in het logboek.
  saveFridgeShelves(event) {
    event?.preventDefault?.();
    if (!this.app.requireAdmin()) return false;

    const pointId = this.view.$("#fridgePointSelect")?.value;
    if (!this.model.findPoint(pointId)) {
      this.app.showMissing("Dit consumptiepunt");
      return false;
    }

    const shelves = [];
    let firstError = null;
    const fields = [...(this.view.$("#fridgeShelfFields")?.querySelectorAll("[data-fridge-shelf]") || [])];
    for (const field of fields) {
      const shelf = Number(field.dataset.fridgeShelf);
      const productId = this.view.$(`#fridgeShelfProduct${shelf}`)?.value || null;
      const weightField = this.view.$(`#fridgeShelfWeight${shelf}`);
      if (weightField?.getAttribute?.("aria-invalid") === "true") this.view.clearFieldError(weightField);

      if (!productId) {
        shelves.push({ shelf, productId: null, unitWeight: null });
        continue;
      }
      const error = this.unitWeightError(weightField?.value);
      if (error) {
        this.view.showFieldError(weightField, error);
        firstError ||= weightField;
        continue;
      }
      shelves.push({ shelf, productId, unitWeight: Number(weightField.value.trim()) });
    }
    if (firstError) {
      firstError.focus?.();
      return false;
    }

    const description = shelves
      .map(({ shelf, productId, unitWeight }) => (productId ? `schap ${shelf} ${this.model.productName(productId)} (${unitWeight} g)` : `schap ${shelf} leeg`))
      .join(", ");
    const saved = this.app.persist(
      () => this.model.saveFridgeShelves(pointId, shelves, this.settings),
      { action: "Koelkastindeling gewijzigd", details: `${this.app.pointLabel(pointId)}: ${description}` }
    );
    if (saved) this.app.finishAdminChange("Indeling van de koelkast opgeslagen");
    return saved;
  }

  // De foutmelding bij het gewicht van één stuk, of "" als het gewicht klopt.
  unitWeightError(value) {
    const text = String(value ?? "").trim();
    if (text === "") return "Vul het gewicht van één stuk in.";
    if (!/^\d+$/.test(text)) return "Gebruik alleen cijfers.";
    const weight = Number(text);
    if (weight < 1 || weight > this.settings.maxUnitWeight) return `Vul een gewicht van 1 tot en met ${this.settings.maxUnitWeight} gram in.`;
    return "";
  }
}
