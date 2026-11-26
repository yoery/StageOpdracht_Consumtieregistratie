/**
 * CsvExport — maakt het CSV-bestand voor de loonadministratie.
 *
 * Verantwoordelijkheid:
 *   - registraties per medewerker per loonmaand optellen;
 *   - die regels omzetten naar CSV-tekst (puntkomma's, komma als decimaalteken);
 *   - het bestand laten downloaden in de browser.
 *
 * Verbonden met:
 *   - RegistrationModel: levert registraties, medewerkers, de prijs per registratie
 *     (registrationPrice), het werkgevernummer en de loonmaand (payrollPeriod).
 *   - AdminController (onderdeel van de controller RegistrationApp): roept download() aan als
 *     de beheerder op "CSV exporteren" klikt, en toont een melding als er niets te exporteren is
 *     of als er medewerkers zonder looncode in het bestand staan (countMissingPayrollCodes).
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

  // De kolommen met een getal (jaar, maand, aantal en bedrag). Een getal dat met "-" begint, zoals
  // een negatief bedrag "-0,65" van een latere correctieregel, krijgt geen apostrof: dat is geen
  // formule. Alleen een waarde die echt een getal is (NUMBER_VALUE) wordt zo doorgelaten. Iedere
  // andere waarde, en iedere waarde in een tekstkolom, krijgt de gewone controle (zie escapeField).
  static NUMERIC_COLUMNS = new Set(["Jaar", "Maand", "Totaal", "Prijs"]);

  // Een geheel getal of een bedrag met een komma of punt, eventueel met een minteken ervoor: "12",
  // "-3", "1,30" of "-0,65". Een spatie, een letter of een ander teken past niet.
  static NUMBER_VALUE = /^-?\d+([.,]\d+)?$/;

  constructor(model) {
    this.model = model;
  }

  // Telt de registraties per medewerker per loonmaand, met de filters uit het beheerscherm.
  // selectedEmployee en selectedMonth zijn een id/maandcode of "all".
  buildRows(selectedEmployee, selectedMonth) {
    const grouped = new Map();

    for (const registration of this.model.registrations) {
      if (!this.matchesFilters(registration, selectedEmployee, selectedMonth)) continue;
      if (this.isGuestRegistration(registration)) continue;

      const { year, month } = this.model.payrollPeriod(new Date(registration.createdAt));
      // Het werkgevernummer van het moment van registreren. Is dat binnen één maand veranderd
      // (de medewerker ging naar een ander bedrijf), dan komen er twee regels: één per nummer.
      const employerNumber = this.model.registrationEmployerNumber(registration);
      const key = JSON.stringify([registration.employeeId, year, month, employerNumber]);

      if (!grouped.has(key)) {
        grouped.set(key, {
          employee: this.model.findEmployee(registration.employeeId),
          employerNumber,
          year,
          month,
          total: 0,
          price: 0
        });
      }

      const group = grouped.get(key);
      group.total += 1;
      // De prijs van het moment van registreren, zodat een oude maand niet verandert
      // als een productprijs later wordt aangepast.
      group.price += this.model.registrationPrice(registration);
    }

    const rows = [...grouped.values()].map((group) => this.toRow(group));
    return rows.sort((a, b) => this.compareRows(a, b));
  }

  // Is deze registratie van een gast (FR-98)? Een gast staat niet in de loonadministratie en dus
  // niet in dit bestand. Zijn registraties staan wel in het beheer (tabblad Registraties).
  isGuestRegistration(registration) {
    return this.model.findEmployee(registration.employeeId)?.guest === true;
  }

  // Hoeveel gasten hebben registraties binnen de filters? Die staan niet in het bestand.
  countGuests(selectedEmployee, selectedMonth) {
    const guests = new Set();
    for (const registration of this.model.registrations) {
      if (this.matchesFilters(registration, selectedEmployee, selectedMonth) && this.isGuestRegistration(registration)) {
        guests.add(registration.employeeId);
      }
    }
    return guests.size;
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
  toRow({ employee, employerNumber, year, month, total, price }) {
    return {
      Jaar: year,
      Maand: month,
      Looncode: employee?.payrollCode || "",
      Personeelsnummer: employee?.personnelNumber || "",
      Werkgevernummer: employerNumber,
      Naam: employee?.name || "Verwijderd",
      Totaal: total,
      Prijs: Number(price.toFixed(2))
    };
  }

  // Telt de medewerkers in deze export zonder looncode. Hun regels staan wel in het bestand, maar
  // met een lege kolom Looncode, en de loonadministratie kan die regels dan niet verwerken. De
  // looncode komt niet uit AFAS: de beheerder vult hem per medewerker in. AdminController toont dit
  // aantal na het exporteren, zodat een lege looncode niet ongemerkt in het bestand blijft staan.
  countMissingPayrollCodes(selectedEmployee, selectedMonth) {
    const missing = new Map(); // id van de medewerker → ontbreekt de looncode?

    for (const registration of this.model.registrations) {
      if (!this.matchesFilters(registration, selectedEmployee, selectedMonth)) continue;
      if (missing.has(registration.employeeId) || this.isGuestRegistration(registration)) continue;

      const payrollCode = this.model.findEmployee(registration.employeeId)?.payrollCode;
      missing.set(registration.employeeId, String(payrollCode ?? "").trim() === "");
    }

    return [...missing.values()].filter(Boolean).length;
  }

  // Sorteert op jaar, dan maand, dan naam.
  compareRows(a, b) {
    if (a.Jaar !== b.Jaar) return a.Jaar - b.Jaar;
    if (a.Maand !== b.Maand) return a.Maand - b.Maand;
    return a.Naam.localeCompare(b.Naam, "nl");
  }

  // Maakt één CSV-veld veilig: quotes rond speciale tekens en geen formules
  // (een naam die met = + - @ begint zou Excel anders als formule uitvoeren).
  // Ook spaties, tabs of enters vóór zo'n teken tellen mee: Excel slaat die bij het inlezen
  // soms over, waardoor " =1+1" of een enter gevolgd door "=cmd" toch een formule wordt.
  // Een veld dat met een tab, "\r" of "\n" begint, krijgt altijd een apostrof, ook als er geen
  // formuleteken volgt: zo blijft het begin van het veld zichtbaar en kan Excel het niet wegpoetsen.
  // Met `numeric: true` (een getalkolom, zie NUMERIC_COLUMNS) blijft een echt getal zoals "-0,65"
  // ongewijzigd. Is de waarde geen getal, dan geldt ook daar de gewone controle.
  escapeField(value, { numeric = false } = {}) {
    let text = String(value ?? "");
    if (numeric && CsvExport.NUMBER_VALUE.test(text)) return text;

    const startsAsFormula = /^[ \t\r\n]*[=+\-@]/.test(text);
    if (startsAsFormula || /^[\t\r\n]/.test(text)) text = `'${text}`;
    if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;

    return text;
  }

  // Zet rijen om naar CSV-tekst met puntkomma's, zoals een Nederlandse Excel verwacht.
  // `columns` zijn de kolommen in volgorde (standaard die voor de loonadministratie).
  toCsv(rows, columns = CsvExport.COLUMNS) {
    const lines = [columns];

    for (const row of rows) {
      lines.push(columns.map((column) => row[column]));
    }

    // De kopregel is tekst. In de regels daaronder krijgen de getalkolommen numeric: true.
    return lines
      .map((fields, line) => fields.map((field, index) =>
        this.escapeField(field, { numeric: line > 0 && CsvExport.NUMERIC_COLUMNS.has(columns[index]) })
      ).join(";"))
      .join("\r\n");
  }

  // ------------------------------------------------------------------
  // Pasjes-dataset (FR-99)
  // ------------------------------------------------------------------

  // De kolommen van de pasjes-dataset: het openbare serienummer van de pas en de persoon.
  static BADGE_COLUMNS = ["Serienummer", "Personeelsnummer", "Naam", "Actief", "Gekoppeld op"];

  // Iedere medewerker met een gekoppelde pas, op naam. Alleen de beheerder kan dit exporteren
  // (AdminController.exportBadges).
  badgeRows() {
    return this.model.employees
      .filter((employee) => employee.badgeId)
      .map((employee) => ({
        Serienummer: employee.badgeId,
        Personeelsnummer: employee.personnelNumber || "",
        Naam: employee.name,
        Actief: employee.active ? "ja" : "nee",
        "Gekoppeld op": employee.badgeLinkedAt ? this.localDate(employee.badgeLinkedAt) : ""
      }))
      .sort((a, b) => a.Naam.localeCompare(b.Naam, "nl"));
  }

  // Een tijdstip als datum in de tijdzone van de tablet, bijvoorbeeld "2026-11-26".
  localDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  // Downloadt de pasjes-dataset. Geeft het aantal pasjes terug (0 = er is niets gedownload).
  downloadBadges(now = new Date()) {
    const rows = this.badgeRows();
    if (rows.length === 0) return 0;
    this.saveFile(this.toCsv(rows, CsvExport.BADGE_COLUMNS), `pasjes-${this.localDate(now)}.csv`);
    return rows.length;
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

    this.saveFile(this.toCsv(csvRows), this.fileName(selectedMonth));
    return true;
  }

  // Laat de browser een CSV-bestand downloaden.
  saveFile(text, fileName) {
    // De BOM (byte order mark, U+FEFF) aan het begin zorgt dat Excel letters zoals é en ë goed toont.
    const bom = String.fromCharCode(0xfeff);
    const blob = new Blob([bom + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    // Het tijdelijke adres pas na een seconde opruimen: in sommige browsers stopt de download
    // anders voordat die echt begonnen is.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
