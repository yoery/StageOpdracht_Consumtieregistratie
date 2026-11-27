@echo off
rem Start de Consumptieregistratie op deze computer, met de server en een eigen database (vereist PHP 8.3 of hoger).
rem De database komt in backend\data\ (staat in .gitignore). Sluit dit venster om te stoppen.
rem
rem Is er nog geen beheerder, dan vraagt dit script eerst een gebruikersnaam en een wachtwoord.
rem Later een nieuw wachtwoord: php backend\bin\beheerder.php <gebruikersnaam> --reset
cd /d "%~dp0"
if not exist "backend\data" mkdir "backend\data"
set "CR_DB_DSN=sqlite:%~dp0backend\data\consumptie.sqlite"

php backend\bin\beheerder.php --heeft-beheerder
if errorlevel 2 goto fout
if errorlevel 1 goto nieuwe_beheerder
goto starten

:nieuwe_beheerder
echo.
echo Er is nog geen beheerder. Kies een gebruikersnaam (bijvoorbeeld beheerder) en een wachtwoord van minstens 12 tekens.
:vraag_naam
set "CR_NAAM="
set /p "CR_NAAM=Gebruikersnaam: "
if not defined CR_NAAM goto vraag_naam
php backend\bin\beheerder.php "%CR_NAAM%"
if errorlevel 1 goto nieuwe_beheerder
goto starten

:fout
echo.
echo De server kan niet starten: PHP of de database werkt niet. Controleer of PHP 8.3 of hoger is geinstalleerd.
pause
exit /b 1

:starten
start "" "http://127.0.0.1:8080/"
php -S 127.0.0.1:8080 backend\dev-server.php
