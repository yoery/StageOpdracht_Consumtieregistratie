import { exportCsv } from "./csvExport.js";

// Deze klasse koppelt gebruikersacties aan het model en de view.
export class RegistrationApp {
  // De controller bewaart de status van de admin-login.
  constructor(model, view) {
    this.model = model;
    this.view = view;
    this.adminLoggedIn = false;
    this.auditLogLimit = 20;
    this.selectedProducts = {};
    this.selectedEmployeeId = null;
    this.view.app = this;
  }

  // Start de datumweergave, events en eerste render.
  initialize() {
    this.view.$("#todayLabel").textContent = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
    this.registerEventListeners();
    this.view.renderAll();
  }

  // Voert een wijziging uit en herstelt de vorige status bij een opslagfout.
  persist(change) {
    const previousState = this.model.snapshot();
    change();
    if (this.model.save()) return true;
    this.model.restore(previousState);
    this.view.showToast("Opslaan mislukt. Probeer het opnieuw.");
    return false;
  }

  // Geeft een leesbare naam voor het logboek, ook als de medewerker later wordt verwijderd.
  employeeLabel(employeeId) {
    return this.model.findEmployee(employeeId)?.name || `medewerker ${employeeId}`;
  }

  // Voegt als beheerder één product toe voor een medewerker (correctie met de +-knop).
  addCorrection(employeeId, productId) {
    const saved = this.persist(() => this.model.addRegistration(employeeId, productId));
    if (!saved) return false;
    const productName = this.model.productName(productId);
    this.model.logAdminAction("Registratie toegevoegd", `${productName} voor ${this.employeeLabel(employeeId)}`);
    if (!this.model.save()) {
      this.view.showToast("Registratie opgeslagen, maar het logboek kon niet worden bijgewerkt.");
    } else {
      this.view.showToast(`${productName} toegevoegd voor medewerker`);
    }
    this.view.renderAll();
    this.view.populateFilters();
    this.view.renderCorrectionEmployees();
    this.view.renderAdmin();
    this.view.renderAuditLog();
    return true;
  }

  // Slaat alle tijdelijk gekozen producten in één keer op.
  registerSelectedProducts() {
    const total = Object.values(this.selectedProducts).reduce((sum, amount) => sum + amount, 0);
    if (!this.selectedEmployeeId || total === 0) {
      this.view.showToast("Kies eerst minimaal één product");
      return;
    }
    const saved = this.persist(() => {
      Object.entries(this.selectedProducts).forEach(([productId, amount]) => {
        for (let index = 0; index < amount; index += 1) this.model.addRegistration(this.selectedEmployeeId, productId);
      });
    });
    if (!saved) return;
    this.view.renderAll();
    this.selectedProducts = {};
    this.closeEmployeeProducts();
    this.view.showToast("Producten direct opgeslagen ✓");
  }

  // Opent login of dashboard afhankelijk van de huidige adminstatus.
  openAdmin() {
    this.view.$("#adminModal").classList.remove("hidden");
    if (!this.adminLoggedIn) {
      this.view.$("#loginView").classList.remove("hidden");
      this.view.$("#adminView").classList.add("hidden");
      this.view.$("#loginEmail").focus();
      return;
    }
    this.showDashboard();
  }

  // Toont alle actuele admingegevens wanneer de login is geslaagd.
  showDashboard() {
    this.auditLogLimit = 20;
    this.view.$("#loginView").classList.add("hidden");
    this.view.$("#adminView").classList.remove("hidden");
    this.view.populateFilters();
    this.view.renderAdmin();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminEmployees();
    this.view.renderAdminProducts();
    this.view.renderAdminCompanies();
    this.view.renderStock();
    this.view.renderAuditLog();
  }

  // Slaat het logboek op en tekent alle admin- en publieke onderdelen opnieuw.
  // Wordt gebruikt na wijzigingen aan bedrijven, consumptiepunten en voorraad.
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

