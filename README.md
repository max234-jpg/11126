# Battle Royale — Île de San Calma

Battle Royale solo en 3D, hors ligne, avec des graphismes réalistes : textures PBR photo-scannées,
ciel HDRI, océan, personnages humains animés, maisons explorables et voitures conduisibles.
C'est la suite du prototype Python d'origine (conservé dans `prototype_python/`).

## Lancer le jeu sur Mac (double-clic)

Télécharge ou clone le dossier complet, puis au choix :

| Fichier | Ce qu'il fait |
|---|---|
| **`JOUER.html`** | Double-clic : le jeu s'ouvre dans ton navigateur par défaut (Safari ou Chrome). Marche toujours, sans rien installer. |
| **`JOUER.command`** | Double-clic : ouvre le jeu en plein écran dans Google Chrome s'il est installé (meilleures performances), sinon dans Safari. |
| **`Battle Royale.app`** | Même chose que `JOUER.command`, sous forme d'application Mac. |

Le dossier `jeu/` doit rester à côté de ces fichiers.

La première fois, macOS peut bloquer `JOUER.command` ou `Battle Royale.app` (« développeur non identifié »)
car ils ne sont pas signés. Fais **clic droit → Ouvrir → Ouvrir**, une seule fois. `JOUER.html` n'a pas ce problème.
Si le double-clic sur `JOUER.command` ne fait rien, rends-le exécutable une fois dans le Terminal :

```bash
chmod +x JOUER.command "Battle Royale.app/Contents/MacOS/lancer"
```

**Configuration conseillée** : Mac Apple Silicon (M1 ou plus récent), macOS 12+, Safari 15+ ou Chrome récent.
Sur un Mac Intel, choisis la qualité « moyenne » ou « basse » dans Options. Le jeu baisse aussi la qualité
tout seul s'il passe sous ~30 images/s.

## Commandes

| Touche | Action |
|---|---|
| Z Q S D (ou W A S D) | Se déplacer, nager dans l'eau |
| Maj | Sprinter |
| Espace | Sauter |
| Souris | Regarder (clique dans le jeu pour capturer la souris) |
| Clic droit | Viser |
| Clic gauche | Tirer |
| R | Recharger |
| E | Ouvrir un coffre · monter/descendre de voiture |
| H | Trousse de soin |
| B | Danser |
| C | Marcher lentement |
| M | Carte de l'île |
| Échap | Pause |

En voiture : Z/W accélérer, S freiner/reculer, Q/A et D tourner, Espace frein à main.

## Ce qui est fait (et testé)

- **Île de 640 m × 640 m** : relief avec collines et montagne, plages, lagon, routes asphaltées avec marquage,
  village avec trottoirs, passages piétons et lampadaires.
- **Sol photo-réaliste** : mélange automatique herbe / terre / sable / roche selon l'altitude et la pente, anti-répétition.
- **Herbe haute animée** par le vent (~150 000 brins générés sur la carte graphique), arbres procéduraux animés,
  palmiers, rochers, buissons et fougères photo-scannés.
- **Océan** : couleur selon la profondeur réelle (turquoise dans le lagon), reflets du ciel et du soleil, écume.
- **Rendu** : ciel HDRI 4K, éclairage global par image, ombres douces, occlusion ambiante (GTAO), bloom, étalonnage.
- **21 maisons explorables** : porte ouverte, fenêtres vitrées, cloison salon/chambre, meubles réels
  (canapé, fauteuil, table basse, télé, bibliothèque, lit, table de nuit, chaise, plante), collisions sur murs et meubles.
  Aucun arbre ni rocher n'apparaît dans les maisons.
- **Personnages humains riggés** (homme / femme) avec vraies animations : repos, marche, course, sprint,
  saut (départ, chute, réception), nage, danse, conduite, visée et tir au pistolet, rechargement, impact, mort.
- **Tenues** composées de tissus scannés (jean, coton, jersey, cuir, camouflage) : 8 tenues.
- **Casier** (choix de tenue) et **boutique** (achat avec les pièces gagnées), sauvegardés dans le navigateur.
- **Battle royale** : 15 bots qui explorent, fouillent, fuient la tempête et se battent entre eux et contre toi ;
  tempête qui se referme en 6 phases ; coffres qui s'ouvrent (couvercle animé), trousses de soin, munitions ;
  pistolet avec chargeur, tirs à la tête, traçantes ; classement et écran de victoire.
