<?php

declare(strict_types=1);

// Laadt de classes van de backend zonder extra pakketten: Tvb\Consumptie\Afas\AfasClient staat in
// src/Afas/AfasClient.php. Met Composer of Laravel werkt hetzelfde via composer.json (PSR-4).
spl_autoload_register(static function (string $class): void {
    $prefix = 'Tvb\\Consumptie\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});
