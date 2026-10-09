import {
  SEED_EMPLOYEES,
  COLORS,
  DEFAULT_PRODUCTS,
  DEFAULT_COMPANIES
} from "./config.js";
import { createId } from "./ids.js";

// Voorraadstatus van één product op een consumptiepunt, met de tekst die op het scherm staat.
export const STOCK_STATUS = {
  out: "Op",
  low: "Bijbestellen",
  ok: "Op voorraad"
};

// Hoogste prijs (in euro) die een product mag hebben. Deze waarde moet gelijk zijn aan MAX_PRICE
// in DataStore.js: DataStore gooit bij het laden producten en registraties met een hogere prijs
// weg. Het model en het productformulier (RegistrationApp) gebruiken deze ene constante, zodat
// er nooit een prijs wordt opgeslagen die na herladen verdwijnt.
export const MAX_PRICE = 1000;

/**
 * RegistrationModel — de gegevens en alle regels van de applicatie (het "Model" in MVC).
 *
 * Verantwoordelijkheid:
 *   - bewaart de complete status: medewerkers, registraties, producten, bedrijven,
 *     consumptiepunten (met voorraad) en het logboek;
 *   - bevat de regels, bijvoorbeeld: een registratie verlaagt de voorraad, een bedrijf met
 *     medewerkers mag niet worden verwijderd, de loonmaand is de maand na de consumptie.
 *
 * Verbonden met:
 *   - DataStore (via de constructor): laadt en bewaart de status. Het model weet niet
 *     hoe of waar dat gebeurt, dus de opslag is later te vervangen door een database.
 *   - RegistrationView: leest gegevens uit het model om ze te tonen (verandert niets).
 *   - RegistrationApp: roept de methodes aan die iets wijzigen, en daarna save().
 *   - CsvExport: leest registraties, prijzen en de loonmaand voor de export.
 *   - ids.js: maakt de unieke id's voor nieuwe gegevens.
 *
 * Belangrijk: wijzigingen maken altijd nieuwe arrays en objecten in plaats van bestaande
 * aan te passen. Daardoor kan RegistrationApp een wijziging terugdraaien met
 * snapshot() en restore() als opslaan mislukt.
 */
export class RegistrationModel {
  // Het model krijgt de opslaglaag mee en start met de opgeslagen gegevens,
  // of met demogegevens als er nog niets is opgeslagen.
  // Oude gegevens zijn dan al door DataStore.migrate omgezet.
  // `loadProblem` neemt over wat de opslag meldt ("skipped", "unreadable" of null), zodat de
  // controller de gebruiker kan waarschuwen.
  constructor(store) {
    this.store = store;
    this.state = store.load() || this.createSeedState();
    this.loadProblem = store.loadProblem || null;
  }

  // Laadt de gegevens opnieuw uit de opslag, bijvoorbeeld omdat een ander tabblad iets heeft
  // opgeslagen. Geeft true terug als er gegevens waren; anders blijft de huidige status staan.
  // `loadProblem` wordt ook hier bijgewerkt, zodat de controller ziet of de nieuwe gegevens
  // in orde waren (ook als er niets bruikbaars geladen kon worden).
  reload() {
    const data = this.store.load();
    this.loadProblem = this.store.loadProblem || null;
    if (!data) return false;

    this.state = data;
    return true;
  }

  // Hoort deze opslagsleutel bij de gegevens van deze applicatie? (null betekent dat de hele
  // opslag is leeggemaakt.) Wordt gebruikt om wijzigingen uit andere tabbladen te herkennen.
  isStorageKey(key) {
    return key === null || key === this.store.key;
  }

  // ------------------------------------------------------------------
  // Status: demogegevens, opslaan en terugdraaien
  // ------------------------------------------------------------------

