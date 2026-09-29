import { CsvExport } from "./csvExport.js";

/**
 * RegistrationApp — de controller: verbindt wat de gebruiker doet met het model en de view
 * (de "Controller" in MVC).
 *
 * Verantwoordelijkheid:
 *   - luistert naar klikken, formulieren en toetsen op de pagina;
 *   - leest de invoer, controleert die, en laat het model de wijziging uitvoeren;
 *   - slaat op via persist(): lukt opslaan niet, dan wordt de wijziging teruggedraaid;
 *   - zet de wijziging in het logboek en laat de view opnieuw tekenen;
 *   - onthoudt de tijdelijke status van het scherm: of de beheerder is ingelogd en welke
 *     producten een medewerker in het productvenster heeft gekozen.
 *
 * Verbonden met:
 *   - RegistrationModel: voert alle wijzigingen uit en bewaart de gegevens.
 *   - RegistrationView: tekent het scherm en toont meldingen.
 *   - CsvExport: maakt het CSV-bestand als de beheerder op "CSV exporteren" klikt.
 *   - index.html: de knoppen en formulieren waar de event listeners op zitten.
 *
 * Opbouw van deze class:
 *   1. starten en hulpfuncties
 *   2. klikken op knoppen in lijsten (handleClick + één methode per actie)
 *   3. medewerker: producten kiezen en registreren
 *   4. beheerder: inloggen, tabbladen, filters en export
 *   5. formulieren: medewerker, product, bedrijf, consumptiepunt
 *   6. voorraad
 *   7. event listeners koppelen
 */
export class RegistrationApp {
  // De controller krijgt het model, de view en de export mee (compositie).
  // Als er geen export wordt meegegeven, maakt de controller er zelf een.
  constructor(model, view, csvExport = new CsvExport(model)) {
    this.model = model;
    this.view = view;
    this.csvExport = csvExport;

    // Tijdelijke status van het scherm; deze wordt niet opgeslagen.
    this.adminLoggedIn = false;
    this.auditLogLimit = 20;
    this.selectedEmployeeId = null;
    this.selectedProducts = {}; // per product-id het gekozen aantal, bijv. { blikje: 2 }
  }

  // ------------------------------------------------------------------
  // 1. Starten en hulpfuncties
  // ------------------------------------------------------------------

  // Start de app: datum tonen, event listeners koppelen en de pagina voor het eerst tekenen.
  initialize() {
    const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    this.view.$("#todayLabel").textContent = dateFormat.format(new Date());

    this.registerEventListeners();
    this.view.renderAll();
  }

  // Voert een wijziging uit en slaat die op. Lukt opslaan niet, dan wordt de vorige
  // status teruggezet en krijgt de gebruiker een melding. Geeft true terug als het lukte.
  persist(change) {
    const previousState = this.model.snapshot();
    change();

    if (this.model.save()) return true;

    this.model.restore(previousState);
    this.view.showToast("Opslaan mislukt. Probeer het opnieuw.");
    return false;
  }

