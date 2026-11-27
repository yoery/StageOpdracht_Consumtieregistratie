/**
 * ServerMode — regelt alles wat anders is als de website met een server werkt (SERVER_API in
 * deployment.js): opstarten, inloggen, tablets koppelen en de synchronisatie met AFAS.
 *
 * Wie is deze browser voor de server?
 *   - niemand: er verschijnt alleen een inlogscherm (`#serverGate`). De website zelf start niet en er
 *     staan geen gegevens in de pagina;
 *   - een gekoppelde tablet: de website start met de gegevens die een tablet mag zien (namen, geen
 *     looncodes en personeelsnummers). Medewerkers kunnen registreren;
 *   - de beheerder: alles is te zien en te wijzigen. Het tabblad `Tablets en AFAS` is er alleen dan.
 *
 * Opstarten (`prepare`), vóórdat het model bestaat:
 *   1. vragen wie deze browser is;
 *   2. de gegevens ophalen en in ServerDataStore zetten. Het model laadt ze daarna zoals altijd.
 * Een tablet zonder verbinding start met wat hij in de browser heeft bewaard. Registraties gaan dan
 * in de wachtrij en naar de server zodra de verbinding terug is.
 *
 * Logt de beheerder in of uit, dan worden alle gegevens opnieuw opgehaald: de server geeft een
 * beheerder meer dan een tablet. Na uitloggen staan de looncodes en personeelsnummers dus niet meer
 * in het geheugen van de tablet.
 *
 * Deze class tekent zelf het inlogscherm en het tabblad `Tablets en AFAS`. Alle tekst komt met
 * `textContent` in de pagina, nooit als HTML.
 *
 * Verbonden met:
 *   - ServerApi, ServerDataStore en ServerSync;
 *   - main.js: maakt deze class en start daarna de rest van de website;
 *   - AdminController: roept `login` en `logout` aan als `app.server` bestaat.
 */
import { DEFAULT_PRODUCTS } from "./config.js";
import { icon } from "./icons.js";
import { ServerError } from "./ServerApi.js";
import { ServerDataStore } from "./ServerDataStore.js";
import { ServerSync } from "./ServerSync.js";

export class ServerMode {
  // De teksten van de gezichtsherkenning met een server (zie attach).
  static FACE_TEXTS = {
    button: "Herken mij met de camera",
    kicker: "Gezichtsherkenning",
    consent: "Ik doe vrijwillig mee. Alleen kenmerken van mijn gezicht (getallen, geen foto) worden bewaard op de server van TVB, zodat ik op iedere tablet van TVB word herkend. Na een jaar worden ze vanzelf gewist en ik kan het altijd uitzetten."
  };

  static MESSAGES = {
    offline: "Geen verbinding met de server. Registraties worden bewaard en later verstuurd.",
    online: "De verbinding met de server is terug.",
    rejected: "De server heeft een wijziging geweigerd. De gegevens zijn opnieuw opgehaald.",
    noConnection: "Geen verbinding met de server. Controleer het netwerk en probeer het opnieuw.",
    notConfigured: "Er is nog geen beheerder op de server. Vul CR_BEHEER_NAAM en CR_BEHEER_WACHTWOORD in bij de instellingen van de server en start hem opnieuw.",
    gate: "Log in als beheerder om het beheer te openen of deze tablet te koppelen.",
    badgeOffline: "Herkennen met de pas werkt nu niet: geen verbinding met de server. Zoek je naam in de lijst.",
    linkOffline: "Geen verbinding met de server. De pas is niet gekoppeld. Probeer het opnieuw."
  };

  // "Wachtwoord wijzigen" in het blok Mijn account (zie changePassword).
  static PASSWORD_TEXTS = {
    required: "Vul je huidige wachtwoord in en twee keer het nieuwe wachtwoord.",
    tooShort: "Het nieuwe wachtwoord moet minstens 12 tekens hebben.",
    different: "De twee nieuwe wachtwoorden zijn niet gelijk.",
    changed: "Je wachtwoord is gewijzigd. Log voortaan in met het nieuwe wachtwoord."
  };

