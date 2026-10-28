# Battle Royale 3D — base Python pour Claude Code

Ce dossier est une **base de prototype Python**, pas une conversion complète du jeu HTML ni un jeu photoréaliste terminé. Il utilise Ursina (basé sur Panda3D) pour la partie jouable. Le fichier `reference_game.html` garde l'ancienne version comme référence des fonctionnalités.

## Lancer le prototype sur Mac

1. Installer Python 3.11 ou 3.12 si nécessaire.
2. Ouvrir Terminal dans ce dossier.
3. Exécuter :

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python main.py
```

Commandes : `W A S D` pour bouger, souris pour regarder, `Espace` pour sauter, `E` près d'un coffre pour le récupérer, `Échap` pour libérer/verrouiller la souris.

Les formes actuelles sont des éléments provisoires. Pour de vrais graphismes, créer/importer des modèles `GLB` depuis Blender : île/terrain, maisons avec intérieur et portes, arbres, rochers, personnage riggé, animations de marche/course/saut/nage/danse, armes, véhicules. Ajouter des matériaux PBR (albedo/base color, normal, roughness, éventuellement displacement) et tester les licences des ressources téléchargées.

## Important

- Les boutons Casier/Boutique/Danser sont des panneaux de démonstration, pas encore des systèmes complets.
- Les bots, les armes utilisables, la tempête, les véhicules et le multijoueur ne sont pas encore implémentés.
- Blender n'a plus son ancien moteur de jeu intégré. Utiliser Blender pour créer les assets, puis les importer dans le moteur Python; Claude Code peut organiser cette pipeline.
