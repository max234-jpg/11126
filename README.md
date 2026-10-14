# AI-CAM — le plus petit appareil photo IA qui parle

Un bouton → une photo → Claude décrit ce qu'il voit → la réponse sort d'un
haut-parleur **ultrason directionnel** (on n'entend la voix que dans l'axe du
faisceau).

```
 [bouton] ─► ESP32-S3 ─► photo JPEG (OV2640, 640×480)
                │  Wi-Fi
                ▼
        serveur relais (server/relay.py)
          1. Claude décrit la photo en 2-3 phrases (français)
          2. Piper synthétise la voix (hors-ligne)
          3. renvoie du PCM 16 bits
                │
                ▼
 ESP32-S3 ─► porteuse 40 kHz modulée ─► pont TC4427A (±11,4 V) ─► réseau de transducteurs
                                                                   l'air démodule → voix audible
```

| | |
|---|---|
| Carte principale | **22 × 36 mm** (cible de placement), 4 couches, 0,8 mm (56 composants, double face) |
| Cerveau | ESP32-S3-MINI-1-N4R2 (Wi-Fi, 4 Mo flash, 2 Mo PSRAM) |
| Caméra | OV2640 sur nappe 24 broches 0,5 mm (module type ESP32-CAM) |
| Son | Haut-parleur paramétrique : 7 transducteurs 40 kHz en hexagone, Ø ≈ 32 mm (10 mm) ou ≈ 50 mm (16 mm) |
| Énergie | Li-Po 1S 300 mAh (402030), charge USB-C 300 mA, power-path |
| Veille | deep-sleep, réveil par le bouton photo |

## Contenu du dépôt

| Dossier | Contenu |
|---|---|
| [`hardware/`](hardware/) | Netlist KiCad, BOM, script générateur, guide de routage — voir [`hardware/README.md`](hardware/README.md) |
| [`firmware/ai_cam/`](firmware/ai_cam/) | Firmware Arduino ESP32-S3 : capture, envoi, modulation ultrason, deep-sleep |
| [`server/`](server/) | Serveur relais Python : Claude (vision) + synthèse vocale Piper |

## Pourquoi un serveur relais ?

- La **clé API Claude ne quitte jamais le serveur** ; la carte ne connaît
  qu'un jeton `DEVICE_TOKEN`.
- La synthèse vocale française de qualité ne tient pas dans un ESP32.
- Le serveur peut tourner sur un PC, un Raspberry Pi ou un petit VPS.

## Démarrage rapide

### 1. Serveur

```bash
cd server
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m piper.download_voices fr_FR-siwis-medium
export ANTHROPIC_API_KEY=sk-ant-...      # ta clé
export DEVICE_TOKEN=$(openssl rand -hex 16)
uvicorn relay:app --host 0.0.0.0 --port 8000
```

### 2. Firmware

1. Arduino IDE ou `arduino-cli`, cœur **esp32 by Espressif 3.x**.
2. Copier `firmware/ai_cam/config.example.h` en `config.h` et remplir Wi-Fi,
   adresse du serveur et `DEVICE_TOKEN`.
3. Carte « ESP32S3 Dev Module », PSRAM « QSPI PSRAM », USB CDC On Boot
   « Enabled ». Brancher en USB-C (maintenir BOOT + appui RESET la première fois).

```bash
arduino-cli compile --fqbn "esp32:esp32:esp32s3:PSRAM=enabled,CDCOnBoot=cdc" firmware/ai_cam
arduino-cli upload  --fqbn "esp32:esp32:esp32s3:PSRAM=enabled,CDCOnBoot=cdc" -p /dev/ttyACM0 firmware/ai_cam
```

### 3. Utilisation

Appui court → bip ultrason → LED bleue allumée pendant l'analyse → la voix
décrit la scène. Long bip = erreur (Wi-Fi, serveur ou caméra). Après 60 s
sans appui, la carte s'endort ; un appui la réveille et prend la photo.

## Ce qui a été vérifié

- **Netlist** : chaque broche n'est connectée qu'une fois, aucun net isolé, et
  les 212 pads référencés ont été contrôlés contre les empreintes de la
  librairie officielle KiCad (19 empreintes). Le brochage du module
  ESP32-S3-MINI-1 est celui du symbole KiCad officiel.
- **Firmware** : compile sans avertissement (esp32 3.3.12, ESP32-S3,
  `--warnings all`) — 84 % de la partition applicative.
- **Serveur** : route testée (jeton refusé → 401, non-JPEG → 400, réponse PCM
  22 050 Hz correcte) et requête Claude inspectée ; la voix Piper française
  a été synthétisée réellement. L'appel à Claude lui-même n'a pas été fait
  ici (pas de clé API dans l'environnement de travail).

**Pas encore fait** : le routage du PCB (la netlist s'importe dans Pcbnew, le
placement et les contraintes sont décrits dans `hardware/README.md`) et
aucun prototype n'a été fabriqué. Voir la liste « À vérifier avant
commande ».

## Estimations (non mesurées)

| | |
|---|---|
| Délai appui → voix | ≈ 4-7 s (Wi-Fi déjà connecté ; +1-2 s au réveil) |
| Autonomie en veille | ≈ 75 µA → plusieurs mois avec 300 mAh |
| Photos par charge | ≈ 300 (≈ 0,8 mAh par cycle de 10 s) |
| Coût API | 1 photo VGA ≈ 400 jetons d'entrée + réponse courte |