  // Maakt de eerste demo-status: alle bedrijven, één voorbeeld-consumptiepunt bij TVB
  // en voorbeeldmedewerkers die aan dat punt gekoppeld zijn.
  createSeedState() {
    const companies = DEFAULT_COMPANIES.map((name) => ({
      id: createId(),
      name,
      employerNumber: ""
    }));

    const demoPoint = {
      id: createId(),
      name: "Hoofdkantoor",
      companyId: companies[0].id,
      products: {}
    };
    for (const product of DEFAULT_PRODUCTS) {
      demoPoint.products[product.id] = { offered: true, stock: 24, minimum: 6 };
    }

    const employees = SEED_EMPLOYEES.map((name, index) => {
      const parts = name.split(" ");

      return {
        id: createId(),
        name,
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
        payrollCode: "",
        personnelNumber: "",
        employerNumber: "",
        companyId: demoPoint.companyId,
        pointId: demoPoint.id,
        active: true,
        color: COLORS[index % COLORS.length],
        badgeId: ""
      };
    });

    return {
      employees,
      registrations: [],
      products: DEFAULT_PRODUCTS.map((product) => ({ ...product })),
      companies,
      points: [demoPoint],
      auditLog: []
    };
  }

  // Maakt een kopie die gebruikt kan worden om een wijziging terug te draaien.
  // Wijzigingen maken altijd nieuwe arrays en objecten, dus een ondiepe kopie is genoeg.
  snapshot() {
    return {
      employees: [...this.state.employees],
      registrations: [...this.state.registrations],
      products: [...this.state.products],
      companies: [...this.state.companies],
      points: [...this.state.points],
      auditLog: [...this.state.auditLog]
    };
  }

  // Wist alle gegevens (ook de reservekopieën in de opslag) en start opnieuw met de
  // demogegevens. Wordt gebruikt door de knop "Alle gegevens wissen": op een gedeelde tablet
  // moeten persoonsgegevens volledig verwijderd kunnen worden (AVG, recht op vergetelheid).
  // Een opslag zonder clearAll (zoals de nep-opslag in de tests) wordt overgeslagen.
  // Met `clearStore: false` wordt alleen het geheugen leeggemaakt en blijft de opslag met rust.
  // Dat gebruikt RegistrationApp.handleStorageCleared als een ander tabblad al heeft gewist en
  // daarna zelf de nieuwe demogegevens opslaat: die mogen hier niet opnieuw worden gewist.
  wipeAll({ clearStore = true } = {}) {
    if (clearStore && typeof this.store.clearAll === "function") this.store.clearAll();

    this.state = this.createSeedState();
    this.loadProblem = null;
  }

  // Herstelt de vorige status wanneer opslaan niet lukt.
  restore(snapshot) {
    this.state = snapshot;
  }

  // Geeft de volledige status aan de opslaglaag. Geeft true terug als dat lukte.
  save() {
    return this.store.save(this.state);
  }

  // Getters: andere classes lezen de gegevens via deze namen, niet via this.state.
  get employees() {
    return this.state.employees;
  }

  get registrations() {
    return this.state.registrations;
  }

  get products() {
    return this.state.products;
  }

  get auditLog() {
    return this.state.auditLog;
  }

  get companies() {
    return this.state.companies;
  }

  get points() {
    return this.state.points;
  }

  // ------------------------------------------------------------------
  // Registraties
  // ------------------------------------------------------------------

