import { cssAttributeValue } from "../RegistrationView.js";

/**
 * ModalManager — opent en sluit de vensters (modals) en regelt de focus daarbij.
 *
 * Verantwoordelijkheid:
 *   - elementen op de pagina tonen en verbergen (show en hide);
 *   - een venster openen en bij het sluiten de focus terugzetten op het element waarmee het
 *     werd geopend (toegankelijkheid);
 *   - de sluitknoppen en de donkere achtergrond van ieder venster koppelen, en per venster de
 *     sluitactie onthouden voor de Escape-toets;
 *   - het bovenste open venster bepalen en de Tab-toets binnen dat venster houden;
 *   - de focus bewaren als een lijst opnieuw wordt getekend (preserveFocus): de nieuwe knop met
 *     dezelfde id krijgt de focus terug, of een logisch alternatief als het item weg is.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, geeft de methodes en velden door aan de rest van de
 *     app en gebruikt topModal, modalCloseActions en keepFocusInModal bij Escape en Tab;
 *   - RegistrationView: zoekt de elementen op met $() en levert cssAttributeValue voor de selectors;
 *   - index.html: de vensters (.modal-backdrop) en hun sluitknoppen.
 */

// De knoppen in de lijsten die opnieuw worden getekend, met hun data-attribuut (in de schrijfwijze
// van dataset) en het element dat de focus krijgt als het item na het tekenen niet meer bestaat
// (null = geen alternatief). data-correction-product hoort bij de knoppen "+" en "−" van de
// correctielijst en maakt die samen met de medewerker uniek.
const FOCUS_TARGETS = {
  openEmployee: "#employeeSearch",
  editEmployee: "#addEmployeeButton",
  toggleEmployee: "#addEmployeeButton",
  removeEmployee: "#addEmployeeButton",
  editProduct: "#addProductButton",
  removeProduct: "#addProductButton",
  addPoint: "#addCompanyButton",
  editCompany: "#addCompanyButton",
  removeCompany: "#addCompanyButton",
  editPoint: "#addCompanyButton",
  removePoint: "#addCompanyButton",
  correctionPlus: "#adminEmployeeSearch",
  correctionMinus: "#adminEmployeeSearch",
  correctionProduct: null,
  showStockPoint: "#stockPointSelect",
  stockDelivery: "#stockPointSelect"
};

export class ModalManager {
  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  constructor(app) {
    this.app = app;
    this.modalCloseActions = new Map(); // venster -> sluitactie (voor de Escape-toets)
    this.modalOpeners = new Map();      // venster -> element dat de focus had toen het venster openging
  }

  // Onderdelen van de app die deze class gebruikt (view). Die komen steeds
  // van RegistrationApp, zodat er maar één verwijzing naar ieder onderdeel bestaat.
  get view() {
    return this.app.view;
  }

  // Toont of verbergt een element op de pagina.
  show(selector) {
    this.view.$(selector).classList.remove("hidden");
  }

  hide(selector) {
    this.view.$(selector).classList.add("hidden");
  }

  // Onthoudt welk element de focus had vlak voordat een venster opengaat (meestal de knop
  // waarmee het venster werd geopend). closeModal zet de focus daar later naar terug.
  rememberOpener(modalSelector) {
    this.modalOpeners.set(this.view.$(modalSelector), globalThis.document?.activeElement || null);
  }

  // Opent een venster en onthoudt waar de focus vandaan kwam. Het venster begint altijd bovenaan
  // (zie scrollModalToTop).
  openModal(modalSelector) {
    this.rememberOpener(modalSelector);
    this.show(modalSelector);
    this.scrollModalToTop(modalSelector);
  }

  // Zet een venster dat net opengaat bovenaan: de scrollpositie van het venster (.modal, het element
  // dat scrolt als de inhoud hoger is dan het scherm) en van de donkere achtergrond gaat naar 0.
  // De browser onthoudt de scrollpositie van een verborgen venster en zet die bij het opnieuw tonen
  // terug. Was het venster de vorige keer omlaag gescrold (bijvoorbeeld doordat de focus op de knop
  // Registreren onderaan stond), dan opende het daardoor een stukje omlaag gescrold, met het kruisje
  // en de titel half buiten beeld (gezien na herkenning met de camera op een staande tablet).
  // Moet daarna een element in het venster de focus krijgen, gebruik dan focus({ preventScroll: true }),
  // zodat de focus het venster niet alsnog omlaag scrolt.
  scrollModalToTop(modalSelector) {
    const backdrop = this.view.$(modalSelector);
    if (!backdrop) return;
    backdrop.scrollTop = 0;
    const modal = backdrop.querySelector?.(".modal");
    if (modal) modal.scrollTop = 0;
  }

  // Sluit een venster en zet de focus terug op het element waarmee het werd geopend.
  // Zonder deze stap valt de focus na het sluiten terug naar het begin van de pagina, en moet
  // iemand met een toetsenbord of schermlezer opnieuw zoeken waar hij was (toegankelijkheid).
  // Alle manieren van sluiten komen hier langs: de sluitknop, de achtergrond, Escape en na opslaan.
  // De focus gaat alleen terug als dat element nog op de pagina staat en zichtbaar is. Is de
  // lijst met die knop intussen opnieuw getekend (bijvoorbeeld na opslaan in een wijzigformulier),
  // dan krijgt de nieuwe knop met dezelfde id de focus (zie findFocusReplacement).
  closeModal(modalSelector) {
    const modal = this.view.$(modalSelector);
    modal.classList.add("hidden");

    const opener = this.modalOpeners.get(modal);
    this.modalOpeners.delete(modal);
    this.findFocusReplacement(opener)?.focus();
  }

