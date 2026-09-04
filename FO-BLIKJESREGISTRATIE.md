# Functioneel Ontwerp (FO)
## Blikjesregistratie TVB

**Versie:** 1.0  
**Datum:** 4 september 2026  
**Status:** frontend-demo met `localStorage`

## 1. Doel en doelgroep

De applicatie registreert hoeveel blikjes medewerkers pakken. Medewerkers kunnen snel hun naam zoeken en met één klik een blikje registreren. Beheerders kunnen registraties controleren, corrigeren, medewerkers beheren en gegevens exporteren.

De primaire gebruikers zijn:

- **Medewerkers:** registreren een eigen blikje.
- **Beheerders:** beheren medewerkers, corrigeren registraties en exporteren rapportages.

## 2. Functionele requirements

| ID | Omschrijving |
|---|---|
| FR-01 | Alle actieve medewerkers worden op voor- en achternaam getoond. |
| FR-02 | Medewerkers kunnen via een zoekbalk worden gevonden. |
| FR-03 | Een medewerker kan met `+` een blikje toevoegen. |
| FR-04 | Een medewerker kan zelf geen blikje verwijderen. |
| FR-05 | Een toevoeging wordt direct opgeslagen. |
| FR-06 | Het huidige aantal blikjes wordt per medewerker getoond. |
| FR-07/18 | Elke registratie krijgt automatisch een datum. |
| FR-08 | Een beheerder kan inloggen. |
| FR-09/10 | Een beheerder kan registraties per medewerker verhogen of verlagen. |
| FR-11/12 | Een beheerder kan registraties bekijken en filteren. |
| FR-13/14/24/25 | Een beheerder kan een Excel-export met details, totalen en prijzen maken. |
| FR-15 | Administratieve wijzigingen moeten in productie worden gelogd. |
| FR-16/17 | Een beheerder kan medewerkers toevoegen en verwijderen. |
| FR-19 | Elke registratie krijgt automatisch een tijdstip. |
| FR-20/21/22/23 | Maandtotalen en jaar-/maandselectie zijn voorzien als uitbreidingspunt voor de databaseversie. |

## 3. Gebruikersflows

### Medewerker

1. Open de website.
2. Zoek een naam.
3. Klik op de `+`-knop.
4. Bekijk de bijgewerkte teller en bevestigingsmelding.

### Beheerder

1. Klik op `Admin login`.
2. Vul e-mailadres en wachtwoord in.
3. Bekijk registraties of open `Medewerkers`.
4. Filter, corrigeer, voeg toe, verwijder of exporteer gegevens.
5. Sluit het venster met `×` of beëindig de sessie met `Uitloggen`.

## 4. Wireframes

### 4.1 Low-fidelity wireframe

De low-fidelity versie toont alleen structuur en inhoud, zonder kleuren of visuele details.

```text
+------------------------------------------------------+
| TVB Blikjesregistratie                 [Admin login] |
+------------------------------------------------------+
| Vandaag: [datum]                                     |
| Wie heeft er vandaag een blikje gepakt?              |
|------------------------------------------------------|
| Medewerkers                         | Statistieken  |
| [ Zoek medewerker................ ] | Vandaag:  12  |
| [Naam medewerker................ +] | Deze maand: 30|
| [Naam medewerker................ +] | Tip           |
| [Naam medewerker................ +] |               |
+------------------------------------------------------+
| TVB                                  Bewust drinken  |
+------------------------------------------------------+
```

### 4.2 Mid-fidelity wireframe

De mid-fidelity versie voegt groepering, knoppen, witruimte en prioriteit toe.

```text
+------------------------------------------------------+
| [TVB] Blikjesregistratie       Systeem actief [ A ]  |
+------------------------------------------------------+
| Vandaag · 4 september 2026                           |
| Wie heeft er vandaag                                |
| een blikje gepakt?                                   |
| Registreer je blikje snel.                           |
+------------------------------------------------------+
| Medewerkers                              8 totaal   |
| [⌕ Zoek op voor- of achternaam...       ⌘ K]         |
|                                                      |
| [avatar] Mark Jansen                    [ + ]        |
|          0 blikjes gepakt                             |
| [avatar] Sophie de Boer                 [ + ]        |
|          3 blikjes gepakt                             |
+------------------------------+-----------------------+
| Vandaag gepakt: 5            | Deze maand: 5         |
| Goed bezig! Elke registratie helpt                  |
+------------------------------+-----------------------+
```

### 4.3 High-fidelity wireframe

De high-fidelity versie is de gerealiseerde interface met TVB-kleuren, afgeronde kaarten, typografie, iconen, hover states, toastmeldingen en responsive gedrag.

