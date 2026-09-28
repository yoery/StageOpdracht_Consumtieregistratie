import { DEFAULT_PRODUCTS, DEFAULT_COMPANIES, COLORS } from "./config.js";

// Deze klasse is de opslaglaag. Later kan deze klasse vervangen worden door een API- of database-opslag.
export class DataStore {
  // De sleutel wordt via de constructor ontvangen, zodat opslag later verwisselbaar blijft.
  constructor(key) {
    this.key = key;
  }

  // Leest opgeslagen JSON en weigert onvolledige of beschadigde gegevens.
  load() {
    try {
      const value = localStorage.getItem(this.key);

      if (!value) return null;

      const data = JSON.parse(value);
      const migrated = this.migrate(data);

      const validEmployees =
        Array.isArray(migrated?.employees) &&
        migrated.employees.every(
          (employee) =>
            typeof employee?.id === "string" &&
            typeof employee.name === "string" &&
            employee.name.trim() &&
            typeof employee.color === "string" &&
            typeof employee.active === "boolean"
        );

      const validRegistrations =
        Array.isArray(migrated?.registrations) &&
        migrated.registrations.every(
          (registration) =>
            typeof registration?.id === "string" &&
            typeof registration.employeeId === "string" &&
            typeof registration.productId === "string" &&
            typeof registration.createdAt === "string" &&
            !Number.isNaN(Date.parse(registration.createdAt))
        );

      const validProducts =
        Array.isArray(migrated?.products) &&
        migrated.products.every(
          (product) =>
            typeof product?.id === "string" &&
            typeof product.name === "string" &&
            Number.isFinite(product.price)
        );

      const validCompanies =
        Array.isArray(migrated?.companies) &&
        migrated.companies.every(
          (company) =>
            typeof company?.id === "string" &&
            typeof company.name === "string"
        );

      const validPoints =
        Array.isArray(migrated?.points) &&
        migrated.points.every(
          (point) =>
            typeof point?.id === "string" &&
            typeof point.name === "string" &&
            typeof point.companyId === "string" &&
            point.products !== null &&
            typeof point.products === "object"
        );

      if (
        !validEmployees ||
        !validRegistrations ||
        !validProducts ||
        !validCompanies ||
        !validPoints
      ) {
        console.warn(
          "Ongeldige opgeslagen gegevens; de demo wordt opnieuw gestart."
        );
        return null;
      }

      return migrated;
    } catch (error) {
      console.warn(
        "Opgeslagen gegevens konden niet worden gelezen; de demo wordt opnieuw gestart.",
        error
      );
      return null;
    }
  }

  // Zet oude demo-gegevens om naar de nieuwe medewerker-, product- en registratievelden.
  migrate(data) {
    // Opgeslagen producten gaan voor, zodat gewijzigde prijzen en verwijderde producten bewaard blijven.
    // Alleen oude gegevens zonder productlijst krijgen de standaardproducten.
    const products =
      Array.isArray(data.products) && data.products.length
        ? data.products.map((product) => ({
            ...product,
            price: Number(product.price)
          }))
        : DEFAULT_PRODUCTS.map((product) => ({ ...product }));

    let employees = (data.employees || []).map(
      (employee, index) => {
        const nameParts = String(employee.name || "")
          .trim()
          .split(/\s+/);

        return {
          ...employee,
          name:
            employee.name ||
            `${employee.firstName || ""} ${employee.lastName || ""}`.trim(),
          firstName:
            employee.firstName ||
            nameParts.slice(0, -1).join(" ") ||
            nameParts[0] ||
            "",
          lastName:
            employee.lastName ||
            nameParts.slice(-1)[0] ||
            "",
          payrollCode: employee.payrollCode || "",
          personnelNumber: employee.personnelNumber || "",
          employerNumber: employee.employerNumber ? String(employee.employerNumber) : "",
          companyId: employee.companyId || null,
          pointId: employee.pointId || null,
          active: employee.active !== false,
          color: employee.color || COLORS[index % COLORS.length]
        };
      }
    );

    let companies = data.companies;
    let points = data.points;

    // Oude gegevens hebben nog geen bedrijven en consumptiepunten: die worden hier aangemaakt.
    if (!Array.isArray(companies)) {
      ({ companies, points, employees } = this.migrateCompanies(employees, products));
    }

    // Ieder consumptiepunt krijgt een voorraadregel voor ieder product; nieuwe producten staan uit.
    points = (Array.isArray(points) ? points : []).map((point) => ({
      ...point,
      products: Object.fromEntries(
        products.map(({ id }) => [
          id,
          point.products?.[id] || { offered: false, stock: 0, minimum: 0 }
        ])
      )
    }));

    const registrations = (data.registrations || []).map(
      (registration) => ({
        ...registration,
        productId:
          {
            melk: "glas-melk",
            brood: "sneetje-brood"
          }[registration.productId] ||
          registration.productId ||
          "blikje"
      })
    );

    return {
      employees,
      registrations,
      products,
      companies,
      points,
      auditLog: Array.isArray(data.auditLog)
        ? data.auditLog
        : []
    };
  }

  // Zet de oude vrije tekstvelden bedrijfsnaam en werkgevernummer om naar echte bedrijven.
  // Ieder bedrijf met medewerkers krijgt één consumptiepunt met alle producten, zodat
  // medewerkers na de update dezelfde producten blijven zien als ervoor.
  migrateCompanies(employees, products) {
    const companies = DEFAULT_COMPANIES.map((name) => ({
      id: crypto.randomUUID(),
      name,
      employerNumber: ""
    }));

    const findOrCreateCompany = (name) => {
      let company = companies.find(
        (item) => item.name.toLowerCase() === name.toLowerCase()
      );

      if (!company) {
        company = { id: crypto.randomUUID(), name, employerNumber: "" };
        companies.push(company);
      }

      return company;
    };

    const points = [];

    const migratedEmployees = employees.map(
      ({ employerName, employerNumber, ...employee }) => {
        const companyName = String(employerName || employerNumber || "").trim();
        if (!companyName) return { ...employee, employerNumber: employerNumber || "" };

        // Het eerste werkgevernummer wordt de standaard van het bedrijf; een afwijkend
        // nummer blijft bij de medewerker staan, zodat de export niet verandert.
        const company = findOrCreateCompany(companyName);
        if (!company.employerNumber && employerNumber) {
          company.employerNumber = String(employerNumber);
        }
        employee.employerNumber =
          employerNumber && String(employerNumber) !== company.employerNumber
            ? String(employerNumber)
            : "";

        let point = points.find(({ companyId }) => companyId === company.id);
        if (!point) {
          point = {
            id: crypto.randomUUID(),
            name: company.name,
            companyId: company.id,
            products: Object.fromEntries(
              products.map(({ id }) => [id, { offered: true, stock: 0, minimum: 0 }])
            )
          };
          points.push(point);
        }

        return { ...employee, companyId: company.id, pointId: point.id };
      }
    );

    return { companies, points, employees: migratedEmployees };
  }

  // Schrijft de volledige applicatiestatus veilig naar de browseropslag.
  save(data) {
    try {
      localStorage.setItem(
        this.key,
        JSON.stringify(data)
      );
      return true;
    } catch (error) {
      console.error(
        "De gegevens konden niet worden opgeslagen.",
        error
      );
      return false;
    }
  }
}