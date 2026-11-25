<?php

declare(strict_types=1);

// Draait alle tests van de backend, zonder extra pakketten.
//
// Gebruik (vanuit de projectmap):  php backend/tests/run.php
//
// Iedere waarschuwing van PHP telt als fout, zodat een verouderde functie of een tikfout opvalt.
// De uitvoer eindigt met het aantal geslaagde, mislukte en overgeslagen tests. Mislukt er een test,
// dan is de afsluitcode 1 (voor de CI).

error_reporting(E_ALL);
set_error_handler(static function (int $level, string $message, string $file, int $line): bool {
    if ((error_reporting() & $level) === 0) {
        return false; // onderdrukt met @
    }
    throw new ErrorException($message, 0, $level, $file, $line);
});

require dirname(__DIR__) . '/autoload.php';
require __DIR__ . '/support.php';

foreach (glob(__DIR__ . '/*Test.php') ?: [] as $file) {
    require $file;
}

$passed = 0;
$failed = 0;
$skipped = 0;
foreach (Tests::$all as [$name, $body]) {
    try {
        $body();
        $passed++;
        echo "ok - $name\n";
    } catch (SkipTest $skip) {
        $skipped++;
        echo "overgeslagen - $name (" . $skip->getMessage() . ")\n";
    } catch (Throwable $error) {
        $failed++;
        echo "NIET OK - $name\n";
        echo '    ' . str_replace("\n", "\n    ", $error::class . ': ' . $error->getMessage()) . "\n";
        echo '    ' . basename($error->getFile()) . ':' . $error->getLine() . "\n";
    }
}

echo "\n# geslaagd $passed\n# mislukt $failed\n# overgeslagen $skipped\n";
exit($failed === 0 ? 0 : 1);
