@echo off
REM Programme l'envoi des flammes tous les jours a 9h00 (Windows).
REM   installer_windows.bat          -> version navigateur (flammes_web.py)
REM   installer_windows.bat android  -> version telephone Android (flammes.py)
set DIR=%~dp0
set SCRIPT=flammes_web.py
if /I "%~1"=="android" set SCRIPT=flammes.py
schtasks /Create /F /SC DAILY /ST 09:00 /TN "FlammesSnapchat" /IT ^
  /TR "cmd /c cd /d \"%DIR%\" && python %SCRIPT% run >> \"%DIR%cron.log\" 2>&1"
echo.
echo OK, tache "FlammesSnapchat" programmee tous les jours a 9h00 (%SCRIPT%).
echo Pour la retirer : schtasks /Delete /TN "FlammesSnapchat" /F
pause
