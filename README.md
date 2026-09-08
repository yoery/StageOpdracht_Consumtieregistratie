# StageOpdracht_blikjesregistratie

Een interactieve front-end voor het registreren van blikjes binnen de organisatie.

## Starten

Open [index.html](./index.html) in een moderne browser. Er is geen buildstap nodig.

## Inbegrepen

- Medewerkerlijst met zoeken en een persoonlijk productvenster waarin meerdere producten met plusknoppen kunnen worden gekozen en daarna tegelijk geregistreerd.
- Automatische datum/tijd en lokale opslag via `localStorage`.
- Admin-demo via de knop rechtsboven (elk ingevuld wachtwoord werkt).
- Admin-overzicht met medewerker- en maandfilters.
- Registraties corrigeren met `+` en `−`, medewerkers toevoegen/wijzigen en actief/inactief zetten.
- Inactieve medewerkers kunnen daarna ook definitief worden verwijderd; historische registraties blijven behouden.
- Producten en prijzen beheren. Standaard zijn blikje €0,65, sneetje brood €0,10, boter €0,10, zoet beleg €0,20, glas melk €0,20, beleg €0,50, ei €0,50 en yoghurt €0,50.
- Medewerkers zien geen persoonlijke aantallen of persoonlijke kosten; deze informatie is alleen beschikbaar voor de admin.
- Producten toevoegen via een formulier met `Opslaan` en `Opslaan + opnieuw`.
- Excel-export met vaste kolommen: Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs.
- Administratief logboek voor wijzigingen, met maximaal 20 regels tegelijk en `Meer laden`.
- Uitgebreide documentatie in `DOCUMENTATIE.md` en een Word-compatibele export in `DOCUMENTATIE-WORD.doc`.
- Functioneel ontwerp met wireframes en Nielsen-heuristieken in `FO-BLIKJESREGISTRATIE.md`.
- Word-compatibele versie van het functioneel ontwerp in `FO-BLIKJESREGISTRATIE.doc`.
- Technisch ontwerp met OOP-architectuur en databasespecificatie in `TO-BLIKJESREGISTRATIE.md`.
- Word-compatibele versie van het technisch ontwerp in `TO-BLIKJESREGISTRATIE.doc`.

De Excel-export gebruikt SheetJS via CDN; daarvoor is een internetverbinding nodig wanneer de pagina voor het eerst wordt geopend.
