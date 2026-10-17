# Matériel AI-CAM

Source unique : [`gen_netlist.py`](gen_netlist.py). Il génère :

- [`ai_cam.net`](ai_cam.net) — netlist KiCad (Pcbnew → *Fichier → Importer → Netlist*) ;
- [`BOM.csv`](BOM.csv) — nomenclature groupée ;
- [`NETLIST.md`](NETLIST.md) — netlist lisible.

Modifier le script puis relancer `python3 gen_netlist.py` ; il refuse une
broche connectée deux fois ou un net à une seule connexion.

## Schéma fonctionnel

```
USB-C ─┬─ USBLC6 (ESD) ── D+/D- ─────────────────────────► ESP32-S3 IO19/IO20
       ├─ VBUS ─► MCP73831 ─► VBAT ── J2 Li-Po
       └─ VBUS ─► B5819W ─┐
           VBAT ─► P-MOS ─┴► VSYS ─┬─► AP2112K ─► 3V3 ─┬─► ESP32-S3-MINI-1
                                   │                   ├─► XC6206 2V8 ─► caméra AVDD
                                   │                   └─► XC6206 1V2 ─► caméra DVDD
                                   └─► MT3608 boost ─► 11,4 V ─► TC4427A ─► J4 transducteurs
```

## Affectation des broches ESP32-S3

| GPIO | Fonction | | GPIO | Fonction |
|---|---|---|---|---|
| 0 | BOOT (SW2) | | 13 | CAM PCLK |
| 1 | **Bouton photo** (SW1, réveil RTC) | | 14 | CAM D4 |
| 2 | LED d'état | | 15 / 17 / 18 / 16 | CAM D0 / D1 / D2 / D3 |
| 4 | Mesure batterie (pont ½) | | 19 / 20 | USB D− / D+ |
| 5 | Activation boost 11,4 V | | 21 | CAM PWDN |
| 6 | Ultrason A (40 kHz) | | 38 | CAM VSYNC |
| 7 | Ultrason B (A inversé) | | 39 / 40 | CAM SCL / SDA |
| 10 | CAM XCLK (20 MHz) | | 47 | CAM HREF |
| 11 / 12 | CAM D6 / D5 | | 48 | CAM D7 |

Le brochage caméra reprend celui de la XIAO ESP32S3 Sense (éprouvé sur S3).
Libres pour évolution : IO3, IO8, IO9, IO33-37, IO41-42, IO45-46, TX0/RX0.

## Haut-parleur ultrason (paramétrique)

Principe : une porteuse 40 kHz modulée en amplitude par la voix. L'air,
non linéaire, démodule le signal : on entend la voix dans un faisceau étroit.

- **Modulation** : le firmware fait varier le rapport cyclique D du signal
  carré ; l'amplitude du fondamental vaut sin(πD). L'enveloppe est
  pré-corrigée en racine carrée (la démodulation dans l'air est
  quadratique), d'où D = asin(√((1 + m·x)/2)) / π, tabulé sur 256 valeurs.
- **Pont** : les deux sorties du TC4427A reçoivent A et NON A → ±11,4 V,
  soit 22,8 V crête-crête sur les transducteurs.
- **Réseau** (carte fille ou câblé sur J4) : 7 transducteurs 40 kHz **de
  même phase, tous en parallèle, même polarité**, en hexagone serré.
  - compact : 7 × 10 mm (type MA40S4S / 10 mm 40 kHz), Ø ≈ 32 mm, volume faible ;
  - recommandé : 7 × 16 mm (type TCT40-16T), Ø ≈ 50 mm, nettement plus fort.
  - Plus de transducteurs (19, 37) = plus de volume et de directivité.
- **Ce qu'il faut savoir** : avec 7 transducteurs, la voix est faible
  (audible à ~1-2 m dans l'axe), sans graves et un peu métallique — c'est la
  physique du paramétrique. Ne pas viser l'oreille à bout portant de façon
  prolongée ; 40 kHz est audible par certains animaux (chiens, chats).
- **Variante son classique** : si l'intelligibilité prime, remplacer
  U6/U7/J4 par un MAX98357A (I²S, 3 × 3 mm) et un micro haut-parleur
  15 × 10 mm, sur IO6/IO7 + un GPIO libre — carte encore plus petite.

## Placement et routage (à faire dans Pcbnew)

Carte **22 × 36 mm**, 4 couches (signal / GND plein / alim / signal), 0,8 mm.

- **Face avant** : module ESP32-S3-MINI-1 en haut, **antenne débordant ou
  au bord** avec zone d'exclusion cuivre (toutes couches) sous l'antenne
  conforme à la datasheet ; connecteur caméra J3 au centre, caméra repliée
  sur la face avant avec trou ou découpe pour l'objectif ; SW1 sur le côté.
- **Face arrière** : USB-C en bas, chargeur, power-path, LDO, boost, driver,
  J2 et J4.
- Boost : boucle SW → D2 → C14 → GND la plus courte possible, L1 collée à
  U6, retour GND direct sur le plan ; éloigner du bus caméra et de l'antenne.
- TC4427A : C16/C17 au plus près de la broche 6 ; pistes de sortie
  ≥ 0,3 mm.
- Bus caméra (D0-D7, PCLK, HREF, VSYNC, XCLK) : pistes courtes, sur plan
  GND continu, XCLK éloigné des données ; longueurs proches à ±5 mm.
- USB D+/D− en paire différentielle 90 Ω, USBLC6 près du connecteur.
- Découplage 3V3 (C1, C2) contre la broche 3 du module.

## À vérifier avant commande

1. **Nappe caméra** : le brochage 24 broches (type ESP32-CAM) varie selon les
   vendeurs, ainsi que le côté des contacts (dessus/dessous). Comparer avec
   la fiche de ton module OV2640 ; inverser l'ordre si nécessaire.
2. **Stock** : les codes LCSC de `BOM.csv` ont été vérifiés un par un
   contre le catalogue le 2026-10-17 ; revérifier le stock le jour de la
   commande (SW1 et U1 ont peu de stock).
3. **Antenne** : respecter la zone d'exclusion de la datasheet du module.
4. **Boost** : L1 (ANR4018T100M) est donnée pour 1,2 A ; ne pas la remplacer par moins.
5. **Polarité LED / diodes** : convention empreinte KiCad 1 = cathode.
6. Faire un DRC complet et un contrôle visuel 3D avant fabrication.
