# Consumptieregistratie TVB

Een interactieve front-end voor het registreren van eten en drinken binnen de organisatie.

## Starten

Open de map in VS Code en start [index.html](./index.html) met de extensie **Live Server** (of een andere lokale webserver). Er is geen buildstap nodig.

Dubbelklikken op `index.html` werkt niet: de JavaScript bestaat uit modules en browsers blokkeren die via `file://`.

Tests draaien (Node.js 20+): `npm test`

## Mappenstructuur

```text
index.html                  # Hoofdpagina van de website
assets/
  styles.css                # Vormgeving
  js/
    main.js                 # Startpunt van de app
    config.js               # Vaste waarden en standaardproducten
    DataStore.js            # Opslag in localStorage
    RegistrationModel.js    # Gegevens en regels
    RegistrationView.js     # Weergave (HTML)
    RegistrationApp.js      # Controller (klikken en formulieren)
    csvExport.js            # CSV-export voor de loonadministratie
    app.js                  # Back-up van de originele versie, wordt niet geladen
docs/                       # FO, TO en overige documentatie
tests/                      # Unit tests
.github/workflows/          # GitHub Actions CI/CD
```

## Inbegrepen

- Medewerkerlijst met zoeken en een persoonlijk productvenster waarin meerdere producten met plusknoppen kunnen worden gekozen en daarna tegelijk geregistreerd.
- Medewerkers kunnen aan een bedrijfsnaam en werkgevernummer worden gekoppeld, per bedrijf worden gegroepeerd en gefilterd.
- Automatische datum/tijd en lokale opslag via `localStorage`.
- Admin-demo via de knop rechtsboven (elk ingevuld wachtwoord werkt).
- Admin-overzicht met medewerker- en maandfilters.
- Registraties corrigeren met `+` en `−`, medewerkers toevoegen/wijzigen en actief/inactief zetten.
- Inactieve medewerkers kunnen daarna ook definitief worden verwijderd; historische registraties blijven behouden.
- Producten en prijzen beheren. Standaard zijn blikje €0,65, sneetje brood €0,10, boter €0,10, zoet beleg €0,20, glas melk €0,20, beleg €0,50, ei €0,50 en yoghurt €0,50.
- Medewerkers zien geen persoonlijke aantallen of persoonlijke kosten; deze informatie is alleen beschikbaar voor de admin.
- Producten toevoegen via een formulier met `Opslaan` en `Opslaan + opnieuw`.
- CSV-export (te openen in Excel) met vaste kolommen: Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs. Jaar en Maand zijn de loonmaand: consumpties worden verwerkt in de maand erna (september → oktober, december → januari).
- Administratief logboek voor wijzigingen, met maximaal 20 regels tegelijk en `Meer laden`.
- Uitgebreide documentatie in [`docs/DOCUMENTATIE.md`](./docs/DOCUMENTATIE.md) en een Word-compatibele export in [`docs/DOCUMENTATIE-WORD.doc`](./docs/DOCUMENTATIE-WORD.doc).
- Functioneel ontwerp met wireframes en Nielsen-heuristieken in [`docs/FO-BLIKJESREGISTRATIE.md`](./docs/FO-BLIKJESREGISTRATIE.md).
- Word-compatibele versie van het functioneel ontwerp in [`docs/FO-BLIKJESREGISTRATIE.doc`](./docs/FO-BLIKJESREGISTRATIE.doc).
- Technisch ontwerp met OOP-architectuur en databasespecificatie in [`docs/TO-BLIKJESREGISTRATIE.md`](./docs/TO-BLIKJESREGISTRATIE.md).
- Productiegericht PostgreSQL-schema in [`docs/DATABASE-SCHEMA.sql`](./docs/DATABASE-SCHEMA.sql).
- Word-compatibele versie van het technisch ontwerp in [`docs/TO-BLIKJESREGISTRATIE.doc`](./docs/TO-BLIKJESREGISTRATIE.doc).
