import { ControllerPart } from "./ControllerPart.js";

/**
 * BadgeController — herkennen met de pas: verbindt de pasjeslezer (BadgeReader) met de rest
 * van de app.
 *
 * Verantwoordelijkheid:
 *   - iedere toets doorgeven aan BadgeReader (handleBadgeKey);
 *   - de inhoud van het zoekveld en het bedrijfsfilter onthouden als er een scan begint en die
 *     daarna terugzetten, zodat er geen pasnummer in blijft staan;
 *   - een scan in het veld "Pasnummer" van het medewerkersformulier: het oude nummer vervangen
 *     door het nieuwe (fillBadgeFieldAfterScan);
 *   - na een scan de medewerker opzoeken en RecognitionController laten bepalen wat er opent
 *     (de vraag over gezichtsherkenning of het productvenster), of een melding geven;
 *   - een scan terwijl het productvenster van een collega open is: dat venster vervangen door
 *     het venster van de gescande pas (replaceProductWindow).
 *
 * Verbonden met:
 *   - BadgeReader: herkent de scan. Deze class zet de callbacks onScan en onStart;
 *   - RegistrationApp: maakt deze class en koppelt handleBadgeKey aan de toetsen (keydown);
 *   - RegistrationModel: findEmployeeByBadge;
 *   - EmployeeController (via RegistrationApp): opent het productvenster en sluit de keuzelijst
 *     van het bedrijfsfilter;
 *   - ModalManager (via RegistrationApp): topModal, want met een ander open venster dan het
 *     productvenster wordt er niemand herkend;
 *   - RecognitionController (via RegistrationApp): afterRecognition na een geldige scan op de beginpagina.
 */
export class BadgeController extends ControllerPart {
  // Melding als er een pas wordt gescand terwijl een ander venster dan het productvenster open is.
  static CLOSE_WINDOW_FIRST = "Sluit eerst het open venster om je pas te gebruiken.";

  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  // De pasjeslezer krijgt hier zijn callbacks: na een scan wordt de medewerker opgezocht
  // (recognizeBadge), en bij het begin van een mogelijke scan wordt onthouden waar de focus stond
  // en wat er in het zoekveld en het bedrijfsfilter stond.
  constructor(app) {
    super(app);
    // Toestand vlak voordat de pasjeslezer begon te typen (zie rememberSearchBeforeScan), of null.
    this.scanStart = null;
    this.badgeReader.onScan = (code) => this.recognizeBadge(code);
    this.badgeReader.onStart = () => this.rememberSearchBeforeScan();
  }

  // Ook badgeReader komt van RegistrationApp, net als model en view (zie ControllerPart).
  get badgeReader() {
    return this.app.badgeReader;
  }

  // Geeft iedere toets door aan de pasjeslezer (BadgeReader). Ook als er een venster open is
  // (productvenster, beheer, een formulier): de lezer houdt dan de Enter of Tab tegen waarmee
  // een scan eindigt, zodat die niet de knop met de focus indrukt (bijvoorbeeld "Registreren").
  // De tekens zelf gaan gewoon naar het veld met de focus, zoals het veld "Pasnummer" in het
  // medewerkersformulier. Een medewerker herkennen gebeurt alleen op de beginpagina of in het
  // productvenster: dat controleert recognizeBadge.
  handleBadgeKey(event) {
    this.badgeReader.handleKey(event);
  }

  // Wordt door de pasjeslezer aangeroepen als er (misschien) een scan begint. De lezer typt
  // zijn tekens in het veld met de focus. Daarom wordt hier onthouden:
  //   - welk veld de focus had (de id);
  //   - de inhoud van het zoekveld;
  //   - de tekst en de gekozen waarde (dataset.value) van het bedrijfsfilter: typen in het filter
  //     wist de bedrijfskeuze en opent de keuzelijst (zie EmployeeController.onCompanyFilterInput).
  // restoreSearchAfterScan en fillBadgeFieldAfterScan (focus in het veld "Pasnummer") zetten dat
  // na de scan goed.
  // Staat de focus in een ander tekstveld (bijvoorbeeld het e-mailadres bij het inloggen, een zoekveld
  // in het beheer of de naam in het medewerkersformulier), dan wordt ook dat veld met zijn inhoud
  // onthouden (field en fieldValue), zodat restoreSearchAfterScan het pasnummer er weer uit haalt.
  rememberSearchBeforeScan() {
    const filter = this.view.$("#employeeCompanyFilter");
    const focused = globalThis.document?.activeElement;
    const field = BadgeController.isOtherTextField(focused) ? focused : null;
    this.scanStart = {
      focusId: focused?.id || null,
      search: this.view.$("#employeeSearch").value,
      filterText: filter?.value ?? "",
      filterValue: filter?.dataset.value,
      field,
      fieldValue: field ? field.value : null
    };
  }

