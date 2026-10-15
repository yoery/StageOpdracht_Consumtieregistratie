import { cssAttributeValue } from "../RegistrationView.js";
import { EMPLOYEE_IDLE_CLOSE_MS, EMPLOYEE_IDLE_WARNING_MS } from "../config.js";

/**
 * EmployeeController — wat een medewerker op de beginpagina doet: zoeken, filteren op bedrijf,
 * producten kiezen in het persoonlijke productvenster en registreren.
 *
 * Verantwoordelijkheid:
 *   - het zoekveld en het bedrijfsfilter op de beginpagina, en die weer leegmaken na registreren
 *     of na automatisch sluiten (resetEmployeeSearch);
 *   - het productvenster openen, tekenen en sluiten, met de keuze ("+", "−" en, na herkenning
 *     met de pas of de camera, "Zelfde als vorige keer");
 *   - het productvenster vanzelf sluiten als het 75 seconden niet is gebruikt
 *     (EMPLOYEE_IDLE_CLOSE_MS in config.js), met in de laatste 10 seconden een waarschuwing;
 *   - de gekozen producten in één keer registreren (via persist) en daarna de focus goed zetten.
 *
 * De keuze zelf (selectedEmployeeId, selectedProducts en recognizedBy) staat in RegistrationApp,
 * omdat ook de gezichtsherkenning, de pasjeslezer en de synchronisatie tussen tabbladen die
 * gebruiken. Deze class leest en wijzigt de keuze via this.app.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, bewaart de keuze en levert persist en employeeLabel;
 *   - config.js: EMPLOYEE_IDLE_CLOSE_MS en EMPLOYEE_IDLE_WARNING_MS (automatisch sluiten);
 *   - RegistrationModel: de producten van een medewerker, de vorige keuze en addRegistration;
 *   - RegistrationView: tekent het productvenster en de lijst met medewerkers;
 *   - ModalManager (via RegistrationApp): onthoudt en herstelt de focus bij het productvenster;
 *   - FaceRecognitionDemo: of de demo aan staat en of de medewerker een gezicht heeft ingesteld.
 */
export class EmployeeController {
  // Zo lang (in milliseconden) na het sluiten van het productvenster telt een klik op een
  // medewerkerrij niet (zie isGhostRowClick).
  static GHOST_CLICK_MS = 500;

  // Zo vaak kijkt de app of het productvenster te lang niet is gebruikt (zie startProductIdleWatch).
  // Iedere seconde, zodat de waarschuwing op tijd verschijnt.
  static PRODUCT_IDLE_CHECK_MS = 1000;

  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  // `clock` levert de tijd en de timer voor het automatisch sluiten van het productvenster (dezelfde
  // klok als AdminController). De unit tests geven een nep-klok mee, zodat ze niet 75 seconden
  // hoeven te wachten. `idleCloseMs` en `idleWarningMs` komen uit config.js.
  constructor(app, clock = EmployeeController.realClock(), idleCloseMs = EMPLOYEE_IDLE_CLOSE_MS, idleWarningMs = EMPLOYEE_IDLE_WARNING_MS) {
    this.app = app;
    this.clock = clock;
    this.idleCloseMs = idleCloseMs;
    this.idleWarningMs = idleWarningMs;
    this.productWindowClosedAt = 0;   // tijdstip (ms) waarop het productvenster het laatst sloot
    this.lastProductActivity = null;  // tijdstip (ms) van de laatste invoer in het open productvenster
    this.productIdleTimer = null;     // timer die regelmatig closeProductWindowIfIdle aanroept
    this.idleWarningShown = false;    // staat de regel "Venster sluit zo." nu in het venster?
  }

