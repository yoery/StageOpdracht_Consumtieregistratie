import { BadgeReader } from "../BadgeReader.js";
import { createId } from "../ids.js";
// Hoogste productprijs (1000 euro). Moet gelijk zijn aan MAX_PRICE in DataStore.js; de constante
// staat in het model, zodat het model en het productformulier dezelfde grens gebruiken.
import { MAX_PRICE } from "../RegistrationModel.js";

/**
 * FormController — de vier beheerformulieren: medewerker, product, bedrijf en consumptiepunt
 * (toevoegen en wijzigen).
 *
 * Verantwoordelijkheid:
 *   - een formulier leeg of gevuld openen, met de juiste titel, uitleg en opslagknoppen;
 *   - de invoer controleren (verplichte velden, alleen cijfers, prijs, dubbele namen en nummers,
 *     pasnummer, bedrijf en consumptiepunt) en een foutmelding bij het veld tonen;
 *   - opslaan via persist, samen met een logboekregel;
 *   - een open formulier sluiten als het gegeven in een ander tabblad is verwijderd of gewijzigd
 *     (closeStaleForms, met de kopie die bij het openen is onthouden).
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, levert persist en roept closeStaleForms aan bij de
 *     synchronisatie tussen tabbladen;
 *   - AdminController (via RegistrationApp): requireAdmin, showMissing en finishAdminChange;
 *   - RegistrationModel en RegistrationView: de gegevens, de keuzelijsten en de foutmeldingen;
 *   - ModalManager (via RegistrationApp): opent en sluit de formuliervensters;
 *   - BadgeReader: normalize() voor het pasnummer;
 *   - ids.js: createId() voor de id van een nieuw product (werkt ook zonder https).
 */
export class FormController {
  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  constructor(app) {
    this.app = app;
    this.editingCopies = new Map(); // formulier -> kopie (tekst) van het gegeven bij het openen (zie rememberEditing)
  }

  // Onderdelen van de app die deze class gebruikt (model, view). Die komen steeds
  // van RegistrationApp, zodat er maar één verwijzing naar ieder onderdeel bestaat.
  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  // ------------------------------------------------------------------
  // Invoer controleren en opslagknoppen
  // ------------------------------------------------------------------

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
      .filter((field) => field.value.trim() !== "" && !FormController.isDigitsOnly(field.value));

    for (const field of wrongFields) {
      this.view.showFieldError(field, "Gebruik alleen cijfers.");
    }