  // Slaat het logboek op, tekent alle admin- en publieke onderdelen opnieuw en toont een melding.
  // Wordt gebruikt na wijzigingen aan producten, bedrijven, consumptiepunten en voorraad.
  finishAdminChange(message) {
    this.model.save();
    this.view.renderAll();
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminProducts();
    this.view.renderAdminCompanies();
    this.view.renderStock();
    this.view.renderAuditLog();
    this.view.showToast(message);
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

  // Toont of verbergt een element op de pagina.
  show(selector) {
    this.view.$(selector).classList.remove("hidden");
  }

  hide(selector) {
    this.view.$(selector).classList.add("hidden");
  }

  // ------------------------------------------------------------------
  // 2. Klikken op knoppen in lijsten
  // ------------------------------------------------------------------

  // De lijsten op de pagina worden steeds opnieuw getekend. Daarom zit er één kliklistener
  // op de hele pagina, die aan het data-attribuut van de knop ziet welke actie nodig is.
  // De eerste knop in de lijst die past, wordt uitgevoerd.
  handleClick(event) {
    const actions = [
      ["[data-product-increment]", (button) => this.incrementProduct(button.dataset.productIncrement)],
      ["#registerSelectedProductsButton", () => this.registerSelectedProducts()],
      ["[data-open-employee]", (button) => this.openEmployeeProducts(button.dataset.openEmployee)],
      ["[data-correction-plus]", (button) => this.addCorrection(button.dataset.correctionPlus, button.dataset.correctionProduct)],
      ["[data-correction-minus]", (button) => this.removeCorrection(button.dataset.correctionMinus, button.dataset.correctionProduct)],
      ["[data-toggle-employee]", (button) => this.toggleEmployee(button.dataset.toggleEmployee)],
      ["[data-remove-employee]", (button) => this.removeEmployee(button.dataset.removeEmployee)],
      ["[data-edit-employee]", (button) => this.openEditEmployeeForm(button.dataset.editEmployee)],
      ["[data-remove-product]", (button) => this.removeProduct(button.dataset.removeProduct)],
      ["[data-edit-product]", (button) => this.openEditProductForm(button.dataset.editProduct)],
      ["[data-edit-company]", (button) => this.openCompanyForm(this.model.findCompany(button.dataset.editCompany))],
      ["[data-remove-company]", (button) => this.removeCompany(button.dataset.removeCompany)],
      ["[data-add-point]", (button) => this.openPointForm(null, button.dataset.addPoint)],
      ["[data-edit-point]", (button) => this.openPointForm(this.model.findPoint(button.dataset.editPoint))],
      ["[data-remove-point]", (button) => this.removePoint(button.dataset.removePoint)],
      ["[data-show-stock-point]", (button) => this.showStockPoint(button.dataset.showStockPoint)],
      ["[data-stock-delivery]", (button) => this.bookDelivery(button.dataset.stockDelivery)]
    ];

    for (const [selector, action] of actions) {
      const button = event.target.closest(selector);
      if (button) {
        action(button);
        return;
      }
    }
  }

  // Correctie met "+": voegt als beheerder één product toe voor een medewerker.
  addCorrection(employeeId, productId) {
    const saved = this.persist(() => this.model.addRegistration(employeeId, productId));
    if (!saved) return false;

    const productName = this.model.productName(productId);
    this.model.logAdminAction("Registratie toegevoegd", `${productName} voor ${this.employeeLabel(employeeId)}`);

    if (this.model.save()) {
      this.view.showToast(`${productName} toegevoegd voor medewerker`);
    } else {
      this.view.showToast("Registratie opgeslagen, maar het logboek kon niet worden bijgewerkt.");
    }

    this.view.renderAll();
    this.view.populateFilters();
    this.view.renderCorrectionEmployees();
    this.view.renderAdmin();
    this.view.renderAuditLog();
    return true;
  }

  // Correctie met "−": verwijdert de laatste registratie van dit product bij deze medewerker.
  removeCorrection(employeeId, productId) {
    if (!this.model.hasRegistration(employeeId, productId)) {
      this.view.showToast("Dit product heeft geen registratie voor deze medewerker");
      return;
    }

    const productName = this.model.productName(productId);
    const saved = this.persist(() => this.model.removeLastRegistration(employeeId, productId));
    if (!saved) return;

    this.model.logAdminAction("Registratie verwijderd", `${productName} van ${this.employeeLabel(employeeId)}`);
    this.model.save();
    this.view.renderAuditLog();
    this.view.populateFilters();
    this.view.renderCorrectionEmployees();
    this.view.renderAdmin();
    this.view.renderAll();
    this.view.showToast(`${productName} registratie verwijderd`);
  }

  // Zet een medewerker actief of inactief (omgekeerd van wat het nu is).
  toggleEmployee(employeeId) {
    const active = !this.model.findEmployee(employeeId).active;
    const saved = this.persist(() => this.model.setEmployeeActive(employeeId, active));
    if (!saved) return;

    const status = active ? "actief" : "inactief";
    this.model.logAdminAction("Medewerkerstatus gewijzigd", `${this.employeeLabel(employeeId)} is ${status} gezet`);
    this.model.save();
    this.view.renderAuditLog();
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderAll();
    this.view.showToast("Medewerkerstatus gewijzigd");
  }

  // Verwijdert een (inactieve) medewerker definitief, na bevestiging.
  removeEmployee(employeeId) {
    const name = this.employeeLabel(employeeId);
    if (!window.confirm(`${name} definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;

    const saved = this.persist(() => this.model.removeEmployee(employeeId));
    if (!saved) return;

    this.model.logAdminAction("Medewerker definitief verwijderd", name);
    this.model.save();
    this.view.renderAuditLog();
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderAll();
    this.view.showToast("Inactieve medewerker definitief verwijderd");
  }

  // Verwijdert een product, maar alleen als het nog nooit is geregistreerd.
  removeProduct(productId) {
    const usedMessage = "Dit product wordt al gebruikt en kan niet worden verwijderd";
    const isUsed = this.model.registrations.some((registration) => registration.productId === productId);
    if (isUsed) {
      this.view.showToast(usedMessage);
      return;
    }

    const productName = this.model.productName(productId);
    if (this.persist(() => this.model.removeProduct(productId))) {
      this.model.logAdminAction("Product verwijderd", productName);
      this.finishAdminChange("Product verwijderd");
    } else {
      this.view.showToast(usedMessage);
    }
  }

  // Verwijdert een bedrijf, maar alleen als er geen medewerkers of consumptiepunten aan hangen.
  removeCompany(companyId) {
    const name = this.model.companyName(companyId);
    const hasEmployees = this.model.employees.some((employee) => employee.companyId === companyId);
    const hasPoints = this.model.pointsForCompany(companyId).length > 0;

    if (hasEmployees || hasPoints) {
      this.view.showToast("Verwijder of verplaats eerst de medewerkers en consumptiepunten van dit bedrijf");
      return;
    }
    if (!window.confirm(`${name} verwijderen?`)) return;

    if (this.persist(() => this.model.removeCompany(companyId))) {
      this.model.logAdminAction("Bedrijf verwijderd", name);
      this.finishAdminChange("Bedrijf verwijderd");
    }
  }

  // Verwijdert een consumptiepunt, maar alleen als er geen medewerkers meer aan gekoppeld zijn.
  removePoint(pointId) {
    const point = this.model.findPoint(pointId);
    const hasEmployees = this.model.employees.some((employee) => employee.pointId === point.id);

    if (hasEmployees) {
      this.view.showToast("Koppel eerst de medewerkers van dit consumptiepunt aan een ander punt");
      return;
    }
    if (!window.confirm(`Consumptiepunt ${point.name} verwijderen? De voorraad van dit punt verdwijnt.`)) return;

    if (this.persist(() => this.model.removePoint(point.id))) {
      this.model.logAdminAction("Consumptiepunt verwijderd", `${point.name} (${this.model.companyName(point.companyId)})`);
      this.finishAdminChange("Consumptiepunt verwijderd");
    }
  }

  // ------------------------------------------------------------------
  // 3. Medewerker: producten kiezen en registreren
  // ------------------------------------------------------------------

  // Opent het persoonlijke productvenster met een lege keuze.
  openEmployeeProducts(employeeId) {
    this.selectedEmployeeId = employeeId;
    this.selectedProducts = {};
    this.view.renderEmployeeProducts(employeeId, this.selectedProducts);
  }

  // Telt één stuk op bij een gekozen product (de "+"-knop in het productvenster).
  incrementProduct(productId) {
    this.selectedProducts[productId] = (this.selectedProducts[productId] || 0) + 1;
    this.view.renderEmployeeProducts(this.selectedEmployeeId, this.selectedProducts);
  }

  // Sluit het persoonlijke productvenster en vergeet de keuze.
  closeEmployeeProducts() {
    this.hide("#employeeProductsModal");
    this.selectedProducts = {};
    this.selectedEmployeeId = null;
  }

  // Slaat alle gekozen producten in één keer op; ieder stuk wordt één registratie.
  registerSelectedProducts() {
    const amounts = Object.values(this.selectedProducts);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);

    if (!this.selectedEmployeeId || total === 0) {
      this.view.showToast("Kies eerst minimaal één product");
      return;
    }

    const saved = this.persist(() => {
      for (const [productId, amount] of Object.entries(this.selectedProducts)) {
        for (let count = 0; count < amount; count += 1) {
          this.model.addRegistration(this.selectedEmployeeId, productId);
        }
      }
    });
    if (!saved) return;

    this.view.renderAll();
    this.selectedProducts = {};
    this.closeEmployeeProducts();
    this.view.showToast("Producten direct opgeslagen ✓");
  }

  // ------------------------------------------------------------------
  // 4. Beheerder: inloggen, tabbladen, filters en export
  // ------------------------------------------------------------------

  // Opent het loginvenster, of direct het dashboard als de beheerder al is ingelogd.
  openAdmin() {
    this.show("#adminModal");

    if (!this.adminLoggedIn) {
      this.show("#loginView");
      this.hide("#adminView");
      this.view.$("#loginEmail").focus();
      return;
    }

    this.showDashboard();
  }

  // Demo-login: ieder ingevuld e-mailadres en wachtwoord wordt geaccepteerd.
  login(event) {
    event.preventDefault();

    const email = this.view.$("#loginEmail").value;
    const password = this.view.$("#loginPassword").value;

    if (email && password) {
      this.adminLoggedIn = true;
      this.showDashboard();
    } else {
      this.show("#loginError");
    }
  }

  logout() {
    this.adminLoggedIn = false;
    this.hide("#adminView");
    this.show("#loginView");
    this.view.$("#loginPassword").value = "";
    this.view.$("#loginEmail").focus();
  }

  // Toont het dashboard met alle actuele gegevens.
  showDashboard() {
    this.auditLogLimit = 20;
    this.hide("#loginView");
    this.show("#adminView");
    this.view.populateFilters();
    this.view.renderAdmin();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminEmployees();
    this.view.renderAdminProducts();
    this.view.renderAdminCompanies();
    this.view.renderStock();
    this.view.renderAuditLog();
  }

  // Wisselt naar een ander tabblad in het dashboard.
  switchTab(activeTab) {
    const tabNames = ["registrations", "employees", "products", "companies", "stock", "audit"];

    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    activeTab.classList.add("active");

    for (const name of tabNames) {
      this.view.$(`#${name}Tab`).classList.toggle("hidden", activeTab.dataset.tab !== name);
    }
  }

  // Toont 20 extra regels in het logboek.
  loadMoreAudit() {
    this.auditLogLimit += 20;
    this.view.renderAuditLog(this.auditLogLimit);
  }

  // Laat CsvExport het bestand maken met de gekozen filters.
  exportCsv() {
    const selectedEmployee = this.view.$("#filterEmployee").value;
    const selectedMonth = this.view.$("#filterMonth").value;

    const exported = this.csvExport.download(selectedEmployee, selectedMonth);
    if (!exported) {
      this.view.showToast("Geen registraties om te exporteren voor deze filters.");
    }
  }

  // Wordt aangeroepen als de gebruiker typt in het bedrijfsfilter op de openbare pagina.
  onCompanyFilterInput() {
    const input = this.view.$("#employeeCompanyFilter");
    delete input.dataset.value;
    this.filterCompanyOptions("#companyFilterOptions", input.value);
    this.show("#companyFilterOptions");
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
  selectCompanyFilterOption(option) {
    const filter = this.view.$("#employeeCompanyFilter");
    filter.dataset.value = option.dataset.companyValue;
    filter.value = option.textContent;
    this.hide("#companyFilterOptions");
    this.view.renderEmployees();
  }

  // ------------------------------------------------------------------
  // 5. Formulieren: medewerker, product, bedrijf, consumptiepunt
  // ------------------------------------------------------------------

  // Opent een leeg formulier om een medewerker toe te voegen.
  openEmployeeForm() {
    const form = this.view.$("#employeeForm");
    form.reset();
    this.view.populateEmployeeCompanySelects();
    delete form.dataset.editingId;

    this.show("#employeeSaveContinueButton");
    this.view.$("#employeeFormTitle").textContent = "Medewerker toevoegen";
    this.view.$("#employeeFormHelp").textContent = "Vul de gegevens in en kies daarna hoe je verder wilt gaan.";
    this.show("#employeeFormModal");
    this.view.$("#newEmployeeFirstName").focus();
  }

  // Opent het medewerkersformulier, gevuld met de gegevens van een bestaande medewerker.
  openEditEmployeeForm(employeeId) {
    const employee = this.model.findEmployee(employeeId);

    this.view.$("#employeeForm").dataset.editingId = employee.id;
    this.hide("#employeeSaveContinueButton");
    this.view.$("#employeeFormTitle").textContent = "Medewerker wijzigen";
    this.view.$("#employeeFormHelp").textContent = "Pas de gegevens aan en klik daarna op Opslaan.";
    this.view.$("#newEmployeeFirstName").value = employee.firstName;
    this.view.$("#newEmployeeLastName").value = employee.lastName;
    this.view.$("#newEmployeePayrollCode").value = employee.payrollCode;
    this.view.$("#newEmployeePersonnelNumber").value = employee.personnelNumber;
    this.view.$("#newEmployeeEmployerNumber").value = employee.employerNumber || "";
    this.view.populateEmployeeCompanySelects(employee.companyId, employee.pointId);
    this.show("#employeeFormModal");
    this.view.showToast("Gegevens geladen om te wijzigen");
  }

  // Sluit het medewerkersformulier zonder de admin-modal te sluiten.
  closeEmployeeForm() {
    this.hide("#employeeFormModal");
  }

  // Leest het medewerkersformulier en voegt een medewerker toe of wijzigt een bestaande.
  saveEmployee(event) {
    event.preventDefault();

    const employeeData = {
      firstName: this.view.$("#newEmployeeFirstName").value.trim(),
      lastName: this.view.$("#newEmployeeLastName").value.trim(),
      payrollCode: this.view.$("#newEmployeePayrollCode").value.trim(),
      personnelNumber: this.view.$("#newEmployeePersonnelNumber").value.trim(),
      employerNumber: this.view.$("#newEmployeeEmployerNumber").value.trim(),
      companyId: this.view.$("#newEmployeeCompany").value || null,
      pointId: this.view.$("#newEmployeePoint").value || null
    };
    if (!employeeData.firstName || !employeeData.lastName || !employeeData.companyId) return;

    const form = this.view.$("#employeeForm");
    const editingId = form.dataset.editingId;

    const saved = this.persist(() => {
      if (editingId) this.model.updateEmployee(editingId, employeeData);
      else this.model.addEmployee(employeeData);
    });
    if (!saved) return;

    const fullName = `${employeeData.firstName} ${employeeData.lastName}`;
    this.model.logAdminAction(editingId ? "Medewerker gewijzigd" : "Medewerker toegevoegd", fullName);
    this.model.save();

    form.reset();
    delete form.dataset.editingId;
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderAdminCompanies();
    this.view.renderAuditLog();
    this.view.renderAll();
    this.view.showToast(editingId ? "Medewerker gewijzigd" : "Medewerker toegevoegd");

    const saveAndContinue = event.submitter?.dataset.saveMode === "continue" && !editingId;
    if (saveAndContinue) {
      // Vaak worden meerdere collega's van hetzelfde punt achter elkaar ingevoerd.
      this.view.populateEmployeeCompanySelects(employeeData.companyId, employeeData.pointId);
      this.view.$("#employeeFormTitle").textContent = "Medewerker toevoegen";
      this.view.$("#employeeFormHelp").textContent = "Vul de gegevens in voor de volgende medewerker.";
      this.view.$("#newEmployeeFirstName").focus();
    } else {
      this.closeEmployeeForm();
    }
  }

  // Opent een leeg formulier om een product toe te voegen.
  openProductForm() {
    const form = this.view.$("#productForm");
    form.reset();
    delete form.dataset.editingId;

    this.show("#consumptionSaveContinueButton");
    this.view.$("#productFormTitle").textContent = "Product toevoegen";
    this.view.$("#productFormHelp").textContent = "Vul de productnaam en prijs in.";
    this.show("#productFormModal");
    this.view.$("#productName").focus();
  }

  // Opent het productformulier, gevuld met een bestaand product.
  openEditProductForm(productId) {
    const product = this.model.findProduct(productId);

    this.view.$("#productName").value = product.name;
    this.view.$("#productPrice").value = product.price;
    this.view.$("#productForm").dataset.editingId = product.id;
    this.view.$("#productFormTitle").textContent = "Product wijzigen";
    this.view.$("#productFormHelp").textContent = "Pas de productnaam of prijs aan.";
    this.show("#productFormModal");
    this.hide("#consumptionSaveContinueButton");
  }

  closeProductForm() {
    this.hide("#productFormModal");
  }

  // Leest het productformulier en voegt een product toe of wijzigt een bestaand product.
  saveProduct(event) {
    event.preventDefault();

    const form = this.view.$("#productForm");
    const editingId = form.dataset.editingId;
    const productData = {
      id: editingId || crypto.randomUUID(),
      name: this.view.$("#productName").value.trim(),
      price: this.view.$("#productPrice").value
    };
    if (!productData.name || Number(productData.price) < 0) return;

    const nameTaken = this.model.products.some(
      (product) => product.id !== editingId && product.name.toLowerCase() === productData.name.toLowerCase()
    );
    if (nameTaken) {
      this.view.showToast("Er bestaat al een product met deze naam");
      return;
    }

    if (!this.persist(() => this.model.saveProduct(productData))) return;

    this.model.logAdminAction(editingId ? "Product gewijzigd" : "Product toegevoegd", productData.name);
    form.reset();
    delete form.dataset.editingId;
    this.finishAdminChange(
      editingId ? "Product gewijzigd" : "Product toegevoegd — zet het aan bij de consumptiepunten die het aanbieden"
    );

    const saveAndContinue = event.submitter?.dataset.saveMode === "continue" && !editingId;
    if (saveAndContinue) {
      this.view.$("#productFormTitle").textContent = "Product toevoegen";
      this.view.$("#productFormHelp").textContent = "Vul de gegevens in voor het volgende product.";
      this.view.$("#productName").focus();
    } else {
      this.closeProductForm();
    }
  }

  // Opent het bedrijfsformulier: leeg om toe te voegen, of gevuld om te wijzigen.
  openCompanyForm(company = null) {
    const form = this.view.$("#companyForm");
    form.reset();
    if (company) form.dataset.editingId = company.id;
    else delete form.dataset.editingId;

    this.view.$("#companyFormTitle").textContent = company ? "Bedrijf wijzigen" : "Bedrijf toevoegen";
    this.view.$("#companyName").value = company?.name || "";
    this.view.$("#companyEmployerNumber").value = company?.employerNumber || "";
    this.show("#companyFormModal");
    this.view.$("#companyName").focus();
  }

  // Leest het bedrijfsformulier en voegt een bedrijf toe of wijzigt een bestaand bedrijf.
  saveCompany(event) {
    event.preventDefault();

    const editingId = this.view.$("#companyForm").dataset.editingId;
    const name = this.view.$("#companyName").value.trim();
    const employerNumber = this.view.$("#companyEmployerNumber").value.trim();
    if (!name) return;

    const nameTaken = this.model.companies.some(
      (company) => company.id !== editingId && company.name.toLowerCase() === name.toLowerCase()
    );
    if (nameTaken) {
      this.view.showToast("Er bestaat al een bedrijf met deze naam");
      return;
    }

    if (!this.persist(() => this.model.saveCompany({ id: editingId, name, employerNumber }))) return;

    this.model.logAdminAction(editingId ? "Bedrijf gewijzigd" : "Bedrijf toegevoegd", name);
    this.hide("#companyFormModal");
    this.finishAdminChange(editingId ? "Bedrijf gewijzigd" : "Bedrijf toegevoegd");
  }

  // Opent het consumptiepuntformulier: leeg voor een bedrijf, of gevuld om te wijzigen.
  openPointForm(point = null, companyId = "") {
    const form = this.view.$("#pointForm");
    form.reset();
    if (point) form.dataset.editingId = point.id;
    else delete form.dataset.editingId;

    this.view.$("#pointFormTitle").textContent = point ? "Consumptiepunt wijzigen" : "Consumptiepunt toevoegen";
    this.view.renderPointForm(point, companyId);
    this.show("#pointFormModal");
    this.view.$("#pointName").focus();
  }

  // Leest het consumptiepuntformulier (naam, bedrijf en aangevinkte producten) en slaat het op.
  savePoint(event) {
    event.preventDefault();

    const form = this.view.$("#pointForm");
    const editingId = form.dataset.editingId;
    const checkedBoxes = form.querySelectorAll('input[name="offeredProduct"]:checked');
    const pointData = {
      id: editingId,
      name: this.view.$("#pointName").value.trim(),
      companyId: this.view.$("#pointCompany").value,
      offeredProductIds: [...checkedBoxes].map((checkbox) => checkbox.value)
    };
    if (!pointData.name || !pointData.companyId) return;

    const nameTaken = this.model.pointsForCompany(pointData.companyId).some(
      (point) => point.id !== editingId && point.name.toLowerCase() === pointData.name.toLowerCase()
    );
    if (nameTaken) {
      this.view.showToast("Dit bedrijf heeft al een consumptiepunt met deze naam");
      return;
    }

    // Medewerkers blijven aan hun punt gekoppeld; verhuist het punt naar een ander bedrijf,
    // dan verhuizen zij mee.
    const saved = this.persist(() => {
      this.model.savePoint(pointData);
      if (!editingId) return;

      const pointEmployees = this.model.employees.filter((employee) => employee.pointId === editingId);
      for (const employee of pointEmployees) {
        this.model.updateEmployee(employee.id, { ...employee, companyId: pointData.companyId });
      }
    });
    if (!saved) return;

    const companyName = this.model.companyName(pointData.companyId);
    const productCount = pointData.offeredProductIds.length;
    this.model.logAdminAction(
      editingId ? "Consumptiepunt gewijzigd" : "Consumptiepunt toegevoegd",
      `${pointData.name} (${companyName}), ${productCount} producten aangeboden`
    );
    this.hide("#pointFormModal");
    this.finishAdminChange(editingId ? "Consumptiepunt gewijzigd" : "Consumptiepunt toegevoegd");
  }

  // ------------------------------------------------------------------
  // 6. Voorraad
  // ------------------------------------------------------------------

  // Opent de voorraad van een consumptiepunt (klik op een punt in de bijbestellijst).
  showStockPoint(pointId) {
    this.view.$("#stockPointSelect").value = pointId;
    this.view.renderStock();
  }

  // Boekt een levering: het ingevulde aantal komt bij de voorraad.
  bookDelivery(productId) {
    const pointId = this.view.$("#stockPointSelect").value;
    const amount = Number(this.view.$(`[data-delivery-amount="${productId}"]`).value);

    if (!Number.isInteger(amount) || amount <= 0) {
      this.view.showToast("Vul een geleverd aantal van minimaal 1 in");
      return;
    }

    if (this.persist(() => this.model.changeStock(pointId, productId, amount))) {
      const productName = this.model.productName(productId);
      this.model.logAdminAction("Levering geboekt", `${amount} × ${productName} op ${this.pointLabel(pointId)}`);
      this.finishAdminChange("Levering toegevoegd aan de voorraad");
    }
  }

  // Slaat een gewijzigde voorraad (na tellen) of een gewijzigd minimum direct op.
  saveStockField(input) {
    const pointId = this.view.$("#stockPointSelect").value;
    const productId = input.dataset.productId;
    const value = Number(input.value);
    const isStock = input.dataset.stockField === "stock";

    const isEmpty = input.value === "";
    const isNegativeMinimum = !isStock && value < 0;
    if (isEmpty || !Number.isInteger(value) || isNegativeMinimum) {
      this.view.showToast(isStock ? "Vul een geheel aantal in" : "Het minimum moet 0 of hoger zijn");
      this.view.renderStock();
      return;
    }

    const saved = this.persist(() => {
      if (isStock) this.model.setStock(pointId, productId, value);
      else this.model.setMinimum(pointId, productId, value);
    });
    if (!saved) return;

    this.model.logAdminAction(
      isStock ? "Voorraad geteld" : "Minimum gewijzigd",
      `${this.model.productName(productId)} op ${this.pointLabel(pointId)}: ${value}`
    );
    this.finishAdminChange(isStock ? "Voorraad bijgewerkt" : "Minimum bijgewerkt");
  }

  // ------------------------------------------------------------------
  // 7. Event listeners koppelen
  // ------------------------------------------------------------------

  // Koppelt alle knoppen, formulieren, filters en toetsen aan de methodes hierboven.
  registerEventListeners() {
    this.registerPageEvents();
    this.registerAdminEvents();
    this.registerFilterEvents();
    this.registerFormEvents();
    this.registerStockEvents();
    this.registerKeyboardEvents();
  }

  // Hulpfunctie: voert `action` uit bij een klik op het element met deze selector.
  onClick(selector, action) {
    this.view.$(selector).addEventListener("click", action);
  }

  // Hulpfunctie: sluit een venster bij een klik op de sluitknoppen of op de donkere achtergrond.
  registerModalClose(modalSelector, closeButtonSelector, closeAction) {
    document.querySelectorAll(closeButtonSelector).forEach((button) => {
      button.addEventListener("click", closeAction);
    });

    const modal = this.view.$(modalSelector);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeAction();
    });
  }

  // Klikken in de lijsten en het productvenster van de medewerker.
  registerPageEvents() {
    document.addEventListener("click", (event) => this.handleClick(event));
    this.registerModalClose("#employeeProductsModal", "[data-close-employee-products]", () => this.closeEmployeeProducts());
  }

  // Inloggen, uitloggen, tabbladen, logboek en export in het dashboard.
  registerAdminEvents() {
    this.onClick("#adminOpenButton", () => this.openAdmin());
    this.registerModalClose("#adminModal", "[data-close-modal]", () => this.hide("#adminModal"));
    this.view.$("#loginForm").addEventListener("submit", (event) => this.login(event));
    this.onClick("#logoutButton", () => this.logout());

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => this.switchTab(tab));
    });

    this.onClick("#loadMoreAuditButton", () => this.loadMoreAudit());
    this.onClick("#exportButton", () => this.exportCsv());
  }

  // Zoekvelden en filters op de openbare pagina en in het dashboard.
  registerFilterEvents() {
    this.view.$("#employeeSearch").addEventListener("input", () => this.view.renderEmployees());
    this.view.$("#employeeCompanyFilter").addEventListener("input", () => this.onCompanyFilterInput());
    this.view.$("#filterEmployee").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#filterMonth").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#adminEmployeeSearch").addEventListener("input", () => this.view.renderCorrectionEmployees());
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
    this.registerModalClose("#companyFormModal", "[data-close-company-modal]", () => this.hide("#companyFormModal"));

    this.view.$("#pointForm").addEventListener("submit", (event) => this.savePoint(event));
    this.registerModalClose("#pointFormModal", "[data-close-point-modal]", () => this.hide("#pointFormModal"));
  }

  // Keuze van het consumptiepunt en het aanpassen van voorraad of minimum.
  registerStockEvents() {
    this.view.$("#stockPointSelect").addEventListener("change", () => this.view.renderStock());
    this.view.$("#stockTableBody").addEventListener("change", (event) => {
      if (event.target.matches("[data-stock-field]")) this.saveStockField(event.target);
    });
  }

  // Sneltoets Ctrl/Cmd + K voor de zoekbalk, en Enter/spatie op een medewerkerrij.
  registerKeyboardEvents() {
    document.addEventListener("keydown", (event) => {
      const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isSearchShortcut) return;

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