  // Zoekselector voor een knop in een lijst, gemaakt van zijn data-attributen uit FOCUS_TARGETS,
  // bijvoorbeeld [data-edit-product="blikje"]. Zo is dezelfde knop terug te vinden nadat de lijst
  // opnieuw is getekend. Geeft null terug voor een element zonder zo'n attribuut. De waarde wordt
  // met cssAttributeValue veilig gemaakt voor de selector.
  focusSelector(element) {
    const dataset = element?.dataset;
    if (!dataset) return null;

    const parts = Object.keys(FOCUS_TARGETS)
      .filter((name) => typeof dataset[name] === "string")
      .map((name) => `[data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${cssAttributeValue(dataset[name])}"]`);
    return parts.length ? parts.join("") : null;
  }

  // Het element dat de focus moet krijgen in plaats van `element`:
  //   - het element zelf, als het nog op de pagina staat en zichtbaar is;
  //   - anders de nieuwe knop met dezelfde data-attributen (de lijst is opnieuw getekend);
  //   - bestaat die niet meer (het item is verwijderd), dan een logisch alternatief uit
  //     FOCUS_TARGETS, zoals de knop "Medewerker toevoegen" of het zoekveld;
  //   - anders null (dan blijft de focus waar die is).
  findFocusReplacement(element) {
    if (!element) return null;
    const isVisible = (candidate) => candidate?.isConnected && candidate.getClientRects().length > 0;
    if (isVisible(element)) return element;

    const selector = this.focusSelector(element);
    if (!selector) return null;

    const sameButton = this.view.$(selector);
    if (isVisible(sameButton)) return sameButton;

    const name = Object.keys(FOCUS_TARGETS).find((key) => typeof element.dataset[key] === "string" && FOCUS_TARGETS[key]);
    const fallback = name ? this.view.$(FOCUS_TARGETS[name]) : null;
    return isVisible(fallback) ? fallback : null;
  }

  // Voert `render` uit (lijsten opnieuw tekenen) zonder dat de focus verloren gaat. Had een knop
  // in een lijst de focus, dan verdwijnt die door het tekenen en zou de focus naar het begin van
  // de pagina springen. Daarna krijgt de nieuwe knop met dezelfde id de focus, of een logisch
  // alternatief als het item weg is (zie findFocusReplacement). Gebruikt na opslaan, (de)activeren
  // en verwijderen in het beheer, en na wijzigingen uit een ander tabblad.
  preserveFocus(render) {
    const focused = globalThis.document?.activeElement || null;
    render();
    if (!focused || focused.isConnected) return;
    this.findFocusReplacement(focused)?.focus();
  }

  // Hulpfunctie: sluit een venster bij een klik op de sluitknoppen of op de donkere achtergrond.
  // De sluitactie wordt ook onthouden, zodat de Escape-toets hetzelfde venster kan sluiten.
  // Het venster sluit alleen als de muisknop óók op de achtergrond werd ingedrukt. Selecteert
  // iemand tekst in een invoerveld en laat hij de muis los boven de achtergrond, dan telt de
  // browser dat als klik op de achtergrond; zonder deze controle gaat de invoer dan verloren.
  // Bij een klik (sluitknop of achtergrond) krijgt `closeAction` het klikevent mee, bij Escape niets.
  // Zo kan een venster een "spookklik" negeren (zie FridgeController.isFridgeGhostClick).
  registerModalClose(modalSelector, closeButtonSelector, closeAction) {
    document.querySelectorAll(closeButtonSelector).forEach((button) => {
      button.addEventListener("click", closeAction);
    });

    const modal = this.view.$(modalSelector);
    let pressedOnBackdrop = false;
    modal.addEventListener("mousedown", (event) => {
      pressedOnBackdrop = event.target === modal;
    });
    modal.addEventListener("click", (event) => {
      if (event.target === modal && pressedOnBackdrop) closeAction(event);
      pressedOnBackdrop = false;
    });

    this.modalCloseActions.set(modal, closeAction);
  }

  // Het bovenste venster dat nu open is, of null. Vensters die later in index.html staan,
  // liggen boven eerdere vensters (bijvoorbeeld het cameravenster boven het productvenster).
  topModal() {
    const openModals = [...document.querySelectorAll(".modal-backdrop:not(.hidden)")];
    return openModals.at(-1) || null;
  }

  // Houdt de Tab-toets binnen het bovenste venster: na het laatste element springt de focus
  // naar het eerste, en met Shift+Tab andersom. Zo komt de focus niet achter het venster.
  keepFocusInModal(event, modal) {
    const focusable = [...modal.querySelectorAll("button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex='-1'])")]
      .filter((element) => !element.disabled && element.getClientRects().length > 0);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable.at(-1);
    const focusOutside = !modal.contains(document.activeElement);

    if (event.shiftKey && (document.activeElement === first || focusOutside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || focusOutside)) {
      event.preventDefault();
      first.focus();
    }
  }
}
