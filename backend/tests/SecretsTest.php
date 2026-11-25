<?php

declare(strict_types=1);

// Tests die bewaken dat er geen geheim in het project terechtkomt: .env.example heeft geen waarden,
// .env staat in .gitignore en in geen enkel bestand van het project staat een token.
//
// Deze tests lezen het bestand .env zelf nooit. Daar hoort het echte token in te staan.

const PROJECT_ROOT = __DIR__ . '/../..';

test('Geheimen: .env.example bevat AFAS_TOKEN, AFAS_BASE_URL en AFAS_CONNECTOR zonder waarde', function (): void {
    $lines = array_values(array_filter(
        array_map('trim', file(PROJECT_ROOT . '/.env.example', FILE_IGNORE_NEW_LINES) ?: []),
        static fn (string $line): bool => $line !== '' && !str_starts_with($line, '#')
    ));

    same(['AFAS_TOKEN=', 'AFAS_BASE_URL=', 'AFAS_CONNECTOR='], $lines);
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
