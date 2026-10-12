import { CsvExport } from "./CsvExport.js";
import { FaceRecognitionDemo } from "./FaceRecognitionDemo.js";
import { BadgeReader } from "./BadgeReader.js";
import { cssAttributeValue } from "./RegistrationView.js";
import { ModalManager } from "./controllers/ModalManager.js";
import { EmployeeController } from "./controllers/EmployeeController.js";
import { BadgeController } from "./controllers/BadgeController.js";
import { FaceController } from "./controllers/FaceController.js";
import { AdminController } from "./controllers/AdminController.js";
import { CorrectionController } from "./controllers/CorrectionController.js";
import { StockController } from "./controllers/StockController.js";
import { FormController } from "./controllers/FormController.js";

/**
 * RegistrationApp — de controller: verbindt wat de gebruiker doet met het model en de view
 * (de "Controller" in MVC).
 *
 * De controller bestaat uit deze class en acht kleinere classes met elk één taak. RegistrationApp
 * maakt die onderdelen, koppelt de knoppen en toetsen eraan en is voor de rest van de app (en
 * voor de tests) het ene aanspreekpunt: iedere methode van een onderdeel is ook als methode van
 * RegistrationApp te gebruiken (zie de lijst DELEGATES onderaan dit bestand).
 *
 * Verantwoordelijkheid van RegistrationApp zelf:
 *   - de onderdelen van de controller maken en koppelen (compositie);
 *   - de app starten en na middernacht de datum en totalen bijwerken (dagwissel);
 *   - wijzigingen uit een ander tabblad overnemen (synchronisatie tussen tabbladen);
 *   - opslaan via persist(): lukt opslaan niet, dan wordt de wijziging teruggedraaid;
 *   - alle event listeners koppelen en klikken in de lijsten naar de juiste actie sturen;
 *   - de toestand bewaren die meerdere onderdelen delen: of de beheerder is ingelogd en welke
 *     medewerker en producten in het productvenster zijn gekozen.
 *
 * De onderdelen:
 *   - ModalManager: vensters openen en sluiten, en de focus daarbij;
 *   - EmployeeController: de beginpagina (zoeken, bedrijfsfilter), het productvenster en registreren;
 *   - BadgeController: herkennen met de pas (verbindt BadgeReader met de app);
 *   - FaceController: het cameravenster van de demo gezichtsherkenning;
 *   - AdminController: inloggen, automatisch uitloggen, dashboard, tabbladen, logboek, export,
 *     wissen, (de)activeren en verwijderen, en requireAdmin voor iedere beheeractie;
 *   - CorrectionController: correcties "+" en "−" en het venster "Registratie verwijderen";
 *   - StockController: het tabblad Voorraad (leveringen, tellingen en minimum);
 *   - FormController: de formulieren voor medewerker, product, bedrijf en consumptiepunt.
 * Ieder onderdeel krijgt deze controller mee en gebruikt het model, de view, persist en de
 * gedeelde toestand via this.app.
 *
 * Verbonden met:
 *   - RegistrationModel: voert alle wijzigingen uit en bewaart de gegevens.
 *   - RegistrationView: tekent het scherm en toont meldingen.
 *   - CsvExport: maakt het CSV-bestand als de beheerder op "CSV exporteren" klikt.
 *   - FaceRecognitionDemo: de demo gezichtsherkenning (camera, herkennen, instellen).
 *   - BadgeReader: herkent een pas via de USB-NFC-lezer; de controller geeft de toetsen door.
 *   - index.html: de knoppen en formulieren waar de event listeners op zitten.
 *
 * Opbouw van deze class:
 *   1. starten, dagwissel en meldingen bij het laden
 *   2. synchronisatie tussen tabbladen
 *   3. opslaan en labels voor het logboek
 *   4. klikken op knoppen in lijsten (handleClick)
 *   5. event listeners koppelen
 * Onderaan het bestand staat welke methodes en velden van de onderdelen via RegistrationApp
 * bereikbaar zijn.
 */
