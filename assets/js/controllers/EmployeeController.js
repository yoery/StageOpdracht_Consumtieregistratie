import { cssAttributeValue } from "../RegistrationView.js";

/**
 * EmployeeController — wat een medewerker op de beginpagina doet: zoeken, filteren op bedrijf,
 * producten kiezen in het persoonlijke productvenster en registreren.
 *
 * Verantwoordelijkheid:
 *   - het zoekveld en het bedrijfsfilter op de beginpagina;
 *   - het productvenster openen, tekenen en sluiten, met de keuze ("+", "−" en "Zelfde als
 *     vorige keer");
 *   - de gekozen producten in één keer registreren (via persist) en daarna de focus goed zetten.
 *
 * De keuze zelf (selectedEmployeeId, selectedProducts en recognizedBy) staat in RegistrationApp,
 * omdat ook de gezichtsherkenning, de pasjeslezer en de synchronisatie tussen tabbladen die
 * gebruiken. Deze class leest en wijzigt de keuze via this.app.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, bewaart de keuze en levert persist en employeeLabel;
 *   - RegistrationModel: de producten van een medewerker, de vorige keuze en addRegistration;
 *   - RegistrationView: tekent het productvenster en de lijst met medewerkers;
 *   - ModalManager (via RegistrationApp): onthoudt en herstelt de focus bij het productvenster;
 *   - FaceRecognitionDemo: of de demo aan staat en of de medewerker een gezicht heeft ingesteld.
 */
export class EmployeeController {
  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  constructor(app) {
    this.app = app;
  }

  // Onderdelen van de app die deze class gebruikt (model, view, faceDemo). Die komen steeds
  // van RegistrationApp, zodat er maar één verwijzing naar ieder onderdeel bestaat.
  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  get faceDemo() {
    return this.app.faceDemo;
  }

  // ------------------------------------------------------------------
  // Zoeken en filteren op de beginpagina
  // ------------------------------------------------------------------

  // Wist de zoekterm en het bedrijfsfilter, zodat alle medewerkers weer zichtbaar zijn
  // (knop in de lege toestand "Geen medewerker gevonden").
  clearSearch() {
    const search = this.view.$("#employeeSearch");
    search.value = "";
    delete this.view.$("#employeeCompanyFilter").dataset.value;
    this.view.renderAll();
    search.focus();
  }

  // Wordt aangeroepen als de gebruiker typt in het bedrijfsfilter op de openbare pagina.
  onCompanyFilterInput() {
    const input = this.view.$("#employeeCompanyFilter");
    delete input.dataset.value;
    this.filterCompanyOptions("#companyFilterOptions", input.value);
    this.app.show("#companyFilterOptions");
    this.view.renderEmployees();
  }

  // Filtert de compacte bedrijfskeuzelijst terwijl de gebruiker typt.
  filterCompanyOptions(selector, query) {
    const normalizedQuery = query.toLowerCase().trim();

    this.view.$(selector).querySelectorAll("button").forEach((option) => {
      const matches = option.textContent.toLowerCase().includes(normalizedQuery);
      option.classList.toggle("hidden", Boolean(normalizedQuery) && !matches);
    });
  }

  // Kiest een bedrijf uit de keuzelijst van het bedrijfsfilter.
  // Bij "Alle bedrijven" blijft het veld leeg, zodat de grijze voorbeeldtekst weer zichtbaar is
  // (net als bij het starten) en je direct een bedrijfsnaam kunt typen.
  // Door het typen kunnen bedrijven in de keuzelijst verborgen zijn; die worden weer getoond,
  // zodat bij het volgende openen alle bedrijven te kiezen zijn.
  selectCompanyFilterOption(option) {
    const filter = this.view.$("#employeeCompanyFilter");
    const value = option.dataset.companyValue;
    filter.dataset.value = value;
    filter.value = value === "all" ? "" : option.textContent;
    this.filterCompanyOptions("#companyFilterOptions", "");
    this.app.hide("#companyFilterOptions");
    this.view.renderEmployees();
  }

  // ------------------------------------------------------------------
  // Productvenster: producten kiezen en registreren
  // ------------------------------------------------------------------

