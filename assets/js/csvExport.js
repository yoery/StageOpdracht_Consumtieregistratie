/**
 * CsvExport — maakt het CSV-bestand voor de loonadministratie.
 *
 * Verantwoordelijkheid:
 *   - registraties per medewerker per loonmaand optellen;
 *   - die regels omzetten naar CSV-tekst (puntkomma's, komma als decimaalteken);
 *   - het bestand laten downloaden in de browser.
 *
 * Verbonden met:
 *   - RegistrationModel: levert registraties, medewerkers, producten, het werkgevernummer
 *     en de loonmaand (payrollPeriod).
 *   - RegistrationApp: roept download() aan als de beheerder op "CSV exporteren" klikt,
 *     en toont een melding als er niets te exporteren is.
 *
 * Deze class weet niets van de HTML-pagina; alleen download() gebruikt de browser om
 * het bestand op te slaan.
 */
export class CsvExport {
  // Vaste kolomvolgorde, afgesproken met de loonadministratie.
  static COLUMNS = [
    "Jaar",
    "Maand",
    "Looncode",
    "Personeelsnummer",
    "Werkgevernummer",
    "Naam",
    "Totaal",
    "Prijs"
  ];

  constructor(model) {
    this.model = model;
  }

  // Telt de registraties per medewerker per loonmaand, met de filters uit het beheerscherm.
  // selectedEmployee en selectedMonth zijn een id/maandcode of "all".
  buildRows(selectedEmployee, selectedMonth) {
    const grouped = new Map();

    for (const registration of this.model.registrations) {
      if (!this.matchesFilters(registration, selectedEmployee, selectedMonth)) continue;

      const { year, month } = this.model.payrollPeriod(new Date(registration.createdAt));
      const key = `${registration.employeeId}-${year}-${month}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          employee: this.model.findEmployee(registration.employeeId),
          year,
          month,
          total: 0,
          price: 0
        });
      }

      const group = grouped.get(key);
      group.total += 1;
      group.price += this.model.productPrice(registration.productId);
    }

    const rows = [...grouped.values()].map((group) => this.toRow(group));
    return rows.sort((a, b) => this.compareRows(a, b));
  }

  // Controleert of een registratie binnen de gekozen medewerker en consumptiemaand valt.
  matchesFilters(registration, selectedEmployee, selectedMonth) {
    const employeeMatches = selectedEmployee === "all" || registration.employeeId === selectedEmployee;
    const monthMatches =
      selectedMonth === "all" ||
      this.model.monthKey(new Date(registration.createdAt)) === selectedMonth;

    return employeeMatches && monthMatches;
  }

  // Zet een opgetelde groep om naar één regel met de vaste kolomnamen.
  toRow({ employee, year, month, total, price }) {
    return {
      Jaar: year,
      Maand: month,
      Looncode: employee?.payrollCode || "",
      Personeelsnummer: employee?.personnelNumber || "",
      Werkgevernummer: this.model.employerNumberFor(employee),
      Naam: employee?.name || "Verwijderd",
      Totaal: total,
      Prijs: Number(price.toFixed(2))
    };
  }

  // Sorteert op jaar, dan maand, dan naam.
  compareRows(a, b) {
    if (a.Jaar !== b.Jaar) return a.Jaar - b.Jaar;
    if (a.Maand !== b.Maand) return a.Maand - b.Maand;
    return a.Naam.localeCompare(b.Naam, "nl");
  }

  // Maakt één CSV-veld veilig: quotes rond speciale tekens en geen formules
  // (een naam die met = + - @ begint zou Excel anders als formule uitvoeren).
  escapeField(value) {
    let text = String(value ?? "");

    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;

    return text;
  }

  // Zet rijen om naar CSV-tekst met puntkomma's, zoals een Nederlandse Excel verwacht.
  toCsv(rows) {
    const lines = [CsvExport.COLUMNS];

    for (const row of rows) {
      lines.push(CsvExport.COLUMNS.map((column) => row[column]));
    }

    return lines
      .map((fields) => fields.map((field) => this.escapeField(field)).join(";"))
      .join("\r\n");
  }

  // Prijs met komma en twee decimalen, bijvoorbeeld 1,30.
  formatPrice(value) {
    return value.toFixed(2).replace(".", ",");
  }

  // Bestandsnaam met de loonmaand, of "alle-periodes" als er geen maand is gekozen.
  fileName(selectedMonth) {
    if (selectedMonth === "all") return "blikjesregistratie-alle-periodes.csv";

    const [year, month] = selectedMonth.split("-").map(Number);
    const period = this.model.payrollPeriod(new Date(year, month - 1, 1));
    const paddedMonth = String(period.month).padStart(2, "0");

    return `blikjesregistratie-loonmaand-${period.year}-${paddedMonth}.csv`;
  }

  // Maakt het CSV-bestand en laat de browser het downloaden.
  // Geeft false terug als er voor deze filters niets te exporteren is.
  download(selectedEmployee, selectedMonth) {
    const rows = this.buildRows(selectedEmployee, selectedMonth);
    if (rows.length === 0) return false;

    // Geen totaalregel: de loonadministratie leest iedere regel in als medewerker.
    const csvRows = rows.map((row) => ({ ...row, Prijs: this.formatPrice(row.Prijs) }));

    // De BOM (byte order mark, U+FEFF) aan het begin zorgt dat Excel letters zoals é en ë goed toont.
    const bom = String.fromCharCode(0xfeff);
    const blob = new Blob([bom + this.toCsv(csvRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = this.fileName(selectedMonth);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return true;
  }
}
