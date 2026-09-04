# Technisch Ontwerp (TO)
## Blikjesregistratie TVB

**Versie:** 1.0  
**Datum:** 4 september 2026  
**Status:** frontend-demo, voorbereid op backendkoppeling

## 1. Technische scope

De applicatie bestaat momenteel uit een statische frontend:

- `index.html` bevat semantische UI-componenten.
- `styles.css` bevat variabelen, componentstijlen en responsive regels.
- `app.js` bevat de OOP-applicatielogica.
- `localStorage` is de tijdelijke opslaglaag.
- SheetJS maakt de Excel-export.

## 2. OOP-architectuur

```text
RegistrationApp (controller)
        |
        +--> RegistrationModel (domeinregels en state)
        |          |
        |          +--> DataStore (localStorage / toekomstige API)
        |
        +--> RegistrationView (DOM-rendering en meldingen)
```

### `DataStore`

Leest en schrijft JSON via `localStorage`. De class valideert opgeslagen data en vangt lees- en schrijffouten af. De interface `load()` en `save()` kan later worden vervangen door `fetch()`-aanroepen naar een backend.

### `RegistrationModel`

Beheert medewerkers en registraties. De class bevat functies voor:

- toevoegen en verwijderen van registraties;
- toevoegen en verwijderen van medewerkers;
- tellen per medewerker, dag en maand;
- snapshots maken en herstellen bij een opslagfout.

### `RegistrationView`

Rendert de publieke lijst, statistieken, admin-tabel, filters, correcties, medewerkersbeheer en toastmeldingen. De view wijzigt de data niet rechtstreeks.

### `RegistrationApp`

Koppelt events aan model en view. De methode `persist()` voert een wijziging transactioneel uit: bij mislukte opslag wordt de vorige state hersteld.

## 3. HTML-componenten

| Component | Functie |
|---|---|
| `.topbar` | Merknaam, status en admin-ingang |
| `.hero` | Introductie en huidige datum |
| `.directory-card` | Zoekbare medewerkerlijst |
| `.summary-column` | Dag-, maand- en tipkaarten |
| `#adminModal` | Login en dashboard |
| `#registrationsTab` | Filters, correcties en registratie-overzicht |
| `#employeesTab` | Medewerkers toevoegen en verwijderen |
| `#toast` | Tijdelijke feedbackmeldingen |

De `id`-waarden vormen de koppeling tussen HTML en JavaScript. Dynamische acties gebruiken `data-*`-attributen, bijvoorbeeld `data-add` en `data-correction-minus`.

## 4. CSS-ontwerp

De stylesheet is opgebouwd in deze volgorde:

1. CSS-variabelen en globale reset.
2. Basislayout en navigatie.
3. Hero, kaarten en publieke medewerkerlijst.
4. Modal, dashboard, filters en tabellen.
5. Meldingen en correctiecomponenten.
6. Responsive regels onder 720 pixels.

De belangrijkste ontwerpvariabelen zijn `--green`, `--green-dark`, `--blue`, `--blue-soft`, `--mint`, `--line` en `--shadow`. Hierdoor kunnen kleuren en algemene stijlkeuzes centraal worden aangepast.

## 5. Datamodel

### Huidige frontend-state

```js
{
  employees: [
    {
      id: "unieke-id",
      name: "Voorbeeld Naam",
      color: "#d8f1e8"
    }
  ],
  registrations: [
    {
      id: "unieke-id",
      employeeId: "id-van-medewerker",
      createdAt: "2026-09-04T08:00:00.000Z"
    }
  ]
}
```

Iedere registratie staat voor precies één blikje. Het aantal wordt daarom niet apart opgeslagen in de demo.

### Voorgesteld databaseschema

```text
Medewerkers
- MedewerkerID      PRIMARY KEY
- Voornaam
- Achternaam
- Actief

Registraties
- RegistratieID     PRIMARY KEY
- MedewerkerID      FOREIGN KEY -> Medewerkers
- DatumTijd
- Aantal            DEFAULT 1
```