export class RegistrationApp {
  // De controller krijgt het model, de view, de export, de demo gezichtsherkenning en de
  // pasjeslezer mee (compositie). Wat niet wordt meegegeven, maakt de controller zelf.
  // Daarna maakt hij zijn onderdelen; BadgeController geeft de pasjeslezer daarbij zijn callbacks.
  // `adminClock` is de klok voor het automatisch uitloggen van de beheerder (AdminController);
  // de unit tests geven een nep-klok mee.
  constructor(model, view, csvExport = new CsvExport(model), faceDemo = new FaceRecognitionDemo(), badgeReader = new BadgeReader(), adminClock = AdminController.realClock()) {
    this.model = model;
    this.view = view;
    this.csvExport = csvExport;
    this.faceDemo = faceDemo;
    this.badgeReader = badgeReader;

    // Tijdelijke status van het scherm die meerdere onderdelen delen; deze wordt niet opgeslagen.
    // De status die maar bij één onderdeel hoort (bijvoorbeeld het sessienummer van het
    // cameravenster), staat in dat onderdeel en is via de lijst DELEGATES ook hier te lezen.
    this.adminLoggedIn = false;
    this.selectedEmployeeId = null;
    this.selectedProducts = {}; // per product-id het gekozen aantal, bijv. { blikje: 2 }
    this.recognizedBy = null;      // hoe is de medewerker in het productvenster herkend: "face" (camera), "badge" (pas) of null
    this.currentDay = new Date().toDateString(); // de dag die nu op het scherm staat (zie refreshIfNewDay)

    // De onderdelen van de controller, elk met één taak (zie het commentaar bovenaan).
    this.modals = new ModalManager(this);
    this.employeePage = new EmployeeController(this);
    this.badge = new BadgeController(this);
    this.face = new FaceController(this);
    this.admin = new AdminController(this, adminClock);
    this.corrections = new CorrectionController(this);
    this.stock = new StockController(this);
    this.forms = new FormController(this);
  }

  // Is de medewerker in het productvenster herkend met de camera (demo gezichtsherkenning)?
  get recognizedByFace() {
    return this.recognizedBy === "face";
  }

  // Is dit een geldige prijs? Zie FormController.isValidPrice.
  static isValidPrice(value) {
    return FormController.isValidPrice(value);
  }

  // Bestaat dit nummer alleen uit cijfers? Zie FormController.isDigitsOnly.
  static isDigitsOnly(value) {
    return FormController.isDigitsOnly(value);
  }

  // Zet een datum om naar de vorm van een datumveld ("2026-10-02"). Zie CorrectionController.dateValue.
  static dateValue(date) {
    return CorrectionController.dateValue(date);
  }

  // ------------------------------------------------------------------
  // 1. Starten, dagwissel en meldingen bij het laden
  // ------------------------------------------------------------------

  // Start de app: datum tonen, event listeners koppelen en de pagina voor het eerst tekenen.
  // De tablet staat dag en nacht aan (kiosk). Daarom kijkt een timer iedere minuut of het een
  // nieuwe dag is; zo niet, dan zouden de datum en de tegels "Vandaag" en "Deze maand" de
  // volgende ochtend nog de cijfers van gisteren tonen. Een tweede timer logt de beheerder uit
  // als het beheer 5 minuten niet is gebruikt (AdminController.startIdleWatch).
  initialize() {
    this.renderTodayLabel(new Date());

    this.view.renderIcons();
    this.registerEventListeners();
    this.view.$("#faceRecognizeButton").classList.toggle("hidden", !this.faceDemo.isAvailable());
    this.view.renderAll();
    this.showLoadProblem();

    this.dayTimer = setInterval(() => this.refreshIfNewDay(), 60 * 1000);
    this.startIdleWatch();
  }

