/**
 * deployment.js — de versie voor de container (zie Dockerfile). Dit bestand vervangt daar
 * assets/js/deployment.js.
 *
 * In de container praat de website met de server: inloggen, medewerkers en registraties lopen via
 * /api en staan in de database van de server. Het demo-inloggen bestaat hier niet.
 */
export const SERVER_API = "/api";