  // Voegt precies één product toe en haalt het (meestal) van de voorraad van het consumptiepunt
  // van de medewerker af.
  //   - `createdAt` is het tijdstip van de registratie: standaard nu. Bij een correctie "+" kan
  //     de beheerder een eerdere datum kiezen, bijvoorbeeld voor een vergeten blikje van vorige maand.
  //   - `pointId` in de registratie is het consumptiepunt dat het product aanbood (anders null).
  //     Zo weet removeLastRegistration later naar welk punt het product terug moet.
  //   - Er gaat alleen voorraad af als het punt het product aanbiedt én de registratie niet vóór
  //     de laatste telling (`countedAt`) ligt. Ligt het tijdstip vóór die telling, dan zat het
  //     product al niet meer in de getelde voorraad; dan verandert de voorraad niet (net als bij
  //     removeLastRegistration, dat dan ook niets terugzet). `pointId` wordt dan wel bewaard.
  //   - `correction: true` betekent dat de beheerder de registratie heeft toegevoegd. Die telt
  //     niet mee als "vorige keer" in het productvenster van de medewerker.
  //   - `price` is de prijs op het moment van registreren. Verandert de prijs later, dan
  //     blijft een oude maand in de CSV-export hetzelfde bedrag houden.
  //   - `employerNumber` is om dezelfde reden het werkgevernummer op het moment van registreren
  //     (zie registrationEmployerNumber). Is er dan nog geen nummer, dan wordt het niet bewaard.
  addRegistration(employeeId, productId = "blikje", { correction = false, createdAt = new Date() } = {}) {
    const employee = this.findEmployee(employeeId);
    const point = this.findPoint(employee?.pointId);
    const offered = Boolean(this.pointProduct(point, productId)?.offered);
    const employerNumber = this.employerNumberFor(employee);

    const registration = {
      id: createId(),
      employeeId,
      productId,
      price: this.productPrice(productId),
      pointId: offered ? point.id : null,
      createdAt: createdAt.toISOString()
    };
    if (employerNumber) registration.employerNumber = employerNumber;
    if (correction) registration.correction = true;
    this.state.registrations = [...this.registrations, registration];

    const entry = this.stockEntry(point?.id, productId);
    const madeAfterCount = !entry?.countedAt || createdAt.getTime() >= Date.parse(entry.countedAt);
    if (offered && madeAfterCount) this.changeStock(point.id, productId, -1);
  }

  // Zoekt de laatst ingevoerde registratie van deze medewerker (en van dit product, als dat is
  // meegegeven). "Laatst ingevoerd" gaat op de volgorde van invoer (de volgorde in de lijst),
  // niet op de datum: een correctie "+" met een eerdere datum die als laatste is toegevoegd,
  // is dus de laatste registratie. Dit is precies de registratie die removeLastRegistration zou
  // verwijderen (correctie "−"), zodat de controller vooraf kan vragen of een oude loonmaand
  // mag worden aangepast (confirmOldMonthRemoval).
  // Geeft undefined terug als er geen registratie is.
  lastRegistration(employeeId, productId) {
    const newestFirst = [...this.registrations].reverse();

    return newestFirst.find((item) => {
      const sameEmployee = item.employeeId === employeeId;
      const sameProduct = !productId || item.productId === productId;
      return sameEmployee && sameProduct;
    });
  }

  // Verwijdert de laatst ingevoerde registratie van deze medewerker (en van dit product,
  // als dat is meegegeven; zie lastRegistration). Geeft false terug als er niets te verwijderen was.
  removeLastRegistration(employeeId, productId) {
    const registration = this.lastRegistration(employeeId, productId);
    if (!registration) return false;

    this.state.registrations = this.registrations.filter((item) => item.id !== registration.id);

    // Het product gaat terug naar de voorraad van het punt waar het vandaan kwam, maar alleen
    // als de registratie na de laatste telling is gemaakt. Is de voorraad daarna geteld, dan
    // zat dit product al niet meer in de getelde hoeveelheid: de telling klopt dan al met de
    // werkelijkheid, en er een product bij optellen zou de voorraad juist onjuist maken.
    const entry = this.stockEntry(registration.pointId, registration.productId);
    const madeAfterCount = !entry?.countedAt || Date.parse(registration.createdAt) >= Date.parse(entry.countedAt);

    if (registration.pointId && madeAfterCount) {
      this.changeStock(registration.pointId, registration.productId, 1);
    }

    return true;
  }

  // Heeft deze medewerker minstens één registratie van dit product?
  hasRegistration(employeeId, productId) {
    return this.registrations.some(
      (registration) => registration.employeeId === employeeId && registration.productId === productId
    );
  }

