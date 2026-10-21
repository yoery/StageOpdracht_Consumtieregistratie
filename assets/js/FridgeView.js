import { FRIDGE_STATUS } from "./RegistrationModel.js";
import { SmartFridge } from "./fridge/SmartFridge.js";
import { icon } from "./icons.js";

// Hoeveel producten er per schap als tegel in het koelkastvenster staan. Liggen er meer, dan staat
// er bijvoorbeeld "+18" achter, zodat een vol schap op een tablet op één regel past.
const MAX_TILES = 6;

/**
 * FridgeView — tekent het koelkastvenster en het tabblad Koelkast in het beheer (slimme koelkast, demo).
 *
 * Dit is een deel van de view (de "View" in MVC). RegistrationView maakt deze class en geeft de
 * methodes renderFridgeWindow, setFridgeStatus en renderFridgeAdmin door, zodat de controller net als
 * bij de andere schermen alleen met RegistrationView praat. De koelkast staat in een eigen bestand
 * omdat RegistrationView anders te groot wordt.
 *
 * Verantwoordelijkheid:
 *   - het koelkastvenster tekenen in de drie stappen: wachten op een pas (deur dicht), de deur open
 *     met de schappen, en het overzicht na het sluiten;
 *   - de statusregel van het venster (fouten en meldingen, voorgelezen door een schermlezer);
 *   - in het beheer de indeling van de schappen en de laatste openingen tonen;
 *   - tekst veilig maken voordat die in de pagina komt (via RegistrationView.escapeHtml).
 *
 * Verbonden met:
 *   - RegistrationView: maakt deze class en levert $, escapeHtml, formatDate, describeSelection,
 *     emptyState en emptyTableRow;
 *   - RegistrationModel: de medewerkers, producten, consumptiepunten, de indeling en de openingen;
 *   - SmartFridge: issueText (de tekst bij een markering);
 *   - FridgeController: bepaalt wanneer er opnieuw getekend wordt en geeft de toestand van de opening mee;
 *   - index.html: #fridgeModal en het tabblad #fridgeTab.
 */
export class FridgeView {
  // `view` is de RegistrationView waar deze class bij hoort.
  constructor(view) {
    this.view = view;
  }

  get model() {
    return this.view.model;
  }

  $(selector) {
    return this.view.$(selector);
  }

  escape(value) {
    return this.view.escapeHtml(value);
  }

  // ------------------------------------------------------------------
  // Koelkastvenster
  // ------------------------------------------------------------------

  // Tekent het koelkastvenster. `state` komt van FridgeController:
  //   { phase: "waiting" | "open" | "summary", employeeId, badgeReader (staat de lezer aan),
  //     shelves (bij "open": per schap { shelf, productId, onShelf, held }),
  //     result (bij "summary": het resultaat van SmartFridge.finish), saveFailed,
  //     recognizedBy ("badge" of "face" als de koelkast opende na herkenning op de beginpagina, anders null) }
  renderFridgeWindow(state) {
    const body = this.$("#fridgeBody");
    if (!body) return;

    const titles = { waiting: "Koelkast openen", open: "De deur is open", summary: "De deur is dicht" };
    this.$("#fridgeTitle").textContent = titles[state.phase] || titles.waiting;

    if (state.phase === "open") body.innerHTML = this.openHtml(state);
    else if (state.phase === "summary") body.innerHTML = this.summaryHtml(state);
    else body.innerHTML = this.waitingHtml(state);

    // De knop "Deur dicht" staat in de knopbalk onderaan en is er alleen als de deur open is.
    const open = state.phase === "open";
    this.$("#fridgeCloseDoorButton")?.classList.toggle("hidden", !open);
    this.$("#fridgeActions")?.classList.toggle("is-empty", !open);
    if (!open) this.setDoorWarning(false);
  }

