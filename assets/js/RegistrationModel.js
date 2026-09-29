import {
  SEED_EMPLOYEES,
  COLORS,
  DEFAULT_PRODUCTS,
  DEFAULT_COMPANIES
} from "./config.js";

// Voorraadstatus van één product op een consumptiepunt, met de tekst die op het scherm staat.
export const STOCK_STATUS = {
  out: "Op",
  low: "Bijbestellen",
  ok: "Op voorraad"
};

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
 *   - CsvExport: leest registraties, producten en de loonmaand voor de export.
 *
 * Belangrijk: wijzigingen maken altijd nieuwe arrays en objecten in plaats van bestaande
 * aan te passen. Daardoor kan RegistrationApp een wijziging terugdraaien met
 * snapshot() en restore() als opslaan mislukt.
 */
export class RegistrationModel {
  // Het model krijgt de opslaglaag mee en start met de opgeslagen gegevens,
  // of met demogegevens als er nog niets is opgeslagen.
  // Oude gegevens zijn dan al door DataStore.migrate omgezet.
  constructor(store) {
    this.store = store;
    this.state = store.load() || this.createSeedState();
  }

  // ------------------------------------------------------------------
  // Status: demogegevens, opslaan en terugdraaien
  // ------------------------------------------------------------------

  // Maakt de eerste demo-status: alle bedrijven, één voorbeeld-consumptiepunt bij TVB
  // en voorbeeldmedewerkers die aan dat punt gekoppeld zijn.
  createSeedState() {
    const companies = DEFAULT_COMPANIES.map((name) => ({
      id: crypto.randomUUID(),
      name,
      employerNumber: ""
    }));

    const demoPoint = {
      id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
        name,
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
        payrollCode: "",
        personnelNumber: "",
        employerNumber: "",
        companyId: demoPoint.companyId,
        pointId: demoPoint.id,
        active: true,
        color: COLORS[index % COLORS.length]
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

  // Voegt precies één product toe met het huidige tijdstip en haalt het van de
  // voorraad van het consumptiepunt van de medewerker af.
  addRegistration(employeeId, productId = "blikje") {
    const employee = this.findEmployee(employeeId);
    const pointId = employee?.pointId || null;

    const registration = {
      id: crypto.randomUUID(),
      employeeId,
      productId,
      pointId,
      createdAt: new Date().toISOString()
    };
    this.state.registrations = [...this.registrations, registration];

    if (pointId) this.changeStock(pointId, productId, -1);
  }

  // Verwijdert de meest recente registratie van deze medewerker (en van dit product,
  // als dat is meegegeven). Geeft false terug als er niets te verwijderen was.
  removeLastRegistration(employeeId, productId) {
    const newestFirst = [...this.registrations].reverse();
    const registration = newestFirst.find((item) => {
      const sameEmployee = item.employeeId === employeeId;
      const sameProduct = !productId || item.productId === productId;
      return sameEmployee && sameProduct;
    });

    if (!registration) return false;

    this.state.registrations = this.registrations.filter((item) => item.id !== registration.id);

    // Het product gaat terug naar de voorraad van het punt waar het vandaan kwam.
    if (registration.pointId) {
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

  // Telt alle registraties die aan één medewerker gekoppeld zijn.
  countForEmployee(employeeId) {
    return this.registrations.filter((registration) => registration.employeeId === employeeId).length;
  }

  // Telt het totaalbedrag van alle registraties van één medewerker.
  totalCostForEmployee(employeeId) {
    let total = 0;

    for (const registration of this.registrations) {
      if (registration.employeeId === employeeId) {
        total += this.productPrice(registration.productId);
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

  // Maakt een nieuwe medewerker aan met een unieke id en een kleur voor de avatar.
  addEmployee(employeeData) {
    const newEmployee = {
      id: crypto.randomUUID(),
      ...employeeData,
      name: `${employeeData.firstName} ${employeeData.lastName}`.trim(),
      active: true,
      color: COLORS[this.employees.length % COLORS.length]
    };

    this.state.employees = [...this.employees, newEmployee];
  }

  // Wijzigt de gegevens van een bestaande medewerker. Id, kleur en status blijven staan.
  updateEmployee(employeeId, employeeData) {
    const name = `${employeeData.firstName} ${employeeData.lastName}`.trim();

    this.state.employees = this.employees.map((employee) => {
      if (employee.id !== employeeId) return employee;
      return { ...employee, ...employeeData, name };
    });
  }

  // Zet een medewerker actief of inactief; historische registraties blijven behouden.
  setEmployeeActive(employeeId, active) {
    this.state.employees = this.employees.map((employee) => {
      if (employee.id !== employeeId) return employee;
      return { ...employee, active };
    });
  }

  // Verwijdert een medewerker definitief; registraties blijven historisch bewaard.
  removeEmployee(employeeId) {
    this.state.employees = this.employees.filter((employee) => employee.id !== employeeId);
  }

  // Een afwijkend werkgevernummer bij de medewerker (bijv. per teamleider) gaat voor;
  // anders geldt het standaardnummer van het bedrijf.
  employerNumberFor(employee) {
    if (employee?.employerNumber) return employee.employerNumber;
    return this.findCompany(employee?.companyId)?.employerNumber || "";
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

  // Voegt een productsoort toe of wijzigt naam en prijs van een bestaand product.
  saveProduct(productData) {
    const product = { ...productData, price: Number(productData.price) };

    if (this.findProduct(product.id)) {
      this.state.products = this.products.map((item) => (item.id === product.id ? product : item));
      return;
    }

    const newProduct = { ...product, id: crypto.randomUUID() };
    this.state.products = [...this.products, newProduct];

    // Een nieuw product staat bij ieder consumptiepunt uit; de beheerder zet het zelf aan.
    this.state.points = this.points.map((point) => ({
      ...point,
      products: {
        ...point.products,
        [newProduct.id]: { offered: false, stock: 0, minimum: 0 }
      }
    }));
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

  // Voegt een bedrijf toe of wijzigt naam en werkgevernummer van een bestaand bedrijf.
  saveCompany({ id, name, employerNumber }) {
    const company = { id: id || crypto.randomUUID(), name, employerNumber };

    if (this.findCompany(id)) {
      this.state.companies = this.companies.map((item) => (item.id === id ? { ...item, ...company } : item));
    } else {
      this.state.companies = [...this.companies, company];
    }
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
  savePoint({ id, name, companyId, offeredProductIds }) {
    const existing = this.findPoint(id);

    const point = {
      id: existing ? id : crypto.randomUUID(),
      name,
      companyId,
      products: {}
    };
    for (const product of this.products) {
      const oldEntry = existing?.products[product.id] || { stock: 0, minimum: 0 };
      point.products[product.id] = { ...oldEntry, offered: offeredProductIds.includes(product.id) };
    }

    if (existing) {
      this.state.points = this.points.map((item) => (item.id === id ? point : item));
    } else {
      this.state.points = [...this.points, point];
    }
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

    return this.products.filter((product) => point.products[product.id]?.offered);
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
  updateStockEntry(pointId, productId, change) {
    this.state.points = this.points.map((point) => {
      if (point.id !== pointId || !point.products[productId]) return point;

      const newEntry = change({ ...point.products[productId] });
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

  // Vervangt de voorraad door een getelde hoeveelheid.
  setStock(pointId, productId, stock) {
    this.updateStockEntry(pointId, productId, (entry) => ({ ...entry, stock }));
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
        const entry = point.products[product.id];
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
      id: crypto.randomUUID(),
      action,
      details,
      createdAt: new Date().toISOString()
    };

    this.state.auditLog = [...this.auditLog, entry];
  }
}
