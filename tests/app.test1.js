import test from "node:test";

import assert from "node:assert/strict";


import { RegistrationModel } from "../assets/js/RegistrationModel.js";
import { DataStore } from "../assets/js/DataStore.js";
import { payrollPeriod, buildPayrollRows, toCsv } from "../assets/js/csvExport.js";

import { DEFAULT_PRODUCTS } from "../assets/js/config.js";

// Node heeft geen localStorage; deze nep-versie bewaart alles in een Map.
const fakeLocalStorage = () => {
  const items = new Map();
  globalThis.localStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key)
  };
};

// Maakt een echte DataStore met de opgegeven opgeslagen gegevens.
const createDataStore = (storedData) => {
  fakeLocalStorage();
  if (storedData) localStorage.setItem("test", JSON.stringify(storedData));
  return new DataStore("test");
};

const createStore = (state = null) => ({
  load: () => state,
  save: (nextState) => {
    state = nextState;
    return true;
  }
});

const createModel = () => {
  const model = new RegistrationModel(createStore());

  model.state.employees = [{
    id: "employee-1",
    name: "Test Medewerker",
    firstName: "Test",
    lastName: "Medewerker",
    payrollCode: "",
    personnelNumber: "",
    employerName: "",
    employerNumber: "",
    active: true,
    color: "#d8f1e8"
  }];
 
  model.state.registrations = [];
  model.state.products = DEFAULT_PRODUCTS.map(p => ({ ...p }));
  model.state.auditLog = [];

  return model;
};

test("start met alle standaardproducten en prijzen", () => {
  const model = createModel();

  assert.deepEqual(model.products, DEFAULT_PRODUCTS);
  assert.equal(
    model.products.find(p => p.id === "blikje").price,
    0.65
  );
  assert.equal(
    model.products.find(p => p.id === "yoghurt").price,
    0.50
  );
});

test("voegt een registratie toe met medewerker, product en tijdstip", () => {
  const model = createModel();

  model.addRegistration("employee-1", "blikje");

  assert.equal(model.registrations.length, 1);
  assert.equal(model.registrations[0].employeeId, "employee-1");
  assert.equal(model.registrations[0].productId, "blikje");

  assert.equal(
    Number.isNaN(Date.parse(model.registrations[0].createdAt)),
    false
  );
});

test("iedere registratie krijgt een uniek id", () => {
  const model = createModel();

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "boter");

  assert.notEqual(
    model.registrations[0].id,
    model.registrations[1].id
  );
});

test("verwijdert alleen de laatste registratie van het gekozen product", () => {
  const model = createModel();

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "glas-melk");
  model.addRegistration("employee-1", "blikje");

  assert.equal(
    model.removeLastRegistration("employee-1", "blikje"),
    true
  );

  assert.deepEqual(
    model.registrations.map(r => r.productId),
    ["blikje", "glas-melk"]
  );

  assert.equal(
    model.removeLastRegistration("employee-1", "yoghurt"),
    false
  );
});

test("verwijderen van registratie bij lege lijst retourneert false", () => {
  const model = createModel();

  assert.equal(
    model.removeLastRegistration("employee-1", "blikje"),
    false
  );
});

test("registraties van andere medewerkers worden niet verwijderd", () => {
  const model = createModel();

  model.state.employees.push({
    id: "employee-2",
    name: "Tweede",
    firstName: "Tweede",
    lastName: "Medewerker",
    active: true,
    color: "#ffffff"
  });

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-2", "blikje");

  model.removeLastRegistration("employee-1", "blikje");

  assert.equal(model.countForEmployee("employee-1"), 0);
  assert.equal(model.countForEmployee("employee-2"), 1);
});

test("berekent aantallen en kosten per medewerker", () => {
  const model = createModel();

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "boter");
  model.addRegistration("employee-1", "boter");

  assert.equal(model.countForEmployee("employee-1"), 3);
  assert.equal(model.totalCostForEmployee("employee-1"), 0.85);
});

test("countForEmployee retourneert 0 zonder registraties", () => {
  const model = createModel();

  assert.equal(
    model.countForEmployee("employee-1"),
    0
  );
});

test("totalCostForEmployee retourneert 0 zonder registraties", () => {
  const model = createModel();

  assert.equal(
    model.totalCostForEmployee("employee-1"),
    0
  );
});

test("berekent kosten alleen voor geselecteerde medewerker", () => {
  const model = createModel();

  model.state.employees.push({
    id: "employee-2",
    name: "Tweede",
    firstName: "Tweede",
    lastName: "Medewerker",
    active: true,
    color: "#fff"
  });

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-2", "boter");
  model.addRegistration("employee-2", "boter");

  assert.equal(
    model.totalCostForEmployee("employee-1"),
    0.65
  );

  assert.equal(
    Number(model.totalCostForEmployee("employee-2").toFixed(2)),
    0.20
  );
});

