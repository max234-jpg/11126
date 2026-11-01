#!/bin/sh
# Installation du Scanner Wi-Fi sur Mac, en une commande :
#   curl -fsSL https://raw.githubusercontent.com/max234-jpg/11126/claude/beautiful-sagan-70bpjg/installer-mac.sh | sh
set -e

DIR="$HOME/ScannerWifi"
ZIP_URL="https://github.com/max234-jpg/11126/archive/refs/heads/claude/beautiful-sagan-70bpjg.zip"

echo ""
echo "=== Installation du Scanner Wi-Fi ==="
echo ""

# 1. Python 3 (fourni par Apple avec les « outils de ligne de commande »)
if ! python3 -c "import sys; assert sys.version_info >= (3, 9)" >/dev/null 2>&1; then
  echo "Python 3 n'est pas encore installé sur ce Mac."
  echo "-> Une fenêtre va s'ouvrir : cliquez sur « Installer » et attendez la fin (5 à 15 min)."
  echo "-> Ensuite, collez à nouveau la même commande dans le Terminal."
  xcode-select --install >/dev/null 2>&1 || true
  exit 1
fi

# 2. Téléchargement (les scans et réglages déjà présents sont conservés)
echo "Téléchargement..."
TMP=$(mktemp -d)
curl -fsSL "$ZIP_URL" -o "$TMP/scanner.zip"
unzip -q "$TMP/scanner.zip" -d "$TMP"
mkdir -p "$DIR"
cp -R "$TMP"/11126-*/. "$DIR"/
rm -rf "$TMP"
cd "$DIR"

# 3. Bibliothèques Python (dans un dossier à part, rien n'est modifié sur le Mac)
echo "Installation des composants (quelques minutes la première fois)..."
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/python -m pip install -q --disable-pip-version-check --upgrade pip
.venv/bin/python -m pip install -q --disable-pip-version-check -r requirements.txt

# 4. Raccourci sur le Bureau pour les prochaines fois
LAUNCHER="$HOME/Desktop/Scanner Wi-Fi.command"
printf '#!/bin/sh\ncd "%s" && exec .venv/bin/python app.py\n' "$DIR" > "$LAUNCHER"
chmod +x "$LAUNCHER"

echo ""
echo "✅ Installé ! La prochaine fois : double-cliquez sur « Scanner Wi-Fi » sur le Bureau."
echo "   Si le Mac demande d'accepter les connexions entrantes pour Python : cliquez « Autoriser »."
echo "   Pour arrêter le scanner : fermez cette fenêtre."
exec .venv/bin/python app.py
