#!/usr/bin/env bash
# Programme l'envoi des flammes tous les jours a 9h00 (Linux / macOS).
#   ./installer_cron.sh          -> version navigateur (flammes_web.py)
#   ./installer_cron.sh android  -> version telephone Android (flammes.py)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3)"
SCRIPT="flammes_web.py"
EXTRA_PATH=""
if [ "${1:-web}" = "android" ]; then
  SCRIPT="flammes.py"
  EXTRA_PATH="$(dirname "$(command -v adb)"):"
fi
# Sur Linux, cron n'a pas d'ecran : on donne celui de la session pour ouvrir le navigateur
DISPLAY_ENV=""
[ -n "${DISPLAY:-}" ] && DISPLAY_ENV="DISPLAY=$DISPLAY "
LINE="0 9 * * * cd \"$DIR\" && ${DISPLAY_ENV}PATH=\"${EXTRA_PATH}\$PATH\" \"$PY\" $SCRIPT run >> \"$DIR/cron.log\" 2>&1"

( crontab -l 2>/dev/null | grep -v "flammes.*\.py run" ; echo "$LINE" ) | crontab -
echo "OK, tache programmee tous les jours a 9h00 :"
echo "  $LINE"
echo "Pour la retirer : crontab -l | grep -v 'flammes' | crontab -"