Voor auditlogging kan een extra tabel worden toegevoegd:

```text
AdminLog
- LogID             PRIMARY KEY
- AdminID
- Actie
- MedewerkerID
- RegistratieID
- DatumTijd
- Details
```

## 6. Toekomstige backendkoppeling

De frontend kan later een REST-API gebruiken:

| Methode | Endpoint | Doel |
|---|---|---|
| `GET` | `/api/employees` | Actieve medewerkers ophalen |
| `POST` | `/api/registrations` | Eén blikje registreren |
| `GET` | `/api/registrations` | Registraties met filters ophalen |
| `POST` | `/api/admin/login` | Adminsessie starten |
| `POST` | `/api/admin/corrections` | Correctie vastleggen |
| `POST` | `/api/employees` | Medewerker toevoegen |
| `PATCH` | `/api/employees/{id}` | Medewerker inactief maken |
| `GET` | `/api/export` | Gefilterde Excel-export maken |

De frontend moet in die situatie geen wachtwoorden of autorisatie zelf bepalen. Authenticatie, autorisatie, validatie, logging en transacties horen op de server plaats te vinden.

## 7. Foutafhandeling en gegevensbehoud

- Beschadigde JSON wordt niet gebruikt; de demo start met voorbeelddata.
- Een opslagfout wordt gelogd in de console en aan de gebruiker gemeld.
- Mislukte wijzigingen worden via een snapshot teruggedraaid.
- Verwijderde medewerkers worden uit de actieve lijst gehaald.
- Historische registraties blijven bestaan en worden als `Verwijderd` weergegeven.
- Een ontbrekende SheetJS-bibliotheek toont een foutmelding in plaats van een crash.

## 8. Export

De export maakt twee werkbladen:

1. `Registraties`: medewerker, aantal, prijs per blikje en registratiedatum.
2. `Maandtotalen` of `Periode-totalen`: totalen per medewerker en een totaalregel.

De prijs wordt intern berekend als 69 cent per blikje en afgerond op twee decimalen.

## 9. Beveiliging voor productie

De demo-login accepteert elk ingevuld wachtwoord en is niet geschikt voor productie. Voor een echte uitrol zijn minimaal nodig:

- HTTPS;
- gehashte wachtwoorden;
- sessies of beveiligde tokens;
- rollen en autorisaties;
- server-side inputvalidatie;
- auditlogging;
- rate limiting;
- databaseback-ups;
- bescherming tegen CSRF en ongewenste exports.

## 10. Test- en acceptatieplan

| Test | Verwacht resultaat |
|---|---|
| Zoek een bestaande medewerker | Alleen passende namen verschijnen |
| Zoek een onbekende naam | Melding “Geen medewerker gevonden” verschijnt |
| Klik op publieke `+` | Eén registratie wordt toegevoegd en opgeslagen |
| Herlaad de pagina | De registratie blijft aanwezig |
| Sla beschadigde JSON op | De demo valt terug op voorbeelddata |
| Open admin zonder login | Loginformulier verschijnt |
| Corrigeer met admin `+` en `−` | Alleen de gekozen medewerker wijzigt |
| Verwijder medewerker | Medewerker verdwijnt, historie blijft zichtbaar |
| Exporteer met filters | Alleen geselecteerde data staat in Excel |
| Open op mobiel formaat | Componenten stapelen en blijven bruikbaar |

## 11. Onderhoud

Bij wijzigingen moet de verantwoordelijkheidsverdeling behouden blijven:

- opslag in `DataStore`;
- bedrijfsregels in `RegistrationModel`;
- DOM en presentatie in `RegistrationView`;
- events en workflows in `RegistrationApp`;
- vormgeving in `styles.css`;
- vaste structuur in `index.html`.

Deze scheiding voorkomt dat database-, gebruikersinterface- en presentatielogica door elkaar raken.