  // Is dit een tekstveld waarin de lezer per ongeluk een pasnummer kan typen, anders dan het zoekveld,
  // het bedrijfsfilter (die hebben hun eigen herstel) en het veld "Pasnummer" (daar hoort het nummer)?
  // Vinkjes, keuzerondjes en knoppen tellen niet mee.
  static isOtherTextField(element) {
    if (!element || !["INPUT", "TEXTAREA"].includes(element.tagName)) return false;
    if (["employeeSearch", "employeeCompanyFilter", "newEmployeeBadgeId"].includes(element.id)) return false;
    return !["checkbox", "radio", "button", "submit", "reset", "file", "hidden"].includes(String(element.type || "").toLowerCase());
  }

  // Zet het zoekveld en het bedrijfsfilter terug zoals ze waren vóór de scan en tekent de
  // medewerkerslijst opnieuw. Zo blijft er geen pasnummer in het zoekveld of het filter staan (en
  // verdwijnt de lijst niet achter "Geen medewerker gevonden"). Begon de scan in het
  // bedrijfsfilter, dan komt ook de bedrijfskeuze terug en gaat de keuzelijst weer dicht.
  restoreSearchAfterScan() {
    const start = this.scanStart;
    if (!start) return;

    const search = this.view.$("#employeeSearch");
    let changed = false;
    if (search.value !== start.search) {
      search.value = start.search;
      changed = true;
    }

    if (start.focusId === "employeeCompanyFilter") {
      const filter = this.view.$("#employeeCompanyFilter");
      filter.value = start.filterText;
      if (start.filterValue === undefined) delete filter.dataset.value;
      else filter.dataset.value = start.filterValue;
      this.app.filterCompanyOptions("#companyFilterOptions", "");
      this.app.setCompanyOptionsOpen(false);
      changed = true;
    }

    if (changed) this.view.renderEmployees();
    this.restoreOtherFieldAfterScan(start);
  }

