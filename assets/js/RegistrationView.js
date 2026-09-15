export class RegistrationView {
  // De view ontvangt het model, maar verandert de data zelf niet.
  constructor(model) {
    this.model = model;
    this.$ = (selector) => document.querySelector(selector);
  }

  // Escapet gebruikersnamen voordat ze in innerHTML worden geplaatst.
  escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "'"
    }[char]));
  }

  // Maakt maximaal twee initialen voor de avatar van een medewerker.
  initials(name) {
    return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  }

  // Toont een ISO-datum in Nederlandse datum- en tijdnotatie.
  formatDate(value) {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  // Rendert de publieke medewerkerlijst op basis van de zoekterm.
  renderEmployees() {
    const query = this.$("#employeeSearch").value.toLowerCase().trim();
    const companyFilter = this.$("#employeeCompanyFilter").dataset.value || "all";

    const employees = this.model.employees.filter(({ name, active, employerName, employerNumber }) => {
      const company = employerName || employerNumber || "unknown";
      return active &&
        name.toLowerCase().includes(query) &&
        (companyFilter === "all" ||
          company.toLowerCase().includes(companyFilter.toLowerCase()));
    });

    this.$("#employeeCount").textContent = `${employees.length} totaal`;
    this.$("#emptyState").classList.toggle("hidden", employees.length > 0);

    const groups = employees.reduce((grouped, employee) => {
      const company = employee.employerName || employee.employerNumber || "Onbekend bedrijf";
      const key = employee.employerName || employee.employerNumber || "unknown";

      grouped[key] = grouped[key] || {
        company,
        employees: []
      };

      grouped[key].employees.push(employee);
      return grouped;
    }, {});

    this.$("#employeeList").innerHTML = Object.values(groups)
      .map(({ company, employees: companyEmployees }) =>
        `<section class="company-group">
          <h3>${this.escapeHtml(company)}</h3>
          ${companyEmployees.map((employee) =>
            `<div class="employee-row employee-row-clickable"
                  data-open-employee="${employee.id}"
                  tabindex="0"
                  role="button"
                  aria-label="Product kiezen voor ${this.escapeHtml(employee.name)}">
              <div class="employee-info">
                <span class="person-avatar" style="background:${employee.color}">
                  ${this.initials(employee.name)}
                </span>
                <div>
                  <div class="employee-name">${this.escapeHtml(employee.name)}</div>
                  <div class="employee-total">Klik om een product te kiezen</div>
                </div>
              </div>
            </div>`
          ).join("")}
        </section>`
      )
      .join("");
  }

  // Vult de bedrijfsfilter met de werkgevers die bij medewerkers zijn ingevuld.
  populateCompanyFilter() {
    const filter = this.$("#employeeCompanyFilter");
    const selected = filter.dataset.value || "all";

    const companies = [
      ...new Set(
        this.model.employees
          .map(({ employerName, employerNumber }) =>
            employerName || employerNumber
          )
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b, "nl"));

    const selectedValue =
      companies.includes(selected) || selected === "unknown"
        ? selected
        : "all";

    filter.dataset.value = selectedValue;

    filter.value =
      selectedValue === "all"
        ? ""
        : selectedValue === "unknown"
          ? "Onbekend bedrijf"
          : selectedValue;

    const options = [
      `<button type="button" data-company-value="all">Alle bedrijven</button>`,
      ...companies.map((company) =>
        `<button type="button" data-company-value="${this.escapeHtml(company)}">${this.escapeHtml(company)}</button>`
      ),
      `<button type="button" data-company-value="unknown">Onbekend bedrijf</button>`
    ].join("");

    this.$("#companyFilterOptions").innerHTML = options;

    this.$("#companyFormOptions").innerHTML = companies
      .map((company) =>
        `<button type="button" data-company-form-value="${this.escapeHtml(company)}">${this.escapeHtml(company)}</button>`
      )
      .join("");
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

    const filtered = this.model.registrations
      .filter((registration) =>
        (employeeFilter === "all" || registration.employeeId === employeeFilter) &&
        (monthFilter === "all" ||
          this.model.monthKey(new Date(registration.createdAt)) === monthFilter)
      )
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    this.$("#adminTableBody").innerHTML = filtered.length
      ? filtered.map((registration) => {
        const employee = this.model.findEmployee(registration.employeeId);

        return `
          <tr>
            <td>${employee ? this.escapeHtml(employee.name) : "Verwijderd"}</td>
            <td>${this.escapeHtml(this.model.productName(registration.productId))}</td>
            <td>+1</td>
            <td>${this.formatDate(registration.createdAt)}</td>
          </tr>`;
      }).join("")
      : `<tr>
          <td colspan="4" class="muted">
            Geen registraties voor deze filters.
          </td>
        </tr>`;
  }

  // Rendert de medewerkers waarvoor de admin correcties kan uitvoeren.
  renderCorrectionEmployees() {
    const query = this.$("#adminEmployeeSearch").value.toLowerCase().trim();
    const employees = this.model.employees.filter(({ name }) =>
      name.toLowerCase().includes(query)
    );

    const openEmployee =
      this.$("#adminCorrectionList details[open]")?.dataset.correctionEmployee || "";

    this.$("#adminCorrectionList").innerHTML =
      employees.map((employee) => {
        const products = this.model.products.map(({ id, name }) => {
          const count = this.model.registrations.filter(
            (registration) =>
              registration.employeeId === employee.id &&
              registration.productId === id
          ).length;

          return `
            <div class="correction-product-row">
              <span>${this.escapeHtml(name)}</span>
              <div class="correction-actions">
                <button class="correction-button correction-minus"
                        data-correction-minus="${employee.id}"
                        data-correction-product="${id}"
                        title="${this.escapeHtml(name)} verminderen">−</button>

                <strong class="correction-amount">${count}</strong>

                <button class="correction-button correction-plus"
                        data-correction-plus="${employee.id}"
                        data-correction-product="${id}"
                        title="${this.escapeHtml(name)} toevoegen">+</button>
              </div>
            </div>`;
        }).join("");

        return `
          <details class="admin-correction-item"
                   data-correction-employee="${employee.id}"
                   ${employee.id === openEmployee ? "open" : ""}>
            <summary>
              <strong>${this.escapeHtml(employee.name)}</strong>
              <span class="correction-count">
                ${this.model.countForEmployee(employee.id)} producten ·
                € ${this.model.totalCostForEmployee(employee.id).toFixed(2).replace(".", ",")}
              </span>
            </summary>
            <div class="correction-product-list">${products}</div>
          </details>`;
      }).join("") ||
      `<p class="muted">Geen medewerker gevonden.</p>`;
  }

  populateFilters() {
    const selectedEmployee = this.$("#filterEmployee").value;
    const selectedMonth = this.$("#filterMonth").value;

    this.$("#filterEmployee").innerHTML =
      `<option value="all">Alle medewerkers</option>${
        this.model.employees.map(({ id, name }) =>
          `<option value="${id}">${this.escapeHtml(name)}</option>`
        ).join("")
      }`;

    const months = [
      ...new Set(
        this.model.registrations.map(({ createdAt }) =>
          this.model.monthKey(new Date(createdAt))
        )
      )
    ];

    this.$("#filterMonth").innerHTML =
      `<option value="all">Alle maanden</option>${
        months.map((month) =>
          `<option value="${month}">
            ${new Intl.DateTimeFormat("nl-NL", {
              month: "long",
              year: "numeric"
            }).format(new Date(`${month}-01`))}
          </option>`
        ).join("")
      }`;

    this.$("#filterEmployee").value =
      this.model.findEmployee(selectedEmployee)
        ? selectedEmployee
        : "all";

    this.$("#filterMonth").value =
      months.includes(selectedMonth)
        ? selectedMonth
        : "all";
  }

  renderAdminEmployees() {
    const query = this.$("#employeeManagementSearch").value.toLowerCase().trim();

    const employees = this.model.employees.filter(({ name }) =>
      name.toLowerCase().includes(query)
    );

    this.$("#adminEmployeeList").innerHTML =
      employees.map((employee) =>
        `<div class="admin-employee-item">
          <span>
            <strong>${this.escapeHtml(employee.name)}</strong>
            <small>
              ${employee.active ? "Actief" : "Inactief"} ·
              ${this.escapeHtml(employee.personnelNumber || "Geen personeelsnummer")}
            </small>
          </span>

          <div class="admin-item-actions">
            <button class="table-action"
                    data-toggle-employee="${employee.id}">
              ${employee.active ? "Deactiveren" : "Activeren"}
            </button>

            ${
              employee.active
                ? ""
                : `<button class="table-action danger-action"
                      data-remove-employee="${employee.id}">
                      Verwijderen
                   </button>`
            }

            <button class="table-action"
                    data-edit-employee="${employee.id}">
              Wijzigen
            </button>
          </div>
        </div>`
      ).join("") || `<p class="muted">Geen medewerker gevonden.</p>`;
  }

  renderProductSelect() {
    return this.model.products;
  }

  renderEmployeeProducts(employeeId) {
    const employee = this.model.findEmployee(employeeId);
    if (!employee) return;

    this.$("#employeeProductsTitle").textContent =
      `Product kiezen voor ${employee.name}`;

    this.$("#employeeProductList").innerHTML =
      this.model.products.map(({ id, name, price }) => {
        const selectedAmount = this.app.selectedProducts[id] || 0;

        return `
          <div class="personal-product-item">
            <span>
              <strong>${this.escapeHtml(name)}</strong>
              <small>€ ${price.toFixed(2).replace(".", ",")}</small>
            </span>

            <button class="personal-product-plus"
                    type="button"
                    data-product-increment="${id}">
              +
            </button>

            <strong class="personal-product-amount">
              ${selectedAmount}
            </strong>
          </div>`;
      }).join("");

    this.$("#employeeProductsModal").classList.remove("hidden");
  }

  renderAdminProducts() {
    this.$("#adminProductList").innerHTML =
      this.model.products.map((product) =>
        `<div class="admin-employee-item">
          <span>
            <strong>${this.escapeHtml(product.name)}</strong>
            <small>€ ${product.price.toFixed(2).replace(".", ",")}</small>
          </span>

          <div class="admin-item-actions">
            <button class="table-action"
                    data-edit-product="${product.id}">
              Wijzigen
            </button>

            <button class="table-action danger-action"
                    data-remove-product="${product.id}">
              Verwijderen
            </button>
          </div>
        </div>`
      ).join("");
  }

  renderAuditLog(limit = 20) {
    const visibleEntries = [...this.model.auditLog]
      .reverse()
      .slice(0, limit);

    const rows = visibleEntries.map((entry) =>
      `<tr>
        <td>${this.escapeHtml(entry.action)}</td>
        <td>${this.escapeHtml(entry.details)}</td>
        <td>${this.formatDate(entry.createdAt)}</td>
      </tr>`
    ).join("");

    this.$("#auditTableBody").innerHTML =
      rows ||
      `<tr>
        <td colspan="3" class="muted">
          Nog geen administratieve wijzigingen.
        </td>
      </tr>`;

    this.$("#loadMoreAuditButton").classList.toggle(
      "hidden",
      visibleEntries.length >= this.model.auditLog.length
    );
  }

  renderAll() {
    this.renderProductSelect();
    this.populateCompanyFilter();
    this.renderEmployees();
    this.renderStats();
  }

  showToast(message) {
    const toast = this.$("#toast");

    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.classList.add("show");

    setTimeout(() => toast.classList.add("hidden"), 2500);
  }
}