// Deze sleutel is de naam waaronder de demo alle gegevens in de browser bewaart.
const STORAGE_KEY = "tvb-blikjesregistratie";
// De kleuren worden afwisselend gebruikt voor de avatars van medewerkers.
const colors = ["#d8f1e8", "#e3eef6", "#f8e9d9", "#e9e0f4", "#e4f0d8"];
// De prijs per blikje wordt gebruikt voor de totalen in de Excel-export.
const PRICE_PER_CAN = 0.69;
// Deze voorbeeldmedewerkers verschijnen wanneer er nog geen opgeslagen gegevens zijn.
const seedEmployees = ["Lotte van Dijk", "Mark Jansen", "Sophie de Boer", "Daan Smit", "Nora Visser", "Bram Bakker", "Eva Meijer", "Tom de Groot"];
// Eerst worden opgeslagen gegevens opgehaald; anders maakt de app een lege demo-administratie aan.
const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {
  employees: seedEmployees.map((name, index) => ({ id: crypto.randomUUID(), name, color: colors[index % colors.length] })),
  registrations: []
};
// Houdt bij of de beheerder in deze browsersessie al is ingelogd.
let adminLoggedIn = false;
// Met deze korte functie kunnen HTML-elementen op een leesbare manier worden opgezocht.
const $ = (selector) => document.querySelector(selector);
// Hulpfuncties voor datumopmaak, maandfilters, opslag, initialen en veilige HTML-tekst.
const dateNow = () => new Date();
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const initials = (name) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
const formatDate = (value, withTime = true) => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value));
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

// Tekent de medewerkerlijst opnieuw en past de zoekterm toe.
function renderEmployees() {
  const query = $("#employeeSearch").value.toLowerCase().trim();
  const employees = state.employees.filter(({ name }) => name.toLowerCase().includes(query));
  $("#employeeCount").textContent = `${state.employees.length} totaal`;
  $("#emptyState").classList.toggle("hidden", employees.length > 0);
  $("#employeeList").innerHTML = employees.map((employee) => {
    const total = state.registrations.filter((registration) => registration.employeeId === employee.id).length;
    return `<div class="employee-row"><div class="employee-info"><span class="person-avatar" style="background:${employee.color}">${initials(employee.name)}</span><div><div class="employee-name">${escapeHtml(employee.name)}</div><div class="employee-total">${total} blikje${total === 1 ? "" : "s"} gepakt</div></div></div><button class="plus-button" data-add="${employee.id}" aria-label="Blikje registreren voor ${escapeHtml(employee.name)}">+</button></div>`;
  }).join("");
}
// Berekent en toont het aantal blikjes van vandaag en van deze maand.
function renderStats() {
  const now = dateNow();
  $("#todayTotal").textContent = state.registrations.filter(({ createdAt }) => new Date(createdAt).toDateString() === now.toDateString()).length;
  $("#monthTotal").textContent = state.registrations.filter(({ createdAt }) => monthKey(new Date(createdAt)) === monthKey(now)).length;
}
// Elke klik op de plusknop maakt één nieuwe registratie met datum en tijd.
function addRegistration(employeeId) {
  state.registrations.push({ id: crypto.randomUUID(), employeeId, createdAt: dateNow().toISOString() });
  save(); renderAll(); showToast("Blikje direct opgeslagen ✓");
}
// Deze functie houdt de medewerkerlijst en totalen tegelijk actueel.
function renderAll() { renderEmployees(); renderStats(); }
// Toont kort een bevestigingsmelding onder in beeld.
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.remove("hidden"); toast.classList.add("show"); setTimeout(() => toast.classList.add("hidden"), 2500); }

