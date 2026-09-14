# Functioneel Ontwerp - Blikjesregistratie TVB

**Versie:** 2.0
**Datum:** 7 september 2026
**Status:** frontend-demo

## 1. Inleiding

### Doel van het systeem

Met deze website kunnen medewerkers aangeven wanneer zij een blikje pakken. De beheerder kan de registraties bekijken, aanpassen en naar Excel exporteren.

### Aanleiding van het project

Eerst werden de blikjes op papier bijgehouden. Dat kostte tijd. Ook konden formulieren onduidelijk zijn of verkeerd worden overgenomen. Daarom is een digitale oplossing gemaakt.

### Scope

In deze demo kunnen gebruikers:

- medewerkers zoeken;
- een blikje registreren;
- aantallen bekijken;
- registraties beheren;
- medewerkers beheren;
- verschillende producten en prijzen beheren;
- gegevens naar Excel exporteren.

Een echte gedeelde database en echte login zijn nog niet onderdeel van deze demo.

## 2. Huidige situatie

- De registratie gebeurt op papier.
- Elke week wordt een nieuw formulier gebruikt.
- De administratie moet alles handmatig verwerken.
- Dit kost extra tijd.
- Handgeschreven tekst kan moeilijk te lezen zijn.
- Er kunnen fouten ontstaan bij het overnemen.
- Oude gegevens zijn niet makkelijk terug te vinden.

## 3. Gewenste situatie

- Medewerkers registreren hun blikje op de website.
- Met de zoekbalk kunnen zij hun naam vinden.
- Met de `+`-knop komt er één blikje bij.
- De registratie wordt meteen opgeslagen.
- Het totaal wordt direct aangepast.
- Een beheerder kan fouten herstellen.
- De gegevens kunnen naar Excel worden geëxporteerd.
- Ook cateringproducten zoals melk, beleg en brood kunnen worden geregistreerd.

## 4. Gebruikersrollen

### Medewerker

Een medewerker kan:

- de lijst met medewerkers bekijken;
- zoeken op voornaam en achternaam;
- een eigen blikje registreren;
- meerdere producten kiezen met plusknoppen en deze met één knop registreren;
- de aantallen bekijken.

Een medewerker kan zelf geen blikje verwijderen.

### Beheerder/Admin

Een beheerder kan:

- inloggen;
- alle registraties bekijken;
- filteren op medewerker en maand;
- registraties corrigeren;
- medewerkers toevoegen en verwijderen;
- medewerkers wijzigen en actief of inactief zetten;
- productsoorten en prijzen beheren;
- een logboek van wijzigingen bekijken;
- een Excelbestand maken;
- uitloggen.

## 5. Functionele eisen (FR)

| ID | Eis |
|---|---|
| FR-01 | Het systeem toont alle actieve medewerkers. |
| FR-02 | De gebruiker kan zoeken op voornaam en achternaam. |
| FR-03 | De gebruiker kan met `+` één blikje toevoegen. |
| FR-04 | Een medewerker kan zelf geen registratie verlagen. |
| FR-05 | Een nieuwe registratie wordt meteen opgeslagen. |
| FR-06 | Het aantal blikjes wordt per medewerker getoond. |
| FR-07 | De datum wordt automatisch opgeslagen. |
| FR-08 | Het tijdstip wordt automatisch opgeslagen. |
| FR-09 | Een beheerder kan inloggen. |
| FR-10 | Een beheerder kan alle registraties bekijken. |
| FR-11 | Een beheerder kan filteren op medewerker. |
| FR-12 | Een beheerder kan filteren op maand. |
| FR-13 | Een beheerder kan een blikje toevoegen. |
| FR-14 | Een beheerder kan de laatste registratie verwijderen. |
| FR-15 | Een beheerder kan een medewerker toevoegen. |
| FR-16 | Een beheerder kan een medewerker verwijderen. |
| FR-17 | Oude registraties blijven bestaan na het verwijderen van een medewerker. |
| FR-18 | Een beheerder kan een `.xlsx`-bestand exporteren. |
| FR-19 | De export bevat de medewerker, het aantal, de prijs en de datum. |
| FR-20 | De export bevat totalen per medewerker. |
| FR-21 | De export bevat het totaal van de gekozen periode. |
| FR-22 | De prijs per blikje is €0,65. |
| FR-23 | De beheerder kan looncode, personeelsnummer en werkgevernummer beheren. |
| FR-24 | De beheerder kan productsoorten en prijzen beheren. |
| FR-25 | De standaardproducten zijn blikje, melk, beleg en brood. |
| FR-26 | Sneetje brood en boter kosten €0,10, zoet beleg en glas melk kosten €0,20, beleg, ei en yoghurt kosten €0,50. |
| FR-27 | Het systeem houdt een logboek bij van administratieve wijzigingen. |
| FR-28 | De Excel-export gebruikt de kolomvolgorde Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs. |
| FR-29 | Medewerkers zien geen persoonlijk aantal of persoonlijk totaalbedrag. |
| FR-30 | Het systeem groepeert medewerkers per bedrijf en biedt een filter om één bedrijf te bekijken. |
| FR-30 | Een medewerker kan op de eigen medewerkerkaart klikken en een product kiezen. |