  // Wat koos deze medewerker de vorige keer? Neemt de laatste registratie en alles wat binnen
  // een minuut daarvoor is geregistreerd (één keer "Registreren" kan meerdere producten bevatten).
  // Alleen producten die het eigen consumptiepunt nu aanbiedt, tellen mee, en correcties van de
  // beheerder niet: die heeft de medewerker niet zelf gekozen.
  // Geeft per product-id het aantal terug, bijvoorbeeld { blikje: 2, ei: 1 }, of {} als er niets is.
  lastSelection(employeeId) {
    const own = this.registrations.filter(
      (registration) => registration.employeeId === employeeId && !registration.correction
    );
    if (own.length === 0) return {};

    const times = own.map((registration) => new Date(registration.createdAt).getTime());
    const lastTime = Math.max(...times);
    const offeredIds = this.productsForEmployee(employeeId).map((product) => product.id);
    const selection = {};

    own.forEach((registration, index) => {
      const withinLastMinute = lastTime - times[index] <= 60 * 1000;
      if (withinLastMinute && offeredIds.includes(registration.productId)) {
        selection[registration.productId] = (selection[registration.productId] || 0) + 1;
      }
    });

    return selection;
  }

  // Heeft deze medewerker zelf al eens iets geregistreerd? Correcties van de beheerder tellen
  // niet mee. Wordt gebruikt voor de begroeting "welkom terug".
  hasOwnRegistration(employeeId) {
    return this.registrations.some(
      (registration) => registration.employeeId === employeeId && !registration.correction
    );
  }

  // Telt alle registraties die aan één medewerker gekoppeld zijn.
  countForEmployee(employeeId) {
    return this.registrations.filter((registration) => registration.employeeId === employeeId).length;
  }

  // Telt het totaalbedrag van alle registraties van één medewerker.
  totalCostForEmployee(employeeId) {
    let total = 0;

    for (const registration of this.registrations) {
      if (registration.employeeId === employeeId) {
        total += this.registrationPrice(registration);
      }
    }

    return total;
  }

  // Telt registraties die op dezelfde kalenderdag zijn gemaakt.
  countForDate(date) {
    return this.registrations.filter(
      (registration) => new Date(registration.createdAt).toDateString() === date.toDateString()
    ).length;
  }

  // Telt registraties binnen dezelfde maand en hetzelfde jaar.
  countForMonth(date) {
    return this.registrations.filter(
      (registration) => this.monthKey(new Date(registration.createdAt)) === this.monthKey(date)
    ).length;
  }

