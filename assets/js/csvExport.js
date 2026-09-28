// Vaste kolomvolgorde voor de loonadministratie.
export const CSV_COLUMNS = [
  "Jaar",
  "Maand",
  "Looncode",
  "Personeelsnummer",
  "Werkgevernummer",
  "Naam",
  "Totaal",
  "Prijs"
];

// Consumpties worden verwerkt in de loonadministratie van de maand erna:
// september 2026 → oktober 2026, december 2026 → januari 2027.
export function payrollPeriod(date) {
  const period = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return {
    year: period.getFullYear(),
    month: period.getMonth() + 1
  };
}

// Telt de registraties per medewerker per loonmaand, met de filters uit het beheerscherm.
export function buildPayrollRows(model, selectedEmployee, selectedMonth) {
  const grouped = new Map();

  model.registrations
    .filter(
      (registration) =>
        (selectedEmployee === "all" ||
          registration.employeeId === selectedEmployee) &&
        (selectedMonth === "all" ||
          model.monthKey(new Date(registration.createdAt)) === selectedMonth)
    )
    .forEach((registration) => {
      const { year, month } = payrollPeriod(new Date(registration.createdAt));
      const key = `${registration.employeeId}-${year}-${month}`;

      const current = grouped.get(key) || {
        employee: model.findEmployee(registration.employeeId),
        year,
        month,
        total: 0,
        price: 0
      };

      current.total += 1;
      current.price +=
        model.products.find(({ id }) => id === registration.productId)?.price || 0;

      grouped.set(key, current);
    });

  return [...grouped.values()]
    .map(({ employee, year, month, total, price }) => ({
      Jaar: year,
      Maand: month,
      Looncode: employee?.payrollCode || "",
      Personeelsnummer: employee?.personnelNumber || "",
      Werkgevernummer: employee?.employerNumber || "",
      Naam: employee?.name || "Verwijderd",
      Totaal: total,
      Prijs: Number(price.toFixed(2))
    }))
    .sort(
      (a, b) =>
        a.Jaar - b.Jaar ||
        a.Maand - b.Maand ||
        a.Naam.localeCompare(b.Naam, "nl")
    );
}

// Maakt één CSV-veld veilig: quotes rond speciale tekens en geen formules
// (een naam die met = + - @ begint zou Excel anders als formule uitvoeren).
function csvField(value) {
  let text = String(value ?? "");

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;

  return text;
}

// Zet rijen om naar CSV met puntkomma's, zoals een Nederlandse Excel verwacht.
export function toCsv(rows) {
  return [CSV_COLUMNS, ...rows.map((row) => CSV_COLUMNS.map((column) => row[column]))]
    .map((fields) => fields.map(csvField).join(";"))
    .join("\r\n");
}

// Prijs met komma en twee decimalen, bijvoorbeeld 1,30.
const formatPrice = (value) => value.toFixed(2).replace(".", ",");

export function exportCsv(model, selectedEmployee, selectedMonth, view) {
  const rows = buildPayrollRows(model, selectedEmployee, selectedMonth);

  if (!rows.length) {
    view.showToast("Geen registraties om te exporteren voor deze filters.");
    return;
  }

  // Geen totaalregel: de loonadministratie leest iedere regel in als medewerker.
  const csvRows = rows.map((row) => ({ ...row, Prijs: formatPrice(row.Prijs) }));

  let fileName = "blikjesregistratie-alle-periodes.csv";

  if (selectedMonth !== "all") {
    const [year, month] = selectedMonth.split("-").map(Number);
    const period = payrollPeriod(new Date(year, month - 1, 1));
    fileName = `blikjesregistratie-loonmaand-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
  }

  // De BOM (byte order mark, U+FEFF) aan het begin zorgt dat Excel letters zoals é en ë goed toont.
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + toCsv(csvRows)], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
