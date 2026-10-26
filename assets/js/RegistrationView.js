import { STOCK_STATUS } from "./RegistrationModel.js";
import { icon } from "./icons.js";
import { FridgeView } from "./FridgeView.js";

// Maakt een waarde veilig om tussen aanhalingstekens in een CSS-selector te zetten, zoals
// `[data-stock-status="${cssAttributeValue(id)}"]`. Zonder deze stap breekt een id met een " of \
// de selector (querySelector geeft dan een fout) of vindt hij het verkeerde element.
// De browser heeft hiervoor CSS.escape. Node (waarin de tests draaien) kent `CSS` niet; dan
// worden alleen \ en " voorzien van een \ (genoeg voor een waarde tussen aanhalingstekens).
// Wordt ook door de controller (RegistrationApp) gebruikt.
export function cssAttributeValue(value) {
  const text = String(value ?? "");
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(text);
  return text.replace(/["\\]/g, "\\$&");
}

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
 *   - FridgeView: tekent het koelkastvenster en het tabblad Koelkast (slimme koelkast, demo). Deze
 *     view maakt FridgeView en geeft de methodes daarvan door (renderFridgeWindow en verder).
 */
export class RegistrationView {
  // De waarschuwing in het productvenster vlak voordat het vanzelf sluit (zie showIdleWarning).
  static IDLE_WARNING_TEXT = "Venster sluit zo. Tik om door te gaan.";

  // Hoe lang (in milliseconden) een meldingsregio eerst leeg zichtbaar is voordat de tekst erin komt
  // (zie showToast).
  static TOAST_TEXT_DELAY_MS = 60;

  // De view ontvangt het model om gegevens te kunnen tonen.
  // `$` is een korte schrijfwijze om één element op de pagina te zoeken.
  constructor(model) {
    this.model = model;
    this.$ = (selector) => document.querySelector(selector);
    // Het koelkastvenster en het tabblad Koelkast (slimme koelkast, demo) staan in een eigen class.
    this.fridge = new FridgeView(this);
  }

  // ------------------------------------------------------------------
  // Slimme koelkast (demo): doorgegeven aan FridgeView
  // ------------------------------------------------------------------

  renderFridgeWindow(state) {
    this.fridge.renderFridgeWindow(state);
  }

  setFridgeStatus(text, tone) {
    this.fridge.setFridgeStatus(text, tone);
  }

  announceFridge(text) {
    this.fridge.announceFridge(text);
  }

  setDoorWarning(shown, name) {
    this.fridge.setDoorWarning(shown, name);
  }

  renderFridgeAdmin() {
    this.fridge.renderFridgeAdmin();
  }

  // Escapet tekst voordat die in innerHTML wordt geplaatst. Dit geldt voor namen, maar ook
  // voor iedere waarde in een HTML-attribuut (ids in data-*, value="…", klassen). De gegevens
  // komen uit de opslag van de browser en kunnen daar zijn aangepast; een " in een id zou
  // anders uit het attribuut kunnen breken en eigen HTML of scripts in de pagina zetten.
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
    return `<tr><td colspan="${this.escapeHtml(columns)}" class="empty-cell">${this.emptyState(options)}</td></tr>`;
  }

  // Knop in een lege toestand die naar een ander tabblad van het beheerscherm gaat.
  goToTabButton(tabName, label) {
    return `<button type="button" class="secondary-button" data-go-tab="${this.escapeHtml(tabName)}">${this.escapeHtml(label)}</button>`;
  }

  // Toont een foutmelding direct onder een formulierveld en markeert het veld als ongeldig.
  // Had het veld al een aria-describedby (bijvoorbeeld een uitleg onder het veld), dan blijft
  // die staan en komt de foutmelding erbij. De oorspronkelijke waarde wordt onthouden in
  // data-describedby-before-error, zodat clearFieldError die later terug kan zetten.
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

    // Alleen de eerste keer onthouden; bij een tweede foutmelding staat de fout-id er al in.
    if (field.dataset.describedbyBeforeError === undefined) {
      field.dataset.describedbyBeforeError = field.getAttribute("aria-describedby") || "";
    }
    const original = field.dataset.describedbyBeforeError;
    field.setAttribute("aria-describedby", original ? `${original} ${errorId}` : errorId);
  }

  // Haalt de foutmelding van één veld weg en zet de oorspronkelijke aria-describedby terug.
  clearFieldError(field) {
    document.getElementById(`${field.id}-error`)?.remove();
    field.removeAttribute("aria-invalid");

    const original = field.dataset.describedbyBeforeError;
    if (original === undefined) return;
    if (original) field.setAttribute("aria-describedby", original);
    else field.removeAttribute("aria-describedby");
    delete field.dataset.describedbyBeforeError;
  }

  // Haalt alle foutmeldingen in een formulier weg.
  clearFieldErrors(form) {
    form.querySelectorAll("[aria-invalid='true']").forEach((field) => this.clearFieldError(field));
  }

  // Maakt maximaal twee initialen voor de avatar van een medewerker. Meerdere spaties
  // achter elkaar tellen als één, zodat "Anna  Berg" gewoon "AB" wordt.
  initials(name) {
    return String(name).trim().split(/\s+/).map((part) => part[0] || "").slice(0, 2).join("").toUpperCase();
  }

  // Toont een ISO-datum in Nederlandse datum- en tijdnotatie, bijvoorbeeld "01 okt, 12:05".
  // Is de datum uit een ander jaar, dan staat het jaar erbij ("01 okt 2025, 12:05").
  formatDate(value, now = new Date()) {
    const date = new Date(value);
    const otherYear = date.getFullYear() !== now.getFullYear();

    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "short",
      ...(otherYear ? { year: "numeric" } : {}),
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  // Bij welke groep in de bedrijfsfilter hoort deze medewerker? De id van zijn bedrijf, of
  // "unknown" als hij geen bedrijf heeft of als zijn bedrijf niet (meer) bestaat. Filteren,
  // groeperen en de keuze "Onbekend bedrijf" gebruiken alle drie deze ene regel, zodat ze
  // altijd dezelfde medewerkers tonen.
  companyGroupKey(companyId) {
    return this.model.findCompany(companyId) ? companyId : "unknown";
  }

  // Rendert de publieke medewerkerlijst op basis van de zoekterm en het gekozen bedrijf.
  renderEmployees() {
    const query = this.$("#employeeSearch").value.toLowerCase().trim();
    const companyFilter = this.$("#employeeCompanyFilter").dataset.value || "all";

    const employees = this.model.employees.filter(({ name, active, companyId }) =>
      active &&
      name.toLowerCase().includes(query) &&
      (companyFilter === "all" || this.companyGroupKey(companyId) === companyFilter)
    );

    this.$("#employeeCount").textContent = `${employees.length} totaal`;
    this.$("#emptyState").classList.toggle("hidden", employees.length > 0);
    // "Tik op je naam" staat één keer boven de lijst, en alleen als er namen in de lijst staan.
    this.$("#employeeListHint")?.classList.toggle("hidden", employees.length === 0);
    // Een schermlezer hoort na het zoeken of filteren alleen het aantal, bijvoorbeeld
    // "3 medewerkers gevonden", en niet de hele lijst. Daarom heeft #employeeList geen aria-live
    // meer, maar is er een vaste, onzichtbare statusregel (#employeeResultsStatus in index.html).
    // Verandert het aantal niet, dan blijft de tekst gelijk en wordt er niets voorgelezen.
    const status = this.$("#employeeResultsStatus");
    if (status) status.textContent = this.employeeResultsText(employees.length);

    const groups = employees.reduce((grouped, employee) => {
      const key = this.companyGroupKey(employee.companyId);

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
                  data-open-employee="${this.escapeHtml(employee.id)}"
                  tabindex="0"
                  role="button"
                  aria-label="Product kiezen voor ${this.escapeHtml(employee.name)}">
              <div class="employee-info">
                <span class="person-avatar" style="background:${this.escapeHtml(employee.color)}">
                  ${this.escapeHtml(this.initials(employee.name))}
                </span>
                <div>
                  <div class="employee-name">${this.escapeHtml(employee.name)}</div>
                  <div class="employee-total">Tik om te kiezen</div>
                </div>
              </div>
            </div>`
          ).join("")}
        </section>`
      )
      .join("");
  }

  // De tekst voor schermlezers na zoeken of filteren: "Geen medewerker gevonden",
  // "1 medewerker gevonden" of "3 medewerkers gevonden" (zie employeeCountText).
  employeeResultsText(count) {
    return count === 0 ? "Geen medewerker gevonden" : `${this.employeeCountText(count)} gevonden`;
  }

  // Zet de medewerkerslijst weer bovenaan in beeld (na registreren of na het automatisch sluiten
  // van het productvenster, zie EmployeeController.resetEmployeeSearch). Alleen als de bovenkant van
  // de medewerkerskaart boven het scherm is weggescrold. Staat de kaart al in beeld, dan blijft de
  // pagina staan. Zonder animatie: de pagina springt direct naar de juiste plek.
  scrollEmployeeListToTop() {
    const card = this.$(".directory-card");
    if (!card?.getBoundingClientRect) return;
    if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: "start" });
  }

  // Vult de bedrijfsfilter met de bedrijven waar actieve medewerkers aan gekoppeld zijn.
  // Typt de gebruiker op dat moment in het filter (het veld heeft de focus), dan blijft de
  // getypte tekst staan; anders zou die tijdens het typen verdwijnen, bijvoorbeeld als een
  // ander tabblad iets opslaat.
  populateCompanyFilter() {
    const filter = this.$("#employeeCompanyFilter");
    const selected = filter.dataset.value || "all";
    const activeEmployees = this.model.employees.filter(({ active }) => active);

    const companies = this.model.sortedCompanies().filter(({ id }) =>
      activeEmployees.some(({ companyId }) => companyId === id)
    );
    const hasUnknown = activeEmployees.some(({ companyId }) => this.companyGroupKey(companyId) === "unknown");

    const selectedValue =
      companies.some(({ id }) => id === selected) || (selected === "unknown" && hasUnknown)
        ? selected
        : "all";

    filter.dataset.value = selectedValue;
    const userIsTyping = globalThis.document?.activeElement === filter;
    if (!userIsTyping) {
      filter.value = selectedValue === "all" ? "" : this.model.companyName(selectedValue === "unknown" ? null : selectedValue);
    }

    // Iedere keuze is een optie in de keuzelijst (role="option"); de gekozen optie heeft
    // aria-selected="true", zodat een schermlezer weet welk bedrijf er is gekozen.
    const option = (value, label) =>
      `<button type="button" role="option" aria-selected="${value === selectedValue}" data-company-value="${this.escapeHtml(value)}">${this.escapeHtml(label)}</button>`;
    this.$("#companyFilterOptions").innerHTML = [
      option("all", "Alle bedrijven"),
      ...companies.map(({ id, name }) => option(id, name)),
      hasUnknown ? option("unknown", "Onbekend bedrijf") : ""
    ].join("");
  }

  // Werkt de kaarten met dag- en maandtotalen bij.
  renderStats() {
    const now = new Date();
    this.$("#todayTotal").textContent = this.model.countForDate(now);
    this.$("#monthTotal").textContent = this.model.countForMonth(now);
  }

  // Rendert de gefilterde registratietabel in het admin-dashboard. Een registratie die de slimme
  // koelkast (demo) automatisch heeft gemaakt, krijgt het label "Koelkast" achter de productnaam.
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
            <td>${this.escapeHtml(this.model.productName(registration.productId))}${registration.source === "fridge" ? ` <span class="badge-linked">Koelkast</span>` : ""}</td>
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

    // Eén keer door alle registraties heen tellen, in plaats van opnieuw voor iedere medewerker
    // en ieder product. Dat blijft snel, ook als er duizenden registraties zijn.
    const counts = this.countRegistrations();

    this.$("#adminCorrectionList").innerHTML =
      employees.map((employee) => {
        const products = this.model.products.map(({ id, name }) => {
          const count = counts.get(`${employee.id}|${id}`) || 0;

          return `
            <div class="correction-product-row">
              <span>${this.escapeHtml(name)}</span>
              <div class="correction-actions">
                <button class="correction-button correction-minus"
                        data-correction-minus="${this.escapeHtml(employee.id)}"
                        data-correction-product="${this.escapeHtml(id)}"
                        title="${this.escapeHtml(name)} verminderen"
                        aria-label="${this.escapeHtml(name)} verminderen"
                        aria-haspopup="dialog">${icon("minus")}</button>

                <strong class="correction-amount">${count}</strong>

                <button class="correction-button correction-plus"
                        data-correction-plus="${this.escapeHtml(employee.id)}"
                        data-correction-product="${this.escapeHtml(id)}"
                        title="${this.escapeHtml(name)} toevoegen"
                        aria-label="${this.escapeHtml(name)} toevoegen">${icon("plus")}</button>
              </div>
            </div>`;
        }).join("");

        return `
          <details class="admin-correction-item"
                   data-correction-employee="${this.escapeHtml(employee.id)}"
                   ${employee.id === openEmployee ? "open" : ""}>
            <summary>
              <strong>${this.escapeHtml(employee.name)}</strong>
              <span class="correction-count">
                ${this.productCountText(this.model.countForEmployee(employee.id))} ·
                € ${this.model.totalCostForEmployee(employee.id).toFixed(2).replace(".", ",")}
              </span>
            </summary>
            <div class="correction-product-list">${products}</div>
          </details>`;
      }).join("") ||
      this.emptyState({ iconName: "userSearch", title: "Geen medewerker gevonden.", text: "Probeer een andere zoekterm." });
  }

  // Vult het venster "Registratie verwijderen" (correctie "−"). Per registratie van dit product
  // bij deze medewerker staan de datum en tijd, het product en het aantal, met een eigen knop
  // "Verwijderen". De nieuwste datum staat bovenaan, net als in de tabel. Een registratie die de
  // beheerder zelf met "+" heeft toegevoegd, is te herkennen aan "toegevoegd door beheerder".
  renderRemoveRegistrationList(employeeId, productId) {
    const productName = this.model.productName(productId);
    const employeeName = this.model.findEmployee(employeeId)?.name || "Verwijderd";

    this.$("#removeRegistrationHelp").textContent =
      `${productName} van ${employeeName}. Kies welke registratie weg moet. De nieuwste staat bovenaan.`;

    this.$("#removeRegistrationList").innerHTML = this.model.registrationsFor(employeeId, productId)
      .map((registration) => {
        const when = this.formatDate(registration.createdAt);
        const addedByAdmin = registration.correction ? " · toegevoegd door beheerder" : "";

        return `
          <li class="remove-registration-item">
            <span class="remove-registration-info">
              <strong>${this.escapeHtml(when)}</strong>
              <span>${this.escapeHtml(productName)} · aantal 1${addedByAdmin}</span>
            </span>
            <button type="button" class="secondary-button danger-action"
                    data-remove-registration="${this.escapeHtml(registration.id)}"
                    aria-label="${this.escapeHtml(`${productName} van ${when} verwijderen`)}">Verwijderen</button>
          </li>`;
      }).join("");
  }

  // Telt de registraties per medewerker en product. Geeft een Map terug met als sleutel
  // "medewerker-id|product-id" en als waarde het aantal.
  countRegistrations() {
    const counts = new Map();

    for (const { employeeId, productId } of this.model.registrations) {
      const key = `${employeeId}|${productId}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return counts;
  }

  // Vult de filters medewerker en maand boven de registratietabel.
  // Een eerder gekozen waarde blijft geselecteerd als die nog bestaat.
  populateFilters() {
    const selectedEmployee = this.$("#filterEmployee").value;
    const selectedMonth = this.$("#filterMonth").value;

    this.$("#filterEmployee").innerHTML =
      `<option value="all">Alle medewerkers</option>${
        this.model.employees.map(({ id, name }) =>
          `<option value="${this.escapeHtml(id)}">${this.escapeHtml(name)}</option>`
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
          `<option value="${this.escapeHtml(month)}">${this.escapeHtml(this.monthLabel(month))}</option>`
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
  // (de)activeren en verwijderen. Verwijderen kan alleen bij inactieve medewerkers zonder
  // registraties; registraties zijn nodig voor de loonadministratie, dus dan is deactiveren genoeg.
  // Medewerkers met een gekoppelde pas krijgen het label "Pas gekoppeld". Het pasnummer zelf
  // staat niet in de lijst; dat is alleen in het formulier "Wijzigen" te zien.
  renderAdminEmployees() {
    const query = this.$("#employeeManagementSearch").value.toLowerCase().trim();

    const employees = this.model.employees.filter(({ name }) =>
      name.toLowerCase().includes(query)
    );

    this.$("#adminEmployeeList").innerHTML =
      employees.map((employee) =>
        `<div class="admin-employee-item">
          <span>
            <strong>${this.escapeHtml(employee.name)}${employee.badgeId ? ` <span class="badge-linked">Pas gekoppeld</span>` : ""}</strong>
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
                    data-toggle-employee="${this.escapeHtml(employee.id)}">
              ${employee.active ? "Deactiveren" : "Activeren"}
            </button>

            ${
              employee.active || this.model.employeeHasRegistrations(employee.id)
                ? ""
                : `<button class="table-action danger-action"
                      data-remove-employee="${this.escapeHtml(employee.id)}">
                      Verwijderen
                   </button>`
            }

            <button class="table-action"
                    data-edit-employee="${this.escapeHtml(employee.id)}">
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
  // `face.recognizedByBadge` is true als de medewerker net met de pas is herkend (BadgeReader);
  // de begroeting krijgt dan "Je bent herkend met je pas." op dezelfde plek als bij de camera.
  // Zonder herkenning (naam aangeklikt) zijn beide false: dan geen "welkom terug" en geen
  // keuze van de vorige keer.
  renderEmployeeProducts(employeeId, selectedProducts = {}, face = {}) {
    const employee = this.model.findEmployee(employeeId);
    if (!employee) return;

    this.$("#employeeProductsTitle").textContent =
      `Product kiezen voor ${employee.name}`;

    // Persoonlijke begroeting, bijvoorbeeld "Goedemiddag Lotte, welkom terug."
    // "Welkom terug" en de keuze van de vorige keer verschijnen alleen als de medewerker is
    // herkend met de pas of de camera. Iedereen kan op de tablet op de naam van een collega
    // tikken; zonder deze regel zou je dan zien of die collega al eens iets heeft geregistreerd
    // en wat hij de vorige keer nam (privacy, zie TO hoofdstuk 13). Bij kiezen op naam staat er
    // daarom alleen een gewone begroeting.
    const recognized = Boolean(face.recognized || face.recognizedByBadge);
    const lastSelection = recognized ? this.model.lastSelection(employeeId) : {};
    const returning = recognized && this.model.hasOwnRegistration(employeeId);
    let welcome = `${this.greeting(new Date())} ${employee.firstName || employee.name}${returning ? ", welkom terug." : "."}`;
    if (face.recognized) welcome += " Je bent herkend met de camera.";
    else if (face.recognizedByBadge) welcome += " Je bent herkend met je pas.";
    this.$("#employeeWelcome").textContent = welcome;

    // Aanbeveling op basis van de vorige keer, met één knop om dezelfde keuze te maken
    // (alleen na herkenning met de pas of de camera, zie hierboven).
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

    // Zonder keuze is de knop uitgeschakeld met aria-disabled (niet met disabled): zo blijft hij met
    // Tab bereikbaar en leest een schermlezer de uitleg "Kies eerst een product met +" voor (de regel
    // #registerHint, gekoppeld met aria-describedby). Een tik op de knop benadrukt die regel
    // (zie emphasizeRegisterHint). Is er een keuze, dan verdwijnen de regel en de koppeling.
    const hasChoice = totalSelected > 0;
    registerButton.setAttribute("aria-disabled", String(!hasChoice));
    if (hasChoice) registerButton.removeAttribute?.("aria-describedby");
    else registerButton.setAttribute("aria-describedby", "registerHint");
    const hint = this.$("#registerHint");
    hint?.classList.toggle("hidden", hasChoice || products.length === 0);
    hint?.classList.remove("register-hint-emphasis");

    // Zonder producten op het consumptiepunt valt er niets te kiezen en niets te registreren. Dan
    // vervalt alles wat over kiezen en registreren gaat: de uitleg "Tik op + ...", de knopbalk
    // (klasse is-empty: geen lijn en geen lege strook, zie product-window.css) en de regel over de inhouding
    // op het loon. Zo staat alleen de melding "Geen producten op jouw consumptiepunt." in het venster,
    // zonder dubbele scheidingslijnen eronder. De waarschuwing vlak voor het automatisch sluiten
    // staat in de knopbalk en blijft daardoor wel zichtbaar.
    const noProducts = products.length === 0;
    this.$("#employeeProductsHelp")?.classList.toggle("hidden", noProducts);
    this.$("#employeeProductsActions")?.classList.toggle("is-empty", noProducts);
    this.$("#employeePrivacyNote")?.classList.toggle("hidden", noProducts);

    // Per product: naam en prijs, en een teller met − en + (de − kan niet onder 0).
    // Een product met een keuze (aantal 1 of meer) krijgt een lichtgroene achtergrond en een groene
    // rand (klasse is-selected), zodat in één oogopslag te zien is wat er is gekozen.
    this.$("#employeeProductList").innerHTML = products.length === 0
      ? this.emptyState({ iconName: "location", title: "Geen producten op jouw consumptiepunt.", text: "Neem contact op met de beheerder als dit niet klopt." })
      : products.map(({ id, name, price }) => {
        const selectedAmount = selectedProducts[id] || 0;

        return `
          <div class="personal-product-item${selectedAmount > 0 ? " is-selected" : ""}">
            <span>
              <strong>${this.escapeHtml(name)}</strong>
              <small>€ ${price.toFixed(2).replace(".", ",")}</small>
            </span>

            <button class="personal-product-step personal-product-minus"
                    type="button"
                    data-product-decrement="${this.escapeHtml(id)}"
                    aria-label="Eén ${this.escapeHtml(name)} minder"
                    ${selectedAmount === 0 ? "disabled" : ""}>
              ${icon("minus")}
            </button>

            <strong class="personal-product-amount">
              ${selectedAmount}
            </strong>

            <button class="personal-product-step personal-product-plus"
                    type="button"
                    data-product-increment="${this.escapeHtml(id)}"
                    aria-label="Eén ${this.escapeHtml(name)} meer">
              ${icon("plus")}
            </button>
          </div>`;
      }).join("");

    this.$("#employeeProductsModal").classList.remove("hidden");
  }

  // Zet een korte tekst in de vaste live region van het productvenster (#productLiveStatus),
  // bijvoorbeeld "Blikje: 2" na een klik op "+". Een schermlezer leest die tekst voor. De live
  // region staat vast in index.html en wordt niet opnieuw getekend: een live region die steeds
  // via innerHTML opnieuw wordt gemaakt, leest een schermlezer vaak niet (of dubbel) voor.
  announce(text) {
    const status = this.$("#productLiveStatus");
    if (status) status.textContent = text;
  }

  // Tik op "Registreren" zonder gekozen product (zie EmployeeController.registerSelectedProducts):
  // de regel "Kies eerst een product met +" bij de knop wordt vet en rood (bestaande foutkleur),
  // zonder animatie. Een schermlezer leest de regel voor via de live region van het productvenster.
  emphasizeRegisterHint() {
    const hint = this.$("#registerHint");
    if (!hint) return;
    hint.classList.remove("hidden");
    hint.classList.add("register-hint-emphasis");
    this.announce(hint.textContent);
  }

  // Toont of verbergt in het productvenster de regel "Venster sluit zo. Tik om door te gaan."
  // (zie EmployeeController.closeProductWindowIfIdle). #productIdleWarning is een vaste statusregel
  // (role="status") die altijd op de pagina staat. Is hij leeg, dan neemt hij geen ruimte in (zie
  // .idle-warning:empty in product-window.css). Omdat alleen de tekst verandert, leest een schermlezer de
  // waarschuwing voor zodra die verschijnt.
  showIdleWarning(shown) {
    const warning = this.$("#productIdleWarning");
    if (warning) warning.textContent = shown ? RegistrationView.IDLE_WARNING_TEXT : "";
  }

  // Standby (StandbyController): toont of verbergt het gedimde scherm "Tik op het scherm om te
  // beginnen" met daaronder `hint` (wat er na de tik gebeurt). In standby is de pagina eronder
  // `inert`: niet te bereiken met Tab of een schermlezer, zodat alleen het standby-scherm de focus kan
  // krijgen. Die focus gaat naar het standby-scherm zelf (een knop), zodat Enter of spatie ook wakker maakt.
  showStandby(shown, { hint = "" } = {}) {
    const overlay = this.$("#standbyOverlay");
    if (!overlay) return;
    const hintElement = this.$("#standbyHint");
    if (hintElement && shown) hintElement.textContent = hint;
    overlay.classList.toggle("hidden", !shown);
    const page = this.$(".app-shell");
    if (shown) {
      page?.setAttribute("inert", "");
      overlay.focus?.({ preventScroll: true });
    } else {
      page?.removeAttribute?.("inert");
      if (globalThis.document?.activeElement === overlay) overlay.blur?.();
    }
  }

  // Vult de keuzelijsten bedrijf en consumptiepunt in het medewerkersformulier.
  populateEmployeeCompanySelects(companyId = "", pointId = "") {
    this.$("#newEmployeeCompany").innerHTML =
      `<option value="">Kies een bedrijf</option>${
        this.model.sortedCompanies().map(({ id, name }) =>
          `<option value="${this.escapeHtml(id)}">${this.escapeHtml(name)}</option>`
        ).join("")
      }`;
    this.$("#newEmployeeCompany").value = this.model.findCompany(companyId) ? companyId : "";
    this.populateEmployeePointSelect(pointId);
  }

  // Toont alleen de consumptiepunten van het gekozen bedrijf. Heeft dat bedrijf punten, dan is
  // de keuze verplicht; zo kan een medewerker niet per ongeluk zonder punt (en dus zonder
  // producten) komen te staan. Heeft het bedrijf nog geen punt, dan mag het leeg blijven.
  populateEmployeePointSelect(pointId = "") {
    const points = this.model.pointsForCompany(this.$("#newEmployeeCompany").value);

    this.$("#newEmployeePoint").required = points.length > 0;
    this.$("#newEmployeePoint").innerHTML =
      `<option value="">${points.length ? "Kies een consumptiepunt" : "Geen consumptiepunt bij dit bedrijf"}</option>${
        points.map(({ id, name }) =>
          `<option value="${this.escapeHtml(id)}">${this.escapeHtml(name)}</option>`
        ).join("")
      }`;
    this.$("#newEmployeePoint").value = points.some(({ id }) => id === pointId) ? pointId : "";
  }

  // Aantal medewerkers met het juiste woord: "1 medewerker", maar "0 medewerkers" en
  // "2 medewerkers". Wordt gebruikt in de lijst met bedrijven en consumptiepunten
  // (renderAdminCompanies).
  employeeCountText(count) {
    return `${count} ${count === 1 ? "medewerker" : "medewerkers"}`;
  }

  // Aantal producten met het juiste woord: "1 product", maar "0 producten" en "2 producten".
  // Wordt gebruikt in de correctielijst van het beheer (renderCorrectionEmployees).
  productCountText(count) {
    return `${count} ${count === 1 ? "product" : "producten"}`;
  }

  // Rendert de bedrijven met hun consumptiepunten in het beheertabblad.
  // Het aantal medewerkers staat in enkelvoud of meervoud (zie employeeCountText).
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
            <small>${offered} van ${this.model.products.length} producten · ${this.employeeCountText(pointEmployees)}</small>
          </span>
          <div class="admin-item-actions">
            <button class="table-action" data-edit-point="${this.escapeHtml(point.id)}">Aanbod wijzigen</button>
            <button class="table-action danger-action" data-remove-point="${this.escapeHtml(point.id)}">Verwijderen</button>
          </div>
        </div>`;
      }).join("") || `<p class="muted admin-point-empty">Nog geen consumptiepunt.</p>`;

      return `<section class="admin-company-item">
        <div class="admin-employee-item">
          <span>
            <strong>${this.escapeHtml(company.name)}</strong>
            <small>Werkgevernummer ${this.escapeHtml(company.employerNumber || "onbekend")} · ${this.employeeCountText(employeeCount)}</small>
          </span>
          <div class="admin-item-actions">
            <button class="table-action" data-add-point="${this.escapeHtml(company.id)}">${icon("plus")} Consumptiepunt</button>
            <button class="table-action" data-edit-company="${this.escapeHtml(company.id)}">Wijzigen</button>
            <button class="table-action danger-action" data-remove-company="${this.escapeHtml(company.id)}">Verwijderen</button>
          </div>
        </div>
        <div class="admin-point-list">${pointRows}</div>
      </section>`;
    }).join("");
  }

  // Vult de bedrijfkeuze in het consumptiepuntformulier met de bedrijven die er nu zijn.
  // Staat los van renderPointForm, zodat de controller alleen deze keuzelijst kan verversen
  // (als het gekozen bedrijf in een ander tabblad is verwijderd) zonder de naam en de vinkjes
  // te wissen die de beheerder al heeft ingevuld.
  populatePointCompanySelect(companyId = "") {
    this.$("#pointCompany").innerHTML = this.model.sortedCompanies().map(({ id, name }) =>
      `<option value="${this.escapeHtml(id)}">${this.escapeHtml(name)}</option>`
    ).join("");
    this.$("#pointCompany").value = companyId;
  }

  // Vult het consumptiepuntformulier: bedrijfkeuze en een aan/uit-vinkje per product.
  renderPointForm(point, companyId) {
    this.populatePointCompanySelect(point?.companyId || companyId);
    this.$("#pointName").value = point?.name || "";

    this.$("#pointProductList").innerHTML = this.model.products.map(({ id, name }) =>
      `<label class="offer-item">
        <input type="checkbox" name="offeredProduct" value="${this.escapeHtml(id)}" ${this.model.pointProduct(point, id)?.offered ? "checked" : ""}>
        <span>${this.escapeHtml(name)}</span>
      </label>`
    ).join("");
  }

  // Rendert de voorraad: eerst alles wat op is of bijbesteld moet worden, dan de tabel van één punt.
  renderStock() {
    this.renderStockAlerts();
    this.renderStockTable();
  }

  // De bijbestellijst bovenaan het tabblad Voorraad.
  renderStockAlerts() {
    const alerts = this.model.stockAlerts();

    this.$("#stockAlerts").innerHTML = alerts.length
      ? `<h3>Bijbestellen (${alerts.length})</h3>
        <ul>${alerts.map(({ point, product, entry, status }) =>
          `<li>
            <span class="stock-badge stock-${this.escapeHtml(status)}">${STOCK_STATUS[status]}</span>
            <button type="button" class="text-link" data-show-stock-point="${this.escapeHtml(point.id)}">
              ${this.escapeHtml(this.model.companyName(point.companyId))} · ${this.escapeHtml(point.name)}
            </button>
            — ${this.escapeHtml(product.name)}: ${this.escapeHtml(entry.stock)} (minimum ${this.escapeHtml(entry.minimum)})
          </li>`
        ).join("")}</ul>`
      : `<p class="stock-all-ok">Alles is op voorraad.</p>`;
  }

  // De keuzelijst met consumptiepunten en de voorraadtabel van het gekozen punt.
  renderStockTable() {
    const select = this.$("#stockPointSelect");
    const selected = select.value;

    select.innerHTML = this.model.sortedCompanies()
      .filter(({ id }) => this.model.pointsForCompany(id).length)
      .map((company) =>
        `<optgroup label="${this.escapeHtml(company.name)}">${
          this.model.pointsForCompany(company.id).map(({ id, name }) =>
            `<option value="${this.escapeHtml(id)}">${this.escapeHtml(name)}</option>`
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
          const entry = this.model.pointProduct(point, id);
          const status = this.model.stockStatus(entry);

          return `<tr>
            <td>${this.escapeHtml(name)}</td>
            <td><input class="stock-input" type="number" step="1" value="${this.escapeHtml(entry.stock)}"
                       data-stock-field="stock" data-product-id="${this.escapeHtml(id)}" aria-label="Voorraad ${this.escapeHtml(name)}"></td>
            <td><input class="stock-input" type="number" min="0" step="1" value="${this.escapeHtml(entry.minimum)}"
                       data-stock-field="minimum" data-product-id="${this.escapeHtml(id)}" aria-label="Minimum ${this.escapeHtml(name)}"></td>
            <td><span class="stock-badge stock-${this.escapeHtml(status)}" data-stock-status="${this.escapeHtml(id)}">${STOCK_STATUS[status]}</span></td>
            <td class="stock-delivery">
              <input class="stock-input" type="number" min="1" step="1" placeholder="Aantal"
                     data-delivery-amount="${this.escapeHtml(id)}" aria-label="Geleverd aantal ${this.escapeHtml(name)}">
              <button type="button" class="table-action" data-stock-delivery="${this.escapeHtml(id)}">${icon("plus")} Toevoegen</button>
            </td>
          </tr>`;
        }).join("");
  }

  // Werkt alleen het statuslabel van één product in de voorraadtabel bij (na het aanpassen van
  // voorraad of minimum), zodat de invoervelden en de focus blijven staan.
  updateStockStatus(pointId, productId) {
    const entry = this.model.stockEntry(pointId, productId);
    // De product-id wordt met cssAttributeValue veilig gemaakt voor de selector.
    const badge = document.querySelector(`[data-stock-status="${cssAttributeValue(productId)}"]`);
    if (!entry || !badge) return;

    const status = this.model.stockStatus(entry);
    badge.className = `stock-badge stock-${status}`;
    badge.textContent = STOCK_STATUS[status];
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
                    data-edit-product="${this.escapeHtml(product.id)}">
              Wijzigen
            </button>

            <button class="table-action danger-action"
                    data-remove-product="${this.escapeHtml(product.id)}">
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
  // Er zijn twee vaste meldingsregio's in index.html die altijd op de pagina blijven: #toast
  // (role="status", voor gewone meldingen) en #toastAlert (role="alert", voor foutmeldingen). Een
  // schermlezer leest een live region alleen voor als die al bestond voordat de tekst veranderde.
  // Daarom wordt de regio eerst leeg zichtbaar gemaakt en komt de tekst er pas daarna in (na
  // TOAST_TEXT_DELAY_MS). Zolang de regio leeg is, is hij doorzichtig (.toast:empty in toast.css),
  // dus op het scherm ziet de melding er hetzelfde uit als vroeger. Er staat steeds maar één
  // melding in beeld: de andere regio wordt verborgen.
  showToast(message, { tone = "info", duration = 2500 } = {}) {
    const toast = this.$(tone === "error" ? "#toastAlert" : "#toast");
    const other = this.$(tone === "error" ? "#toast" : "#toastAlert");
    const toneIcons = { success: "check", error: "alert" };

    clearTimeout(this.toastTimer);
    clearTimeout(this.toastTextTimer);
    if (other) {
      other.classList.add("hidden");
      other.textContent = "";
    }

    // Stap 1: de regio leeg zichtbaar maken.
    toast.textContent = "";
    toast.className = `toast toast-${tone}`;

    // Stap 2: daarna de tekst erin zetten. offsetWidth lezen zorgt dat de in-animatie opnieuw start.
    this.toastTextTimer = setTimeout(() => {
      toast.innerHTML = `${toneIcons[tone] ? icon(toneIcons[tone]) : ""}<span></span>`;
      toast.querySelector("span").textContent = message;
      void toast.offsetWidth;
      toast.classList.add("show");

      // Een nieuwe melding start de timer opnieuw, zodat die niet te vroeg verdwijnt.
      this.toastTimer = setTimeout(() => toast.classList.add("hidden"), duration);
    }, RegistrationView.TOAST_TEXT_DELAY_MS);
  }

  // Verbergt een melding die nog in beeld is. Wordt gebruikt als een productvenster opengaat: de
  // melding van de vorige gebruiker (bijvoorbeeld "… geregistreerd") staat dan niet over de knop
  // Registreren van de volgende gebruiker.
  hideToast() {
    clearTimeout(this.toastTimer);
    clearTimeout(this.toastTextTimer);
    for (const selector of ["#toast", "#toastAlert"]) {
      const toast = this.$(selector);
      if (!toast) continue;
      toast.classList.add("hidden");
      toast.textContent = "";
    }
  }
}