```text
+------------------------------------------------------+
| [TVB] Blikjesregistratie       Systeem actief  [ A ] |
+------------------------------------------------------+
|                  DONKERBLAUWE HERO                  |
| Vandaag · 4 september 2026                           |
| Wie heeft er vandaag een blikje gepakt?              |
| Registreer je blikje snel.             [♻ decoratie] |
+----------------------------------+-------------------+
| Medewerkers       [8 totaal]     | [▣] Vandaag       |
| [⌕ Zoek................. ⌘ K]     |     5 blikjes     |
| Mark Jansen                 [ + ]| [◷] Deze maand    |
| 0 blikjes gepakt                 |     5 blikjes     |
| Sophie de Boer              [ + ]| [✦] Goed bezig!  |
| 3 blikjes gepakt                 |                   |
+----------------------------------+-------------------+
```

## 5. Toelichting op designerkeuzes

| Keuze | Toelichting | Nielsen-heuristiek |
|---|---|---|
| Eén duidelijke `+`-knop per medewerker | De belangrijkste actie is direct zichtbaar en vereist geen extra scherm. | H2 Visibility of system status; H6 Recognition rather than recall |
| Zoekbalk boven de lijst | Bij veel medewerkers is zoeken sneller dan scrollen. | H6 Recognition rather than recall; H7 Flexibility and efficiency of use |
| Groen en blauw als hoofdpalet | Sluit aan op de organisatie en geeft groen een positieve actiebetekenis. | H4 Consistency and standards |
| Teller naast iedere naam | De gebruiker ziet direct het actuele resultaat. | H1 Visibility of system status |
| Toast na opslaan | Geeft onmiddellijk feedback dat de registratie is verwerkt. | H1 Visibility of system status |
| Admin in een aparte modal | Beheerfuncties blijven uit beeld voor gewone gebruikers. | H8 Aesthetic and minimalist design |
| Afzonderlijke `×` en `Uitloggen` | Sluiten en uitloggen zijn verschillende acties en staan niet bij elkaar als één onduidelijke bediening. | H3 User control and freedom; H5 Error prevention |
| Admin-correctie per medewerker | De beheerder zoekt eerst de medewerker en corrigeert daarna gericht. | H5 Error prevention; H6 Recognition rather than recall |
| Alleen de laatste registratie verwijderen | Voorkomt dat per ongeluk een willekeurige historische registratie wordt verwijderd. | H5 Error prevention |
| Responsive kaarten en gestapelde mobiele layout | De kernactie blijft bruikbaar op kleinere schermen. | H7 Flexibility and efficiency of use |
| Nederlandstalige labels | Sluit aan bij de gebruikers en vermindert interpretatiefouten. | H4 Consistency and standards |
| Historische registraties behouden als `Verwijderd` | Administratieve informatie gaat niet verloren na vertrek van een medewerker. | H1 Visibility of system status; H9 Help users recognize, diagnose, and recover from errors |

## 6. Nielsen-heuristieken

1. **Visibility of system status:** totalen, datum en toastmelding tonen de actuele status.
2. **Match between system and the real world:** termen als “gepakt”, “medewerker” en “blikjes” sluiten aan bij de praktijk.
3. **User control and freedom:** de modal kan worden gesloten zonder automatisch uit te loggen.
4. **Consistency and standards:** vaste kleuren, knoppen en Nederlandse labels worden hergebruikt.
5. **Error prevention:** gerichte correcties en gescheiden sluit-/uitlogacties voorkomen fouten.
6. **Recognition rather than recall:** namen, totalen en filters blijven zichtbaar.
7. **Flexibility and efficiency of use:** zoeken, filters en `Ctrl/Cmd + K` versnellen gebruik.
8. **Aesthetic and minimalist design:** de frontpage toont alleen de noodzakelijke registratie-informatie.
9. **Help users recognize, diagnose, and recover from errors:** lege zoekresultaten en opslagfouten krijgen een duidelijke melding.
10. **Help and documentation:** deze FO, de technische documentatie en de inline code-comments helpen gebruikers en ontwikkelaars.

## 7. Acceptatiecriteria

- Een medewerker kan binnen enkele seconden een naam zoeken.
- Eén klik op `+` verhoogt het aantal met precies één.
- De datum en tijd worden automatisch opgeslagen.
- Een mislukte opslag toont een foutmelding en draait de wijziging terug.
- Een beheerder kan een medewerker zoeken voordat een correctie wordt uitgevoerd.
- Oude registraties blijven zichtbaar wanneer een medewerker is verwijderd.
- De Excel-export bevat registratiegegevens, totalen en prijsinformatie.
- De interface blijft bruikbaar op desktop en mobiel.

## 8. Huidige scope en vervolgstappen

De huidige versie is een frontend-demo. De login is daarom niet beveiligd en `localStorage` is niet gedeeld tussen computers. Voor productie moeten een backend, database, echte authenticatie, rollen, auditlog, server-side validatie en back-ups worden toegevoegd.