test("registraties blijven in invoervolgorde bewaard", () => {
  const model = createModel();

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "boter");
  model.addRegistration("employee-1", "yoghurt");

  assert.deepEqual(
    model.registrations.map(r => r.productId),
    ["blikje", "boter", "yoghurt"]
  );
});

test("migreert oude product-id's naar de nieuwe productnamen", () => {
  const model = new RegistrationModel(createDataStore({
    employees: [{
      id: "employee-1",
      name: "Test Medewerker",
      color: "#d8f1e8",
      active: true
    }],
    registrations: [
      {
        id: "registration-1",
        employeeId: "employee-1",
        productId: "melk",
        createdAt: "2026-09-10T10:00:00.000Z"
      },
      {
        id: "registration-2",
        employeeId: "employee-1",
        productId: "brood",
        createdAt: "2026-09-10T10:05:00.000Z"
      }
    ],
    products: [],
    auditLog: []
  }));

  assert.deepEqual(
    model.registrations.map(r => r.productId),
    ["glas-melk", "sneetje-brood"]
  );
});

test("migratie laat nieuwe product-id's ongemoeid", () => {
  const model = new RegistrationModel(createDataStore({
    employees: [{
      id: "employee-1",
      name: "Test"
    }],
    registrations: [{
      id: "registration-1",
      employeeId: "employee-1",
      productId: "glas-melk",
      createdAt: "2026-09-10T10:00:00.000Z"
    }],
    products: [],
    auditLog: []
  }));

  assert.equal(
    model.registrations[0].productId,
    "glas-melk"
  );
});

test("gewijzigde prijs van een standaardproduct blijft bewaard na herladen", () => {
  const store = createDataStore();
  const model = new RegistrationModel(store);

  model.saveProduct({ id: "blikje", name: "Blikje", price: "0.70" });
  assert.equal(model.save(), true);

  const reloaded = new RegistrationModel(store);

  assert.equal(
    reloaded.products.find(p => p.id === "blikje").price,
    0.70
  );
});

test("verwijderd standaardproduct komt niet terug na herladen", () => {
  const store = createDataStore();
  const model = new RegistrationModel(store);

  assert.equal(model.removeProduct("yoghurt"), true);
  model.save();

  const reloaded = new RegistrationModel(store);

  assert.equal(
    reloaded.products.some(p => p.id === "yoghurt"),
    false
  );
});

test("oude gegevens zonder productlijst krijgen de standaardproducten", () => {
  const model = new RegistrationModel(createDataStore({
    employees: [],
    registrations: []
  }));

  assert.deepEqual(model.products, DEFAULT_PRODUCTS);
});

test("beschadigde opgeslagen gegevens starten de demo opnieuw", () => {
  fakeLocalStorage();
  localStorage.setItem("test", "{geen geldige json");

  assert.equal(new DataStore("test").load(), null);
});

test("findEmployee retourneert juiste medewerker", () => {
  const model = createModel();

  const employee =
    model.findEmployee("employee-1");

  assert.equal(employee.name, "Test Medewerker");
});

test("setEmployeeActive zet medewerker inactief", () => {
  const model = createModel();

  model.setEmployeeActive("employee-1", false);

  assert.equal(
    model.findEmployee("employee-1").active,
    false
  );
});

test("updateEmployee wijzigt gegevens", () => {
  const model = createModel();

  model.updateEmployee("employee-1", {
    firstName: "Nieuwe",
    lastName: "Naam",
    payrollCode: "LC01",
    personnelNumber: "123",
    employerName: "Bedrijf",
    employerNumber: "999"
  });

  const employee =
    model.findEmployee("employee-1");

  assert.equal(employee.name, "Nieuwe Naam");
  assert.equal(employee.payrollCode, "LC01");
});

test("addEmployee voegt medewerker toe", () => {
  const model = createModel();

  const before = model.employees.length;

  model.addEmployee({
    firstName: "Jan",
    lastName: "Jansen",
    payrollCode: "",
    personnelNumber: "",
    employerName: "",
    employerNumber: ""
  });

  assert.equal(
    model.employees.length,
    before + 1
  );

  const employee =
    model.employees[model.employees.length - 1];

  assert.equal(employee.name, "Jan Jansen");
  assert.equal(employee.active, true);
});

test("removeEmployee verwijdert medewerker", () => {
  const model = createModel();

  model.removeEmployee("employee-1");

  assert.equal(model.employees.length, 0);
});

test("productName retourneert productnaam", () => {
  const model = createModel();

  assert.equal(
    model.productName("blikje"),
    "Blikje"
  );
});

test("productName retourneert fallback voor onbekend product", () => {
  const model = createModel();

  assert.equal(
    model.productName("onbekend"),
    "Onbekend product"
  );
});

test("saveProduct voegt nieuw product toe", () => {
  const model = createModel();

  const before = model.products.length;

  model.saveProduct({
    id: "nieuw-product",
    name: "Nieuw",
    price: "1.25"
  });

  assert.equal(
    model.products.length,
    before + 1
  );

  assert.ok(
    model.products.some(
      p => p.name === "Nieuw"
    )
  );
});

