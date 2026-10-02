/**
 * ids — maakt unieke id's (UUID's) voor medewerkers, registraties, bedrijven enzovoort.
 *
 * Waarom een eigen functie?
 *   crypto.randomUUID() bestaat alleen op een "veilige" pagina (https of localhost). Wordt de
 *   demo geopend via een gewoon netwerkadres, zoals http://192.168.1.20, dan ontbreekt die
 *   functie en zou de applicatie bij het opstarten vastlopen. crypto.getRandomValues() werkt
 *   wel overal; daarmee bouwen we in dat geval zelf een UUID op dezelfde manier.
 *
 * Gebruikt door:
 *   - RegistrationModel: id's voor nieuwe medewerkers, registraties, producten, bedrijven,
 *     consumptiepunten en logboekregels.
 *   - DataStore: id's voor bedrijven en consumptiepunten die bij het omzetten van oude
 *     gegevens worden aangemaakt.
 */

// Geeft een nieuwe, unieke id terug in de vorm xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
// (een versie 4 UUID). Gebruikt crypto.randomUUID() als de browser die heeft, en bouwt
// anders zelf een UUID uit 16 willekeurige bytes.
export function createId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // Volgens de UUID-standaard (RFC 4122) staan op twee plekken vaste bits:
  // het versienummer 4 en de "variant" (de eerste tekens van het vierde blok: 8, 9, a of b).
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
