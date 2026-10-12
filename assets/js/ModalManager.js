/**
 * ModalManager — opent en sluit de vensters (modals) en regelt de focus daarbij.
 *
 * Verantwoordelijkheid:
 *   - elementen op de pagina tonen en verbergen (show en hide);
 *   - een venster openen en bij het sluiten de focus terugzetten op het element waarmee het
 *     werd geopend (toegankelijkheid);
 *   - de sluitknoppen en de donkere achtergrond van ieder venster koppelen, en per venster de
 *     sluitactie onthouden voor de Escape-toets;
 *   - het bovenste open venster bepalen en de Tab-toets binnen dat venster houden.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, geeft de methodes en velden door aan de rest van de
 *     app en gebruikt topModal, modalCloseActions en keepFocusInModal bij Escape en Tab;
 *   - RegistrationView: zoekt de elementen op met $();
 *   - index.html: de vensters (.modal-backdrop) en hun sluitknoppen.
 */
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

  // Opent een venster en onthoudt waar de focus vandaan kwam.
  openModal(modalSelector) {
    this.rememberOpener(modalSelector);
    this.show(modalSelector);
  }

  // Sluit een venster en zet de focus terug op het element waarmee het werd geopend.
  // Zonder deze stap valt de focus na het sluiten terug naar het begin van de pagina, en moet
  // iemand met een toetsenbord of schermlezer opnieuw zoeken waar hij was (toegankelijkheid).
  // Alle manieren van sluiten komen hier langs: de sluitknop, de achtergrond, Escape en na opslaan.
  // De focus gaat alleen terug als dat element nog op de pagina staat en zichtbaar is.
  closeModal(modalSelector) {
    const modal = this.view.$(modalSelector);
    modal.classList.add("hidden");

    const opener = this.modalOpeners.get(modal);
    this.modalOpeners.delete(modal);
    if (opener?.isConnected && opener.getClientRects().length > 0) opener.focus();
  }

  // Hulpfunctie: sluit een venster bij een klik op de sluitknoppen of op de donkere achtergrond.
  // De sluitactie wordt ook onthouden, zodat de Escape-toets hetzelfde venster kan sluiten.
  // Het venster sluit alleen als de muisknop óók op de achtergrond werd ingedrukt. Selecteert
  // iemand tekst in een invoerveld en laat hij de muis los boven de achtergrond, dan telt de
  // browser dat als klik op de achtergrond; zonder deze controle gaat de invoer dan verloren.
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
      if (event.target === modal && pressedOnBackdrop) closeAction();
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
