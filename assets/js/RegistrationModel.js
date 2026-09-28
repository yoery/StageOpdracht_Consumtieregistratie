import {
  SEED_EMPLOYEES,
  COLORS,
  DEFAULT_PRODUCTS,
  DEFAULT_COMPANIES
} from "./config.js";

// Voorraadstatus van één product op een consumptiepunt.
export const STOCK_STATUS = {
  out: "Op",
  low: "Bijbestellen",
  ok: "Op voorraad"
};

// Deze klasse bevat de data en alle regels voor medewerkers en registraties.
export class RegistrationModel {
  // Het model gebruikt de opslaglaag en start met opgeslagen of voorbeeldgegevens.
  // Oude gegevens worden al door DataStore.migrate omgezet.
  constructor(store) {
    this.store = store;
    this.state = store.load() || this.createSeedState();
  }

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
      products: Object.fromEntries(
        DEFAULT_PRODUCTS.map(({ id }) => [id, { offered: true, stock: 24, minimum: 6 }])
      )
    };

    return {
      employees: SEED_EMPLOYEES.map((name, index) => {
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
      }),
      registrations: [],
      products: DEFAULT_PRODUCTS.map((product) => ({
        ...product
      })),
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

  save() {
    return this.store.save(this.state);
  }

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

  // Voegt precies één product toe met het huidige tijdstip en haalt het van de
  // voorraad van het consumptiepunt van de medewerker af.
  addRegistration(employeeId, productId = "blikje") {
    const pointId = this.findEmployee(employeeId)?.pointId || null;

    this.state.registrations = [
      ...this.registrations,
      {
        id: crypto.randomUUID(),
        employeeId,
        productId,
        pointId,
        createdAt: new Date().toISOString()
      }
    ];

    if (pointId) this.changeStock(pointId, productId, -1);
  }

  // Verwijdert alleen de meest recente registratie van deze medewerker.
  removeLastRegistration(employeeId, productId) {
    const registration = [...this.registrations]
      .reverse()
      .find(
        ({
          employeeId: id,
          productId: idProduct
        }) =>
          id === employeeId &&
          (!productId || idProduct === productId)
      );

    if (!registration) return false;

    this.state.registrations =
      this.registrations.filter(
        ({ id }) => id !== registration.id
      );

    // Het product gaat terug naar de voorraad van het punt waar het vandaan kwam.
    if (registration.pointId) {
      this.changeStock(registration.pointId, registration.productId, 1);
    }

    return true;
  }

  // Maakt een nieuwe medewerker aan met administratieve identificatievelden.
  addEmployee(employeeData) {
    const name =
      `${employeeData.firstName} ${employeeData.lastName}`.trim();

    this.state.employees = [
      ...this.employees,
      {
        id: crypto.randomUUID(),
        ...employeeData,
        name,
        active: true,
        color:
          COLORS[
            this.employees.length % COLORS.length
          ]
      }
    ];
  }

  // Zet een medewerker inactief, zodat historische registraties behouden blijven.
  setEmployeeActive(employeeId, active) {
    this.state.employees = this.employees.map(
      (employee) =>
        employee.id === employeeId
          ? { ...employee, active }
          : employee
    );
  }

  // Wijzigt de gegevens van een bestaande medewerker.
  updateEmployee(employeeId, employeeData) {
    const name =
      `${employeeData.firstName} ${employeeData.lastName}`.trim();

    this.state.employees = this.employees.map(
      (employee) =>
        employee.id === employeeId
          ? {
              ...employee,
              ...employeeData,
              name
            }
          : employee
    );
  }

  // Voegt een productsoort toe of wijzigt de prijs van een product.
  saveProduct(productData) {
    const product = {
      ...productData,
      price: Number(productData.price)
    };

    const exists = this.products.some(
      ({ id }) => id === product.id
    );

    if (exists) {
      this.state.products = this.products.map((item) =>
        item.id === product.id
          ? product
          : item
      );
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
  removeProduct(productId) {
    if (
      this.registrations.some(
        ({ productId: id }) => id === productId
      )
    ) {
      return false;
    }

    this.state.products =
      this.products.filter(
        ({ id }) => id !== productId
      );

    this.state.points = this.points.map((point) => {
      const { [productId]: removed, ...products } = point.products;
      return { ...point, products };
    });

    return true;
  }

  // Zoekt een bedrijf op basis van de unieke id.
  findCompany(companyId) {
    return this.companies.find(({ id }) => id === companyId);
  }

  companyName(companyId) {
    return this.findCompany(companyId)?.name || "Onbekend bedrijf";
  }

  // Een afwijkend werkgevernummer bij de medewerker (bijv. per teamleider) gaat voor;
  // anders geldt het standaardnummer van het bedrijf.
  employerNumberFor(employee) {
    return employee?.employerNumber || this.findCompany(employee?.companyId)?.employerNumber || "";
  }

  // Bedrijven op alfabetische volgorde, voor lijsten en keuzemenu's.
  sortedCompanies() {
    return [...this.companies].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }

  // Voegt een bedrijf toe of wijzigt naam en werkgevernummer van een bestaand bedrijf.
  saveCompany({ id, name, employerNumber }) {
    const company = { id: id || crypto.randomUUID(), name, employerNumber };

    this.state.companies = this.findCompany(id)
      ? this.companies.map((item) => item.id === id ? { ...item, ...company } : item)
      : [...this.companies, company];
  }

  // Verwijdert een bedrijf alleen als er geen medewerkers of consumptiepunten meer aan hangen.
  removeCompany(companyId) {
    if (
      this.employees.some((employee) => employee.companyId === companyId) ||
      this.points.some((point) => point.companyId === companyId)
    ) {
      return false;
    }

    this.state.companies = this.companies.filter(({ id }) => id !== companyId);
    return true;
  }

  // Zoekt een consumptiepunt op basis van de unieke id.
  findPoint(pointId) {
    return this.points.find(({ id }) => id === pointId);
  }

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
      products: Object.fromEntries(
        this.products.map(({ id: productId }) => [
          productId,
          {
            ...(existing?.products[productId] || { stock: 0, minimum: 0 }),
            offered: offeredProductIds.includes(productId)
          }
        ])
      )
    };

    this.state.points = existing
      ? this.points.map((item) => item.id === id ? point : item)
      : [...this.points, point];
  }

  // Verwijdert een consumptiepunt alleen als er geen medewerkers meer aan gekoppeld zijn.
  // Oude registraties blijven bewaard.
  removePoint(pointId) {
    if (this.employees.some((employee) => employee.pointId === pointId)) return false;

    this.state.points = this.points.filter(({ id }) => id !== pointId);
    return true;
  }

  // De producten die een consumptiepunt aanbiedt.
  offeredProducts(pointId) {
    const point = this.findPoint(pointId);
    if (!point) return [];

    return this.products.filter(({ id }) => point.products[id]?.offered);
  }

  // De producten die een medewerker kan kiezen: het aanbod van het eigen consumptiepunt.
  productsForEmployee(employeeId) {
    return this.offeredProducts(this.findEmployee(employeeId)?.pointId);
  }

  // Wijzigt de voorraadregel van één product op één punt zonder bestaande objecten aan te passen,
  // zodat snapshot/restore blijft werken.
  updateStockEntry(pointId, productId, change) {
    this.state.points = this.points.map((point) => {
      if (point.id !== pointId || !point.products[productId]) return point;

      return {
        ...point,
        products: {
          ...point.products,
          [productId]: change({ ...point.products[productId] })
        }
      };
    });
  }

  // Telt een aantal bij de voorraad op (negatief om af te trekken).
  changeStock(pointId, productId, amount) {
    this.updateStockEntry(pointId, productId, (entry) => ({
      ...entry,
      stock: entry.stock + amount
    }));
  }

  // Vervangt de voorraad door een getelde hoeveelheid.
  setStock(pointId, productId, stock) {
    this.updateStockEntry(pointId, productId, (entry) => ({ ...entry, stock }));
  }

  setMinimum(pointId, productId, minimum) {
    this.updateStockEntry(pointId, productId, (entry) => ({ ...entry, minimum }));
  }

  // Op = niets meer over, Bijbestellen = op of onder het minimum.
  stockStatus({ stock, minimum }) {
    if (stock <= 0) return "out";
    if (stock <= minimum) return "low";
    return "ok";
  }

  // Alle aangeboden producten die op zijn of bijbesteld moeten worden, over alle punten.
  stockAlerts() {
    return this.points.flatMap((point) =>
      this.offeredProducts(point.id)
        .map((product) => ({
          point,
          product,
          entry: point.products[product.id],
          status: this.stockStatus(point.products[product.id])
        }))
        .filter(({ status }) => status !== "ok")
    );
  }

  // Verwijdert een inactieve medewerker definitief; registraties blijven historisch bewaard.
  removeEmployee(employeeId) {
    this.state.employees =
      this.employees.filter(
        ({ id }) => id !== employeeId
      );
  }

  // Bewaart een controleerbaar logboek van wijzigingen door de beheerder.
  logAdminAction(action, details) {
    this.state.auditLog = [
      ...this.auditLog,
      {
        id: crypto.randomUUID(),
        action,
        details,
        createdAt: new Date().toISOString()
      }
    ];
  }

  // Zoekt een medewerker op basis van de unieke id.
  findEmployee(employeeId) {
    return this.employees.find(
      ({ id }) => id === employeeId
    );
  }

  // Telt alle registraties die aan één medewerker gekoppeld zijn.
  countForEmployee(employeeId) {
    return this.registrations.filter(
      ({ employeeId: id }) => id === employeeId
    ).length;
  }

  totalCostForEmployee(employeeId) {
    return this.registrations
      .filter(
        ({ employeeId: id }) => id === employeeId
      )
      .reduce(
        (total, registration) =>
          total +
          (this.products.find(
            ({ id }) =>
              id === registration.productId
          )?.price || 0),
        0
      );
  }

  productName(productId) {
    return (
      this.products.find(
        ({ id }) => id === productId
      )?.name || "Onbekend product"
    );
  }

  // Telt registraties die op dezelfde kalenderdag zijn gemaakt.
  countForDate(date) {
    return this.registrations.filter(
      ({ createdAt }) =>
        new Date(createdAt).toDateString() ===
        date.toDateString()
    ).length;
  }

  // Telt registraties binnen dezelfde maand en hetzelfde jaar.
  countForMonth(date) {
    return this.registrations.filter(
      ({ createdAt }) =>
        this.monthKey(
          new Date(createdAt)
        ) === this.monthKey(date)
    ).length;
  }

  // Maakt een sorteerbare maandcode, bijvoorbeeld 2026-09.
  monthKey(date) {
    return `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
  }
}