  // `reload` en `doc` zijn mee te geven, zodat de tests zonder browser werken.
  constructor({ api, key, cache = null, reload = () => globalThis.location.reload(), doc = globalThis.document, timers = globalThis }) {
    this.api = api;
    this.reload = reload;
    this.doc = doc;
    this.store = new ServerDataStore(key, cache);
    this.sync = new ServerSync({
      api,
      store: this.store,
      timers,
      onRemoteChange: () => this.reloadModel(),
      onStatus: (status) => this.handleStatus(status)
    });
    this.role = null;
    this.device = null;
    this.username = null;
    this.app = null;
  }

  // ------------------------------------------------------------------
  // Opstarten
  // ------------------------------------------------------------------

  // Geeft "ready" terug als de website kan starten, of "gate" als alleen het inlogscherm in beeld staat.
  async prepare() {
    let session;
    try {
      session = await this.api.session();
    } catch (error) {
      return this.prepareWithoutConnection();
    }

    this.role = session.role || null;
    this.device = session.device || null;
    this.username = session.username || null;
    if (!this.role) {
      // Geen tablet (meer): wat er nog in de browser stond, wordt gewist.
      this.store.forgetCache();
      this.showGate(session.configured === false ? ServerMode.MESSAGES.notConfigured : ServerMode.MESSAGES.gate, { form: session.configured !== false });
      return "gate";
    }

    this.store.setCaching(this.role === "device");
    // Een tablet kan nog registraties in de wachtrij hebben van vóór de herstart. Die blijven staan.
    const restored = this.role === "device" ? this.store.restoreCache() : null;
    try {
      await this.sync.fullPull();
      if (this.role === "admin" && this.sync.version === 0) await this.seedEmptyServer();
    } catch (error) {
      if (restored !== null) {
        this.sync.version = restored;
        this.startedOffline = true;
        return "ready";
      }
      this.showGate(ServerMode.MESSAGES.noConnection, { form: false, retry: true });
      return "gate";
    }
    return "ready";
  }

  // Een nieuwe server is leeg. De eerste beheerder die inlogt, zet er de standaardproducten op (dezelfde
  // als in de demo). De bedrijven niet: die maakt de synchronisatie met AFAS aan, met de naam en het
  // werkgevernummer uit AFAS (zie EmployeeSync). De 13 bedrijven van de demo hebben geen nummer en
  // zouden dubbel naast die van AFAS staan. Medewerkers komen uit AFAS of van de beheerder.
  // Consumptiepunten maakt de beheerder zelf.
  async seedEmptyServer() {
    const changes = DEFAULT_PRODUCTS.map((product) => ({ collection: "products", id: product.id, data: { ...product } }));
    await this.api.push(changes);
    await this.sync.fullPull();
  }

  // Geen verbinding bij het opstarten: een tablet gaat verder met wat hij had, anders een melding.
  prepareWithoutConnection() {
    const restored = this.store.restoreCache();
    if (restored === null) {
      this.showGate(ServerMode.MESSAGES.noConnection, { form: false, retry: true });
      return "gate";
    }
    this.role = "device";
    this.store.setCaching(true);
    this.sync.version = restored;
    this.startedOffline = true;
    return "ready";
  }

