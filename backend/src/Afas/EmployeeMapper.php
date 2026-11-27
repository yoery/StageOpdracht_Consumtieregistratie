<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * EmployeeMapper — zet de rijen van de GetConnector om naar medewerkers (AfasEmployee).
 *
 * Verantwoordelijkheid:
 *   - weten hoe de velden in de GetConnector heten. De namen hieronder zijn die van de GetConnector
 *     die TVB nu heeft. Het werkgevernummer staat daar in `Werkgever_2` (twee cijfers, zoals "01").
 *     Het veld `Werkgever` is de naam van het bedrijf en wordt niet gelezen.
 *     Wijken de namen af, dan gaan de juiste namen mee in de constructor. De looncode, de
 *     werklocatie en de datum uit dienst zitten niet in die connector en staan daarom uit (null). Staat
 *     een veld uit, dan komt dat gegeven niet uit AFAS en blijft het in de app zoals het is;
 *   - controleren of de verwachte velden er zijn. Ontbreekt een verplicht veld, dan stopt alles
 *     (de connector is dan anders ingericht dan verwacht);
 *   - iedere waarde controleren met dezelfde regels als de app: nummers bestaan alleen uit cijfers,
 *     een naam is niet leeg en bevat geen stuurtekens. Een rij die niet klopt, wordt afgekeurd met
 *     een reden. De andere rijen gaan door.
 *
 * Alleen de ingestelde velden worden gelezen. Staat er meer in een rij, dan wordt dat genegeerd
 * (dataminimalisatie).
 *
 * Verbonden met:
 *   - AfasClient: levert de rijen;
 *   - EmployeeSync: gebruikt de uitkomst (MappedRows).
 */
final class EmployeeMapper
{
    public const DEFAULT_FIELDS = [
        'personnelNumber' => 'Medewerker',
        'firstName' => 'Roepnaam',
        'lastName' => 'Achternaam',
        'prefix' => 'Voorvoegsel',
        'employer' => 'Werkgever_2',
        // De werklocatie zit niet in de GetConnector (TVB mag dat veld niet krijgen). De afdeling
        // (organisatorische eenheid) wel: die bepaalt via de beheerder het consumptiepunt (FR-102).
        'workLocation' => 'Organisatorische_Eenheid',
        'payrollCode' => null,
        'endDate' => null,
    ];

    // Deze vier velden moeten altijd zijn ingesteld en in iedere rij staan. De looncode moet in iedere
    // rij staan als hij is ingesteld. Het voorvoegsel, de werklocatie en de datum uit dienst zijn bij
    // veel medewerkers leeg en mogen daarom in een rij ontbreken.
    private const ALWAYS = ['personnelNumber', 'firstName', 'lastName', 'employer'];
    private const REQUIRED = ['personnelNumber', 'firstName', 'lastName', 'employer', 'payrollCode'];

    private const MAX_CODE_LENGTH = 64;
    private const MAX_FIRST_NAME_LENGTH = 100;
    private const MAX_LAST_NAME_LENGTH = 150;

    /** @var array<string, string|null> */
    private readonly array $fields;

    /**
     * @param array<string, string|null> $fields afwijkende veldnamen, bijvoorbeeld
     *                                           ['payrollCode' => 'Looncode']. Met null staat een veld uit.
     */
    public function __construct(array $fields = [])
    {
        foreach ($fields as $key => $name) {
            $valid = $name === null || (is_string($name) && preg_match('/^[A-Za-z0-9_-]{1,100}$/', $name) === 1);
            if (!array_key_exists($key, self::DEFAULT_FIELDS) || !$valid || ($name === null && in_array($key, self::ALWAYS, true))) {
                throw new AfasException(AfasException::CONFIG, sprintf('Onbekend of ongeldig veld in de instellingen van de koppeling: %s.', (string) $key));
            }
        }
        $this->fields = array_merge(self::DEFAULT_FIELDS, $fields);
    }

    /** De naam van het veld waarop AFAS moet sorteren: het personeelsnummer. */
    public function sortField(): string
    {
        return (string) $this->fields['personnelNumber'];
    }

    /**
     * De namen van de velden die de koppeling in de GetConnector verwacht (zonder de velden die uit staan).
     *
     * @return list<string>
     */
    public function fieldNames(): array
    {
        return array_values(array_filter($this->fields, static fn (?string $name): bool => $name !== null));
    }

    /**
     * Zet alle rijen om. Geeft de geldige medewerkers en de afgekeurde rijen terug.
     *
     * @param list<array<string, mixed>> $rows
     */
    public function map(array $rows): MappedRows
    {
        $employees = [];
        $problems = [];
        foreach ($rows as $index => $row) {
            foreach (self::REQUIRED as $key) {
                if ($this->fields[$key] !== null && !array_key_exists($this->fields[$key], $row)) {
                    throw new AfasException(
                        AfasException::FORMAT,
                        sprintf('In het antwoord van AFAS ontbreekt het veld %s (rij %d). Is de GetConnector gewijzigd?', $this->fields[$key], $index + 1)
                    );
                }
            }

            $result = $this->mapRow($row);
            if ($result instanceof AfasEmployee) {
                $employees[] = $result;
            } else {
                $problems[] = ['row' => $index + 1, 'personnelNumber' => $result['personnelNumber'], 'reason' => $result['reason']];
            }
        }

        return new MappedRows($employees, $problems);
    }

