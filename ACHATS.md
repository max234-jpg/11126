# Liste d'achat AI-CAM

Deux étapes conseillées :

1. **Prototype** avec des modules du commerce, achetable tout de suite, pour
   valider la caméra, Claude et surtout le rendu du haut-parleur ultrason.
2. **Carte finale** miniature, une fois le PCB routé (pas encore fait).

Le firmware est le même pour les deux (mêmes broches) ; seul le réglage
Arduino change.

---

## 1. Kit prototype (sans PCB)

| Qté | Article | Remarque |
|---|---|---|
| 1 | **Seeed Studio XIAO ESP32S3 Sense** | Carte + module caméra inclus, chargeur Li-Po intégré. Ne pas prendre la version sans « Sense » (pas de caméra). |
| 8 | **Transducteur ultrason 40 kHz émetteur 16 mm, TCT40-16T** | 7 utilisés + 1 de rechange. Prendre des **émetteurs (T)**, pas des récepteurs (R), du même lot. |
| 1 | **TC4427ACPA** (DIP-8) | Driver du pont ultrason (version boîtier traversant pour plaque à essais). |
| 1 | **Module boost MT3608** réglable (2-24 V) | Régler la sortie sur 11,4 V avant de brancher le TC4427. |
| 1 | Batterie **Li-Po 3,7 V 1S, 400-500 mAh**, avec protection | Soudée sur les pastilles BAT+ / BAT− sous la XIAO. |
| 1 | Interrupteur à glissière | Entre BAT+ et l'entrée du boost : le module MT3608 n'a pas d'entrée d'activation. |
| 1 | Bouton poussoir 6 × 6 mm | Bouton photo. |
| 1 | LED 3 mm + résistance 1 kΩ | LED d'état. |
| 2 | Résistances 220 kΩ + 1 condensateur 100 nF | Pont de mesure batterie. |
| 2 | Résistances 100 kΩ | Entrées A et B du TC4427 vers GND (driver au repos au démarrage). |
| 1 | Condensateur 10 µF 25 V + 1 × 100 nF | Découplage du TC4427, au plus près de sa broche 6. |
| 1 | Plaque à essais (ou plaque pastillée) + fils | |

### Câblage prototype

| XIAO | Broche ESP32 | Vers |
|---|---|---|
| D0 | GPIO1 | Bouton photo → GND |
| D1 | GPIO2 | 1 kΩ → LED → GND |
| D3 | GPIO4 | Milieu du pont 220 k / 220 k (entre BAT+ et GND) + 100 nF à GND |
| D4 | GPIO5 | Non utilisé ici (boost toujours actif) |
| D5 | GPIO6 | TC4427 entrée A (broche 2) |
| D8 | GPIO7 | TC4427 entrée B (broche 4) |
| GND | | GND commun : XIAO, boost, TC4427 (broche 3) |

- Boost : entrée sur BAT+ via l'interrupteur, sortie 11,4 V → TC4427 broche 6.
  Couper l'interrupteur quand l'appareil n'est pas utilisé.
- TC4427 sorties broches 7 et 5 → les 7 transducteurs **tous en parallèle,
  même polarité**, serrés en hexagone, face avant dans le même plan.
- Arduino : carte **« XIAO_ESP32S3 »**, PSRAM **« OPI PSRAM »**
  (`--fqbn esp32:esp32:XIAO_ESP32S3:PSRAM=opi`, compilation vérifiée).
- La petite LED orange de la XIAO (GPIO21) reste allumée : c'est la broche
  « PWDN caméra » de la carte finale, sans effet ici.

---

## 2. Carte finale (PCB 22 × 36 mm)

La nomenclature complète est dans [`hardware/BOM.csv`](hardware/BOM.csv).
**Chaque code LCSC a été vérifié contre le catalogue le 2026-10-17** (modèle
exact et stock). Coût des composants : **≈ 12 $ par carte** (prix unitaires
JLCPCB/LCSC, hors frais de pièces « extended », PCB et assemblage).

### Composants principaux

| Réf. | Pièce | Code LCSC |
|---|---|---|
| U1 | ESP32-S3-MINI-1-**N4R2** (avec PSRAM, indispensable pour la caméra) | C3013941 |
| U2 | MCP73831T-2ACI/OT — chargeur Li-Po | C424093 |
| U3 | AP2112K-3.3TRG1 — régulateur 3,3 V | C51118 |
| U4 | XC6206P282MR — 2,8 V caméra | C5148690 |
| U5 | XC6206P122MR — 1,2 V caméra | C2827649 |
| U6 | MT3608 — boost 11,4 V | C84817 |
| U7 | TC4427AEOA713 — driver ultrason | C20551 |
| U9 | USBLC6-2SC6 — protection USB | C7519 |
| Q1 | DMG2305UX-7 — P-MOS power-path | C5261054 |
| L1 | ANR4018T100M — 10 µH 4 × 4 mm | C6808084 |
| J1 | USB-C GCT USB4105-GF-A-060 | C3025063 |
| J3 | Hirose FH12-24S-0.5SH(55) — nappe caméra | C202112 |
| J2, J4 | JST SH 2 broches SM02B-SRSS-TB | C160402 |
| SW1 | Bouton photo TL3342F160QG | C2886898 |
| SW2, SW3 | BOOT / RESET PTS810SJG250SMTRLFS | C221895 |

Résistances, condensateurs, diodes et LED : voir `hardware/BOM.csv`.

### Hors carte

| Qté | Article | Remarque |
|---|---|---|
| 1 | **Module caméra OV2640, nappe 24 broches 0,5 mm** (type ESP32-CAM) | Vérifier le brochage et le côté des contacts avant de router (le connecteur J3 est à contacts **dessous**). Pas d'OV5640 : alimentations différentes. |
| 7 | Transducteurs **TCT40-16T** (16 mm) ou 40 kHz 10 mm | Même lot, émetteurs. |
| 1 | Batterie Li-Po 1S **402030, 300 mAh**, avec protection | |
| 2 | **Câble JST SH 1,0 mm 2 broches pré-serti** | Batterie et transducteurs. Sinon : boîtier SHR-02V-S (C398472) + contacts SSH-003T-P0.2-H (C263995), mais le sertissage au pas de 1 mm est difficile. |

⚠️ **Polarité batterie** : J2 broche 1 = **+**, broche 2 = **−**. Les
batteries vendues avec connecteur n'ont pas de polarité standard : vérifier
au multimètre avant de brancher.

### Fabrication

- PCB **4 couches, 0,8 mm**, avec assemblage double face (par exemple
  JLCPCB ; le fichier `BOM.csv` contient déjà les codes LCSC).
- Le PCB doit d'abord être **routé** dans KiCad à partir de
  `hardware/ai_cam.net` — voir `hardware/README.md`.
- Revérifier le stock le jour de la commande : U1 (≈ 3 000) et SW1 (≈ 900)
  sont les plus justes.