  // Verwerkt dynamische knoppen uit de publieke en adminlijsten.
  handleClick(event) {
    const productIncrement = event.target.closest("[data-product-increment]");
    if (productIncrement) {
      const productId = productIncrement.dataset.productIncrement;
      this.selectedProducts[productId] = (this.selectedProducts[productId] || 0) + 1;
      this.view.renderEmployeeProducts(this.selectedEmployeeId);
      return;
    }
    if (event.target.closest("#registerSelectedProductsButton")) {
      this.registerSelectedProducts();
      return;
    }
    const employeeButton = event.target.closest("[data-open-employee]");
    if (employeeButton) {
      this.openEmployeeProducts(employeeButton.dataset.openEmployee);
      return;
    }
    const correctionPlus = event.target.closest("[data-correction-plus]");
    if (correctionPlus) {
      this.addCorrection(correctionPlus.dataset.correctionPlus, correctionPlus.dataset.correctionProduct);
      return;
    }
    const correctionMinus = event.target.closest("[data-correction-minus]");
    if (correctionMinus) {
      const employeeId = correctionMinus.dataset.correctionMinus;
      const productId = correctionMinus.dataset.correctionProduct;
      if (!this.model.registrations.some(({ employeeId: id, productId: idProduct }) => id === employeeId && idProduct === productId)) {
        this.view.showToast("Dit product heeft geen registratie voor deze medewerker");
        return;
      }
      const productName = this.model.productName(productId);
      if (this.persist(() => this.model.removeLastRegistration(employeeId, productId))) {
        this.model.logAdminAction("Registratie verwijderd", `${productName} van ${this.employeeLabel(employeeId)}`);
        this.model.save();
        this.view.renderAuditLog();
        this.view.populateFilters();
        this.view.renderCorrectionEmployees();
        this.view.renderAdmin();
        this.view.renderAll();
        this.view.showToast(`${productName} registratie verwijderd`);
      }
      return;
    }
    const toggleButton = event.target.closest("[data-toggle-employee]");
    if (toggleButton) {
      const employeeId = toggleButton.dataset.toggleEmployee;
      const active = !this.model.findEmployee(employeeId).active;
      if (this.persist(() => this.model.setEmployeeActive(employeeId, active))) {
        this.model.logAdminAction("Medewerkerstatus gewijzigd", `${this.employeeLabel(employeeId)} is ${active ? "actief" : "inactief"} gezet`);
        this.model.save();
        this.view.renderAuditLog();
        this.view.populateFilters();
        this.view.renderAdminEmployees();
        this.view.renderAll();
        this.view.showToast("Medewerkerstatus gewijzigd");
      }
      return;
    }
    const removeEmployeeButton = event.target.closest("[data-remove-employee]");
    if (removeEmployeeButton) {
      const employeeId = removeEmployeeButton.dataset.removeEmployee;
      const name = this.employeeLabel(employeeId);
      if (!window.confirm(`${name} definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
      if (this.persist(() => this.model.removeEmployee(employeeId))) {
        this.model.logAdminAction("Medewerker definitief verwijderd", name);
        this.model.save();
        this.view.renderAuditLog();
        this.view.populateFilters();
        this.view.renderAdminEmployees();
        this.view.renderAll();
        this.view.showToast("Inactieve medewerker definitief verwijderd");
      }
      return;
    }
    const editButton = event.target.closest("[data-edit-employee]");
    if (editButton) {
      const employee = this.model.findEmployee(editButton.dataset.editEmployee);
      this.view.$("#employeeForm").dataset.editingId = employee.id;
      this.view.$("#employeeSaveContinueButton").classList.add("hidden");
      this.view.$("#employeeFormTitle").textContent = "Medewerker wijzigen";
      this.view.$("#employeeFormHelp").textContent = "Pas de gegevens aan en klik daarna op Opslaan.";
      this.view.$("#newEmployeeFirstName").value = employee.firstName;
      this.view.$("#newEmployeeLastName").value = employee.lastName;
      this.view.$("#newEmployeePayrollCode").value = employee.payrollCode;
      this.view.$("#newEmployeePersonnelNumber").value = employee.personnelNumber;
      this.view.$("#newEmployeeEmployerNumber").value = employee.employerNumber || "";
      this.view.populateEmployeeCompanySelects(employee.companyId, employee.pointId);
      this.view.$("#employeeFormModal").classList.remove("hidden");
      this.view.showToast("Gegevens geladen om te wijzigen");
      return;
    }
    const removeProductButton = event.target.closest("[data-remove-product]");
    if (removeProductButton) {
      if (this.model.registrations.some(({ productId }) => productId === removeProductButton.dataset.removeProduct)) {
        this.view.showToast("Dit product wordt al gebruikt en kan niet worden verwijderd");
        return;
      }
      const productName = this.model.productName(removeProductButton.dataset.removeProduct);
      if (this.persist(() => this.model.removeProduct(removeProductButton.dataset.removeProduct))) {
        this.model.logAdminAction("Product verwijderd", productName);
        this.finishAdminChange("Product verwijderd");
      } else {
        this.view.showToast("Dit product wordt al gebruikt en kan niet worden verwijderd");
      }
      return;
    }
    const editProductButton = event.target.closest("[data-edit-product]");
    if (editProductButton) {
      const product = this.model.products.find(({ id }) => id === editProductButton.dataset.editProduct);
      this.view.$("#productName").value = product.name;
      this.view.$("#productPrice").value = product.price;
      this.view.$("#productForm").dataset.editingId = product.id;
      this.view.$("#productFormTitle").textContent = "Product wijzigen";
      this.view.$("#productFormHelp").textContent = "Pas de productnaam of prijs aan.";
      this.view.$("#productFormModal").classList.remove("hidden");
      this.view.$("#consumptionSaveContinueButton").classList.add("hidden");
      return;
    }
    this.handleCompanyClick(event);
  }

  // Verwerkt de knoppen van het bedrijven- en voorraadtabblad.
  handleCompanyClick(event) {
    const editCompanyButton = event.target.closest("[data-edit-company]");
    if (editCompanyButton) {
      this.openCompanyForm(this.model.findCompany(editCompanyButton.dataset.editCompany));
      return;
    }
    const removeCompanyButton = event.target.closest("[data-remove-company]");
    if (removeCompanyButton) {
      const companyId = removeCompanyButton.dataset.removeCompany;
      const name = this.model.companyName(companyId);
      if (this.model.employees.some((employee) => employee.companyId === companyId) || this.model.pointsForCompany(companyId).length) {
        this.view.showToast("Verwijder of verplaats eerst de medewerkers en consumptiepunten van dit bedrijf");
        return;
      }
      if (!window.confirm(`${name} verwijderen?`)) return;
      if (this.persist(() => this.model.removeCompany(companyId))) {
        this.model.logAdminAction("Bedrijf verwijderd", name);
        this.finishAdminChange("Bedrijf verwijderd");
      }
      return;
    }
    const addPointButton = event.target.closest("[data-add-point]");
    if (addPointButton) {
      this.openPointForm(null, addPointButton.dataset.addPoint);
      return;
    }
    const editPointButton = event.target.closest("[data-edit-point]");
    if (editPointButton) {
      this.openPointForm(this.model.findPoint(editPointButton.dataset.editPoint));
      return;
    }
    const removePointButton = event.target.closest("[data-remove-point]");
    if (removePointButton) {
      const point = this.model.findPoint(removePointButton.dataset.removePoint);
      if (this.model.employees.some(({ pointId }) => pointId === point.id)) {
        this.view.showToast("Koppel eerst de medewerkers van dit consumptiepunt aan een ander punt");
        return;
      }
      if (!window.confirm(`Consumptiepunt ${point.name} verwijderen? De voorraad van dit punt verdwijnt.`)) return;
      if (this.persist(() => this.model.removePoint(point.id))) {
        this.model.logAdminAction("Consumptiepunt verwijderd", `${point.name} (${this.model.companyName(point.companyId)})`);
        this.finishAdminChange("Consumptiepunt verwijderd");
      }
      return;
    }
    const showStockButton = event.target.closest("[data-show-stock-point]");
    if (showStockButton) {
      this.view.$("#stockPointSelect").value = showStockButton.dataset.showStockPoint;
      this.view.renderStock();
      return;
    }
    const deliveryButton = event.target.closest("[data-stock-delivery]");
    if (deliveryButton) {
      const productId = deliveryButton.dataset.stockDelivery;
      const pointId = this.view.$("#stockPointSelect").value;
      const amount = Number(this.view.$(`[data-delivery-amount="${productId}"]`).value);
      if (!Number.isInteger(amount) || amount <= 0) {
        this.view.showToast("Vul een geleverd aantal van minimaal 1 in");
        return;
      }
      if (this.persist(() => this.model.changeStock(pointId, productId, amount))) {
        this.model.logAdminAction("Levering geboekt", `${amount} × ${this.model.productName(productId)} op ${this.pointLabel(pointId)}`);
        this.finishAdminChange("Levering toegevoegd aan de voorraad");
      }
    }
  }

  // Bedrijf en naam van een consumptiepunt, voor het logboek.
  pointLabel(pointId) {
    const point = this.model.findPoint(pointId);
    return point ? `${this.model.companyName(point.companyId)} · ${point.name}` : "onbekend consumptiepunt";
  }

  // Slaat een gewijzigde voorraad (na tellen) of een gewijzigd minimum direct op.
  saveStockField(input) {
    const pointId = this.view.$("#stockPointSelect").value;
    const productId = input.dataset.productId;
    const value = Number(input.value);
    const isStock = input.dataset.stockField === "stock";

    if (input.value === "" || !Number.isInteger(value) || (!isStock && value < 0)) {
      this.view.showToast(isStock ? "Vul een geheel aantal in" : "Het minimum moet 0 of hoger zijn");
      this.view.renderStock();
      return;
    }
    const saved = this.persist(() => isStock
      ? this.model.setStock(pointId, productId, value)
      : this.model.setMinimum(pointId, productId, value));
    if (!saved) return;
    this.model.logAdminAction(
      isStock ? "Voorraad geteld" : "Minimum gewijzigd",
      `${this.model.productName(productId)} op ${this.pointLabel(pointId)}: ${value}`
    );
    this.finishAdminChange(isStock ? "Voorraad bijgewerkt" : "Minimum bijgewerkt");
  }

  // Opent het bedrijfsformulier, leeg of gevuld om te wijzigen.
  openCompanyForm(company = null) {
    const form = this.view.$("#companyForm");
    form.reset();
    if (company) form.dataset.editingId = company.id;
    else delete form.dataset.editingId;
    this.view.$("#companyFormTitle").textContent = company ? "Bedrijf wijzigen" : "Bedrijf toevoegen";
    this.view.$("#companyName").value = company?.name || "";
    this.view.$("#companyEmployerNumber").value = company?.employerNumber || "";
    this.view.$("#companyFormModal").classList.remove("hidden");
    this.view.$("#companyName").focus();
  }

  saveCompany(event) {
    event.preventDefault();
    const form = this.view.$("#companyForm");
    const editingId = form.dataset.editingId;
    const name = this.view.$("#companyName").value.trim();
    const employerNumber = this.view.$("#companyEmployerNumber").value.trim();
    if (!name) return;
    if (this.model.companies.some((company) => company.id !== editingId && company.name.toLowerCase() === name.toLowerCase())) {
      this.view.showToast("Er bestaat al een bedrijf met deze naam");
      return;
    }
    if (!this.persist(() => this.model.saveCompany({ id: editingId, name, employerNumber }))) return;
    this.model.logAdminAction(editingId ? "Bedrijf gewijzigd" : "Bedrijf toegevoegd", name);
    this.view.$("#companyFormModal").classList.add("hidden");
    this.finishAdminChange(editingId ? "Bedrijf gewijzigd" : "Bedrijf toegevoegd");
  }

  // Opent het consumptiepuntformulier, leeg voor een bedrijf of gevuld om te wijzigen.
  openPointForm(point = null, companyId = "") {
    const form = this.view.$("#pointForm");
    form.reset();
    if (point) form.dataset.editingId = point.id;
    else delete form.dataset.editingId;
    this.view.$("#pointFormTitle").textContent = point ? "Consumptiepunt wijzigen" : "Consumptiepunt toevoegen";
    this.view.renderPointForm(point, companyId);
    this.view.$("#pointFormModal").classList.remove("hidden");
    this.view.$("#pointName").focus();
  }

  savePoint(event) {
    event.preventDefault();
    const form = this.view.$("#pointForm");
    const editingId = form.dataset.editingId;
    const pointData = {
      id: editingId,
      name: this.view.$("#pointName").value.trim(),
      companyId: this.view.$("#pointCompany").value,
      offeredProductIds: [...form.querySelectorAll('input[name="offeredProduct"]:checked')].map(({ value }) => value)
    };
    if (!pointData.name || !pointData.companyId) return;
    if (this.model.pointsForCompany(pointData.companyId).some((point) => point.id !== editingId && point.name.toLowerCase() === pointData.name.toLowerCase())) {
      this.view.showToast("Dit bedrijf heeft al een consumptiepunt met deze naam");
      return;
    }

    // Medewerkers blijven aan hun punt gekoppeld; verhuist het punt naar een ander bedrijf, dan verhuizen zij mee.
    const saved = this.persist(() => {
      this.model.savePoint(pointData);
      if (editingId) {
        this.model.employees
          .filter(({ pointId }) => pointId === editingId)
          .forEach((employee) => this.model.updateEmployee(employee.id, { ...employee, companyId: pointData.companyId }));
      }
    });
    if (!saved) return;
    this.model.logAdminAction(
      editingId ? "Consumptiepunt gewijzigd" : "Consumptiepunt toegevoegd",
      `${pointData.name} (${this.model.companyName(pointData.companyId)}), ${pointData.offeredProductIds.length} producten aangeboden`
    );
    this.view.$("#pointFormModal").classList.add("hidden");
    this.finishAdminChange(editingId ? "Consumptiepunt gewijzigd" : "Consumptiepunt toegevoegd");
  }

  // Koppelt alle vaste formulieren, filters, tabs en toetsenbordacties.
  registerEventListeners() {
    document.addEventListener("click", (event) => this.handleClick(event));
    this.view.$("#adminOpenButton").addEventListener("click", () => this.openAdmin());
    document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => this.view.$("#adminModal").classList.add("hidden")));
    this.view.$("#adminModal").addEventListener("click", (event) => { if (event.target === this.view.$("#adminModal")) this.view.$("#adminModal").classList.add("hidden"); });
    this.view.$("#loginForm").addEventListener("submit", (event) => { event.preventDefault(); if (this.view.$("#loginEmail").value && this.view.$("#loginPassword").value) { this.adminLoggedIn = true; this.showDashboard(); } else this.view.$("#loginError").classList.remove("hidden"); });
    this.view.$("#logoutButton").addEventListener("click", () => { this.adminLoggedIn = false; this.view.$("#adminView").classList.add("hidden"); this.view.$("#loginView").classList.remove("hidden"); this.view.$("#loginPassword").value = ""; this.view.$("#loginEmail").focus(); });
    document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active")); tab.classList.add("active"); ["registrations", "employees", "products", "companies", "stock", "audit"].forEach((name) => this.view.$(`#${name}Tab`).classList.toggle("hidden", tab.dataset.tab !== name)); }));
    this.view.$("#filterEmployee").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#filterMonth").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#exportButton").addEventListener("click", () => exportCsv(this.model, this.view.$("#filterEmployee").value, this.view.$("#filterMonth").value, this.view));
    this.view.$("#employeeSearch").addEventListener("input", () => this.view.renderEmployees());
    this.view.$("#employeeCompanyFilter").addEventListener("input", () => {
      const input = this.view.$("#employeeCompanyFilter");
      delete input.dataset.value;
      this.filterCompanyOptions("#companyFilterOptions", input.value);
      this.view.$("#companyFilterOptions").classList.remove("hidden");
      this.view.renderEmployees();
    });
    this.view.$("#newEmployeeCompany").addEventListener("change", () => this.view.populateEmployeePointSelect());
    document.addEventListener("click", (event) => {
      const filterOption = event.target.closest("[data-company-value]");
      if (filterOption) {
        const filter = this.view.$("#employeeCompanyFilter");
        filter.dataset.value = filterOption.dataset.companyValue;
        filter.value = filterOption.textContent;
        this.view.$("#companyFilterOptions").classList.add("hidden");
        this.view.renderEmployees();
        return;
      }
      if (!event.target.closest(".company-combobox")) document.querySelectorAll(".company-options").forEach((options) => options.classList.add("hidden"));
    });
    const toggleCompanyDropdown = (comboboxSelector, optionsSelector) => {
      const combobox = document.querySelector(comboboxSelector);
      const options = this.view.$(optionsSelector);
      combobox.addEventListener("click", (event) => {
        if (event.target.closest(".company-options")) return;
        options.classList.toggle("hidden");
      });
    };
    toggleCompanyDropdown(".company-filter .company-combobox", "#companyFilterOptions");
    this.view.$("#addCompanyButton").addEventListener("click", () => this.openCompanyForm());
    this.view.$("#companyForm").addEventListener("submit", (event) => this.saveCompany(event));
    this.view.$("#pointForm").addEventListener("submit", (event) => this.savePoint(event));
    document.querySelectorAll("[data-close-company-modal]").forEach((button) => button.addEventListener("click", () => this.view.$("#companyFormModal").classList.add("hidden")));
    document.querySelectorAll("[data-close-point-modal]").forEach((button) => button.addEventListener("click", () => this.view.$("#pointFormModal").classList.add("hidden")));
    ["#companyFormModal", "#pointFormModal"].forEach((selector) => this.view.$(selector).addEventListener("click", (event) => { if (event.target === this.view.$(selector)) this.view.$(selector).classList.add("hidden"); }));
    this.view.$("#stockPointSelect").addEventListener("change", () => this.view.renderStock());
    this.view.$("#stockTableBody").addEventListener("change", (event) => { if (event.target.matches("[data-stock-field]")) this.saveStockField(event.target); });
    this.view.$("#adminEmployeeSearch").addEventListener("input", () => this.view.renderCorrectionEmployees());
    this.view.$("#employeeManagementSearch").addEventListener("input", () => this.view.renderAdminEmployees());
    this.view.$("#addEmployeeButton").addEventListener("click", () => this.openEmployeeForm());
    this.view.$("#employeeForm").addEventListener("submit", (event) => this.addEmployee(event));
    document.querySelectorAll("[data-close-employee-modal]").forEach((button) => button.addEventListener("click", () => this.closeEmployeeForm()));
    this.view.$("#employeeFormModal").addEventListener("click", (event) => { if (event.target === this.view.$("#employeeFormModal")) this.closeEmployeeForm(); });
    this.view.$("#addProductButton").addEventListener("click", () => this.openProductForm());
    this.view.$("#productForm").addEventListener("submit", (event) => this.saveProduct(event));
    document.querySelectorAll("[data-close-product-modal]").forEach((button) => button.addEventListener("click", () => this.closeProductForm()));
    this.view.$("#productFormModal").addEventListener("click", (event) => { if (event.target === this.view.$("#productFormModal")) this.closeProductForm(); });
    document.querySelectorAll("[data-close-employee-products]").forEach((button) => button.addEventListener("click", () => this.closeEmployeeProducts()));
    this.view.$("#employeeProductsModal").addEventListener("click", (event) => { if (event.target === this.view.$("#employeeProductsModal")) this.closeEmployeeProducts(); });
    this.view.$("#loadMoreAuditButton").addEventListener("click", () => { this.auditLogLimit += 20; this.view.renderAuditLog(this.auditLogLimit); });
    document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); this.view.$("#employeeSearch").focus(); } });
    // Medewerkerrijen hebben role="button" en moeten dus ook met Enter en spatie werken.
    this.view.$("#employeeList").addEventListener("keydown", (event) => {
      const employeeRow = event.target.closest("[data-open-employee]");
      if (!employeeRow || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      this.openEmployeeProducts(employeeRow.dataset.openEmployee);
    });
  }

