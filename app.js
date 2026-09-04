// De sleutel en vaste waarden staan centraal zodat ze later eenvoudig vervangen kunnen worden.
const STORAGE_KEY = "tvb-blikjesregistratie";
const PRICE_PER_CAN = 0.69;
const COLORS = ["#d8f1e8", "#e3eef6", "#f8e9d9", "#e9e0f4", "#e4f0d8"];
const SEED_EMPLOYEES = ["Lotte van Dijk", "Mark Jansen", "Sophie de Boer", "Daan Smit", "Nora Visser", "Bram Bakker", "Eva Meijer", "Tom de Groot"];

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
      const validEmployees = Array.isArray(data?.employees) && data.employees.every((employee) => typeof employee?.id === "string" && typeof employee.name === "string" && employee.name.trim() && typeof employee.color === "string");
      const validRegistrations = Array.isArray(data?.registrations) && data.registrations.every((registration) => typeof registration?.id === "string" && typeof registration.employeeId === "string" && typeof registration.createdAt === "string" && !Number.isNaN(Date.parse(registration.createdAt)));
      if (!validEmployees || !validRegistrations) {
        console.warn("Ongeldige opgeslagen gegevens; de demo wordt opnieuw gestart.");
        return null;
      }
      return data;
    } catch (error) {
      console.warn("Opgeslagen gegevens konden niet worden gelezen; de demo wordt opnieuw gestart.", error);
      return null;
    }
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
    this.state = store.load() || this.createSeedState();
  }

  // Maakt de eerste demo-status met voorbeeldmedewerkers zonder registraties.
  createSeedState() {
    return {
      employees: SEED_EMPLOYEES.map((name, index) => ({ id: crypto.randomUUID(), name, color: COLORS[index % COLORS.length] })),
      registrations: []
    };
  }

  // Maakt een kopie die gebruikt kan worden om een wijziging terug te draaien.
  snapshot() {
    return { employees: [...this.state.employees], registrations: [...this.state.registrations] };
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

  // Voegt precies één blikje toe met het huidige tijdstip.
  addRegistration(employeeId) {
    this.state.registrations = [...this.registrations, { id: crypto.randomUUID(), employeeId, createdAt: new Date().toISOString() }];
  }

  // Verwijdert alleen de meest recente registratie van deze medewerker.
  removeLastRegistration(employeeId) {
    const registration = [...this.registrations].reverse().find(({ employeeId: id }) => id === employeeId);
    if (!registration) return false;
    this.state.registrations = this.registrations.filter(({ id }) => id !== registration.id);
    return true;
  }

  // Maakt een nieuwe medewerker aan met een afwisselende avatar-kleur.
  addEmployee(name) {
    this.state.employees = [...this.employees, { id: crypto.randomUUID(), name, color: COLORS[this.employees.length % COLORS.length] }];
  }

  // Verwijdert de medewerker, maar laat historische registraties bewust bestaan.
  removeEmployee(employeeId) {
    this.state.employees = this.employees.filter(({ id }) => id !== employeeId);
  }

  // Zoekt een medewerker op basis van de unieke id.
  findEmployee(employeeId) {
    return this.employees.find(({ id }) => id === employeeId);
  }

  // Telt alle registraties die aan één medewerker gekoppeld zijn.
  countForEmployee(employeeId) {
    return this.registrations.filter(({ employeeId: id }) => id === employeeId).length;
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
    const employees = this.model.employees.filter(({ name }) => name.toLowerCase().includes(query));
    this.$("#employeeCount").textContent = `${this.model.employees.length} totaal`;
    this.$("#emptyState").classList.toggle("hidden", employees.length > 0);
    this.$("#employeeList").innerHTML = employees.map((employee) => {
      const total = this.model.countForEmployee(employee.id);
      return `<div class="employee-row"><div class="employee-info"><span class="person-avatar" style="background:${employee.color}">${this.initials(employee.name)}</span><div><div class="employee-name">${this.escapeHtml(employee.name)}</div><div class="employee-total">${total} blikje${total === 1 ? "" : "s"} gepakt</div></div></div><button class="plus-button" data-add="${employee.id}" aria-label="Blikje registreren voor ${this.escapeHtml(employee.name)}">+</button></div>`;
    }).join("");
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
      return `<tr><td>${employee ? this.escapeHtml(employee.name) : "Verwijderd"}</td><td>+1</td><td>${this.formatDate(registration.createdAt)}</td></tr>`;
    }).join("") : `<tr><td colspan="3" class="muted">Geen registraties voor deze filters.</td></tr>`;
  }

  // Rendert de medewerkers waarvoor de admin correcties kan uitvoeren.
  renderCorrectionEmployees() {
    const query = this.$("#adminEmployeeSearch").value.toLowerCase().trim();
    const employees = this.model.employees.filter(({ name }) => name.toLowerCase().includes(query));
    this.$("#adminCorrectionList").innerHTML = employees.map((employee) => `<div class="admin-correction-item"><strong>${this.escapeHtml(employee.name)}</strong><span class="correction-count">${this.model.countForEmployee(employee.id)} gepakt</span><div class="correction-actions"><button class="correction-button correction-minus" data-correction-minus="${employee.id}" title="Een blikje verwijderen">−</button><button class="correction-button correction-plus" data-correction-plus="${employee.id}" title="Een blikje toevoegen">+</button></div></div>`).join("") || `<p class="muted">Geen medewerker gevonden.</p>`;
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
    this.$("#adminEmployeeList").innerHTML = employees.map((employee) => `<div class="admin-employee-item"><span>${this.escapeHtml(employee.name)}</span><button class="table-action" data-remove-employee="${employee.id}" title="Medewerker verwijderen">×</button></div>`).join("") || `<p class="muted">Geen medewerker gevonden.</p>`;
  }

  // Ververst de vaste onderdelen van de publieke pagina tegelijk.
  renderAll() {
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
  addRegistration(employeeId, adminCorrection = false) {
    const saved = this.persist(() => this.model.addRegistration(employeeId));
    if (!saved) return false;
    this.view.renderAll();
    if (adminCorrection) {
      this.view.renderCorrectionEmployees();
      this.view.renderAdmin();
      this.view.showToast("Blikje toegevoegd voor medewerker");
    } else {
      this.view.showToast("Blikje direct opgeslagen ✓");
    }
    return true;
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
    this.view.$("#loginView").classList.add("hidden");
    this.view.$("#adminView").classList.remove("hidden");
    this.view.populateFilters();
    this.view.renderAdmin();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminEmployees();
  }

  // Verwerkt dynamische knoppen uit de publieke en adminlijsten.
  handleClick(event) {
    const addButton = event.target.closest("[data-add]");
    if (addButton) this.addRegistration(addButton.dataset.add);
    const correctionPlus = event.target.closest("[data-correction-plus]");
    if (correctionPlus) this.addRegistration(correctionPlus.dataset.correctionPlus, true);
    const correctionMinus = event.target.closest("[data-correction-minus]");
    if (correctionMinus) {
      const employeeId = correctionMinus.dataset.correctionMinus;
      if (!this.model.registrations.some(({ employeeId: id }) => id === employeeId)) {
        this.view.showToast("Deze medewerker heeft geen blikjes om te verwijderen");
        return;
      }
      if (this.persist(() => this.model.removeLastRegistration(employeeId))) {
        this.view.populateFilters();
        this.view.renderCorrectionEmployees();
        this.view.renderAdmin();
        this.view.renderAll();
        this.view.showToast("Laatste blikje verwijderd");
      }
    }
    const removeButton = event.target.closest("[data-remove-employee]");
    if (removeButton && this.persist(() => this.model.removeEmployee(removeButton.dataset.removeEmployee))) {
      this.view.populateFilters();
      this.view.renderAdminEmployees();
      this.view.renderAll();
      this.view.showToast("Medewerker verwijderd");
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
    document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active")); tab.classList.add("active"); this.view.$("#registrationsTab").classList.toggle("hidden", tab.dataset.tab !== "registrations"); this.view.$("#employeesTab").classList.toggle("hidden", tab.dataset.tab !== "employees"); }));
    this.view.$("#filterEmployee").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#filterMonth").addEventListener("change", () => this.view.renderAdmin());
    this.view.$("#exportButton").addEventListener("click", () => this.exportExcel());
    this.view.$("#employeeSearch").addEventListener("input", () => this.view.renderEmployees());
    this.view.$("#adminEmployeeSearch").addEventListener("input", () => this.view.renderCorrectionEmployees());
    this.view.$("#employeeManagementSearch").addEventListener("input", () => this.view.renderAdminEmployees());
    this.view.$("#employeeForm").addEventListener("submit", (event) => this.addEmployee(event));
    document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); this.view.$("#employeeSearch").focus(); } });
  }

  // Valideert een naam en slaat de nieuwe medewerker op.
  addEmployee(event) {
    event.preventDefault();
    const name = this.view.$("#newEmployeeName").value.trim();
    if (!name || !this.persist(() => this.model.addEmployee(name))) return;
    this.view.$("#newEmployeeName").value = "";
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderAll();
    this.view.showToast("Medewerker toegevoegd");
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
    const detail = selected.map(({ employeeId, createdAt }) => ({ Medewerker: this.model.findEmployee(employeeId)?.name || "Verwijderd", "Aantal blikjes": 1, "Prijs per blikje": PRICE_PER_CAN, "Registratiedatum": new Date(createdAt).toLocaleString("nl-NL") }));
    const totals = this.model.employees.filter((employee) => selectedEmployee === "all" || employee.id === selectedEmployee).map((employee) => {
      const count = selected.filter(({ employeeId }) => employeeId === employee.id).length;
      return { Medewerker: employee.name, "Maandtotaal blikjes": count, "Totale prijs": (count * Math.round(PRICE_PER_CAN * 100)) / 100 };
    });
    totals.push({ Medewerker: "TOTAAL ALLE MEDEWERKERS", "Maandtotaal blikjes": selected.length, "Totale prijs": (selected.length * Math.round(PRICE_PER_CAN * 100)) / 100 });
    const workbook = XLSX.utils.book_new();
    const detailSheet = XLSX.utils.json_to_sheet(detail);
    const totalsSheet = XLSX.utils.json_to_sheet(totals);
    [detailSheet, totalsSheet].forEach((sheet) => Object.keys(sheet).filter((cell) => cell[0] !== "!" && ["C", "D"].includes(cell.replace(/\d/g, ""))).forEach((cell) => { if (typeof sheet[cell].v === "number") sheet[cell].z = "€ 0.00"; }));
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Registraties");
    XLSX.utils.book_append_sheet(workbook, totalsSheet, selectedMonth === "all" ? "Periode-totalen" : "Maandtotalen");
    XLSX.writeFile(workbook, `blikjesregistratie-${selectedMonth === "all" ? "alle-periodes" : selectedMonth}.xlsx`);
  }
}

// Dependency injection koppelt de opslag, het model, de view en de controller los van elkaar.
const model = new RegistrationModel(new DataStore(STORAGE_KEY));
const app = new RegistrationApp(model, new RegistrationView(model));
app.initialize();
