<?php

declare(strict_types=1);

// Tests die bewaken dat er geen geheim in het project terechtkomt: .env.example heeft geen waarden,
// .env staat in .gitignore en in geen enkel bestand van het project staat een token.
//
// Deze tests lezen het bestand .env zelf nooit. Daar hoort het echte token in te staan.

const PROJECT_ROOT = __DIR__ . '/../..';

test('Geheimen: .env.example bevat alleen de namen van de instellingen, zonder waarde', function (): void {
    $lines = array_values(array_filter(
        array_map('trim', file(PROJECT_ROOT . '/.env.example', FILE_IGNORE_NEW_LINES) ?: []),
        static fn (string $line): bool => $line !== '' && !str_starts_with($line, '#')
    ));

    same(
        ['AFAS_TOKEN=', 'AFAS_BASE_URL=', 'AFAS_CONNECTOR=', 'CR_BEHEER_EMAIL=', 'CR_BEHEER_WACHTWOORD=', 'CR_DB_DSN=', 'CR_DB_GEBRUIKER=', 'CR_DB_WACHTWOORD='],
        $lines
    );
});

test('Geheimen: .env staat in .dockerignore en de container kopieert alleen de website en de backend', function (): void {
    $ignored = array_map('trim', file(PROJECT_ROOT . '/.dockerignore', FILE_IGNORE_NEW_LINES) ?: []);
    foreach (['.env', '.env.*', '**/.env', '.git', 'backend/tests', 'backend/data', 'docs'] as $entry) {
        ok(in_array($entry, $ignored, true), "$entry staat niet in .dockerignore");
    }

    // Geen "COPY . ...": dan zou alles uit de projectmap in de container komen. Iedere COPY noemt
    // precies wat er mee mag.
    preg_match_all('/^COPY\s+(\S+)\s+\S+$/m', (string) file_get_contents(PROJECT_ROOT . '/Dockerfile'), $copies);
    $sources = $copies[1];
    sort($sources);
    same(
        ['assets/', 'backend/autoload.php', 'backend/bin/', 'backend/public/index.php', 'backend/src/', 'docker/apache.conf', 'docker/deployment.js', 'docker/php.ini', 'docker/start.sh', 'index.html'],
        $sources
    );
});

test('Geheimen: in de Docker-bestanden staat geen waarde van een geheim, alleen de naam van de instelling', function (): void {
    $compose = (string) file_get_contents(PROJECT_ROOT . '/docker-compose.yml');
    foreach (['AFAS_TOKEN', 'AFAS_BASE_URL', 'AFAS_CONNECTOR', 'CR_DB_WACHTWOORD', 'CR_DB_GEBRUIKER', 'CR_BEHEER_EMAIL'] as $name) {
        ok(str_contains($compose, "- $name=\${" . $name . ':-}'), "$name heeft een vaste waarde in docker-compose.yml");
    }
    ok(str_contains($compose, '- CR_BEHEER_WACHTWOORD=${SERVICE_PASSWORD_BEHEER}'), 'het wachtwoord van de beheerder komt niet van Coolify');
    ok(preg_match('/^\s*ports:/m', $compose) !== 1, 'de container is zonder HTTPS bereikbaar via een eigen poort');

    foreach (['Dockerfile', 'docker/start.sh', 'docker/apache.conf', 'docker/php.ini'] as $file) {
        $text = (string) file_get_contents(PROJECT_ROOT . '/' . $file);
        ok(preg_match('/(AFAS_TOKEN|WACHTWOORD)\s*=\s*["\']?[A-Za-z0-9+\/]{8,}/', $text) !== 1, "$file bevat een waarde van een geheim");
    }
    // Het startscript toont nooit een wachtwoord of token.
    ok(preg_match('/echo[^\n]*\$\{?(CR_BEHEER_WACHTWOORD|AFAS_TOKEN|CR_DB_WACHTWOORD)/', (string) file_get_contents(PROJECT_ROOT . '/docker/start.sh')) !== 1);
});

test('Geheimen: .env staat in .gitignore, en .env.example niet', function (): void {
    $ignored = array_map('trim', file(PROJECT_ROOT . '/.gitignore', FILE_IGNORE_NEW_LINES) ?: []);

    ok(in_array('.env', $ignored, true), '.env staat niet in .gitignore');
    ok(in_array('.env.*', $ignored, true), '.env.* staat niet in .gitignore');
    ok(in_array('!.env.example', $ignored, true), '.env.example mag wel in Git');
});

test('Geheimen: Git houdt .env niet bij', function (): void {
    if (!is_dir(PROJECT_ROOT . '/.git') || !function_exists('exec')) {
        skip('geen Git-map of exec is niet beschikbaar');
    }
    exec('git -C ' . escapeshellarg(PROJECT_ROOT) . ' ls-files -- .env 2>&1', $tracked, $code);
    if ($code !== 0) {
        skip('git is niet beschikbaar');
    }

    same([], $tracked, '.env staat in Git');
});

test('Geheimen: in geen enkel bestand van het project staat een token van AFAS', function (): void {
    // Een token van AFAS is de Base64-versie van "<token>…". Die begint altijd met dezelfde tekens.
    // Het begin wordt hier berekend en staat dus zelf niet als vaste tekst in dit bestand.
    $needle = substr(base64_encode('<token>'), 0, 8);
    $skipDirectories = ['.git', 'node_modules', 'vendor', 'test-results', 'archief'];
    $extensions = ['php', 'js', 'mjs', 'cjs', 'json', 'md', 'html', 'css', 'yml', 'yaml', 'sql', 'ps1', 'txt', 'example', 'svg'];

    $found = [];
    $walk = static function (string $directory) use (&$walk, &$found, $needle, $skipDirectories, $extensions): void {
        foreach (scandir($directory) ?: [] as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $path = $directory . '/' . $name;
            if (is_dir($path)) {
                if (!in_array($name, $skipDirectories, true)) {
                    $walk($path);
                }
                continue;
            }
            // Het bestand .env (en varianten zoals .env.local) wordt nooit gelezen.
            if (str_starts_with($name, '.env') && $name !== '.env.example') {
                continue;
            }
            if (!in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), $extensions, true) || filesize($path) > 5_000_000) {
                continue;
            }
            if (str_contains((string) file_get_contents($path), $needle)) {
                $found[] = $path;
            }
        }
    };
    $walk(realpath(PROJECT_ROOT));

    same([], $found, 'in deze bestanden staat een token');
});
