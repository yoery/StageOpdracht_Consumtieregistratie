import { ADMIN_IDLE_LOGOUT_MS } from "../config.js";

/**
 * AdminController — het beheerscherm: inloggen en uitloggen, het dashboard met de tabbladen,
 * het logboek, de export, "Alle gegevens wissen" en de knoppen in de beheerlijsten
 * (activeren, deactiveren en verwijderen).
 *
 * Verantwoordelijkheid:
 *   - inloggen (demo), uitloggen, uitloggen bij het sluiten van het beheervenster en automatisch
 *     uitloggen als het beheer 5 minuten niet is gebruikt (ADMIN_IDLE_LOGOUT_MS in config.js);
 *   - controleren of er een beheerder is ingelogd (requireAdmin), aan het begin van iedere
 *     beheeractie, ook in de andere controllers;
 *   - het dashboard en de tabbladen tonen, en alles opnieuw tekenen na een beheerwijziging;
 *   - het logboek, de CSV-export en het wissen van alle gegevens;
 *   - een medewerker activeren, deactiveren of verwijderen, en een product, bedrijf of
 *     consumptiepunt verwijderen.
 *
 * Of de beheerder is ingelogd (adminLoggedIn), staat in RegistrationApp, omdat ook andere
 * onderdelen dat lezen.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, bewaart adminLoggedIn en levert persist en de labels
 *     voor het logboek;
 *   - config.js: ADMIN_IDLE_LOGOUT_MS (na hoeveel tijd zonder invoer de beheerder wordt uitgelogd);
 *   - FormController (via RegistrationApp): sluit open beheerformulieren bij automatisch uitloggen;
 *   - RegistrationModel en RegistrationView: de gegevens en het tekenen;
 *   - CsvExport: maakt het CSV-bestand;
 *   - FaceRecognitionDemo: vergeet de gezichten bij wissen en bij het verwijderen van een medewerker;
 *   - CorrectionController (via RegistrationApp): zet het datumveld van de correctie klaar en
 *     sluit het venster "Registratie verwijderen" als het beheer sluit;
 *   - ModalManager (via RegistrationApp): opent en sluit het beheervenster.
 */
export class AdminController {
  // Zo vaak kijkt de app of de beheerder te lang niets heeft gedaan (zie startIdleWatch).
  static IDLE_CHECK_MS = 10 * 1000;

  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  // `clock` levert de tijd en de timer voor het automatisch uitloggen. Die kan worden meegegeven,
  // zodat de unit tests met een nep-klok kunnen werken in plaats van vijf minuten te wachten
  // (net als bij BadgeReader). `idleLogoutMs` is de tijd zonder invoer tot het uitloggen.
  constructor(app, clock = AdminController.realClock(), idleLogoutMs = ADMIN_IDLE_LOGOUT_MS) {
    this.app = app;
    this.clock = clock;
    this.idleLogoutMs = idleLogoutMs;
    this.auditLogLimit = 20;       // aantal regels dat het logboek nu toont (zie loadMoreAudit)
    this.lastAdminActivity = null; // tijdstip (ms) van de laatste invoer van de ingelogde beheerder
    this.idleTimer = null;         // timer die regelmatig logoutIfIdle aanroept
  }

  // De echte klok van de browser: Date.now() en setInterval/clearInterval.
  static realClock() {
    return {
      now: () => Date.now(),
      setInterval: (action, delay) => setInterval(action, delay),
      clearInterval: (timer) => clearInterval(timer)
    };
  }

  // Onderdelen van de app die deze class gebruikt (model, view, faceDemo, csvExport). Die komen steeds
  // van RegistrationApp, zodat er maar één verwijzing naar ieder onderdeel bestaat.
  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  get faceDemo() {
    return this.app.faceDemo;
  }

  get csvExport() {
    return this.app.csvExport;
  }

  // ------------------------------------------------------------------
  // Hulpfuncties voor alle beheeracties
  // ------------------------------------------------------------------

