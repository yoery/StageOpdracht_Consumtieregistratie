# Technisch Ontwerp - Blikjesregistratie TVB

**Versie:** 2.0
**Datum:** 7 september 2026
**Status:** frontend-demo met productieschema voor PostgreSQL

## 1. Inleiding

### Doel van het systeem

Met dit systeem kunnen medewerkers producten registreren, zoals blikjes en cateringproducten. De beheerder kan registraties, medewerkers en prijzen beheren en een vaste Excel-export maken.

### Scope van het project

In deze demo zitten de volgende onderdelen:

- medewerkers bekijken en zoeken;
- een blikje toevoegen met de `+`-knop;
- datum en tijd automatisch opslaan;
- inloggen als beheerder;
- registraties corrigeren;
- medewerkers toevoegen, wijzigen en actief of inactief zetten;
- producten en prijzen beheren;
- wijzigingen bijhouden in een logboek;
- registraties filteren;
- gegevens exporteren naar Excel;
- gegevens opslaan in de browser met `localStorage`.

De demo heeft nog geen echte database of echte beveiligde login. Het volledige referentieschema voor productie staat in [`DATABASE-SCHEMA.sql`](./DATABASE-SCHEMA.sql). De backend/API moet de browseropslag vervangen en beheerders moeten met gehashte wachtwoorden worden opgeslagen.

### Verwijzing naar het functioneel ontwerp

De eisen en gebruikersflows staan in het [functioneel ontwerp](./FO-BLIKJESREGISTRATIE.md). In dit technisch ontwerp leg ik uit hoe de website technisch is opgebouwd.

## 2. Systeemarchitectuur

### Huidige demo

```text
Gebruiker
    ↓
Webbrowser
    ↓
HTML, CSS en JavaScript
    ↓
DataStore
    ↓
localStorage
    ↓
Excel-export met SheetJS
```

### Mogelijke productieversie

```text
Gebruiker
    ↓
Webbrowser
    ↓
Webapplicatie
    ↓
Backend en API
    ↓
Gedeelde SQL-database
    ↓
Excel-export
```

### Opbouw van de JavaScript

De JavaScript is verdeeld in vier classes:

- `DataStore` regelt het opslaan en ophalen van gegevens.
- `RegistrationModel` bevat de gegevens en de regels van de applicatie.
- `RegistrationView` zet de gegevens op het scherm.
- `RegistrationApp` verwerkt klikken, formulieren en andere acties.

Door deze verdeling blijft de code overzichtelijk. Later kan bijvoorbeeld `localStorage` worden vervangen door een database zonder alles opnieuw te maken.

## 3. Technologiestack

### Gebruikte technieken in de demo

- **HTML5:** voor de structuur van de pagina.
- **CSS3:** voor kleuren, layout en responsive design.
- **JavaScript:** voor de werking van de website.
- **OOP:** de JavaScript is verdeeld in classes.
- **localStorage:** tijdelijke opslag in de browser.
- **SheetJS:** maakt de Excel-export.

### Mogelijke technieken voor productie

De backend en database zijn nog niet gekozen. Mogelijke keuzes zijn:

- PHP, .NET of Node.js voor de backend;
- SQL Server, PostgreSQL of MySQL voor de database;
- een interne server of Azure voor de hosting.

De definitieve keuze moet samen met de IT-afdeling van TVB worden gemaakt.

## 4. Databaseontwerp

### Opslag in de huidige demo

