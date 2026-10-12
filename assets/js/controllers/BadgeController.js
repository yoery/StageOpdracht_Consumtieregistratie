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
 *   - na een scan de medewerker opzoeken en zijn productvenster openen, of een melding geven.
 *
 * Verbonden met:
 *   - BadgeReader: herkent de scan. Deze class zet de callbacks onScan en onStart;
 *   - RegistrationApp: maakt deze class en koppelt handleBadgeKey aan de toetsen (keydown);
 *   - RegistrationModel: findEmployeeByBadge;
 *   - EmployeeController (via RegistrationApp): opent het productvenster en sluit de keuzelijst
 *     van het bedrijfsfilter;
 *   - ModalManager (via RegistrationApp): topModal, want met een open venster wordt er niemand herkend.
 */
export class BadgeController {
  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  // De pasjeslezer krijgt hier zijn callbacks: na een scan wordt de medewerker opgezocht
  // (recognizeBadge), en bij het begin van een mogelijke scan wordt onthouden waar de focus stond
  // en wat er in het zoekveld en het bedrijfsfilter stond.
  constructor(app) {
    this.app = app;
    // Toestand vlak voordat de pasjeslezer begon te typen (zie rememberSearchBeforeScan), of null.
    this.scanStart = null;
    this.badgeReader.onScan = (code) => this.recognizeBadge(code);
    this.badgeReader.onStart = () => this.rememberSearchBeforeScan();
  }

  // Onderdelen van de app die deze class gebruikt (model, view, badgeReader). Die komen steeds
  // van RegistrationApp, zodat er maar één verwijzing naar ieder onderdeel bestaat.
  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  get badgeReader() {
    return this.app.badgeReader;
  }

  // Geeft iedere toets door aan de pasjeslezer (BadgeReader). Ook als er een venster open is
  // (productvenster, beheer, een formulier): de lezer houdt dan de Enter of Tab tegen waarmee
  // een scan eindigt, zodat die niet de knop met de focus indrukt (bijvoorbeeld "Registreren").
  // De tekens zelf gaan gewoon naar het veld met de focus, zoals het veld "Pasnummer" in het
  // medewerkersformulier. Een medewerker herkennen gebeurt alleen op de beginpagina: dat
  // controleert recognizeBadge.
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
  rememberSearchBeforeScan() {
    const filter = this.view.$("#employeeCompanyFilter");
    this.scanStart = {
      focusId: globalThis.document?.activeElement?.id || null,
      search: this.view.$("#employeeSearch").value,
      filterText: filter?.value ?? "",
      filterValue: filter?.dataset.value
    };
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
  //   - hoort de pas bij een actieve medewerker, dan opent zijn productvenster met de tekst
  //     "Je bent herkend met je pas." (zie RegistrationView.renderEmployeeProducts);
  //   - anders volgt een melding. Een onbekende pas en de pas van een inactieve medewerker
  //     krijgen dezelfde melding, zodat er niets over een andere medewerker uitlekt.
  // Staat er een venster open (productvenster, beheer, een formulier), dan wordt er niemand
  // herkend. De lezer krijgt de toetsen dan wel (en houdt de afsluitende Enter of Tab tegen, zie
  // handleBadgeKey), maar hier gebeurt verder niets.
  recognizeBadge(code) {
    const filledBadgeField = this.fillBadgeFieldAfterScan(code);
    this.restoreSearchAfterScan();
    this.scanStart = null;
    if (filledBadgeField || this.app.topModal()) return;

    const employee = this.model.findEmployeeByBadge(code);
    if (!employee?.active) {
      this.view.showToast(
        "Deze pas is niet gekoppeld aan een medewerker. Kies je naam in de lijst of vraag de beheerder om de pas te koppelen.",
        { tone: "error", duration: 5000 }
      );
      return;
    }

    this.app.openEmployeeProducts(employee.id, { recognizedBy: "badge" });
  }
}