  // Controleert of er een beheerder is ingelogd. Iedere beheeractie (wijzigen, verwijderen,
  // corrigeren, voorraad, exporteren, wissen en het openen van een beheerformulier) begint hiermee.
  // De knoppen staan alleen in het beheervenster, maar een knop kan ook op een andere manier
  // worden ingedrukt of een methode kan rechtstreeks worden aangeroepen (bijvoorbeeld als iemand
  // het verborgen venster zichtbaar maakt). Daarom controleert de controller het zelf, en niet
  // alleen de weergave. Is er niemand ingelogd, dan gebeurt er niets en volgt een melding.
  // Let op: dit blijft een controle in de browser. In productie moet de server dit controleren
  // (zie TO, hoofdstuk 13).
  requireAdmin() {
    if (this.app.adminLoggedIn) return true;

    this.view.showToast("Log eerst in als beheerder.", { tone: "error" });
    return false;
  }

  // Melding als een gegeven intussen niet meer bestaat, bijvoorbeeld omdat het in een ander
  // tabblad is verwijderd en deze knop of dit formulier nog van vóór die tijd is.
  // `subject` is bijvoorbeeld "Dit product" of "Deze medewerker".
  showMissing(subject) {
    this.view.showToast(`${subject} bestaat niet meer. Er is niets opgeslagen.`, { tone: "error" });
  }

  // Tekent alle admin- en publieke onderdelen opnieuw en toont een melding. Opslaan (ook van
  // het logboek) is dan al gebeurd in persist. Wordt gebruikt na wijzigingen aan producten,
  // bedrijven, consumptiepunten en voorraad. Ook de registratietabel wordt opnieuw getekend,
  // zodat daar bijvoorbeeld de nieuwe naam van een product staat.
  // Met redrawStockTable: false blijft de voorraadtabel staan (zie saveStockField).
  // Had een knop in een lijst de focus (bijvoorbeeld "Wijzigen" bij een bedrijf, waar de focus na
  // het sluiten van het formulier naar terugging), dan krijgt de nieuwe knop met dezelfde id die
  // focus terug (zie ModalManager.preserveFocus). Anders zou de focus naar het begin van de pagina gaan.
  finishAdminChange(message, { redrawStockTable = true } = {}) {
    this.app.preserveFocus(() => {
      this.view.renderAll();
      this.view.populateFilters();
      this.view.renderAdmin();
      this.view.renderAdminEmployees();
      this.view.renderCorrectionEmployees();
      this.view.renderAdminProducts();
      this.view.renderAdminCompanies();
      if (redrawStockTable) this.view.renderStock();
      this.renderAuditLog();
      this.view.renderFridgeAdmin();
    });
    this.view.showToast(message, { tone: "success" });
  }

  // Tekent het logboek opnieuw met het aantal regels dat de beheerder nu ziet. Zo blijft het
  // logboek na "Meer laden" even lang, ook als er daarna iets wordt gewijzigd.
  renderAuditLog() {
    this.view.renderAuditLog(this.auditLogLimit);
  }

  // ------------------------------------------------------------------
  // Inloggen, dashboard, tabbladen, export en wissen
  // ------------------------------------------------------------------

  // Opent het loginvenster, of direct het dashboard als de beheerder al is ingelogd.
  // Het venster krijgt de naam van de kop die zichtbaar is ("Welkom terug" of "Overzicht"),
  // zodat een schermlezer altijd de juiste naam voorleest.
  openAdmin() {
    this.app.openModal("#adminModal");

    if (!this.app.adminLoggedIn) {
      this.showLogin();
      return;
    }

    this.showDashboard();
  }

  // Toont het loginformulier in het admin-venster. Een oude foutmelding van een eerdere
  // mislukte poging wordt verborgen, zodat het formulier weer schoon begint.
  showLogin() {
    this.app.hide("#adminView");
    this.app.hide("#loginError");
    this.app.show("#loginView");
    this.view.$("#adminModal").setAttribute("aria-labelledby", "adminTitle");
    this.view.$("#loginEmail").focus();
  }

  // Demo-login: ieder ingevuld e-mailadres en wachtwoord wordt geaccepteerd.
  login(event) {
    event.preventDefault();

    const email = this.view.$("#loginEmail").value;
    const password = this.view.$("#loginPassword").value;

    if (email && password) {
      this.app.hide("#loginError");
      this.app.adminLoggedIn = true;
      // Inloggen telt als invoer: de vijf minuten tot het automatisch uitloggen beginnen nu.
      this.lastAdminActivity = this.clock.now();
      this.showDashboard();
    } else {
      this.app.show("#loginError");
    }
  }

