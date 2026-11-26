/**
 * deployment.js — zegt of de website met een server praat.
 *
 * Dit is de versie uit de repository: een lege waarde. De website werkt dan als demo, met alle
 * gegevens in de browser (localStorage) en het demo-inloggen. Zo draaien ook de tests.
 *
 * In de container (zie Dockerfile) en bij ontwikkelen met backend/dev-server.php wordt dit bestand
 * vervangen door docker/deployment.js, met het adres van de API. Dan lopen inloggen, medewerkers en
 * registraties via de server (zie ServerSync.js) en bestaat het demo-inloggen niet.
 */
export const SERVER_API = "";
