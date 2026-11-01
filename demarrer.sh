#!/usr/bin/env sh
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  echo "Installation (une seule fois, quelques minutes)..."
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.txt
fi
exec .venv/bin/python app.py