## 6. Niet-functionele eisen (NFR)

| Onderdeel | Eis |
|---|---|
| Gebruiksgemak | Een medewerker moet zonder uitleg een blikje kunnen registreren. |
| Snelheid | Een registratie moet binnen 5 seconden kunnen worden gedaan. |
| Laadtijd | De pagina hoort binnen 3 seconden te laden. |
| Browser | De website werkt in recente Edge-, Chrome- en Firefox-versies. |
| Mobiel gebruik | De website werkt op een computer, tablet en telefoon. |
| Gegevens bewaren | Gegevens blijven in dezelfde browser bewaard. |
| Fouten | Bij een opslagfout krijgt de gebruiker een duidelijke melding. |
| Toegankelijkheid | Knoppen hebben duidelijke namen en labels. |

## 7. Use Cases

### Product registreren

**Actor:** Medewerker

1. De medewerker opent de website.
2. De medewerker zoekt zijn of haar naam.
3. De medewerker kiest een product.
4. De medewerker klikt op `+`.
5. Het aantal gaat met één omhoog.
6. Datum en tijd worden opgeslagen.
7. De nieuwe registratie wordt bewaard.
8. De website toont een bevestiging.

### Registratie corrigeren

**Actor:** Beheerder

1. De beheerder klikt op `Admin login`.
2. De beheerder logt in.
3. De beheerder zoekt de medewerker.
4. De beheerder kiest een product.
5. De beheerder klikt op `+` of `−`.
6. Het overzicht en het logboek worden aangepast.

### Medewerker beheren

**Actor:** Beheerder

1. De beheerder opent het tabblad `Medewerkers`.
2. De beheerder vult de medewerkergegevens in of zoekt een bestaande medewerker.
3. De beheerder voegt de medewerker toe of wijzigt de gegevens.
4. De beheerder zet de medewerker actief of inactief.
5. Oude registraties blijven voor de administratie bewaard.

### Excel-export maken

**Actor:** Beheerder

1. De beheerder kiest eventueel een medewerker en maand.
2. De beheerder klikt op `Excel exporteren`.
3. De website maakt een overzicht met de vaste kolomvolgorde en totalen.
4. Het Excelbestand wordt gedownload.

## 8. Procesbeschrijving

```text
Gebruiker
    ↓
Webbrowser
    ↓
Webapplicatie
    ↓
localStorage
    ↓
Excel-export
```

### Een blikje registreren

1. De gebruiker kiest een medewerker.
2. De gebruiker kiest een product en klikt op `+`.
3. JavaScript maakt een registratie met product en aantal `1`.
4. De datum en tijd worden automatisch toegevoegd.
5. De gegevens worden opgeslagen.
6. De teller en kosten worden vernieuwd.
7. De gebruiker krijgt een melding.

## 9. Wireframes

