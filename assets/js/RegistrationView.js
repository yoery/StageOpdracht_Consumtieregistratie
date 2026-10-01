import { STOCK_STATUS } from "./RegistrationModel.js";
import { icon } from "./icons.js";

/**
 * RegistrationView — alles wat op het scherm komt (de "View" in MVC).
 *
 * Verantwoordelijkheid:
 *   - zet de gegevens uit het model om naar HTML: de medewerkerlijst, het productvenster,
 *     de tabellen en lijsten in het beheerscherm, de voorraad en meldingen (toasts);
 *   - maakt tekst veilig voordat die in de pagina komt (escapeHtml).
 *
 * Verbonden met:
 *   - RegistrationModel: de view leest daaruit, maar verandert zelf nooit gegevens.
 *   - index.html: de view vult de elementen met een id, zoals #employeeList en #stockTableBody.
 *   - RegistrationApp: bepaalt wanneer er opnieuw getekend moet worden en roept dan de
 *     render-methodes aan. De view weet zelf niets van de controller.
 */
export class RegistrationView {
  // De view ontvangt het model om gegevens te kunnen tonen.
  // `$` is een korte schrijfwijze om één element op de pagina te zoeken.
  constructor(model) {
    this.model = model;
    this.$ = (selector) => document.querySelector(selector);
  }