  // De echte klok van de browser: Date.now() en setInterval/clearInterval (zoals AdminController).
  static realClock() {
    return {
      now: () => Date.now(),
      setInterval: (action, delay) => setInterval(action, delay),
      clearInterval: (timer) => clearInterval(timer)
    };
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

  // Maakt het zoekveld en het bedrijfsfilter leeg en zet de lijst weer bovenaan in beeld. Wordt
  // gebruikt als een medewerker klaar is: na een geslaagde registratie, als het productvenster
  // vanzelf sluit en als een pas het open venster van een collega vervangt. Zo begint de volgende
  // gebruiker op de gedeelde tablet met de volledige lijst, en blijft de zoekterm van de vorige
  // gebruiker (een deel van zijn naam) niet staan.
  // Het filter krijgt weer "Alle bedrijven": de tekst, de gekozen waarde (dataset.value) en
  // aria-selected op de opties (populateCompanyFilter tekent die opnieuw via renderAll), en de
  // keuzelijst gaat dicht (aria-expanded="false"). De focus wordt hier niet verplaatst: dat doet
  // de methode die resetEmployeeSearch aanroept.
  resetEmployeeSearch() {
    this.view.$("#employeeSearch").value = "";
    const filter = this.view.$("#employeeCompanyFilter");
    filter.value = "";
    filter.dataset.value = "all";
    this.filterCompanyOptions("#companyFilterOptions", "");
    this.setCompanyOptionsOpen(false);
    this.view.renderAll();
    this.view.scrollEmployeeListToTop?.();
  }

  // Wordt aangeroepen als de gebruiker typt in het bedrijfsfilter op de openbare pagina.
  onCompanyFilterInput() {
    const input = this.view.$("#employeeCompanyFilter");
    delete input.dataset.value;
    this.filterCompanyOptions("#companyFilterOptions", input.value);
    this.setCompanyOptionsOpen(true);
    this.view.renderEmployees();
  }

  // Opent of sluit de keuzelijst van het bedrijfsfilter. aria-expanded op het invoerveld en de
  // pijlknop gaat mee, zodat een schermlezer weet of de lijst open is.
  setCompanyOptionsOpen(open) {
    if (open) this.app.show("#companyFilterOptions");
    else this.app.hide("#companyFilterOptions");
    for (const selector of ["#employeeCompanyFilter", "[data-toggle-company-filter]"]) {
      this.view.$(selector)?.setAttribute("aria-expanded", String(open));
    }
  }

  // Escape in het bedrijfsfilter: sluit de keuzelijst als die open is. Geeft true terug als de
  // lijst open was (dan doet Escape verder niets, zie RegistrationApp.registerKeyboardEvents).
  closeCompanyOptions() {
    const options = this.view.$("#companyFilterOptions");
    if (!options || options.classList.contains("hidden")) return false;
    this.setCompanyOptionsOpen(false);
    return true;
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
    this.view.$("#companyFilterOptions").querySelectorAll("[data-company-value]").forEach((item) => {
      item.setAttribute("aria-selected", String(item.dataset.companyValue === value));
    });
    this.setCompanyOptionsOpen(false);
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
    this.view.announce?.(""); // de live region begint leeg (zie incrementProduct)
    this.view.hideToast?.();  // een oude melding staat niet over de knop Registreren
    // Openen telt als invoer: de 75 seconden tot het automatisch sluiten beginnen nu.
    this.lastProductActivity = this.clock.now();
    this.setIdleWarning(false);
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
  // De knop staat er alleen als de medewerker is herkend met de pas of de camera (zie
  // RegistrationView.renderEmployeeProducts). Wordt deze methode toch aangeroepen na kiezen op
  // naam, dan gebeurt er niets, zodat de vorige keuze van een collega niet zichtbaar wordt.
  repeatLastSelection() {
    if (!this.app.recognizedBy) return;
    this.app.selectedProducts = { ...this.model.lastSelection(this.app.selectedEmployeeId) };
    this.renderProductWindow();
    this.focusProductWindowAction();
  }

  // Telt één stuk op bij een gekozen product (de "+"-knop in het productvenster).
  // Een schermlezer leest daarna het nieuwe aantal voor, bijvoorbeeld "Blikje: 2" (de vaste live
  // region #productLiveStatus, zie RegistrationView.announce).
  incrementProduct(productId) {
    this.app.selectedProducts[productId] = (this.app.selectedProducts[productId] || 0) + 1;
    this.renderProductWindow();
    this.view.announce?.(`${this.model.productName(productId)}: ${this.app.selectedProducts[productId]}`);
  }

  // Haalt één stuk af van een gekozen product (de "−"-knop), maar nooit onder 0.
  // Zo kan een medewerker een vergissing herstellen zonder opnieuw te beginnen.
  decrementProduct(productId) {
    const current = this.app.selectedProducts[productId] || 0;
    if (current === 0) return;

    this.app.selectedProducts[productId] = current - 1;
    this.renderProductWindow();
    this.view.announce?.(`${this.model.productName(productId)}: ${this.app.selectedProducts[productId]}`);
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
  // medewerkerrij (of knop) waarmee het venster werd geopend. Het tijdstip wordt onthouden voor
  // isGhostRowClick.
  closeEmployeeProducts() {
    this.app.closeModal("#employeeProductsModal");
    this.app.selectedProducts = {};
    this.app.selectedEmployeeId = null;
    this.app.recognizedBy = null;
    this.productWindowClosedAt = Date.now();
    this.lastProductActivity = null;
    this.setIdleWarning(false);
  }

  // ------------------------------------------------------------------
  // Productvenster automatisch sluiten na een tijd zonder invoer
  // ------------------------------------------------------------------

  // Start de timer die iedere seconde kijkt of het productvenster te lang niet is gebruikt
  // (closeProductWindowIfIdle). Wordt één keer aangeroepen bij het starten van de app
  // (RegistrationApp.initialize). De timer loopt altijd, net als die voor het automatisch uitloggen
  // van de beheerder: zonder open productvenster doet de controle niets.
  startProductIdleWatch() {
    if (this.productIdleTimer !== null) return;
    this.productIdleTimer = this.clock.setInterval(() => this.closeProductWindowIfIdle(), EmployeeController.PRODUCT_IDLE_CHECK_MS);
  }

  // Stopt de timer van startProductIdleWatch (bijvoorbeeld in een test).
  stopProductIdleWatch() {
    if (this.productIdleTimer === null) return;
    this.clock.clearInterval(this.productIdleTimer);
    this.productIdleTimer = null;
  }

  // Wordt aangeroepen bij iedere tik, klik, toets, aanraking of scroll in het productvenster (zie
  // RegistrationApp.registerPageEvents). De tijd tot het automatisch sluiten begint dan opnieuw en
  // de waarschuwing verdwijnt. Zonder open productvenster gebeurt er niets.
  noteProductActivity() {
    if (!this.app.selectedEmployeeId) return;
    this.lastProductActivity = this.clock.now();
    this.setIdleWarning(false);
  }

  // Sluit het productvenster als het langer dan `idleCloseMs` (75 seconden) niet is gebruikt. De keuze
  // wordt niet opgeslagen (er is niet op Registreren getikt). Daarna zijn het zoekveld en het
  // bedrijfsfilter weer leeg (resetEmployeeSearch). In de laatste `idleWarningMs` (10 seconden)
  // staat in het venster "Venster sluit zo. Tik om door te gaan."
  // Staat het cameravenster boven het productvenster (gezicht instellen, demo), dan is de medewerker
  // daar bezig: de tijd begint dan steeds opnieuw. Geeft true terug als het venster is gesloten.
  closeProductWindowIfIdle(now = this.clock.now()) {
    if (!this.app.selectedEmployeeId) return false;

    const cameraOpen = this.view.$("#faceModal")?.classList.contains("hidden") === false;
    if (this.lastProductActivity === null || cameraOpen) {
      this.lastProductActivity = now;
      this.setIdleWarning(false);
      return false;
    }

    const idle = now - this.lastProductActivity;
    if (idle >= this.idleCloseMs) {
      // Net als na registreren: de focus gaat terug naar de rij of knop waarmee het venster opende.
      const employeeId = this.app.selectedEmployeeId;
      const opener = this.app.modalOpeners.get(this.view.$("#employeeProductsModal"));
      this.closeEmployeeProducts();
      this.resetEmployeeSearch();
      this.focusEmployeeRow(employeeId, opener);
      return true;
    }

    this.setIdleWarning(idle >= this.idleCloseMs - this.idleWarningMs);
    return false;
  }

  // Toont of verbergt de waarschuwing in het productvenster. De view wordt alleen aangeroepen als
  // er iets verandert, zodat een schermlezer de regel één keer voorleest en niet iedere seconde.
  setIdleWarning(shown) {
    if (this.idleWarningShown === shown) return;
    this.idleWarningShown = shown;
    this.view.showIdleWarning?.(shown);
  }

  // Is deze klik op een medewerkerrij een "spookklik"? Bij een dubbelklik of dubbeltik op
  // "Registreren" sluit de eerste klik het venster. De tweede klik valt dan op de medewerkerrij die
  // eronder ligt en zou het productvenster van een collega openen. Daarom telt een klik niet als:
  //   - het de tweede (of volgende) klik van een dubbelklik is (event.detail > 1), of
  //   - het productvenster minder dan GHOST_CLICK_MS (500 ms) geleden sloot.
  // `now` is mee te geven, zodat dit te testen is.
  isGhostRowClick(event, now = Date.now()) {
    if (event?.detail > 1) return true;
    return now - this.productWindowClosedAt < EmployeeController.GHOST_CLICK_MS;
  }

  // Enter of spatie op een medewerkerrij (role="button") opent het productvenster. Een ingedrukt
  // gehouden toets (event.repeat) telt niet: anders opent het venster opnieuw zodra het na
  // "Registreren" sluit en de focus terug op de rij staat.
  handleEmployeeRowKey(event) {
    const employeeRow = event.target.closest("[data-open-employee]");
    if (!employeeRow || (event.key !== "Enter" && event.key !== " ")) return;

    event.preventDefault();
    if (event.repeat) return;
    this.openEmployeeProducts(employeeRow.dataset.openEmployee);
  }

  // Na het opslaan gaat eerst het venster dicht. Daarna worden het zoekveld en het bedrijfsfilter
  // leeggemaakt en wordt de lijst opnieuw getekend en bovenaan in beeld gezet (resetEmployeeSearch):
  // de volgende gebruiker begint met de volledige lijst.
  // Door het tekenen verdwijnt de oude medewerkerrij waarmee het venster werd geopend; dan krijgt
  // de nieuwe rij van dezelfde medewerker de focus, zonder dat de pagina daarvoor scrolt (zie
  // focusEmployeeRow). Zo hoeft iemand met een toetsenbord of schermlezer niet opnieuw te zoeken
  // waar hij was, en gaat er op een tablet geen schermtoetsenbord open (dat zou bij focus in het
  // zoekveld wel gebeuren).
  // Zonder gekozen product is de knop uitgeschakeld (aria-disabled="true"). Een tik daarop doet dan
  // niets, behalve de regel "Kies eerst een product met +" bij de knop benadrukken. Er komt geen
  // foutmelding: er is niets misgegaan, er moet alleen eerst iets worden gekozen.
  registerSelectedProducts() {
    this.removeUnavailableSelections();
    const amounts = Object.values(this.app.selectedProducts);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);

    if (!this.app.selectedEmployeeId) return;
    if (total === 0) {
      // Het venster opnieuw tekenen, zodat de teller op "Registreren" weer klopt.
      this.renderProductWindow();
      this.view.emphasizeRegisterHint?.();
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
    this.resetEmployeeSearch();
    this.focusEmployeeRow(employeeId, opener);

    // Op een gedeelde tablet moet de medewerker kunnen lezen voor wie en wat er is opgeslagen,
    // daarom blijft deze melding langer staan.
    this.view.showToast(message, { tone: "success", duration: 4000 });
  }

  // Zet de focus op de (nieuwe) rij van deze medewerker in de lijst, maar alleen als het element
  // waarmee het productvenster werd geopend niet meer op de pagina staat (de lijst is opnieuw
  // getekend). Staat de opener er nog, zoals de knop "Herken mij", dan heeft closeModal de
  // focus daar al teruggezet. De id wordt met cssAttributeValue veilig gemaakt voor de selector.
  // preventScroll: de lijst is net bovenaan in beeld gezet (resetEmployeeSearch) en blijft daar.
  focusEmployeeRow(employeeId, opener) {
    if (opener?.isConnected) return;
    this.view.$(`[data-open-employee="${cssAttributeValue(employeeId)}"]`)?.focus({ preventScroll: true });
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
