import {
  SEED_EMPLOYEES,
  COLORS,
  DEFAULT_PRODUCTS
} from "./config.js";

// Deze klasse bevat de data en alle regels voor medewerkers en registraties.
export class RegistrationModel {
  // Het model gebruikt de opslaglaag en start met opgeslagen of voorbeeldgegevens.
  constructor(store) {
    this.store = store;

    const loadedState = store.load();

    this.state = loadedState
      ? {
          ...loadedState,
          registrations: (loadedState.registrations || []).map(
            (registration) => ({
              ...registration,
              productId:
                {
                  melk: "glas-melk",
                  brood: "sneetje-brood"
                }[registration.productId] ||
                registration.productId
            })
          )
        }
      : this.createSeedState();
  }

  // Maakt de eerste demo-status met voorbeeldmedewerkers zonder registraties.
  createSeedState() {
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
          employerName: "",
          employerNumber: "",
          active: true,
          color: COLORS[index % COLORS.length]
        };
      }),
      registrations: [],
      products: DEFAULT_PRODUCTS.map((product) => ({
        ...product
      })),
      auditLog: []
    };
  }

  // Maakt een kopie die gebruikt kan worden om een wijziging terug te draaien.
  snapshot() {
    return {
      employees: [...this.state.employees],
      registrations: [...this.state.registrations],
      products: [...this.state.products],
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

  // Voegt precies één product toe met het huidige tijdstip.
  addRegistration(employeeId, productId = "blikje") {
    this.state.registrations = [
      ...this.registrations,
      {
        id: crypto.randomUUID(),
        employeeId,
        productId,
        createdAt: new Date().toISOString()
      }
    ];
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

    this.state.products = exists
      ? this.products.map((item) =>
          item.id === product.id
            ? product
            : item
        )
      : [
          ...this.products,
          {
            ...product,
            id: crypto.randomUUID()
          }
        ];
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

    return true;
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { RegistrationModel };
}