  // Koppelt de gestarte website: past het beheer aan op de server en start het uitwisselen.
  attach(app) {
    this.app = app;
    const $ = (selector) => this.doc.querySelector(selector);

    // Het demo-inloggen bestaat hier niet.
    $(".login-hint")?.classList.add("hidden");
    if ($("#loginUsername")) $("#loginUsername").value = "";
    // "Alle gegevens wissen" zet de demogegevens terug. Met een server zou dat alles van iedereen wissen.
    $("#wipeDataButton")?.classList.add("hidden");
    $("#wipeDataButton")?.previousElementSibling?.classList.add("hidden");

    // Zoeken: pas namen na typen, en de locatie van deze tablet bovenaan (zie RegistrationView.renderEmployees).
    app.view.directory = () => ({ searchFirst: true, pointId: this.pointId, deviceId: this.device?.id ?? null });
    this.applyLocation();

    // De gezichtsherkenning is hier geen demo meer, en de kenmerken staan op de server (niet alleen op
    // deze tablet). De teksten zeggen dat eerlijk, ook de toestemming.
    this.setText("#faceRecognizeButton", ServerMode.FACE_TEXTS.button, { keepIcon: true });
    this.setText(".face-modal .section-kicker", ServerMode.FACE_TEXTS.kicker);
    this.setText("#faceConsentLabel span", ServerMode.FACE_TEXTS.consent);

    $("#tab-server")?.classList.remove("hidden");
    $("#serverDeviceForm")?.addEventListener("submit", (event) => this.linkThisDevice(event));
    $("#serverPasswordForm")?.addEventListener("submit", (event) => this.changePassword(event));
    $("#serverAfasButton")?.addEventListener("click", () => this.runAfasSync());
    $("#tab-server")?.addEventListener("click", () => this.renderServerTab());

    this.sync.start();
    if (this.startedOffline) this.handleStatus("offline");
  }

  // Vervangt de tekst van een element. Met `keepIcon` blijft een icoon (span met data-icon) vooraan staan.
  setText(selector, text, { keepIcon = false } = {}) {
    const element = this.doc.querySelector(selector);
    if (!element) return;
    if (!keepIcon || typeof element.append !== "function") {
      element.textContent = text;
      return;
    }
    const iconElement = element.querySelector?.("[data-icon]");
    element.textContent = "";
    if (iconElement) element.append(iconElement, " ");
    element.append(text);
  }

  // Zet de locatie van deze tablet in het model en toont "Ik ben een gast" alleen als er een locatie
  // is: een gast heeft geen eigen consumptiepunt en pakt iets op de plek waar de tablet staat.
  applyLocation() {
    if (!this.app) return;
    this.app.model.locationPointId = this.pointId;
    for (const button of this.doc.querySelectorAll?.("[data-open-guest]") ?? []) {
      button.classList.toggle("hidden", !this.pointId);
    }
    this.app.view.renderEmployees?.();
  }

  // Na het starten: op de computer van de beheerder (geen tablet) gaat het beheer meteen open.
  afterStart() {
    if (this.role === "admin") this.app?.openAdmin?.();
  }

  // De locatie van deze tablet (een consumptiepunt), of null.
  get pointId() {
    return this.device?.pointId ?? null;
  }

  // Laat het model opnieuw laden, op dezelfde manier als bij een wijziging uit een ander tabblad.
  reloadModel() {
    this.app?.handleStorageChange?.({ key: this.store.key, newValue: this.store.text });
  }

  handleStatus(status) {
    if (status === "signed-out") {
      // De sessie is verlopen of de tablet is ingetrokken: terug naar het inlogscherm.
      this.sync.stop();
      this.reload();
      return;
    }
    const message = ServerMode.MESSAGES[status];
    if (!message) return;
    this.app?.view?.showToast?.(message, status === "online" ? { tone: "success" } : { tone: "error", duration: 6000 });
  }

  // ------------------------------------------------------------------
  // Herkennen op de server (security audit AF-07 en AF-08)
  // ------------------------------------------------------------------

  // Wie is dit gezicht? Geeft de id van de medewerker of null. Is de server niet bereikbaar (geen
  // verbinding, geen antwoord binnen 5 seconden, een fout op de server of een foutpagina van de proxy),
  // dan ook null, en staat `recognitionOffline` aan zodat de melding dat kan zeggen (FaceController,
  // AutoScanController). Ieder volgend verzoek zet de vlag opnieuw.
  async recognizeFace(descriptor) {
    try {
      const result = await this.api.recognizeFace(descriptor);
      this.recognitionOffline = false;
      return typeof result.employeeId === "string" ? result.employeeId : null;
    } catch (error) {
      this.recognitionOffline = ServerError.isUnreachable(error);
      return null;
    }
  }

  // Van wie is deze pas? Geeft { ok: true, employeeId } (employeeId null als niemand) of
  // { ok: false, message }.
  async recognizeBadge(code) {
    try {
      const result = await this.api.recognizeBadge(code);
      return { ok: true, employeeId: typeof result.employeeId === "string" ? result.employeeId : null };
    } catch (error) {
      return { ok: false, message: ServerError.isUnreachable(error) ? ServerMode.MESSAGES.badgeOffline : error.message };
    }
  }

