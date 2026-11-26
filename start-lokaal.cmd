@echo off
rem Start de Consumptieregistratie op deze computer, met de server en een eigen database (vereist PHP 8.3 of hoger).
rem De database komt in backend\data\ (staat in .gitignore). Sluit dit venster om te stoppen.
rem
rem De eerste keer: maak eerst een beheerder aan met
rem   set CR_DB_DSN=sqlite:%~dp0backend\data\consumptie.sqlite
rem   php backend\bin\beheerder.php jouw@adres.nl
cd /d "%~dp0"
if not exist "backend\data" mkdir "backend\data"
set CR_DB_DSN=sqlite:%~dp0backend\data\consumptie.sqlite
start "" "http://127.0.0.1:8080/"
php -S 127.0.0.1:8080 backend\dev-server.php
