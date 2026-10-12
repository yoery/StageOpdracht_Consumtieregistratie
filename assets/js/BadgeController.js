/**
 * BadgeController — herkennen met de pas: verbindt de pasjeslezer (BadgeReader) met de rest
 * van de app.
 *
 * Verantwoordelijkheid:
 *   - iedere toets doorgeven aan BadgeReader (handleBadgeKey);
 *   - de inhoud van het zoekveld onthouden als er een scan begint en die daarna terugzetten,
 *     zodat er geen pasnummer in het zoekveld blijft staan;
 *   - na een scan de medewerker opzoeken en zijn productvenster openen, of een melding geven.
 *
 * Verbonden met:
 *   - BadgeReader: herkent de scan. Deze class zet de callbacks onScan en onStart;
 *   - RegistrationApp: maakt deze class en koppelt handleBadgeKey aan de toetsen (keydown);
 *   - RegistrationModel: findEmployeeByBadge;
 *   - EmployeeController (via RegistrationApp): opent het productvenster;
 *   - ModalManager (via RegistrationApp): topModal, want met een open venster gebeurt er niets.
 */
export class BadgeController {
  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  // De pasjeslezer krijgt hier zijn callbacks: na een scan wordt de medewerker opgezocht
  // (recognizeBadge), en bij het begin van een mogelijke scan wordt het zoekveld onthouden.
  constructor(app) {
    this.app = app;
    this.searchBeforeScan = null; // inhoud van het zoekveld vlak voordat de pasjeslezer begon te typen
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
  // zijn tekens in het veld met de focus; staat die in het zoekveld, dan komen ze daarin.
  // Daarom wordt de inhoud van het zoekveld hier onthouden, zodat restoreSearchAfterScan die
  // na de scan kan terugzetten.
  rememberSearchBeforeScan() {
    this.searchBeforeScan = this.view.$("#employeeSearch").value;
  }

  // Zet het zoekveld terug zoals het was vóór de scan en tekent de medewerkerslijst opnieuw.
  // Zo blijft er geen pasnummer in het zoekveld staan (en verdwijnt de lijst niet achter
  // "Geen medewerker gevonden").
  restoreSearchAfterScan() {
    const search = this.view.$("#employeeSearch");
    const before = this.searchBeforeScan;
    this.searchBeforeScan = null;
    if (before === null || search.value === before) return;

    search.value = before;
    this.view.renderEmployees();
  }

  // Wordt door de pasjeslezer aangeroepen met het genormaliseerde pasnummer.
  //   - hoort de pas bij een actieve medewerker, dan opent zijn productvenster met de tekst
  //     "Je bent herkend met je pas." (zie RegistrationView.renderEmployeeProducts);
  //   - anders volgt een melding. Een onbekende pas en de pas van een inactieve medewerker
  //     krijgen dezelfde melding, zodat er niets over een andere medewerker uitlekt.
  // Staat er intussen toch een venster open, dan gebeurt er niets (de lezer luistert dan niet).
  recognizeBadge(code) {
    this.restoreSearchAfterScan();
    if (this.app.topModal()) return;

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
