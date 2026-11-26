/**
 * ServerDataStore — de opslag van de website als die met een server werkt.
 *
 * In de demo bewaart DataStore alles in de browser (localStorage). Met een server staan de gegevens
 * in de database van de server. Deze class houdt ze in het geheugen, in dezelfde vorm als DataStore,
 * zodat het model en de rest van de website niet anders hoeven te werken:
 *
 *   - `load` geeft de gegevens die van de server zijn opgehaald, na dezelfde controle als DataStore;
 *   - `save` bewaart de nieuwe gegevens in het geheugen en kijkt wat er is veranderd ten opzichte
 *     van wat het model het laatst heeft geladen of opgeslagen. Die wijzigingen komen in een
 *     wachtrij (`pending`). ServerSync stuurt de wachtrij naar de server;
 *   - `applyServerChanges` verwerkt wat ServerSync van de server heeft opgehaald. Voor het model is
 *     dat hetzelfde als een wijziging uit een ander tabblad: de volgende `save` meldt "conflict" en
 *     het model laadt eerst opnieuw (zie RegistrationApp.persist en handleStorageChange).
 *
 * Wat de controle bij het laden afkeurt, blijft op de server staan. Het model ziet zo'n regel niet,
 * en er wordt ook geen "verwijderd" voor naar de server gestuurd: de wachtrij vergelijkt alleen wat
 * het model zelf heeft geladen en opgeslagen.
 *
 * Alleen op een gekoppelde tablet (`cache` meegegeven) staan de gegevens en de wachtrij ook in de
 * browser. Zo gaat een registratie niet verloren als de verbinding even wegvalt of de tablet opnieuw
 * start. Een tablet krijgt van de server geen looncodes en personeelsnummers, dus die staan daar niet
 * bij. Is de beheerder ingelogd, dan wordt er niets in de browser bewaard.
 *
 * Reservekopieën maakt deze opslag niet: de database van de server is de bron.
 */
import { DataStore } from "./DataStore.js";

// De lijsten die met de server worden uitgewisseld (gelijk aan RecordStore::COLLECTIONS).
export const SYNC_LISTS = ["employees", "registrations", "products", "companies", "points", "auditLog", "faceEnrollments", "faceOffers"];

// Een lege verzameling gegevens: alle lijsten zonder regels.
const emptyState = () => Object.fromEntries(SYNC_LISTS.map((list) => [list, []]));

const pendingKey = (collection, id) => `${collection}/${id}`;

export class ServerDataStore extends DataStore {
  // `cache` is een opslag met getItem, setItem en removeItem (localStorage), of null.
  constructor(key, cache = null) {
    super(key);
    this.cache = cache;
    this.caching = cache !== null;
    this.text = null;
    this.lastSeen = null;
    // Per lijst de regels zoals het model ze het laatst heeft geladen of opgeslagen (id → JSON-tekst).
    this.baseline = new Map(SYNC_LISTS.map((list) => [list, new Map()]));
    // De wachtrij: wijzigingen die nog naar de server moeten (sleutel "lijst/id").
    this.pending = new Map();
    // Wordt aangeroepen als er iets in de wachtrij is gekomen (zie ServerSync).
    this.onQueued = null;
  }

  // ------------------------------------------------------------------
  // Wat het model gebruikt (zelfde namen als DataStore)
  // ------------------------------------------------------------------

  load(now = new Date()) {
    this.loadProblem = null;
    this.lastSeen = this.text;
    if (!this.text) {
      this.rememberBaseline(emptyState());
      return null;
    }

    try {
      const parsed = JSON.parse(this.text);
      const migrated = this.migrate(parsed, now);
      const data = this.removeInvalidItems(migrated, now);
      if (this.countSkipped(parsed, data) + this.repairedBadges > 0) this.loadProblem = "skipped";
      this.rememberBaseline(data);
      return data;
    } catch (error) {
      this.loadProblem = "unreadable";
      console.warn("De gegevens van de server konden niet worden gelezen.", error);
      return null;
    }
  }

  save(data) {
    this.saveProblem = null;
    // Zijn er intussen wijzigingen van de server verwerkt die het model nog niet heeft geladen, dan
    // eerst opnieuw laden. Anders zou deze opslag die wijzigingen stil overschrijven.
    if (this.text !== this.lastSeen) {
      this.saveProblem = "conflict";
      return false;
    }

    let text;
    try {
      text = JSON.stringify(data);
    } catch (error) {
      this.saveProblem = "failed";
      return false;
    }

    const changes = this.changesSinceBaseline(data);
    this.text = text;
    this.lastSeen = text;
    this.rememberBaseline(data);
    for (const change of changes) this.pending.set(pendingKey(change.collection, change.id), change);
    this.writeCache();
    if (changes.length > 0) this.onQueued?.();
    return true;
  }

  // Geen reservekopieën en geen "alles wissen" in de browser: de gegevens staan op de server.
  keepBackup() {}

  pruneBackups() {}

  clearAll() {
    return false;
  }

  // ------------------------------------------------------------------
  // Wat ServerSync gebruikt
  // ------------------------------------------------------------------

  // De wijzigingen die nog naar de server moeten.
  pendingChanges() {
    return [...this.pending.values()];
  }

  // De server heeft deze wijzigingen ontvangen. Een regel die intussen opnieuw is gewijzigd, blijft
  // in de wachtrij staan.
  confirmPushed(sent) {
    for (const change of sent) {
      const key = pendingKey(change.collection, change.id);
      if (this.pending.get(key) === change) this.pending.delete(key);
    }
    this.writeCache();
  }