  // Filtert de compacte bedrijfskeuzelijst terwijl de gebruiker typt.
  filterCompanyOptions(selector, query) {
    const normalizedQuery = query.toLowerCase().trim();
    this.view.$(selector).querySelectorAll("button").forEach((option) => {
      option.classList.toggle("hidden", Boolean(normalizedQuery) && !option.textContent.toLowerCase().includes(normalizedQuery));
    });
  }

  // Opent een leeg formulier voor het snel toevoegen van een medewerker.
  openEmployeeForm() {
    const form = this.view.$("#employeeForm");
    form.reset();
    this.view.populateEmployeeCompanySelects();
    delete form.dataset.editingId;
    this.view.$("#employeeSaveContinueButton").classList.remove("hidden");
    this.view.$("#employeeFormTitle").textContent = "Medewerker toevoegen";
    this.view.$("#employeeFormHelp").textContent = "Vul de gegevens in en kies daarna hoe je verder wilt gaan.";
    this.view.$("#employeeFormModal").classList.remove("hidden");
    this.view.$("#newEmployeeFirstName").focus();
  }

  // Sluit het medewerkersformulier zonder de admin-modal te sluiten.
  closeEmployeeForm() {
    this.view.$("#employeeFormModal").classList.add("hidden");
  }

  // Opent een leeg productformulier voor het snel toevoegen van een product.
  openProductForm() {
    const form = this.view.$("#productForm");
    form.reset();
    delete form.dataset.editingId;
    this.view.$("#consumptionSaveContinueButton").classList.remove("hidden");
    this.view.$("#productFormTitle").textContent = "Product toevoegen";
    this.view.$("#productFormHelp").textContent = "Vul de productnaam en prijs in.";
    this.view.$("#productFormModal").classList.remove("hidden");
    this.view.$("#productName").focus();
  }