// Opent het loginformulier of het dashboard, afhankelijk van de huidige sessie.
function openAdmin() {
  $("#adminModal").classList.remove("hidden");
  if (adminLoggedIn) {
    $("#loginView").classList.add("hidden");
    $("#adminView").classList.remove("hidden");
    populateFilters();
    renderAdmin();
    renderCorrectionEmployees();
    renderAdminEmployees();
  } else {
    $("#loginView").classList.remove("hidden");
    $("#adminView").classList.add("hidden");
    $("#loginEmail").focus();
  }
}
// Filtert registraties en bouwt de rijen van de administratietabel.
function renderAdmin() {
  const monthFilter = $("#filterMonth").value;
  const employeeFilter = $("#filterEmployee").value;
  const filtered = state.registrations.filter((registration) => (employeeFilter === "all" || registration.employeeId === employeeFilter) && (monthFilter === "all" || monthKey(new Date(registration.createdAt)) === monthFilter)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $("#adminTableBody").innerHTML = filtered.length ? filtered.map((registration) => {
    const employee = state.employees.find(({ id }) => id === registration.employeeId);
    return `<tr><td>${employee ? escapeHtml(employee.name) : "Verwijderd"}</td><td>+1</td><td>${formatDate(registration.createdAt)}</td></tr>`;
  }).join("") : `<tr><td colspan="4" class="muted">Geen registraties voor deze filters.</td></tr>`;
}
// Toont alleen medewerkers die bij de zoekterm passen voor gerichte correcties.
function renderCorrectionEmployees() {
  const query = $("#adminEmployeeSearch").value.toLowerCase().trim();
  const employees = state.employees.filter(({ name }) => name.toLowerCase().includes(query));
  $("#adminCorrectionList").innerHTML = employees.map((employee) => {
    const total = state.registrations.filter(({ employeeId }) => employeeId === employee.id).length;
    return `<div class="admin-correction-item"><strong>${escapeHtml(employee.name)}</strong><span class="correction-count">${total} gepakt</span><div class="correction-actions"><button class="correction-button correction-minus" data-correction-minus="${employee.id}" title="Een blikje verwijderen">−</button><button class="correction-button correction-plus" data-correction-plus="${employee.id}" title="Een blikje toevoegen">+</button></div></div>`;
  }).join("") || `<p class="muted">Geen medewerker gevonden.</p>`;
}
// Vult de keuzelijsten met medewerkers en maanden die in de data voorkomen.
function populateFilters() {
  $("#filterEmployee").innerHTML = `<option value="all">Alle medewerkers</option>${state.employees.map(({ id, name }) => `<option value="${id}">${escapeHtml(name)}</option>`).join("")}`;
  const months = [...new Set(state.registrations.map(({ createdAt }) => monthKey(new Date(createdAt))))];
  $("#filterMonth").innerHTML = `<option value="all">Alle maanden</option>${months.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(new Date(`${month}-01`))}</option>`).join("")}`;
}
// Toont in het admin-tabblad welke medewerkers beheerd kunnen worden.
function renderAdminEmployees() {
  const query = $("#employeeManagementSearch").value.toLowerCase().trim();
  const employees = state.employees.filter(({ name }) => name.toLowerCase().includes(query));
  $("#adminEmployeeList").innerHTML = employees.map((employee) => `<div class="admin-employee-item"><span>${escapeHtml(employee.name)}</span><button class="table-action" data-remove-employee="${employee.id}" title="Medewerker verwijderen">×</button></div>`).join("") || `<p class="muted">Geen medewerker gevonden.</p>`;
}
// Maakt twee Excel-tabbladen: detailregistraties en totalen per medewerker.
function exportExcel() {
  if (!window.XLSX) { showToast("Excel-export kon niet worden geladen."); return; }
  const selectedEmployee = $("#filterEmployee").value;
  const selectedMonth = $("#filterMonth").value;
  const selected = state.registrations.filter((registration) => (selectedEmployee === "all" || registration.employeeId === selectedEmployee) && (selectedMonth === "all" || monthKey(new Date(registration.createdAt)) === selectedMonth));
  const detail = selected.map(({ employeeId, createdAt }) => ({ Medewerker: state.employees.find((employee) => employee.id === employeeId)?.name || "Verwijderd", "Aantal blikjes": 1, "Prijs per blikje": PRICE_PER_CAN, "Registratiedatum": new Date(createdAt).toLocaleString("nl-NL") }));
  const totals = state.employees.filter((employee) => selectedEmployee === "all" || employee.id === selectedEmployee).map((employee) => {
    const count = selected.filter(({ employeeId }) => employeeId === employee.id).length;
    return { Medewerker: employee.name, "Maandtotaal blikjes": count, "Totale prijs": count * PRICE_PER_CAN };
  });
  totals.push({ Medewerker: "TOTAAL ALLE MEDEWERKERS", "Maandtotaal blikjes": selected.length, "Totale prijs": selected.length * PRICE_PER_CAN });
  const workbook = XLSX.utils.book_new();
  const detailSheet = XLSX.utils.json_to_sheet(detail);
  const totalsSheet = XLSX.utils.json_to_sheet(totals);
  // Met deze notatie worden de prijsvelden in Excel als eurobedragen weergegeven.
  [detailSheet, totalsSheet].forEach((sheet) => {
    Object.keys(sheet).filter((cell) => cell[0] !== "!" && ["C", "D"].includes(cell.replace(/\d/g, ""))).forEach((cell) => {
      if (typeof sheet[cell].v === "number") sheet[cell].z = '€ 0.00';
    });
  });
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Registraties");
  XLSX.utils.book_append_sheet(workbook, totalsSheet, "Maandtotalen");
  XLSX.writeFile(workbook, `blikjesregistratie-${selectedMonth === "all" ? "alle-periodes" : selectedMonth}.xlsx`);
}

// Zet de huidige datum in de welkomsttekst en activeert zoeken tijdens het typen.
$("#todayLabel").textContent = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(dateNow());
$("#employeeSearch").addEventListener("input", renderEmployees);
// Eén klik-handler voor alle dynamisch aangemaakte knoppen.
document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]"); if (addButton) addRegistration(addButton.dataset.add);
  const correctionPlus = event.target.closest("[data-correction-plus]"); if (correctionPlus) { addRegistration(correctionPlus.dataset.correctionPlus); renderCorrectionEmployees(); renderAdmin(); showToast("Blikje toegevoegd voor medewerker"); }
  const correctionMinus = event.target.closest("[data-correction-minus]"); if (correctionMinus) {
    const registration = [...state.registrations].reverse().find(({ employeeId }) => employeeId === correctionMinus.dataset.correctionMinus);
    if (registration) { state.registrations = state.registrations.filter(({ id }) => id !== registration.id); save(); populateFilters(); renderCorrectionEmployees(); renderAdmin(); renderAll(); showToast("Laatste blikje verwijderd"); }
    else showToast("Deze medewerker heeft geen blikjes om te verwijderen");
  }
  const removeButton = event.target.closest("[data-remove-employee]"); if (removeButton) { const id = removeButton.dataset.removeEmployee; state.employees = state.employees.filter((employee) => employee.id !== id); save(); populateFilters(); renderAdminEmployees(); renderAll(); showToast("Medewerker verwijderd"); }
});
// Koppelt de vaste knoppen van de navigatie en de modal.
$("#adminOpenButton").addEventListener("click", openAdmin);
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => $("#adminModal").classList.add("hidden")));
$("#adminModal").addEventListener("click", (event) => { if (event.target === $("#adminModal")) $("#adminModal").classList.add("hidden"); });
// De demo accepteert elk ingevuld wachtwoord en toont daarna het dashboard.
$("#loginForm").addEventListener("submit", (event) => { event.preventDefault(); if ($("#loginEmail").value && $("#loginPassword").value) { adminLoggedIn = true; $("#loginView").classList.add("hidden"); $("#adminView").classList.remove("hidden"); populateFilters(); renderAdmin(); renderCorrectionEmployees(); renderAdminEmployees(); } else $("#loginError").classList.remove("hidden"); });
// Uitloggen is een aparte actie en brengt de beheerder terug naar het loginformulier.
$("#logoutButton").addEventListener("click", () => { adminLoggedIn = false; $("#adminView").classList.add("hidden"); $("#loginView").classList.remove("hidden"); $("#loginPassword").value = ""; $("#loginEmail").focus(); });
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active")); tab.classList.add("active"); $("#registrationsTab").classList.toggle("hidden", tab.dataset.tab !== "registrations"); $("#employeesTab").classList.toggle("hidden", tab.dataset.tab !== "employees"); }));
// Filters verversen de tabel; de export gebruikt dezelfde geselecteerde filters.
$("#filterEmployee").addEventListener("change", renderAdmin); $("#filterMonth").addEventListener("change", renderAdmin); $("#exportButton").addEventListener("click", exportExcel);
$("#adminEmployeeSearch").addEventListener("input", renderCorrectionEmployees);
$("#employeeManagementSearch").addEventListener("input", renderAdminEmployees);
$("#employeeForm").addEventListener("submit", (event) => { event.preventDefault(); const name = $("#newEmployeeName").value.trim(); if (!name) return; state.employees.push({ id: crypto.randomUUID(), name, color: colors[state.employees.length % colors.length] }); $("#newEmployeeName").value = ""; save(); populateFilters(); renderAdminEmployees(); renderAll(); showToast("Medewerker toegevoegd"); });
// Met Ctrl+K of Cmd+K krijgt de zoekbalk direct de focus.
document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#employeeSearch").focus(); } });
// Eerste render zodra de pagina geladen is.
renderAll();
