export function exportExcel(
  model,
  selectedEmployee,
  selectedMonth,
  view
) {
  if (!window.XLSX) {
    view.showToast("Excel-export kon niet worden geladen.");
    return;
  }

  const selected = model.registrations.filter(
    (registration) =>
      (selectedEmployee === "all" ||
        registration.employeeId === selectedEmployee) &&
      (selectedMonth === "all" ||
        model.monthKey(
          new Date(registration.createdAt)
        ) === selectedMonth)
  );

  const grouped = new Map();

  selected.forEach((registration) => {
    const employee = model.findEmployee(
      registration.employeeId
    );

    const date = new Date(
      registration.createdAt
    );

    const key = `${registration.employeeId}-${model.monthKey(
      date
    )}`;

    const current = grouped.get(key) || {
      employee,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      total: 0,
      price: 0
    };

    current.total += 1;

    current.price +=
      model.products.find(
        ({ id }) =>
          id === registration.productId
      )?.price || 0;

    grouped.set(key, current);
  });

  const totals = [...grouped.values()].map(
    ({
      employee,
      year,
      month,
      total,
      price
    }) => ({
      Jaar: year,
      Maand: month,
      Looncode:
        employee?.payrollCode || "",
      Personeelsnummer:
        employee?.personnelNumber || "",
      Werkgevernummer:
        employee?.employerNumber || "",
      Naam:
        employee?.name || "Verwijderd",
      Totaal: total,
      Prijs: Number(price.toFixed(2))
    })
  );

  const periodTotal = totals.reduce(
    (sum, row) => sum + row.Totaal,
    0
  );

  const periodPrice = totals.reduce(
    (sum, row) => sum + row.Prijs,
    0
  );

  totals.push({
    Jaar: "",
    Maand: "",
    Looncode: "",
    Personeelsnummer: "",
    Werkgevernummer: "",
    Naam: "TOTAAL PERIODE",
    Totaal: periodTotal,
    Prijs: Number(periodPrice.toFixed(2))
  });

  const workbook = XLSX.utils.book_new();

  const detail = selected.map(
    ({
      employeeId,
      productId,
      createdAt
    }) => ({
      Jaar: new Date(
        createdAt
      ).getFullYear(),
      Maand:
        new Date(createdAt).getMonth() +
        1,
      Looncode:
        model.findEmployee(employeeId)
          ?.payrollCode || "",
      Personeelsnummer:
        model.findEmployee(employeeId)
          ?.personnelNumber || "",
      Werkgevernummer:
        model.findEmployee(employeeId)
          ?.employerNumber || "",
      Naam:
        model.findEmployee(employeeId)
          ?.name || "Verwijderd",
      Product:
        model.productName(productId),
      Totaal: 1,
      Prijs:
        model.products.find(
          ({ id }) => id === productId
        )?.price || 0
    })
  );

  const detailSheet =
    XLSX.utils.json_to_sheet(
      totals,
      {
        header: [
          "Jaar",
          "Maand",
          "Looncode",
          "Personeelsnummer",
          "Werkgevernummer",
          "Naam",
          "Totaal",
          "Prijs"
        ]
      }
    );

  const totalsSheet =
    XLSX.utils.json_to_sheet(detail);

  [detailSheet, totalsSheet].forEach(
    (sheet) =>
      Object.keys(sheet)
        .filter(
          (cell) =>
            cell[0] !== "!" &&
            ["H", "I"].includes(
              cell.replace(/\d/g, "")
            )
        )
        .forEach((cell) => {
          if (
            typeof sheet[cell].v ===
            "number"
          ) {
            sheet[cell].z = "€ 0.00";
          }
        })
  );

  XLSX.utils.book_append_sheet(
    workbook,
    detailSheet,
    selectedMonth === "all"
      ? "Periode-totalen"
      : "Maandtotalen"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    totalsSheet,
    "Registraties"
  );

  XLSX.writeFile(
    workbook,
    `blikjesregistratie-${
      selectedMonth === "all"
        ? "alle-periodes"
        : selectedMonth
    }.xlsx`
  );
}