De demo bewaart een JSON-object in `localStorage`:

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
      productId: "blikje",
      createdAt: "2026-09-07T08:00:00.000Z"
    }
  ]
}
```

Elke klik op `+` maakt één registratie. Daarom is het aantal in de demo altijd `1`.

### Tabel Medewerkers

| Veld | Type | Uitleg |
|---|---|---|
| `MedewerkerID` | Integer of UUID | Uniek nummer van de medewerker |
| `Voornaam` | Tekst | Voornaam van de medewerker |
| `Achternaam` | Tekst | Achternaam van de medewerker |
| `Actief` | Boolean | Geeft aan of de medewerker nog actief is |
| `Looncode` | Tekst | Looncode voor de Excel-export |
| `Personeelsnummer` | Tekst | Nummer van de medewerker |
| `Bedrijfsnaam` | Tekst | Naam van het bedrijf waar de medewerker werkt |
| `Werkgevernummer` | Tekst | Nummer van de werkgever |

### Tabel Registraties

| Veld | Type | Uitleg |
|---|---|---|
| `RegistratieID` | Integer of UUID | Uniek nummer van de registratie |
| `MedewerkerID` | Integer of UUID | Koppeling met de medewerker |
| `DatumTijd` | DateTime | Datum en tijd van de registratie |
| `Aantal` | Integer | Aantal blikjes, standaard `1` |
| `ProductID` | Integer of UUID | Geregistreerd product |

### Productieschema

Het volledige PostgreSQL-schema staat in [`DATABASE-SCHEMA.sql`](./DATABASE-SCHEMA.sql). Het schema bevat:

- `companies` voor bedrijven en werkgeversnummers;
- `employees` voor actieve en inactieve medewerkers;
- `products` voor producten en prijzen;
- `admins` voor beheerders en rollen;
- `registrations` voor iedere consumptieregistratie met datum, tijd en aantal;
- `audit_log` voor administratieve wijzigingen;
- `monthly_employee_consumption` als databaseview voor maandtotalen.

Registraties worden niet fysiek verwijderd bij normale correcties. Een correctie verwijdert alleen de betreffende registratie via de backend en schrijft altijd een regel naar `audit_log`. Medewerkers, bedrijven en producten worden bij voorkeur gedeactiveerd in plaats van verwijderd, zodat historische gegevens behouden blijven.

Gebruik voor `password_hash` een sterk wachtwoordalgoritme zoals Argon2id of bcrypt. Sla nooit een wachtwoord zelf op. Gebruik in de backend parameterized queries, transacties rond correcties en een databasegebruiker met alleen de benodigde rechten.

### Tabel Producten

| Veld | Type | Uitleg |
|---|---|---|
| `ProductID` | Integer of UUID | Uniek nummer van het product |
| `Naam` | Tekst | Bijvoorbeeld blikje, melk, beleg of brood |
| `Prijs` | Decimal | Prijs per product |

De standaardprijzen zijn: blikje €0,65, sneetje brood €0,10, boter €0,10, zoet beleg €0,20, glas melk €0,20, beleg €0,50, ei €0,50 en yoghurt €0,50.

### Extra tabel voor adminacties

Voor een echte versie is een tabel `AdminLog` handig. Hierin kan worden opgeslagen wie een wijziging heeft gedaan en wanneer dit gebeurde.

| Veld | Type | Uitleg |
|---|---|---|
| `LogID` | Integer of UUID | Uniek nummer van de logregel |
| `AdminID` | Integer of UUID | Nummer van de beheerder |
| `Actie` | Tekst | Bijvoorbeeld toevoegen of corrigeren |
| `MedewerkerID` | Integer of UUID | Betrokken medewerker |
| `DatumTijd` | DateTime | Moment van de actie |
| `Details` | Tekst | Extra uitleg over de actie |

In de productieversie is het beter om een medewerker op inactief te zetten in plaats van echt te verwijderen. Zo blijven oude registraties aan de juiste medewerker gekoppeld.

## 5. Schermontwerpen

### Medewerkersscherm

Op dit scherm staan:

- de naam van de medewerker;
- een avatar;
- het huidige aantal blikjes;
- een zoekveld;
- een `+`-knop;
- het totaal van vandaag;
- het totaal van deze maand;
- een melding na het opslaan.

Een gewone medewerker krijgt geen `−`-knop. Alleen de beheerder kan een registratie verlagen.

### Admin-login

Het loginvenster bevat:

- een e-mailadres;
- een wachtwoord;
- een knop om in te loggen;
- een melding bij verkeerde of lege invoer;
- een sluitknop.

In de demo werkt ieder ingevuld wachtwoord. Dit is alleen voor demonstratie en is niet veilig voor productie.

### Beheerscherm

De beheerder kan hier:

- alle registraties bekijken;
- filteren op medewerker en maand;
- een medewerker zoeken voor een correctie;
- een blikje toevoegen of verwijderen;
- Excel exporteren;
- medewerkers toevoegen;
- medewerkers zoeken en verwijderen;
- uitloggen.

### Mobiele weergave

Op een klein scherm komen de onderdelen onder elkaar te staan. Hierdoor blijven de knoppen en teksten goed leesbaar op een telefoon.

## 6. Procesbeschrijvingen

### Blikje registreren

1. De gebruiker zoekt een medewerker.
2. De gebruiker klikt op `+`.
3. De applicatie maakt een nieuwe registratie.
4. De datum en tijd worden automatisch toegevoegd.
5. De registratie wordt opgeslagen.
6. De teller wordt bijgewerkt.
7. De gebruiker krijgt een bevestiging.

Als opslaan niet lukt, wordt de wijziging teruggedraaid en krijgt de gebruiker een foutmelding.

### Registratie corrigeren

1. De beheerder logt in.
2. De beheerder zoekt een medewerker.
3. Met `+` wordt een registratie toegevoegd.
4. Met `−` wordt de laatste registratie van deze medewerker verwijderd.
5. Het overzicht wordt opnieuw geladen.

### Medewerker toevoegen

1. De beheerder opent het tabblad `Medewerkers`.
2. De beheerder vult een naam in.
3. De applicatie maakt een unieke id.
4. De medewerker wordt opgeslagen en getoond.

### Medewerker verwijderen

1. De beheerder zoekt de medewerker.
2. De beheerder klikt op verwijderen.
3. De medewerker verdwijnt uit de actieve lijst.
4. Oude registraties blijven bewaard.
5. In het overzicht staat bij deze oude registraties `Verwijderd`.

### Excel exporteren

1. De beheerder kiest eventueel een medewerker en maand.
2. De applicatie verzamelt de juiste registraties.
3. Er wordt een tabblad met registraties gemaakt.
4. Er wordt een tabblad met totalen gemaakt.
5. De prijs wordt berekend met €0,69 per blikje.
6. Het Excelbestand wordt gedownload.

## 7. Interfaces

### Excel

De applicatie gebruikt SheetJS om een Excelbestand te maken. Het bestand bevat:

- de medewerker;
- het aantal blikjes;
- de prijs per blikje;
- de datum en tijd;
- totalen per medewerker;
- het totaalbedrag.

### Mogelijke API

| Methode | Endpoint | Doel |
|---|---|---|
| `GET` | `/api/employees` | Medewerkers ophalen |
| `POST` | `/api/registrations` | Registratie toevoegen |
| `GET` | `/api/registrations` | Registraties ophalen met filters |
| `POST` | `/api/admin/login` | Beheerder inloggen |
| `POST` | `/api/admin/corrections` | Correctie opslaan |
| `POST` | `/api/employees` | Medewerker toevoegen |
| `PATCH` | `/api/employees/{id}` | Medewerker inactief maken |
| `GET` | `/api/export` | Export maken |

Een koppeling met Active Directory of Microsoft Entra ID kan later worden onderzocht. Deze koppeling zit niet in de demo.

## 8. Beveiliging

### Authenticatie

De login in de demo is niet echt beveiligd. Elk ingevuld wachtwoord wordt geaccepteerd. In productie moet een echte login met veilige wachtwoorden worden gebruikt.

### Autorisatie

- **Medewerker:** kan een blikje registreren.
- **Beheerder:** kan registreren, corrigeren, medewerkers beheren en exporteren.
- **Systeembeheerder:** kan rollen en instellingen beheren.

Voor productie zijn ook HTTPS, gehashte wachtwoorden, sessies, server-side controle, logging en back-ups nodig.

## 9. Niet-functionele eisen (NFR's)

| Eis | Uitleg | Doel |
|---|---|---|
| Beschikbaarheid | De website moet tijdens werktijd werken | 99% in productie |
| Gebruiksgemak | Een registratie moet snel kunnen | Binnen 5 seconden |
| Performance | De pagina moet snel laden | Binnen 2 seconden |
| Responsive | De website werkt op desktop en mobiel | Alle normale schermen |
| Gegevensbehoud | Oude registraties mogen niet verdwijnen | Ook na vertrek medewerker |
| Beveiliging | Alleen admins mogen beheren | Controle op de server |
| Onderhoudbaarheid | Onderdelen zijn gescheiden | Classes met eigen taak |
| Herstelbaarheid | Gegevens moeten teruggezet kunnen worden | Back-ups maken |

## 10. Exportontwerp

### Werkblad Periode-totalen

Dit werkblad gebruikt altijd deze kolomvolgorde:

1. Jaar
2. Maand
3. Looncode
4. Personeelsnummer
5. Werkgevernummer
6. Naam
7. Totaal
8. Prijs

### Werkblad Registraties

Dit werkblad bevat de losse productregistraties met medewerker, product, datum, aantal en prijs.

### Exportopties

De huidige export kan filteren op:

- alle medewerkers;
- één medewerker;
- één maand;
- alle beschikbare maanden.

Week- en jaarfilters kunnen later worden toegevoegd.

## 11. Foutafhandeling

| Situatie | Wat doet het systeem? |
|---|---|
| Beschadigde JSON | De demo start opnieuw met voorbeelddata |
| Opslaan lukt niet | De wijziging wordt teruggedraaid |
| Ongeldige invoer | De gebruiker krijgt een melding |
| Medewerker niet gevonden | De zoeklijst toont een melding |
| Geen registratie om te verwijderen | De gebruiker krijgt een informatiemelding |
| SheetJS ontbreekt | De export wordt niet gestart |
| Export mislukt | De gebruiker krijgt een foutmelding |
| Onbevoegde actie | De actie wordt geweigerd en gelogd |

## 12. Testscenario's

| Test | Verwacht resultaat |
|---|---|
| Medewerker zoeken | Alleen passende medewerkers verschijnen |
| Onbekende naam zoeken | De melding “Geen medewerker gevonden” verschijnt |
| Blikje toevoegen | Het aantal stijgt met 1 |
| Pagina herladen | De registratie blijft aanwezig |
| Beschadigde opslag openen | De demo gebruikt voorbeelddata |
| Medewerker zelf laten verlagen | Er is geen `−`-knop zichtbaar |
| Admin inloggen | Het dashboard verschijnt |
| Admin `+` gebruiken | De gekozen medewerker krijgt één registratie |
| Admin `−` gebruiken | De laatste registratie wordt verwijderd |
| Filter gebruiken | Alleen de gekozen gegevens verschijnen |
| Medewerker toevoegen | De nieuwe medewerker verschijnt |
| Medewerker verwijderen | De medewerker verdwijnt, historie blijft |
| Excel exporteren | Een `.xlsx`-bestand wordt gedownload |
| Modal sluiten | De modal sluit zonder uit te loggen |
| Uitloggen | Het loginvenster verschijnt opnieuw |
| Mobiel bekijken | De layout blijft bruikbaar |

## 13. Onderhoud en toekomst

Bij nieuwe code moet de verdeling hetzelfde blijven:

- opslag in `DataStore`;
- regels in `RegistrationModel`;
- HTML-weergave in `RegistrationView`;
- acties in `RegistrationApp`;
- vormgeving in `assets/styles.css`;
- vaste paginaopbouw in `index.html`.

De belangrijkste volgende stap is een backend met een gedeelde database, echte login, autorisatie, auditlog en back-ups.
