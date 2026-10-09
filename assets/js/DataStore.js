import { DEFAULT_PRODUCTS, DEFAULT_COMPANIES, COLORS } from "./config.js";
import { createId } from "./ids.js";

// Oude product-id's uit een eerdere versie en hun nieuwe naam.
const OLD_PRODUCT_IDS = {
  melk: "glas-melk",
  brood: "sneetje-brood"
};

// Toegestane tekens in een id: letters, cijfers, - en _ (maximaal 64 tekens).
// UUID's en id's als "blikje" of "glas-melk" passen hierin.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Namen die in JavaScript een speciale betekenis hebben voor objecten. Een id met zo'n naam
// zou bij het opbouwen van een voorraadlijst ({ [id]: ... }) de werking van het object
// veranderen; daarom zijn ze als id niet toegestaan.
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"]);

// Maximale lengte van tekst (namen, codes, logboekregels). Langere waarden zijn vrijwel zeker
// geknoeid en kunnen de pagina onbruikbaar maken. De formulieren laten maximaal 100 tekens toe.
const MAX_TEXT = 200;
const MAX_CODE = 64;
const MAX_AUDIT_TEXT = 500;

// Een pasnummer (van de NFC-pas, zie BadgeReader.js) bestaat alleen uit hoofdletters en cijfers,
// hooguit 64 tekens. Leeg ("") betekent: geen pas gekoppeld.
const SAFE_BADGE_ID = /^[A-Z0-9]{0,64}$/;

// Een kleur moet een hexcode met zes tekens zijn, bijvoorbeeld #d8f1e8.
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

// De hoogste prijs die we als geldig accepteren. Een hogere prijs is vrijwel zeker een
// typefout of geknoeide gegevens.
const MAX_PRICE = 1000;

// Hoe ver een registratie in de toekomst mag liggen ten opzichte van het moment van laden:
// één dag (in milliseconden). Een klein verschil kan ontstaan doordat de klok van een tablet
// iets afwijkt; een registratie die meer dan een dag later ligt, is vrijwel zeker geknoeid.
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/**
 * DataStore — de opslaglaag: leest en schrijft alle gegevens in de browser (localStorage).
 *
 * Verantwoordelijkheid:
 *   - de opgeslagen JSON lezen en controleren of die compleet en geldig is;
 *   - gegevens uit een oudere versie omzetten naar de huidige opbouw (migratie);
 *   - de volledige status opslaan.
 *
 * Verbonden met:
 *   - RegistrationModel: krijgt een DataStore mee in de constructor en roept load() en save() aan.
 *   - config.js: standaardproducten, bedrijven en kleuren voor het omzetten van oude gegevens.
 *   - ids.js: maakt de id's van bedrijven en consumptiepunten die bij het omzetten ontstaan.
 *
 * Alleen deze class weet dat de gegevens in localStorage staan. Voor een echte database
 * kan een andere class met dezelfde methodes load() en save() worden gebruikt; de rest
 * van de applicatie hoeft dan niet te veranderen.
 */
export class DataStore {
  // De sleutel waaronder de gegevens in localStorage staan.
  // `loadProblem` zegt na load() of er iets mis was met de opgeslagen gegevens:
  //   null         = alles goed;
  //   "skipped"    = een paar beschadigde regels zijn overgeslagen, de rest is geladen;
  //   "unreadable" = de gegevens waren helemaal onleesbaar; het model start met demogegevens;
  //   "unavailable" = de browseropslag kon niet worden gelezen (bijvoorbeeld geblokkeerd). Dan is
  //                   niet bekend of er gegevens zijn; er mag dus ook niets als "leeg" worden behandeld.
  // In beide gevallen staat er een reservekopie van de oorspronkelijke gegevens in localStorage.
  constructor(key) {
    this.key = key;
    this.loadProblem = null;
  }

  // ------------------------------------------------------------------
  // Lezen en opslaan
  // ------------------------------------------------------------------