  // Knop "Uitloggen": de beheerder is uitgelogd en ziet het loginformulier weer.
  logout() {
    this.app.adminLoggedIn = false;
    this.lastAdminActivity = null;
    this.view.$("#loginPassword").value = "";
    this.showLogin();
  }

  // Sluit het admin-venster (sluitknop, klik op de donkere achtergrond of Escape) en logt de
  // beheerder uit. Op een gedeelde tablet kan de volgende gebruiker anders zonder wachtwoord
  // in het beheerscherm komen. Bij het volgende openen verschijnt dus het loginformulier.
  // Het dashboard wordt ook verborgen, zodat het niet zichtbaar blijft binnen het gesloten venster
  // (bijvoorbeeld als iemand het venster via de ontwikkelaarstools weer zichtbaar maakt).
  closeAdmin() {
    // Een open venster "Registratie verwijderen" hoort bij het beheer en gaat dus ook dicht.
    if (this.app.removalTarget) this.app.closeRemoveRegistration();
    this.app.adminLoggedIn = false;
    this.lastAdminActivity = null;
    this.view.$("#loginPassword").value = "";
    this.app.hide("#adminView");
    this.app.closeModal("#adminModal");
  }

  // ------------------------------------------------------------------
  // Automatisch uitloggen na een tijd zonder invoer
  // ------------------------------------------------------------------

  // Start de timer die iedere 10 seconden kijkt of de beheerder te lang niets heeft gedaan
  // (logoutIfIdle). Wordt één keer aangeroepen bij het starten van de app (RegistrationApp.initialize).
  // De timer loopt altijd, net als de timer voor de dagwissel: zonder ingelogde beheerder doet
  // de controle niets. Zo hoeven inloggen, uitloggen en sluiten geen timer te starten of te stoppen.
  startIdleWatch() {
    if (this.idleTimer !== null) return;
    this.idleTimer = this.clock.setInterval(() => this.logoutIfIdle(), AdminController.IDLE_CHECK_MS);
  }

  // Stopt de timer van startIdleWatch (bijvoorbeeld in een test).
  stopIdleWatch() {
    if (this.idleTimer === null) return;
    this.clock.clearInterval(this.idleTimer);
    this.idleTimer = null;
  }

  // Wordt aangeroepen bij iedere muisbeweging, klik, toets, aanraking of scroll (zie
  // RegistrationApp.registerAdminEvents). Alleen als de beheerder is ingelogd telt dit als
  // gebruik van het beheer. Het beheervenster bedekt dan de hele pagina, dus alle invoer
  // gebeurt in het beheervenster of in een beheerformulier erboven.
  noteAdminActivity() {
    if (!this.app.adminLoggedIn) return;
    this.lastAdminActivity = this.clock.now();
  }

  // Logt de beheerder uit als het beheer langer dan `idleLogoutMs` (5 minuten) niet is gebruikt.
  // Open formulieren van het beheer (medewerker, product, bedrijf, consumptiepunt) gaan dicht
  // zonder op te slaan, net als het venster "Registratie verwijderen" en het beheervenster zelf
  // (closeAdmin). Daarna verschijnt een melding, zodat de beheerder weet waarom het beheer
  // dicht is. Geeft true terug als de beheerder is uitgelogd.
  // Is er nog geen tijdstip van invoer bekend (de beheerder is niet via het loginformulier ingelogd,
  // zoals in de unit tests), dan begint de tijd vanaf deze controle.
  logoutIfIdle(now = this.clock.now()) {
    if (!this.app.adminLoggedIn) return false;
    if (this.lastAdminActivity === null) {
      this.lastAdminActivity = now;
      return false;
    }
    if (now - this.lastAdminActivity < this.idleLogoutMs) return false;

    for (const [, modalSelector, , close] of this.app.editForms()) {
      if (!this.view.$(modalSelector).classList.contains("hidden")) close();
    }
    this.closeAdmin();
    this.view.showToast(this.idleLogoutMessage(), { duration: 8000 });
    return true;
  }

  // De melding bij automatisch uitloggen, met het aantal minuten uit config.js.
  idleLogoutMessage() {
    const minutes = Math.round(this.idleLogoutMs / 60000);
    const duration = minutes === 1 ? "1 minuut" : `${minutes} minuten`;
    return `Je bent automatisch uitgelogd omdat het beheer ${duration} niet is gebruikt.`;
  }

