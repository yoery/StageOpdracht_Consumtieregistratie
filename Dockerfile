# Container voor de Consumptieregistratie (Coolify of een andere Docker-host).
# Apache met PHP 8.3 levert de website (index.html en assets/) en de API (/api) vanaf één adres.
# De database is standaard een SQLite-bestand in /data: koppel daar een volume aan
# (docker-compose.yml doet dat).
#
# Geheimen (het AFAS-token, het wachtwoord van de beheerder) staan niet in deze container. Ze komen
# bij het starten uit de omgeving (in Coolify: Environment Variables). Het bestand .env wordt nooit
# meegekopieerd: zie .dockerignore en de lijst met COPY-regels hieronder.
FROM php:8.3-apache

# SQLite zit standaard in PHP. PostgreSQL en MySQL komen erbij voor als TVB later overstapt.
# curl is voor de controle of de container gezond is.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev curl \
 && docker-php-ext-install pdo_mysql pdo_pgsql \
 && rm -rf /var/lib/apt/lists/*

COPY docker/php.ini /usr/local/etc/php/conf.d/consumptieregistratie.ini
COPY docker/apache.conf /etc/apache2/conf-available/consumptieregistratie.conf
RUN a2enmod headers rewrite && a2enconf consumptieregistratie \
# De standaardsite logt met het korte formaat "consumptie" (zie docker/apache.conf) in plaats van
# "combined", zodat er geen vraagteken-deel van het adres, verwijzer of browser in het logboek staat.
 && sed -i 's/ combined$/ consumptie/' /etc/apache2/sites-available/000-default.conf \
 && grep -q ' consumptie$' /etc/apache2/sites-available/000-default.conf

# Alleen wat de webserver mag uitleveren staat in /var/www/html: de pagina, de bestanden van de
# website en het ene PHP-bestand van de API. De rest van de backend staat erbuiten.
COPY index.html /var/www/html/index.html
COPY assets/ /var/www/html/assets/
COPY backend/public/index.php /var/www/html/api/index.php
COPY backend/autoload.php /var/www/backend/autoload.php
COPY backend/src/ /var/www/backend/src/
COPY backend/bin/ /var/www/backend/bin/
# In de container praat de website met de server (zie assets/js/deployment.js).
COPY docker/deployment.js /var/www/html/assets/js/deployment.js
COPY docker/start.sh /usr/local/bin/cr-start

# Regeleinden van Windows weghalen (voor als de repository op Windows is uitgecheckt) en de map
# voor de database klaarzetten.
RUN sed -i 's/\r$//' /usr/local/bin/cr-start && chmod +x /usr/local/bin/cr-start \
 && mkdir -p /data && chown -R www-data:www-data /data

ENV CR_BACKEND_MAP=/var/www/backend \
    CR_DB_DSN=sqlite:/data/consumptie.sqlite
EXPOSE 80

# Gezond = de API antwoordt. Dit adres geeft geen gegevens terug.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost/api/health >/dev/null || exit 1

CMD ["cr-start"]
