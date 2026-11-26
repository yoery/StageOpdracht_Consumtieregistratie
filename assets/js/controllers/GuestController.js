import { ControllerPart } from "./ControllerPart.js";

/**
 * GuestController — registreren als gast (FR-98).
 *
 * Een gast is iemand van buiten TVB die niet in AFAS staat. Op de tablet vult hij zijn naam en een
 * telefoonnummer in, zodat de administratie hem kan bellen over de betaling. Daarna opent het gewone
 * productvenster en komt de consumptie op zijn eigen naam. De volgende keer zoekt hij zichzelf op
 * zoals iedereen: zijn naam staat in de groep "Gasten".
 *
 * Een gast heeft geen looncode, personeelsnummer of bedrijf. Gasten staan daarom niet in het
 * CSV-bestand voor de loonadministratie (zie CsvExport). Het telefoonnummer ziet alleen de
 * beheerder: een tablet krijgt het van de server niet terug (zie Policy.php).
 *
 * Verbonden met:
 *   - RegistrationModel.addGuest: maakt de gast, of geeft de bestaande gast met dezelfde naam en
 *     hetzelfde telefoonnummer terug;
 *   - EmployeeController.openEmployeeProducts: het productvenster na het opslaan.
 */
export class GuestController extends ControllerPart {
  // Een telefoonnummer: cijfers, spaties, +, - en haakjes, met minstens 8 en hooguit 15 cijfers.
  static isValidPhone(value) {
    const text = String(value ?? "").trim();
    const digits = text.replace(/\D/g, "").length;
    return /^[+0-9 ()-]{8,25}$/.test(text) && digits >= 8 && digits <= 15;
  }

  openGuestForm() {
    const form = this.view.$("#guestForm");
    form.reset();
    this.view.clearFieldErrors(form);
    this.app.openModal("#guestModal");
    this.view.$("#guestFirstName").focus();
  }

  closeGuestForm() {
    this.view.clearFieldErrors(this.view.$("#guestForm"));
    this.app.closeModal("#guestModal");
  }

  // Leest het formulier, maakt de gast (of vindt de bestaande) en opent het productvenster.
  saveGuest(event) {
    event.preventDefault();
    const form = this.view.$("#guestForm");
    if (!this.app.validateRequiredFields(form)) return;

    const phoneField = this.view.$("#guestPhone");
    if (!GuestController.isValidPhone(phoneField.value)) {
      this.view.showFieldError(phoneField, "Vul een telefoonnummer in, bijvoorbeeld 06 12345678.");
      phoneField.focus();
      return;
    }

    const guest = {
      firstName: this.view.$("#guestFirstName").value.trim(),
      lastName: this.view.$("#guestLastName").value.trim(),
      phone: phoneField.value.trim().replace(/\s+/g, " ")
    };
    let guestId = null;
    const saved = this.app.persist(
      () => {
        guestId = this.model.addGuest(guest);
        return guestId !== null;
      },
      // Het telefoonnummer komt niet in het logboek.
      { action: "Gast geregistreerd", details: `${guest.firstName} ${guest.lastName}` }
    );
    if (!saved) return;

    this.app.closeModal("#guestModal");
    this.view.$("#employeeSearch").value = "";
    this.view.renderAll();
    this.app.openEmployeeProducts(guestId);
  }
}
