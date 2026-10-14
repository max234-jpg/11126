#!/bin/bash
# Installe la chaîne d'outils PCB (idempotent, non interactif).
# Usage : sudo ./scripts/setup-pcb-tools.sh   (root requis pour apt et /opt)
set -euo pipefail

VENV=/opt/pcb-venv
MCP_DIR=/opt/mcp/KiCAD-MCP-Server
MCP_REF=cbb59a6203997f5e916be7e0480d63fe5519134a   # kicad-mcp v2.8.2
FREEROUTING_VERSION=2.1.0
ATOPILE_VERSION=0.15.8   # dernière version CLI (0.16+ = app web)

log() { echo "[pcb-setup] $*" >&2; }
export DEBIAN_FRONTEND=noninteractive

# 1. KiCad 9 (PPA officiel) + ngspice + Java pour Freerouting
if ! kicad-cli version 2>/dev/null | grep -q '^9\.'; then
  log "Installation de KiCad 9…"
  if [ ! -s /usr/share/keyrings/kicad-9.gpg ]; then
    curl -fsSL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x245D5502FAD7A805" \
      | gpg --dearmor > /usr/share/keyrings/kicad-9.gpg
  fi
  . /etc/os-release
  echo "deb [signed-by=/usr/share/keyrings/kicad-9.gpg] https://ppa.launchpadcontent.net/kicad/kicad-9.0-releases/ubuntu ${VERSION_CODENAME} main" \
    > /etc/apt/sources.list.d/kicad-9.list
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    kicad kicad-symbols kicad-footprints ngspice libngspice0-dev default-jre-headless >/dev/null
fi

# 2. Outils Python dans un venv qui voit le module pcbnew de KiCad
if [ ! -x "$VENV/bin/python" ]; then
  log "Création du venv $VENV…"
  python3 -m venv --system-site-packages "$VENV"
fi
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q \
  skidl InSpice kibot kikit easyeda2kicad InteractiveHtmlBom kicad-skip

# 3. atopile (exige Python 3.14, géré par uv)
if ! ato --version 2>/dev/null | grep -q "^${ATOPILE_VERSION}$"; then
  log "Installation d'atopile ${ATOPILE_VERSION}…"
  command -v uv >/dev/null || "$VENV/bin/pip" install -q uv
  UV="$(command -v uv || echo "$VENV/bin/uv")"
  UV_TOOL_DIR=/opt/uv-tools UV_TOOL_BIN_DIR=/usr/local/bin UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    "$UV" tool install --force --python 3.14 "atopile==${ATOPILE_VERSION}" >/dev/null
fi

# 4. tscircuit (PCB en TypeScript/JSX)
if ! command -v tsci >/dev/null; then
  log "Installation de tscircuit…"
  npm install -g --silent tscircuit >/dev/null
fi

# 5. Freerouting (autorouteur)
if [ ! -s /opt/freerouting/freerouting.jar ]; then
  log "Téléchargement de Freerouting ${FREEROUTING_VERSION}…"
  mkdir -p /opt/freerouting
  curl -fsSL -o /opt/freerouting/freerouting.jar \
    "https://github.com/freerouting/freerouting/releases/download/v${FREEROUTING_VERSION}/freerouting-${FREEROUTING_VERSION}.jar"
fi
cat > /usr/local/bin/freerouting <<'EOF'
#!/bin/sh
exec java -jar /opt/freerouting/freerouting.jar --gui.enabled=false "$@"
EOF
chmod +x /usr/local/bin/freerouting

# 6. Serveur MCP KiCad (mixelpixx/KiCAD-MCP-Server)
if [ ! -f "$MCP_DIR/dist/index.js" ] || [ "$(git -C "$MCP_DIR" rev-parse HEAD 2>/dev/null)" != "$MCP_REF" ]; then
  log "Installation du serveur MCP KiCad…"
  rm -rf "$MCP_DIR"
  mkdir -p "$(dirname "$MCP_DIR")"
  git clone -q https://github.com/mixelpixx/KiCAD-MCP-Server.git "$MCP_DIR"
  git -C "$MCP_DIR" checkout -q "$MCP_REF"
  (cd "$MCP_DIR" && npm install --silent >/dev/null)
fi
"$VENV/bin/pip" install -q -r "$MCP_DIR/requirements.txt"

log "Terminé : KiCad $(kicad-cli version), atopile $(ato --version 2>/dev/null), tscircuit $(tsci --version 2>/dev/null)"
