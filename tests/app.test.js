const test = require("node:test");
const assert = require("node:assert/strict");
const { RegistrationModel, DEFAULT_PRODUCTS } = require("../assets/js/app.js");

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
    employerNumber: "",
    active: true,
    color: "#d8f1e8"
  }];
  return model;
};

test("start met alle standaardproducten en prijzen", () => {
  const model = createModel();

  assert.deepEqual(model.products, DEFAULT_PRODUCTS);
  assert.equal(model.products.find(({ id }) => id === "blikje").price, 0.65);
  assert.equal(model.products.find(({ id }) => id === "yoghurt").price, 0.50);
});

test("voegt een registratie toe met medewerker, product en tijdstip", () => {
  const model = createModel();

  model.addRegistration("employee-1", "blikje");

  assert.equal(model.registrations.length, 1);
  assert.deepEqual(model.registrations[0], {
    id: model.registrations[0].id,
    employeeId: "employee-1",
    productId: "blikje",
    createdAt: model.registrations[0].createdAt
  });
  assert.equal(Number.isNaN(Date.parse(model.registrations[0].createdAt)), false);
});

test("verwijdert alleen de laatste registratie van het gekozen product", () => {
  const model = createModel();

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "melk");
  model.addRegistration("employee-1", "blikje");

  assert.equal(model.removeLastRegistration("employee-1", "blikje"), true);
  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["blikje", "melk"]);
  assert.equal(model.removeLastRegistration("employee-1", "yoghurt"), false);
});

test("berekent aantallen en kosten per medewerker", () => {
  const model = createModel();

  model.addRegistration("employee-1", "blikje");
  model.addRegistration("employee-1", "boter");
  model.addRegistration("employee-1", "boter");

  assert.equal(model.countForEmployee("employee-1"), 3);
  assert.equal(model.totalCostForEmployee("employee-1"), 0.85);
});

test("migreert oude product-id's naar de nieuwe productnamen", () => {
  const model = new RegistrationModel(createStore({
    employees: [{
      id: "employee-1",
      name: "Test Medewerker",
      color: "#d8f1e8",
      active: true
    }],
    registrations: [
      { id: "registration-1", employeeId: "employee-1", productId: "melk", createdAt: "2026-09-10T10:00:00.000Z" },
      { id: "registration-2", employeeId: "employee-1", productId: "brood", createdAt: "2026-09-10T10:05:00.000Z" }
    ],
    products: [],
    auditLog: []
  }));

  assert.deepEqual(model.registrations.map(({ productId }) => productId), ["glas-melk", "sneetje-brood"]);
});
