# 📄 Scanner Wi-Fi

Petit logiciel qui transforme une **caméra Wi-Fi** en **scanner de documents**.
Il tourne sur votre PC et s'utilise depuis un navigateur, **sur le PC ou sur votre téléphone**.

**Ce qu'il fait :**
- affiche l'image de la caméra en direct et entoure automatiquement la feuille détectée ;
- **scanne** : il combine plusieurs images pour réduire le bruit, détecte la feuille, la **redresse** (perspective), puis **améliore la qualité** :
  - 🎨 **Couleur** : supprime les ombres, fond blanc, couleurs ravivées, texte plus net ;
  - ⚫ **Gris** : idem en niveaux de gris ;
  - 📝 **N&B** : noir et blanc net, idéal pour le texte ;
  - 🖼️ **Photo** : couleurs naturelles, juste plus de contraste et de netteté ;
- recadrage manuel (4 coins à déplacer), rotation, changement de mode après coup ;
- export en **JPG** ou en **PDF** de plusieurs pages ;
- import de photos existantes (bouton « Importer ») ;
- recherche des caméras sur le réseau Wi-Fi.

## 🚀 Installation et lancement

Il faut **Python 3.9 ou plus** sur le PC : <https://www.python.org/downloads/>
(sous Windows, cochez « Add Python to PATH » pendant l'installation).

- **Windows** : double-cliquez sur `demarrer.bat`
- **Mac / Linux** : lancez `./demarrer.sh`

La première fois, l'installation prend quelques minutes. Ensuite la fenêtre affiche :

```
  Scanner Wi-Fi démarré !
  Sur ce PC        : http://localhost:5000
  Sur le téléphone : http://192.168.1.23:5000   (même réseau Wi-Fi)
```

Ouvrez l'adresse « téléphone » dans le navigateur de votre téléphone (connecté au même Wi-Fi).
Astuce : « Ajouter à l'écran d'accueil » pour l'avoir comme une appli.

> Si le téléphone n'arrive pas à se connecter, autorisez Python dans le pare-feu Windows
> (une fenêtre le propose au premier lancement : cochez « Réseaux privés »).

## 📷 Connecter la caméra

Dans **⚙️ Réglages**, entrez l'adresse de la caméra puis « Enregistrer et connecter ».
Le bouton **🔎 Chercher sur le Wi-Fi** liste les appareils qui ressemblent à des caméras.

| Caméra | Adresse à essayer |
|---|---|
| ESP32-CAM | `http://IP:81/stream` ou `http://IP/capture` |
| Appli Android « IP Webcam » | `http://IP:8080/video` |
| Caméra IP (Tapo, Imou, Reolink, Hikvision…) | `rtsp://identifiant:motdepasse@IP:554/stream1` |
| Caméra qui fournit une photo | `http://IP/snapshot.jpg` |
| Webcam USB branchée au PC | `0` |

L'adresse IP se trouve dans l'application de la caméra ou sur la page de votre box.
Pour une caméra Tapo, il faut créer un « compte caméra » dans l'appli Tapo (Paramètres avancés) pour le RTSP.

## 💡 Conseils pour de beaux scans

- Fixez la caméra **au-dessus** du document (support, pile de livres…) et ne la bougez pas pendant le scan.
- Posez la feuille sur un **fond sombre** et uni : la détection du contour est bien meilleure.
- Un bon éclairage uniforme aide, même si les ombres sont corrigées.
- « Images combinées » à 5–10 : moins de bruit avec les petites caméras.

## 🗂️ Fichiers

- `app.py` : serveur web ; `camera.py` : lecture de la caméra ; `scanner.py` : traitement d'image ;
- `static/` : l'interface ;
- les scans sont enregistrés dans le dossier `scans/` (original + résultat).
