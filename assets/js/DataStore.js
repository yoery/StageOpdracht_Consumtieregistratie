import { DEFAULT_PRODUCTS, COLORS } from "./config.js";

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

      if (
        !validEmployees ||
        !validRegistrations ||
        !validProducts
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
    const storedProducts = Array.isArray(data.products)
      ? data.products
      : [];

    const products = DEFAULT_PRODUCTS
      .map((defaultProduct) => defaultProduct)
      .concat(
        storedProducts.filter(
          ({ id }) =>
            !DEFAULT_PRODUCTS.some(
              (defaultProduct) => defaultProduct.id === id
            )
        )
      );

    const employees = (data.employees || []).map(
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
          employerName: employee.employerName || "",
          employerNumber: employee.employerNumber || "",
          active: employee.active !== false,
          color: employee.color || COLORS[index % COLORS.length]
        };
      }
    );

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
      auditLog: Array.isArray(data.auditLog)
        ? data.auditLog
        : []
    };
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