test("saveProduct wijzigt bestaand product", () => {
  const model = createModel();

  model.saveProduct({
    id: "blikje",
    name: "Blikje",
    price: "1.00"
  });

  assert.equal(
    model.products.find(p => p.id === "blikje").price,
    1
  );
});

test("removeProduct verwijdert ongebruikt product", () => {
  const model = createModel();

  model.state.products.push({
    id: "test-product",
    name: "Test",
    price: 1
  });

  const result =
    model.removeProduct("test-product");

  assert.equal(result, true);

  assert.equal(
    model.products.some(
      p => p.id === "test-product"
    ),
    false
  );
});

test("removeProduct weigert gebruikt product", () => {
  const model = createModel();

  model.addRegistration(
    "employee-1",
    "blikje"
  );

  assert.equal(
    model.removeProduct("blikje"),
    false
  );
});

test("logAdminAction voegt auditregel toe", () => {
  const model = createModel();

  model.logAdminAction(
    "Registratie toegevoegd",
    "Test details"
  );

  assert.equal(
    model.auditLog.length,
    1
  );

  assert.equal(
    model.auditLog[0].action,
    "Registratie toegevoegd"
  );

  assert.equal(
    model.auditLog[0].details,
    "Test details"
  );
});

test("monthKey maakt correcte maandcode", () => {
  const model = createModel();

  assert.equal(
    model.monthKey(
      new Date("2026-09-15")
    ),
    "2026-09"
  );
});

test("countForDate telt registraties van dezelfde dag", () => {
  const model = createModel();

  model.state.registrations = [
    {
      id: "1",
      employeeId: "employee-1",
      productId: "blikje",
      createdAt: "2026-09-15T10:00:00.000Z"
    },
    {
      id: "2",
      employeeId: "employee-1",
      productId: "blikje",
      createdAt: "2026-09-15T11:00:00.000Z"
    }
  ];

  assert.equal(
    model.countForDate(
      new Date("2026-09-15")
    ),
    2
  );
});

test("countForMonth telt registraties van dezelfde maand", () => {
  const model = createModel();

  model.state.registrations = [
    {
      id: "1",
      employeeId: "employee-1",
      productId: "blikje",
      createdAt: "2026-09-01T10:00:00.000Z"
    },
    {
      id: "2",
      employeeId: "employee-1",
      productId: "blikje",
      createdAt: "2026-09-20T10:00:00.000Z"
    }
  ];

  assert.equal(
    model.countForMonth(
      new Date("2026-09-15")
    ),
    2
  );
});

test("save schrijft state naar de store", () => {
  let savedState = null;

  const store = {
    load: () => null,
    save: (state) => {
      savedState = state;
      return true;
    }
  };

  const model = createModel();

  model.store = store;

  model.addRegistration(
    "employee-1",
    "blikje"
  );

  const result = model.save();

  assert.equal(result, true);
  assert.ok(savedState);
  assert.equal(
    savedState.registrations.length,
    1
  );
});
test("loonmaand is de maand na de consumptie", () => {
  assert.deepEqual(
    payrollPeriod(new Date(2026, 8, 15)),
    { year: 2026, month: 10 }
  );
});

test("consumpties uit december gaan naar januari van het volgende jaar", () => {
  assert.deepEqual(
    payrollPeriod(new Date(2026, 11, 31)),
    { year: 2027, month: 1 }
  );
});

test("export telt per medewerker per loonmaand met prijzen", () => {
  const model = createModel();

  model.state.registrations = [
    { id: "1", employeeId: "employee-1", productId: "blikje", createdAt: "2026-09-10T12:00:00" },
    { id: "2", employeeId: "employee-1", productId: "boter", createdAt: "2026-09-20T12:00:00" },
    { id: "3", employeeId: "employee-1", productId: "blikje", createdAt: "2026-10-05T12:00:00" }
  ];

  const rows = buildPayrollRows(model, "all", "2026-09");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].Jaar, 2026);
  assert.equal(rows[0].Maand, 10);
  assert.equal(rows[0].Totaal, 2);
  assert.equal(rows[0].Prijs, 0.75);
});

test("csv gebruikt puntkomma's en maakt speciale tekens en formules veilig", () => {
  const csv = toCsv([{
    Jaar: 2026,
    Maand: 10,
    Looncode: "",
    Personeelsnummer: "",
    Werkgevernummer: "",
    Naam: "=Jansen; \"Jan\"",
    Totaal: 2,
    Prijs: "0,75"
  }]);

  const [header, row] = csv.split("\r\n");

  assert.equal(header, "Jaar;Maand;Looncode;Personeelsnummer;Werkgevernummer;Naam;Totaal;Prijs");
  assert.equal(row, "2026;10;;;;\"'=Jansen; \"\"Jan\"\"\";2;0,75");
});
