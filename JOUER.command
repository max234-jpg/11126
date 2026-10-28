#!/bin/bash
# Double-clique sur ce fichier (Finder) pour lancer le jeu.
# Il ouvre le jeu dans Google Chrome (fenêtre dédiée, meilleures performances WebGL)
# ou, à défaut, dans ton navigateur par défaut (Safari). Aucune installation n'est nécessaire.
DIR="$(cd "$(dirname "$0")" && pwd)"
PAGE="$DIR/JOUER.html"
URL="file://$PAGE"
for APP in "Google Chrome" "Brave Browser" "Microsoft Edge" "Chromium"; do
  if open -Ra "$APP" 2>/dev/null; then
    open -na "$APP" --args --app="$URL" --start-fullscreen --autoplay-policy=no-user-gesture-required
    exit 0
  fi
done
open "$PAGE"
