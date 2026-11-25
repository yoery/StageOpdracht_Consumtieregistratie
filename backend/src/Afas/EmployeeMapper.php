<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * EmployeeMapper — zet de rijen van de GetConnector om naar medewerkers (AfasEmployee).
 *
 * Verantwoordelijkheid:
 *   - weten hoe de velden in de GetConnector heten. De namen hieronder zijn een voorbeeld: de
 *     AFAS-beheerder van TVB bepaalt ze bij het inrichten van de connector. Wijken ze af, dan gaan de
 *     juiste namen mee in de constructor;
 *   - controleren of de verwachte velden er zijn. Ontbreekt een verplicht veld, dan stopt alles
 *     (de connector is dan anders ingericht dan verwacht);
 *   - iedere waarde controleren met dezelfde regels als de app: nummers bestaan alleen uit cijfers,
 *     een naam is niet leeg en bevat geen stuurtekens. Een rij die niet klopt, wordt afgekeurd met
 *     een reden. De andere rijen gaan door.
 *
 * Alleen deze acht gegevens worden gelezen. Staat er meer in een rij, dan wordt dat genegeerd
 * (dataminimalisatie).
 *
 * Verbonden met:
 *   - AfasClient: levert de rijen;
 *   - EmployeeSync: gebruikt de uitkomst (MappedRows).
 */
final class EmployeeMapper
{
    public const DEFAULT_FIELDS = [
        'personnelNumber' => 'Personeelsnummer',
        'firstName' => 'Voornaam',
        'lastName' => 'Achternaam',
        'prefix' => 'Voorvoegsel',
        'employer' => 'Werkgever',
        'workLocation' => 'Werklocatie',
        'payrollCode' => 'Looncode',
        'endDate' => 'DatumUitDienst',
    ];

    // Deze velden moeten in iedere rij staan. De andere drie (voorvoegsel, werklocatie en datum uit
    // dienst) zijn bij veel medewerkers leeg en mogen daarom ook ontbreken.
    private const REQUIRED = ['personnelNumber', 'firstName', 'lastName', 'employer', 'payrollCode'];

    private const MAX_CODE_LENGTH = 64;
    private const MAX_FIRST_NAME_LENGTH = 100;
    private const MAX_LAST_NAME_LENGTH = 150;

    /** @var array<string, string> */
    private readonly array $fields;

    /**
     * @param array<string, string> $fields afwijkende veldnamen, bijvoorbeeld ['endDate' => 'DatumUit']
     */
    public function __construct(array $fields = [])
    {
        foreach ($fields as $key => $name) {
            if (!isset(self::DEFAULT_FIELDS[$key]) || !is_string($name) || preg_match('/^[A-Za-z0-9_]{1,100}$/', $name) !== 1) {
                throw new AfasException(AfasException::CONFIG, sprintf('Onbekend of ongeldig veld in de instellingen van de koppeling: %s.', (string) $key));
            }
        }
        $this->fields = array_merge(self::DEFAULT_FIELDS, $fields);
    }

    /** De naam van het veld waarop AFAS moet sorteren: het personeelsnummer. */
    public function sortField(): string
    {
        return $this->fields['personnelNumber'];
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
                if (!array_key_exists($this->fields[$key], $row)) {
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

        $payrollCode = $this->text($row, 'payrollCode');
        if (!$this->isCode($payrollCode)) {
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
        $value = $row[$this->fields[$key]] ?? null;
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