  // Deur dicht en op slot: de uitleg over de pas en, voor de demo, een medewerker kiezen. De keuzelijst
  // begint met de lege keuze "Kies een medewerker" en de knop "Openen (demo)" staat pas aan na een
  // keuze (FridgeController.updateFridgeDemoButton). Zo opent niemand de koelkast per ongeluk op naam
  // van de collega die bovenaan de lijst staat.
  waitingHtml(state) {
    const employees = this.model.employees
      .filter(({ active }) => active)
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));
    const instruction = state.badgeReader
      ? "Houd je pas tegen de lezer om de koelkast te openen"
      : "Kies hieronder een medewerker om de koelkast te openen";

    return `
      <div class="fridge-cabinet is-closed" aria-hidden="true">
        <div class="fridge-door">
          <span class="fridge-lock">${icon("lock")} Op slot</span>
          <span class="fridge-handle"></span>
        </div>
      </div>
      <p class="fridge-instruction">${icon("userSearch")} <span>${this.escape(instruction)}</span></p>
      <div class="fridge-demo">
        <p class="fridge-demo-title">Demo zonder pasjeslezer</p>
        <p class="muted">Kies een medewerker. In de demo werkt dat als het tonen van zijn pas.</p>
        <div class="fridge-demo-row">
          <label class="fridge-demo-label">Medewerker
            <select id="fridgeDemoEmployee"><option value="" selected>Kies een medewerker</option>${employees.map(({ id, name }) =>
              `<option value="${this.escape(id)}">${this.escape(name)}</option>`).join("")}</select>
          </label>
          <button type="button" class="secondary-button" data-fridge-demo-open disabled>${icon("unlock")} Openen (demo)</button>
        </div>
      </div>`;
  }

  // Deur open: per schap het product, hoeveel er nog op liggen en tegels om te pakken. Onder de
  // begroeting staat op wiens naam alles komt wat er nu wordt gepakt (TO bijlage B, risico "Twee
  // mensen tegelijk"): wie de deur open ziet staan, weet zo dat het niet op zijn eigen naam komt.
  openHtml(state) {
    const employee = this.model.findEmployee(state.employeeId);
    const firstName = employee?.firstName || employee?.name || "";
    const held = {};
    for (const shelf of state.shelves) {
      if (shelf.productId && shelf.held > 0) held[shelf.productId] = (held[shelf.productId] || 0) + shelf.held;
    }
    const heldText = Object.keys(held).length ? this.view.describeSelection(held) : "Nog niets";
    const firstFilled = state.shelves.find(({ productId }) => productId);
    // Geopend na herkenning op de beginpagina: de begroeting zegt hoe (zoals in het productvenster).
    const how = { face: " Je bent herkend met de camera.", badge: " Je bent herkend met je pas." }[state.recognizedBy] || "";
    // Zolang er niets in de hand is, kan de medewerker in plaats daarvan het productvenster openen
    // (brood, beleg en andere producten die niet in de koelkast liggen).
    const toProducts = Object.keys(held).length === 0
      ? `<button type="button" class="text-link fridge-to-products" data-fridge-to-products>${icon("package")} Liever brood of beleg? Open het productvenster</button>`
      : "";

    return `
      <p class="welcome-line">${this.escape(`${this.view.greeting(new Date())} ${firstName}.${how} Pak wat je wilt en sluit de deur.`)}</p>
      <p class="fridge-owner" id="fridgeOwner">Alles wat je nu pakt, staat op naam van <strong>${this.escape(employee?.name || "deze medewerker")}</strong>.</p>
      <p class="muted fridge-help">Tik op een schap om een product te pakken. Zet je iets terug, tik dan op Terugleggen.</p>
      <div class="fridge-cabinet is-open">
        <div class="fridge-door" aria-hidden="true"><span class="fridge-lock">${icon("unlock")} Open</span></div>
        <div class="fridge-shelves">${state.shelves.map((shelf) => this.shelfHtml(shelf)).join("")}</div>
      </div>
      <p class="fridge-hand"><strong>In je hand:</strong> <span id="fridgeHandText">${this.escape(heldText)}</span></p>
      ${toProducts}
      ${firstFilled ? `<button type="button" class="text-link fridge-foreign" data-fridge-foreign="${this.escape(firstFilled.shelf)}">Iets anders op schap ${this.escape(firstFilled.shelf)} leggen (demo)</button>` : ""}`;
  }

  // Eén schap in de open koelkast. De tegels zijn één knop: een tik pakt één product.
  shelfHtml({ shelf, productId, onShelf, held }) {
    if (!productId) {
      return `<div class="fridge-shelf is-empty">
        <div class="fridge-shelf-head"><strong>Schap ${this.escape(shelf)}</strong><small>Leeg schap</small></div>
      </div>`;
    }

    const name = this.model.productName(productId);
    const tiles = Array.from({ length: Math.min(onShelf, MAX_TILES) }, () => `<span class="fridge-item">${icon("package")}</span>`).join("");
    const more = onShelf > MAX_TILES ? `<span class="fridge-more">+${onShelf - MAX_TILES}</span>` : "";
    const countText = `${onShelf} op het schap`;

    return `<div class="fridge-shelf">
      <div class="fridge-shelf-head">
        <strong>Schap ${this.escape(shelf)} · ${this.escape(name)}</strong>
        <small>${this.escape(countText)}</small>
      </div>
      <div class="fridge-shelf-row">
        <button type="button" class="fridge-shelf-take" data-fridge-take="${this.escape(shelf)}"
                aria-label="${this.escape(`Pak een ${name} van schap ${shelf}, ${countText}`)}" ${onShelf > 0 ? "" : "disabled"}>
          ${tiles || `<span class="fridge-shelf-empty-text">Leeg</span>`}${more}
        </button>
        ${held > 0
          ? `<button type="button" class="secondary-button fridge-return" data-fridge-return="${this.escape(shelf)}"
                     aria-label="${this.escape(`Een ${name} terugleggen op schap ${shelf}`)}">Terugleggen</button>`
          : ""}
      </div>
    </div>`;
  }

  // Het overzicht na het sluiten van de deur.
  summaryHtml({ result, saveFailed, employeeId }) {
    const employee = this.model.findEmployee(employeeId);
    if (saveFailed) {
      return `<div class="fridge-summary is-error">
        ${icon("alert")}
        <h3>Er is niets geregistreerd</h3>
        <p>De registratie kon niet worden opgeslagen. Meld dit bij de beheerder.</p>
        <button type="button" class="primary-button" data-fridge-done>Klaar</button>
      </div>`;
    }

    const taken = result?.taken || {};
    const anything = Object.keys(taken).length > 0;
    const issues = (result?.shelves || [])
      .filter(({ flag }) => flag)
      .map((shelf) => `Bij schap ${shelf.shelf} klopt het gewicht niet. Dat schap is niet geregistreerd.`);
    if (result?.longOpen) issues.push("De deur stond lang open.");
    if (result?.otherBadge) issues.push("Er is een andere pas gescand terwijl de deur open stond.");

    const heading = anything ? `Je hebt gepakt: ${this.view.describeSelection(taken)}` : "Je hebt niets gepakt";
    const text = anything
      ? `Dit is geregistreerd op naam van ${employee?.name || "deze medewerker"}. De koelkast is weer op slot.`
      : "Er is niets geregistreerd. De koelkast is weer op slot.";

    return `<div class="fridge-summary">
      ${icon(anything ? "check" : "lock")}
      <h3 id="fridgeSummaryHeading">${this.escape(heading)}</h3>
      <p>${this.escape(text)}</p>
      ${issues.length ? `<div class="fridge-flag">${icon("alert")}<p>${this.escape(`${issues.join(" ")} De beheerder kijkt ernaar.`)}</p></div>` : ""}
      <button type="button" class="primary-button" data-fridge-done>Klaar</button>
    </div>`;
  }

  // Zet een melding in de statusregel van het koelkastvenster (role="status": een schermlezer leest
  // hem voor). `tone` is "error" (rode tekst) of "info". Een lege tekst maakt de regel leeg.
  setFridgeStatus(text, tone = "info") {
    const status = this.$("#fridgeStatus");
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  }

  // Zet een korte tekst in de onzichtbare live region van het koelkastvenster, bijvoorbeeld
  // "Blikje gepakt. In je hand: 2× Blikje" (alleen voor schermlezers).
  announceFridge(text) {
    const live = this.$("#fridgeLiveStatus");
    if (live) live.textContent = text;
  }

  // Toont of verbergt de waarschuwing "De deur staat al lang open. Sluit de deur." in de knopbalk.
  // Met `name` zegt de waarschuwing ook op wiens naam de koelkast open is, bijvoorbeeld "… Wat er nu
  // wordt gepakt, staat op naam van Lotte van Dijk."
  setDoorWarning(shown, name = null) {
    const warning = this.$("#fridgeDoorWarning");
    if (!warning) return;
    const owner = name ? ` Wat er nu wordt gepakt, staat op naam van ${name}.` : "";
    warning.textContent = shown ? `De deur staat al lang open. Sluit de deur.${owner}` : "";
  }

  // ------------------------------------------------------------------
  // Beheer: tabblad Koelkast
  // ------------------------------------------------------------------

  // Tekent het tabblad Koelkast: de keuze van het consumptiepunt, de indeling van de schappen en de
  // laatste openingen.
  renderFridgeAdmin() {
    const select = this.$("#fridgePointSelect");
    if (!select || !this.$("#fridgeShelfFields")) return;

    const selected = select.value;
    select.innerHTML = this.model.sortedCompanies()
      .filter(({ id }) => this.model.pointsForCompany(id).length)
      .map((company) =>
        `<optgroup label="${this.escape(company.name)}">${
          this.model.pointsForCompany(company.id).map(({ id, name }) =>
            `<option value="${this.escape(id)}">${this.escape(name)}</option>`
          ).join("")
        }</optgroup>`
      ).join("");
    if (this.model.findPoint(selected)) select.value = selected;

    this.renderFridgeShelfFields(select.value);
    this.renderFridgeOpenings();
  }

  // De velden van de indeling: per schap een product (alleen wat het punt aanbiedt) en het gewicht
  // van één stuk in gram.
  renderFridgeShelfFields(pointId) {
    const fields = this.$("#fridgeShelfFields");
    const saveButton = this.$("#fridgeShelfSaveButton");
    const point = this.model.findPoint(pointId);
    saveButton?.classList.toggle("hidden", !point);

    if (!point) {
      fields.innerHTML = this.view.emptyState({ iconName: "location", title: "Nog geen consumptiepunt.", text: "Voeg eerst een consumptiepunt toe bij Bedrijven." });
      return;
    }

    const offered = this.model.offeredProducts(pointId);
    fields.innerHTML = this.model.fridgeLayout(pointId).map(({ shelf, productId, unitWeight }) => `
      <div class="fridge-shelf-field" data-fridge-shelf="${this.escape(shelf)}">
        <span class="fridge-shelf-number">Schap ${this.escape(shelf)}</span>
        <label>Product
          <select id="fridgeShelfProduct${this.escape(shelf)}" data-fridge-shelf-product>
            <option value="">Leeg schap</option>
            ${offered.map(({ id, name }) => `<option value="${this.escape(id)}" ${id === productId ? "selected" : ""}>${this.escape(name)}</option>`).join("")}
          </select>
        </label>
        <label>Gewicht per stuk (gram)
          <input id="fridgeShelfWeight${this.escape(shelf)}" data-fridge-shelf-weight type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="${this.escape(unitWeight ?? "")}">
        </label>
      </div>`).join("");
  }

  // De laatste openingen: tijd, medewerker, wat er is gepakt en de status (met de reden bij
  // "Controle nodig").
  renderFridgeOpenings() {
    const body = this.$("#fridgeOpeningsBody");
    if (!body) return;

    const openings = this.model.recentFridgeOpenings();
    body.innerHTML = openings.length
      ? openings.map((opening) => {
        const employee = this.model.findEmployee(opening.employeeId);
        const taken = this.model.fridgeOpeningTaken(opening);
        const issues = opening.shelves
          .filter(({ flag }) => flag)
          .map((shelf) => SmartFridge.issueText(shelf, shelf.productId ? this.model.productName(shelf.productId) : null));
        if (opening.longOpen) issues.push("deur stond lang open");
        if (opening.otherBadge) issues.push("pas van een collega gescand terwijl de deur open stond");
        const status = FRIDGE_STATUS[opening.status] || opening.status;

        return `<tr>
          <td>${this.escape(this.view.formatDate(opening.closedAt))}</td>
          <td>${employee ? this.escape(employee.name) : "Verwijderd"}</td>
          <td>${Object.keys(taken).length ? this.escape(this.view.describeSelection(taken)) : "Niets"}</td>
          <td><span class="stock-badge fridge-status-${this.escape(opening.status)}">${this.escape(status)}</span>${
            issues.length ? `<small class="fridge-issue">${this.escape(issues.join(". "))}</small>` : ""}</td>
        </tr>`;
      }).join("")
      : this.view.emptyTableRow(4, { iconName: "fridge", title: "Nog geen openingen.", text: "Een opening verschijnt hier zodra iemand de koelkast heeft geopend en weer gesloten." });
  }
}
