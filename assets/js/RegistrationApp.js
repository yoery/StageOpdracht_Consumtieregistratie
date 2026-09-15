import { exportExcel } from "./excelExport.js";

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

  // Registreert een blikje en ververst de juiste onderdelen van de interface.
  addRegistration(employeeId, adminCorrection = false, productId = "blikje") {
    const saved = this.persist(() => this.model.addRegistration(employeeId, productId));
    if (!saved) return false;
    if (adminCorrection) {
      this.model.logAdminAction("Registratie toegevoegd", `Product ${this.model.productName(productId)} voor medewerker ${employeeId}`);
      if (!this.model.save()) {
        this.view.showToast("Registratie opgeslagen, maar het logboek kon niet worden bijgewerkt.");
      }

    }
    this.view.renderAll();
    if (!adminCorrection) this.closeEmployeeProducts();
    if (adminCorrection) {
      this.view.renderCorrectionEmployees();
      this.view.renderAdmin();
      this.view.showToast("Blikje toegevoegd voor medewerker");
    } else {
      this.view.showToast("Blikje direct opgeslagen ✓");
    }
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
    this.view.renderAuditLog();
  }

  // Verwerkt dynamische knoppen uit de publieke en adminlijsten.
  handleClick(event) {
    const personalAdd = event.target.closest("[data-personal-add]");
    if (personalAdd) {
      this.addRegistration(personalAdd.dataset.personalAdd, false, personalAdd.dataset.productId);
      return;
    }
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
      this.selectedEmployeeId = employeeButton.dataset.openEmployee;
      this.selectedProducts = {};
      this.view.renderEmployeeProducts(employeeButton.dataset.openEmployee);
      return;
    }
    const correctionPlus = event.target.closest("[data-correction-plus]");
    if (correctionPlus) {
      this.addRegistration(correctionPlus.dataset.correctionPlus, true, correctionPlus.dataset.correctionProduct);
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
        this.model.logAdminAction("Registratie verwijderd", `${productName} van medewerker ${employeeId}`);
        this.model.save();
        this.view.renderAuditLog();
        this.view.populateFilters();
        this.view.renderCorrectionEmployees();
        this.view.renderAdmin();
        this.view.renderAll();
        this.view.showToast(`${productName} registratie verwijderd`);
      }
    }
    const toggleButton = event.target.closest("[data-toggle-employee]");
    if (toggleButton && this.persist(() => this.model.setEmployeeActive(toggleButton.dataset.toggleEmployee, !this.model.findEmployee(toggleButton.dataset.toggleEmployee).active))) {
      this.model.logAdminAction("Medewerkerstatus gewijzigd", `Medewerker ${toggleButton.dataset.toggleEmployee} is actief/inactief gezet`);
      this.model.save();
      this.view.renderAuditLog();
      this.view.populateFilters();
      this.view.renderAdminEmployees();
      this.view.renderAll();
      this.view.showToast("Medewerkerstatus gewijzigd");
    }
    const removeEmployeeButton = event.target.closest("[data-remove-employee]");
    if (removeEmployeeButton && this.persist(() => this.model.removeEmployee(removeEmployeeButton.dataset.removeEmployee))) {
      this.model.logAdminAction("Medewerker definitief verwijderd", `Medewerker ${removeEmployeeButton.dataset.removeEmployee}`);
      this.model.save();
      this.view.renderAuditLog();
      this.view.populateFilters();
      this.view.renderAdminEmployees();
      this.view.renderAll();
      this.view.showToast("Inactieve medewerker definitief verwijderd");
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
      this.view.$("#newEmployeeEmployerName").value = employee.employerName;
      this.view.$("#newEmployeeEmployerNumber").value = employee.employerNumber;
      this.view.$("#employeeFormModal").classList.remove("hidden");
      this.view.showToast("Gegevens geladen om te wijzigen");
    }
    const removeProductButton = event.target.closest("[data-remove-product]");
    if (removeProductButton) {
      if (this.model.registrations.some(({ productId }) => productId === removeProductButton.dataset.removeProduct)) {
        this.view.showToast("Dit product wordt al gebruikt en kan niet worden verwijderd");
        return;
      }
      if (this.persist(() => this.model.removeProduct(removeProductButton.dataset.removeProduct))) {
        this.model.logAdminAction("Product verwijderd", removeProductButton.dataset.removeProduct);
        this.model.save();
        this.view.renderAuditLog();
        this.view.renderAdminProducts();
        this.view.renderProductSelect();
        this.view.showToast("Product verwijderd");
      } else {
        this.view.showToast("Dit product wordt al gebruikt en kan niet worden verwijderd");
      }
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

    }
  }

  // Koppelt alle vaste formulieren, filters, tabs en toetsenbordacties.
  registerEventListeners() {
    document.addEventListener("click", (event) => this.handleClick(event));
    this.view.$("#adminOpenButton").addEventListener("click", () => this.openAdmin());
    document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => this.view.$("#adminModal").classList.add("hidden")));
    this.view.$("#adminModal").addEventListener("click", (event) => { if (event.target === this.view.$("#adminModal")) this.view.$("#adminModal").classList.add("hidden"); });
    this.view.$("#loginForm").addEventListener("submit", (event) => { event.preventDefault(); if (this.view.$("#loginEmail").value && this.view.$("#loginPassword").value) { this.adminLoggedIn = true; this.showDashboard(); } else this.view.$("#loginError").classList.remove("hidden"); });
    this.view.$("#logoutButton").addEventListener("click", () => { this.adminLoggedIn = false; this.view.$("#adminView").classList.add("hidden"); this.view.$("#loginView").classList.remove("hidden"); this.view.$("#loginPassword").value = ""; this.view.$("#loginEmail").focus(); });
    document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active")); tab.classList.add("active"); ["registrations", "employees", "products", "audit"].forEach((name) => this.view.$(`#${name}Tab`).classList.toggle("hidden", tab.dataset.tab !== name)); }));
    this.view.$("#filterEmployee").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#filterMonth").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#exportButton").addEventListener("click", () =>
    exportExcel(this.model,this.view.$("#filterEmployee").value,this.view.$("#filterMonth").value,this.view)
);    
this.view.$("#employeeSearch").addEventListener("input", () => this.view.renderEmployees());
    this.view.$("#employeeCompanyFilter").addEventListener("input", () => {
      const input = this.view.$("#employeeCompanyFilter");
      delete input.dataset.value;
      this.filterCompanyOptions("#companyFilterOptions", input.value);
      this.view.$("#companyFilterOptions").classList.remove("hidden");
      this.view.renderEmployees();
    });
    this.view.$("#newEmployeeEmployerName").addEventListener("input", () => {
      const input = this.view.$("#newEmployeeEmployerName");
      this.filterCompanyOptions("#companyFormOptions", input.value);
      this.view.$("#companyFormOptions").classList.remove("hidden");
    });
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

      const formOption = event.target.closest("[data-company-form-value]");
      if (formOption) {
        this.view.$("#newEmployeeEmployerName").value = formOption.dataset.companyFormValue;
        this.view.$("#companyFormOptions").classList.add("hidden");
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
    toggleCompanyDropdown(".form-company-combobox", "#companyFormOptions");
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
    this.view.populateCompanyFilter();
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
      employerName: this.view.$("#newEmployeeEmployerName").value.trim(),
      employerNumber: this.view.$("#newEmployeeEmployerNumber").value.trim()
    };
    if (!employeeData.firstName || !employeeData.lastName) return;
    const editingId = this.view.$("#employeeForm").dataset.editingId;
    const saved = this.persist(() => editingId ? this.model.updateEmployee(editingId, employeeData) : this.model.addEmployee(employeeData));
    if (!saved) return;
    this.model.logAdminAction(editingId ? "Medewerker gewijzigd" : "Medewerker toegevoegd", `${employeeData.firstName} ${employeeData.lastName}`);
    this.model.save();
    this.view.$("#employeeForm").reset();
    delete this.view.$("#employeeForm").dataset.editingId;
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderAuditLog();
    this.view.renderAll();
    this.view.showToast(editingId ? "Medewerker gewijzigd" : "Medewerker toegevoegd");
    if (event.submitter?.dataset.saveMode === "continue" && !editingId) {
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
    if (!this.persist(() => this.model.saveProduct(productData))) return;
    this.model.logAdminAction(editingId ? "Product gewijzigd" : "Product toegevoegd", productData.name);
    this.model.save();
    form.reset();
    delete form.dataset.editingId;
    this.view.renderAdminProducts();
    this.view.renderProductSelect();
    this.view.renderCorrectionEmployees();
    this.view.renderAuditLog();
    this.view.showToast(editingId ? "Product gewijzigd" : "Product toegevoegd");
    if (event.submitter?.dataset.saveMode === "continue" && !editingId) {
      this.view.$("#productFormTitle").textContent = "Product toevoegen";
      this.view.$("#productFormHelp").textContent = "Vul de gegevens in voor het volgende product.";
      this.view.$("#productName").focus();
    } else {
      this.closeProductForm();
    }
  }
}