  // Koppelt een pas aan een medewerker. Geeft { ok: true } of { ok: false, message }. Na het koppelen
  // worden de gegevens opgehaald, zodat de tablet weet dat de medewerker een pas heeft.
  async linkBadge(employeeId, code) {
    try {
      await this.api.linkBadge(employeeId, code);
    } catch (error) {
      return { ok: false, message: ServerError.isUnreachable(error) ? ServerMode.MESSAGES.linkOffline : error.message };
    }
    await this.sync.pull().catch(() => {});
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Inloggen en uitloggen (aangeroepen door AdminController)
  // ------------------------------------------------------------------

  // Logt de beheerder in. Geeft { ok: true } of { ok: false, message }.
  async login(username, password) {
    // Wat de tablet nog in de wachtrij had, gaat eerst weg met de rechten van de tablet.
    await this.sync.push().catch(() => {});
    let result;
    try {
      result = await this.api.login(username, password);
    } catch (error) {
      return { ok: false, message: error.message };
    }

    this.role = "admin";
    this.username = result.username || null;
    this.device = result.device || this.device;
    this.store.setCaching(false);
    try {
      await this.sync.fullPull();
    } catch (error) {
      await this.api.logout().catch(() => {});
      this.role = this.device ? "device" : null;
      this.store.setCaching(this.role === "device");
      return { ok: false, message: "De gegevens konden niet worden opgehaald. Probeer het opnieuw." };
    }
    this.reloadModel();
    return { ok: true };
  }

  // Logt de beheerder uit. Een gekoppelde tablet gaat verder als tablet, met alleen de gegevens die
  // een tablet mag zien. Een andere browser gaat terug naar het inlogscherm.
  // Uitloggen en daarna sluiten roepen dit allebei aan. Het tweede verzoek wacht op het eerste, zodat
  // de server niet twee keer een uitlog krijgt (het tweede zou met een verouderde sleutel komen).
  logout() {
    if (this.role !== "admin") return Promise.resolve();
    this.loggingOut ??= this.endAdminSession().finally(() => {
      this.loggingOut = null;
    });
    return this.loggingOut;
  }

  async endAdminSession() {
    await this.sync.push().catch(() => {});
    let result = null;
    try {
      result = await this.api.logout();
    } catch (error) {
      result = null;
    }
    if (!result || result.role !== "device") {
      this.sync.stop();
      this.reload();
      return;
    }

    this.role = "device";
    this.username = null;
    this.device = result.device || this.device;
    this.store.setCaching(true);
    try {
      await this.sync.fullPull();
    } catch (error) {
      this.sync.stop();
      this.reload();
      return;
    }
    this.reloadModel();
  }

  // ------------------------------------------------------------------
  // Het inlogscherm voor een browser die nog niets is
  // ------------------------------------------------------------------

  showGate(message, { form = true, retry = false } = {}) {
    const $ = (selector) => this.doc.querySelector(selector);
    const gate = $("#serverGate");
    if (!gate) return;

    // De website zelf is niet gestart, dus de iconen in het inlogscherm worden hier gevuld.
    gate.querySelectorAll?.("[data-icon]").forEach((element) => {
      element.innerHTML = icon(element.dataset.icon);
    });
    $("#serverGateText").textContent = message;
    $("#serverGateForm").classList.toggle("hidden", !form);
    $("#serverGateRetry").classList.toggle("hidden", !retry);
    gate.classList.remove("hidden");
    $(".app-shell")?.setAttribute("inert", "");

    if (!this.gateReady) {
      this.gateReady = true;
      $("#serverGateForm").addEventListener("submit", (event) => this.submitGate(event));
      $("#serverGateRetry").addEventListener("click", () => this.reload());
    }
    if (form) $("#serverGateUsername").focus();
  }

  async submitGate(event) {
    event.preventDefault();
    const $ = (selector) => this.doc.querySelector(selector);
    const error = $("#serverGateError");
    const button = $("#serverGateForm button[type=submit]");
    const username = $("#serverGateUsername").value.trim();
    const password = $("#serverGatePassword").value;

    error.classList.add("hidden");
    if (!username || !password) {
      error.textContent = "Vul een gebruikersnaam en wachtwoord in.";
      error.classList.remove("hidden");
      return;
    }

    button.disabled = true;
    try {
      await this.api.login(username, password);
    } catch (failure) {
      error.textContent = failure.message;
      error.classList.remove("hidden");
      $("#serverGatePassword").value = "";
      button.disabled = false;
      return;
    }
    // Ingelogd: de pagina start opnieuw, nu met de gegevens van de server.
    this.reload();
  }

  // ------------------------------------------------------------------
  // Tabblad "Tablets en AFAS" (alleen de beheerder)
  // ------------------------------------------------------------------

  async renderServerTab() {
    if (this.role !== "admin" || !this.app?.adminLoggedIn) return;
    const $ = (selector) => this.doc.querySelector(selector);

    const account = $("#serverAccountName");
    if (account) account.textContent = this.username ? `Je bent ingelogd als ${this.username}.` : "";
    this.fillPointSelect($("#serverDevicePoint"), this.pointId);
    $("#serverDeviceStatus").textContent = this.device
      ? `Deze browser is gekoppeld als tablet "${this.device.name}" (${this.pointName(this.device.pointId)}).`
      : "Deze browser is nog geen tablet. Koppel hem hieronder, kies de locatie en log daarna uit.";
    $("#serverDeviceName").value = this.device?.name ?? "";

    this.renderUnits();
    try {
      const [{ devices }, { afas }] = await Promise.all([this.api.devices(), this.api.afasStatus()]);
      this.renderDevices(devices);
      this.renderAfasStatus(afas);
    } catch (error) {
      $("#serverDeviceList").textContent = error.message;
    }
  }

  // "Wachtwoord wijzigen" in het blok Mijn account. De server controleert het huidige wachtwoord (met
  // dezelfde blokkade als bij inloggen), zet het nieuwe en beëindigt alle andere sessies van deze
  // beheerder. Deze browser blijft ingelogd met een nieuwe sessie. Lukt het niet, dan staat de reden
  // onder het formulier.
  async changePassword(event) {
    event?.preventDefault?.();
    const $ = (selector) => this.doc.querySelector(selector);
    const current = $("#serverPasswordCurrent");
    const next = $("#serverPasswordNew");
    const repeat = $("#serverPasswordRepeat");
    const error = $("#serverPasswordError");
    const button = $("#serverPasswordForm button[type=submit]");
    const show = (message) => {
      error.textContent = message;
      error.classList.toggle("hidden", !message);
    };
    const { PASSWORD_TEXTS } = ServerMode;

    show("");
    if (!current.value || !next.value || !repeat.value) return show(PASSWORD_TEXTS.required);
    if (next.value.length < 12) return show(PASSWORD_TEXTS.tooShort);
    if (next.value !== repeat.value) return show(PASSWORD_TEXTS.different);

    if (button) button.disabled = true;
    let result;
    try {
      result = await this.api.changePassword(current.value, next.value);
    } catch (failure) {
      if (button) button.disabled = false;
      current.value = "";
      return show(failure.message);
    }
    if (button) button.disabled = false;
    current.value = "";
    next.value = "";
    repeat.value = "";
    // Kon de server geen nieuwe sessie maken, dan is de beheerder uitgelogd.
    if (result?.role !== "admin") {
      this.sync.stop();
      this.reload();
      return;
    }
    this.app?.view?.showToast?.(PASSWORD_TEXTS.changed, { tone: "success", duration: 6000 });
  }

  // De keuzelijst met consumptiepunten, met "Geen locatie" (of een andere tekst) bovenaan.
  fillPointSelect(select, selected, noneLabel = "Geen locatie") {
    select.replaceChildren();
    const none = this.doc.createElement("option");
    none.value = "";
    none.textContent = noneLabel;
    select.append(none);
    for (const point of this.app?.model?.points ?? []) {
      const option = this.doc.createElement("option");
      option.value = point.id;
      option.textContent = `${point.name} (${this.app.model.companyName(point.companyId)})`;
      select.append(option);
    }
    select.value = selected ?? "";
  }

  pointName(pointId) {
    return this.app?.model?.findPoint?.(pointId)?.name ?? "geen locatie";
  }

  renderDevices(devices) {
    const list = this.doc.querySelector("#serverDeviceList");
    list.replaceChildren();
    if (devices.length === 0) {
      list.textContent = "Er zijn nog geen tablets gekoppeld.";
      return;
    }

    for (const device of devices) {
      const item = this.doc.createElement("div");
      item.className = "admin-employee-item";

      const name = this.doc.createElement("strong");
      name.textContent = device.id === this.device?.id ? `${device.name} (deze tablet)` : device.name;
      const select = this.doc.createElement("select");
      select.setAttribute("aria-label", `Locatie van ${device.name}`);
      this.fillPointSelect(select, device.pointId);
      const label = this.doc.createElement("span");
      label.append(name, select);

      const actions = this.doc.createElement("div");
      actions.className = "admin-item-actions";
      const save = this.doc.createElement("button");
      save.type = "button";
      save.className = "table-action";
      save.textContent = "Locatie opslaan";
      save.addEventListener("click", () => this.saveDeviceLocation(device, select.value || null));
      const revoke = this.doc.createElement("button");
      revoke.type = "button";
      revoke.className = "table-action danger-action";
      revoke.textContent = "Intrekken";
      revoke.addEventListener("click", () => this.revokeDevice(device));
      actions.append(save, revoke);

      item.append(label, actions);
      list.append(item);
    }
  }

  // De afdelingen uit AFAS met het aantal medewerkers en een keuzelijst voor het consumptiepunt (FR-102).
  renderUnits() {
    const list = this.doc.querySelector("#serverUnitList");
    if (!list) return;
    list.replaceChildren();
    const units = this.app?.model?.unitsOverview?.() ?? [];
    if (units.length === 0) {
      list.textContent = "Er zijn nog geen afdelingen. Ze komen uit AFAS na Nu synchroniseren.";
      return;
    }

    for (const { unit, count, pointId } of units) {
      const item = this.doc.createElement("div");
      item.className = "admin-employee-item";
      const name = this.doc.createElement("strong");
      name.textContent = unit;
      const amount = this.doc.createElement("small");
      amount.textContent = count === 1 ? "1 medewerker" : `${count} medewerkers`;
      const select = this.doc.createElement("select");
      select.setAttribute("aria-label", `Consumptiepunt van ${unit}`);
      this.fillPointSelect(select, pointId, "Geen consumptiepunt");
      const label = this.doc.createElement("span");
      label.append(name, amount, select);

      const actions = this.doc.createElement("div");
      actions.className = "admin-item-actions";
      const save = this.doc.createElement("button");
      save.type = "button";
      save.className = "table-action";
      save.textContent = "Opslaan";
      save.addEventListener("click", () => this.saveUnitPoint(unit, select.value || null));
      actions.append(save);

      item.append(label, actions);
      list.append(item);
    }
  }

  // Koppelt een afdeling aan een consumptiepunt (of los). Medewerkers zonder punt krijgen het meteen.
  saveUnitPoint(unit, pointId) {
    let assigned = 0;
    const pointName = pointId ? this.pointName(pointId) : "geen consumptiepunt";
    const saved = this.app.persist(
      () => {
        const result = this.app.model.assignUnitToPoint(unit, pointId);
        assigned = result === false ? 0 : result;
        return result !== false;
      },
      { action: "Afdeling gekoppeld", details: `${unit}: ${pointName}` }
    );
    if (!saved) return false;
    this.app.view.renderAll?.();
    const message = assigned === 0
      ? `${unit} is opgeslagen.`
      : `${unit} is opgeslagen. ${assigned === 1 ? "1 medewerker kreeg" : `${assigned} medewerkers kregen`} dit consumptiepunt.`;
    this.app.view.showToast(message, { tone: "success", duration: 5000 });
    this.renderUnits();
    return true;
  }

  renderAfasStatus(afas, notes = []) {
    const $ = (selector) => this.doc.querySelector(selector);
    const moment = (value) => (value ? new Date(value).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" }) : null);
    const parts = [];
    if (!afas?.available) parts.push("De koppeling met AFAS is op deze server niet ingesteld.");
    if (afas?.lastSuccessAt) parts.push(`Laatst gelukt: ${moment(afas.lastSuccessAt)}.`);
    if (afas?.lastFailureAt && (!afas.lastSuccessAt || afas.lastFailureAt > afas.lastSuccessAt)) parts.push(`Laatst mislukt: ${moment(afas.lastFailureAt)}.`);
    if (afas?.lastMessage) parts.push(afas.lastMessage);
    if (parts.length === 0) parts.push("Er is nog niet gesynchroniseerd.");
    $("#serverAfasStatus").textContent = parts.join(" ");
    $("#serverAfasButton").disabled = !afas?.available;

    const list = $("#serverAfasNotes");
    list.replaceChildren();
    for (const note of notes) {
      const item = this.doc.createElement("li");
      item.textContent = note;
      list.append(item);
    }
  }

  async linkThisDevice(event) {
    event.preventDefault();
    const $ = (selector) => this.doc.querySelector(selector);
    const name = $("#serverDeviceName").value.trim();
    if (!name) {
      this.app.view.showToast("Geef de tablet een naam.", { tone: "error" });
      return;
    }
    try {
      const { device } = await this.api.linkDevice(name, $("#serverDevicePoint").value || null);
      this.device = device;
      this.app.view.showToast("Deze browser is gekoppeld als tablet. Log uit om hem als tablet te gebruiken.", { tone: "success", duration: 6000 });
      this.applyLocation();
      this.app.view.renderAll?.();
    } catch (error) {
      this.app.view.showToast(error.message, { tone: "error", duration: 6000 });
    }
    this.renderServerTab();
  }

  async saveDeviceLocation(device, pointId) {
    try {
      const result = await this.api.updateDevice(device.id, device.name, pointId);
      if (device.id === this.device?.id) {
        this.device = result.device;
        this.applyLocation();
        this.app.view.renderAll?.();
      }
      this.app.view.showToast("De locatie van de tablet is opgeslagen.", { tone: "success" });
    } catch (error) {
      this.app.view.showToast(error.message, { tone: "error", duration: 6000 });
    }
    this.renderServerTab();
  }

  async revokeDevice(device) {
    if (!globalThis.confirm?.(`Tablet "${device.name}" intrekken? Die tablet kan daarna niet meer registreren tot hij opnieuw wordt gekoppeld.`)) return;
    try {
      await this.api.revokeDevice(device.id);
      if (device.id === this.device?.id) {
        this.device = null;
        this.applyLocation();
      }
      this.app.view.showToast("De tablet is ingetrokken.", { tone: "success" });
    } catch (error) {
      this.app.view.showToast(error.message, { tone: "error", duration: 6000 });
    }
    this.renderServerTab();
  }

  // Knop "Nu synchroniseren": de server haalt de medewerkers bij AFAS op. De browser krijgt alleen
  // aantallen en opmerkingen terug, en daarna de gewijzigde medewerkers via het gewone ophalen.
  async runAfasSync() {
    const button = this.doc.querySelector("#serverAfasButton");
    button.disabled = true;
    this.doc.querySelector("#serverAfasStatus").textContent = "Bezig met synchroniseren...";
    try {
      const result = await this.api.afasSync();
      this.renderAfasStatus(result.afas ?? { available: true, lastMessage: result.message }, result.notes ?? []);
      this.app.view.showToast(result.ok ? "De medewerkers zijn gesynchroniseerd met AFAS." : "Synchroniseren met AFAS is mislukt. Er is niets gewijzigd.", result.ok ? { tone: "success" } : { tone: "error", duration: 8000 });
      if (result.ok) await this.sync.pull();
    } catch (error) {
      this.doc.querySelector("#serverAfasStatus").textContent = error.message;
      button.disabled = false;
    }
  }
}