    wrongFields[0]?.focus();
    return wrongFields.length === 0;
  }

  // Toont bij een veld dat de waarde al bestaat (een naam of een werkgevernummer), en zet de
  // focus op dat veld.
  showDuplicateNameError(fieldSelector, message) {
    const field = this.view.$(fieldSelector);
    this.view.showFieldError(field, message);
    field.focus();
  }

  // Zet de opslagknoppen van het medewerkers- of productformulier goed. Bij toevoegen staan er
  // twee knoppen: `Opslaan` (secundair) en `Opslaan + opnieuw` (primair, groen). Bij wijzigen
  // is er alleen `Opslaan`; die wordt dan de primaire knop, net als bij bedrijf en consumptiepunt.
  // Wordt gebruikt door openEmployeeForm, openEditEmployeeForm, openProductForm en openEditProductForm.
  setSaveButtons(formSelector, continueSelector, withContinue) {
    if (withContinue) this.app.show(continueSelector);
    else this.app.hide(continueSelector);

    const closeButton = this.view.$(`${formSelector} [data-save-mode="close"]`);
    closeButton.classList.toggle("primary-button", !withContinue);
    closeButton.classList.toggle("secondary-button", withContinue);
  }

  // ------------------------------------------------------------------
  // Formulieren die in een ander tabblad verouderd zijn
  // ------------------------------------------------------------------

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

  // Een wijzigformulier is nog open, maar het gegeven is intussen in een ander tabblad
  // verwijderd. Opslaan zou het dan opnieuw aanmaken of niets doen; daarom wordt er niets
  // opgeslagen, krijgt de gebruiker een melding en gaat het formulier dicht.
  // `subject` is bijvoorbeeld "Dit product"; `close` is de sluitactie van het formulier.
  closeStaleForm(form, subject, close) {
    this.app.showMissing(subject);
    form.reset();
    delete form.dataset.editingId;
    close();
  }

  // ------------------------------------------------------------------
  // Medewerker
  // ------------------------------------------------------------------

  // Opent een leeg formulier om een medewerker toe te voegen.
  openEmployeeForm() {
    if (!this.app.requireAdmin()) return;
    const form = this.view.$("#employeeForm");
    form.reset();
    this.view.clearFieldErrors(form);
    this.view.populateEmployeeCompanySelects();
    delete form.dataset.editingId;

    this.setSaveButtons("#employeeForm", "#employeeSaveContinueButton", true);
    this.view.$("#employeeFormTitle").textContent = "Medewerker toevoegen";
    this.view.$("#employeeFormHelp").textContent = "Vul de gegevens in en kies daarna hoe je verder wilt gaan.";
    this.app.openModal("#employeeFormModal");
    this.view.$("#newEmployeeFirstName").focus();
  }

  // Opent het medewerkersformulier, gevuld met de gegevens van een bestaande medewerker.
  // Bestaat de medewerker niet meer (verwijderd in een ander tabblad), dan volgt een melding
  // en blijft het formulier dicht. Er wordt een kopie van de medewerker onthouden, zodat het
  // formulier sluit als een ander tabblad deze medewerker intussen wijzigt (zie closeStaleForms).
  openEditEmployeeForm(employeeId) {
    if (!this.app.requireAdmin()) return;
    const employee = this.model.findEmployee(employeeId);
    if (!employee) {
      this.app.showMissing("Deze medewerker");
      return;
    }
    this.view.clearFieldErrors(this.view.$("#employeeForm"));

    this.view.$("#employeeForm").dataset.editingId = employee.id;
    this.rememberEditing("#employeeForm", employee);
    this.setSaveButtons("#employeeForm", "#employeeSaveContinueButton", false);
    this.view.$("#employeeFormTitle").textContent = "Medewerker wijzigen";
    this.view.$("#employeeFormHelp").textContent = "Pas de gegevens aan en klik daarna op Opslaan.";
    this.view.$("#newEmployeeFirstName").value = employee.firstName;
    this.view.$("#newEmployeeLastName").value = employee.lastName;
    this.view.$("#newEmployeePayrollCode").value = employee.payrollCode;
    this.view.$("#newEmployeePersonnelNumber").value = employee.personnelNumber;
    this.view.$("#newEmployeeEmployerNumber").value = employee.employerNumber || "";
    this.view.$("#newEmployeeBadgeId").value = employee.badgeId || "";
    this.view.populateEmployeeCompanySelects(employee.companyId, employee.pointId);
    this.app.openModal("#employeeFormModal");
    this.view.$("#newEmployeeFirstName").focus();
    this.view.showToast("Gegevens geladen om te wijzigen");
  }

  // Sluit het medewerkersformulier zonder de admin-modal te sluiten.
  closeEmployeeForm() {
    this.app.closeModal("#employeeFormModal");
  }

  // Leest het medewerkersformulier en voegt een medewerker toe of wijzigt een bestaande.
  // Een personeelsnummer mag maar bij één medewerker horen, anders weet de loonadministratie
  // niet bij wie een registratie hoort. Twee medewerkers met dezelfde naam mag wel.
  // Hetzelfde geldt voor het pasnummer (zie validateBadgeField). Het pasnummer komt niet in het
  // logboek; daar staat alleen de naam, net als bij andere wijzigingen van een medewerker.
  // Is de medewerker die gewijzigd wordt intussen verwijderd, dan wordt er niets opgeslagen.
  // Hetzelfde geldt als het gekozen bedrijf of consumptiepunt niet meer bestaat (zie
  // validateEmployeeAssignment).
  saveEmployee(event) {
    event.preventDefault();
    if (!this.app.requireAdmin()) return;

    const employeeData = {
      firstName: this.view.$("#newEmployeeFirstName").value.trim(),
      lastName: this.view.$("#newEmployeeLastName").value.trim(),
      payrollCode: this.view.$("#newEmployeePayrollCode").value.trim(),
      personnelNumber: this.view.$("#newEmployeePersonnelNumber").value.trim(),
      employerNumber: this.view.$("#newEmployeeEmployerNumber").value.trim(),
      companyId: this.view.$("#newEmployeeCompany").value || null,
      pointId: this.view.$("#newEmployeePoint").value || null,
      // Het pasnummer wordt genormaliseerd opgeslagen ("04:a1:b2:c3" wordt "04A1B2C3"); leeg = geen pas.
      badgeId: BadgeReader.normalize(this.view.$("#newEmployeeBadgeId").value)
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
    if (!this.validateBadgeField(employeeData.badgeId, editingId)) return;
    if (!this.validateEmployeeAssignment(employeeData)) return;

    // Het model geeft false terug als er toch niets kon worden opgeslagen; persist meldt dat dan.
    const fullName = `${employeeData.firstName} ${employeeData.lastName}`;
    const saved = this.app.persist(
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
    this.app.renderAuditLog();
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

  // Controleert het (al genormaliseerde) pasnummer uit het medewerkersformulier:
  //   - leeg mag: dan heeft de medewerker geen pas;
  //   - alleen letters en cijfers, 4 tot en met 64 tekens (DataStore accepteert ook niets anders);
  //   - een pas mag maar bij één medewerker horen, anders weet de lezer niet wie er staat.
  //     De medewerker die nu wordt gewijzigd (`editingId`) mag zijn eigen pas houden.
  // Bij een fout krijgt het veld een foutmelding en de focus. Geeft true terug als alles klopt.
  validateBadgeField(badgeId, editingId) {
    if (badgeId === "") return true;

    const field = this.view.$("#newEmployeeBadgeId");
    let message = null;
    if (!/^[A-Z0-9]{4,64}$/.test(badgeId)) {
      message = "Gebruik alleen letters en cijfers (4 tot 64 tekens).";
    } else if (this.model.isBadgeTaken(badgeId, editingId || null)) {
      message = "Deze pas is al gekoppeld aan een andere medewerker.";
    }
    if (!message) return true;

    this.view.showFieldError(field, message);
    field.focus();
    return false;
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

  // ------------------------------------------------------------------
  // Product
  // ------------------------------------------------------------------

  // Opent een leeg formulier om een product toe te voegen.
  openProductForm() {
    if (!this.app.requireAdmin()) return;
    const form = this.view.$("#productForm");
    form.reset();
    this.view.clearFieldErrors(form);
    delete form.dataset.editingId;

    this.setSaveButtons("#productForm", "#consumptionSaveContinueButton", true);
    this.view.$("#productFormTitle").textContent = "Product toevoegen";
    this.view.$("#productFormHelp").textContent = "Vul de productnaam en prijs in.";
    this.app.openModal("#productFormModal");
    this.view.$("#productName").focus();
  }

  // Opent het productformulier, gevuld met een bestaand product.
  // Bestaat het product niet meer (verwijderd in een ander tabblad), dan volgt een melding.
  // Er wordt een kopie van het product onthouden (zie rememberEditing en closeStaleForms).
  openEditProductForm(productId) {
    if (!this.app.requireAdmin()) return;
    const product = this.model.findProduct(productId);
    if (!product) {
      this.app.showMissing("Dit product");
      return;
    }
    this.view.clearFieldErrors(this.view.$("#productForm"));

    this.view.$("#productName").value = product.name;
    this.view.$("#productPrice").value = product.price;
    this.view.$("#productForm").dataset.editingId = product.id;
    this.rememberEditing("#productForm", product);
    this.view.$("#productFormTitle").textContent = "Product wijzigen";
    this.view.$("#productFormHelp").textContent = "Pas de productnaam of prijs aan.";
    this.app.openModal("#productFormModal");
    this.setSaveButtons("#productForm", "#consumptionSaveContinueButton", false);
    this.view.$("#productName").focus();
  }

  closeProductForm() {
    this.app.closeModal("#productFormModal");
  }

  // Leest het productformulier en voegt een product toe of wijzigt een bestaand product.
  // Is het product dat gewijzigd wordt intussen verwijderd, dan wordt er niets opgeslagen
  // (anders zou het met dezelfde id opnieuw worden aangemaakt).
  saveProduct(event) {
    event.preventDefault();
    if (!this.app.requireAdmin()) return;

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
    if (!FormController.isValidPrice(productData.price)) {
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

    const saved = this.app.persist(
      () => this.model.saveProduct(productData),
      { action: editingId ? "Product gewijzigd" : "Product toegevoegd", details: productData.name }
    );
    if (!saved) return;

    form.reset();
    delete form.dataset.editingId;
    this.app.finishAdminChange(
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

  // ------------------------------------------------------------------
  // Bedrijf
  // ------------------------------------------------------------------

  // Opent het bedrijfsformulier: leeg om toe te voegen, of gevuld om te wijzigen.
  // Bij wijzigen wordt een kopie van het bedrijf onthouden (zie rememberEditing en closeStaleForms).
  openCompanyForm(company = null) {
    if (!this.app.requireAdmin()) return;
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
    this.app.openModal("#companyFormModal");
    this.view.$("#companyName").focus();
  }

  // Knop "Wijzigen" bij een bedrijf. Bestaat het bedrijf niet meer (verwijderd in een ander
  // tabblad), dan volgt een melding; anders zou er per ongeluk een leeg "toevoegen"-formulier openen.
  openEditCompanyForm(companyId) {
    if (!this.app.requireAdmin()) return;
    const company = this.model.findCompany(companyId);
    if (!company) {
      this.app.showMissing("Dit bedrijf");
      return;
    }
    this.openCompanyForm(company);
  }

  // Sluit het bedrijfsformulier (en zet de focus terug op de knop waarmee het werd geopend).
  closeCompanyForm() {
    this.app.closeModal("#companyFormModal");
  }

  // Leest het bedrijfsformulier en voegt een bedrijf toe of wijzigt een bestaand bedrijf.
  // Is het bedrijf dat gewijzigd wordt intussen verwijderd, dan wordt er niets opgeslagen.
  // Naam en werkgevernummer moeten uniek zijn; een dubbele waarde krijgt een foutmelding bij
  // het veld (showDuplicateNameError) en er wordt niets opgeslagen.
  saveCompany(event) {
    event.preventDefault();
    if (!this.app.requireAdmin()) return;

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

    // Het werkgevernummer moet ook uniek zijn (als het is ingevuld); het model controleert dat
    // in saveCompany nog een keer. De melding komt bij het veld, net als bij een dubbele naam.
    if (this.model.isEmployerNumberTaken(employerNumber, editingId || null)) {
      this.showDuplicateNameError("#companyEmployerNumber", "Er bestaat al een bedrijf met dit werkgevernummer.");
      return;
    }

    const saved = this.app.persist(
      () => this.model.saveCompany({ id: editingId, name, employerNumber }),
      { action: editingId ? "Bedrijf gewijzigd" : "Bedrijf toegevoegd", details: name }
    );
    if (!saved) return;

    this.closeCompanyForm();
    this.app.finishAdminChange(editingId ? "Bedrijf gewijzigd" : "Bedrijf toegevoegd");
  }

  // ------------------------------------------------------------------
  // Consumptiepunt
  // ------------------------------------------------------------------

  // Opent het consumptiepuntformulier: leeg voor een bedrijf, of gevuld om te wijzigen.
  // Bij wijzigen wordt een kopie van naam, bedrijf en aanbod onthouden, zodat het formulier
  // sluit als een ander tabblad die intussen wijzigt (zie rememberEditing en closeStaleForms).
  openPointForm(point = null, companyId = "") {
    if (!this.app.requireAdmin()) return;
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
    this.app.openModal("#pointFormModal");
    this.view.$("#pointName").focus();
  }

  // Knop "Aanbod wijzigen" bij een consumptiepunt. Bestaat het punt niet meer (verwijderd in
  // een ander tabblad), dan volgt een melding in plaats van een leeg formulier.
  openEditPointForm(pointId) {
    if (!this.app.requireAdmin()) return;
    const point = this.model.findPoint(pointId);
    if (!point) {
      this.app.showMissing("Dit consumptiepunt");
      return;
    }
    this.openPointForm(point);
  }

  // Sluit het consumptiepuntformulier (en zet de focus terug op de knop waarmee het werd geopend).
  closePointForm() {
    this.app.closeModal("#pointFormModal");
  }

  // Leest het consumptiepuntformulier (naam, bedrijf en aangevinkte producten) en slaat het op.
  // Is het punt dat gewijzigd wordt intussen verwijderd, dan wordt er niets opgeslagen.
  // Hetzelfde geldt als het gekozen bedrijf intussen in een ander tabblad is verwijderd: dan
  // krijgt het bedrijfsveld een foutmelding en wordt de keuzelijst opnieuw gevuld.
  savePoint(event) {
    event.preventDefault();
    if (!this.app.requireAdmin()) return;

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
    const saved = this.app.persist(
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
    this.app.finishAdminChange(editingId ? "Consumptiepunt gewijzigd" : "Consumptiepunt toegevoegd");
  }
}
