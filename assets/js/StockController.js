import { cssAttributeValue } from "./RegistrationView.js";

// Hoogste aantal dat de beheerder bij voorraad, minimum of levering mag invullen. Zo komt een
// tikfout als "240000" in plaats van "24" niet ongemerkt in de voorraad.
const MAX_STOCK_AMOUNT = 100000;

/**
 * StockController — het tabblad Voorraad in het beheer: een consumptiepunt kiezen, een levering
 * boeken en de voorraad (na tellen) of het minimum wijzigen.
 *
 * Verantwoordelijkheid:
 *   - de ingevulde aantallen controleren (hele getallen, hooguit MAX_STOCK_AMOUNT);
 *   - een snelle dubbele tik op "Toevoegen" negeren;
 *   - de wijziging met een logboekregel opslaan (via persist) en de voorraad opnieuw tekenen,
 *     zonder dat de focus in de voorraadtabel verloren gaat.
 *
 * Verbonden met:
 *   - RegistrationApp: maakt deze class, levert persist en pointLabel, en vraagt bij de
 *     synchronisatie tussen tabbladen of de beheerder in de voorraadtabel typt;
 *   - AdminController (via RegistrationApp): requireAdmin, showMissing en finishAdminChange;
 *   - RegistrationModel: stockEntry, changeStock, setStock en setMinimum;
 *   - RegistrationView: renderStock, renderStockAlerts en updateStockStatus.
 */
export class StockController {
  // `app` is de controller (RegistrationApp) waar deze class bij hoort.
  constructor(app) {
    this.app = app;
    this.lastDelivery = null; // laatst geboekte levering: { productId, time } (zie bookDelivery)
  }

  // Onderdelen van de app die deze class gebruikt (model, view). Die komen steeds
  // van RegistrationApp, zodat er maar één verwijzing naar ieder onderdeel bestaat.
  get model() {
    return this.app.model;
  }

  get view() {
    return this.app.view;
  }

  // Opent de voorraad van een consumptiepunt (klik op een punt in de bijbestellijst).
  showStockPoint(pointId) {
    this.view.$("#stockPointSelect").value = pointId;
    this.view.renderStock();
  }

  // Heeft een invoerveld in de voorraadtabel nu de focus? Dan is de beheerder aan het typen.
  isTypingInStockTable() {
    const focused = globalThis.document?.activeElement;
    return Boolean(focused) && this.view.$("#stockTableBody").contains(focused);
  }

  // Is dit een tweede tik op dezelfde knop "Toevoegen" vlak (binnen 800 ms) na een geboekte
  // levering? Na het boeken wordt de voorraadtabel opnieuw getekend en is het aantalveld leeg.
  // Een snelle dubbele tik op de tablet zou dan op dat lege veld vallen en de misleidende
  // foutmelding "Vul een geleverd aantal van minimaal 1 in" geven. Zo'n tik wordt genegeerd.
  isRepeatedDeliveryTap(productId, now = Date.now()) {
    return this.lastDelivery?.productId === productId && now - this.lastDelivery.time < 800;
  }

  // Boekt een levering: het ingevulde aantal (1 tot en met 100.000) komt bij de voorraad.
  bookDelivery(productId) {
    if (!this.app.requireAdmin()) return;
    if (this.isRepeatedDeliveryTap(productId)) return;

    const pointId = this.view.$("#stockPointSelect").value;
    // Bestaat het punt of het product niet meer (verwijderd in een ander tabblad), dan wordt er
    // niets geboekt; anders zou het logboek een levering tonen die de voorraad niet veranderde.
    if (!this.model.stockEntry(pointId, productId)) {
      this.app.showMissing("Dit consumptiepunt of product");
      return;
    }
    const amountField = this.view.$(`[data-delivery-amount="${cssAttributeValue(productId)}"]`);
    const amount = Number(amountField?.value);

    if (!Number.isInteger(amount) || amount <= 0) {
      this.view.showToast("Vul een geleverd aantal van minimaal 1 in", { tone: "error" });
      return;
    }
    if (amount > MAX_STOCK_AMOUNT) {
      this.view.showToast("Vul een geleverd aantal van hooguit 100.000 in", { tone: "error" });
      return;
    }

    const productName = this.model.productName(productId);
    const saved = this.app.persist(
      () => this.model.changeStock(pointId, productId, amount),
      { action: "Levering geboekt", details: `${amount} × ${productName} op ${this.app.pointLabel(pointId)}` }
    );
    if (!saved) return;

    this.lastDelivery = { productId, time: Date.now() };
    this.app.finishAdminChange("Levering toegevoegd aan de voorraad");
  }

  // Slaat een gewijzigde voorraad (na tellen) of een gewijzigd minimum direct op.
  // Beide moeten een heel getal van 0 tot en met 100.000 zijn: een negatieve telling kan niet
  // (door registraties kan de voorraad wel onder 0 komen; dat is zo bedoeld).
  // De tabel wordt daarna niet opnieuw getekend: alleen het statuslabel en de bijbestellijst
  // veranderen. Zo blijft de focus staan als de beheerder met Tab naar het volgende veld gaat.
  // Bestaat het punt of het product niet meer (verwijderd in een ander tabblad), dan wordt er
  // niets opgeslagen en komt er geen regel in het logboek, net als bij bookDelivery.
  saveStockField(input) {
    if (!this.app.requireAdmin()) return;
    const pointId = this.view.$("#stockPointSelect").value;
    const productId = input.dataset.productId;
    const field = input.dataset.stockField === "stock" ? "stock" : "minimum";
    const isStock = field === "stock";
    const value = Number(input.value);
    // Zet het veld terug op de opgeslagen waarde (na een foute invoer of mislukt opslaan).
    // Bestaat de voorraadregel niet meer, dan wordt het veld leeg.
    const resetInput = () => {
      input.value = this.model.stockEntry(pointId, productId)?.[field] ?? "";
    };

    if (!this.model.stockEntry(pointId, productId)) {
      this.app.showMissing("Dit consumptiepunt of product");
      resetInput();
      return;
    }

    let error = null;
    if (input.value.trim() === "" || !Number.isInteger(value)) {
      error = isStock ? "Vul een geheel aantal in" : "Vul een geheel aantal van 0 of hoger in";
    } else if (value < 0) {
      error = "Vul een geheel aantal van 0 of hoger in";
    } else if (value > MAX_STOCK_AMOUNT) {
      error = "Vul een aantal van hooguit 100.000 in";
    }
    if (error) {
      this.view.showToast(error, { tone: "error" });
      resetInput();
      return;
    }

    const saved = this.app.persist(
      () => {
        if (isStock) this.model.setStock(pointId, productId, value);
        else this.model.setMinimum(pointId, productId, value);
      },
      {
        action: isStock ? "Voorraad geteld" : "Minimum gewijzigd",
        details: `${this.model.productName(productId)} op ${this.app.pointLabel(pointId)}: ${value}`
      }
    );
    if (!saved) {
      resetInput();
      return;
    }

    this.app.finishAdminChange(isStock ? "Voorraad bijgewerkt" : "Minimum bijgewerkt", { redrawStockTable: false });
    this.view.renderStockAlerts();
    this.view.updateStockStatus(pointId, productId);
  }
}