  // Sluit het productformulier.
  closeProductForm() {
    this.view.$("#productFormModal").classList.add("hidden");
  }

  // Opent het persoonlijke productvenster met een lege keuze.
  openEmployeeProducts(employeeId) {
    this.selectedEmployeeId = employeeId;
    this.selectedProducts = {};
    this.view.renderEmployeeProducts(employeeId);
  }

  // Sluit het persoonlijke productvenster.
  closeEmployeeProducts() {
    this.view.$("#employeeProductsModal").classList.add("hidden");
    this.selectedProducts = {};
    this.selectedEmployeeId = null;
  }

  // Valideert een naam en slaat de nieuwe medewerker op.
  addEmployee(event) {
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
    const editingId = this.view.$("#employeeForm").dataset.editingId;
    const saved = this.persist(() => editingId ? this.model.updateEmployee(editingId, employeeData) : this.model.addEmployee(employeeData));
    if (!saved) return;
    this.model.logAdminAction(editingId ? "Medewerker gewijzigd" : "Medewerker toegevoegd", `${employeeData.firstName} ${employeeData.lastName}`);
    this.model.save();
    this.view.$("#employeeForm").reset();
    delete this.view.$("#employeeForm").dataset.editingId;
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderAdminCompanies();
    this.view.renderAuditLog();
    this.view.renderAll();
    this.view.showToast(editingId ? "Medewerker gewijzigd" : "Medewerker toegevoegd");
    if (event.submitter?.dataset.saveMode === "continue" && !editingId) {
      // Vaak worden meerdere collega's van hetzelfde punt achter elkaar ingevoerd.
      this.view.populateEmployeeCompanySelects(employeeData.companyId, employeeData.pointId);
      this.view.$("#employeeFormTitle").textContent = "Medewerker toevoegen";
      this.view.$("#employeeFormHelp").textContent = "Vul de gegevens in voor de volgende medewerker.";
      this.view.$("#newEmployeeFirstName").focus();
    } else {
      this.closeEmployeeForm();
    }
  }

