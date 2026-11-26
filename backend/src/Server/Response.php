<?php

declare(strict_types=1);

namespace Tvb\Consumptie\Server;

/**
 * Response — het antwoord van de API: een statuscode, een inhoud (wordt JSON) en de cookies die
 * gezet of gewist moeten worden.
 *
 * Een cookie met een lege waarde wordt gewist. Iedere cookie is HttpOnly (JavaScript kan er niet
 * bij), SameSite=Strict (een andere website kan hem niet meesturen) en Secure als het verzoek via
 * HTTPS kwam.
 */
final class Response
{
    /** @var list<array{name: string, value: string, maxAge: int}> */
    public array $cookies = [];

    /** @param array<string, mixed> $body */
    public function __construct(public readonly int $status, public readonly array $body)
    {
    }

    /** @param array<string, mixed> $body */
    public static function ok(array $body = []): self
    {
        return new self(200, ['ok' => true] + $body);
    }

    public static function error(int $status, string $message): self
    {
        return new self($status, ['ok' => false, 'message' => $message]);
    }

    public function withCookie(string $name, #[\SensitiveParameter] string $value, int $maxAge): self
    {
        $this->cookies[] = ['name' => $name, 'value' => $value, 'maxAge' => $maxAge];

        return $this;
    }

    public function withoutCookie(string $name): self
    {
        return $this->withCookie($name, '', 0);
    }

    /** Stuurt het antwoord naar de browser. */
    public function send(bool $secure): void
    {
        http_response_code($this->status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        foreach ($this->cookies as $cookie) {
            setcookie($cookie['name'], $cookie['value'], [
                'expires' => $cookie['value'] === '' ? 1 : time() + $cookie['maxAge'],
                'path' => '/',
                'secure' => $secure,
                'httponly' => true,
                'samesite' => 'Strict',
            ]);
        }
        echo json_encode($this->body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_PARTIAL_OUTPUT_ON_ERROR);
    }
}