  // Zet de datum van vandaag bovenaan de pagina, bijvoorbeeld "2 oktober 2026".
  renderTodayLabel(date) {
    const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    this.view.$("#todayLabel").textContent = dateFormat.format(date);
  }

  // Wordt iedere minuut door de timer aangeroepen. Is de kalenderdag veranderd sinds de vorige
  // controle (na middernacht), dan worden de datum en de totalen opnieuw getekend.
  // Geeft true terug als het een nieuwe dag was. `now` is mee te geven, zodat dit te testen is.
  refreshIfNewDay(now = new Date()) {
    const today = now.toDateString();
    if (today === this.currentDay) return false;

    this.currentDay = today;
    this.renderTodayLabel(now);
    this.view.renderStats();
    this.view.$("#correctionDate").max = RegistrationApp.dateValue(now); // morgen is nu vandaag
    return true;
  }

  // Waarschuwt als de opgeslagen gegevens (deels) beschadigd waren. De oorspronkelijke gegevens
  // staan dan als reservekopie in de browser (zie DataStore.keepBackup).
  showLoadProblem() {
    const messages = {
      skipped: "Een deel van de opgeslagen gegevens was beschadigd en is overgeslagen. Er staat een reservekopie in de browser.",
      unreadable: "De opgeslagen gegevens waren onleesbaar; de demo is opnieuw gestart. Er staat een reservekopie in de browser.",
      unavailable: "De opslag van de browser kon niet worden gelezen; de demo start met voorbeeldgegevens. Wijzigingen worden mogelijk niet bewaard."
    };
    const message = messages[this.model.loadProblem];
    if (message) this.view.showToast(message, { tone: "error", duration: 8000 });
  }

  // ------------------------------------------------------------------
  // 2. Synchronisatie tussen tabbladen
  // ------------------------------------------------------------------

  // Heeft het andere tabblad op `Alle gegevens wissen` geklikt, dan wordt de gegevenssleutel
  // verwijderd (`event.newValue` is null; alleen DataStore.clearAll doet dat). Dan wist dit
  // tabblad ook alles uit het geheugen, logt uit en vergeet de gezichten, maar laat de opslag
  // met rust: het andere tabblad zet er meteen de nieuwe demogegevens in.
  handleStorageChange(event) {
    if (!this.model.isStorageKey(event.key)) return;
    if (event.key !== null && event.newValue === null) {
      this.handleStorageCleared({ keepStore: true });
      return;
    }
    if (!this.model.reload()) {
      // Niets te laden en ook niets beschadigd: de opslag is in een ander venster gewist.
      if (event.key === null && !this.model.loadProblem) {
        this.handleStorageCleared();
        return;
      }
      // Er was niets bruikbaars te laden. Was dat omdat de gegevens beschadigd waren, dan
      // krijgt de gebruiker toch de waarschuwing.
      this.showLoadProblem();
      return;
    }

    this.view.renderAll();
    this.view.populateFilters();
    this.view.renderAdmin();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminEmployees();
    this.view.renderAdminProducts();
    this.view.renderAdminCompanies();
    if (this.isTypingInStockTable()) this.view.renderStockAlerts();
    else this.view.renderStock();
    this.renderAuditLog();

    this.closeStaleForms();
    this.refreshRemoveRegistration();

    // Een open productvenster blijft open, tenzij de medewerker intussen weg of inactief is.
    if (this.selectedEmployeeId) {
      if (this.model.findEmployee(this.selectedEmployeeId)?.active) {
        this.renderProductWindow();
      } else {
        if (!this.view.$("#faceModal").classList.contains("hidden")) this.closeFaceModal();
        this.closeEmployeeProducts();
        this.view.showToast(
          "Deze medewerker is in een ander venster verwijderd of gedeactiveerd. Het productvenster is gesloten.",
          { tone: "error", duration: 5000 }
        );
      }
    }

    // Waren de opnieuw geladen gegevens (deels) beschadigd, dan krijgt de gebruiker een waarschuwing.
    // Deze komt als laatste, zodat hij niet door een andere melding wordt vervangen.
    this.showLoadProblem();
  }

