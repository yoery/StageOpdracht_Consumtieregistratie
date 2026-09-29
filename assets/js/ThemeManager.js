import { DAYLIGHT_HOURS } from "./config.js";

/**
 * ThemeManager — regelt het lichte en donkere thema van de website.
 *
 * Verantwoordelijkheid:
 *   - onthoudt de gekozen instelling in de browser:
 *       "system" = volgt de instelling van het apparaat (standaard),
 *       "auto"   = overdag licht, na zonsondergang donker,
 *       "light"  = altijd licht (gekozen met de slider),
 *       "dark"   = altijd donker (gekozen met de slider);
 *   - bepaalt welk thema daarbij hoort en zet dat op de pagina met <html data-theme="...">;
 *   - houdt de slider en de knoppen "Systeem" en "Auto" in de bovenbalk bij.
 *
 * Verbonden met:
 *   - index.html: de slider (#themeSwitch) en de knoppen met data-theme-mode in de bovenbalk,
 *     en een klein script in de <head> dat het donkere thema al vóór het tekenen zet.
 *   - styles.css: de kleuren voor data-theme="dark" staan in :root[data-theme="dark"].
 *   - config.js: DAYLIGHT_HOURS, de tijden van zonsopkomst en zonsondergang per maand.
 *   - main.js: maakt de ThemeManager aan en start hem.
 *
 * Deze class staat los van het model, de view en de controller: het thema is een
 * weergave-instelling per browser en hoort niet bij de gegevens van de registratie.
 */
export class ThemeManager {
  // Naam waaronder de instelling in localStorage staat (ook gebruikt door het script in index.html).
  static STORAGE_KEY = "tvb-theme";
  static MODES = ["system", "auto", "light", "dark"];

  constructor() {
    this.mode = "system";
  }

  // Leest de opgeslagen instelling, koppelt de knoppen en zet het juiste thema.
  initialize() {
    this.mode = this.loadMode();
    this.switchButton = document.querySelector("#themeSwitch");
    this.modeButtons = document.querySelectorAll("[data-theme-mode]");

    this.switchButton.addEventListener("click", () => this.toggle());
    this.modeButtons.forEach((button) => {
      button.addEventListener("click", () => this.setMode(button.dataset.themeMode));
    });

    // Als de instelling van het apparaat verandert (bijv. Windows schakelt naar donker),
    // wordt het thema meteen aangepast.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.apply());

    // Iedere minuut opnieuw kijken, zodat "Auto" vanzelf omschakelt bij zonsondergang.
    setInterval(() => this.apply(), 60 * 1000);

    this.apply();
  }

  // ------------------------------------------------------------------
  // Instelling kiezen en onthouden
  // ------------------------------------------------------------------

  // Leest de opgeslagen instelling; zonder (geldige) instelling is het "system".
  loadMode() {
    try {
      const saved = localStorage.getItem(ThemeManager.STORAGE_KEY);
      return ThemeManager.MODES.includes(saved) ? saved : "system";
    } catch (error) {
      return "system";
    }
  }

  // Bewaart de instelling. Lukt dat niet (bijv. privévenster), dan werkt het thema
  // alleen tot de pagina wordt gesloten.
  saveMode() {
    try {
      localStorage.setItem(ThemeManager.STORAGE_KEY, this.mode);
    } catch (error) {
      // Niet erg: de keuze geldt dan alleen voor deze keer.
    }
  }

  // Kiest een instelling ("system", "auto", "light" of "dark") en past het thema toe.
  setMode(mode) {
    this.mode = mode;
    this.saveMode();
    this.apply();
  }

  // De slider: schakelt naar het tegenovergestelde van wat nu zichtbaar is.
  // Dat is een handmatige keuze, dus "Systeem" en "Auto" staan daarna uit.
  toggle() {
    this.setMode(this.currentTheme() === "dark" ? "light" : "dark");
  }

  // ------------------------------------------------------------------
  // Bepalen welk thema hoort bij de instelling
  // ------------------------------------------------------------------

  // Welk thema hoort bij een instelling? Geeft "light" of "dark" terug.
  // systemDark = staat het apparaat op donker; date = het huidige moment.
  resolveTheme(mode, systemDark, date) {
    if (mode === "light" || mode === "dark") return mode;
    if (mode === "auto") return this.isDarkOutside(date) ? "dark" : "light";
    return systemDark ? "dark" : "light";
  }

  // Is het op dit moment donker buiten? Voor of na de zon, volgens DAYLIGHT_HOURS.
  isDarkOutside(date) {
    const { sunrise, sunset } = DAYLIGHT_HOURS[date.getMonth()];
    const minutesNow = date.getHours() * 60 + date.getMinutes();

    return minutesNow < this.toMinutes(sunrise) || minutesNow >= this.toMinutes(sunset);
  }

  // Zet een tijd als "18:45" om naar minuten na middernacht (1125).
  toMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  // Staat het apparaat op donker?
  systemPrefersDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // Het thema dat nu zichtbaar moet zijn.
  currentTheme() {
    return this.resolveTheme(this.mode, this.systemPrefersDark(), new Date());
  }

  // ------------------------------------------------------------------
  // Toepassen op de pagina
  // ------------------------------------------------------------------

  // Zet het thema op <html> en werkt de slider en de knoppen bij.
  apply() {
    const isDark = this.currentTheme() === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";

    this.switchButton.setAttribute("aria-checked", String(isDark));
    this.switchButton.title = isDark ? "Donkere modus staat aan. Klik voor licht." : "Lichte modus staat aan. Klik voor donker.";

    this.modeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeMode === this.mode));
    });
  }
}
