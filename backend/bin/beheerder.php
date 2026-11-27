<?php

declare(strict_types=1);

// Maakt een beheerder aan of zet een nieuw wachtwoord.
//
// Gebruik (vanuit de projectmap, of in de container vanuit /var/www):
//   php backend/bin/beheerder.php <gebruikersnaam>           nieuwe beheerder, vraagt om het wachtwoord
//   php backend/bin/beheerder.php <gebruikersnaam> --reset   nieuw wachtwoord voor een bestaande beheerder
//   php backend/bin/beheerder.php --uit-omgeving             maakt de beheerder uit CR_BEHEER_NAAM en
//                                                         CR_BEHEER_WACHTWOORD als die nog niet bestaat
//                                                         (dit doet de container bij het starten)
//   php backend/bin/beheerder.php --heeft-beheerder          stopt met 0 als er een beheerder is, 1 als
//                                                         er nog geen is en 2 als de database niet werkt
//                                                         (gebruikt door start-lokaal.cmd)
//
// Het wachtwoord staat nooit op de opdrachtregel (daar is het voor anderen op de server te zien) en
// komt nooit in de uitvoer. Het wordt gevraagd, of het komt uit CR_BEHEER_WACHTWOORD.
// De database komt uit CR_DB_DSN. Zonder CR_DB_DSN is dat in de container sqlite:/data/consumptie.sqlite,
// en op een eigen computer (zonder map /data) backend/data/consumptie.sqlite, net als bij
// start-lokaal.cmd en backend/dev-server.php. Zo werkt dit ook in PowerShell zonder iets in te stellen.

use Tvb\Consumptie\Server\Auth;
use Tvb\Consumptie\Server\Database;

// Alleen vanaf de opdrachtregel. Zo kan dit bestand nooit via een webserver worden gestart.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

require dirname(__DIR__) . '/autoload.php';

$arguments = array_slice($argv, 1);
$fromEnvironment = in_array('--uit-omgeving', $arguments, true);
$reset = in_array('--reset', $arguments, true);
$names = array_values(array_filter($arguments, static fn (string $argument): bool => !str_starts_with($argument, '--')));

$username = $fromEnvironment ? trim((string) getenv('CR_BEHEER_NAAM')) : ($names[0] ?? '');
$password = (string) getenv('CR_BEHEER_WACHTWOORD');

// Op een eigen computer zonder CR_DB_DSN: dezelfde database als start-lokaal.cmd.
if (trim((string) getenv('CR_DB_DSN')) === '' && !is_dir('/data')) {
    putenv('CR_DB_DSN=sqlite:' . dirname(__DIR__) . '/data/consumptie.sqlite');
}

$openDatabase = static function (): Auth {
    try {
        return new Auth(Database::fromEnvironment());
    } catch (Throwable $error) {
        // Bij SQLite noemt de melding alleen het pad van het bestand (geen gebruikersnaam of wachtwoord).
        $dsn = trim((string) getenv('CR_DB_DSN'));
        $detail = str_starts_with($dsn, 'sqlite:') ? sprintf(': %s (%s)', $error->getMessage(), $dsn) : sprintf(' (%s)', $error::class);
        fwrite(STDERR, 'De database is niet bereikbaar' . $detail . ". Controleer CR_DB_DSN.\n");
        exit(2);
    }
};

if (in_array('--heeft-beheerder', $arguments, true)) {
    exit($openDatabase()->adminCount() > 0 ? 0 : 1);
}

if ($username === '') {
    if ($fromEnvironment) {
        fwrite(STDERR, "Geen beheerder aangemaakt: CR_BEHEER_NAAM is niet ingesteld.\n");
        exit(0);
    }
    fwrite(STDERR, "Gebruik: php backend/bin/beheerder.php <gebruikersnaam> [--reset]\n");
    exit(2);
}

$auth = $openDatabase();

if ($fromEnvironment && $auth->adminExists($username)) {
    echo "De beheerder bestaat al. Er is niets gewijzigd.\n";
    exit(0);
}

if ($password === '') {
    if ($fromEnvironment) {
        fwrite(STDERR, "Geen beheerder aangemaakt: CR_BEHEER_WACHTWOORD is niet ingesteld.\n");
        exit(0);
    }
    fwrite(STDOUT, 'Wachtwoord (minstens ' . Auth::MIN_PASSWORD_LENGTH . ' tekens, wordt op sommige schermen getoond tijdens het typen): ');
    $password = rtrim((string) fgets(STDIN), "\r\n");
}

$now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
$problem = $reset ? $auth->setPassword($username, $password) : $auth->createAdmin($username, $password, $now);
if ($problem !== null) {
    fwrite(STDERR, $problem . "\n");
    exit(1);
}

echo $reset ? "Het wachtwoord is gewijzigd. Alle sessies van deze beheerder zijn beëindigd.\n" : "De beheerder is aangemaakt.\n";