  // Een ander tabblad heeft de hele opslag leeggemaakt. Dit tabblad wist dan ook alles en
  // begint opnieuw met de demogegevens, net als de knop "Alle gegevens wissen". Er wordt niet
  // opgeslagen: de opslag is al leeg, en de volgende wijziging slaat de nieuwe gegevens op.
  // Alles wat open staat (productvenster, camera, formulieren, beheerscherm) gaat dicht, want
  // het hoort bij gegevens die niet meer bestaan. Ingestelde gezichten (demo) worden vergeten.
  // Met `keepStore: true` (na `Alle gegevens wissen` in een ander tabblad) wordt de opslag niet
  // aangeraakt: staan de nieuwe demogegevens van dat tabblad er al, dan worden die geladen.
  handleStorageCleared({ keepStore = false } = {}) {
    this.model.wipeAll({ clearStore: !keepStore });
    if (keepStore) this.model.reload();
    this.faceDemo.enrolledIds().forEach((employeeId) => this.faceDemo.forget(employeeId));

    if (!this.view.$("#faceModal").classList.contains("hidden")) this.closeFaceModal();
    if (this.selectedEmployeeId) this.closeEmployeeProducts();
    for (const [formSelector, , , close] of this.editForms()) {
      delete this.view.$(formSelector).dataset.editingId;
      this.editingCopies.delete(formSelector);
      close();
    }
    this.closeAdmin();

    this.view.renderAll();
    this.view.populateFilters();
    this.view.renderAdmin();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminEmployees();
    this.view.renderAdminProducts();
    this.view.renderAdminCompanies();
    this.view.renderStock();
    this.renderAuditLog();
    this.view.showToast("De gegevens zijn in een ander venster gewist.", { tone: "error", duration: 5000 });
  }

  // ------------------------------------------------------------------
  // 3. Opslaan en labels voor het logboek
  // ------------------------------------------------------------------

  // Geeft `change` precies false terug, dan meldt het model dat er niets is gewijzigd
  // (bijvoorbeeld removeProduct of savePoint, omdat de gegevens intussen in een ander tabblad
  // zijn veranderd). Dan komt er geen logboekregel, wordt er niet opgeslagen en krijgt de
  // gebruiker een melding. Geeft `change` niets terug (undefined), dan telt dat als gelukt.
  persist(change, audit = null) {
    const previousState = this.model.snapshot();
    if (change() === false) {
      this.model.restore(previousState);
      this.view.showToast("Er is niets gewijzigd: de gegevens zijn intussen veranderd.", { tone: "error" });
      return false;
    }
    if (audit) this.model.logAdminAction(audit.action, audit.details);

    if (this.model.save()) return true;

    this.model.restore(previousState);
    this.view.showToast("Opslaan mislukt. Probeer het opnieuw.", { tone: "error" });
    return false;
  }

  // Leesbare naam voor het logboek, ook als de medewerker later wordt verwijderd.
  employeeLabel(employeeId) {
    return this.model.findEmployee(employeeId)?.name || `medewerker ${employeeId}`;
  }

  // Bedrijf en naam van een consumptiepunt, voor het logboek.
  pointLabel(pointId) {
    const point = this.model.findPoint(pointId);
    if (!point) return "onbekend consumptiepunt";
    return `${this.model.companyName(point.companyId)} · ${point.name}`;
  }

  // ------------------------------------------------------------------
  // 4. Klikken op knoppen in lijsten
  // ------------------------------------------------------------------

