# Visionneuse de caméra IP — sans l'application, sans Internet

Petit logiciel pour ordinateur (Windows, macOS, Linux) qui affiche **en direct**
la vidéo d'une petite caméra IP Wi-Fi **sans passer par l'application du
fabricant, sans Internet et sans box/routeur**.

## Comment ça marche

Ces caméras créent leur **propre réseau Wi-Fi** (mode « point d'accès / AP »).
Le téléphone s'y connecte, puis l'application lit la vidéo directement sur la
caméra. Ce logiciel fait la même chose depuis un ordinateur :

```
[ Caméra ]  ))) Wi-Fi de la caméra (pas d'Internet) )))  [ PC + ce logiciel ]
```

> ℹ️ Il faut forcément un lien entre le PC et la caméra pour recevoir l'image :
> soit le **Wi-Fi émis par la caméra elle-même** (aucune box ni Internet
> nécessaires), soit un **câble Ethernet** si la caméra a une prise réseau.

Le logiciel :

1. détecte le petit réseau créé par la caméra ;
2. trouve la caméra (recherche ONVIF + analyse des ports) ;
3. devine l'adresse du flux vidéo (RTSP, MJPEG/HTTP, ONVIF) et les identifiants
   d'usine courants (`admin` / vide, `admin` / `admin`, `admin` / `123456`…) ;
4. affiche la vidéo avec une latence minimale et se **reconnecte tout seul** en
   cas de coupure ;
5. mémorise l'adresse trouvée : les fois suivantes, l'image s'affiche directement.

## Installation

1. Installer **Python 3.9 ou plus récent** : <https://www.python.org/downloads/>
   (sous Windows, cocher « Add Python to PATH »).
2. Télécharger ce dossier.
3. Installer les dépendances (une seule fois) :

```bash
pip install -r requirements.txt
```

## Utilisation

1. Allumer la caméra et attendre ~30 s.
2. Sur l'ordinateur, se connecter au **réseau Wi-Fi de la caméra** (son nom
   ressemble souvent à `IPC-xxxx`, `MV-xxxx`, `CAM-xxxx`, `HDWIFI-xxxx`,
   `ESP32-CAM`…). Windows peut signaler « Pas d'Internet » : c'est normal.
3. Lancer le logiciel :
   - Windows : double-cliquer sur **`lancer.bat`**
   - macOS / Linux : dans le Terminal, depuis le dossier du logiciel, taper
     `./lancer.sh` (le premier lancement installe tout automatiquement)
   - ou directement (sur Mac, la commande s'appelle `python3`, pas `python`) :

```bash
python3 camera_viewer.py
```

> 🍎 **Mac (macOS 15 et plus)** : au premier lancement, autorisez l'accès au
> **réseau local** quand macOS le demande (ou dans *Réglages Système →
> Confidentialité et sécurité → Réseau local → Terminal*), sinon la caméra
> ne peut pas être trouvée.

### Touches dans la fenêtre vidéo

| Touche        | Action                                            |
|---------------|---------------------------------------------------|
| `Q` / `Échap` | Quitter                                           |
| `S`           | Photo (JPG enregistrée dans `captures/`)          |
| `R`           | Démarrer / arrêter l'enregistrement vidéo (`.avi`)|
| `F`           | Plein écran                                       |

### Options

Caméra protégée par mot de passe :

```bash
python camera_viewer.py --user admin --password MOT_DE_PASSE
```

Adresse IP de la caméra déjà connue :

```bash
python camera_viewer.py --ip 192.168.1.1 --user admin --password MOT_DE_PASSE
```

Adresse du flux déjà connue :

```bash
python camera_viewer.py --url rtsp://admin:MOT_DE_PASSE@192.168.1.1:554/live/ch00_0
```

Lister les flux trouvés sans ouvrir la vidéo :

```bash
python camera_viewer.py --scan
```

Oublier la caméra mémorisée et refaire une recherche :

```bash
python camera_viewer.py --new
```

## Créer un programme `.exe` (optionnel, Windows)

Pour obtenir un seul fichier à double-cliquer, sans avoir besoin de Python
sur l'ordinateur qui l'utilisera :

```bash
pip install pyinstaller
```

```bash
pyinstaller --onefile --name CameraViewer camera_viewer.py
```

L'exécutable se trouve ensuite dans `dist/CameraViewer.exe`.

## Ça ne marche pas ?

- **« Aucune connexion réseau détectée »** : l'ordinateur n'est pas connecté au
  Wi-Fi de la caméra. Désactivez aussi un éventuel VPN.
- **La caméra est trouvée mais pas le flux** : essayez avec le mot de passe
  défini dans l'application (`--user admin --password ...`). Lancez
  `python camera_viewer.py --scan` et regardez les ports ouverts affichés.
- **Le pare-feu Windows** peut bloquer la recherche ONVIF : autorisez Python
  sur les réseaux privés quand Windows le demande.
- **Mini-caméras très bon marché** (applis *V380*, *YI IoT*, *Lookcam*,
  *CamHi*, *iCSee*, *Little Stars*, *HDWifiCam*…) : beaucoup proposent du
  RTSP (souvent `rtsp://IP:554/live/ch00_0` ou `rtsp://IP:8554/…`) et sont
  détectées automatiquement. Mais certaines n'utilisent **que** un protocole
  propriétaire chiffré de l'application ; aucun logiciel tiers ne peut alors
  lire la vidéo. Dans l'application, cherchez une option « RTSP » ou
  « ONVIF » à activer : une fois activée, ce logiciel la trouvera. Si `--scan`
  n'affiche que des ports inhabituels, notez-les et la marque/le modèle de la
  caméra pour chercher l'adresse exacte du flux.
- **Image saccadée ou en retard** : rapprochez l'ordinateur de la caméra ;
  le logiciel n'affiche toujours que l'image la plus récente pour éviter
  d'accumuler du retard.
