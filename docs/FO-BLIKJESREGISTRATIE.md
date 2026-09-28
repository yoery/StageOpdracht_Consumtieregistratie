# Functioneel Ontwerp - Blikjesregistratie TVB

**Versie:** 2.0
**Datum:** 7 september 2026
**Status:** frontend-demo

## 1. Inleiding

### Doel van het systeem

Met deze website kunnen medewerkers aangeven wanneer zij een blikje pakken. De beheerder kan de registraties bekijken, aanpassen en naar een CSV-bestand exporteren (te openen in Excel).

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
- gegevens naar CSV exporteren voor de loonadministratie.

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
- De gegevens kunnen naar een CSV-bestand worden geëxporteerd.
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
- bedrijven en consumptiepunten beheren en per punt het aanbod instellen;
- de voorraad per consumptiepunt bijhouden en zien wat bijbesteld moet worden;
- een logboek van wijzigingen bekijken;
- een CSV-bestand maken;
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
| FR-18 | Een beheerder kan een `.csv`-bestand exporteren dat in Excel kan worden geopend. |
| FR-19 | De export bevat de medewerker, het aantal, de prijs en de loonmaand. |
| FR-20 | De export bevat totalen per medewerker. |
| FR-21 | De export bevat geen totaalregel, zodat iedere regel een medewerker is en de loonadministratie het bestand direct kan inlezen. |
| FR-22 | De prijs per blikje is €0,65. |
| FR-23 | De beheerder kan looncode, personeelsnummer en een eventueel afwijkend werkgevernummer per medewerker, en het standaard werkgevernummer per bedrijf beheren. |
| FR-24 | De beheerder kan productsoorten en prijzen beheren. |
| FR-25 | De standaardproducten zijn blikje, melk, beleg en brood. |
| FR-26 | Sneetje brood en boter kosten €0,10, zoet beleg en glas melk kosten €0,20, beleg, ei en yoghurt kosten €0,50. |
| FR-27 | Het systeem houdt een logboek bij van administratieve wijzigingen. |
| FR-28 | De CSV-export gebruikt de kolomvolgorde Jaar, Maand, Looncode, Personeelsnummer, Werkgevernummer, Naam, Totaal en Prijs. |
| FR-29 | Medewerkers zien geen persoonlijk aantal of persoonlijk totaalbedrag. |
| FR-30 | Consumpties worden verwerkt in de loonadministratie van de daaropvolgende maand. Jaar en Maand in de export zijn daarom de loonmaand: consumpties uit september staan bij oktober, consumpties uit december bij januari van het volgende jaar. |
| FR-31 | Het systeem groepeert medewerkers per bedrijf en biedt een filter om één bedrijf te bekijken. |
| FR-32 | Een medewerker kan op de eigen medewerkerkaart klikken en een product kiezen. |
| FR-33 | De beheerder kan bedrijven toevoegen en de naam en het werkgevernummer wijzigen. Standaard zijn de 13 bedrijven van TVB aanwezig. |
| FR-34 | Een bedrijf kan geen, één of meerdere consumptiepunten hebben. De beheerder kan consumptiepunten toevoegen, wijzigen en verwijderen. |
| FR-35 | De beheerder stelt per consumptiepunt in welke producten worden aangeboden (aan/uit per product). |
| FR-36 | Een nieuw product staat bij alle consumptiepunten uit, totdat de beheerder het aanzet. |
| FR-37 | Iedere medewerker is gekoppeld aan een bedrijf en een vast consumptiepunt, en ziet alleen de producten die dat punt aanbiedt. |
| FR-38 | Het systeem houdt per consumptiepunt de voorraad per product bij. Iedere registratie verlaagt de voorraad met 1; een correctie van de beheerder zet het product terug. |
| FR-39 | De beheerder kan leveringen boeken, de getelde voorraad invullen en per product een minimum instellen. |
| FR-40 | Het systeem toont een bijbestellijst met alle aangeboden producten die op zijn of op of onder het minimum zitten. |
| FR-41 | Het werkgevernummer staat standaard bij het bedrijf. Bij een medewerker kan een afwijkend werkgevernummer worden ingevuld (bijvoorbeeld per teamleider); dat gaat in de CSV-export voor op het nummer van het bedrijf. |

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
2. De beheerder vult de medewerkergegevens in, kiest bedrijf en consumptiepunt, of zoekt een bestaande medewerker.
3. De beheerder voegt de medewerker toe of wijzigt de gegevens.
4. De beheerder zet de medewerker actief of inactief.
5. Oude registraties blijven voor de administratie bewaard.

### Consumptiepunt en aanbod instellen

**Actor:** Beheerder

1. De beheerder opent het tabblad `Bedrijven`.
2. De beheerder klikt bij een bedrijf op `+ Consumptiepunt` of bij een bestaand punt op `Aanbod wijzigen`.
3. De beheerder vult de naam in en vinkt de producten aan die op dit punt worden aangeboden.
4. Medewerkers die aan dit punt gekoppeld zijn, zien voortaan alleen deze producten.

### Voorraad bijhouden

**Actor:** Beheerder

1. De beheerder opent het tabblad `Voorraad` en ziet bovenaan wat bijbesteld moet worden.
2. Na een levering vult de beheerder het geleverde aantal in en klikt op `+ Toevoegen`.
3. Na het tellen past de beheerder de voorraad direct aan.
4. De beheerder stelt per product een minimum in; daaronder verschijnt het product in de bijbestellijst.

### CSV-export maken

**Actor:** Beheerder

1. De beheerder kiest eventueel een medewerker en consumptiemaand. Bij iedere maand staat de bijbehorende loonmaand.
2. De beheerder klikt op `CSV exporteren`.
3. De website maakt een overzicht per medewerker per loonmaand met de vaste kolomvolgorde.
4. Het CSV-bestand wordt gedownload en kan in Excel worden geopend.

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
CSV-export
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
| AC-11 | CSV-export maken | Er wordt een CSV-bestand gedownload. |
| AC-12 | Export openen in Excel | Medewerker, aantal, loonmaand en prijs staan in de juiste kolommen. |
| AC-13 | Export van september | Jaar en Maand in de export zijn de loonmaand oktober. |
| AC-14 | Opslagfout testen | De wijziging wordt teruggedraaid en er verschijnt een melding. |
| AC-15 | Mobiel scherm testen | De website blijft goed bruikbaar. |
| AC-16 | Product uitzetten bij een consumptiepunt | Medewerkers van dat punt zien het product niet meer. |
| AC-17 | Nieuw product toevoegen | Het product staat bij alle consumptiepunten uit. |
| AC-18 | Product registreren | De voorraad van het consumptiepunt van de medewerker wordt 1 lager. |
| AC-19 | Voorraad op of onder het minimum | Het product verschijnt in de bijbestellijst. |
| AC-20 | Levering boeken | De voorraad stijgt met het geleverde aantal en de actie staat in het logboek. |
| AC-15 | Cateringproduct registreren | Melk, beleg of brood wordt met de juiste prijs opgeslagen. |
| AC-16 | Medewerker wijzigen | De gewijzigde medewerkergegevens worden bewaard. |
| AC-17 | Medewerker inactief maken | De medewerker verdwijnt uit de openbare lijst, maar historie blijft bestaan. |
| AC-18 | Exportkolommen controleren | De acht afgesproken kolommen staan in de juiste volgorde. |
