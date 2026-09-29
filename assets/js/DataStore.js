import { DEFAULT_PRODUCTS, DEFAULT_COMPANIES, COLORS } from "./config.js";

// Oude product-id's uit een eerdere versie en hun nieuwe naam.
const OLD_PRODUCT_IDS = {
  melk: "glas-melk",
  brood: "sneetje-brood"
};

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
 *
 * Alleen deze class weet dat de gegevens in localStorage staan. Voor een echte database
 * kan een andere class met dezelfde methodes load() en save() worden gebruikt; de rest
 * van de applicatie hoeft dan niet te veranderen.
 */
export class DataStore {
  // De sleutel waaronder de gegevens in localStorage staan.
  constructor(key) {
    this.key = key;
  }

  // ------------------------------------------------------------------
  // Lezen en opslaan
  // ------------------------------------------------------------------

  // Leest de opgeslagen gegevens. Geeft null terug als er niets is opgeslagen of als de
  // gegevens beschadigd zijn; het model start dan met demogegevens.
  load() {
    try {
      const value = localStorage.getItem(this.key);
      if (!value) return null;

      const data = this.migrate(JSON.parse(value));

      if (!this.isValid(data)) {
        console.warn("Ongeldige opgeslagen gegevens; de demo wordt opnieuw gestart.");
        return null;
      }

      return data;
    } catch (error) {
      console.warn("Opgeslagen gegevens konden niet worden gelezen; de demo wordt opnieuw gestart.", error);
      return null;
    }
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

  // Zijn alle onderdelen aanwezig en in de juiste vorm?
  isValid(data) {
    return (
      this.allValid(data?.employees, (employee) => this.isValidEmployee(employee)) &&
      this.allValid(data?.registrations, (registration) => this.isValidRegistration(registration)) &&
      this.allValid(data?.products, (product) => this.isValidProduct(product)) &&
      this.allValid(data?.companies, (company) => this.isValidCompany(company)) &&
      this.allValid(data?.points, (point) => this.isValidPoint(point))
    );
  }

  // Hulpfunctie: is dit een lijst waarvan ieder item de controle doorstaat?
  allValid(list, check) {
    return Array.isArray(list) && list.every(check);
  }

  isValidEmployee(employee) {
    return (
      typeof employee?.id === "string" &&
      typeof employee.name === "string" &&
      employee.name.trim() !== "" &&
      typeof employee.color === "string" &&
      typeof employee.active === "boolean"
    );
  }

  isValidRegistration(registration) {
    return (
      typeof registration?.id === "string" &&
      typeof registration.employeeId === "string" &&
      typeof registration.productId === "string" &&
      typeof registration.createdAt === "string" &&
      !Number.isNaN(Date.parse(registration.createdAt))
    );
  }

  isValidProduct(product) {
    return typeof product?.id === "string" && typeof product.name === "string" && Number.isFinite(product.price);
  }

  isValidCompany(company) {
    return typeof company?.id === "string" && typeof company.name === "string";
  }

  isValidPoint(point) {
    return (
      typeof point?.id === "string" &&
      typeof point.name === "string" &&
      typeof point.companyId === "string" &&
      point.products !== null &&
      typeof point.products === "object"
    );
  }

  // ------------------------------------------------------------------
  // Oude gegevens omzetten (migratie)
  // ------------------------------------------------------------------

  // Zet opgeslagen gegevens om naar de huidige opbouw. Ontbrekende velden krijgen een
  // standaardwaarde, zodat ook gegevens uit een oudere versie blijven werken.
  migrate(data) {
    const products = this.migrateProducts(data.products);
    let employees = (data.employees || []).map((employee, index) => this.migrateEmployee(employee, index));
    let companies = data.companies;
    let points = data.points;

    // Oude gegevens hebben nog geen bedrijven en consumptiepunten: die worden hier aangemaakt.
    if (!Array.isArray(companies)) {
      ({ companies, points, employees } = this.migrateCompanies(employees, products));
    }

    return {
      employees,
      registrations: (data.registrations || []).map((registration) => this.migrateRegistration(registration)),
      products,
      companies,
      points: (Array.isArray(points) ? points : []).map((point) => this.completePointStock(point, products)),
      auditLog: Array.isArray(data.auditLog) ? data.auditLog : []
    };
  }

  // Opgeslagen producten gaan voor, zodat gewijzigde prijzen en verwijderde producten bewaard
  // blijven. Alleen oude gegevens zonder productlijst krijgen de standaardproducten.
  migrateProducts(storedProducts) {
    if (Array.isArray(storedProducts) && storedProducts.length > 0) {
      return storedProducts.map((product) => ({ ...product, price: Number(product.price) }));
    }
    return DEFAULT_PRODUCTS.map((product) => ({ ...product }));
  }

  // Vult ontbrekende velden van een medewerker aan. Een oude naam als "Anna van der Berg"
  // wordt opgesplitst in voornaam "Anna van der" en achternaam "Berg".
  migrateEmployee(employee, index) {
    const nameParts = String(employee.name || "").trim().split(/\s+/);
    const fullName = employee.name || `${employee.firstName || ""} ${employee.lastName || ""}`.trim();

    return {
      ...employee,
      name: fullName,
      firstName: employee.firstName || nameParts.slice(0, -1).join(" ") || nameParts[0] || "",
      lastName: employee.lastName || nameParts.slice(-1)[0] || "",
      payrollCode: employee.payrollCode || "",
      personnelNumber: employee.personnelNumber || "",
      employerNumber: employee.employerNumber ? String(employee.employerNumber) : "",
      companyId: employee.companyId || null,
      pointId: employee.pointId || null,
      active: employee.active !== false,
      color: employee.color || COLORS[index % COLORS.length]
    };
  }

  // Zet oude product-id's om; een registratie zonder product wordt een blikje.
  migrateRegistration(registration) {
    const productId = OLD_PRODUCT_IDS[registration.productId] || registration.productId || "blikje";
    return { ...registration, productId };
  }

  // Ieder consumptiepunt krijgt een voorraadregel voor ieder product; nieuwe producten staan uit.
  completePointStock(point, products) {
    const completedProducts = {};

    for (const product of products) {
      completedProducts[product.id] = point.products?.[product.id] || { offered: false, stock: 0, minimum: 0 };
    }

    return { ...point, products: completedProducts };
  }

  // Zet de oude vrije tekstvelden bedrijfsnaam en werkgevernummer om naar echte bedrijven.
  // Ieder bedrijf met medewerkers krijgt één consumptiepunt met alle producten, zodat
  // medewerkers na de update dezelfde producten blijven zien als ervoor.
  migrateCompanies(employees, products) {
    const companies = DEFAULT_COMPANIES.map((name) => ({ id: crypto.randomUUID(), name, employerNumber: "" }));
    const points = [];

    // Zoekt een bedrijf op naam (hoofdletters maken niet uit), of maakt het aan.
    const findOrCreateCompany = (name) => {
      let company = companies.find((item) => item.name.toLowerCase() === name.toLowerCase());

      if (!company) {
        company = { id: crypto.randomUUID(), name, employerNumber: "" };
        companies.push(company);
      }

      return company;
    };

    // Zoekt het consumptiepunt van een bedrijf, of maakt er één met alle producten.
    const findOrCreatePoint = (company) => {
      let point = points.find((item) => item.companyId === company.id);

      if (!point) {
        point = { id: crypto.randomUUID(), name: company.name, companyId: company.id, products: {} };
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