  // Verwerkt wijzigingen van de server. Met `replace` vervangen ze alles wat er stond (de eerste keer
  // ophalen, of na in- of uitloggen van de beheerder). Een regel met een wijziging in de wachtrij
  // blijft zoals hij hier is: die wijziging moet eerst naar de server.
  // Geeft true terug als de gegevens zijn veranderd. Het model moet dan opnieuw laden.
  applyServerChanges(changes, { replace = false } = {}) {
    let state = emptyState();
    if (!replace && this.text) {
      try {
        state = { ...emptyState(), ...JSON.parse(this.text) };
      } catch (error) {
        state = emptyState();
      }
    }

    for (const change of changes) {
      if (!SYNC_LISTS.includes(change?.collection) || typeof change.id !== "string") continue;
      if (!replace && this.pending.has(pendingKey(change.collection, change.id))) continue;
      state[change.collection] = this.withChange(state[change.collection], change);
    }
    // Na vervangen komen de eigen wijzigingen die nog onderweg zijn er weer bovenop.
    if (replace) {
      for (const change of this.pending.values()) state[change.collection] = this.withChange(state[change.collection], change);
    }

    const text = JSON.stringify(state);
    if (text === this.text) return false;
    this.text = text;
    this.writeCache();
    return true;
  }

  // Zet het bewaren in de browser aan of uit (uit zolang de beheerder is ingelogd).
  setCaching(enabled) {
    this.caching = Boolean(enabled) && this.cache !== null;
  }

  // Leest de gegevens en de wachtrij die een tablet in de browser heeft bewaard. Geeft het volgnummer
  // terug waarmee verder kan worden opgehaald, of null als er niets bruikbaars stond.
  restoreCache() {
    if (!this.cache) return null;
    try {
      const stored = JSON.parse(this.cache.getItem(this.cacheKey()) || "null");
      if (!stored || typeof stored.text !== "string" || !Array.isArray(stored.pending)) return null;
      this.text = stored.text;
      this.pending = new Map(
        stored.pending
          .filter((change) => SYNC_LISTS.includes(change?.collection) && typeof change.id === "string")
          .map((change) => [pendingKey(change.collection, change.id), change])
      );
      return Number.isSafeInteger(stored.version) ? stored.version : 0;
    } catch (error) {
      return null;
    }
  }

  // Het volgnummer van de server dat bij de bewaarde gegevens hoort (zie ServerSync).
  setVersion(version) {
    this.version = version;
    this.writeCache();
  }

  // Wist wat er in de browser is bewaard (bijvoorbeeld als de tablet is ingetrokken).
  forgetCache() {
    try {
      this.cache?.removeItem(this.cacheKey());
    } catch (error) {
      // Niets te wissen.
    }
  }

  // ------------------------------------------------------------------
  // Hulpfuncties
  // ------------------------------------------------------------------

  cacheKey() {
    return `${this.key}-server`;
  }

  // De kenmerken van gezichten (faceEnrollments) zijn biometrische gegevens. Die komen nooit in de
  // opslag van de browser: ze staan alleen in het geheugen en komen bij iedere start opnieuw van de
  // server. Zonder verbinding bij het starten werkt herkennen met de camera dus pas als de verbinding
  // terug is. Een gezicht dat nog in de wachtrij stond, moet dan opnieuw worden ingesteld.
  writeCache() {
    if (!this.caching) return;
    try {
      let text = this.text;
      if (text) {
        const state = JSON.parse(text);
        state.faceEnrollments = [];
        text = JSON.stringify(state);
      }
      const pending = this.pendingChanges().filter((change) => change.collection !== "faceEnrollments");
      this.cache.setItem(this.cacheKey(), JSON.stringify({ version: this.version ?? 0, text, pending }));
    } catch (error) {
      // De opslag van de browser is vol of geblokkeerd. De gegevens staan nog in het geheugen en
      // gaan gewoon naar de server. Alleen opstarten zonder verbinding werkt dan niet.
      console.warn("De gegevens konden niet in de browser worden bewaard.", error);
    }
  }

  // Een lijst met één wijziging verwerkt: de regel vervangen op zijn plek, achteraan toevoegen of weghalen.
  withChange(list, change) {
    const rows = Array.isArray(list) ? list : [];
    const index = rows.findIndex((row) => row?.id === change.id);
    if (change.data === null || change.data === undefined) {
      return index < 0 ? rows : rows.filter((row) => row?.id !== change.id);
    }
    if (index < 0) return [...rows, change.data];
    return rows.map((row, position) => (position === index ? change.data : row));
  }

  rememberBaseline(data) {
    this.baseline = new Map(
      SYNC_LISTS.map((list) => [
        list,
        new Map((Array.isArray(data?.[list]) ? data[list] : []).filter((row) => typeof row?.id === "string").map((row) => [row.id, JSON.stringify(row)]))
      ])
    );
  }

  // Wat is er anders dan wat het model het laatst heeft geladen of opgeslagen?
  changesSinceBaseline(data) {
    const changes = [];
    for (const list of SYNC_LISTS) {
      const before = this.baseline.get(list);
      const seen = new Set();
      for (const row of Array.isArray(data?.[list]) ? data[list] : []) {
        if (typeof row?.id !== "string") continue;
        seen.add(row.id);
        if (before.get(row.id) !== JSON.stringify(row)) changes.push({ collection: list, id: row.id, data: row });
      }
      for (const id of before.keys()) {
        if (!seen.has(id)) changes.push({ collection: list, id, data: null });
      }
    }
    return changes;
  }
}