- **Voitures conduisibles** (9) : suspension sur le relief, roues qui tournent et braquent, son moteur,
  collisions, on peut écraser les adversaires.
- **HUD** : santé, munitions, pièces, joueurs en vie, minuteur de tempête, mini-carte orientée, grande carte, fil des éliminations.
- **Sons** synthétisés (tirs, pas, ressac, vent, moteur, coffres).

### Limites connues (honnêtement)

- Les vêtements sont **peints** sur le corps (pas de vêtements 3D séparés) : de près, la tenue colle à la silhouette.
- Les bots se déplacent en ligne droite avec un évitement simple (pas de vrai calcul d'itinéraire).
- Une seule arme (pistolet). Pas de multijoueur.
- Testé automatiquement dans Chromium (rendu logiciel). Je n'ai pas pu le tester sur un vrai Mac :
  Safari et Chrome sur Mac utilisent la même technologie (WebGL 2), mais les performances dépendent de ta machine.

## Pour les développeurs

Le jeu est écrit en JavaScript avec [Three.js](https://threejs.org) (moteur WebGL). Les sources sont dans `src/`,
compilées en un seul fichier `jeu/js/game.js`. Les ressources sont empaquetées dans `jeu/assets/*.js` (base64),
ce qui permet d'ouvrir le jeu directement depuis le disque (`file://`) sans serveur.

```bash
npm install                 # outils (Node 20+)
npm run fetch-assets        # télécharge les ressources sources dans assets_src/ (~500 Mo)
npm run build-assets        # optimise et empaquette les ressources dans jeu/assets/
npm run build               # compile src/ -> jeu/js/game.js
npm test                    # test automatique de gameplay (nécessite Playwright + Chromium)
```

`node tests/shot.mjs "q=haute&auto&bots=4" capture.png` fait une capture d'écran d'une partie.

| Dossier | Contenu |
|---|---|
| `src/` | Code du jeu (rendu, terrain, eau, végétation, village, personnages, IA, voitures, interface) |
| `tools/` | Pipeline des ressources (téléchargement, simplification des maillages, compression, masques de vêtements) |
| `jeu/` | Jeu compilé + ressources empaquetées (ce qui est lancé par `JOUER.html`) |
| `tests/` | Test de gameplay et captures d'écran |
| `prototype_python/` | Prototype Ursina d'origine et `reference_game.html` (conservés) |

### Pourquoi plus en Python ?

Le prototype Ursina/Panda3D ne permettait pas facilement un rendu de ce niveau (éclairage HDRI, ombres douces,
post-traitement, herbe sur GPU) et demandait d'installer Python et des bibliothèques. La version WebGL tourne
directement dans Safari/Chrome sur Mac, sans installation, et se lance d'un double-clic.

## Crédits et licences des ressources

| Ressource | Auteur / source | Licence |
|---|---|---|
| Textures PBR (sable, roches, asphalte, briques, crépis, tuiles, parquets, carrelage, bois, écorce de palmier, tissus) | [Poly Haven](https://polyhaven.com) | CC0 |
| Ciel HDRI « Kloofendal 48d Partly Cloudy (Pure Sky) » | Poly Haven (Greg Zaal, Jarod Guest) | CC0 |
| Modèles : mobilier, lampadaires, bouche d'incendie, poubelles, barrières, coffre, trousse de soin, caisse de munitions, pistolet, rochers, buissons, fougères, souche | Poly Haven | CC0 |
| Textures d'herbe et de terre (Grass004, Ground037) | [ambientCG](https://ambientcg.com) | CC0 |
| Personnages « Universal Base Characters » + coiffures | [Quaternius](https://quaternius.com) | CC0 |
| Animations « Universal Animation Library » | Quaternius | CC0 |
| Voiture « Car Concept » | Eric Chadwick / Darmstadt Graphics Group, [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | CC-BY 4.0 |
| Générateur d'arbres « EZ-Tree » (et ses textures) | Daniel Greenheck | MIT |
| Moteur 3D Three.js (et texture de normales d'eau) | three.js authors | MIT |
