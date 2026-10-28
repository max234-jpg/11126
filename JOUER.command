#!/bin/bash
# Double-clique sur ce fichier (Finder) pour lancer le jeu.
# Il ouvre le jeu dans Google Chrome (fenêtre dédiée, meilleures performances WebGL)
# ou, à défaut, dans ton navigateur par défaut (Safari). Aucune installation n'est nécessaire.
# La petite fenêtre de Terminal qui s'ouvre peut être fermée une fois le jeu lancé.
DIR="$(cd "$(dirname "$0")" && pwd)"
PAGE="$DIR/JOUER.html"
URL="file://$PAGE"
URL="${URL// /%20}"   # espaces encodés pour Chrome
for APP in "Google Chrome" "Brave Browser" "Microsoft Edge" "Chromium"; do
  if open -Ra "$APP" 2>/dev/null; then
    open -na "$APP" --args --app="$URL" --start-fullscreen --autoplay-policy=no-user-gesture-required
    exit 0
  fi
done
open "$PAGE"