  // Leest de opgeslagen gegevens. Geeft null terug als er niets is opgeslagen of als de
  // gegevens helemaal onleesbaar zijn; het model start dan met demogegevens.
  // Losse beschadigde regels (bijvoorbeeld een registratie met een kapotte datum, een
  // registratie van meer dan een dag in de toekomst of een tweede regel met dezelfde id) worden
  // overgeslagen, zodat niet alle andere gegevens verloren gaan.
  // `now` is het moment van laden; de datums worden daarmee vergeleken. Het is mee te geven,
  // zodat dit met vaste datums te testen is.
  load(now = new Date()) {
    this.loadProblem = null;

    let value;
    try {
      value = localStorage.getItem(this.key);
    } catch (error) {
      this.loadProblem = "unavailable";
      return null;
    }
    if (!value) return null;

    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Geen object");

      const migrated = this.migrate(parsed, now);
      const data = this.removeInvalidItems(migrated, now);
      const skipped = this.countSkipped(parsed, data);

      if (skipped > 0) {
        this.keepBackup(value);
        this.loadProblem = "skipped";
        console.warn(`${skipped} beschadigde regel(s) in de opgeslagen gegevens overgeslagen; er is een reservekopie gemaakt.`);
      }

      return data;
    } catch (error) {
      this.keepBackup(value);
      this.loadProblem = "unreadable";
      console.warn("Opgeslagen gegevens konden niet worden gelezen; de demo wordt opnieuw gestart. Er is een reservekopie gemaakt.", error);
      return null;
    }
  }

  // Bewaart de oorspronkelijke (beschadigde) gegevens onder een eigen sleutel, zodat ze niet
  // verloren gaan als de applicatie daarna nieuwe gegevens opslaat.
  // Er zijn hooguit twee reservekopieën, zodat de opslag niet volloopt:
  //   "<sleutel>-backup"         = de eerste kopie; die wordt nooit overschreven;
  //   "<sleutel>-backup-laatste" = de nieuwste andere kopie; die wordt steeds vervangen.
  // Staat dezelfde kopie er al als eerste kopie, dan gebeurt er niets.
  keepBackup(value) {
    try {
      const [firstKey, latestKey] = this.backupKeys();
      const existing = localStorage.getItem(firstKey);
      if (existing === value) return;

      localStorage.setItem(existing === null ? firstKey : latestKey, value);
    } catch (error) {
      // Geen ruimte voor een reservekopie: dan blijft alleen de melding in de console.
    }
  }

  // De twee sleutels van de reservekopieën: de eerste en de laatste.
  backupKeys() {
    return [`${this.key}-backup`, `${this.key}-backup-laatste`];
  }

  // Wist alle gegevens van deze applicatie uit de browser: de gegevens zelf, beide
  // reservekopieën en oude kopieën met een tijdstempel ("<sleutel>-backup-1726000000000")
  // uit een eerdere versie. Wordt gebruikt door de knop "Alle gegevens wissen".
  // De nep-opslag in de tests kent geen `length` en `key()`; dan worden alleen de vaste
  // sleutels gewist.
  clearAll() {
    try {
      const keys = [this.key, ...this.backupKeys(), ...this.oldBackupKeys()];
      for (const key of keys) localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error("De gegevens konden niet worden gewist.", error);
      return false;
    }
  }

  // Zoekt de oude reservekopieën met een tijdstempel achter de naam. Alleen mogelijk als de
  // opslag kan opsommen welke sleutels er zijn (localStorage.length en localStorage.key).
  oldBackupKeys() {
    if (typeof localStorage.length !== "number" || typeof localStorage.key !== "function") return [];

    const prefix = `${this.key}-backup-`;
    const found = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length))) found.push(key);
    }
    return found;
  }

  // Schrijft de volledige applicatiestatus naar de browseropslag.
  // Geeft false terug als dat niet lukt, bijvoorbeeld omdat de opslag vol is.
  save(data) {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("De gegevens konden niet worden opgeslagen.", error);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Controleren
  // ------------------------------------------------------------------

  // De controle per soort gegeven. Wordt gebruikt om beschadigde regels over te slaan.
  // `now` is het moment van laden (zie load); registraties worden daarmee vergeleken.
  validators(now = new Date()) {
    return {
      employees: (employee) => this.isValidEmployee(employee),
      registrations: (registration) => this.isValidRegistration(registration, now),
      products: (product) => this.isValidProduct(product),
      companies: (company) => this.isValidCompany(company),
      points: (point) => this.isValidPoint(point)
    };
  }

  // Zijn alle onderdelen aanwezig en in de juiste vorm, en komt iedere id per lijst maar één
  // keer voor (zie hasUniqueIds)?
  isValid(data, now = new Date()) {
    return Object.entries(this.validators(now)).every(
      ([name, check]) => this.allValid(data?.[name], check) && this.hasUniqueIds(data[name])
    );
  }

  // Hulpfunctie: is dit een lijst waarvan ieder item de controle doorstaat?
  allValid(list, check) {
    return Array.isArray(list) && list.every(check);
  }

  // Hulpfunctie: komt iedere id in deze lijst maar één keer voor?
  hasUniqueIds(list) {
    return this.withoutDuplicateIds(list).length === list.length;
  }

  // Geeft de lijst terug waarin iedere id maar één keer voorkomt: de eerste regel met een id
  // blijft staan, latere regels met dezelfde id vallen af. Regels zonder id (zoals heel oude
  // logboekregels) blijven altijd staan.
  // Twee regels met dezelfde id zijn vrijwel zeker geknoeid of half gekopieerd. Zonder deze stap
  // zou bijvoorbeeld "Wijzigen" of "Verwijderen" op de ene regel ook de andere raken.
  withoutDuplicateIds(list) {
    const seen = new Set();

    return list.filter((item) => {
      if (item?.id === undefined || item?.id === null) return true;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  // Geeft de gegevens terug zonder de regels die de controle niet doorstaan en zonder tweede
  // regels met een id die al eerder in dezelfde lijst stond (zie withoutDuplicateIds).
  // Ook het logboek wordt zo opgeschoond. De afgevallen regels tellen in countSkipped mee, zodat
  // load() een reservekopie maakt en loadProblem op "skipped" zet (de controller toont dan een melding).
  removeInvalidItems(data, now = new Date()) {
    const cleaned = { ...data };

    for (const [name, check] of Object.entries(this.validators(now))) {
      cleaned[name] = this.withoutDuplicateIds(data[name].filter(check));
    }
    if (Array.isArray(data.auditLog)) cleaned.auditLog = this.withoutDuplicateIds(data.auditLog);

    return cleaned;
  }

  // Hoeveel regels uit de opgeslagen gegevens zijn er na het controleren afgevallen?
  // (Lijsten die bij het omzetten zijn aangevuld, zoals de standaardproducten, tellen niet als verlies.)
  countSkipped(stored, cleaned) {
    const lists = [...Object.keys(this.validators()), "auditLog"];

    return lists.reduce((total, name) => {
      const storedCount = Array.isArray(stored[name]) ? stored[name].length : 0;
      return total + Math.max(0, storedCount - cleaned[name].length);
    }, 0);
  }

  // Is dit een object (en geen null, tekst of getal)? Andere waarden in een lijst worden overgeslagen.
  isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  // Is dit een veilige id: alleen letters, cijfers, - en _ (zie SAFE_ID)?
  // De view zet id's in HTML-attributen, zoals data-edit-product="...". Een id met tekens als
  // " < > zou daar uit het attribuut kunnen breken en eigen HTML of CSS op de pagina zetten
  // (bijvoorbeeld als iemand de opgeslagen gegevens in de browser heeft aangepast).
  // Daarom wordt iedere id en iedere verwijzing naar een id bij het laden hiermee gecontroleerd.
  isSafeId(value) {
    return typeof value === "string" && SAFE_ID.test(value) && !RESERVED_IDS.has(value);
  }

  // Is dit tekst van hooguit `maxLength` tekens? Met `required` mag de tekst niet leeg zijn.
  // Codes (looncode, personeelsnummer) kunnen in oude gegevens ook een getal zijn; daarom wordt
  // de lengte van de tekstvorm gecontroleerd.
  isText(value, maxLength = MAX_TEXT, { required = false } = {}) {
    if (typeof value !== "string") return false;
    if (required && value.trim() === "") return false;
    return value.length <= maxLength;
  }

  isShortCode(value) {
    return String(value ?? "").length <= MAX_CODE;
  }

  // Een verwijzing die ook leeg (null) mag zijn, bijvoorbeeld een medewerker zonder bedrijf.
  // Staat er wel iets, dan moet het een veilige id zijn.
  isSafeOptionalId(value) {
    return value === null || value === undefined || this.isSafeId(value);
  }

  // Is dit een geldige kleur in de vorm #rrggbb? De kleur komt in een style-attribuut terecht,
  // dus andere tekst (zoals "red; background: url(...)") mag er niet in.
  isSafeColor(value) {
    return typeof value === "string" && SAFE_COLOR.test(value);
  }

  // Is dit een geldig pasnummer: tekst met alleen hoofdletters en cijfers, hooguit 64 tekens
  // (zie SAFE_BADGE_ID)? Een lege tekst is ook goed: dan is er geen pas gekoppeld.
  isSafeBadgeId(value) {
    return typeof value === "string" && SAFE_BADGE_ID.test(value);
  }

  // Is dit een geldige prijs: een echt getal van 0 tot en met MAX_PRICE?
  isValidPrice(value) {
    return Number.isFinite(value) && value >= 0 && value <= MAX_PRICE;
  }

  // Een medewerker moet een veilige id, een naam, een geldige kleur en een status hebben.
  // Bedrijf en consumptiepunt mogen leeg zijn, maar als ze er staan moeten het veilige id's zijn.
  // Het pasnummer is optioneel; als het er staat, moet het een geldig pasnummer zijn. Een ongeldig
  // pasnummer is bij het laden al leeggemaakt (zie migrateEmployee), zodat de medewerker blijft bestaan.
  isValidEmployee(employee) {
    return (
      this.isSafeId(employee?.id) &&
      (employee.badgeId === undefined || this.isSafeBadgeId(employee.badgeId)) &&
      this.isText(employee.name, MAX_TEXT * 2 + 1, { required: true }) &&
      this.isText(employee.firstName ?? "") &&
      this.isText(employee.lastName ?? "") &&
      this.isShortCode(employee.payrollCode) &&
      this.isShortCode(employee.personnelNumber) &&
      this.isShortCode(employee.employerNumber) &&
      this.isSafeColor(employee.color) &&
      typeof employee.active === "boolean" &&
      this.isSafeOptionalId(employee.companyId) &&
      this.isSafeOptionalId(employee.pointId)
    );
  }

  // Een registratie moet een veilige id, medewerker, product en geldige datum hebben.
  // De prijs is optioneel (oude registraties hebben er nog geen), maar als die er staat,
  // moet het een geldige prijs zijn; anders zou de CSV-export een verkeerd bedrag tonen.
  // Het consumptiepunt mag leeg zijn (het product ging dan niet van de voorraad af).
  // Het werkgevernummer is ook optioneel; als het er staat, is het een korte tekst (hooguit 64 tekens).
  // Het tijdstip (`createdAt`) mag hooguit één dag na `now` (het moment van laden) liggen
  // (zie MAX_FUTURE_MS). Een registratie ver in de toekomst is geknoeid en zou anders in een
  // verkeerde loonmaand in de CSV-export terechtkomen.
  isValidRegistration(registration, now = new Date()) {
    const hasValidPrice = registration?.price === undefined || this.isValidPrice(registration.price);
    const hasValidEmployerNumber =
      registration?.employerNumber === undefined ||
      (typeof registration.employerNumber === "string" && this.isShortCode(registration.employerNumber));

    return (
      this.isSafeId(registration?.id) &&
      this.isSafeId(registration.employeeId) &&
      this.isSafeId(registration.productId) &&
      this.isSafeOptionalId(registration.pointId) &&
      typeof registration.createdAt === "string" &&
      !Number.isNaN(Date.parse(registration.createdAt)) &&
      Date.parse(registration.createdAt) - now.getTime() <= MAX_FUTURE_MS &&
      hasValidPrice &&
      hasValidEmployerNumber
    );
  }

  // Een product moet een veilige id, een naam en een geldige prijs hebben.
  isValidProduct(product) {
    return this.isSafeId(product?.id) && this.isText(product.name) && this.isValidPrice(product.price);
  }

  // Een bedrijf moet een veilige id en een naam hebben.
  isValidCompany(company) {
    return this.isSafeId(company?.id) && this.isText(company.name) && this.isShortCode(company.employerNumber);
  }

  // Een consumptiepunt moet een veilige id, een naam, een bedrijf en een voorraadlijst hebben.
  isValidPoint(point) {
    return (
      this.isSafeId(point?.id) &&
      this.isText(point.name) &&
      this.isSafeId(point.companyId) &&
      point.products !== null &&
      typeof point.products === "object"
    );
  }

  // ------------------------------------------------------------------
  // Oude gegevens omzetten (migratie)
  // ------------------------------------------------------------------

  // Zet opgeslagen gegevens om naar de huidige opbouw. Ontbrekende velden krijgen een
  // standaardwaarde, zodat ook gegevens uit een oudere versie blijven werken.
  // Waarden in een lijst die geen object zijn (bijvoorbeeld null), worden overgeslagen.
  // Staat er bij `companies` iets anders dan een lijst, dan zijn de gegevens beschadigd. Dan
  // gooit deze methode een fout, zodat load() de gegevens als onleesbaar behandelt en er een
  // reservekopie komt. Anders zouden alle consumptiepunten (en hun voorraad) worden vervangen.
  // `now` is het moment van laden; completePointStock gebruikt het om een telling in de
  // toekomst weg te laten.
  migrate(data, now = new Date()) {
    const objects = (list) => (Array.isArray(list) ? list.filter((item) => this.isObject(item)) : []);

    if (data.companies !== undefined && !Array.isArray(data.companies)) {
      throw new Error("De bedrijvenlijst is beschadigd");
    }

    const products = this.migrateProducts(data.products);
    let employees = this.withoutDuplicateBadges(
      objects(data.employees).map((employee, index) => this.migrateEmployee(employee, index))
    );
    let companies = objects(data.companies);
    let points = objects(data.points);

    // Oude gegevens hebben nog geen bedrijven en consumptiepunten (het veld ontbreekt):
    // die worden hier aangemaakt.
    if (data.companies === undefined) {
      ({ companies, points, employees } = this.migrateCompanies(employees, products));
    }

    return {
      employees,
      registrations: objects(data.registrations).map((registration) => this.migrateRegistration(registration)),
      products,
      companies,
      points: points.map((point) => this.completePointStock(point, products, now)),
      auditLog: Array.isArray(data.auditLog) ? data.auditLog.filter((entry) => this.isValidAuditEntry(entry)) : []
    };
  }

  // Opgeslagen producten gaan voor, zodat gewijzigde prijzen en verwijderde producten bewaard
  // blijven. Alleen oude gegevens zonder productlijst krijgen de standaardproducten.
  // Een lege lijst blijft leeg: dan heeft de beheerder alle producten zelf verwijderd.
  // De prijs wordt omgezet met toNumber: een lege of ontbrekende prijs wordt dan NaN, zodat
  // isValidProduct het product overslaat (met Number(null) = 0 zou het gratis worden).
  // Oude product-id's ("melk", "brood") krijgen hun nieuwe naam, net als in de registraties.
  migrateProducts(storedProducts) {
    if (Array.isArray(storedProducts)) {
      return storedProducts
        .filter((product) => this.isObject(product))
        .map((product) => ({
          ...product,
          id: this.renameProductId(product.id),
          price: this.toNumber(product.price)
        }));
    }
    return DEFAULT_PRODUCTS.map((product) => ({ ...product }));
  }

  // Zet een opgeslagen waarde om naar een getal. Anders dan Number() geeft dit NaN (geen getal)
  // bij null, undefined, lege tekst en andere soorten waarden, zodat die als ongeldig tellen.
  // Een getal als tekst ("0.70") wordt wel gewoon omgezet.
  toNumber(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return NaN;
  }

  // Geeft de nieuwe naam van een oude product-id, of de id zelf als die niet veranderd is.
  // Object.hasOwn zorgt dat een id als "constructor" niet per ongeluk iets van het object zelf vindt.
  renameProductId(productId) {
    return Object.hasOwn(OLD_PRODUCT_IDS, productId) ? OLD_PRODUCT_IDS[productId] : productId;
  }

  // Zet de oude product-id's in de voorraadlijst van een consumptiepunt om naar de nieuwe.
  // Staat de nieuwe id er al, dan gaat die voor en vervalt de oude regel.
  renameStockKeys(stock) {
    const renamed = {};

    for (const [productId, entry] of Object.entries(stock || {})) {
      const newId = this.renameProductId(productId);
      if (newId !== productId && stock[newId]) continue;
      renamed[newId] = entry;
    }

    return renamed;
  }

  // Vult ontbrekende velden van een medewerker aan. Een oude naam als "Anna van der Berg"
  // wordt opgesplitst in voornaam "Anna van der" en achternaam "Berg". Een naam van één woord
  // ("Anna") wordt alleen de voornaam; de achternaam blijft dan leeg.
  // Een ontbrekende of ongeldige kleur (geen #rrggbb) wordt vervangen door een kleur uit COLORS.
  // De medewerker zelf blijft dus bewaard; alleen de kleur verandert.
  // Hetzelfde geldt voor het pasnummer: oude gegevens zonder pasnummer en een ongeldig pasnummer
  // (geen tekst, andere tekens dan A-Z en 0-9, of langer dan 64 tekens) worden "" (geen pas).
  migrateEmployee(employee, index) {
    const nameParts = String(employee.name || "").trim().split(/\s+/);
    const hasLastName = nameParts.length > 1;
    const fullName = employee.name || `${employee.firstName || ""} ${employee.lastName || ""}`.trim();

    return {
      ...employee,
      name: fullName,
      firstName: employee.firstName || (hasLastName ? nameParts.slice(0, -1).join(" ") : nameParts[0]) || "",
      lastName: employee.lastName || (hasLastName ? nameParts.at(-1) : ""),
      payrollCode: employee.payrollCode || "",
      personnelNumber: employee.personnelNumber || "",
      employerNumber: employee.employerNumber ? String(employee.employerNumber) : "",
      companyId: employee.companyId || null,
      pointId: employee.pointId || null,
      active: employee.active !== false,
      color: this.isSafeColor(employee.color) ? employee.color : COLORS[index % COLORS.length],
      badgeId: this.isSafeBadgeId(employee.badgeId) ? employee.badgeId : ""
    };
  }

  // Een pas mag maar bij één medewerker horen; anders weet de pasjeslezer niet wie er staat.
  // Komt een pasnummer (door geknoeide gegevens) toch twee keer voor, dan houdt de eerste
  // medewerker de pas en wordt het pasnummer bij de latere medewerkers leeggemaakt.
  withoutDuplicateBadges(employees) {
    const seen = new Set();

    return employees.map((employee) => {
      if (!employee.badgeId) return employee;
      if (seen.has(employee.badgeId)) return { ...employee, badgeId: "" };
      seen.add(employee.badgeId);
      return employee;
    });
  }

  // Zet oude product-id's om; een registratie zonder product wordt een blikje.
  migrateRegistration(registration) {
    const productId = this.renameProductId(registration.productId) || "blikje";
    return { ...registration, productId };
  }

  // Ieder consumptiepunt krijgt een voorraadregel voor ieder product; nieuwe producten staan uit.
  // Voorraad en minimum worden altijd getallen (een getal als tekst, zoals "5", zou bij optellen
  // anders "51" worden in plaats van 6). De voorraad mag negatief zijn (er is dan meer
  // geregistreerd dan geteld), het minimum niet: een negatief minimum wordt 0.
  // Het tijdstip van de laatste telling (`countedAt`) blijft bewaard als het een geldige datum is
  // die niet na `now` (het moment van laden) ligt. addRegistration en removeLastRegistration
  // gebruiken dat om te bepalen of de voorraad verandert. Een telling in de toekomst wordt
  // weggelaten (de voorraad telt dan als "niet geteld"): anders zou iedere nieuwe registratie
  // vóór die telling liggen en zou de voorraad nooit meer veranderen.
  completePointStock(point, products, now = new Date()) {
    const stock = this.renameStockKeys(point.products);
    const completedProducts = {};

    for (const product of products) {
      const entry = this.isObject(stock[product.id]) ? stock[product.id] : {};
      const amount = this.toNumber(entry.stock);
      const minimum = this.toNumber(entry.minimum);

      completedProducts[product.id] = {
        offered: entry.offered === true,
        stock: Number.isFinite(amount) ? amount : 0,
        minimum: Number.isFinite(minimum) ? Math.max(0, minimum) : 0
      };

      const countedTime = typeof entry.countedAt === "string" ? Date.parse(entry.countedAt) : NaN;
      const hasValidCount = !Number.isNaN(countedTime) && countedTime <= now.getTime();
      if (hasValidCount) completedProducts[product.id].countedAt = entry.countedAt;
    }

    return { ...point, products: completedProducts };
  }

  // Een logboekregel moet een actie, details en een geldige datum hebben. Ongeldige regels
  // worden bij het laden overgeslagen, zodat één beschadigde regel het logboek niet laat vastlopen.
  // De id is optioneel (heel oude regels hebben er geen), maar als die er staat moet het een
  // veilige id zijn, net als bij de andere gegevens.
  isValidAuditEntry(entry) {
    return (
      this.isSafeOptionalId(entry?.id) &&
      this.isText(entry?.action, MAX_AUDIT_TEXT) &&
      this.isText(entry.details, MAX_AUDIT_TEXT) &&
      typeof entry.createdAt === "string" &&
      !Number.isNaN(Date.parse(entry.createdAt))
    );
  }

  // Zet de oude vrije tekstvelden bedrijfsnaam en werkgevernummer om naar echte bedrijven.
  // Ieder bedrijf met medewerkers krijgt één consumptiepunt met alle producten, zodat
  // medewerkers na de update dezelfde producten blijven zien als ervoor.
  migrateCompanies(employees, products) {
    const companies = DEFAULT_COMPANIES.map((name) => ({ id: createId(), name, employerNumber: "" }));
    const points = [];

    // Zoekt een bedrijf op naam (hoofdletters maken niet uit), of maakt het aan.
    const findOrCreateCompany = (name) => {
      let company = companies.find((item) => item.name.toLowerCase() === name.toLowerCase());

      if (!company) {
        company = { id: createId(), name, employerNumber: "" };
        companies.push(company);
      }

      return company;
    };

    // Zoekt het consumptiepunt van een bedrijf, of maakt er één met alle producten.
    const findOrCreatePoint = (company) => {
      let point = points.find((item) => item.companyId === company.id);

      if (!point) {
        point = { id: createId(), name: company.name, companyId: company.id, products: {} };
        for (const product of products) {
          point.products[product.id] = { offered: true, stock: 0, minimum: 0 };
        }
        points.push(point);
      }

      return point;
    };

    const migratedEmployees = employees.map(({ employerName, employerNumber, ...employee }) => {
      const companyName = String(employerName || employerNumber || "").trim();
      if (!companyName) return { ...employee, employerNumber: employerNumber || "" };

      // Het eerste werkgevernummer wordt de standaard van het bedrijf; een afwijkend
      // nummer blijft bij de medewerker staan, zodat de export niet verandert.
      const company = findOrCreateCompany(companyName);
      if (!company.employerNumber && employerNumber) {
        company.employerNumber = String(employerNumber);
      }
      const isDifferentNumber = employerNumber && String(employerNumber) !== company.employerNumber;
      employee.employerNumber = isDifferentNumber ? String(employerNumber) : "";

      const point = findOrCreatePoint(company);
      return { ...employee, companyId: company.id, pointId: point.id };
    });

    return { companies, points, employees: migratedEmployees };
  }
}