  // Begon de scan in een ander tekstveld (zie rememberSearchBeforeScan), dan heeft de lezer het
  // pasnummer daar ingetypt, bijvoorbeeld "04A1B2C3admin@tvb.nl" in het e-mailadres van het inloggen
  // of "Lotte04A1B2C3" in de voornaam. Dan krijgt het veld de inhoud van vóór de scan terug. Daarna
  // volgt een input-event, zodat een zoekveld in het beheer de lijst weer tekent met de oude inhoud.
  restoreOtherFieldAfterScan(start) {
    const field = start?.field;
    if (!field || field.value === start.fieldValue) return;
    field.value = start.fieldValue;
    if (typeof field.dispatchEvent === "function" && typeof Event === "function") {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Begon de scan in het veld "Pasnummer" van het medewerkersformulier, dan heeft de lezer zijn
  // tekens achter het oude nummer getypt (bijvoorbeeld "04A1B2C30499AABB"). Dan komt in het veld
  // alleen het nieuwe, gelijkgemaakte pasnummer te staan. Geeft true terug als dat zo was.
  fillBadgeFieldAfterScan(code) {
    if (this.scanStart?.focusId !== "newEmployeeBadgeId") return false;

    const field = this.view.$("#newEmployeeBadgeId");
    field.value = code;
    if (field.getAttribute?.("aria-invalid") === "true") this.view.clearFieldError(field);
    return true;
  }

  // Wordt door de pasjeslezer aangeroepen met het genormaliseerde pasnummer.
  //   - begon de scan in het veld "Pasnummer", dan komt het nummer in dat veld (zie
  //     fillBadgeFieldAfterScan) en wordt er niemand herkend;
  //   - staat er een ander venster open dan het productvenster (beheer, een formulier, het
  //     cameravenster of "Registratie verwijderen"), dan wordt er niemand herkend en volgt de
  //     melding "Sluit eerst het open venster om je pas te gebruiken.";
  //   - hoort de pas bij een actieve medewerker, dan gaat RecognitionController.afterRecognition verder:
  //     heeft hij nog geen gezichtsherkenning (demo, met camera) en niet eerder Nee gezegd, dan eerst de
  //     vraag "Gezichtsherkenning nog niet ingesteld. Wil je dit?". Daarna opent zijn productvenster,
  //     met de begroeting "Je bent herkend met je pas.";
  //   - anders volgt een melding. Een onbekende pas en de pas van een inactieve medewerker
  //     krijgen dezelfde melding, zodat er niets over een andere medewerker uitlekt.
  // Staat het productvenster open (zie replaceProductWindow):
  //   - van dezelfde medewerker: het venster blijft open met de keuze die er al stond;
  //   - van een collega: dat venster gaat dicht zonder op te slaan (er was nog niet op
  //     Registreren getikt) en het venster van de gescande pas gaat open. Zo hoeft de volgende
  //     gebruiker het vergeten venster van een collega niet eerst te sluiten.
  // De lezer houdt in alle gevallen de afsluitende Enter of Tab tegen (zie handleBadgeKey).
  recognizeBadge(code) {
    const filledBadgeField = this.fillBadgeFieldAfterScan(code);
    this.restoreSearchAfterScan();
    this.scanStart = null;
    if (filledBadgeField) return;
    // "Houd je pas tegen de lezer" van Snellere optie instellen staat open: de pas wordt gekoppeld.
    if (this.app.badgeLinkEmployeeId && this.app.linkScannedBadge?.(code)) return;

    if (!this.canOpenAfterScan()) return;

    // Met een server zoekt de server de pas op: de pasnummers van anderen komen niet in de browser
    // (security audit AF-08). In de demo zoekt de browser zelf.
    if (typeof this.app.server?.recognizeBadge === "function") {
      return this.recognizeBadgeOnServer(code);
    }
    this.openAfterScan(this.model.findEmployeeByBadge(code));
  }

  // Mag er na een scan iets opengaan? Niet als er een ander venster dan het productvenster open is.
  canOpenAfterScan() {
    const openModal = this.app.topModal();
    const productWindowOpen = Boolean(openModal) && openModal === this.view.$("#employeeProductsModal");
    if (openModal && !productWindowOpen) {
      this.view.showToast(BadgeController.CLOSE_WINDOW_FIRST, { tone: "error", duration: 5000 });
      return false;
    }
    return true;
  }

  // Vraagt de server van wie de pas is, en gaat daarna verder zoals in de demo. Is de server niet
  // bereikbaar, dan zegt een melding dat. Kwam er intussen een ander venster in beeld, dan opent er niets.
  async recognizeBadgeOnServer(code) {
    const result = await this.app.server.recognizeBadge(code);
    if (!result.ok) {
      this.view.showToast(result.message, { tone: "error", duration: 6000 });
      return;
    }
    if (!this.canOpenAfterScan()) return;
    this.openAfterScan(result.employeeId ? this.model.findEmployee(result.employeeId) : null);
  }

  // Opent na een scan het productvenster van de medewerker (via RecognitionController), of zegt dat
  // de pas niet is gekoppeld.
  openAfterScan(employee) {
    if (!employee?.active) {
      this.view.showToast(BadgeController.NOT_LINKED, { tone: "error", duration: 5000 });
      return;
    }

    const openModal = this.app.topModal();
    const productWindowOpen = Boolean(openModal) && openModal === this.view.$("#employeeProductsModal");
    if (productWindowOpen && this.replaceProductWindow(employee.id)) return;
    // Wat er opent, bepaalt RecognitionController: eerst eventueel de vraag over gezichtsherkenning,
    // daarna het productvenster.
    this.app.afterRecognition(employee.id, "badge");
  }

  static NOT_LINKED = "Deze pas is niet gekoppeld aan een medewerker. Kies je naam in de lijst of vraag de beheerder om de pas te koppelen.";

  // Een pas wordt gescand terwijl het productvenster open is. Is het venster van dezelfde
  // medewerker, dan blijft het open: de keuze blijft staan en de scan telt als invoer (de tijd tot
  // het automatisch sluiten begint opnieuw). Was hij nog niet herkend (naam aangetikt), dan is hij
  // dat nu: de begroeting krijgt "Je bent herkend met je pas." Geeft dan true terug.
  // Is het venster van een collega, dan gaat het dicht zonder op te slaan, worden het zoekveld en
  // het bedrijfsfilter leeggemaakt (net als na automatisch sluiten) en geeft deze methode false
  // terug: recognizeBadge opent daarna het venster van de gescande pas.
  replaceProductWindow(employeeId) {
    if (employeeId === this.app.selectedEmployeeId) {
      this.app.noteProductActivity();
      if (!this.app.recognizedBy) {
        this.app.recognizedBy = "badge";
        this.app.renderProductWindow();
      }
      return true;
    }

    this.app.closeEmployeeProducts();
    this.app.resetEmployeeSearch();
    return false;
  }
}