  // Opent het persoonlijke productvenster met een lege keuze.
  // `recognized` is true als de medewerker net met de camera is herkend (demo).
  // `recognizedBy` zegt hoe de medewerker is herkend: "face" (camera) of "badge" (pas, zie
  // recognizeBadge). Zonder herkenning (naam aangeklikt) blijft het null.
  // De focus gaat naar de eerste "+"-knop (of naar de sluitknop als er geen producten zijn),
  // zodat je met het toetsenbord en een schermlezer meteen in het venster begint.
  // De view toont het venster zelf; hier wordt alleen onthouden waar de focus vandaan kwam,
  // zodat die na het sluiten terug kan (zie closeModal).
  openEmployeeProducts(employeeId, { recognized = false, recognizedBy = recognized ? "face" : null } = {}) {
    this.app.rememberOpener("#employeeProductsModal");
    this.app.selectedEmployeeId = employeeId;
    this.app.selectedProducts = {};
    this.app.recognizedBy = recognizedBy;
    this.renderProductWindow();

    const firstPlus = this.view.$("#employeeProductList [data-product-increment]");
    (firstPlus || this.view.$("#employeeProductsModal .modal-close"))?.focus();
  }

  // Tekent het productvenster opnieuw, met de status van de demo gezichtsherkenning.
  // Had een "+"- of "−"-knop de focus, dan krijgt dezelfde knop die na het tekenen terug.
  // Zo kun je met het toetsenbord meerdere keren achter elkaar op "+" drukken.
  renderProductWindow() {
    const focused = globalThis.document?.activeElement;
    const incrementId = focused?.dataset?.productIncrement;
    const decrementId = focused?.dataset?.productDecrement;

    this.removeUnavailableSelections();
    this.view.renderEmployeeProducts(this.app.selectedEmployeeId, this.app.selectedProducts, {
      available: this.faceDemo.isAvailable(),
      enrolled: this.faceDemo.isEnrolled(this.app.selectedEmployeeId),
      recognized: this.app.recognizedByFace,
      recognizedByBadge: this.app.recognizedBy === "badge"
    });

    // De product-id wordt met cssAttributeValue veilig gemaakt voor de zoekopdracht (selector).
    if (incrementId) {
      this.view.$(`[data-product-increment="${cssAttributeValue(incrementId)}"]`)?.focus();
    } else if (decrementId) {
      // Staat het aantal weer op 0, dan is de "−" uitgeschakeld; de focus gaat dan naar de "+" ernaast.
      const minus = this.view.$(`[data-product-decrement="${cssAttributeValue(decrementId)}"]`);
      const plus = this.view.$(`[data-product-increment="${cssAttributeValue(decrementId)}"]`);
      (minus && !minus.disabled ? minus : plus)?.focus();
    }
  }

  // Haalt producten uit de keuze die de medewerker niet (meer) kan kiezen. Dat gebeurt als een
  // ander tabblad het aanbod van het consumptiepunt wijzigt of een product verwijdert terwijl dit
  // productvenster open is. Zonder deze stap telt "Registreren (n)" die producten nog mee en
  // worden ze toch geregistreerd.
  removeUnavailableSelections() {
    const offeredIds = this.model.productsForEmployee(this.app.selectedEmployeeId).map((product) => product.id);

    for (const productId of Object.keys(this.app.selectedProducts)) {
      if (!offeredIds.includes(productId)) delete this.app.selectedProducts[productId];
    }
  }

  // "Zelfde als vorige keer": neemt de keuze van de vorige keer over. De medewerker
  // ziet de aantallen en bevestigt zelf met Registreren.
  repeatLastSelection() {
    this.app.selectedProducts = { ...this.model.lastSelection(this.app.selectedEmployeeId) };
    this.renderProductWindow();
    this.focusProductWindowAction();
  }

  // Telt één stuk op bij een gekozen product (de "+"-knop in het productvenster).
  incrementProduct(productId) {
    this.app.selectedProducts[productId] = (this.app.selectedProducts[productId] || 0) + 1;
    this.renderProductWindow();
  }

