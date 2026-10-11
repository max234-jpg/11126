#!/usr/bin/env bash
# Programme l'envoi des flammes tous les jours a 9h00 (Linux / macOS).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3)"
ADB_DIR="$(dirname "$(command -v adb)")"
LINE="0 9 * * * cd \"$DIR\" && PATH=\"$ADB_DIR:\$PATH\" \"$PY\" flammes.py run >> \"$DIR/cron.log\" 2>&1"

( crontab -l 2>/dev/null | grep -v "flammes.py run" ; echo "$LINE" ) | crontab -
echo "OK, tache programmee tous les jours a 9h00 :"
echo "  $LINE"
echo "Pour la retirer : crontab -l | grep -v 'flammes.py run' | crontab -"