### Low-fidelity wireframe

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
+------------------------------------------------------+
```

Bij deze versie gaat het vooral om de grote indeling van het scherm.

### Mid-fidelity wireframe

```text
+------------------------------------------------------+
| [TVB] Blikjesregistratie       Systeem actief [ A ]  |
+------------------------------------------------------+
| Vandaag · datum                                      |
| Medewerkers                              8 totaal   |
| [ Zoek op voor- of achternaam... ]                   |
| [avatar] Mark Jansen                    [ + ]        |
|          0 blikjes gepakt                             |
| [avatar] Sophie de Boer                 [ + ]        |
|          3 blikjes gepakt                             |
+------------------------------+-----------------------+
| Vandaag gepakt: 5            | Deze maand: 5         |
+------------------------------+-----------------------+
```

Hier zijn de kaarten, knoppen en informatie al duidelijker uitgewerkt.

### High-fidelity wireframe

De high-fidelity versie is de uiteindelijke website. Deze heeft:

- de groene en blauwe kleuren van TVB;
- afgeronde kaarten;
- duidelijke teksten;
- avatars en iconen;
- hover-effecten;
- meldingen na een actie;
- een mobiele indeling;
- een aparte admin-modal.

### Ontwerpkeuzes en Nielsen-heuristieken

- De melding na het registreren laat zien wat er is gebeurd. Dit past bij **zichtbaarheid van de systeemstatus**.
- De zoekbalk voorkomt dat de gebruiker alle namen moet onthouden. Dit past bij **herkenning in plaats van onthouden**.
- De knoppen en kleuren zijn steeds hetzelfde. Dit past bij **consistentie en standaarden**.
- De losse knoppen voor sluiten en uitloggen geven de gebruiker controle. Dit past bij **gebruikerscontrole en vrijheid**.
- Een medewerker kan zelf niet verlagen. Dit helpt om fouten te voorkomen en past bij **foutpreventie**.
- De website werkt op verschillende schermen. Dit past bij **flexibiliteit en efficiënt gebruik**.
- Oude registraties blijven zichtbaar als `Verwijderd`. Hierdoor kan de gebruiker beter zien wat er met oude gegevens is gebeurd.

## 10. Acceptatiecriteria

| Nr. | Test | Verwacht resultaat |
|---|---|---|
| AC-01 | Medewerker zoeken | De juiste medewerker wordt getoond. |
| AC-02 | Blikje toevoegen | Het aantal wordt één hoger. |
| AC-03 | Pagina opnieuw laden | De registratie bestaat nog. |
| AC-04 | Datum en tijd controleren | Datum en tijd zijn opgeslagen. |
| AC-05 | Medewerker bekijken | Een medewerker ziet geen `−`-knop. |
| AC-06 | Admin-login gebruiken | Het admin-dashboard wordt geopend. |
| AC-07 | Correctie uitvoeren | Alleen de gekozen medewerker verandert. |
| AC-08 | Filter gebruiken | Alleen de gekozen gegevens worden getoond. |
| AC-09 | Medewerker toevoegen | De nieuwe medewerker verschijnt in de lijst. |
| AC-10 | Medewerker verwijderen | De medewerker verdwijnt, maar de historie blijft. |
| AC-11 | Excel-export maken | Er wordt een Excelbestand gedownload. |
| AC-12 | Export openen | Medewerker, aantal, datum en prijs staan erin. |
| AC-13 | Opslagfout testen | De wijziging wordt teruggedraaid en er verschijnt een melding. |
| AC-14 | Mobiel scherm testen | De website blijft goed bruikbaar. |
| AC-15 | Cateringproduct registreren | Melk, beleg of brood wordt met de juiste prijs opgeslagen. |
| AC-16 | Medewerker wijzigen | De gewijzigde medewerkergegevens worden bewaard. |
| AC-17 | Medewerker inactief maken | De medewerker verdwijnt uit de openbare lijst, maar historie blijft bestaan. |
| AC-18 | Exportkolommen controleren | De acht afgesproken kolommen staan in de juiste volgorde. |
