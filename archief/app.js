// BACK-UP: originele versie van de app (één bestand) van vóór het opsplitsen in modules.
// Dit bestand wordt niet meer geladen; de werkende code staat in assets/js/ (startpunt main.js).
/* // De sleutel en vaste waarden staan centraal zodat ze later eenvoudig vervangen kunnen worden.
const STORAGE_KEY = "tvb-blikjesregistratie";
const COLORS = ["#d8f1e8", "#e3eef6", "#f8e9d9", "#e9e0f4", "#e4f0d8"];
const SEED_EMPLOYEES = ["Lotte van Dijk", "Mark Jansen", "Sophie de Boer", "Daan Smit", "Nora Visser", "Bram Bakker", "Eva Meijer", "Tom de Groot"];
const DEFAULT_PRODUCTS = [
  { id: "blikje", name: "Blikje", price: 0.65 },
  { id: "sneetje-brood", name: "Sneetje brood", price: 0.10 },
  { id: "boter", name: "Boter", price: 0.10 },
  { id: "zoet-beleg", name: "Zoet beleg", price: 0.20 },
  { id: "glas-melk", name: "Glas melk", price: 0.20 },
  { id: "beleg", name: "Beleg", price: 0.50 },
  { id: "ei", name: "Ei", price: 0.50 },
  { id: "yoghurt", name: "Yoghurt", price: 0.50 }
];

// Deze klasse is de opslaglaag. Later kan deze klasse vervangen worden door een API- of database-opslag.
class DataStore {
  // De sleutel wordt via de constructor ontvangen, zodat opslag later verwisselbaar blijft.
  constructor(key) {
    this.key = key;
  }

  // Leest opgeslagen JSON en weigert onvolledige of beschadigde gegevens.
  load() {
    try {
      const value = localStorage.getItem(this.key);
      if (!value) return null;
      const data = JSON.parse(value);
      const migrated = this.migrate(data);
      const validEmployees = Array.isArray(migrated?.employees) && migrated.employees.every((employee) => typeof employee?.id === "string" && typeof employee.name === "string" && employee.name.trim() && typeof employee.color === "string" && typeof employee.active === "boolean");
      const validRegistrations = Array.isArray(migrated?.registrations) && migrated.registrations.every((registration) => typeof registration?.id === "string" && typeof registration.employeeId === "string" && typeof registration.productId === "string" && typeof registration.createdAt === "string" && !Number.isNaN(Date.parse(registration.createdAt)));
      const validProducts = Array.isArray(migrated?.products) && migrated.products.every((product) => typeof product?.id === "string" && typeof product.name === "string" && Number.isFinite(product.price));
      if (!validEmployees || !validRegistrations || !validProducts) {
        console.warn("Ongeldige opgeslagen gegevens; de demo wordt opnieuw gestart.");
        return null;
      }
      return migrated;
    } catch (error) {
      console.warn("Opgeslagen gegevens konden niet worden gelezen; de demo wordt opnieuw gestart.", error);
      return null;
    }
  }

  // Zet oude demo-gegevens om naar de nieuwe medewerker-, product- en registratievelden.
  migrate(data) {
      const storedProducts = Array.isArray(data.products) ? data.products : [];
      const products = DEFAULT_PRODUCTS.map((defaultProduct) => defaultProduct)
        .concat(storedProducts.filter(({ id }) => !DEFAULT_PRODUCTS.some((defaultProduct) => defaultProduct.id === id)));
      const employees = (data.employees || []).map((employee, index) => {
        const nameParts = String(employee.name || "").trim().split(/\s+/);
        return {
          ...employee,
          name: employee.name || `${employee.firstName || ""} ${employee.lastName || ""}`.trim(),
          firstName: employee.firstName || nameParts.slice(0, -1).join(" ") || nameParts[0] || "",
          lastName: employee.lastName || nameParts.slice(-1)[0] || "",
          payrollCode: employee.payrollCode || "",
          personnelNumber: employee.personnelNumber || "",
          employerName: employee.employerName || "",
          employerNumber: employee.employerNumber || "",
          active: employee.active !== false,
          color: employee.color || COLORS[index % COLORS.length]
        };
      });
      const registrations = (data.registrations || []).map((registration) => ({
        ...registration,
        productId: { melk: "glas-melk", brood: "sneetje-brood" }[registration.productId] || registration.productId || "blikje"
      }));
      return { employees, registrations, products, auditLog: Array.isArray(data.auditLog) ? data.auditLog : [] };
  }

  // Schrijft de volledige applicatiestatus veilig naar de browseropslag.
  save(data) {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("De gegevens konden niet worden opgeslagen.", error);
      return false;
    }
  }
}

// Deze klasse bevat de data en alle regels voor medewerkers en registraties.
class RegistrationModel {
  // Het model gebruikt de opslaglaag en start met opgeslagen of voorbeeldgegevens.
  constructor(store) {
    this.store = store;
    const loadedState = store.load();
    this.state = loadedState ? {
      ...loadedState,
      registrations: (loadedState.registrations || []).map((registration) => ({
        ...registration,
        productId: { melk: "glas-melk", brood: "sneetje-brood" }[registration.productId] || registration.productId
      }))
    } : this.createSeedState();
  }

  // Maakt de eerste demo-status met voorbeeldmedewerkers zonder registraties.
  createSeedState() {
    return {
      employees: SEED_EMPLOYEES.map((name, index) => {
        const parts = name.split(" ");
        return { id: crypto.randomUUID(), name, firstName: parts[0], lastName: parts.slice(1).join(" "), payrollCode: "", personnelNumber: "", employerName: "", employerNumber: "", active: true, color: COLORS[index % COLORS.length] };
      }),
      registrations: [],
      products: DEFAULT_PRODUCTS.map((product) => ({ ...product })),
      auditLog: []
    };
  }

  // Maakt een kopie die gebruikt kan worden om een wijziging terug te draaien.
  snapshot() {
    return { employees: [...this.state.employees], registrations: [...this.state.registrations], products: [...this.state.products], auditLog: [...this.state.auditLog] };
  }

  // Herstelt de vorige status wanneer opslaan niet lukt.
  restore(snapshot) {
    this.state = snapshot;
  }

  save() {
    return this.store.save(this.state);
  }

  get employees() {
    return this.state.employees;
  }

  get registrations() {
    return this.state.registrations;
  }

  get products() {
    return this.state.products;
  }

  get auditLog() {
    return this.state.auditLog;
  }

  // Voegt precies één product toe met het huidige tijdstip.
  addRegistration(employeeId, productId = "blikje") {
    this.state.registrations = [...this.registrations, { id: crypto.randomUUID(), employeeId, productId, createdAt: new Date().toISOString() }];
  }

  // Verwijdert alleen de meest recente registratie van deze medewerker.
  removeLastRegistration(employeeId, productId) {
    const registration = [...this.registrations].reverse().find(({ employeeId: id, productId: idProduct }) => id === employeeId && (!productId || idProduct === productId));
    if (!registration) return false;
    this.state.registrations = this.registrations.filter(({ id }) => id !== registration.id);
    return true;
  }

  // Maakt een nieuwe medewerker aan met administratieve identificatievelden.
  addEmployee(employeeData) {
    const name = `${employeeData.firstName} ${employeeData.lastName}`.trim();
    this.state.employees = [...this.employees, { id: crypto.randomUUID(), ...employeeData, name, active: true, color: COLORS[this.employees.length % COLORS.length] }];
  }

  // Zet een medewerker inactief, zodat historische registraties behouden blijven.
  setEmployeeActive(employeeId, active) {
    this.state.employees = this.employees.map((employee) => employee.id === employeeId ? { ...employee, active } : employee);
  }

  // Wijzigt de gegevens van een bestaande medewerker.
  updateEmployee(employeeId, employeeData) {
    const name = `${employeeData.firstName} ${employeeData.lastName}`.trim();
    this.state.employees = this.employees.map((employee) => employee.id === employeeId ? { ...employee, ...employeeData, name } : employee);
  }

  // Voegt een productsoort toe of wijzigt de prijs van een product.
  saveProduct(productData) {
    const product = { ...productData, price: Number(productData.price) };
    const exists = this.products.some(({ id }) => id === product.id);
    this.state.products = exists ? this.products.map((item) => item.id === product.id ? product : item) : [...this.products, { ...product, id: crypto.randomUUID() }];
  }

  // Verwijdert een product alleen wanneer het nog niet in registraties wordt gebruikt.
  removeProduct(productId) {
    if (this.registrations.some(({ productId: id }) => id === productId)) return false;
    this.state.products = this.products.filter(({ id }) => id !== productId);
    return true;
  }

  // Verwijdert een inactieve medewerker definitief; registraties blijven historisch bewaard.
  removeEmployee(employeeId) {
    this.state.employees = this.employees.filter(({ id }) => id !== employeeId);
  }

  // Bewaart een controleerbaar logboek van wijzigingen door de beheerder.
  logAdminAction(action, details) {
    this.state.auditLog = [...this.auditLog, { id: crypto.randomUUID(), action, details, createdAt: new Date().toISOString() }];
  }

  // Zoekt een medewerker op basis van de unieke id.
  findEmployee(employeeId) {
    return this.employees.find(({ id }) => id === employeeId);
  }

  // Telt alle registraties die aan één medewerker gekoppeld zijn.
  countForEmployee(employeeId) {
    return this.registrations.filter(({ employeeId: id }) => id === employeeId).length;
  }

  totalCostForEmployee(employeeId) {
    return this.registrations.filter(({ employeeId: id }) => id === employeeId).reduce((total, registration) => total + (this.products.find(({ id }) => id === registration.productId)?.price || 0), 0);
  }

  productName(productId) {
    return this.products.find(({ id }) => id === productId)?.name || "Onbekend product";
  }

  // Telt registraties die op dezelfde kalenderdag zijn gemaakt.
  countForDate(date) {
    return this.registrations.filter(({ createdAt }) => new Date(createdAt).toDateString() === date.toDateString()).length;
  }

  // Telt registraties binnen dezelfde maand en hetzelfde jaar.
  countForMonth(date) {
    return this.registrations.filter(({ createdAt }) => this.monthKey(new Date(createdAt)) === this.monthKey(date)).length;
  }

  // Maakt een sorteerbare maandcode, bijvoorbeeld 2026-09.
  monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
}

// Deze klasse verzorgt alleen de zichtbare HTML-weergave.
class RegistrationView {
  // De view ontvangt het model, maar verandert de data zelf niet.
  constructor(model) {
    this.model = model;
    this.$ = (selector) => document.querySelector(selector);
  }

  // Escapet gebruikersnamen voordat ze in innerHTML worden geplaatst.
  escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  // Maakt maximaal twee initialen voor de avatar van een medewerker.
  initials(name) {
    return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  }

  // Toont een ISO-datum in Nederlandse datum- en tijdnotatie.
  formatDate(value) {
    return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  // Rendert de publieke medewerkerlijst op basis van de zoekterm.
  renderEmployees() {
    const query = this.$("#employeeSearch").value.toLowerCase().trim();
    const companyFilter = this.$("#employeeCompanyFilter").dataset.value || "all";
    const employees = this.model.employees.filter(({ name, active, employerName, employerNumber }) => {
      const company = employerName || employerNumber || "unknown";
      return active && name.toLowerCase().includes(query) && (companyFilter === "all" || company.toLowerCase().includes(companyFilter.toLowerCase()));
    });
    this.$("#employeeCount").textContent = `${employees.length} totaal`;
    this.$("#emptyState").classList.toggle("hidden", employees.length > 0);
    const groups = employees.reduce((grouped, employee) => {
      const company = employee.employerName || employee.employerNumber || "Onbekend bedrijf";
      const key = employee.employerName || employee.employerNumber || "unknown";
      grouped[key] = grouped[key] || { company, employees: [] };
      grouped[key].employees.push(employee);
      return grouped;
    }, {});
    this.$("#employeeList").innerHTML = Object.values(groups).map(({ company, employees: companyEmployees }) => `<section class="company-group"><h3>${this.escapeHtml(company)}</h3>${companyEmployees.map((employee) => `<div class="employee-row employee-row-clickable" data-open-employee="${employee.id}" tabindex="0" role="button" aria-label="Product kiezen voor ${this.escapeHtml(employee.name)}"><div class="employee-info"><span class="person-avatar" style="background:${employee.color}">${this.initials(employee.name)}</span><div><div class="employee-name">${this.escapeHtml(employee.name)}</div><div class="employee-total">Klik om een product te kiezen</div></div></div></div>`).join("")}</section>`).join("");
  }

  // Vult de bedrijfsfilter met de werkgevers die bij medewerkers zijn ingevuld.
  populateCompanyFilter() {
    const filter = this.$("#employeeCompanyFilter");
    const selected = filter.dataset.value || "all";
    const companies = [...new Set(this.model.employees.map(({ employerName, employerNumber }) => employerName || employerNumber).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl"));
    const selectedValue = companies.includes(selected) || selected === "unknown" ? selected : "all";
    filter.dataset.value = selectedValue;
    filter.value = selectedValue === "all" ? "" : selectedValue === "unknown" ? "Onbekend bedrijf" : selectedValue;
    const options = [`<button type="button" data-company-value="all">Alle bedrijven</button>`, ...companies.map((company) => `<button type="button" data-company-value="${this.escapeHtml(company)}">${this.escapeHtml(company)}</button>`), `<button type="button" data-company-value="unknown">Onbekend bedrijf</button>`].join("");
    this.$("#companyFilterOptions").innerHTML = options;
    this.$("#companyFormOptions").innerHTML = companies.map((company) => `<button type="button" data-company-form-value="${this.escapeHtml(company)}">${this.escapeHtml(company)}</button>`).join("");
  }

  // Werkt de kaarten met dag- en maandtotalen bij.
  renderStats() {
    const now = new Date();
    this.$("#todayTotal").textContent = this.model.countForDate(now);
    this.$("#monthTotal").textContent = this.model.countForMonth(now);
  }

  // Rendert de gefilterde registratietabel in het admin-dashboard.
  renderAdmin() {
    const monthFilter = this.$("#filterMonth").value;
    const employeeFilter = this.$("#filterEmployee").value;
    const filtered = this.model.registrations.filter((registration) => (employeeFilter === "all" || registration.employeeId === employeeFilter) && (monthFilter === "all" || this.model.monthKey(new Date(registration.createdAt)) === monthFilter)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this.$("#adminTableBody").innerHTML = filtered.length ? filtered.map((registration) => {
      const employee = this.model.findEmployee(registration.employeeId);
      return `<tr><td>${employee ? this.escapeHtml(employee.name) : "Verwijderd"}</td><td>${this.escapeHtml(this.model.productName(registration.productId))}</td><td>+1</td><td>${this.formatDate(registration.createdAt)}</td></tr>`;
    }).join("") : `<tr><td colspan="4" class="muted">Geen registraties voor deze filters.</td></tr>`;
  }

  // Rendert de medewerkers waarvoor de admin correcties kan uitvoeren.
  renderCorrectionEmployees() {
    const query = this.$("#adminEmployeeSearch").value.toLowerCase().trim();
    const employees = this.model.employees.filter(({ name }) => name.toLowerCase().includes(query));
    const openEmployee = this.$("#adminCorrectionList details[open]")?.dataset.correctionEmployee || "";
    this.$("#adminCorrectionList").innerHTML = employees.map((employee) => {
      const products = this.model.products.map(({ id, name }) => {
        const count = this.model.registrations.filter((registration) => registration.employeeId === employee.id && registration.productId === id).length;
        return `<div class="correction-product-row"><span>${this.escapeHtml(name)}</span><div class="correction-actions"><button class="correction-button correction-minus" data-correction-minus="${employee.id}" data-correction-product="${id}" title="${this.escapeHtml(name)} verminderen">−</button><strong class="correction-amount">${count}</strong><button class="correction-button correction-plus" data-correction-plus="${employee.id}" data-correction-product="${id}" title="${this.escapeHtml(name)} toevoegen">+</button></div></div>`;
      }).join("");
      return `<details class="admin-correction-item" data-correction-employee="${employee.id}"${employee.id === openEmployee ? " open" : ""}><summary><strong>${this.escapeHtml(employee.name)}</strong><span class="correction-count">${this.model.countForEmployee(employee.id)} producten · € ${this.model.totalCostForEmployee(employee.id).toFixed(2).replace(".", ",")}</span></summary><div class="correction-product-list">${products}</div></details>`;
    }).join("") || `<p class="muted">Geen medewerker gevonden.</p>`;
  }

  // Vult de filterkeuzes met actuele medewerkers en maanden.
  populateFilters() {
    const selectedEmployee = this.$("#filterEmployee").value;
    const selectedMonth = this.$("#filterMonth").value;
    this.$("#filterEmployee").innerHTML = `<option value="all">Alle medewerkers</option>${this.model.employees.map(({ id, name }) => `<option value="${id}">${this.escapeHtml(name)}</option>`).join("")}`;
    const months = [...new Set(this.model.registrations.map(({ createdAt }) => this.model.monthKey(new Date(createdAt))))];
    this.$("#filterMonth").innerHTML = `<option value="all">Alle maanden</option>${months.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(new Date(`${month}-01`))}</option>`).join("")}`;
    this.$("#filterEmployee").value = this.model.findEmployee(selectedEmployee) ? selectedEmployee : "all";
    this.$("#filterMonth").value = months.includes(selectedMonth) ? selectedMonth : "all";
  }

  // Rendert de lijst waarmee de admin medewerkers kan verwijderen.
  renderAdminEmployees() {
    const query = this.$("#employeeManagementSearch").value.toLowerCase().trim();
    const employees = this.model.employees.filter(({ name }) => name.toLowerCase().includes(query));
    this.$("#adminEmployeeList").innerHTML = employees.map((employee) => `<div class="admin-employee-item"><span><strong>${this.escapeHtml(employee.name)}</strong><small>${employee.active ? "Actief" : "Inactief"} · ${this.escapeHtml(employee.personnelNumber || "Geen personeelsnummer")}</small></span><div class="admin-item-actions"><button class="table-action" data-toggle-employee="${employee.id}" title="Medewerker actief of inactief zetten">${employee.active ? "Deactiveren" : "Activeren"}</button>${employee.active ? "" : `<button class="table-action danger-action" data-remove-employee="${employee.id}" title="Medewerker definitief verwijderen">Verwijderen</button>`}<button class="table-action" data-edit-employee="${employee.id}" title="Medewerker wijzigen">Wijzigen</button></div></div>`).join("") || `<p class="muted">Geen medewerker gevonden.</p>`;
  }

  // Vult de productkeuze op het openbare scherm.
  renderProductSelect() {
    return this.model.products;
  }

  // Toont alleen productnamen en losse prijzen voor de gekozen medewerker.
  renderEmployeeProducts(employeeId) {
    const employee = this.model.findEmployee(employeeId);
    if (!employee) return;
    this.$("#employeeProductsTitle").textContent = `Product kiezen voor ${employee.name}`;
    this.$("#employeeProductList").innerHTML = this.model.products.map(({ id, name, price }) => {
      const selectedAmount = this.app.selectedProducts[id] || 0;
      return `<div class="personal-product-item"><span><strong>${this.escapeHtml(name)}</strong><small>€ ${price.toFixed(2).replace(".", ",")}</small></span><button class="personal-product-plus" type="button" data-product-increment="${id}" aria-label="${this.escapeHtml(name)} toevoegen">+</button><strong class="personal-product-amount">${selectedAmount}</strong></div>`;
    }).join("");
    this.$("#employeeProductsModal").classList.remove("hidden");
  }

  // Toont de producten die de beheerder kan onderhouden.
  renderAdminProducts() {
    this.$("#adminProductList").innerHTML = this.model.products.map((product) => `<div class="admin-employee-item"><span><strong>${this.escapeHtml(product.name)}</strong><small>€ ${product.price.toFixed(2).replace(".", ",")}</small></span><div class="admin-item-actions"><button class="table-action" data-edit-product="${product.id}">Wijzigen</button><button class="table-action danger-action" data-remove-product="${product.id}">Verwijderen</button></div></div>`).join("");
  }

  // Toont het logboek met wijzigingen van de beheerder.
  renderAuditLog(limit = 20) {
    const visibleEntries = [...this.model.auditLog].reverse().slice(0, limit);
    const rows = visibleEntries.map((entry) => `<tr><td>${this.escapeHtml(entry.action)}</td><td>${this.escapeHtml(entry.details)}</td><td>${this.formatDate(entry.createdAt)}</td></tr>`).join("");
    this.$("#auditTableBody").innerHTML = rows || `<tr><td colspan="3" class="muted">Nog geen administratieve wijzigingen.</td></tr>`;
    this.$("#loadMoreAuditButton").classList.toggle("hidden", visibleEntries.length >= this.model.auditLog.length);
  }

  // Ververst de vaste onderdelen van de publieke pagina tegelijk.
  renderAll() {
    this.renderProductSelect();
    this.populateCompanyFilter();
    this.renderEmployees();
    this.renderStats();
  }

  // Toont tijdelijk feedback na een gebruikersactie.
  showToast(message) {
    const toast = this.$("#toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.classList.add("show");
    setTimeout(() => toast.classList.add("hidden"), 2500);
  }
}

// Deze klasse koppelt gebruikersacties aan het model en de view.
class RegistrationApp {
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
    this.view.$("#exportButton").addEventListener("click", () => this.exportExcel());
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

  // Bouwt de twee Excel-tabbladen op basis van de geselecteerde filters.
  exportExcel() {
    if (!window.XLSX) {
      this.view.showToast("Excel-export kon niet worden geladen.");
      return;
    }
    const selectedEmployee = this.view.$("#filterEmployee").value;
    const selectedMonth = this.view.$("#filterMonth").value;
    const selected = this.model.registrations.filter((registration) => (selectedEmployee === "all" || registration.employeeId === selectedEmployee) && (selectedMonth === "all" || this.model.monthKey(new Date(registration.createdAt)) === selectedMonth));
    const grouped = new Map();
    selected.forEach((registration) => {
      const employee = this.model.findEmployee(registration.employeeId);
      const date = new Date(registration.createdAt);
      const key = `${registration.employeeId}-${this.model.monthKey(date)}`;
      const current = grouped.get(key) || { employee, year: date.getFullYear(), month: date.getMonth() + 1, total: 0, price: 0 };
      current.total += 1;
      current.price += this.model.products.find(({ id }) => id === registration.productId)?.price || 0;
      grouped.set(key, current);
    });
    const totals = [...grouped.values()].map(({ employee, year, month, total, price }) => ({
      Jaar: year,
      Maand: month,
      Looncode: employee?.payrollCode || "",
      Personeelsnummer: employee?.personnelNumber || "",
      Werkgevernummer: employee?.employerNumber || "",
      Naam: employee?.name || "Verwijderd",
      Totaal: total,
      Prijs: Number(price.toFixed(2))
    }));
    const periodTotal = totals.reduce((sum, row) => sum + row.Totaal, 0);
    const periodPrice = totals.reduce((sum, row) => sum + row.Prijs, 0);
    totals.push({ Jaar: "", Maand: "", Looncode: "", Personeelsnummer: "", Werkgevernummer: "", Naam: "TOTAAL PERIODE", Totaal: periodTotal, Prijs: Number(periodPrice.toFixed(2)) });
    const workbook = XLSX.utils.book_new();
    const detail = selected.map(({ employeeId, productId, createdAt }) => ({ Jaar: new Date(createdAt).getFullYear(), Maand: new Date(createdAt).getMonth() + 1, Looncode: this.model.findEmployee(employeeId)?.payrollCode || "", Personeelsnummer: this.model.findEmployee(employeeId)?.personnelNumber || "", Werkgevernummer: this.model.findEmployee(employeeId)?.employerNumber || "", Naam: this.model.findEmployee(employeeId)?.name || "Verwijderd", Product: this.model.productName(productId), Totaal: 1, Prijs: this.model.products.find(({ id }) => id === productId)?.price || 0 }));
    const detailSheet = XLSX.utils.json_to_sheet(totals, { header: ["Jaar", "Maand", "Looncode", "Personeelsnummer", "Werkgevernummer", "Naam", "Totaal", "Prijs"] });
    const totalsSheet = XLSX.utils.json_to_sheet(detail);
    [detailSheet, totalsSheet].forEach((sheet) => Object.keys(sheet).filter((cell) => cell[0] !== "!" && ["H", "I"].includes(cell.replace(/\d/g, ""))).forEach((cell) => { if (typeof sheet[cell].v === "number") sheet[cell].z = "€ 0.00"; }));
    XLSX.utils.book_append_sheet(workbook, detailSheet, selectedMonth === "all" ? "Periode-totalen" : "Maandtotalen");
    XLSX.utils.book_append_sheet(workbook, totalsSheet, "Registraties");
    XLSX.writeFile(workbook, `blikjesregistratie-${selectedMonth === "all" ? "alle-periodes" : selectedMonth}.xlsx`);
  }
}

// In de browser wordt de applicatie gestart; Node kan de klassen voor unit tests importeren.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DataStore, RegistrationModel, DEFAULT_PRODUCTS };
} else {
  const model = new RegistrationModel(new DataStore(STORAGE_KEY));
  const app = new RegistrationApp(model, new RegistrationView(model));
  app.initialize();
} */