  // De lijsten op de pagina worden steeds opnieuw getekend. Daarom zit er één kliklistener
  // op de hele pagina, die aan het data-attribuut van de knop ziet welke actie nodig is.
  // De eerste knop in de lijst die past, wordt uitgevoerd.
  handleClick(event) {
    const actions = [
      ["[data-product-increment]", (button) => this.incrementProduct(button.dataset.productIncrement)],
      ["[data-product-decrement]", (button) => this.decrementProduct(button.dataset.productDecrement)],
      ["#registerSelectedProductsButton", () => this.registerSelectedProducts()],
      ["[data-open-employee]", (button) => this.openEmployeeProducts(button.dataset.openEmployee)],
      ["[data-correction-plus]", (button) => this.addCorrection(button.dataset.correctionPlus, button.dataset.correctionProduct)],
      ["[data-correction-minus]", (button) => this.removeCorrection(button.dataset.correctionMinus, button.dataset.correctionProduct)],
      ["[data-remove-registration]", (button) => this.removeChosenRegistration(button.dataset.removeRegistration)],
      ["[data-toggle-employee]", (button) => this.toggleEmployee(button.dataset.toggleEmployee)],
      ["[data-remove-employee]", (button) => this.removeEmployee(button.dataset.removeEmployee)],
      ["[data-edit-employee]", (button) => this.openEditEmployeeForm(button.dataset.editEmployee)],
      ["[data-remove-product]", (button) => this.removeProduct(button.dataset.removeProduct)],
      ["[data-edit-product]", (button) => this.openEditProductForm(button.dataset.editProduct)],
      ["[data-edit-company]", (button) => this.openEditCompanyForm(button.dataset.editCompany)],
      ["[data-remove-company]", (button) => this.removeCompany(button.dataset.removeCompany)],
      ["[data-add-point]", (button) => this.openPointForm(null, button.dataset.addPoint)],
      ["[data-edit-point]", (button) => this.openEditPointForm(button.dataset.editPoint)],
      ["[data-remove-point]", (button) => this.removePoint(button.dataset.removePoint)],
      ["[data-show-stock-point]", (button) => this.showStockPoint(button.dataset.showStockPoint)],
      ["[data-stock-delivery]", (button) => this.bookDelivery(button.dataset.stockDelivery)],
      ["[data-clear-search]", () => this.clearSearch()],
      ["[data-go-tab]", (button) => this.switchTab(document.querySelector(`.tab[data-tab="${cssAttributeValue(button.dataset.goTab)}"]`))],
      ["[data-repeat-last]", () => this.repeatLastSelection()],
      ["[data-face-enroll]", () => this.startFaceEnrollment()],
      ["[data-face-forget]", () => this.forgetFace()]
    ];

    for (const [selector, action] of actions) {
      const button = event.target.closest(selector);
      if (button) {
        action(button);
        return;
      }
    }
  }

  // ------------------------------------------------------------------
  // 5. Event listeners koppelen
  // ------------------------------------------------------------------

  // Koppelt alle knoppen, formulieren, filters en toetsen aan de methodes van de onderdelen.
  registerEventListeners() {
    this.registerPageEvents();
    this.registerAdminEvents();
    this.registerFilterEvents();
    this.registerFormEvents();
    this.registerStockEvents();
    this.registerKeyboardEvents();

    // Wijzigingen die een ander tabblad in dezelfde browser opslaat.
    window.addEventListener("storage", (event) => this.handleStorageChange(event));
  }

  // Hulpfunctie: voert `action` uit bij een klik op het element met deze selector.
  onClick(selector, action) {
    this.view.$(selector).addEventListener("click", action);
  }

  // Klikken in de lijsten en het productvenster van de medewerker.
  registerPageEvents() {
    document.addEventListener("click", (event) => this.handleClick(event));
    this.registerModalClose("#employeeProductsModal", "[data-close-employee-products]", () => this.closeEmployeeProducts());

    // Demo gezichtsherkenning
    this.onClick("#faceRecognizeButton", () => this.startFaceRecognition());
    this.onClick("#faceEnrollButton", () => this.captureEnrollment());
    this.registerModalClose("#faceModal", "[data-close-face-modal]", () => this.closeFaceModal());
    this.view.$("#faceConsent").addEventListener("change", () => this.updateEnrollButton());
  }

