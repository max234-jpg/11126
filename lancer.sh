#!/usr/bin/env sh
# Lanceur macOS / Linux : au premier lancement, crée un environnement Python
# local (.venv) et y installe les dépendances, puis ouvre la caméra.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 est introuvable. Installez-le depuis https://www.python.org/downloads/"
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  echo "Premier lancement : installation des dépendances (1 à 2 minutes)…"
  python3 -m venv .venv || exit 1
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install -r requirements.txt || exit 1
fi
exec .venv/bin/python camera_viewer.py "$@"