  // Haalt één stuk af van een gekozen product (de "−"-knop), maar nooit onder 0.
  // Zo kan een medewerker een vergissing herstellen zonder opnieuw te beginnen.
  decrementProduct(productId) {
    const current = this.app.selectedProducts[productId] || 0;
    if (current === 0) return;

    this.app.selectedProducts[productId] = current - 1;
    this.renderProductWindow();
  }

  // Maakt een korte samenvatting van de keuze, bijvoorbeeld "2× Blikje, 1× Ei".
  selectionSummary() {
    const parts = [];

    for (const [productId, amount] of Object.entries(this.app.selectedProducts)) {
      if (amount > 0) parts.push(`${amount}× ${this.model.productName(productId)}`);
    }

    return parts.join(", ");
  }

  // Sluit het persoonlijke productvenster en vergeet de keuze. De focus gaat terug naar de
  // medewerkerrij (of knop) waarmee het venster werd geopend.
  closeEmployeeProducts() {
    this.app.closeModal("#employeeProductsModal");
    this.app.selectedProducts = {};
    this.app.selectedEmployeeId = null;
    this.app.recognizedBy = null;
  }

  // Na het opslaan gaat eerst het venster dicht en wordt daarna de lijst opnieuw getekend.
  // Door het tekenen verdwijnt de oude medewerkerrij waarmee het venster werd geopend; dan krijgt
  // de nieuwe rij van dezelfde medewerker de focus (zie focusEmployeeRow). Zo hoeft iemand met
  // een toetsenbord of schermlezer niet opnieuw te zoeken waar hij was.
  registerSelectedProducts() {
    this.removeUnavailableSelections();
    const amounts = Object.values(this.app.selectedProducts);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);

    if (!this.app.selectedEmployeeId || total === 0) {
      // Het venster opnieuw tekenen, zodat de teller op "Registreren" weer klopt.
      if (this.app.selectedEmployeeId) this.renderProductWindow();
      this.view.showToast("Kies eerst minimaal één product", { tone: "error" });
      return;
    }

    // De samenvatting wordt vóór het opslaan gemaakt, omdat de keuze daarna wordt gewist.
    const message = `${this.app.employeeLabel(this.app.selectedEmployeeId)}: ${this.selectionSummary()} geregistreerd`;

    const saved = this.app.persist(() => {
      for (const [productId, amount] of Object.entries(this.app.selectedProducts)) {
        for (let count = 0; count < amount; count += 1) {
          this.model.addRegistration(this.app.selectedEmployeeId, productId);
        }
      }
    });
    if (!saved) return;

    // Onthouden vóór het sluiten: daarna zijn de medewerker en de opener vergeten.
    const employeeId = this.app.selectedEmployeeId;
    const opener = this.app.modalOpeners.get(this.view.$("#employeeProductsModal"));
    this.closeEmployeeProducts();
    this.view.renderAll();
    this.focusEmployeeRow(employeeId, opener);

    // Op een gedeelde tablet moet de medewerker kunnen lezen voor wie en wat er is opgeslagen,
    // daarom blijft deze melding langer staan.
    this.view.showToast(message, { tone: "success", duration: 4000 });
  }

  // Zet de focus op de (nieuwe) rij van deze medewerker in de lijst, maar alleen als het element
  // waarmee het productvenster werd geopend niet meer op de pagina staat (de lijst is opnieuw
  // getekend). Staat de opener er nog, zoals de knop "Herken mij", dan heeft closeModal de
  // focus daar al teruggezet. De id wordt met cssAttributeValue veilig gemaakt voor de selector.
  focusEmployeeRow(employeeId, opener) {
    if (opener?.isConnected) return;
    this.view.$(`[data-open-employee="${cssAttributeValue(employeeId)}"]`)?.focus();
  }

  // Na een knop die het productvenster opnieuw tekent (zoals "Zelfde als vorige keer") bestaat
  // die knop niet meer. De focus gaat dan naar "Registreren", of naar de sluitknop als er geen
  // producten zijn, zodat de focus niet achter het venster verdwijnt.
  focusProductWindowAction() {
    const registerButton = this.view.$("#registerSelectedProductsButton");
    const target = registerButton.classList.contains("hidden")
      ? this.view.$("#employeeProductsModal .modal-close")
      : registerButton;
    target?.focus();
  }
}