  // Inloggen, uitloggen, tabbladen, logboek en export in het dashboard.
  // Sluiten van het admin-venster logt de beheerder ook uit (zie closeAdmin).
  registerAdminEvents() {
    this.onClick("#adminOpenButton", () => this.openAdmin());
    this.registerModalClose("#adminModal", "[data-close-modal]", () => this.closeAdmin());
    this.view.$("#loginForm").addEventListener("submit", (event) => this.login(event));
    this.onClick("#logoutButton", () => this.logout());

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => this.switchTab(tab));
    });

    this.onClick("#loadMoreAuditButton", () => this.loadMoreAudit());
    this.onClick("#exportButton", () => this.exportCsv());
    this.onClick("#wipeDataButton", () => this.wipeAllData());

    // Iedere muisbeweging, klik, toets, aanraking of scroll telt als gebruik van het beheer
    // (noteAdminActivity doet alleen iets als de beheerder is ingelogd). In de capture-fase,
    // zodat ook invoer meetelt die een andere listener tegenhoudt. "scroll" komt niet omhoog
    // naar document (bubbelt niet), maar wordt in de capture-fase wel gezien.
    for (const type of ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"]) {
      document.addEventListener(type, () => this.noteAdminActivity(), { capture: true, passive: true });
    }
  }

  // Zoekvelden en filters op de openbare pagina en in het dashboard.
  registerFilterEvents() {
    this.view.$("#employeeSearch").addEventListener("input", () => this.view.renderEmployees());
    this.view.$("#employeeCompanyFilter").addEventListener("input", () => this.onCompanyFilterInput());
    this.view.$("#filterEmployee").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#filterMonth").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#adminEmployeeSearch").addEventListener("input", () => this.view.renderCorrectionEmployees());
    // Een nieuwe datum gekozen: een oude foutmelding bij het datumveld verdwijnt.
    this.view.$("#correctionDate").addEventListener("change", (event) => this.view.clearFieldError(event.target));
    this.view.$("#employeeManagementSearch").addEventListener("input", () => this.view.renderAdminEmployees());

    // Klik op een bedrijf in de keuzelijst, of ernaast om de keuzelijst te sluiten.
    document.addEventListener("click", (event) => {
      const option = event.target.closest("[data-company-value]");
      if (option) {
        this.selectCompanyFilterOption(option);
        return;
      }
      if (!event.target.closest(".company-combobox")) {
        document.querySelectorAll(".company-options").forEach((options) => options.classList.add("hidden"));
      }
    });

    // Klik op het bedrijfsfilter zelf opent of sluit de keuzelijst.
    const combobox = document.querySelector(".company-filter .company-combobox");
    combobox.addEventListener("click", (event) => {
      if (event.target.closest(".company-options")) return;
      this.view.$("#companyFilterOptions").classList.toggle("hidden");
    });
  }

  // Openen, opslaan en sluiten van de formulieren voor medewerker, product, bedrijf en consumptiepunt.
  registerFormEvents() {
    this.onClick("#addEmployeeButton", () => this.openEmployeeForm());
    this.view.$("#employeeForm").addEventListener("submit", (event) => this.saveEmployee(event));
    this.view.$("#newEmployeeCompany").addEventListener("change", () => this.view.populateEmployeePointSelect());
    this.registerModalClose("#employeeFormModal", "[data-close-employee-modal]", () => this.closeEmployeeForm());

    this.onClick("#addProductButton", () => this.openProductForm());
    this.view.$("#productForm").addEventListener("submit", (event) => this.saveProduct(event));
    this.registerModalClose("#productFormModal", "[data-close-product-modal]", () => this.closeProductForm());

    this.onClick("#addCompanyButton", () => this.openCompanyForm());
    this.view.$("#companyForm").addEventListener("submit", (event) => this.saveCompany(event));
    this.registerModalClose("#companyFormModal", "[data-close-company-modal]", () => this.closeCompanyForm());

    this.view.$("#pointForm").addEventListener("submit", (event) => this.savePoint(event));
    this.registerModalClose("#pointFormModal", "[data-close-point-modal]", () => this.closePointForm());

    // Venster van de correctie "−" (kiezen welke registratie weg moet).
    this.registerModalClose("#removeRegistrationModal", "[data-close-remove-registration]", () => this.closeRemoveRegistration());

    // Zodra de gebruiker een veld met een foutmelding aanpast, verdwijnt die melding.
    for (const formSelector of ["#employeeForm", "#productForm", "#companyForm", "#pointForm"]) {
      this.view.$(formSelector).addEventListener("input", (event) => {
        if (event.target.getAttribute("aria-invalid") === "true") this.view.clearFieldError(event.target);
      });
    }
  }

  // Keuze van het consumptiepunt en het aanpassen van voorraad of minimum.
  registerStockEvents() {
    this.view.$("#stockPointSelect").addEventListener("change", () => this.view.renderStock());
    this.view.$("#stockTableBody").addEventListener("change", (event) => {
      if (event.target.matches("[data-stock-field]")) this.saveStockField(event.target);
    });
  }

  // Toetsen: Escape sluit het bovenste venster, Tab blijft binnen een open venster,
  // Ctrl/Cmd + K gaat naar de zoekbalk, en Enter/spatie op een medewerkerrij opent die.
  // Daarnaast gaat iedere toets naar de pasjeslezer (handleBadgeKey). Die listener staat in de
  // "capture"-fase, zodat hij vóór de andere listeners komt: zo kan de Enter waarmee de lezer
  // een scan afsluit worden tegengehouden voordat die bijvoorbeeld een medewerkerrij opent.
  // In het veld "Pasnummer" doet Enter niets: de lezer stuurt na het pasnummer vaak een Enter,
  // en die mag het medewerkersformulier niet versturen.
  registerKeyboardEvents() {
    document.addEventListener("keydown", (event) => this.handleBadgeKey(event), { capture: true });
    this.view.$("#newEmployeeBadgeId")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });

    document.addEventListener("keydown", (event) => {
      const modal = this.topModal();

      if (event.key === "Escape" && modal) {
        event.preventDefault();
        this.modalCloseActions.get(modal)?.();
        return;
      }

      if (event.key === "Tab" && modal) {
        this.keepFocusInModal(event, modal);
        return;
      }

      // De zoekbalk staat achter een open venster; dan doet de sneltoets niets.
      const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isSearchShortcut || modal) return;

      event.preventDefault();
      this.view.$("#employeeSearch").focus();
    });

    // Medewerkerrijen hebben role="button" en moeten dus ook met Enter en spatie werken.
    this.view.$("#employeeList").addEventListener("keydown", (event) => {
      const employeeRow = event.target.closest("[data-open-employee]");
      if (!employeeRow || (event.key !== "Enter" && event.key !== " ")) return;

      event.preventDefault();
      this.openEmployeeProducts(employeeRow.dataset.openEmployee);
    });
  }
}

