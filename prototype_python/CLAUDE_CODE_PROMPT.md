# Instructions à donner à Claude Code

Travaille dans ce dossier et transforme progressivement le prototype en un jeu Battle Royale 3D jouable sur macOS. Lis d'abord `README_FR.md`, `main.py` et `reference_game.html`.

## Objectif
Créer un jeu solo en Python, avec Ursina/Panda3D pour le gameplay et Blender pour créer/adapter les assets 3D. Ne prétends pas que des fonctionnalités sont faites tant qu'elles n'ont pas été exécutées et testées.

## Priorités
1. Lancer `main.py` et corriger toutes les erreurs de démarrage.
2. Remplacer les formes provisoires par des modèles GLB réalistes. Prévoir un dossier `assets/models/` et `assets/textures/`. Si aucun asset n'existe, garder un fallback propre.
3. Créer une île cohérente : terrain avec relief, herbe, terre, plages, rochers, arbres placés hors des bâtiments, routes et village. Éviter les cubes visibles autant que possible.
4. Faire des maisons réellement explorables : murs avec ouvertures de porte, collision correcte, intérieur meublé, fenêtres. Aucun arbre/rocher ne doit apparaître dans les maisons.
5. Ajouter un personnage humain riggé avec animations distinctes idle, marche, course, saut, nage et danse. Utiliser des animations retargetées/licenciées correctement; ne pas remplacer le personnage par des cubes.
6. Rendre le casier fonctionnel avec sélection de skins originaux et la boutique avec monnaie et achats de démonstration.
7. Ajouter coffres ouvrables, objets ramassables, arme d'entraînement, bots simples, zone de tempête qui rétrécit, véhicules si la base est stable.
8. Ajouter des tests basiques et un fichier `RUN_MAC.command` (ou instructions de lancement fiables). Garder le jeu solo hors ligne autant que possible.

## Pipeline Blender
- Chercher d'abord les assets déjà installés ou les bibliothèques légales. Poly Haven et ambientCG proposent des ressources CC0; vérifier les licences pour chaque autre asset.
- Pour les assets Blender, utiliser les addons disponibles seulement s'ils sont réellement installés; ne pas inventer d'addons ni télécharger sans demander. Documenter le nom de l'addon et la licence.
- Exporter les modèles en GLB avec textures incluses quand possible; vérifier l'échelle, les axes, les matériaux, les collisions et les animations.
- Ne pas appeler des textures externes depuis des URL au runtime si elles peuvent être incluses dans le projet.

## Règles de qualité
- Après chaque étape, exécuter le programme ou les tests et corriger les erreurs.
- Fournir une liste claire des fichiers modifiés et les commandes exactes pour lancer.
- Si une fonction n'est qu'une maquette, l'indiquer franchement.
- Ne jamais effacer `reference_game.html`; c'est la référence du jeu précédent.
