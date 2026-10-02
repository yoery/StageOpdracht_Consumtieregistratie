import { CsvExport } from "./csvExport.js";
import { FaceRecognitionDemo } from "./FaceRecognitionDemo.js";
import { createId } from "./ids.js";
import { cssAttributeValue } from "./RegistrationView.js";
// Hoogste productprijs (1000 euro). Moet gelijk zijn aan MAX_PRICE in DataStore.js; de constante
// staat in het model, zodat het model en het productformulier dezelfde grens gebruiken.
import { MAX_PRICE } from "./RegistrationModel.js";

// Hoogste aantal dat de beheerder bij voorraad, minimum of levering mag invullen. Zo komt een
// tikfout als "240000" in plaats van "24" niet ongemerkt in de voorraad.
const MAX_STOCK_AMOUNT = 100000;

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
 *   - FaceRecognitionDemo: de demo gezichtsherkenning (camera, herkennen, instellen).
 *   - ids.js: createId() voor de id van een nieuw product (werkt ook zonder https).
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
 *   8. demo gezichtsherkenning
 */
export class RegistrationApp {
  // De controller krijgt het model, de view, de export en de demo gezichtsherkenning mee
  // (compositie). Wat niet wordt meegegeven, maakt de controller zelf.
  constructor(model, view, csvExport = new CsvExport(model), faceDemo = new FaceRecognitionDemo()) {
    this.model = model;
    this.view = view;
    this.csvExport = csvExport;
    this.faceDemo = faceDemo;

    // Tijdelijke status van het scherm; deze wordt niet opgeslagen.
    this.adminLoggedIn = false;
    this.auditLogLimit = 20;
    this.selectedEmployeeId = null;
    this.selectedProducts = {}; // per product-id het gekozen aantal, bijv. { blikje: 2 }
    this.recognizedByFace = false; // is de medewerker in het productvenster herkend met de camera?
    this.faceSession = 0;          // telt op bij ieder openen en sluiten van het cameravenster
    this.faceMode = null;          // "recognize" (herkennen) of "enroll" (instellen)
    this.cameraReady = false;      // staat de camera echt aan om een gezicht vast te leggen?
    this.captureSession = null;    // sessienummer van het vastleggen dat nu loopt (zie get capturing)
    this.modalCloseActions = new Map(); // venster -> sluitactie (voor de Escape-toets)
    this.modalOpeners = new Map();      // venster -> element dat de focus had toen het venster openging
    this.currentDay = new Date().toDateString(); // de dag die nu op het scherm staat (zie refreshIfNewDay)
    this.lastDelivery = null;      // laatst geboekte levering: { productId, time } (zie bookDelivery)
    this.editingCopies = new Map(); // formulier -> kopie (tekst) van het gegeven bij het openen (zie rememberEditing)
  }

  // Wordt er op dit moment een gezicht vastgelegd in het venster dat nu open is?
  // Dat is alleen zo als het vastleggen bij de huidige sessie hoort. Een vastlegging uit een
  // eerder (gesloten) venster mag een opnieuw geopend venster niet blokkeren.
  get capturing() {
    return this.captureSession !== null && this.captureSession === this.faceSession;
  }

  // ------------------------------------------------------------------
  // 1. Starten en hulpfuncties
  // ------------------------------------------------------------------

