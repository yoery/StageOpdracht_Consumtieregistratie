/**
 * PayrollImport — looncodes importeren uit een bestand van de loonadministratie (FR-101).
 *
 * AFAS geeft geen looncode (TVB mag dat veld niet krijgen). De loonadministratie levert daarom een
 * CSV-bestand met per medewerker het personeelsnummer en de looncode. In Excel: "Opslaan als" en dan
 * "CSV (gescheiden door lijstscheidingsteken)". Het bestand wordt alleen in de browser van de
 * beheerder gelezen. Alleen de looncodes die veranderen, gaan daarna (met een server) naar de server.
 *
 * Het bestand:
 *   - een kopregel met een kolom "Personeelsnummer" (of "Medewerker") en een kolom "Looncode". Andere
 *     kolommen worden genegeerd. Hoofdletters en spaties in de kop maken niet uit;
 *   - gescheiden door een puntkomma, een komma of een tab (wat in de kopregel staat, telt);
 *   - een looncode bestaat alleen uit cijfers, net als in het formulier.
 *
 * Excel laat voorloopnullen weg ("0012" wordt "12"). Een personeelsnummer wordt daarom eerst precies
 * gezocht, en anders zonder voorloopnullen, als dat maar bij één medewerker past. Een looncode met
 * voorloopnullen komt er zo niet goed in: lever het bestand dan aan met de kolom als tekst.
 *
 * Deze class weet niets van de pagina. AdminController leest het bestand en toont de uitkomst.
 */
export class PayrollImport {
  static MAX_BYTES = 2 * 1024 * 1024;
  static MAX_ROWS = 20000;

  static MESSAGES = {
    empty: "Het bestand is leeg.",
    tooLarge: "Het bestand is te groot (hooguit 2 MB).",
    noColumns: "Het bestand moet een kopregel hebben met de kolommen Personeelsnummer en Looncode."
  };

  // Leest de tekst van het bestand. Geeft { rows: [{ line, personnelNumber, payrollCode }] } of { error }.
  static parse(text) {
    const content = String(text ?? "").replace(/^﻿/, "");
    if (content.trim() === "") return { error: PayrollImport.MESSAGES.empty };

    const lines = content.split(/\r\n|\n|\r/);
    const headerIndex = lines.findIndex((line) => line.trim() !== "");
    const separator = PayrollImport.separatorOf(lines[headerIndex]);
    const header = PayrollImport.splitLine(lines[headerIndex], separator).map((cell) => cell.toLowerCase().replace(/[\s_.-]/g, ""));
    const numberColumn = header.findIndex((cell) => ["personeelsnummer", "personeelsnr", "medewerker", "medewerkernummer"].includes(cell));
    const codeColumn = header.findIndex((cell) => cell === "looncode");
    if (numberColumn < 0 || codeColumn < 0) return { error: PayrollImport.MESSAGES.noColumns };

    const rows = [];
    for (let index = headerIndex + 1; index < lines.length && rows.length < PayrollImport.MAX_ROWS; index += 1) {
      if (lines[index].trim() === "") continue;
      const cells = PayrollImport.splitLine(lines[index], separator);
      rows.push({ line: index + 1, personnelNumber: (cells[numberColumn] ?? "").trim(), payrollCode: (cells[codeColumn] ?? "").trim() });
    }
    return { rows };
  }

  // Het scheidingsteken van de kopregel: het teken dat het vaakst voorkomt (puntkomma bij gelijkspel).
  static separatorOf(line) {
    const count = (char) => line.split(char).length - 1;
    const counts = [[";", count(";")], ["\t", count("\t")], [",", count(",")]];
    const [best] = counts.sort((a, b) => b[1] - a[1]);
    return best[1] > 0 ? best[0] : ";";
  }

  // Splitst één regel in cellen. Een cel tussen aanhalingstekens mag het scheidingsteken bevatten, en
  // "" binnen zo'n cel is één aanhalingsteken (zoals Excel het opslaat).
  static splitLine(line, separator) {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (quoted) {
        if (char === "\"" && line[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else if (char === "\"") {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === "\"" && cell.trim() === "") {
        quoted = true;
        cell = "";
      } else if (char === separator) {
        cells.push(cell);
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return cells.map((value) => value.trim());
  }

  // Bepaalt wat de import verandert. Geeft:
  //   updates   [{ employeeId, payrollCode }]: looncodes die anders worden;
  //   unchanged het aantal regels waarvan de looncode al klopte;
  //   unknown   de regelnummers met een personeelsnummer dat niet in de app staat;
  //   invalid   de regelnummers zonder geldig personeelsnummer of met een looncode die niet alleen uit cijfers bestaat;
  //   repeated  de regelnummers met een personeelsnummer dat eerder in het bestand al stond (de eerste telt).
  // Gasten hebben geen personeelsnummer en worden dus nooit gevonden.
  static plan(employees, rows) {
    const withNumber = employees.filter((employee) => employee.personnelNumber && !employee.guest);
    const exact = new Map(withNumber.map((employee) => [String(employee.personnelNumber), employee]));
    const loose = new Map();
    for (const employee of withNumber) {
      const key = String(employee.personnelNumber).replace(/^0+(?=\d)/, "");
      loose.set(key, loose.has(key) ? null : employee); // null: meer dan één medewerker past
    }

    const result = { updates: [], unchanged: 0, unknown: [], invalid: [], repeated: [] };
    const seen = new Set();
    for (const row of rows) {
      if (!/^\d{1,64}$/.test(row.personnelNumber) || !/^\d{1,64}$/.test(row.payrollCode)) {
        result.invalid.push(row.line);
        continue;
      }
      const employee = exact.get(row.personnelNumber) ?? loose.get(row.personnelNumber.replace(/^0+(?=\d)/, "")) ?? null;
      if (!employee) {
        result.unknown.push(row.line);
        continue;
      }
      if (seen.has(employee.id)) {
        result.repeated.push(row.line);
        continue;
      }
      seen.add(employee.id);
      if (String(employee.payrollCode ?? "") === row.payrollCode) result.unchanged += 1;
      else result.updates.push({ employeeId: employee.id, payrollCode: row.payrollCode });
    }
    return result;
  }

  // Een korte samenvatting voor de melding en het logboek, zonder namen of nummers.
  static summary(result) {
    const parts = [`${result.updates.length} bijgewerkt`, `${result.unchanged} al goed`];
    if (result.unknown.length > 0) parts.push(`${result.unknown.length} onbekend personeelsnummer`);
    if (result.invalid.length > 0) parts.push(`${result.invalid.length} ongeldig`);
    if (result.repeated.length > 0) parts.push(`${result.repeated.length} dubbel`);
    return parts.join(", ");
  }

  // De regelnummers met een probleem, voor de melding (hooguit tien).
  static problemLines(result) {
    const lines = [...result.unknown, ...result.invalid, ...result.repeated].sort((a, b) => a - b);
    if (lines.length === 0) return "";
    const shown = lines.slice(0, 10).join(", ");
    return lines.length > 10 ? `${shown} en nog ${lines.length - 10}` : shown;
  }
}