    /**
     * Zet één rij om. Geeft de medewerker terug, of het personeelsnummer (als dat geldig is) met de
     * reden waarom de rij is afgekeurd.
     *
     * @param array<string, mixed> $row
     * @return AfasEmployee|array{personnelNumber: string|null, reason: string}
     */
    private function mapRow(array $row): AfasEmployee|array
    {
        $personnelNumber = $this->text($row, 'personnelNumber');
        if (!$this->isCode($personnelNumber)) {
            return ['personnelNumber' => null, 'reason' => 'het personeelsnummer ontbreekt of bestaat niet alleen uit cijfers'];
        }
        $problem = static fn (string $reason): array => ['personnelNumber' => $personnelNumber, 'reason' => $reason];

        $firstName = $this->text($row, 'firstName');
        if (!$this->isName($firstName, self::MAX_FIRST_NAME_LENGTH)) {
            return $problem('de voornaam ontbreekt, is te lang of bevat ongeldige tekens');
        }

        $surname = $this->text($row, 'lastName');
        $prefix = $this->text($row, 'prefix');
        if ($surname === null || $surname === '' || $prefix === null) {
            return $problem('de achternaam ontbreekt of het voorvoegsel is geen tekst');
        }
        $lastName = trim($prefix . ' ' . $surname);
        if (!$this->isName($lastName, self::MAX_LAST_NAME_LENGTH)) {
            return $problem('de achternaam is te lang of bevat ongeldige tekens');
        }

        $employerNumber = $this->text($row, 'employer');
        if (!$this->isCode($employerNumber)) {
            return $problem('de werkgever ontbreekt of bestaat niet alleen uit cijfers');
        }

        // Zit de looncode niet in de GetConnector, dan is hij onbekend (null) en blijft hij in de app.
        $payrollCode = $this->fields['payrollCode'] === null ? null : $this->text($row, 'payrollCode');
        if ($this->fields['payrollCode'] !== null && !$this->isCode($payrollCode)) {
            return $problem('de looncode ontbreekt of bestaat niet alleen uit cijfers');
        }

        $workLocation = $this->text($row, 'workLocation');
        if ($workLocation === null || ($workLocation !== '' && !$this->isName($workLocation, self::MAX_LAST_NAME_LENGTH))) {
            return $problem('de werklocatie is te lang of bevat ongeldige tekens');
        }

        $endDate = $this->date($this->text($row, 'endDate'));
        if ($endDate === false) {
            return $problem('de datum uit dienst is geen geldige datum');
        }

        return new AfasEmployee($personnelNumber, $firstName, $lastName, $employerNumber, $workLocation, $payrollCode, $endDate);
    }

    /**
     * De waarde van een veld als tekst zonder spaties eromheen. Een leeg of ontbrekend veld is "".
     * Een heel getal wordt tekst (AFAS geeft een nummer soms als getal). Iets anders dan tekst of een
     * heel getal geeft null: dat is geen bruikbare waarde.
     *
     * @param array<string, mixed> $row
     */
    private function text(array $row, string $key): ?string
    {
        $value = $this->fields[$key] === null ? null : ($row[$this->fields[$key]] ?? null);
        if ($value === null) {
            return '';
        }
        if (is_int($value)) {
            return (string) $value;
        }

        return is_string($value) ? trim($value) : null;
    }

    // Een nummer (personeelsnummer, werkgever of looncode): alleen cijfers, hooguit 64 tekens.
    private function isCode(?string $value): bool
    {
        return $value !== null && preg_match('/^[0-9]{1,' . self::MAX_CODE_LENGTH . '}$/', $value) === 1;
    }

    // Een naam: niet leeg, niet te lang en zonder stuurtekens zoals tab of enter.
    private function isName(?string $value, int $maxLength): bool
    {
        if ($value === null || $value === '' || preg_match('/[\x00-\x1F\x7F]/', $value) === 1) {
            return false;
        }
        $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);

        return $length <= $maxLength;
    }

    /**
     * De datum uit dienst als "2026-10-31". Leeg geeft null (in dienst). AFAS geeft een datum als
     * "2026-10-31T00:00:00Z": alleen de dag telt. Een datum die niet bestaat, geeft false.
     */
    private function date(?string $value): string|null|false
    {
        if ($value === '') {
            return null;
        }
        if ($value === null || preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/', $value, $match) !== 1) {
            return false;
        }

        return checkdate((int) $match[2], (int) $match[3], (int) $match[1]) ? sprintf('%s-%s-%s', $match[1], $match[2], $match[3]) : false;
    }
}