// ------------------------------------------------------------------
// Doorgeven aan de onderdelen
// ------------------------------------------------------------------

// Welke methodes en velden van de onderdelen ook via RegistrationApp bereikbaar zijn. De sleutel
// is de naam van het onderdeel in de constructor (this.modals, this.employeePage, ...).
// Zo blijft RegistrationApp voor de rest van de app, voor index.html en voor de tests één
// aanspreekpunt: app.handleBadgeKey(event) roept BadgeController.handleBadgeKey aan, en
// app.faceSession leest (en wijzigt) het veld faceSession van FaceController. De onderdelen
// roepen elkaar ook via RegistrationApp aan (this.app.openEmployeeProducts(...)). Iedere waarde
// staat zo op één plek: er is geen kopie die uit de pas kan lopen.
const DELEGATES = {
  modals: {
    methods: ["show", "hide", "rememberOpener", "openModal", "closeModal", "registerModalClose", "topModal", "keepFocusInModal"],
    fields: ["modalCloseActions", "modalOpeners"]
  },
  employeePage: {
    methods: [
      "clearSearch", "onCompanyFilterInput", "filterCompanyOptions", "selectCompanyFilterOption",
      "openEmployeeProducts", "renderProductWindow", "removeUnavailableSelections", "repeatLastSelection",
      "incrementProduct", "decrementProduct", "selectionSummary", "closeEmployeeProducts",
      "registerSelectedProducts", "focusEmployeeRow", "focusProductWindowAction"
    ],
    fields: []
  },
  badge: {
    methods: ["handleBadgeKey", "rememberSearchBeforeScan", "restoreSearchAfterScan", "recognizeBadge"],
    fields: ["searchBeforeScan"]
  },
  face: {
    methods: [
      "startFaceRecognition", "startFaceEnrollment", "forgetFace", "setFaceStatus", "openFaceModal",
      "updateEnrollButton", "scanForFace", "stopCameraAfterTimeout", "scheduleEnrollTimeout",
      "captureEnrollment", "readFaceForEnrollment", "closeFaceModal"
    ],
    fields: ["faceSession", "faceMode", "faceEmployeeId", "cameraReady", "captureSession", "enrollTimer", "capturing"]
  },
  admin: {
    methods: [
      "requireAdmin", "showMissing", "finishAdminChange", "renderAuditLog",
      "openAdmin", "showLogin", "login", "logout", "closeAdmin", "showDashboard", "switchTab",
      "startIdleWatch", "stopIdleWatch", "noteAdminActivity", "logoutIfIdle", "idleLogoutMessage",
      "loadMoreAudit", "exportCsv", "wipeAllData",
      "toggleEmployee", "removeEmployee", "removeProduct", "removeCompany", "removePoint"
    ],
    fields: ["auditLogLimit", "lastAdminActivity", "idleTimer", "idleLogoutMs"]
  },
  corrections: {
    methods: [
      "renderCorrectionList", "resetCorrectionDate", "readCorrectionDate", "confirmOldMonthAddition",
      "addCorrection", "removeCorrection", "removeChosenRegistration", "closeRemoveRegistration",
      "refreshRemoveRegistration", "confirmOldMonthRemoval"
    ],
    fields: ["removalTarget"]
  },
  stock: {
    methods: ["showStockPoint", "isTypingInStockTable", "isRepeatedDeliveryTap", "bookDelivery", "saveStockField"],
    fields: ["lastDelivery"]
  },
  forms: {
    methods: [
      "validateRequiredFields", "validateNumberFields", "showDuplicateNameError", "setSaveButtons",
      "editForms", "closeStaleForms", "rememberEditing", "editableCopy", "changedElsewhere", "closeStaleForm",
      "openEmployeeForm", "openEditEmployeeForm", "closeEmployeeForm", "saveEmployee", "validateBadgeField",
      "validateEmployeeAssignment",
      "openProductForm", "openEditProductForm", "closeProductForm", "saveProduct",
      "openCompanyForm", "openEditCompanyForm", "closeCompanyForm", "saveCompany",
      "openPointForm", "openEditPointForm", "closePointForm", "savePoint"
    ],
    fields: ["editingCopies"]
  }
};

// Maakt de doorgeefmethodes en -velden op RegistrationApp. Een methode geeft haar argumenten en
// haar uitkomst ongewijzigd door; een veld wordt gelezen en gewijzigd in het onderdeel zelf.
for (const [part, { methods, fields }] of Object.entries(DELEGATES)) {
  for (const name of methods) {
    RegistrationApp.prototype[name] = function (...args) {
      return this[part][name](...args);
    };
  }
  for (const name of fields) {
    Object.defineProperty(RegistrationApp.prototype, name, {
      get() {
        return this[part][name];
      },
      set(value) {
        this[part][name] = value;
      },
      configurable: true
    });
  }
}
