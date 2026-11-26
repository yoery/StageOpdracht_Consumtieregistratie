/**
 * ServerSync — houdt de gegevens van deze browser gelijk aan die van de server.
 *
 * Twee richtingen:
 *   - wegsturen (`push`): de wijzigingen uit de wachtrij van ServerDataStore gaan naar de server,
 *     kort nadat ze zijn gemaakt. Lukt dat niet (geen verbinding), dan blijven ze in de wachtrij en
 *     volgt later een nieuwe poging. Een registratie gaat dus niet verloren;
 *   - ophalen (`pull`): iedere paar seconden vraagt de browser wat er op de server is veranderd
 *     sinds het laatste volgnummer. Zo ziet een tablet de registraties en medewerkers van een andere
 *     tablet en van de beheerder.
 *
 * Weigert de server een wijziging (bijvoorbeeld omdat een tablet iets probeert wat alleen de
 * beheerder mag), dan worden alle gegevens opnieuw opgehaald. Wat hier stond, wordt dan vervangen
 * door wat de server heeft.
 *
 * Verbonden met:
 *   - ServerApi: de verzoeken aan de server;
 *   - ServerDataStore: de gegevens en de wachtrij;
 *   - ServerMode: start en stopt het uitwisselen en laat het model opnieuw laden (`onRemoteChange`).
 */
export class ServerSync {
  static PULL_INTERVAL_MS = 8000;
  static PUSH_DELAY_MS = 150;
  static RETRY_MS = 5000;

  // `timers` is mee te geven, zodat de tests de tijd kunnen nabootsen.
  constructor({ api, store, onRemoteChange = () => {}, onStatus = () => {}, timers = globalThis }) {
    this.api = api;
    this.store = store;
    this.onRemoteChange = onRemoteChange;
    this.onStatus = onStatus;
    this.timers = timers;
    this.version = 0;
    this.pushing = null;
    this.pushTimer = null;
    this.pullTimer = null;
    this.online = true;
    this.store.onQueued = () => this.schedulePush();
  }

  // Haalt alles opnieuw op en vervangt wat er stond. Nodig bij het opstarten en na in- of uitloggen
  // van de beheerder, omdat de server dan andere gegevens geeft (zie Policy.php).
  async fullPull() {
    const result = await this.api.pull(0);
    this.setVersion(result.version);
    return this.store.applyServerChanges(result.changes, { replace: true });
  }

  // Haalt op wat er sinds het laatste volgnummer is veranderd.
  async pull() {
    const result = await this.api.pull(this.version);
    const changed = this.store.applyServerChanges(result.changes);
    this.setVersion(result.version);
    if (changed) this.onRemoteChange();
    return changed;
  }

  // Stuurt de wachtrij weg. Loopt er al een verzoek, dan wacht deze aanroep daarop en stuurt daarna
  // wat er intussen is bijgekomen.
  async push() {
    if (this.pushing) {
      await this.pushing.catch(() => {});
    }
    const sent = this.store.pendingChanges();
    if (sent.length === 0) return true;

    this.pushing = this.sendChanges(sent);
    try {
      return await this.pushing;
    } finally {
      this.pushing = null;
    }
  }

  async sendChanges(sent) {
    const result = await this.api.push(sent);
    this.store.confirmPushed(sent);
    if (Array.isArray(result.rejected) && result.rejected.length > 0) {
      // De server heeft iets geweigerd: wat hier staat, klopt niet meer met de server.
      if (await this.fullPull()) this.onRemoteChange();
      this.onStatus("rejected", result.rejected.length);
    } else {
      // Meteen ophalen: de server kan een regel hebben aangevuld (de prijs en het werkgevernummer
      // van een registratie), en zo komen ook wijzigingen van anderen mee.
      await this.pull();
    }
    return true;
  }

  // Plant het wegsturen kort na een wijziging, zodat een paar wijzigingen achter elkaar samen gaan.
  schedulePush(delay = ServerSync.PUSH_DELAY_MS) {
    if (this.pushTimer !== null) this.timers.clearTimeout(this.pushTimer);
    this.pushTimer = this.timers.setTimeout(() => {
      this.pushTimer = null;
      this.run(() => this.push());
    }, delay);
  }

  // Start het regelmatig ophalen. Staat er nog iets in de wachtrij (van vóór een herstart), dan gaat
  // dat eerst weg.
  start() {
    this.stop();
    this.pullTimer = this.timers.setInterval(() => this.run(() => this.tick()), ServerSync.PULL_INTERVAL_MS);
    if (this.store.pendingChanges().length > 0) this.schedulePush(0);
  }

  stop() {
    if (this.pullTimer !== null) this.timers.clearInterval(this.pullTimer);
    if (this.pushTimer !== null) this.timers.clearTimeout(this.pushTimer);
    this.pullTimer = null;
    this.pushTimer = null;
  }

  // Eén ronde: eerst wegsturen wat er nog staat, anders ophalen.
  async tick() {
    if (this.store.pendingChanges().length > 0) return this.push();
    return this.pull();
  }

  // Voert een ronde uit en vangt fouten op. Zonder verbinding blijft alles in de wachtrij staan en
  // volgt vanzelf een nieuwe poging. De status gaat naar ServerMode, die de gebruiker een melding geeft.
  async run(work) {
    try {
      await work();
      if (!this.online) {
        this.online = true;
        this.onStatus("online");
      }
    } catch (error) {
      if (error?.status === 401) {
        this.onStatus("signed-out");
        return;
      }
      if (this.online) {
        this.online = false;
        this.onStatus("offline");
      }
      if (this.store.pendingChanges().length > 0) this.schedulePush(ServerSync.RETRY_MS);
    }
  }

  setVersion(version) {
    this.version = Number.isSafeInteger(version) ? version : this.version;
    this.store.setVersion(this.version);
  }
}