  // Escapet gebruikersnamen voordat ze in innerHTML worden geplaatst.
  escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  // Vult alle elementen met data-icon="naam" in de pagina met het bijbehorende SVG-icoon.
  renderIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((element) => {
      element.innerHTML = icon(element.dataset.icon);
    });
  }

  // Maakt een lege toestand: een icoon, een korte kop, uitleg wat je kunt doen en
  // eventueel een knop (HTML). Zo ziet iedere lege lijst er hetzelfde uit.
  emptyState({ iconName = "inbox", title, text = "", action = "" }) {
    return `<div class="empty-block">
      ${icon(iconName)}
      <strong>${this.escapeHtml(title)}</strong>
      ${text ? `<p>${this.escapeHtml(text)}</p>` : ""}
      ${action}
    </div>`;
  }

  // Een lege toestand als tabelregel over de hele breedte van de tabel.
  emptyTableRow(columns, options) {
    return `<tr><td colspan="${columns}" class="empty-cell">${this.emptyState(options)}</td></tr>`;
  }

  // Knop in een lege toestand die naar een ander tabblad van het beheerscherm gaat.
  goToTabButton(tabName, label) {
    return `<button type="button" class="secondary-button" data-go-tab="${tabName}">${this.escapeHtml(label)}</button>`;
  }

  // Toont een foutmelding direct onder een formulierveld en markeert het veld als ongeldig.
  showFieldError(field, message) {
    const errorId = `${field.id}-error`;
    let error = document.getElementById(errorId);

    if (!error) {
      error = document.createElement("p");
      error.className = "field-error";
      error.id = errorId;
      // In het label zelf, zodat de indeling van het formulier (twee kolommen) niet verschuift.
      const label = field.closest("label");
      if (label) label.append(error);
      else field.after(error);
    }

    error.innerHTML = `${icon("alert")}<span></span>`;
    error.querySelector("span").textContent = message;
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", errorId);
  }

  // Haalt de foutmelding van één veld weg.
  clearFieldError(field) {
    document.getElementById(`${field.id}-error`)?.remove();
    field.removeAttribute("aria-invalid");
    if (field.getAttribute("aria-describedby") === `${field.id}-error`) {
      field.removeAttribute("aria-describedby");
    }
  }

  // Haalt alle foutmeldingen in een formulier weg.
  clearFieldErrors(form) {
    form.querySelectorAll("[aria-invalid='true']").forEach((field) => this.clearFieldError(field));
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

  // Rendert de publieke medewerkerlijst op basis van de zoekterm en het gekozen bedrijf.
  renderEmployees() {
    const query = this.$("#employeeSearch").value.toLowerCase().trim();
    const companyFilter = this.$("#employeeCompanyFilter").dataset.value || "all";

    const employees = this.model.employees.filter(({ name, active, companyId }) =>
      active &&
      name.toLowerCase().includes(query) &&
      (companyFilter === "all" || (companyId || "unknown") === companyFilter)
    );

    this.$("#employeeCount").textContent = `${employees.length} totaal`;
    this.$("#emptyState").classList.toggle("hidden", employees.length > 0);

    const groups = employees.reduce((grouped, employee) => {
      const key = employee.companyId || "unknown";

      grouped[key] = grouped[key] || {
        company: this.model.companyName(employee.companyId),
        employees: []
      };

      grouped[key].employees.push(employee);
      return grouped;
    }, {});

    this.$("#employeeList").innerHTML = Object.values(groups)
      .sort((a, b) => a.company.localeCompare(b.company, "nl"))
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

  // Vult de bedrijfsfilter met de bedrijven waar actieve medewerkers aan gekoppeld zijn.
  populateCompanyFilter() {
    const filter = this.$("#employeeCompanyFilter");
    const selected = filter.dataset.value || "all";
    const activeEmployees = this.model.employees.filter(({ active }) => active);

    const companies = this.model.sortedCompanies().filter(({ id }) =>
      activeEmployees.some(({ companyId }) => companyId === id)
    );
    const hasUnknown = activeEmployees.some(({ companyId }) => !this.model.findCompany(companyId));

    const selectedValue =
      companies.some(({ id }) => id === selected) || (selected === "unknown" && hasUnknown)
        ? selected
        : "all";

    filter.dataset.value = selectedValue;
    filter.value = selectedValue === "all" ? "" : this.model.companyName(selectedValue === "unknown" ? null : selectedValue);

    this.$("#companyFilterOptions").innerHTML = [
      `<button type="button" data-company-value="all">Alle bedrijven</button>`,
      ...companies.map(({ id, name }) =>
        `<button type="button" data-company-value="${id}">${this.escapeHtml(name)}</button>`
      ),
      hasUnknown ? `<button type="button" data-company-value="unknown">Onbekend bedrijf</button>` : ""
    ].join("");
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
      : this.model.registrations.length === 0
        ? this.emptyTableRow(4, {
          title: "Nog geen registraties.",
          text: "Registraties verschijnen hier zodra medewerkers iets registreren."
        })
        : this.emptyTableRow(4, {
          title: "Geen registraties voor deze filters.",
          text: "Kies een andere medewerker of maand, of kies weer voor alle medewerkers en maanden."
        });
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
                        title="${this.escapeHtml(name)} verminderen"
                        aria-label="${this.escapeHtml(name)} verminderen">${icon("minus")}</button>

                <strong class="correction-amount">${count}</strong>

                <button class="correction-button correction-plus"
                        data-correction-plus="${employee.id}"
                        data-correction-product="${id}"
                        title="${this.escapeHtml(name)} toevoegen"
                        aria-label="${this.escapeHtml(name)} toevoegen">${icon("plus")}</button>
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
      this.emptyState({ iconName: "userSearch", title: "Geen medewerker gevonden.", text: "Probeer een andere zoekterm." });
  }

  // Vult de filters medewerker en maand boven de registratietabel.
  // Een eerder gekozen waarde blijft geselecteerd als die nog bestaat.
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
          `<option value="${month}">${this.monthLabel(month)}</option>`
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

  // Tekst voor een maand in het filter: de consumptiemaand plus de loonmaand waarin die
  // wordt verwerkt, bijvoorbeeld "september 2026 (loonmaand oktober 2026)".
  monthLabel(month) {
    const monthFormat = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });

    const [year, monthNumber] = month.split("-").map(Number);
    const consumptionDate = new Date(year, monthNumber - 1, 1);
    const payroll = this.model.payrollPeriod(consumptionDate);
    const payrollDate = new Date(payroll.year, payroll.month - 1, 1);

    return `${monthFormat.format(consumptionDate)} (loonmaand ${monthFormat.format(payrollDate)})`;
  }

  // Rendert de medewerkerslijst in het beheertabblad, met knoppen om te wijzigen,
  // (de)activeren en verwijderen. Verwijderen kan alleen bij inactieve medewerkers.
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
              ${this.escapeHtml(this.model.companyName(employee.companyId))} ·
              ${this.escapeHtml(this.model.findPoint(employee.pointId)?.name || "Geen consumptiepunt")} ·
              ${this.escapeHtml(employee.personnelNumber || "Geen personeelsnummer")}
              ${employee.employerNumber ? ` · werkgevernr. ${this.escapeHtml(employee.employerNumber)} (afwijkend)` : ""}
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
      ).join("") || this.emptyState({ iconName: "userSearch", title: "Geen medewerker gevonden.", text: "Probeer een andere zoekterm, of voeg een medewerker toe." });
  }

  // Begroeting die past bij het tijdstip: tot 12 uur "Goedemorgen", tot 18 uur "Goedemiddag".
  greeting(date) {
    const hour = date.getHours();
    if (hour < 12) return "Goedemorgen";
    if (hour < 18) return "Goedemiddag";
    return "Goedenavond";
  }

  // Zet een keuze om naar tekst, bijvoorbeeld { blikje: 2, ei: 1 } wordt "2× Blikje en 1× Ei".
  describeSelection(selection) {
    const parts = Object.entries(selection).map(([productId, amount]) => `${amount}× ${this.model.productName(productId)}`);
    if (parts.length <= 1) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} en ${parts.at(-1)}`;
  }

  // Opent het productvenster van een medewerker. `selectedProducts` komt van de controller
  // en bevat per product-id hoe vaak het al is gekozen, bijvoorbeeld { blikje: 2 }.
  // `face` beschrijft de demo gezichtsherkenning: { available, enrolled, recognized }.
  renderEmployeeProducts(employeeId, selectedProducts = {}, face = {}) {
    const employee = this.model.findEmployee(employeeId);
    if (!employee) return;

    this.$("#employeeProductsTitle").textContent =
      `Product kiezen voor ${employee.name}`;

    // Persoonlijke begroeting, bijvoorbeeld "Goedemiddag Lotte, welkom terug."
    const lastSelection = this.model.lastSelection(employeeId);
    const returning = this.model.countForEmployee(employeeId) > 0;
    let welcome = `${this.greeting(new Date())} ${employee.firstName || employee.name}${returning ? ", welkom terug." : "."}`;
    if (face.recognized) welcome += " Je bent herkend met de camera.";
    this.$("#employeeWelcome").textContent = welcome;

    // Aanbeveling op basis van de vorige keer, met één knop om dezelfde keuze te maken.
    const suggestion = this.$("#employeeSuggestion");
    const hasSuggestion = Object.keys(lastSelection).length > 0;
    suggestion.classList.toggle("hidden", !hasSuggestion);
    suggestion.innerHTML = hasSuggestion
      ? `${icon("repeat")}
        <span>Vorige keer koos je ${this.escapeHtml(this.describeSelection(lastSelection))}.</span>
        <button type="button" class="secondary-button" data-repeat-last>Zelfde als vorige keer</button>`
      : "";

    // Demo gezichtsherkenning: instellen of uitzetten (alleen als de demo beschikbaar is).
    const faceArea = this.$("#faceEnrollArea");
    faceArea.classList.toggle("hidden", !face.available);
    faceArea.innerHTML = !face.available
      ? ""
      : face.enrolled
        ? `<span class="face-enrolled">${icon("check")} Gezichtsherkenning staat aan (demo)</span>
           <button type="button" class="text-link" data-face-forget>Uitzetten</button>`
        : `<button type="button" class="text-link" data-face-enroll>${icon("faceScan")} Gezichtsherkenning instellen (demo)</button>`;

    // Alleen de producten van het eigen consumptiepunt zijn te kiezen.
    const products = this.model.productsForEmployee(employeeId);
    const registerButton = this.$("#registerSelectedProductsButton");
    registerButton.classList.toggle("hidden", products.length === 0);

    // De knop laat zien hoeveel producten er worden geregistreerd, bijvoorbeeld "Registreren (3)".
    const totalSelected = Object.values(selectedProducts).reduce((sum, amount) => sum + amount, 0);
    registerButton.textContent = totalSelected > 0 ? `Registreren (${totalSelected})` : "Registreren";

    // Per product: naam en prijs, en een teller met − en + (de − kan niet onder 0).
    this.$("#employeeProductList").innerHTML = products.length === 0
      ? this.emptyState({ iconName: "location", title: "Geen producten op jouw consumptiepunt.", text: "Neem contact op met de beheerder als dit niet klopt." })
      : products.map(({ id, name, price }) => {
        const selectedAmount = selectedProducts[id] || 0;

        return `
          <div class="personal-product-item">
            <span>
              <strong>${this.escapeHtml(name)}</strong>
              <small>€ ${price.toFixed(2).replace(".", ",")}</small>
            </span>

            <button class="personal-product-step personal-product-minus"
                    type="button"
                    data-product-decrement="${id}"
                    aria-label="Eén ${this.escapeHtml(name)} minder"
                    ${selectedAmount === 0 ? "disabled" : ""}>
              ${icon("minus")}
            </button>

            <strong class="personal-product-amount" aria-live="polite">
              ${selectedAmount}
            </strong>

            <button class="personal-product-step personal-product-plus"
                    type="button"
                    data-product-increment="${id}"
                    aria-label="Eén ${this.escapeHtml(name)} meer">
              ${icon("plus")}
            </button>
          </div>`;
      }).join("");

    this.$("#employeeProductsModal").classList.remove("hidden");
  }

  // Vult de keuzelijsten bedrijf en consumptiepunt in het medewerkersformulier.
  populateEmployeeCompanySelects(companyId = "", pointId = "") {
    this.$("#newEmployeeCompany").innerHTML =
      `<option value="">Kies een bedrijf</option>${
        this.model.sortedCompanies().map(({ id, name }) =>
          `<option value="${id}">${this.escapeHtml(name)}</option>`
        ).join("")
      }`;
    this.$("#newEmployeeCompany").value = this.model.findCompany(companyId) ? companyId : "";
    this.populateEmployeePointSelect(pointId);
  }

  // Toont alleen de consumptiepunten van het gekozen bedrijf.
  populateEmployeePointSelect(pointId = "") {
    const points = this.model.pointsForCompany(this.$("#newEmployeeCompany").value);

    this.$("#newEmployeePoint").innerHTML =
      `<option value="">${points.length ? "Kies een consumptiepunt" : "Geen consumptiepunt bij dit bedrijf"}</option>${
        points.map(({ id, name }) =>
          `<option value="${id}">${this.escapeHtml(name)}</option>`
        ).join("")
      }`;
    this.$("#newEmployeePoint").value = points.some(({ id }) => id === pointId) ? pointId : "";
  }

  // Rendert de bedrijven met hun consumptiepunten in het beheertabblad.
  renderAdminCompanies() {
    this.$("#adminCompanyList").innerHTML = this.model.sortedCompanies().map((company) => {
      const employeeCount = this.model.employees.filter(({ companyId }) => companyId === company.id).length;
      const points = this.model.pointsForCompany(company.id);

      const pointRows = points.map((point) => {
        const offered = this.model.offeredProducts(point.id).length;
        const pointEmployees = this.model.employees.filter(({ pointId }) => pointId === point.id).length;

        return `<div class="admin-employee-item admin-point-item">
          <span>
            <strong>${this.escapeHtml(point.name)}</strong>
            <small>${offered} van ${this.model.products.length} producten · ${pointEmployees} medewerkers</small>
          </span>
          <div class="admin-item-actions">
            <button class="table-action" data-edit-point="${point.id}">Aanbod wijzigen</button>
            <button class="table-action danger-action" data-remove-point="${point.id}">Verwijderen</button>
          </div>
        </div>`;
      }).join("") || `<p class="muted admin-point-empty">Nog geen consumptiepunt.</p>`;

      return `<section class="admin-company-item">
        <div class="admin-employee-item">
          <span>
            <strong>${this.escapeHtml(company.name)}</strong>
            <small>Werkgevernummer ${this.escapeHtml(company.employerNumber || "onbekend")} · ${employeeCount} medewerkers</small>
          </span>
          <div class="admin-item-actions">
            <button class="table-action" data-add-point="${company.id}">${icon("plus")} Consumptiepunt</button>
            <button class="table-action" data-edit-company="${company.id}">Wijzigen</button>
            <button class="table-action danger-action" data-remove-company="${company.id}">Verwijderen</button>
          </div>
        </div>
        <div class="admin-point-list">${pointRows}</div>
      </section>`;
    }).join("");
  }

  // Vult het consumptiepuntformulier: bedrijfkeuze en een aan/uit-vinkje per product.
  renderPointForm(point, companyId) {
    this.$("#pointCompany").innerHTML = this.model.sortedCompanies().map(({ id, name }) =>
      `<option value="${id}">${this.escapeHtml(name)}</option>`
    ).join("");
    this.$("#pointCompany").value = point?.companyId || companyId;
    this.$("#pointName").value = point?.name || "";

    this.$("#pointProductList").innerHTML = this.model.products.map(({ id, name }) =>
      `<label class="offer-item">
        <input type="checkbox" name="offeredProduct" value="${id}" ${point?.products[id]?.offered ? "checked" : ""}>
        <span>${this.escapeHtml(name)}</span>
      </label>`
    ).join("");
  }

  // Rendert de voorraad: eerst alles wat op is of bijbesteld moet worden, dan de tabel van één punt.
  renderStock() {
    const alerts = this.model.stockAlerts();

    this.$("#stockAlerts").innerHTML = alerts.length
      ? `<h3>Bijbestellen (${alerts.length})</h3>
        <ul>${alerts.map(({ point, product, entry, status }) =>
          `<li>
            <span class="stock-badge stock-${status}">${STOCK_STATUS[status]}</span>
            <button type="button" class="text-link" data-show-stock-point="${point.id}">
              ${this.escapeHtml(this.model.companyName(point.companyId))} · ${this.escapeHtml(point.name)}
            </button>
            — ${this.escapeHtml(product.name)}: ${entry.stock} (minimum ${entry.minimum})
          </li>`
        ).join("")}</ul>`
      : `<p class="stock-all-ok">Alles is op voorraad.</p>`;

    const select = this.$("#stockPointSelect");
    const selected = select.value;

    select.innerHTML = this.model.sortedCompanies()
      .filter(({ id }) => this.model.pointsForCompany(id).length)
      .map((company) =>
        `<optgroup label="${this.escapeHtml(company.name)}">${
          this.model.pointsForCompany(company.id).map(({ id, name }) =>
            `<option value="${id}">${this.escapeHtml(name)}</option>`
          ).join("")
        }</optgroup>`
      ).join("");

    if (this.model.findPoint(selected)) select.value = selected;

    const pointId = select.value;
    const products = this.model.offeredProducts(pointId);
    const point = this.model.findPoint(pointId);

    this.$("#stockTableBody").innerHTML = !point
      ? this.emptyTableRow(5, { iconName: "location", title: "Nog geen consumptiepunt.", text: "Voeg eerst een consumptiepunt toe bij Bedrijven.", action: this.goToTabButton("companies", "Naar Bedrijven") })
      : products.length === 0
        ? this.emptyTableRow(5, { iconName: "package", title: "Dit consumptiepunt biedt nog geen producten aan.", text: "Zet producten aan via Bedrijven en dan Aanbod wijzigen.", action: this.goToTabButton("companies", "Naar Bedrijven") })
        : products.map(({ id, name }) => {
          const entry = point.products[id];
          const status = this.model.stockStatus(entry);

          return `<tr>
            <td>${this.escapeHtml(name)}</td>
            <td><input class="stock-input" type="number" step="1" value="${entry.stock}"
                       data-stock-field="stock" data-product-id="${id}" aria-label="Voorraad ${this.escapeHtml(name)}"></td>
            <td><input class="stock-input" type="number" min="0" step="1" value="${entry.minimum}"
                       data-stock-field="minimum" data-product-id="${id}" aria-label="Minimum ${this.escapeHtml(name)}"></td>
            <td><span class="stock-badge stock-${status}">${STOCK_STATUS[status]}</span></td>
            <td class="stock-delivery">
              <input class="stock-input" type="number" min="1" step="1" placeholder="Aantal"
                     data-delivery-amount="${id}" aria-label="Geleverd aantal ${this.escapeHtml(name)}">
              <button type="button" class="table-action" data-stock-delivery="${id}">${icon("plus")} Toevoegen</button>
            </td>
          </tr>`;
        }).join("");
  }

  // Rendert de productlijst in het beheertabblad, met knoppen om te wijzigen en te verwijderen.
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
      ).join("") ||
      this.emptyState({ iconName: "package", title: "Nog geen producten.", text: "Voeg een product toe met de knop hierboven." });
  }

  // Rendert het logboek, nieuwste wijziging bovenaan. `limit` bepaalt hoeveel regels
  // zichtbaar zijn; de knop "Meer laden" verschijnt als er meer zijn.
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
      this.emptyTableRow(3, {
        title: "Nog geen administratieve wijzigingen.",
        text: "Wijzigingen aan registraties, medewerkers, producten, bedrijven en voorraad komen hier te staan."
      });

    this.$("#loadMoreAuditButton").classList.toggle(
      "hidden",
      visibleEntries.length >= this.model.auditLog.length
    );
  }

  // Tekent de openbare pagina opnieuw: bedrijfsfilter, medewerkerlijst en totalen.
  renderAll() {
    this.populateCompanyFilter();
    this.renderEmployees();
    this.renderStats();
  }

  // Toont een korte melding onderaan het scherm.
  //   tone: "success" (met vinkje), "error" (met waarschuwingsteken en rode rand) of "info";
  //   duration: hoe lang de melding zichtbaar blijft, in milliseconden (standaard 2,5 seconde).
  showToast(message, { tone = "info", duration = 2500 } = {}) {
    const toast = this.$("#toast");
    const toneIcons = { success: "check", error: "alert" };

    toast.innerHTML = `${toneIcons[tone] ? icon(toneIcons[tone]) : ""}<span></span>`;
    toast.querySelector("span").textContent = message;
    // Klassen opnieuw zetten; offsetWidth lezen zorgt dat de in-animatie opnieuw start.
    toast.className = `toast toast-${tone}`;
    void toast.offsetWidth;
    toast.classList.add("show");
    toast.setAttribute("role", tone === "error" ? "alert" : "status");

    // Een nieuwe melding start de timer opnieuw, zodat die niet te vroeg verdwijnt.
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add("hidden"), duration);
  }
}