  // Maakt een sorteerbare maandcode, bijvoorbeeld 2026-09.
  monthKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${date.getFullYear()}-${month}`;
  }

  // Consumpties worden verwerkt in de loonadministratie van de maand erna:
  // september 2026 → oktober 2026, december 2026 → januari 2027.
  payrollPeriod(date) {
    const period = new Date(date.getFullYear(), date.getMonth() + 1, 1);

    return {
      year: period.getFullYear(),
      month: period.getMonth() + 1
    };
  }

  // ------------------------------------------------------------------
  // Medewerkers
  // ------------------------------------------------------------------

  // Zoekt een medewerker op basis van de unieke id.
  findEmployee(employeeId) {
    return this.employees.find((employee) => employee.id === employeeId);
  }

  // Zoekt de medewerker bij wie dit pasnummer hoort (herkennen met de pas, zie BadgeReader).
  // Het pasnummer moet al genormaliseerd zijn (BadgeReader.normalize). Een leeg pasnummer hoort
  // bij niemand. Of de medewerker actief is, controleert de controller.
  findEmployeeByBadge(badgeId) {
    if (!badgeId) return undefined;
    return this.employees.find((employee) => employee.badgeId === badgeId);
  }

  // Hoort dit pasnummer al bij een andere medewerker? De medewerker die nu wordt gewijzigd
  // (`exceptEmployeeId`) telt niet mee: die mag zijn eigen pas houden. Een leeg pasnummer
  // (geen pas) is nooit bezet.
  isBadgeTaken(badgeId, exceptEmployeeId = null) {
    const owner = this.findEmployeeByBadge(badgeId);
    return Boolean(owner) && owner.id !== exceptEmployeeId;
  }

  // Mag een medewerker aan dit bedrijf en dit consumptiepunt worden gekoppeld?
  //   - geen bedrijf (null of leeg) mag; een opgegeven bedrijf moet nog bestaan;
  //   - geen consumptiepunt mag; een opgegeven punt moet nog bestaan én bij dat bedrijf horen.
  // Een formulier dat al open stond, kan een bedrijf of punt bevatten dat een ander tabblad
  // intussen heeft verwijderd. Zonder deze controle zou de medewerker naar iets wijzen dat er
  // niet meer is (en dus geen producten meer kunnen kiezen).
  isValidAssignment(companyId, pointId) {
    if (companyId && !this.findCompany(companyId)) return false;
    if (!pointId) return true;

    const point = this.findPoint(pointId);
    return Boolean(point) && point.companyId === companyId;
  }

  // Maakt een nieuwe medewerker aan met een unieke id en een kleur voor de avatar.
  // Geeft false terug (en verandert niets) als het bedrijf of consumptiepunt niet (meer) klopt
  // (zie isValidAssignment), anders true. Zo weigert persist in de controller de wijziging.
  addEmployee(employeeData) {
    if (!this.isValidAssignment(employeeData.companyId, employeeData.pointId)) return false;

    const newEmployee = {
      id: createId(),
      ...employeeData,
      name: `${employeeData.firstName} ${employeeData.lastName}`.trim(),
      active: true,
      color: COLORS[this.employees.length % COLORS.length]
    };

    this.state.employees = [...this.employees, newEmployee];
    return true;
  }

  // Wijzigt de gegevens van een bestaande medewerker. Id, kleur en status blijven staan.
  // Geeft false terug (en verandert niets) als de medewerker niet meer bestaat of als het
  // bedrijf of consumptiepunt niet (meer) klopt; anders true. Velden die niet worden meegegeven,
  // blijven staan. Daarom wordt gecontroleerd hoe de medewerker er ná de wijziging uitziet.
  updateEmployee(employeeId, employeeData) {
    const current = this.findEmployee(employeeId);
    if (!current) return false;

    const changed = { ...current, ...employeeData };
    if (!this.isValidAssignment(changed.companyId, changed.pointId)) return false;

    const name = `${employeeData.firstName} ${employeeData.lastName}`.trim();

    this.state.employees = this.employees.map((employee) => {
      if (employee.id !== employeeId) return employee;
      return { ...employee, ...employeeData, name };
    });
    return true;
  }

  // Zet alle medewerkers van een consumptiepunt over naar een ander bedrijf, bijvoorbeeld als
  // het punt bij een ander bedrijf wordt ondergebracht. Alleen `companyId` verandert: de naam
  // wordt niet opnieuw opgebouwd (zoals updateEmployee doet), zodat die precies blijft staan.
  // Er worden nieuwe objecten gemaakt, zodat snapshot/restore blijft werken.
  moveEmployeesOfPoint(pointId, companyId) {
    this.state.employees = this.employees.map((employee) => {
      if (employee.pointId !== pointId) return employee;
      return { ...employee, companyId };
    });
  }

  // Zet een medewerker actief of inactief; historische registraties blijven behouden.
  setEmployeeActive(employeeId, active) {
    this.state.employees = this.employees.map((employee) => {
      if (employee.id !== employeeId) return employee;
      return { ...employee, active };
    });
  }

  // Heeft deze medewerker minstens één registratie (eigen keuze of correctie)?
  employeeHasRegistrations(employeeId) {
    return this.registrations.some((registration) => registration.employeeId === employeeId);
  }

  // Verwijdert een medewerker definitief, maar alleen een inactieve medewerker zonder registraties.
  //   - Met registraties zou de CSV-export die tonen als "Verwijderd", zonder looncode en
  //     personeelsnummer. Zo'n medewerker kan beter inactief blijven.
  //   - Een actieve medewerker moet eerst inactief worden gezet (setEmployeeActive). Zo wordt
  //     niemand per ongeluk verwijderd die nog op de tablet registreert.
  // De view toont de knop "Verwijderen" alleen in dit geval, maar het model controleert het zelf
  // ook, zodat een oude knop (bijvoorbeeld van vóór een wijziging in een ander tabblad) niets
  // verkeerds kan doen. Geeft false terug (en verandert niets) als de medewerker niet bestaat,
  // actief is of registraties heeft; anders true.
  removeEmployee(employeeId) {
    const employee = this.findEmployee(employeeId);
    if (!employee || employee.active || this.employeeHasRegistrations(employeeId)) return false;

    this.state.employees = this.employees.filter((employee) => employee.id !== employeeId);
    return true;
  }

  // Een afwijkend werkgevernummer bij de medewerker (bijv. per teamleider) gaat voor;
  // anders geldt het standaardnummer van het bedrijf.
  employerNumberFor(employee) {
    if (employee?.employerNumber) return employee.employerNumber;
    return this.findCompany(employee?.companyId)?.employerNumber || "";
  }

  // Werkgevernummer van één registratie: het nummer dat bij het registreren is bewaard. Zo blijft
  // een oude loonmaand in de CSV-export hetzelfde, ook als de medewerker later naar een ander
  // bedrijf gaat of het nummer van het bedrijf verandert. Oude registraties (van voor deze regel)
  // en registraties van toen er nog geen nummer was ingevuld, gebruiken het huidige nummer.
  // Wordt gebruikt door de CSV-export (CsvExport.buildRows).
  registrationEmployerNumber(registration) {
    if (registration.employerNumber) return registration.employerNumber;
    return this.employerNumberFor(this.findEmployee(registration.employeeId));
  }

  // ------------------------------------------------------------------
  // Producten
  // ------------------------------------------------------------------

  // Zoekt een product op basis van de unieke id.
  findProduct(productId) {
    return this.products.find((product) => product.id === productId);
  }

  productName(productId) {
    return this.findProduct(productId)?.name || "Onbekend product";
  }

  // Prijs van een product; een onbekend (verwijderd) product telt als 0.
  productPrice(productId) {
    return this.findProduct(productId)?.price || 0;
  }

  // Prijs van één registratie: de prijs die bij het registreren is bewaard. Oude registraties
  // van voor deze regel hebben nog geen prijs; die tellen met de huidige productprijs.
  // Wordt gebruikt door totalCostForEmployee en de CSV-export, zodat beide hetzelfde bedrag geven.
  registrationPrice(registration) {
    return Number.isFinite(registration.price) ? registration.price : this.productPrice(registration.productId);
  }

  // Voegt een productsoort toe of wijzigt naam en prijs van een bestaand product.
  // De prijs wordt afgerond op hele centen, zodat het scherm en de CSV-export hetzelfde bedrag gebruiken.
  // Een prijs die geen getal is of niet tussen 0 en MAX_PRICE (tot en met) ligt, wordt geweigerd:
  // DataStore zou zo'n product (en de registraties ervan) bij het volgende laden weggooien.
  // Geeft true terug als het product is opgeslagen, anders false (en verandert er niets).
  saveProduct(productData) {
    const product = { ...productData, price: Math.round(Number(productData.price) * 100) / 100 };
    const priceAllowed = Number.isFinite(product.price) && product.price >= 0 && product.price <= MAX_PRICE;
    if (!priceAllowed) return false;

    if (this.findProduct(product.id)) {
      this.state.products = this.products.map((item) => (item.id === product.id ? product : item));
      return true;
    }

    const newProduct = { ...product, id: createId() };
    this.state.products = [...this.products, newProduct];

    // Een nieuw product staat bij ieder consumptiepunt uit; de beheerder zet het zelf aan.
    this.state.points = this.points.map((point) => ({
      ...point,
      products: {
        ...point.products,
        [newProduct.id]: { offered: false, stock: 0, minimum: 0 }
      }
    }));
    return true;
  }

  // Verwijdert een product alleen wanneer het nog niet in registraties wordt gebruikt.
  // Het product verdwijnt ook uit de voorraadlijst van ieder consumptiepunt.
  removeProduct(productId) {
    const isUsed = this.registrations.some((registration) => registration.productId === productId);
    if (isUsed) return false;

    this.state.products = this.products.filter((product) => product.id !== productId);

    this.state.points = this.points.map((point) => {
      const products = { ...point.products };
      delete products[productId];
      return { ...point, products };
    });

    return true;
  }

  // ------------------------------------------------------------------
  // Bedrijven
  // ------------------------------------------------------------------

  // Zoekt een bedrijf op basis van de unieke id.
  findCompany(companyId) {
    return this.companies.find((company) => company.id === companyId);
  }

  companyName(companyId) {
    return this.findCompany(companyId)?.name || "Onbekend bedrijf";
  }

  // Bedrijven op alfabetische volgorde, voor lijsten en keuzemenu's.
  sortedCompanies() {
    return [...this.companies].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }

  // Heeft een ander bedrijf dan `exceptCompanyId` al dit werkgevernummer? Een leeg nummer telt
  // niet: meerdere bedrijven mogen (nog) geen nummer hebben. Spaties voor en achter tellen niet mee.
  // Wordt gebruikt door saveCompany (hieronder) en door het bedrijfsformulier in RegistrationApp.
  // Past bij de UNIQUE-regel op companies.employer_number in docs/DATABASE-SCHEMA.sql.
  isEmployerNumberTaken(employerNumber, exceptCompanyId = null) {
    const number = String(employerNumber ?? "").trim();
    if (number === "") return false;

    return this.companies.some(
      (company) => company.id !== exceptCompanyId && String(company.employerNumber ?? "").trim() === number
    );
  }

  // Voegt een bedrijf toe of wijzigt naam en werkgevernummer van een bestaand bedrijf.
  // Een werkgevernummer moet uniek zijn (zie isEmployerNumberTaken). Heeft een ander bedrijf het
  // al, dan wordt er niets opgeslagen en komt er false terug; anders true.
  saveCompany({ id, name, employerNumber }) {
    const existing = this.findCompany(id);
    if (this.isEmployerNumberTaken(employerNumber, existing ? id : null)) return false;

    const company = { id: id || createId(), name, employerNumber };

    if (existing) {
      this.state.companies = this.companies.map((item) => (item.id === id ? { ...item, ...company } : item));
    } else {
      this.state.companies = [...this.companies, company];
    }
    return true;
  }

  // Verwijdert een bedrijf alleen als er geen medewerkers of consumptiepunten meer aan hangen.
  removeCompany(companyId) {
    const hasEmployees = this.employees.some((employee) => employee.companyId === companyId);
    const hasPoints = this.points.some((point) => point.companyId === companyId);
    if (hasEmployees || hasPoints) return false;

    this.state.companies = this.companies.filter((company) => company.id !== companyId);
    return true;
  }

  // ------------------------------------------------------------------
  // Consumptiepunten en aanbod
  // ------------------------------------------------------------------

  // Zoekt een consumptiepunt op basis van de unieke id.
  findPoint(pointId) {
    return this.points.find((point) => point.id === pointId);
  }

  // De consumptiepunten van één bedrijf, op alfabetische volgorde.
  pointsForCompany(companyId) {
    return this.points
      .filter((point) => point.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }

  // Voegt een consumptiepunt toe of wijzigt naam, bedrijf en aanbod.
  // De voorraad en het minimum van bestaande producten blijven behouden.
  // Een punt hoort altijd bij een bedrijf. Bestaat dat bedrijf niet (meer), bijvoorbeeld omdat
  // een ander tabblad het heeft verwijderd, dan wordt er niets opgeslagen en komt er false terug.
  // Anders true.
  savePoint({ id, name, companyId, offeredProductIds }) {
    if (!this.findCompany(companyId)) return false;

    const existing = this.findPoint(id);

    const point = {
      id: existing ? id : createId(),
      name,
      companyId,
      products: {}
    };
    for (const product of this.products) {
      const oldEntry = this.pointProduct(existing, product.id) || { stock: 0, minimum: 0 };
      point.products[product.id] = { ...oldEntry, offered: offeredProductIds.includes(product.id) };
    }

    if (existing) {
      this.state.points = this.points.map((item) => (item.id === id ? point : item));
    } else {
      this.state.points = [...this.points, point];
    }
    return true;
  }

  // Verwijdert een consumptiepunt alleen als er geen medewerkers meer aan gekoppeld zijn.
  // Oude registraties blijven bewaard.
  removePoint(pointId) {
    const hasEmployees = this.employees.some((employee) => employee.pointId === pointId);
    if (hasEmployees) return false;

    this.state.points = this.points.filter((point) => point.id !== pointId);
    return true;
  }

  // De producten die een consumptiepunt aanbiedt, in de volgorde van de productlijst.
  offeredProducts(pointId) {
    const point = this.findPoint(pointId);
    if (!point) return [];

    return this.products.filter((product) => this.pointProduct(point, product.id)?.offered);
  }

  // De voorraadregel van één product binnen een consumptiepunt, of undefined als die er niet is.
  // De voorraadlijst is een object met de product-id als sleutel. Object.hasOwn zorgt dat alleen
  // echte regels worden gevonden: een product-id als "toString" of "constructor" (bijvoorbeeld uit
  // een aangepaste knop op de pagina) vindt dan niet per ongeluk een functie van het object zelf.
  pointProduct(point, productId) {
    if (!point?.products || !Object.hasOwn(point.products, productId)) return undefined;
    return point.products[productId];
  }

  // De producten die een medewerker kan kiezen: het aanbod van het eigen consumptiepunt.
  productsForEmployee(employeeId) {
    return this.offeredProducts(this.findEmployee(employeeId)?.pointId);
  }

  // ------------------------------------------------------------------
  // Voorraad
  // ------------------------------------------------------------------

  // Wijzigt de voorraadregel van één product op één punt zonder bestaande objecten aan te passen,
  // zodat snapshot/restore blijft werken. `change` krijgt een kopie en geeft de nieuwe regel terug.
  // Bestaat de regel niet (zie pointProduct), dan verandert er niets.
  updateStockEntry(pointId, productId, change) {
    this.state.points = this.points.map((point) => {
      const current = point.id === pointId ? this.pointProduct(point, productId) : undefined;
      if (!current) return point;

      const newEntry = change({ ...current });
      return {
        ...point,
        products: { ...point.products, [productId]: newEntry }
      };
    });
  }

  // Telt een aantal bij de voorraad op (negatief om af te trekken).
  changeStock(pointId, productId, amount) {
    this.updateStockEntry(pointId, productId, (entry) => ({ ...entry, stock: entry.stock + amount }));
  }

  // De voorraadregel van één product op één punt, of undefined als die niet bestaat.
  stockEntry(pointId, productId) {
    return this.pointProduct(this.findPoint(pointId), productId);
  }

  // Vervangt de voorraad door een getelde hoeveelheid en onthoudt wanneer er is geteld
  // (`countedAt`). Zo weet removeLastRegistration of een registratie al in de telling zat.
  setStock(pointId, productId, stock) {
    const countedAt = new Date().toISOString();
    this.updateStockEntry(pointId, productId, (entry) => ({ ...entry, stock, countedAt }));
  }

  // Stelt het minimum in; op of onder dit aantal moet er worden bijbesteld.
  setMinimum(pointId, productId, minimum) {
    this.updateStockEntry(pointId, productId, (entry) => ({ ...entry, minimum }));
  }

  // "out" = niets meer over, "low" = op of onder het minimum, "ok" = genoeg.
  // De bijbehorende schermtekst staat in STOCK_STATUS.
  stockStatus({ stock, minimum }) {
    if (stock <= 0) return "out";
    if (stock <= minimum) return "low";
    return "ok";
  }

  // Alle aangeboden producten die op zijn of bijbesteld moeten worden, over alle punten.
  stockAlerts() {
    const alerts = [];

    for (const point of this.points) {
      for (const product of this.offeredProducts(point.id)) {
        const entry = this.pointProduct(point, product.id);
        const status = this.stockStatus(entry);

        if (status !== "ok") alerts.push({ point, product, entry, status });
      }
    }

    return alerts;
  }

  // ------------------------------------------------------------------
  // Logboek
  // ------------------------------------------------------------------

  // Bewaart een controleerbaar logboek van wijzigingen door de beheerder.
  logAdminAction(action, details) {
    const entry = {
      id: createId(),
      action,
      details,
      createdAt: new Date().toISOString()
    };

    this.state.auditLog = [...this.auditLog, entry];
  }
}
