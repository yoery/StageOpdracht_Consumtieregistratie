// Tests voor de CSV-export naar de loonadministratie.
import test from "node:test";
import assert from "node:assert/strict";

import { CsvExport } from "../assets/js/csvExport.js";
import { createModel, addEmployee, registration } from "./helpers.js";

// Model met registraties op vaste datums (lokale tijd).
const createExportModel = () => {
  const { model, point } = createModel();
  model.state.employees[0].name = "Bram Bakker";
  addEmployee(model, { name: "Anna Aalders", companyId: point.companyId, pointId: point.id });
  model.state.registrations = [
    registration("1", "employee-1", "blikje", "2026-09-10T12:00:00"),
    registration("2", "employee-1", "blikje", "2026-10-02T12:00:00"),
    registration("3", "employee-2", "boter", "2026-09-20T12:00:00")
  ];
  return model;
};

test("loonmaand gaat midden in het jaar een maand verder", () => {
  assert.deepEqual(createModel().model.payrollPeriod(new Date(2026, 0, 31)), { year: 2026, month: 2 });
  assert.deepEqual(createModel().model.payrollPeriod(new Date(2026, 10, 1)), { year: 2026, month: 12 });
});

test("loonmaand van de laatste seconde van december is januari", () => {
  assert.deepEqual(createModel().model.payrollPeriod(new Date(2026, 11, 31, 23, 59, 59)), { year: 2027, month: 1 });
});

test("zonder filters komt iedere medewerker per loonmaand op een eigen regel", () => {
  const rows = new CsvExport(createExportModel()).buildRows("all", "all");

  assert.deepEqual(
    rows.map(({ Naam, Maand, Totaal }) => [Naam, Maand, Totaal]),
    [["Anna Aalders", 10, 1], ["Bram Bakker", 10, 1], ["Bram Bakker", 11, 1]]
  );
});

test("regels staan op jaar, maand en daarna naam", () => {
  const model = createExportModel();
  model.state.registrations.push(registration("4", "employee-2", "blikje", "2025-12-15T12:00:00"));

  const rows = new CsvExport(model).buildRows("all", "all");

  assert.deepEqual(rows.map(({ Jaar, Maand }) => `${Jaar}-${Maand}`), ["2026-1", "2026-10", "2026-10", "2026-11"]);
});

test("filter op medewerker neemt alleen die medewerker mee", () => {
  const rows = new CsvExport(createExportModel()).buildRows("employee-2", "all");

  assert.deepEqual(rows.map(({ Naam }) => Naam), ["Anna Aalders"]);
});

test("filter op consumptiemaand september geeft loonmaand oktober", () => {
  const rows = new CsvExport(createExportModel()).buildRows("all", "2026-09");

  assert.equal(rows.length, 2);
  assert.ok(rows.every(({ Jaar, Maand }) => Jaar === 2026 && Maand === 10));
});

test("filter zonder passende registraties geeft een lege lijst", () => {
  assert.deepEqual(new CsvExport(createExportModel()).buildRows("all", "2020-01"), []);
});

// Een medewerker met registraties kan nu niet meer worden verwijderd. Oude gegevens kunnen zo'n
// medewerker toch missen (verwijderd vóór die regel); daarom wordt dat hier nagebootst.
test("verwijderde medewerker staat in de export als 'Verwijderd'", () => {
  const model = createExportModel();
  model.state.employees = model.employees.filter(({ id }) => id !== "employee-2");

  const row = new CsvExport(model).buildRows("all", "2026-09").find(({ Naam }) => Naam === "Verwijderd");

  assert.ok(row);
  assert.equal(row.Werkgevernummer, "");
});

test("onbekend product telt mee in het aantal maar niet in de prijs", () => {
  const model = createExportModel();
  model.state.registrations = [
    registration("1", "employee-1", "blikje", "2026-09-10T12:00:00"),
    registration("2", "employee-1", "bestaat-niet", "2026-09-11T12:00:00")
  ];

  const [row] = new CsvExport(model).buildRows("all", "all");

  assert.equal(row.Totaal, 2);
  assert.equal(row.Prijs, 0.65);
});

