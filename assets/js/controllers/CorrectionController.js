import { cssAttributeValue } from "../RegistrationView.js";

/**
 * CorrectionController — correcties door de beheerder ("Medewerker corrigeren" in het tabblad
 * Registraties): een registratie toevoegen met "+" en een gekozen registratie verwijderen met "−".
 *
 * Verantwoordelijkheid:
 *   - het datumveld van de correctie "+" klaarzetten, lezen en controleren;
 *   - eerst een vraag stellen als de registratie in een eerdere loonmaand valt;
 *   - een correctie toevoegen, of in het venster "Registratie verwijderen" precies de gekozen
 *     registratie verwijderen, steeds samen met een logboekregel (via persist);
 *   - de correctielijst opnieuw tekenen zonder dat de focus verloren gaat.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class en levert persist en employeeLabel;
 *   - AdminController (via RegistrationApp): requireAdmin, showMissing en renderAuditLog;
 *   - RegistrationModel: addRegistration, removeRegistration, findRegistration en monthKey;
 *   - RegistrationView: de correctielijst en de lijst in het venster "Registratie verwijderen";
 *   - ModalManager (via RegistrationApp): opent en sluit dat venster.
 */
export class CorrectionController {
  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  constructor(app) {
    this.app = app;
    this.removalTarget = null; // { employeeId, productId } zolang het venster "Registratie verwijderen" open is
  }

  // Onderdelen van de app die deze class gebruikt (model, view). Die komen steeds
  // van RegistrationApp, zodat er maar één verwijzing naar ieder onderdeel bestaat.
  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
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
    field.value = CorrectionController.dateValue(now);
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
    if (!field.value || field.value === CorrectionController.dateValue(now)) return now;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(field.value);
    const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
    // Een datum als 31-02 schuift in JavaScript door naar maart; dat telt als ongeldig.
    const exists = date && CorrectionController.dateValue(date) === field.value;

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
  // niets opgeslagen; anders zou er een registratie zonder medewerker ontstaan. De melding
  // komt van showMissing, net als bij andere gegevens die niet meer bestaan.
  // De logboekregel wordt in dezelfde keer opgeslagen als de registratie (zie persist).
  // Hetzelfde geldt voor een product dat niet (meer) bestaat: anders zou er een registratie van
  // "Onbekend product" voor 0 euro ontstaan.
  addCorrection(employeeId, productId, now = new Date()) {
    if (!this.app.requireAdmin()) return false;
    if (!this.model.findEmployee(employeeId)) {
      this.app.showMissing("Deze medewerker");
      return false;
    }
    if (!this.model.findProduct(productId)) {
      this.app.showMissing("Dit product");
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
    const saved = this.app.persist(
      () => this.model.addRegistration(employeeId, productId, { correction: true, createdAt }),
      { action: "Registratie toegevoegd", details: `${productName} voor ${this.app.employeeLabel(employeeId)}${dateText}` }
    );
    if (!saved) return false;

    this.view.showToast(`${productName} toegevoegd voor medewerker${dateText}`, { tone: "success" });
    this.view.renderAll();
    this.view.populateFilters();
    this.renderCorrectionList();
    this.view.renderAdmin();
    this.view.renderStock(); // de correctie verandert ook de voorraad
    this.app.renderAuditLog();
    return true;
  }

  // Correctie met "−": opent het venster "Registratie verwijderen" met alle registraties van dit
  // product bij deze medewerker, de nieuwste datum bovenaan. De beheerder kiest daar zelf welke
  // registratie weg moet (removeChosenRegistration). Dat gebeurt ook als er maar één registratie
  // is: zo werkt "−" altijd op dezelfde manier en ziet de beheerder vóór het verwijderen welke
  // registratie (datum en tijd) verdwijnt. De focus gaat naar de eerste knop "Verwijderen".
  // Geeft true terug als het venster is geopend.
  removeCorrection(employeeId, productId) {
    if (!this.app.requireAdmin()) return false;
    if (!this.model.hasRegistration(employeeId, productId)) {
      this.view.showToast("Dit product heeft geen registratie voor deze medewerker", { tone: "error" });
      return false;
    }

    this.removalTarget = { employeeId, productId };
    this.view.renderRemoveRegistrationList(employeeId, productId);
    this.app.openModal("#removeRegistrationModal");
    this.view.$("#removeRegistrationList [data-remove-registration]")?.focus();
    return true;
  }

  // Knop "Verwijderen" in het venster "Registratie verwijderen": verwijdert precies de gekozen
  // registratie. Is die uit een andere maand, dan vraagt de app eerst om bevestiging (zie
  // confirmOldMonthRemoval); bij "Annuleren" verandert er niets en blijft het venster open.
  // Bestaat de registratie niet meer (in een ander tabblad verwijderd), dan wordt er niets
  // opgeslagen en wordt de lijst in het venster bijgewerkt.
  // De verwijdering en de logboekregel worden in één keer opgeslagen (zie persist). In de
  // logboekregel staat ook de datum en tijd van de registratie, zodat terug te vinden is welke
  // registratie de beheerder heeft gekozen. Daarna sluit het venster en krijgt de knop "−" van
  // hetzelfde product weer de focus (closeModal en renderCorrectionList).
  removeChosenRegistration(registrationId) {
    if (!this.app.requireAdmin()) return false;
    const registration = this.model.findRegistration(registrationId);
    if (!registration) {
      this.app.showMissing("Deze registratie");
      this.refreshRemoveRegistration();
      return false;
    }
    if (!this.confirmOldMonthRemoval(registration)) return false;

    const { employeeId, productId } = registration;
    const productName = this.model.productName(productId);
    const registeredAt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" })
      .format(new Date(registration.createdAt));
    const saved = this.app.persist(
      () => this.model.removeRegistration(registrationId),
      {
        action: "Registratie verwijderd",
        details: `${productName} van ${this.app.employeeLabel(employeeId)}, geregistreerd op ${registeredAt}`
      }
    );
    if (!saved) return false;

    this.closeRemoveRegistration();
    this.app.renderAuditLog();
    this.view.populateFilters();
    this.renderCorrectionList();
    this.view.renderAdmin();
    this.view.renderStock(); // de voorraad komt terug, dus het tabblad Voorraad moet mee
    this.view.renderAll();
    this.view.showToast(`${productName} registratie verwijderd`, { tone: "success" });
    return true;
  }

  // Sluit het venster "Registratie verwijderen" (sluitknop, "Annuleren", de achtergrond, Escape
  // of na het verwijderen). De focus gaat terug naar de knop "−" waarmee het werd geopend.
  closeRemoveRegistration() {
    this.removalTarget = null;
    this.app.closeModal("#removeRegistrationModal");
  }

  // Tekent de lijst in het open venster "Registratie verwijderen" opnieuw, bijvoorbeeld als een
  // ander tabblad intussen een registratie heeft verwijderd. Is er van dit product bij deze
  // medewerker niets meer over, dan sluit het venster: er valt dan niets meer te kiezen.
  refreshRemoveRegistration() {
    if (!this.removalTarget) return;

    const { employeeId, productId } = this.removalTarget;
    if (!this.model.hasRegistration(employeeId, productId)) {
      this.closeRemoveRegistration();
      return;
    }
    this.view.renderRemoveRegistrationList(employeeId, productId);
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
}
