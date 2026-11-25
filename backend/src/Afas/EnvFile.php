<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Afas;

/**
 * EnvFile — leest een .env-bestand met regels als `NAAM=waarde`.
 *
 * Lege regels en regels die met # beginnen, tellen niet mee. Een waarde mag tussen aanhalingstekens
 * staan. De waarden worden alleen teruggegeven: ze komen niet in de omgeving van PHP (`putenv`,
 * `$_ENV`), zodat een geheim niet via `phpinfo()` of een ander programma zichtbaar wordt.
 *
 * Verbonden met:
 *   - AfasConfig: leest hiermee AFAS_TOKEN en AFAS_BASE_URL.
 */
final class EnvFile
{
    /**
     * Geeft de instellingen uit het bestand terug. Bestaat het bestand niet, dan is de lijst leeg.
     *
     * @return array<string, string>
     */
    public static function read(string $path): array
    {
        if (!is_file($path) || !is_readable($path)) {
            return [];
        }

        $values = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }

            [$name, $value] = explode('=', $line, 2);
            $name = trim($name);
            if (preg_match('/^[A-Z_][A-Z0-9_]*$/', $name) !== 1) {
                continue;
            }
            $values[$name] = self::unquote(trim($value));
        }

        return $values;
    }

    // Haalt één paar aanhalingstekens om een waarde weg: "waarde" of 'waarde'.
    private static function unquote(string $value): string
    {
        $quoted = strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[0] === $value[strlen($value) - 1];

        return $quoted ? substr($value, 1, -1) : $value;
    }
}