  // Toont het dashboard met alle actuele gegevens. De focus gaat naar het actieve tabblad.
  showDashboard() {
    this.auditLogLimit = 20;
    this.app.hide("#loginView");
    this.app.show("#adminView");
    this.view.$("#adminModal").setAttribute("aria-labelledby", "dashboardTitle");
    this.view.$(".tab.active")?.focus();
    this.app.resetCorrectionDate();
    this.view.populateFilters();
    this.view.renderAdmin();
    this.view.renderCorrectionEmployees();
    this.view.renderAdminEmployees();
    this.view.renderAdminProducts();
    this.view.renderAdminCompanies();
    this.view.renderStock();
    this.renderAuditLog();
    this.view.renderFridgeAdmin();
  }

  // Wisselt naar een ander tabblad in het dashboard. Het tabblad Koelkast (slimme koelkast, demo)
  // bestaat alleen in index.html als de koelkast erin staat; een ontbrekend paneel wordt overgeslagen.
  switchTab(activeTab) {
    const tabNames = ["registrations", "employees", "products", "companies", "stock", "fridge", "audit"];
    if (!activeTab) return; // geen bestaand tabblad gevonden (bijvoorbeeld een onbekende naam)

    // aria-selected zegt een schermlezer welk tabblad (role="tab") gekozen is.
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });
    activeTab.classList.add("active");
    activeTab.setAttribute("aria-selected", "true");

    for (const name of tabNames) {
      this.view.$(`#${name}Tab`)?.classList.toggle("hidden", activeTab.dataset.tab !== name);
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
    if (!this.requireAdmin()) return;
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
    if (!this.requireAdmin()) return;
    const firstQuestion = "Alle medewerkers, registraties, producten, voorraad, koelkastopeningen, het logboek en de reservekopieën op deze tablet wissen?";
    if (!window.confirm(firstQuestion)) return;
    if (!window.confirm("Weet je het zeker? Dit kan niet ongedaan worden gemaakt.")) return;

    // Lukt het wissen van de opslag niet, dan staan de gegevens er nog. Dan geen melding dat alles
    // is gewist, maar een foutmelding. Het beheer blijft open, zodat de beheerder het opnieuw kan proberen.
    if (!this.model.wipeAll()) {
      this.view.showToast("De gegevens konden niet worden gewist. Probeer het opnieuw.", { tone: "error", duration: 6000 });
      return;
    }
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
    this.view.renderFridgeAdmin();
    if (saved) {
      this.view.showToast("Alle gegevens zijn gewist. De demogegevens staan er weer.", { tone: "success", duration: 4000 });
    } else {
      this.view.showToast("De gegevens zijn gewist, maar de demogegevens konden niet worden opgeslagen. Herlaad de pagina.", { tone: "error", duration: 6000 });
    }
  }

  // ------------------------------------------------------------------
  // Knoppen in de beheerlijsten: (de)activeren en verwijderen
  // ------------------------------------------------------------------

  // Zet een medewerker actief of inactief (omgekeerd van wat het nu is).
  // Bestaat de medewerker niet meer (verwijderd in een ander tabblad), dan volgt een melding.
  // Daarna worden ook de correctielijst en de registratietabel opnieuw getekend, zodat de
  // beheerder overal de actuele gegevens ziet.
  toggleEmployee(employeeId) {
    if (!this.requireAdmin()) return;
    const employee = this.model.findEmployee(employeeId);
    if (!employee) {
      this.showMissing("Deze medewerker");
      return;
    }

    const active = !employee.active;
    const status = active ? "actief" : "inactief";
    const saved = this.app.persist(
      () => this.model.setEmployeeActive(employeeId, active),
      { action: "Medewerkerstatus gewijzigd", details: `${this.app.employeeLabel(employeeId)} is ${status} gezet` }
    );
    if (!saved) return;

    // De knop krijgt na het tekenen de focus terug (de tekst wisselt tussen Deactiveren en Activeren).
    this.app.preserveFocus(() => {
      this.renderAuditLog();
      this.view.populateFilters();
      this.view.renderAdminEmployees();
      this.view.renderCorrectionEmployees();
      this.view.renderAdmin();
      this.view.renderAll();
    });
    this.view.showToast("Medewerkerstatus gewijzigd", { tone: "success" });
  }

  // Verwijdert een inactieve medewerker zonder registraties definitief, na bevestiging.
  // Een medewerker met registraties wordt niet verwijderd: die registraties zijn nodig voor de
  // loonadministratie (export) en anders staat er "Verwijderd" in plaats van een naam. Daarom
  // wordt dan niet om bevestiging gevraagd, maar uitgelegd dat deactiveren genoeg is.
  // Een actieve medewerker moet eerst op inactief worden gezet. De view toont de knop alleen bij
  // een inactieve medewerker zonder registraties, maar een knop kan verouderd zijn (bijvoorbeeld
  // als een ander tabblad de medewerker intussen weer actief heeft gezet). Het model
  // (removeEmployee) controleert hetzelfde nog een keer.
  // De naam wordt vóór het verwijderen opgezocht, want daarna bestaat de medewerker niet meer.
  removeEmployee(employeeId) {
    if (!this.requireAdmin()) return;
    // Bestaat de medewerker niet meer (verwijderd in een ander tabblad), dan niets doen en melden.
    const employee = this.model.findEmployee(employeeId);
    if (!employee) {
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
    if (employee.active) {
      this.view.showToast(
        "Zet deze medewerker eerst op inactief. Alleen een inactieve medewerker kan definitief worden verwijderd.",
        { tone: "error", duration: 5000 }
      );
      return;
    }

    const name = this.app.employeeLabel(employeeId);
    if (!window.confirm(`${name} definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;

    const saved = this.app.persist(
      () => this.model.removeEmployee(employeeId),
      { action: "Medewerker definitief verwijderd", details: name }
    );
    if (!saved) return;

    // Een ingesteld gezicht (demo) hoort bij deze medewerker en moet dus ook weg.
    this.faceDemo.forget(employeeId);
    // De knop "Verwijderen" bestaat daarna niet meer; de focus gaat naar "Medewerker toevoegen".
    this.app.preserveFocus(() => {
      this.renderAuditLog();
      this.view.populateFilters();
      this.view.renderAdminEmployees();
      this.view.renderCorrectionEmployees();
      this.view.renderAdmin();
      this.view.renderAll();
    });
    this.view.showToast("Inactieve medewerker definitief verwijderd", { tone: "success" });
  }

  // Verwijdert een product, maar alleen als het nog nooit is geregistreerd.
  // Net als bij een bedrijf en een consumptiepunt vraagt de app eerst om bevestiging
  // (window.confirm); kiest de beheerder "Annuleren", dan verandert er niets.
  removeProduct(productId) {
    if (!this.requireAdmin()) return;
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

    const productName = this.model.productName(productId);
    if (!window.confirm(`Product ${productName} verwijderen?`)) return;

    // Lukt opslaan niet, dan toont persist zelf de melding "Opslaan mislukt".
    const saved = this.app.persist(
      () => this.model.removeProduct(productId),
      { action: "Product verwijderd", details: productName }
    );
    if (saved) this.finishAdminChange("Product verwijderd");
  }

  // Verwijdert een bedrijf, maar alleen als er geen medewerkers of consumptiepunten aan hangen.
  // Bestaat het bedrijf niet meer (verwijderd in een ander tabblad), dan volgt een melding.
  removeCompany(companyId) {
    if (!this.requireAdmin()) return;
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

    const saved = this.app.persist(
      () => this.model.removeCompany(companyId),
      { action: "Bedrijf verwijderd", details: name }
    );
    if (saved) this.finishAdminChange("Bedrijf verwijderd");
  }

  // Verwijdert een consumptiepunt, maar alleen als er geen medewerkers meer aan gekoppeld zijn.
  // Bestaat het punt niet meer (verwijderd in een ander tabblad), dan volgt een melding.
  removePoint(pointId) {
    if (!this.requireAdmin()) return;
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

    const saved = this.app.persist(
      () => this.model.removePoint(point.id),
      { action: "Consumptiepunt verwijderd", details: `${point.name} (${this.model.companyName(point.companyId)})` }
    );
    if (saved) this.finishAdminChange("Consumptiepunt verwijderd");
  }
}
