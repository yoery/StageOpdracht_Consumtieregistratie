<?php

declare(strict_types=1);

// Alleen voor ontwikkelen op een eigen computer: de website met de server erbij, zonder Docker.
//
// Gebruik (vanuit de projectmap), of dubbelklik op start-lokaal.cmd:
//   php -S 127.0.0.1:8080 backend/dev-server.php
// Open daarna http://127.0.0.1:8080. De database staat in backend/data/ (die map staat in .gitignore).
//
// Dit bestand levert alleen index.html, de map assets/ en de API uit. Al het andere in de projectmap
// (zoals .env, de tests en de documenten) geeft "niet gevonden". Op de echte server doet Apache dit
// werk (zie docker/apache.conf). Dit bestand gaat niet mee in de container.

if (PHP_SAPI !== 'cli-server') {
    http_response_code(404);
    exit(1);
}

// CR_DEV_ROOT is alleen voor de test van dit bestand: die gebruikt een nagemaakte projectmap.
$testRoot = getenv('CR_DEV_ROOT');
$root = is_string($testRoot) && $testRoot !== '' ? $testRoot : dirname(__DIR__);
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);

if ($path === '/api' || str_starts_with($path, '/api/')) {
    if (getenv('CR_DB_DSN') === false || getenv('CR_DB_DSN') === '') {
        if (!is_dir(__DIR__ . '/data')) {
            mkdir(__DIR__ . '/data', 0700, true);
        }
        putenv('CR_DB_DSN=sqlite:' . __DIR__ . '/data/consumptie.sqlite');
    }
    // De API leest een .env alleen uit deze projectmap (bij de test: de nagemaakte map).
    putenv('CR_PROJECT_MAP=' . $root);
    require __DIR__ . '/public/index.php';

    return true;
}

$types = [
    'html' => 'text/html; charset=utf-8',
    'js' => 'text/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8',
    'json' => 'application/json',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'woff2' => 'font/woff2',
    'bin' => 'application/octet-stream',
    'txt' => 'text/plain; charset=utf-8',
];

if ($path === '/') {
    $path = '/index.html';
}
// De website praat hier met de server, net als in de container.
$file = $path === '/assets/js/deployment.js' ? $root . '/docker/deployment.js' : $root . $path;
$real = realpath($file);
$allowed = $path === '/index.html' || str_starts_with($path, '/assets/');
$inside = $real !== false && (str_starts_with($real, realpath($root . '/assets') . DIRECTORY_SEPARATOR) || $real === realpath($root . '/index.html') || $real === realpath($root . '/docker/deployment.js'));
$extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

if (!$allowed || !$inside || !is_file($real) || !isset($types[$extension]) || str_contains($path, '/.')) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Niet gevonden.';

    return true;
}

header('Content-Type: ' . $types[$extension]);
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
readfile($real);

return true;