  // Start de app: datum tonen, event listeners koppelen en de pagina voor het eerst tekenen.
  // De tablet staat dag en nacht aan (kiosk). Daarom kijkt een timer iedere minuut of het een
  // nieuwe dag is; zo niet, dan zouden de datum en de tegels "Vandaag" en "Deze maand" de
  // volgende ochtend nog de cijfers van gisteren tonen.
  initialize() {
    this.renderTodayLabel(new Date());

    this.view.renderIcons();
    this.registerEventListeners();
    this.view.$("#faceRecognizeButton").classList.toggle("hidden", !this.faceDemo.isAvailable());
    this.view.renderAll();
    this.showLoadProblem();

    this.dayTimer = setInterval(() => this.refreshIfNewDay(), 60 * 1000);
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

  // Een ander tabblad (in dezelfde browser) heeft de gegevens opgeslagen. Zonder deze stap zou
  // dit tabblad bij de volgende wijziging zijn oude gegevens terugschrijven, waardoor de
  // wijzigingen van het andere tabblad verloren gaan. Daarom worden de gegevens opnieuw geladen
  // en wordt alles opnieuw getekend.
  //
  // Daarna wordt opgeruimd wat niet meer klopt:
  //   - een open formulier van iets dat in het andere tabblad is verwijderd of gewijzigd, gaat dicht;
  //   - een open productvenster (en het cameravenster erboven) gaat dicht als de medewerker
  //     weg of inactief is, met een melding zodat de gebruiker weet waarom.
  // Typt de beheerder op dat moment in de voorraadtabel, dan blijft die tabel staan; anders
  // zou het half ingetypte getal verdwijnen.
  //
  // Heeft het andere tabblad de hele opslag leeggemaakt (`event.key` is dan null) en staat er
  // niets meer in, dan wist dit tabblad ook alles (zie handleStorageCleared). Anders zou dit
  // tabblad bij de volgende wijziging zijn oude gegevens weer terugschrijven.
  handleStorageChange(event) {
    if (!this.model.isStorageKey(event.key)) return;
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

  // Heeft een invoerveld in de voorraadtabel nu de focus? Dan is de beheerder aan het typen.
  isTypingInStockTable() {
    const focused = globalThis.document?.activeElement;
    return Boolean(focused) && this.view.$("#stockTableBody").contains(focused);
  }

  // De vier wijzigformulieren: formulier, venster, hoe het gegeven wordt opgezocht en hoe het
  // formulier sluit. Wordt gebruikt door closeStaleForms en handleStorageCleared.
  editForms() {
    return [
      ["#employeeForm", "#employeeFormModal", (id) => this.model.findEmployee(id), () => this.closeEmployeeForm()],
      ["#productForm", "#productFormModal", (id) => this.model.findProduct(id), () => this.closeProductForm()],
      ["#companyForm", "#companyFormModal", (id) => this.model.findCompany(id), () => this.closeCompanyForm()],
      ["#pointForm", "#pointFormModal", (id) => this.model.findPoint(id), () => this.closePointForm()]
    ];
  }

  // Sluit open wijzigformulieren waarvan het gegeven (medewerker, product, bedrijf of
  // consumptiepunt) in een ander tabblad is verwijderd of gewijzigd.
  //   - verwijderd: opslaan zou anders niets doen of het gegeven opnieuw aanmaken;
  //   - gewijzigd: opslaan zou de wijziging uit het andere tabblad overschrijven met de oude
  //     gegevens die nog in dit formulier staan (bijvoorbeeld een oud aanbod van een punt).
  // Of het gegeven is gewijzigd, blijkt uit de kopie die bij het openen is bewaard (zie rememberEditing).
  closeStaleForms() {
    for (const [formSelector, modalSelector, find, close] of this.editForms()) {
      const form = this.view.$(formSelector);
      const editingId = form.dataset.editingId;
      const isOpen = !this.view.$(modalSelector).classList.contains("hidden");
      if (!editingId || !isOpen) continue;

      const record = find(editingId);
      let message = null;
      if (!record) {
        message = "Wat je aan het wijzigen was, is in een ander venster verwijderd. Het formulier is gesloten.";
      } else if (this.changedElsewhere(formSelector, record)) {
        message = "Wat je aan het wijzigen was, is in een ander venster gewijzigd. Open het opnieuw om verder te gaan.";
      }
      if (!message) continue;

      delete form.dataset.editingId;
      this.editingCopies.delete(formSelector);
      close();
      this.view.showToast(message, { tone: "error", duration: 5000 });
    }
  }

  // Onthoudt bij het openen van een wijzigformulier hoe het gegeven er op dat moment uitzag.
  // Zo kan closeStaleForms later zien of een ander tabblad het intussen heeft gewijzigd.
  rememberEditing(formSelector, record) {
    this.editingCopies.set(formSelector, this.editableCopy(formSelector, record));
  }

  // Maakt een kopie (als tekst) van de gegevens die het formulier kan wijzigen.
  // Bij een consumptiepunt tellen alleen naam, bedrijf en aanbod: de voorraad verandert bij
  // iedere registratie, en het formulier laat de voorraad toch staan (zie model.savePoint).
  // Anders zou het formulier sluiten zodra iemand in een ander tabblad een blikje pakt.
  editableCopy(formSelector, record) {
    if (formSelector === "#pointForm") {
      const offered = Object.keys(record.products).filter((id) => record.products[id].offered).sort();
      return JSON.stringify({ name: record.name, companyId: record.companyId, offered });
    }
    return JSON.stringify(record);
  }

  // Is het gegeven anders dan toen het formulier werd geopend? Zonder bewaarde kopie (het
  // formulier is niet via "Wijzigen" geopend) wordt dat niet aangenomen.
  changedElsewhere(formSelector, record) {
    const copy = this.editingCopies.get(formSelector);
    return copy !== undefined && copy !== this.editableCopy(formSelector, record);
  }

  // Een ander tabblad heeft de hele opslag leeggemaakt. Dit tabblad wist dan ook alles en
  // begint opnieuw met de demogegevens, net als de knop "Alle gegevens wissen". Er wordt niet
  // opgeslagen: de opslag is al leeg, en de volgende wijziging slaat de nieuwe gegevens op.
  // Alles wat open staat (productvenster, camera, formulieren, beheerscherm) gaat dicht, want
  // het hoort bij gegevens die niet meer bestaan. Ingestelde gezichten (demo) worden vergeten.
  handleStorageCleared() {
    this.model.wipeAll();
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

  // Na een knop die het productvenster opnieuw tekent (zoals "Zelfde als vorige keer") bestaat
  // die knop niet meer. De focus gaat dan naar "Registreren", of naar de sluitknop als er geen
  // producten zijn, zodat de focus niet achter het venster verdwijnt.
  focusProductWindowAction() {
    const registerButton = this.view.$("#registerSelectedProductsButton");
    const target = registerButton.classList.contains("hidden")
      ? this.view.$("#employeeProductsModal .modal-close")
      : registerButton;
    target?.focus();
  }

  // Voert een wijziging uit en slaat die op. Lukt opslaan niet, dan wordt de vorige
  // status teruggezet en krijgt de gebruiker een melding. Geeft true terug als het lukte.
  //
  // `audit` (optioneel) is de regel voor het logboek, bijvoorbeeld
  // { action: "Product verwijderd", details: "Blikje" }. Die regel wordt toegevoegd vóórdat er
  // één keer wordt opgeslagen. Zo worden de wijziging en de logboekregel samen opgeslagen, of
  // samen teruggedraaid: er kan geen wijziging zonder logboekregel ontstaan (of andersom).
  //
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

  // Tekent alle admin- en publieke onderdelen opnieuw en toont een melding. Opslaan (ook van
  // het logboek) is dan al gebeurd in persist. Wordt gebruikt na wijzigingen aan producten,
  // bedrijven, consumptiepunten en voorraad. Ook de registratietabel wordt opnieuw getekend,
  // zodat daar bijvoorbeeld de nieuwe naam van een product staat.
  // Met redrawStockTable: false blijft de voorraadtabel staan (zie saveStockField).
  finishAdminChange(message, { redrawStockTable = true } = {}) {
    this.view.renderAll();
    this.view.populateFilters();
    this.view.renderAdmin();
    this.view.renderAdminEmployees();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminProducts();
    this.view.renderAdminCompanies();
    if (redrawStockTable) this.view.renderStock();
    this.renderAuditLog();
    this.view.showToast(message, { tone: "success" });
  }

  // Tekent het logboek opnieuw met het aantal regels dat de beheerder nu ziet. Zo blijft het
  // logboek na "Meer laden" even lang, ook als er daarna iets wordt gewijzigd.
  renderAuditLog() {
    this.view.renderAuditLog(this.auditLogLimit);
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

  // Controleert de verplichte velden (required) van een formulier. Lege velden krijgen een
  // foutmelding direct onder het veld en het eerste lege veld krijgt de focus.
  // Geeft true terug als alles is ingevuld.
  validateRequiredFields(form) {
    this.view.clearFieldErrors(form);
    const emptyFields = [...form.querySelectorAll("[required]")].filter((field) => field.value.trim() === "");

    for (const field of emptyFields) {
      const message = field.tagName === "SELECT" ? "Maak een keuze." : "Vul dit veld in.";
      this.view.showFieldError(field, message);
    }

    emptyFields[0]?.focus();
    return emptyFields.length === 0;
  }

  // Is dit een geldige prijs? Van 0 tot en met MAX_PRICE (1000 euro), met hooguit twee
  // decimalen, zoals "0.65", "2" of ".5" (zo geeft het prijsveld een prijs door die zonder 0
  // vooraan is getypt). Een hogere prijs zou DataStore bij het volgende laden weggooien,
  // samen met de registraties van dat product; daarom wordt die hier al geweigerd.
  static isValidPrice(value) {
    const text = String(value).trim();
    return /^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(text) && Number(text) <= MAX_PRICE;
  }

  // Bestaat dit nummer alleen uit cijfers? Voor looncode, personeelsnummer en werkgevernummer.
  static isDigitsOnly(value) {
    return /^\d+$/.test(String(value).trim());
  }

  // Controleert velden die alleen cijfers mogen bevatten. Lege optionele velden zijn goed;
  // lege verplichte velden zijn al door validateRequiredFields gemeld.
  // Geeft true terug als alles klopt; anders krijgt het eerste foute veld de focus.
  validateNumberFields(selectors) {
    const wrongFields = selectors
      .map((selector) => this.view.$(selector))
      .filter((field) => field.value.trim() !== "" && !RegistrationApp.isDigitsOnly(field.value));

    for (const field of wrongFields) {
      this.view.showFieldError(field, "Gebruik alleen cijfers.");
    }

    wrongFields[0]?.focus();
    return wrongFields.length === 0;
  }

  // Toont bij het naamveld dat de naam al bestaat, en zet de focus op dat veld.
  showDuplicateNameError(fieldSelector, message) {
    const field = this.view.$(fieldSelector);
    this.view.showFieldError(field, message);
    field.focus();
  }

  // Toont of verbergt een element op de pagina.
  show(selector) {
    this.view.$(selector).classList.remove("hidden");
  }

  hide(selector) {
    this.view.$(selector).classList.add("hidden");
  }

  // Onthoudt welk element de focus had vlak voordat een venster opengaat (meestal de knop
  // waarmee het venster werd geopend). closeModal zet de focus daar later naar terug.
  rememberOpener(modalSelector) {
    this.modalOpeners.set(this.view.$(modalSelector), globalThis.document?.activeElement || null);
  }

  // Opent een venster en onthoudt waar de focus vandaan kwam.
  openModal(modalSelector) {
    this.rememberOpener(modalSelector);
    this.show(modalSelector);
  }

  // Sluit een venster en zet de focus terug op het element waarmee het werd geopend.
  // Zonder deze stap valt de focus na het sluiten terug naar het begin van de pagina, en moet
  // iemand met een toetsenbord of schermlezer opnieuw zoeken waar hij was (toegankelijkheid).
  // Alle manieren van sluiten komen hier langs: de sluitknop, de achtergrond, Escape en na opslaan.
  // De focus gaat alleen terug als dat element nog op de pagina staat en zichtbaar is.
  closeModal(modalSelector) {
    const modal = this.view.$(modalSelector);
    modal.classList.add("hidden");

    const opener = this.modalOpeners.get(modal);
    this.modalOpeners.delete(modal);
    if (opener?.isConnected && opener.getClientRects().length > 0) opener.focus();
  }

  // Melding als een gegeven intussen niet meer bestaat, bijvoorbeeld omdat het in een ander
  // tabblad is verwijderd en deze knop of dit formulier nog van vóór die tijd is.
  // `subject` is bijvoorbeeld "Dit product" of "Deze medewerker".
  showMissing(subject) {
    this.view.showToast(`${subject} bestaat niet meer; er is niets opgeslagen.`, { tone: "error" });
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
      ["[data-product-decrement]", (button) => this.decrementProduct(button.dataset.productDecrement)],
      ["#registerSelectedProductsButton", () => this.registerSelectedProducts()],
      ["[data-open-employee]", (button) => this.openEmployeeProducts(button.dataset.openEmployee)],
      ["[data-correction-plus]", (button) => this.addCorrection(button.dataset.correctionPlus, button.dataset.correctionProduct)],
      ["[data-correction-minus]", (button) => this.removeCorrection(button.dataset.correctionMinus, button.dataset.correctionProduct)],
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

  // Tekent de correctielijst "Medewerker corrigeren" opnieuw. De lijst wordt helemaal opnieuw
  // opgebouwd, waardoor de knop met de focus verdwijnt. Had een "+"- of "−"-knop de focus, dan
  // krijgt de nieuwe knop met dezelfde medewerker en hetzelfde product die focus terug. Zo kan de
  // beheerder met het toetsenbord meerdere keren achter elkaar corrigeren.
  renderCorrectionList() {
    const focused = globalThis.document?.activeElement;
    const plusEmployeeId = focused?.dataset?.correctionPlus;
    const minusEmployeeId = focused?.dataset?.correctionMinus;
    const productId = focused?.dataset?.correctionProduct;

    this.view.renderCorrectionEmployees();

    // De ids worden met cssAttributeValue veilig gemaakt, zodat een aanhalingsteken in een id
    // de zoekopdracht (selector) niet kapotmaakt.
    const product = cssAttributeValue(productId);
    if (plusEmployeeId) {
      this.view.$(`[data-correction-plus="${cssAttributeValue(plusEmployeeId)}"][data-correction-product="${product}"]`)?.focus();
    } else if (minusEmployeeId) {
      this.view.$(`[data-correction-minus="${cssAttributeValue(minusEmployeeId)}"][data-correction-product="${product}"]`)?.focus();
    }
  }

  // Zet een datum om naar de vorm van een datumveld ("2026-10-02"), in lokale tijd.
  // Wordt gebruikt voor het datumveld bij de correctie "+".
  static dateValue(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  // Zet het datumveld bij de correctie "+" op vandaag, met vandaag als laatste mogelijke datum.
  // Wordt aangeroepen als het dashboard opent (showDashboard).
  resetCorrectionDate(now = new Date()) {
    const field = this.view.$("#correctionDate");
    field.value = RegistrationApp.dateValue(now);
    field.max = field.value;
    this.view.clearFieldError(field);
  }

  // Leest de datum voor de correctie "+". Is het vandaag (of leeg), dan is het tijdstip nu.
  // Een eerdere dag krijgt 12:00 uur, zodat de registratie zeker in die dag en maand valt.
  // Een datum in de toekomst of van vóór 2000 wordt geweigerd met een foutmelding bij het veld;
  // dan geeft de methode null terug. `now` is mee te geven, zodat dit te testen is.
  readCorrectionDate(now = new Date()) {
    const field = this.view.$("#correctionDate");
    this.view.clearFieldError(field);
    if (!field.value || field.value === RegistrationApp.dateValue(now)) return now;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(field.value);
    const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
    // Een datum als 31-02 schuift in JavaScript door naar maart; dat telt als ongeldig.
    const exists = date && RegistrationApp.dateValue(date) === field.value;

    if (!exists || date > now || date.getFullYear() < 2000) {
      this.view.showFieldError(field, "Kies een geldige datum, niet later dan vandaag.");
      field.focus();
      return null;
    }
    return date;
  }

  // Valt de gekozen datum in een eerdere maand, dan is die loonmaand misschien al verwerkt.
  // Daarom eerst een vraag, net als bij een correctie "−" (zie confirmOldMonthRemoval).
  // Geeft true terug als toevoegen mag (huidige maand, of de beheerder klikt op OK).
  confirmOldMonthAddition(date, now = new Date()) {
    if (this.model.monthKey(date) === this.model.monthKey(now)) return true;

    const monthName = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(date);
    return window.confirm(`Deze registratie komt in ${monthName}. Die loonmaand is mogelijk al verwerkt. Toch toevoegen?`);
  }

  // Correctie met "+": voegt als beheerder één product toe voor een medewerker, op de datum uit
  // het datumveld (standaard vandaag; zie readCorrectionDate en confirmOldMonthAddition).
  // Is de medewerker intussen verwijderd (bijvoorbeeld in een ander tabblad), dan wordt er
  // niets opgeslagen; anders zou er een registratie zonder medewerker ontstaan.
  // De logboekregel wordt in dezelfde keer opgeslagen als de registratie (zie persist).
  addCorrection(employeeId, productId, now = new Date()) {
    if (!this.model.findEmployee(employeeId)) {
      this.view.showToast("Deze medewerker bestaat niet meer. Er is niets opgeslagen.", { tone: "error" });
      return false;
    }

    const createdAt = this.readCorrectionDate(now);
    if (!createdAt || !this.confirmOldMonthAddition(createdAt, now)) return false;

    // Bij een eerdere datum komt die datum in het logboek en in de melding.
    const isToday = createdAt === now;
    const dateText = isToday
      ? ""
      : ` op ${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(createdAt)}`;

    const productName = this.model.productName(productId);
    const saved = this.persist(
      () => this.model.addRegistration(employeeId, productId, { correction: true, createdAt }),
      { action: "Registratie toegevoegd", details: `${productName} voor ${this.employeeLabel(employeeId)}${dateText}` }
    );
    if (!saved) return false;

    this.view.showToast(`${productName} toegevoegd voor medewerker${dateText}`, { tone: "success" });
    this.view.renderAll();
    this.view.populateFilters();
    this.renderCorrectionList();
    this.view.renderAdmin();
    this.view.renderStock(); // de correctie verandert ook de voorraad
    this.renderAuditLog();
    return true;
  }

  // Correctie met "−": verwijdert de laatste registratie van dit product bij deze medewerker.
  // Is die registratie uit een eerdere maand, dan vraagt de app eerst om bevestiging (zie
  // confirmOldMonthRemoval). Kiest de beheerder "Annuleren", dan verandert er niets.
  removeCorrection(employeeId, productId) {
    if (!this.model.hasRegistration(employeeId, productId)) {
      this.view.showToast("Dit product heeft geen registratie voor deze medewerker", { tone: "error" });
      return;
    }

    const lastRegistration = this.model.lastRegistration(employeeId, productId);
    if (lastRegistration && !this.confirmOldMonthRemoval(lastRegistration)) return;

    const productName = this.model.productName(productId);
    const saved = this.persist(
      () => this.model.removeLastRegistration(employeeId, productId),
      { action: "Registratie verwijderd", details: `${productName} van ${this.employeeLabel(employeeId)}` }
    );
    if (!saved) return;

    this.renderAuditLog();
    this.view.populateFilters();
    this.renderCorrectionList();
    this.view.renderAdmin();
    this.view.renderStock(); // de voorraad komt terug, dus het tabblad Voorraad moet mee
    this.view.renderAll();
    this.view.showToast(`${productName} registratie verwijderd`, { tone: "success" });
  }

  // Komt de registratie uit een andere maand dan de huidige? Dan is die loonmaand misschien al
  // naar de loonadministratie gestuurd, en klopt de export daarna niet meer met wat er is
  // verrekend. Daarom eerst een vraag met de naam van de maand. Geeft true terug als
  // verwijderen mag (huidige maand, of de beheerder klikt op OK).
  confirmOldMonthRemoval(registration, now = new Date()) {
    const createdAt = new Date(registration.createdAt);
    if (this.model.monthKey(createdAt) === this.model.monthKey(now)) return true;

    const monthName = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(createdAt);
    return window.confirm(`Deze registratie is van ${monthName}. Die loonmaand is mogelijk al verwerkt. Toch verwijderen?`);
  }

  // Zet een medewerker actief of inactief (omgekeerd van wat het nu is).
  // Bestaat de medewerker niet meer (verwijderd in een ander tabblad), dan volgt een melding.
  // Daarna worden ook de correctielijst en de registratietabel opnieuw getekend, zodat de
  // beheerder overal de actuele gegevens ziet.
  toggleEmployee(employeeId) {
    const employee = this.model.findEmployee(employeeId);
    if (!employee) {
      this.showMissing("Deze medewerker");
      return;
    }

    const active = !employee.active;
    const status = active ? "actief" : "inactief";
    const saved = this.persist(
      () => this.model.setEmployeeActive(employeeId, active),
      { action: "Medewerkerstatus gewijzigd", details: `${this.employeeLabel(employeeId)} is ${status} gezet` }
    );
    if (!saved) return;

    this.renderAuditLog();
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderCorrectionEmployees();
    this.view.renderAdmin();
    this.view.renderAll();
    this.view.showToast("Medewerkerstatus gewijzigd", { tone: "success" });
  }

  // Verwijdert een (inactieve) medewerker definitief, na bevestiging.
  // Een medewerker met registraties wordt niet verwijderd: die registraties zijn nodig voor de
  // loonadministratie (export) en anders staat er "Verwijderd" in plaats van een naam. Daarom
  // wordt dan niet om bevestiging gevraagd, maar uitgelegd dat deactiveren genoeg is.
  // De naam wordt vóór het verwijderen opgezocht, want daarna bestaat de medewerker niet meer.
  removeEmployee(employeeId) {
    // Bestaat de medewerker niet meer (verwijderd in een ander tabblad), dan niets doen en melden.
    if (!this.model.findEmployee(employeeId)) {
      this.showMissing("Deze medewerker");
      return;
    }
    if (this.model.employeeHasRegistrations(employeeId)) {
      this.view.showToast(
        "Deze medewerker heeft registraties en kan niet definitief worden verwijderd. Deactiveren is voldoende.",
        { tone: "error", duration: 5000 }
      );
      return;
    }

    const name = this.employeeLabel(employeeId);
    if (!window.confirm(`${name} definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;

    const saved = this.persist(
      () => this.model.removeEmployee(employeeId),
      { action: "Medewerker definitief verwijderd", details: name }
    );
    if (!saved) return;

    // Een ingesteld gezicht (demo) hoort bij deze medewerker en moet dus ook weg.
    this.faceDemo.forget(employeeId);
    this.renderAuditLog();
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderCorrectionEmployees();
    this.view.renderAdmin();
    this.view.renderAll();
    this.view.showToast("Inactieve medewerker definitief verwijderd", { tone: "success" });
  }

  // Verwijdert een product, maar alleen als het nog nooit is geregistreerd.
  removeProduct(productId) {
    // Bestaat het product niet meer (verwijderd in een ander tabblad), dan niets doen en melden.
    if (!this.model.findProduct(productId)) {
      this.showMissing("Dit product");
      return;
    }
    const usedMessage = "Dit product wordt al gebruikt en kan niet worden verwijderd";
    const isUsed = this.model.registrations.some((registration) => registration.productId === productId);
    if (isUsed) {
      this.view.showToast(usedMessage, { tone: "error" });
      return;
    }

    // Lukt opslaan niet, dan toont persist zelf de melding "Opslaan mislukt".
    const productName = this.model.productName(productId);
    const saved = this.persist(
      () => this.model.removeProduct(productId),
      { action: "Product verwijderd", details: productName }
    );
    if (saved) this.finishAdminChange("Product verwijderd");
  }

  // Verwijdert een bedrijf, maar alleen als er geen medewerkers of consumptiepunten aan hangen.
  // Bestaat het bedrijf niet meer (verwijderd in een ander tabblad), dan volgt een melding.
  removeCompany(companyId) {
    if (!this.model.findCompany(companyId)) {
      this.showMissing("Dit bedrijf");
      return;
    }

    const name = this.model.companyName(companyId);
    const hasEmployees = this.model.employees.some((employee) => employee.companyId === companyId);
    const hasPoints = this.model.pointsForCompany(companyId).length > 0;

    if (hasEmployees || hasPoints) {
      this.view.showToast("Verwijder of verplaats eerst de medewerkers en consumptiepunten van dit bedrijf", { tone: "error" });
      return;
    }
    if (!window.confirm(`${name} verwijderen?`)) return;

    const saved = this.persist(
      () => this.model.removeCompany(companyId),
      { action: "Bedrijf verwijderd", details: name }
    );
    if (saved) this.finishAdminChange("Bedrijf verwijderd");
  }

  // Verwijdert een consumptiepunt, maar alleen als er geen medewerkers meer aan gekoppeld zijn.
  // Bestaat het punt niet meer (verwijderd in een ander tabblad), dan volgt een melding.
  removePoint(pointId) {
    const point = this.model.findPoint(pointId);
    if (!point) {
      this.showMissing("Dit consumptiepunt");
      return;
    }

    const hasEmployees = this.model.employees.some((employee) => employee.pointId === point.id);
    if (hasEmployees) {
      this.view.showToast("Koppel eerst de medewerkers van dit consumptiepunt aan een ander punt", { tone: "error" });
      return;
    }
    if (!window.confirm(`Consumptiepunt ${point.name} verwijderen? De voorraad van dit punt verdwijnt.`)) return;

    const saved = this.persist(
      () => this.model.removePoint(point.id),
      { action: "Consumptiepunt verwijderd", details: `${point.name} (${this.model.companyName(point.companyId)})` }
    );
    if (saved) this.finishAdminChange("Consumptiepunt verwijderd");
  }

  // ------------------------------------------------------------------
  // 3. Medewerker: producten kiezen en registreren
  // ------------------------------------------------------------------

  // Opent het persoonlijke productvenster met een lege keuze.
  // `recognized` is true als de medewerker net met de camera is herkend (demo).
  // De focus gaat naar de eerste "+"-knop (of naar de sluitknop als er geen producten zijn),
  // zodat je met het toetsenbord en een schermlezer meteen in het venster begint.
  // De view toont het venster zelf; hier wordt alleen onthouden waar de focus vandaan kwam,
  // zodat die na het sluiten terug kan (zie closeModal).
  openEmployeeProducts(employeeId, { recognized = false } = {}) {
    this.rememberOpener("#employeeProductsModal");
    this.selectedEmployeeId = employeeId;
    this.selectedProducts = {};
    this.recognizedByFace = recognized;
    this.renderProductWindow();

    const firstPlus = this.view.$("#employeeProductList [data-product-increment]");
    (firstPlus || this.view.$("#employeeProductsModal .modal-close"))?.focus();
  }

  // Tekent het productvenster opnieuw, met de status van de demo gezichtsherkenning.
  // Had een "+"- of "−"-knop de focus, dan krijgt dezelfde knop die na het tekenen terug.
  // Zo kun je met het toetsenbord meerdere keren achter elkaar op "+" drukken.
  renderProductWindow() {
    const focused = globalThis.document?.activeElement;
    const incrementId = focused?.dataset?.productIncrement;
    const decrementId = focused?.dataset?.productDecrement;

    this.removeUnavailableSelections();
    this.view.renderEmployeeProducts(this.selectedEmployeeId, this.selectedProducts, {
      available: this.faceDemo.isAvailable(),
      enrolled: this.faceDemo.isEnrolled(this.selectedEmployeeId),
      recognized: this.recognizedByFace
    });

    // De product-id wordt met cssAttributeValue veilig gemaakt voor de zoekopdracht (selector).
    if (incrementId) {
      this.view.$(`[data-product-increment="${cssAttributeValue(incrementId)}"]`)?.focus();
    } else if (decrementId) {
      // Staat het aantal weer op 0, dan is de "−" uitgeschakeld; de focus gaat dan naar de "+" ernaast.
      const minus = this.view.$(`[data-product-decrement="${cssAttributeValue(decrementId)}"]`);
      const plus = this.view.$(`[data-product-increment="${cssAttributeValue(decrementId)}"]`);
      (minus && !minus.disabled ? minus : plus)?.focus();
    }
  }

  // Haalt producten uit de keuze die de medewerker niet (meer) kan kiezen. Dat gebeurt als een
  // ander tabblad het aanbod van het consumptiepunt wijzigt of een product verwijdert terwijl dit
  // productvenster open is. Zonder deze stap telt "Registreren (n)" die producten nog mee en
  // worden ze toch geregistreerd.
  removeUnavailableSelections() {
    const offeredIds = this.model.productsForEmployee(this.selectedEmployeeId).map((product) => product.id);

    for (const productId of Object.keys(this.selectedProducts)) {
      if (!offeredIds.includes(productId)) delete this.selectedProducts[productId];
    }
  }

  // "Zelfde als vorige keer": neemt de keuze van de vorige keer over. De medewerker
  // ziet de aantallen en bevestigt zelf met Registreren.
  repeatLastSelection() {
    this.selectedProducts = { ...this.model.lastSelection(this.selectedEmployeeId) };
    this.renderProductWindow();
    this.focusProductWindowAction();
  }

  // Telt één stuk op bij een gekozen product (de "+"-knop in het productvenster).
  incrementProduct(productId) {
    this.selectedProducts[productId] = (this.selectedProducts[productId] || 0) + 1;
    this.renderProductWindow();
  }

  // Haalt één stuk af van een gekozen product (de "−"-knop), maar nooit onder 0.
  // Zo kan een medewerker een vergissing herstellen zonder opnieuw te beginnen.
  decrementProduct(productId) {
    const current = this.selectedProducts[productId] || 0;
    if (current === 0) return;

    this.selectedProducts[productId] = current - 1;
    this.renderProductWindow();
  }

  // Maakt een korte samenvatting van de keuze, bijvoorbeeld "2× Blikje, 1× Ei".
  selectionSummary() {
    const parts = [];

    for (const [productId, amount] of Object.entries(this.selectedProducts)) {
      if (amount > 0) parts.push(`${amount}× ${this.model.productName(productId)}`);
    }

    return parts.join(", ");
  }

  // Sluit het persoonlijke productvenster en vergeet de keuze. De focus gaat terug naar de
  // medewerkerrij (of knop) waarmee het venster werd geopend.
  closeEmployeeProducts() {
    this.closeModal("#employeeProductsModal");
    this.selectedProducts = {};
    this.selectedEmployeeId = null;
    this.recognizedByFace = false;
  }

  // Slaat alle gekozen producten in één keer op; ieder stuk wordt één registratie.
  // Eerst gaan producten die niet (meer) worden aangeboden uit de keuze.
  //
  // Na het opslaan gaat eerst het venster dicht en wordt daarna de lijst opnieuw getekend.
  // Door het tekenen verdwijnt de oude medewerkerrij waarmee het venster werd geopend; dan krijgt
  // de nieuwe rij van dezelfde medewerker de focus (zie focusEmployeeRow). Zo hoeft iemand met
  // een toetsenbord of schermlezer niet opnieuw te zoeken waar hij was.
  registerSelectedProducts() {
    this.removeUnavailableSelections();
    const amounts = Object.values(this.selectedProducts);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);

    if (!this.selectedEmployeeId || total === 0) {
      // Het venster opnieuw tekenen, zodat de teller op "Registreren" weer klopt.
      if (this.selectedEmployeeId) this.renderProductWindow();
      this.view.showToast("Kies eerst minimaal één product", { tone: "error" });
      return;
    }

    // De samenvatting wordt vóór het opslaan gemaakt, omdat de keuze daarna wordt gewist.
    const message = `${this.employeeLabel(this.selectedEmployeeId)}: ${this.selectionSummary()} geregistreerd`;

    const saved = this.persist(() => {
      for (const [productId, amount] of Object.entries(this.selectedProducts)) {
        for (let count = 0; count < amount; count += 1) {
          this.model.addRegistration(this.selectedEmployeeId, productId);
        }
      }
    });
    if (!saved) return;

    // Onthouden vóór het sluiten: daarna zijn de medewerker en de opener vergeten.
    const employeeId = this.selectedEmployeeId;
    const opener = this.modalOpeners.get(this.view.$("#employeeProductsModal"));
    this.closeEmployeeProducts();
    this.view.renderAll();
    this.focusEmployeeRow(employeeId, opener);

    // Op een gedeelde tablet moet de medewerker kunnen lezen voor wie en wat er is opgeslagen,
    // daarom blijft deze melding langer staan.
    this.view.showToast(message, { tone: "success", duration: 4000 });
  }

  // Zet de focus op de (nieuwe) rij van deze medewerker in de lijst, maar alleen als het element
  // waarmee het productvenster werd geopend niet meer op de pagina staat (de lijst is opnieuw
  // getekend). Staat de opener er nog, zoals de knop "Herken mij", dan heeft closeModal de
  // focus daar al teruggezet. De id wordt met cssAttributeValue veilig gemaakt voor de selector.
  focusEmployeeRow(employeeId, opener) {
    if (opener?.isConnected) return;
    this.view.$(`[data-open-employee="${cssAttributeValue(employeeId)}"]`)?.focus();
  }

  // ------------------------------------------------------------------
  // 4. Beheerder: inloggen, tabbladen, filters en export
  // ------------------------------------------------------------------

  // Opent het loginvenster, of direct het dashboard als de beheerder al is ingelogd.
  // Het venster krijgt de naam van de kop die zichtbaar is ("Welkom terug" of "Overzicht"),
  // zodat een schermlezer altijd de juiste naam voorleest.
  openAdmin() {
    this.openModal("#adminModal");

    if (!this.adminLoggedIn) {
      this.showLogin();
      return;
    }

    this.showDashboard();
  }

  // Toont het loginformulier in het admin-venster. Een oude foutmelding van een eerdere
  // mislukte poging wordt verborgen, zodat het formulier weer schoon begint.
  showLogin() {
    this.hide("#adminView");
    this.hide("#loginError");
    this.show("#loginView");
    this.view.$("#adminModal").setAttribute("aria-labelledby", "adminTitle");
    this.view.$("#loginEmail").focus();
  }

  // Demo-login: ieder ingevuld e-mailadres en wachtwoord wordt geaccepteerd.
  login(event) {
    event.preventDefault();

    const email = this.view.$("#loginEmail").value;
    const password = this.view.$("#loginPassword").value;

    if (email && password) {
      this.hide("#loginError");
      this.adminLoggedIn = true;
      this.showDashboard();
    } else {
      this.show("#loginError");
    }
  }

  // Knop "Uitloggen": de beheerder is uitgelogd en ziet het loginformulier weer.
  logout() {
    this.adminLoggedIn = false;
    this.view.$("#loginPassword").value = "";
    this.showLogin();
  }

  // Sluit het admin-venster (sluitknop, klik op de donkere achtergrond of Escape) en logt de
  // beheerder uit. Op een gedeelde tablet kan de volgende gebruiker anders zonder wachtwoord
  // in het beheerscherm komen. Bij het volgende openen verschijnt dus het loginformulier.
  closeAdmin() {
    this.adminLoggedIn = false;
    this.view.$("#loginPassword").value = "";
    this.closeModal("#adminModal");
  }

  // Toont het dashboard met alle actuele gegevens. De focus gaat naar het actieve tabblad.
  showDashboard() {
    this.auditLogLimit = 20;
    this.hide("#loginView");
    this.show("#adminView");
    this.view.$("#adminModal").setAttribute("aria-labelledby", "dashboardTitle");
    this.view.$(".tab.active")?.focus();
    this.resetCorrectionDate();
    this.view.populateFilters();
    this.view.renderAdmin();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminEmployees();
    this.view.renderAdminProducts();
    this.view.renderAdminCompanies();
    this.view.renderStock();
    this.renderAuditLog();
  }

  // Wisselt naar een ander tabblad in het dashboard.
  switchTab(activeTab) {
    const tabNames = ["registrations", "employees", "products", "companies", "stock", "audit"];
    if (!activeTab) return; // geen bestaand tabblad gevonden (bijvoorbeeld een onbekende naam)

    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    activeTab.classList.add("active");

    for (const name of tabNames) {
      this.view.$(`#${name}Tab`).classList.toggle("hidden", activeTab.dataset.tab !== name);
    }
  }

  // Toont 20 extra regels in het logboek.
  loadMoreAudit() {
    this.auditLogLimit += 20;
    this.renderAuditLog();
  }

  // Laat CsvExport het bestand maken met de gekozen filters.
  exportCsv() {
    // Alleen voor een ingelogde beheerder (de knop staat in het beheer, maar zo kan de export ook
    // niet via een andere weg worden gestart).
    if (!this.adminLoggedIn) return;
    const selectedEmployee = this.view.$("#filterEmployee").value;
    const selectedMonth = this.view.$("#filterMonth").value;

    const exported = this.csvExport.download(selectedEmployee, selectedMonth);
    if (!exported) {
      this.view.showToast("Geen registraties om te exporteren voor deze filters.", { tone: "error" });
    }
  }

  // Knop "Alle gegevens wissen" in het tabblad Logboek. De tablet wordt door iedereen gedeeld en
  // bewaart persoonsgegevens (namen, personeelsnummers, wat iemand heeft geregistreerd). Volgens
  // de AVG moet je die kunnen wissen (recht op vergetelheid), bijvoorbeeld als de tablet stopt of
  // naar een andere plek gaat. Omdat dit niet ongedaan kan worden gemaakt, wordt er twee keer om
  // bevestiging gevraagd. Daarna wordt de beheerder uitgelogd en staan de demogegevens er weer.
  wipeAllData() {
    // Alleen voor een ingelogde beheerder: wissen kan niet ongedaan worden gemaakt.
    if (!this.adminLoggedIn) return;
    const firstQuestion = "Alle medewerkers, registraties, producten, voorraad, het logboek en de reservekopieën op deze tablet wissen?";
    if (!window.confirm(firstQuestion)) return;
    if (!window.confirm("Weet je het zeker? Dit kan niet ongedaan worden gemaakt.")) return;

    this.model.wipeAll();
    // De nieuwe demogegevens direct opslaan. Andere open tabbladen krijgen zo een melding van de
    // browser en laden de lege demo in; anders zouden zij bij hun volgende wijziging de oude
    // gegevens terugschrijven. Lukt opslaan niet, dan is wel alles gewist, maar staan de
    // demogegevens nog niet in de opslag; dat wordt dan eerlijk gemeld.
    const saved = this.model.save();
    // Ingestelde gezichten (demo) horen ook bij de persoonsgegevens en worden vergeten.
    this.faceDemo.enrolledIds().forEach((employeeId) => this.faceDemo.forget(employeeId));
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
    if (saved) {
      this.view.showToast("Alle gegevens zijn gewist. De demogegevens staan er weer.", { tone: "success", duration: 4000 });
    } else {
      this.view.showToast("De gegevens zijn gewist, maar de demogegevens konden niet worden opgeslagen. Herlaad de pagina.", { tone: "error", duration: 6000 });
    }
  }

  // Wist de zoekterm en het bedrijfsfilter, zodat alle medewerkers weer zichtbaar zijn
  // (knop in de lege toestand "Geen medewerker gevonden").
  clearSearch() {
    const search = this.view.$("#employeeSearch");
    search.value = "";
    delete this.view.$("#employeeCompanyFilter").dataset.value;
    this.view.renderAll();
    search.focus();
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
  // Bij "Alle bedrijven" blijft het veld leeg, zodat de grijze voorbeeldtekst weer zichtbaar is
  // (net als bij het starten) en je direct een bedrijfsnaam kunt typen.
  // Door het typen kunnen bedrijven in de keuzelijst verborgen zijn; die worden weer getoond,
  // zodat bij het volgende openen alle bedrijven te kiezen zijn.
  selectCompanyFilterOption(option) {
    const filter = this.view.$("#employeeCompanyFilter");
    const value = option.dataset.companyValue;
    filter.dataset.value = value;
    filter.value = value === "all" ? "" : option.textContent;
    this.filterCompanyOptions("#companyFilterOptions", "");
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
    this.view.clearFieldErrors(form);
    this.view.populateEmployeeCompanySelects();
    delete form.dataset.editingId;

    this.show("#employeeSaveContinueButton");
    this.view.$("#employeeFormTitle").textContent = "Medewerker toevoegen";
    this.view.$("#employeeFormHelp").textContent = "Vul de gegevens in en kies daarna hoe je verder wilt gaan.";
    this.openModal("#employeeFormModal");
    this.view.$("#newEmployeeFirstName").focus();
  }

  // Opent het medewerkersformulier, gevuld met de gegevens van een bestaande medewerker.
  // Bestaat de medewerker niet meer (verwijderd in een ander tabblad), dan volgt een melding
  // en blijft het formulier dicht. Er wordt een kopie van de medewerker onthouden, zodat het
  // formulier sluit als een ander tabblad deze medewerker intussen wijzigt (zie closeStaleForms).
  openEditEmployeeForm(employeeId) {
    const employee = this.model.findEmployee(employeeId);
    if (!employee) {
      this.showMissing("Deze medewerker");
      return;
    }
    this.view.clearFieldErrors(this.view.$("#employeeForm"));

    this.view.$("#employeeForm").dataset.editingId = employee.id;
    this.rememberEditing("#employeeForm", employee);
    this.hide("#employeeSaveContinueButton");
    this.view.$("#employeeFormTitle").textContent = "Medewerker wijzigen";
    this.view.$("#employeeFormHelp").textContent = "Pas de gegevens aan en klik daarna op Opslaan.";
    this.view.$("#newEmployeeFirstName").value = employee.firstName;
    this.view.$("#newEmployeeLastName").value = employee.lastName;
    this.view.$("#newEmployeePayrollCode").value = employee.payrollCode;
    this.view.$("#newEmployeePersonnelNumber").value = employee.personnelNumber;
    this.view.$("#newEmployeeEmployerNumber").value = employee.employerNumber || "";
    this.view.populateEmployeeCompanySelects(employee.companyId, employee.pointId);
    this.openModal("#employeeFormModal");
    this.view.$("#newEmployeeFirstName").focus();
    this.view.showToast("Gegevens geladen om te wijzigen");
  }

  // Sluit het medewerkersformulier zonder de admin-modal te sluiten.
  closeEmployeeForm() {
    this.closeModal("#employeeFormModal");
  }

  // Een wijzigformulier is nog open, maar het gegeven is intussen in een ander tabblad
  // verwijderd. Opslaan zou het dan opnieuw aanmaken of niets doen; daarom wordt er niets
  // opgeslagen, krijgt de gebruiker een melding en gaat het formulier dicht.
  // `subject` is bijvoorbeeld "Dit product"; `close` is de sluitactie van het formulier.
  closeStaleForm(form, subject, close) {
    this.showMissing(subject);
    form.reset();
    delete form.dataset.editingId;
    close();
  }

  // Leest het medewerkersformulier en voegt een medewerker toe of wijzigt een bestaande.
  // Een personeelsnummer mag maar bij één medewerker horen, anders weet de loonadministratie
  // niet bij wie een registratie hoort. Twee medewerkers met dezelfde naam mag wel.
  // Is de medewerker die gewijzigd wordt intussen verwijderd, dan wordt er niets opgeslagen.
  // Hetzelfde geldt als het gekozen bedrijf of consumptiepunt niet meer bestaat (zie
  // validateEmployeeAssignment).
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

    const form = this.view.$("#employeeForm");
    const editingId = form.dataset.editingId;
    if (editingId && !this.model.findEmployee(editingId)) {
      this.closeStaleForm(form, "Deze medewerker", () => this.closeEmployeeForm());
      return;
    }
    if (!this.validateRequiredFields(form)) return;
    if (!this.validateNumberFields(["#newEmployeePayrollCode", "#newEmployeePersonnelNumber", "#newEmployeeEmployerNumber"])) return;

    // De medewerker die nu wordt gewijzigd, telt niet mee: die mag zijn eigen nummer houden.
    const numberTaken = this.model.employees.some(
      (employee) => employee.id !== editingId && String(employee.personnelNumber) === employeeData.personnelNumber
    );
    if (numberTaken) {
      const numberField = this.view.$("#newEmployeePersonnelNumber");
      this.view.showFieldError(numberField, "Er is al een medewerker met dit personeelsnummer.");
      numberField.focus();
      return;
    }
    if (!this.validateEmployeeAssignment(employeeData)) return;

    // Het model geeft false terug als er toch niets kon worden opgeslagen; persist meldt dat dan.
    const fullName = `${employeeData.firstName} ${employeeData.lastName}`;
    const saved = this.persist(
      () => (editingId
        ? this.model.updateEmployee(editingId, employeeData)
        : this.model.addEmployee(employeeData)),
      { action: editingId ? "Medewerker gewijzigd" : "Medewerker toegevoegd", details: fullName }
    );
    if (!saved) return;

    form.reset();
    delete form.dataset.editingId;
    this.view.populateFilters();
    this.view.renderAdminEmployees();
    this.view.renderCorrectionEmployees();
    this.view.renderAdmin(); // een nieuwe naam moet ook in de registratietabel staan
    this.view.renderAdminCompanies();
    this.renderAuditLog();
    this.view.renderAll();
    this.view.showToast(editingId ? "Medewerker gewijzigd" : "Medewerker toegevoegd", { tone: "success" });

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

  // Bestaan het gekozen bedrijf en consumptiepunt nog, en hoort het punt bij dat bedrijf?
  // Het formulier kan al open hebben gestaan terwijl een ander tabblad het bedrijf of punt
  // verwijderde. Dan krijgt het veld een foutmelding, worden de keuzelijsten opnieuw gevuld
  // met wat er nu is, en wordt er niets opgeslagen. Geen bedrijf of geen punt kiezen mag wel
  // (dan staat het veld leeg). Geeft true terug als alles klopt.
  validateEmployeeAssignment({ companyId, pointId }) {
    if (companyId && !this.model.findCompany(companyId)) {
      this.view.populateEmployeeCompanySelects();
      const companyField = this.view.$("#newEmployeeCompany");
      this.view.showFieldError(companyField, "Dit bedrijf bestaat niet meer. Kies opnieuw.");
      companyField.focus();
      return false;
    }

    const point = this.model.findPoint(pointId);
    if (pointId && point?.companyId !== companyId) {
      this.view.populateEmployeePointSelect();
      const pointField = this.view.$("#newEmployeePoint");
      this.view.showFieldError(pointField, "Dit consumptiepunt bestaat niet meer of hoort niet bij dit bedrijf. Kies opnieuw.");
      pointField.focus();
      return false;
    }
    return true;
  }

  // Opent een leeg formulier om een product toe te voegen.
  openProductForm() {
    const form = this.view.$("#productForm");
    form.reset();
    this.view.clearFieldErrors(form);
    delete form.dataset.editingId;

    this.show("#consumptionSaveContinueButton");
    this.view.$("#productFormTitle").textContent = "Product toevoegen";
    this.view.$("#productFormHelp").textContent = "Vul de productnaam en prijs in.";
    this.openModal("#productFormModal");
    this.view.$("#productName").focus();
  }

  // Opent het productformulier, gevuld met een bestaand product.
  // Bestaat het product niet meer (verwijderd in een ander tabblad), dan volgt een melding.
  // Er wordt een kopie van het product onthouden (zie rememberEditing en closeStaleForms).
  openEditProductForm(productId) {
    const product = this.model.findProduct(productId);
    if (!product) {
      this.showMissing("Dit product");
      return;
    }
    this.view.clearFieldErrors(this.view.$("#productForm"));

    this.view.$("#productName").value = product.name;
    this.view.$("#productPrice").value = product.price;
    this.view.$("#productForm").dataset.editingId = product.id;
    this.rememberEditing("#productForm", product);
    this.view.$("#productFormTitle").textContent = "Product wijzigen";
    this.view.$("#productFormHelp").textContent = "Pas de productnaam of prijs aan.";
    this.openModal("#productFormModal");
    this.hide("#consumptionSaveContinueButton");
    this.view.$("#productName").focus();
  }

  closeProductForm() {
    this.closeModal("#productFormModal");
  }

  // Leest het productformulier en voegt een product toe of wijzigt een bestaand product.
  // Is het product dat gewijzigd wordt intussen verwijderd, dan wordt er niets opgeslagen
  // (anders zou het met dezelfde id opnieuw worden aangemaakt).
  saveProduct(event) {
    event.preventDefault();

    const form = this.view.$("#productForm");
    const editingId = form.dataset.editingId;
    if (editingId && !this.model.findProduct(editingId)) {
      this.closeStaleForm(form, "Dit product", () => this.closeProductForm());
      return;
    }

    const productData = {
      id: editingId || createId(),
      name: this.view.$("#productName").value.trim(),
      price: this.view.$("#productPrice").value
    };
    if (!this.validateRequiredFields(form)) return;

    // Een prijs ligt tussen 0 en 1000 euro (MAX_PRICE) en heeft hooguit twee decimalen (hele
    // centen), bijvoorbeeld 0.65. Een hogere prijs zou na herladen verdwijnen (zie isValidPrice).
    const priceField = this.view.$("#productPrice");
    if (!RegistrationApp.isValidPrice(productData.price)) {
      this.view.showFieldError(priceField, `Vul een prijs van 0 tot en met ${MAX_PRICE} euro in, met hooguit twee decimalen.`);
      priceField.focus();
      return;
    }

    const nameTaken = this.model.products.some(
      (product) => product.id !== editingId && product.name.toLowerCase() === productData.name.toLowerCase()
    );
    if (nameTaken) {
      this.showDuplicateNameError("#productName", "Er bestaat al een product met deze naam.");
      return;
    }

    const saved = this.persist(
      () => this.model.saveProduct(productData),
      { action: editingId ? "Product gewijzigd" : "Product toegevoegd", details: productData.name }
    );
    if (!saved) return;

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
  // Bij wijzigen wordt een kopie van het bedrijf onthouden (zie rememberEditing en closeStaleForms).
  openCompanyForm(company = null) {
    const form = this.view.$("#companyForm");
    form.reset();
    this.view.clearFieldErrors(form);
    if (company) {
      form.dataset.editingId = company.id;
      this.rememberEditing("#companyForm", company);
    } else {
      delete form.dataset.editingId;
    }

    this.view.$("#companyFormTitle").textContent = company ? "Bedrijf wijzigen" : "Bedrijf toevoegen";
    this.view.$("#companyName").value = company?.name || "";
    this.view.$("#companyEmployerNumber").value = company?.employerNumber || "";
    this.openModal("#companyFormModal");
    this.view.$("#companyName").focus();
  }

  // Knop "Wijzigen" bij een bedrijf. Bestaat het bedrijf niet meer (verwijderd in een ander
  // tabblad), dan volgt een melding; anders zou er per ongeluk een leeg "toevoegen"-formulier openen.
  openEditCompanyForm(companyId) {
    const company = this.model.findCompany(companyId);
    if (!company) {
      this.showMissing("Dit bedrijf");
      return;
    }
    this.openCompanyForm(company);
  }

  // Sluit het bedrijfsformulier (en zet de focus terug op de knop waarmee het werd geopend).
  closeCompanyForm() {
    this.closeModal("#companyFormModal");
  }

  // Leest het bedrijfsformulier en voegt een bedrijf toe of wijzigt een bestaand bedrijf.
  // Is het bedrijf dat gewijzigd wordt intussen verwijderd, dan wordt er niets opgeslagen.
  saveCompany(event) {
    event.preventDefault();

    const form = this.view.$("#companyForm");
    const editingId = form.dataset.editingId;
    if (editingId && !this.model.findCompany(editingId)) {
      this.closeStaleForm(form, "Dit bedrijf", () => this.closeCompanyForm());
      return;
    }

    const name = this.view.$("#companyName").value.trim();
    const employerNumber = this.view.$("#companyEmployerNumber").value.trim();
    if (!this.validateRequiredFields(form)) return;
    if (!this.validateNumberFields(["#companyEmployerNumber"])) return;

    const nameTaken = this.model.companies.some(
      (company) => company.id !== editingId && company.name.toLowerCase() === name.toLowerCase()
    );
    if (nameTaken) {
      this.showDuplicateNameError("#companyName", "Er bestaat al een bedrijf met deze naam.");
      return;
    }

    const saved = this.persist(
      () => this.model.saveCompany({ id: editingId, name, employerNumber }),
      { action: editingId ? "Bedrijf gewijzigd" : "Bedrijf toegevoegd", details: name }
    );
    if (!saved) return;

    this.closeCompanyForm();
    this.finishAdminChange(editingId ? "Bedrijf gewijzigd" : "Bedrijf toegevoegd");
  }

  // Opent het consumptiepuntformulier: leeg voor een bedrijf, of gevuld om te wijzigen.
  // Bij wijzigen wordt een kopie van naam, bedrijf en aanbod onthouden, zodat het formulier
  // sluit als een ander tabblad die intussen wijzigt (zie rememberEditing en closeStaleForms).
  openPointForm(point = null, companyId = "") {
    const form = this.view.$("#pointForm");
    form.reset();
    this.view.clearFieldErrors(form);
    if (point) {
      form.dataset.editingId = point.id;
      this.rememberEditing("#pointForm", point);
    } else {
      delete form.dataset.editingId;
    }

    this.view.$("#pointFormTitle").textContent = point ? "Consumptiepunt wijzigen" : "Consumptiepunt toevoegen";
    this.view.renderPointForm(point, companyId);
    this.openModal("#pointFormModal");
    this.view.$("#pointName").focus();
  }

  // Knop "Aanbod wijzigen" bij een consumptiepunt. Bestaat het punt niet meer (verwijderd in
  // een ander tabblad), dan volgt een melding in plaats van een leeg formulier.
  openEditPointForm(pointId) {
    const point = this.model.findPoint(pointId);
    if (!point) {
      this.showMissing("Dit consumptiepunt");
      return;
    }
    this.openPointForm(point);
  }

  // Sluit het consumptiepuntformulier (en zet de focus terug op de knop waarmee het werd geopend).
  closePointForm() {
    this.closeModal("#pointFormModal");
  }

  // Leest het consumptiepuntformulier (naam, bedrijf en aangevinkte producten) en slaat het op.
  // Is het punt dat gewijzigd wordt intussen verwijderd, dan wordt er niets opgeslagen.
  // Hetzelfde geldt als het gekozen bedrijf intussen in een ander tabblad is verwijderd: dan
  // krijgt het bedrijfsveld een foutmelding en wordt de keuzelijst opnieuw gevuld.
  savePoint(event) {
    event.preventDefault();

    const form = this.view.$("#pointForm");
    const editingId = form.dataset.editingId;
    if (editingId && !this.model.findPoint(editingId)) {
      this.closeStaleForm(form, "Dit consumptiepunt", () => this.closePointForm());
      return;
    }

    const checkedBoxes = form.querySelectorAll('input[name="offeredProduct"]:checked');
    const pointData = {
      id: editingId,
      name: this.view.$("#pointName").value.trim(),
      companyId: this.view.$("#pointCompany").value,
      offeredProductIds: [...checkedBoxes].map((checkbox) => checkbox.value)
    };
    if (!this.validateRequiredFields(form)) return;

    if (!this.model.findCompany(pointData.companyId)) {
      this.view.populatePointCompanySelect();
      const companyField = this.view.$("#pointCompany");
      this.view.showFieldError(companyField, "Dit bedrijf bestaat niet meer. Kies opnieuw.");
      companyField.focus();
      return;
    }

    const nameTaken = this.model.pointsForCompany(pointData.companyId).some(
      (point) => point.id !== editingId && point.name.toLowerCase() === pointData.name.toLowerCase()
    );
    if (nameTaken) {
      this.showDuplicateNameError("#pointName", "Dit bedrijf heeft al een consumptiepunt met deze naam.");
      return;
    }

    // Medewerkers blijven aan hun punt gekoppeld; verhuist het punt naar een ander bedrijf,
    // dan verhuizen zij mee. moveEmployeesOfPoint verandert alleen het bedrijf van die
    // medewerkers, zodat hun overige gegevens (zoals oude namen) precies blijven zoals ze waren.
    // Geeft het model false terug (niets opgeslagen), dan geeft deze functie ook false terug;
    // persist meldt dat dan en slaat niets op.
    const companyName = this.model.companyName(pointData.companyId);
    const productCount = pointData.offeredProductIds.length;
    const saved = this.persist(
      () => {
        if (!this.model.savePoint(pointData)) return false;
        if (editingId) this.model.moveEmployeesOfPoint(editingId, pointData.companyId);
        return true;
      },
      {
        action: editingId ? "Consumptiepunt gewijzigd" : "Consumptiepunt toegevoegd",
        details: `${pointData.name} (${companyName}), ${productCount} producten aangeboden`
      }
    );
    if (!saved) return;

    this.closePointForm();
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

  // Is dit een tweede tik op dezelfde knop "Toevoegen" vlak (binnen 800 ms) na een geboekte
  // levering? Na het boeken wordt de voorraadtabel opnieuw getekend en is het aantalveld leeg.
  // Een snelle dubbele tik op de tablet zou dan op dat lege veld vallen en de misleidende
  // foutmelding "Vul een geleverd aantal van minimaal 1 in" geven. Zo'n tik wordt genegeerd.
  isRepeatedDeliveryTap(productId, now = Date.now()) {
    return this.lastDelivery?.productId === productId && now - this.lastDelivery.time < 800;
  }

  // Boekt een levering: het ingevulde aantal (1 tot en met 100.000) komt bij de voorraad.
  bookDelivery(productId) {
    if (this.isRepeatedDeliveryTap(productId)) return;

    const pointId = this.view.$("#stockPointSelect").value;
    // Bestaat het punt of het product niet meer (verwijderd in een ander tabblad), dan wordt er
    // niets geboekt; anders zou het logboek een levering tonen die de voorraad niet veranderde.
    if (!this.model.stockEntry(pointId, productId)) {
      this.showMissing("Dit consumptiepunt of product");
      return;
    }
    const amountField = this.view.$(`[data-delivery-amount="${cssAttributeValue(productId)}"]`);
    const amount = Number(amountField?.value);

    if (!Number.isInteger(amount) || amount <= 0) {
      this.view.showToast("Vul een geleverd aantal van minimaal 1 in", { tone: "error" });
      return;
    }
    if (amount > MAX_STOCK_AMOUNT) {
      this.view.showToast("Vul een geleverd aantal van hooguit 100.000 in", { tone: "error" });
      return;
    }

    const productName = this.model.productName(productId);
    const saved = this.persist(
      () => this.model.changeStock(pointId, productId, amount),
      { action: "Levering geboekt", details: `${amount} × ${productName} op ${this.pointLabel(pointId)}` }
    );
    if (!saved) return;

    this.lastDelivery = { productId, time: Date.now() };
    this.finishAdminChange("Levering toegevoegd aan de voorraad");
  }

  // Slaat een gewijzigde voorraad (na tellen) of een gewijzigd minimum direct op.
  // Beide moeten een heel getal van 0 tot en met 100.000 zijn: een negatieve telling kan niet
  // (door registraties kan de voorraad wel onder 0 komen; dat is zo bedoeld).
  // De tabel wordt daarna niet opnieuw getekend: alleen het statuslabel en de bijbestellijst
  // veranderen. Zo blijft de focus staan als de beheerder met Tab naar het volgende veld gaat.
  // Bestaat het punt of het product niet meer (verwijderd in een ander tabblad), dan wordt er
  // niets opgeslagen en komt er geen regel in het logboek, net als bij bookDelivery.
  saveStockField(input) {
    const pointId = this.view.$("#stockPointSelect").value;
    const productId = input.dataset.productId;
    const field = input.dataset.stockField === "stock" ? "stock" : "minimum";
    const isStock = field === "stock";
    const value = Number(input.value);
    // Zet het veld terug op de opgeslagen waarde (na een foute invoer of mislukt opslaan).
    // Bestaat de voorraadregel niet meer, dan wordt het veld leeg.
    const resetInput = () => {
      input.value = this.model.stockEntry(pointId, productId)?.[field] ?? "";
    };

    if (!this.model.stockEntry(pointId, productId)) {
      this.showMissing("Dit consumptiepunt of product");
      resetInput();
      return;
    }

    let error = null;
    if (input.value.trim() === "" || !Number.isInteger(value)) {
      error = isStock ? "Vul een geheel aantal in" : "Vul een geheel aantal van 0 of hoger in";
    } else if (value < 0) {
      error = "Vul een geheel aantal van 0 of hoger in";
    } else if (value > MAX_STOCK_AMOUNT) {
      error = "Vul een aantal van hooguit 100.000 in";
    }
    if (error) {
      this.view.showToast(error, { tone: "error" });
      resetInput();
      return;
    }

    const saved = this.persist(
      () => {
        if (isStock) this.model.setStock(pointId, productId, value);
        else this.model.setMinimum(pointId, productId, value);
      },
      {
        action: isStock ? "Voorraad geteld" : "Minimum gewijzigd",
        details: `${this.model.productName(productId)} op ${this.pointLabel(pointId)}: ${value}`
      }
    );
    if (!saved) {
      resetInput();
      return;
    }

    this.finishAdminChange(isStock ? "Voorraad bijgewerkt" : "Minimum bijgewerkt", { redrawStockTable: false });
    this.view.renderStockAlerts();
    this.view.updateStockStatus(pointId, productId);
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

    // Wijzigingen die een ander tabblad in dezelfde browser opslaat.
    window.addEventListener("storage", (event) => this.handleStorageChange(event));
  }

  // Hulpfunctie: voert `action` uit bij een klik op het element met deze selector.
  onClick(selector, action) {
    this.view.$(selector).addEventListener("click", action);
  }

  // Hulpfunctie: sluit een venster bij een klik op de sluitknoppen of op de donkere achtergrond.
  // De sluitactie wordt ook onthouden, zodat de Escape-toets hetzelfde venster kan sluiten.
  // Het venster sluit alleen als de muisknop óók op de achtergrond werd ingedrukt. Selecteert
  // iemand tekst in een invoerveld en laat hij de muis los boven de achtergrond, dan telt de
  // browser dat als klik op de achtergrond; zonder deze controle gaat de invoer dan verloren.
  registerModalClose(modalSelector, closeButtonSelector, closeAction) {
    document.querySelectorAll(closeButtonSelector).forEach((button) => {
      button.addEventListener("click", closeAction);
    });

    const modal = this.view.$(modalSelector);
    let pressedOnBackdrop = false;
    modal.addEventListener("mousedown", (event) => {
      pressedOnBackdrop = event.target === modal;
    });
    modal.addEventListener("click", (event) => {
      if (event.target === modal && pressedOnBackdrop) closeAction();
      pressedOnBackdrop = false;
    });

    this.modalCloseActions.set(modal, closeAction);
  }

  // Het bovenste venster dat nu open is, of null. Vensters die later in index.html staan,
  // liggen boven eerdere vensters (bijvoorbeeld het cameravenster boven het productvenster).
  topModal() {
    const openModals = [...document.querySelectorAll(".modal-backdrop:not(.hidden)")];
    return openModals.at(-1) || null;
  }

  // Houdt de Tab-toets binnen het bovenste venster: na het laatste element springt de focus
  // naar het eerste, en met Shift+Tab andersom. Zo komt de focus niet achter het venster.
  keepFocusInModal(event, modal) {
    const focusable = [...modal.querySelectorAll("button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex='-1'])")]
      .filter((element) => !element.disabled && element.getClientRects().length > 0);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable.at(-1);
    const focusOutside = !modal.contains(document.activeElement);

    if (event.shiftKey && (document.activeElement === first || focusOutside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || focusOutside)) {
      event.preventDefault();
      first.focus();
    }
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
  registerKeyboardEvents() {
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

  // ------------------------------------------------------------------
  // 8. Demo gezichtsherkenning
  // ------------------------------------------------------------------

  // Knop "Herken mij met de camera (demo)" op de beginpagina.
  // Alleen actieve medewerkers kunnen worden herkend. Is er alleen een gezicht ingesteld van een
  // gedeactiveerde medewerker, dan opent de camera niet (dat gezicht blijft wel bewaard, zodat het
  // na opnieuw activeren weer werkt).
  startFaceRecognition() {
    const hasActiveFace = this.faceDemo.enrolledIds().some((id) => this.model.findEmployee(id)?.active);
    if (!hasActiveFace) {
      this.view.showToast(
        "Er is nog niemand ingesteld voor gezichtsherkenning. Kies je naam en zet het aan in het productvenster.",
        { tone: "error", duration: 5000 }
      );
      return;
    }
    this.openFaceModal("recognize");
  }

  // Link "Gezichtsherkenning instellen (demo)" in het productvenster van een medewerker.
  startFaceEnrollment() {
    this.openFaceModal("enroll", this.selectedEmployeeId);
  }

  // Link "Uitzetten": vergeet het gezicht van deze medewerker.
  forgetFace() {
    this.faceDemo.forget(this.selectedEmployeeId);
    this.renderProductWindow();
    this.focusProductWindowAction();
    this.view.showToast("Gezichtsherkenning staat uit voor deze medewerker.", { tone: "success" });
  }

  // Toont een statustekst in het cameravenster ("info" of "error").
  setFaceStatus(message, tone = "info") {
    const status = this.view.$("#faceStatus");
    status.textContent = message;
    status.dataset.tone = tone;
  }

  // Opent het cameravenster om te herkennen ("recognize") of om een gezicht in te stellen ("enroll").
  // Iedere keer openen krijgt een nieuw sessienummer; sluit de gebruiker het venster terwijl er
  // nog geladen wordt, dan ziet de code aan het nummer dat ze moet stoppen.
  async openFaceModal(mode, employeeId = null) {
    this.faceSession += 1;
    const session = this.faceSession;
    this.faceMode = mode;
    this.faceEmployeeId = employeeId;
    this.cameraReady = false;

    const enrolling = mode === "enroll";
    const name = enrolling ? this.employeeLabel(employeeId) : "";
    this.view.$("#faceTitle").textContent = enrolling ? `Gezichtsherkenning instellen voor ${name}` : "Herken mij";
    this.view.$("#faceHelp").textContent = enrolling
      ? "Plaats je gezicht binnen het kader. Zet het vinkje en klik op Gezicht vastleggen."
      : "Plaats je gezicht binnen het kader en kijk recht in de camera.";
    this.view.$("#faceConsent").checked = false;
    this.view.$("#faceConsentLabel").classList.toggle("hidden", !enrolling);
    this.view.$("#faceEnrollButton").classList.toggle("hidden", !enrolling);
    this.view.$("#faceEnrollButton").disabled = true;
    this.openModal("#faceModal");
    // Focus in het venster: bij instellen op het toestemmingsvinkje, bij herkennen op "Annuleren".
    this.view.$(enrolling ? "#faceConsent" : "#faceModal .employee-form-actions [data-close-face-modal]")?.focus();

    const video = this.view.$("#faceVideo");
    this.setFaceStatus("Herkenningsmodel laden. De eerste keer kan dit even duren.");

    try {
      await this.faceDemo.load();
    } catch (error) {
      if (session === this.faceSession) {
        this.setFaceStatus("De demo kon niet worden geladen. Herlaad de pagina en probeer het opnieuw.", "error");
      }
      return;
    }
    if (session !== this.faceSession) return;

    this.setFaceStatus("Camera starten…");
    try {
      // Is het venster gesloten terwijl de camera startte, dan zet startCamera hem zelf weer uit.
      const started = await this.faceDemo.startCamera(video, () => session === this.faceSession);
      if (!started) return;
    } catch (error) {
      // Ging het mis nadat de camera al aan stond (bijvoorbeeld omdat video.play() mislukte),
      // dan wordt de camera hier uitgezet; anders blijft het cameralampje branden.
      // Alleen bij de huidige sessie: is het venster intussen gesloten, dan heeft closeFaceModal
      // de camera al uitgezet, en een nieuw geopend venster moet zijn eigen camera houden.
      if (session === this.faceSession) {
        this.faceDemo.stopCamera(video);
        this.setFaceStatus("Geen toegang tot de camera. Geef toestemming in de browser, of kies je naam in de lijst.", "error");
      }
      return;
    }
    // Is het venster daarna nog gesloten? Dan heeft closeFaceModal de camera al uitgezet.
    if (session !== this.faceSession) return;

    if (enrolling) {
      // Pas nu de camera echt aan staat, kan "Gezicht vastleggen" aan (als het vinkje staat).
      this.cameraReady = true;
      this.updateEnrollButton();
      this.setFaceStatus("Camera staat aan.");
    } else {
      this.scanForFace(session);
    }
  }

  // Zet de knop "Gezicht vastleggen" aan of uit. De knop werkt alleen als de medewerker
  // toestemming heeft gegeven (vinkje) én de camera echt aan staat. Zo kan er niets worden
  // vastgelegd terwijl het model nog laadt of als de camera niet werkt. Tijdens het vastleggen
  // blijft de knop uit, zodat er niet twee keer tegelijk kan worden vastgelegd.
  updateEnrollButton() {
    const consentGiven = this.view.$("#faceConsent").checked;
    this.view.$("#faceEnrollButton").disabled = !(consentGiven && this.cameraReady && !this.capturing);
  }

  // Kijkt steeds opnieuw of er een bekend gezicht in beeld is, tot iemand is herkend,
  // het venster wordt gesloten of de tijd (FACE_DEMO.scanTimeoutMs) om is.
  async scanForFace(session) {
    const video = this.view.$("#faceVideo");
    const deadline = Date.now() + this.faceDemo.settings.scanTimeoutMs;
    this.setFaceStatus("Zoeken naar een bekend gezicht…");
    this.faceDemo.resetConfirmation();

    while (session === this.faceSession && Date.now() < deadline) {
      const descriptor = await this.faceDemo.readFace(video);
      if (session !== this.faceSession) return;

      // Pas als dezelfde actieve medewerker twee keer achter elkaar is gevonden, telt het.
      const match = descriptor ? this.faceDemo.findMatch(descriptor) : null;
      const candidate = match && this.model.findEmployee(match)?.active ? match : null;
      const employeeId = this.faceDemo.confirm(candidate);
      if (employeeId) {
        this.closeFaceModal();
        this.openEmployeeProducts(employeeId, { recognized: true });
        return;
      }

      let status = "Geen gezicht in beeld. Plaats je gezicht binnen het kader.";
      if (candidate) status = "Bijna herkend. Blijf even rustig in het kader kijken.";
      else if (descriptor) status = "Gezicht gevonden, maar niet herkend. Blijf rustig in het kader kijken.";
      this.setFaceStatus(status);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (session === this.faceSession) {
      this.setFaceStatus("Niet herkend. Sluit dit venster en kies je naam in de lijst.", "error");
    }
  }

  // Knop "Gezicht vastleggen": leest het gezicht (een paar pogingen) en onthoudt het voor deze medewerker.
  // Het lezen duurt even. Vlak voor het onthouden wordt daarom opnieuw gecontroleerd of het
  // venster nog open is en of het toestemmingsvinkje nog staat; is het vinkje intussen
  // weggehaald, dan wordt het gezicht niet onthouden (privacy).
  //
  // Het sessienummer van het vastleggen wordt bewaard in captureSession. "capturing" (zie de
  // getter bovenaan) is alleen waar als dat nummer bij het venster hoort dat nu open is.
  async captureEnrollment() {
    if (this.capturing) return;

    const session = this.faceSession;
    this.captureSession = session;
    this.updateEnrollButton();
    this.setFaceStatus("Gezicht vastleggen…");

    // Het gezicht lezen kan even duren; "capturing" staat ondertussen aan en gaat daarna
    // (ook als het misgaat of het venster sluit) altijd weer uit. Is er intussen in een nieuw
    // venster een nieuwe vastlegging gestart, dan blijft die van het nieuwe venster staan.
    let descriptor = null;
    try {
      descriptor = await this.readFaceForEnrollment(session);
    } finally {
      if (this.captureSession === session) this.captureSession = null;
    }

    // Is het venster intussen gesloten (en misschien al opnieuw geopend)? Dan niets onthouden,
    // maar de knop van het nieuwe venster wel weer goed zetten.
    if (session !== this.faceSession) {
      this.updateEnrollButton();
      return;
    }

    if (!descriptor) {
      this.setFaceStatus("Geen gezicht gevonden. Plaats je gezicht binnen het kader en probeer het opnieuw.", "error");
      this.updateEnrollButton();
      return;
    }

    if (!this.view.$("#faceConsent").checked) {
      this.setFaceStatus("Er is niets vastgelegd, omdat het vinkje voor toestemming niet meer staat.", "error");
      this.updateEnrollButton();
      return;
    }

    this.faceDemo.enroll(this.faceEmployeeId, descriptor);
    const name = this.employeeLabel(this.faceEmployeeId);
    this.closeFaceModal();
    this.renderProductWindow();
    this.focusProductWindowAction();
    this.view.showToast(`Gezichtsherkenning staat aan voor ${name}, alleen tijdens deze sessie.`, { tone: "success", duration: 4000 });
  }

  // Probeert een paar keer een gezicht te lezen voor het instellen. Geeft de descriptor terug,
  // of null als er geen gezicht is gevonden of als het venster intussen is gesloten.
  async readFaceForEnrollment(session) {
    const video = this.view.$("#faceVideo");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const descriptor = await this.faceDemo.readFace(video);
      if (session !== this.faceSession) return null;
      if (descriptor) return descriptor;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return null;
  }

  // Sluit het cameravenster en zet de camera uit. Een lopende zoektocht stopt vanzelf,
  // omdat het sessienummer verandert. De focus gaat terug naar de knop of link waarmee het
  // venster werd geopend (zie closeModal).
  closeFaceModal() {
    this.faceSession += 1;
    this.cameraReady = false;
    this.faceDemo.stopCamera(this.view.$("#faceVideo"));
    this.closeModal("#faceModal");
  }
}
