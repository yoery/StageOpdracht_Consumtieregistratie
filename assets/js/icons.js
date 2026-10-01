/**
 * icons.js — de iconen van de website, als eenvoudige SVG-lijntekeningen.
 *
 * Eerder waren de iconen teksttekens (zoals een vinkje of een pijltje). Die zien er per
 * apparaat en lettertype anders uit. Deze SVG-iconen zijn overal gelijk en scherp.
 * Alle iconen zijn getekend op een raster van 24 x 24 met dezelfde lijndikte (zie .icon in
 * styles.css) en nemen de tekstkleur over, dus ze werken in het lichte en donkere thema.
 *
 * Dit bestand bevat alleen tekeningen en één hulpfunctie, daarom is het geen class.
 *
 * Gebruikt door:
 *   - RegistrationView: iconen in lijsten, knoppen, meldingen en lege toestanden;
 *   - index.html: elementen met data-icon="naam" worden bij het starten gevuld
 *     (RegistrationView.renderIcons).
 */

// De lijnen van ieder icoon (de inhoud van het <svg>-element).
const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l5 5 9-10"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  recycle: '<path d="M13.2 6l4.3 7.5M14.7 12.2l2.8 1.3.3-3.1M17 18H8.5M11 16.2 8.5 18l2.5 1.8M6.2 15.5l4.4-7.7M7.8 9.1l2.8-1.3.3 3.1"/>',
  package: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  sparkle: '<path d="M12 4l1.8 4.6L18.5 10l-4.7 1.6L12 16l-1.8-4.4L5.5 10l4.7-1.4z"/>',
  userSearch: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19a6.5 6.5 0 0 1 9-6"/><circle cx="17" cy="16" r="2.5"/><path d="M19 18l2 2"/>',
  inbox: '<path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5l1.5 2h4l1.5-2H20"/>',
  location: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
};

// Geeft de HTML van een icoon terug, bijvoorbeeld icon("search").
// Iconen zijn decoratief (aria-hidden); de betekenis staat in de tekst of het aria-label ernaast.
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ""}</svg>`;
}