  // Slaat een product op met de prijs die de beheerder heeft opgegeven.
  saveProduct(event) {
    event.preventDefault();
    const form = this.view.$("#productForm");
    const editingId = form.dataset.editingId;
    const productData = { id: editingId || crypto.randomUUID(), name: this.view.$("#productName").value.trim(), price: this.view.$("#productPrice").value };
    if (!productData.name || Number(productData.price) < 0) return;
    if (this.model.products.some((product) => product.id !== editingId && product.name.toLowerCase() === productData.name.toLowerCase())) {
      this.view.showToast("Er bestaat al een product met deze naam");
      return;
    }
    if (!this.persist(() => this.model.saveProduct(productData))) return;
    this.model.logAdminAction(editingId ? "Product gewijzigd" : "Product toegevoegd", productData.name);
    form.reset();
    delete form.dataset.editingId;
    this.finishAdminChange(editingId ? "Product gewijzigd" : "Product toegevoegd — zet het aan bij de consumptiepunten die het aanbieden");
    if (event.submitter?.dataset.saveMode === "continue" && !editingId) {
      this.view.$("#productFormTitle").textContent = "Product toevoegen";
      this.view.$("#productFormHelp").textContent = "Vul de gegevens in voor het volgende product.";
      this.view.$("#productName").focus();
    } else {
      this.closeProductForm();
    }
  }
}