test("prijs wordt afgerond op twee decimalen", () => {
  const model = createExportModel();
  model.state.registrations = [
    registration("1", "employee-1", "sneetje-brood", "2026-09-10T12:00:00"),
    registration("2", "employee-1", "zoet-beleg", "2026-09-10T12:01:00")
  ];

  // 0.10 + 0.20 is in JavaScript 0.30000000000000004
  assert.equal(new CsvExport(model).buildRows("all", "all")[0].Prijs, 0.3);
});

test("looncode en personeelsnummer komen van de medewerker", () => {
  const model = createExportModel();
  model.updateEmployee("employee-1", { ...model.findEmployee("employee-1"), payrollCode: "LC7", personnelNumber: "4411" });

  const row = new CsvExport(model).buildRows("employee-1", "all")[0];

  assert.equal(row.Looncode, "LC7");
  assert.equal(row.Personeelsnummer, "4411");
});

test("csv zonder regels bevat alleen de kolomkoppen", () => {
  assert.equal(new CsvExport(null).toCsv([]), CsvExport.COLUMNS.join(";"));
});

test("csv gebruikt Windows-regeleinden en de vaste kolomvolgorde", () => {
  const row = Object.fromEntries(CsvExport.COLUMNS.map((column, index) => [column, index]));

  assert.equal(new CsvExport(null).toCsv([row]), `${CsvExport.COLUMNS.join(";")}\r\n0;1;2;3;4;5;6;7`);
});

test("csv zet velden met een regeleinde tussen aanhalingstekens", () => {
  const csv = new CsvExport(null).toCsv([{ Naam: "Regel 1\nRegel 2" }]);

  assert.ok(csv.endsWith(';"Regel 1\nRegel 2";;'));
});

test("csv beschermt tegen formules die met + - of @ beginnen", () => {
  const csv = new CsvExport(null).toCsv([{ Looncode: "+31", Personeelsnummer: "-5", Werkgevernummer: "@SUM", Naam: "Gewoon" }]);

  assert.equal(csv.split("\r\n")[1], ";;'+31;'-5;'@SUM;Gewoon;;");
});

test("csv laat lege en ontbrekende waarden leeg", () => {
  const csv = new CsvExport(null).toCsv([{ Jaar: null, Maand: undefined, Naam: "" }]);

  assert.equal(csv.split("\r\n")[1], ";;;;;;;");
});

test("download zonder registraties downloadt niets en geeft false terug", () => {
  const { model } = createModel();

  assert.equal(new CsvExport(model).download("all", "all"), false);
});

test("bestandsnaam bevat de loonmaand, of 'alle-periodes' zonder maandfilter", () => {
  const exporter = new CsvExport(createModel().model);

  assert.equal(exporter.fileName("2026-09"), "blikjesregistratie-loonmaand-2026-10.csv");
  assert.equal(exporter.fileName("2026-12"), "blikjesregistratie-loonmaand-2027-01.csv");
  assert.equal(exporter.fileName("all"), "blikjesregistratie-alle-periodes.csv");
});

test("prijs in de CSV heeft een komma en twee decimalen", () => {
  const exporter = new CsvExport(null);

  assert.equal(exporter.formatPrice(1.3), "1,30");
  assert.equal(exporter.formatPrice(0), "0,00");
});

test("csv beschermt ook tegen een tab of regeleinde aan het begin van een veld", () => {
  const csv = new CsvExport(createExportModel());

  assert.equal(csv.escapeField("\tCode"), "'\tCode");
  assert.equal(csv.escapeField("\rCode"), "\"'\rCode\"");
  assert.equal(csv.escapeField("Jan; de Vries"), "\"Jan; de Vries\"");
  assert.equal(csv.escapeField('Jan "JJ" Jansen'), '"Jan ""JJ"" Jansen"');
});

test("bestandsnaam voor december heeft de loonmaand januari van het volgende jaar", () => {
  const csv = new CsvExport(createExportModel());

  assert.equal(csv.fileName("2026-12"), "blikjesregistratie-loonmaand-2027-01.csv");
});
