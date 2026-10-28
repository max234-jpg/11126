// Point d'entrée : construit l'île puis affiche le menu.
import { Game } from './game.js';

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  const m = document.getElementById('boot-msg');
  if (m) {
    m.style.color = '#ff9a8a';
    m.innerHTML = 'Erreur au démarrage : ' + (e && e.message ? e.message : e) +
      '<br>Essaie avec Google Chrome ou Safari à jour (WebGL 2 requis).';
  }
});
