@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv (
  echo Installation - une seule fois, quelques minutes...
  python -m venv .venv || (echo Python n'est pas installe : https://www.python.org/downloads/ & pause & exit /b)
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\python -m pip install -r requirements.txt
)
.venv\Scripts\python app.py
pause
