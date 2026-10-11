@echo off
REM Programme l'envoi des flammes tous les jours a 9h00 (Windows).
set DIR=%~dp0
schtasks /Create /F /SC DAILY /ST 09:00 /TN "FlammesSnapchat" ^
  /TR "cmd /c cd /d \"%DIR%\" && python flammes.py run >> \"%DIR%cron.log\" 2>&1"
echo.
echo OK, tache "FlammesSnapchat" programmee tous les jours a 9h00.
echo Pour la retirer : schtasks /Delete /TN "FlammesSnapchat" /F
pause
