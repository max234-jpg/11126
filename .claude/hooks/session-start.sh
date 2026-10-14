#!/bin/bash
# Réinstalle la chaîne d'outils PCB au démarrage d'une session cloud Claude Code.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

"$CLAUDE_PROJECT_DIR/scripts/setup-pcb-tools.sh"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="/opt/pcb-venv/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi
