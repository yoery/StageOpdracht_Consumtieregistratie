#!/bin/sh
# Start de container: zet de database en de eerste beheerder klaar en start Apache.
#
# Instellingen (in Coolify: Environment Variables):
#   CR_BEHEER_EMAIL + CR_BEHEER_WACHTWOORD   de eerste beheerder. Die wordt alleen aangemaakt als hij
#                                            nog niet bestaat. Het wachtwoord heeft minstens 12 tekens.
#   CR_DB_DSN, CR_DB_GEBRUIKER, CR_DB_WACHTWOORD   de database (standaard SQLite in /data)
#   AFAS_TOKEN, AFAS_BASE_URL, AFAS_CONNECTOR      de koppeling met AFAS
#
# Dit script toont nooit een wachtwoord of token.
set -e

DATA="${CR_DATA_MAP:-/data}"
mkdir -p "$DATA"

# Een nieuw volume is van root. Apache (www-data) moet de database kunnen schrijven.
chown -R www-data:www-data "$DATA" 2>/dev/null || true
if [ "$(stat -c %d "$DATA" 2>/dev/null)" = "$(stat -c %d / 2>/dev/null)" ]; then
  echo "Consumptieregistratie: LET OP - $DATA is geen volume. De database verdwijnt bij een nieuwe deploy. Koppel een volume aan $DATA." >&2
fi

# De eerste beheerder, als gebruiker www-data zodat het databasebestand van Apache blijft.
su -s /bin/sh www-data -c "php /var/www/backend/bin/beheerder.php --uit-omgeving" || \
  echo "Consumptieregistratie: de beheerder kon niet worden aangemaakt. Controleer CR_BEHEER_EMAIL en CR_BEHEER_WACHTWOORD." >&2

if [ -z "$AFAS_TOKEN" ] || [ -z "$AFAS_BASE_URL" ] || [ -z "$AFAS_CONNECTOR" ]; then
  echo "Consumptieregistratie: de koppeling met AFAS is niet (volledig) ingesteld. Synchroniseren werkt pas met AFAS_TOKEN, AFAS_BASE_URL en AFAS_CONNECTOR."
fi

[ -n "$CR_TEST" ] && exit 0  # alleen voor de test van dit script
exec apache2-foreground
