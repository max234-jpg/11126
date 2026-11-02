#!/usr/bin/env sh
# Lanceur Linux / macOS : installe les dépendances au premier lancement puis ouvre la caméra.
cd "$(dirname "$0")"
python3 -c "import cv2" 2>/dev/null || python3 -m pip install --user -r requirements.txt
exec python3 camera_viewer.py "$@"
