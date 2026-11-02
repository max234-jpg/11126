@echo off
REM Lanceur Windows : installe les dependances au premier lancement puis ouvre la camera.
cd /d "%~dp0"
python -c "import cv2" 2>NUL || python -m pip install -r requirements.txt
python camera_viewer.py %*
pause
