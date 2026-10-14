#!/usr/bin/env python3
"""Source unique de la carte AI-CAM : composants, empreintes KiCad et connexions.

Génère, sans dépendance externe :
  - ai_cam.net   : netlist KiCad (format "E"), à importer dans Pcbnew
                   (Fichier > Importer > Netlist)
  - BOM.csv      : nomenclature groupée (codes LCSC indicatifs, à vérifier)
  - NETLIST.md   : netlist lisible, net par net

Lancer :  python3 gen_netlist.py
Le script s'arrête en erreur si une broche est connectée deux fois ou si un
net n'a qu'une seule connexion.
"""

import csv
import datetime
import pathlib
import sys
from collections import defaultdict

HERE = pathlib.Path(__file__).resolve().parent

R0402 = "Resistor_SMD:R_0402_1005Metric"
C0402 = "Capacitor_SMD:C_0402_1005Metric"
C0603 = "Capacitor_SMD:C_0603_1608Metric"
C0805 = "Capacitor_SMD:C_0805_2012Metric"
C1206 = "Capacitor_SMD:C_1206_3216Metric"
LED0402 = "LED_SMD:LED_0402_1005Metric"
SOT23_3 = "Package_TO_SOT_SMD:SOT-23-3"
SOT23_5 = "Package_TO_SOT_SMD:SOT-23-5"
SOT23_6 = "Package_TO_SOT_SMD:SOT-23-6"

# ref: (valeur, empreinte, référence fabricant, LCSC, description)
PARTS = {}
# net: [(ref, pad), ...]
NETS = defaultdict(list)


def part(ref, value, footprint, mpn="", lcsc="", desc=""):
    PARTS[ref] = (value, footprint, mpn, lcsc, desc)


def conn(ref, pads):
    """pads : {pad: net}. Les pads absents restent non connectés."""
    assert ref in PARTS, ref
    for pad, net in pads.items():
        NETS[net].append((ref, str(pad)))


def two(ref, value, footprint, net1, net2, mpn="", lcsc="", desc=""):
    part(ref, value, footprint, mpn, lcsc, desc)
    conn(ref, {1: net1, 2: net2})


# ---------------------------------------------------------------- MCU
part("U1", "ESP32-S3-MINI-1-N4R2", "RF_Module:ESP32-S2-MINI-1",  # même empreinte que le S3-MINI-1 (symbole KiCad officiel)
     "ESP32-S3-MINI-1-N4R2", "C2913206",
     "Module Wi-Fi/BLE, 4 Mo flash, 2 Mo PSRAM, antenne PCB")
esp_gnd = [1, 2, 42, 43] + list(range(46, 66))
conn("U1", {p: "GND" for p in esp_gnd})
conn("U1", {
    3: "+3V3",
    45: "EN",
    4: "IO0_BOOT",
    5: "BTN_PHOTO",     # IO1  (RTC : réveil deep-sleep)
    6: "LED_STATUS",    # IO2
    8: "VBAT_SENSE",    # IO4  (ADC1_CH3)
    9: "BOOST_EN",      # IO5
    10: "US_A",         # IO6  porteuse 40 kHz
    11: "US_B",         # IO7  porteuse 40 kHz inversée
    14: "CAM_XCLK",     # IO10
    15: "CAM_D6",       # IO11
    16: "CAM_D5",       # IO12
    17: "CAM_PCLK",     # IO13
    18: "CAM_D4",       # IO14
    19: "CAM_D0",       # IO15
    20: "CAM_D3",       # IO16
    21: "CAM_D1",       # IO17
    22: "CAM_D2",       # IO18
    23: "USB_DN",       # IO19
    24: "USB_DP",       # IO20
    25: "CAM_PWDN",     # IO21
    27: "CAM_HREF",     # IO47
    30: "CAM_D7",       # IO48
    34: "CAM_VSYNC",    # IO38
    35: "CAM_SCL",      # IO39
    36: "CAM_SDA",      # IO40
})
two("C1", "22uF", C0805, "+3V3", "GND", "CL21A226MAQNNNE", "C45783", "Découplage 3V3 module")
two("C2", "100nF", C0402, "+3V3", "GND", "CL05B104KO5NNNC", "C1525", "Découplage 3V3 module")
two("R1", "10k", R0402, "+3V3", "EN", "0402WGF1002TCE", "C25744", "Pull-up EN")
two("C3", "1uF", C0402, "EN", "GND", "CL05A105KA5NQNC", "C52923", "Délai reset EN")
two("R2", "10k", R0402, "+3V3", "IO0_BOOT", "0402WGF1002TCE", "C25744", "Pull-up BOOT")

part("SW1", "PHOTO", "Button_Switch_SMD:SW_SPST_TL3342", "TL3342F160QG", "C318884",
     "Bouton prise de photo")
conn("SW1", {1: "BTN_PHOTO", 2: "GND"})
part("SW2", "BOOT", "Button_Switch_SMD:SW_SPST_PTS810", "PTS810SJM250SMTRLFS", "C221929",
     "Bouton BOOT (programmation)")
conn("SW2", {1: "IO0_BOOT", 2: "GND"})
part("SW3", "RESET", "Button_Switch_SMD:SW_SPST_PTS810", "PTS810SJM250SMTRLFS", "C221929",
     "Bouton RESET")
conn("SW3", {1: "EN", 2: "GND"})

two("R3", "1k", R0402, "LED_STATUS", "LED1_A", "0402WGF1001TCE", "C11702", "")
two("LED1", "BLEU", LED0402, "GND", "LED1_A", "KT-0402B", "C2827396",
    "LED d'état (1=K, 2=A)")

# ---------------------------------------------------------------- USB-C
part("J1", "USB-C", "Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",
     "USB4105-GF-A", "C3020560", "USB-C 16P : charge + programmation USB natif")
conn("J1", {
    "A4": "VBUS", "B4": "VBUS", "A9": "VBUS", "B9": "VBUS",
    "A1": "GND", "B1": "GND", "A12": "GND", "B12": "GND", "SH": "GND",
    "A5": "CC1", "B5": "CC2",
    "A6": "USB_DP", "B6": "USB_DP", "A7": "USB_DN", "B7": "USB_DN",
})
two("R4", "5.1k", R0402, "CC1", "GND", "0402WGF5101TCE", "C25905", "CC1 sink 5 V")
two("R5", "5.1k", R0402, "CC2", "GND", "0402WGF5101TCE", "C25905", "CC2 sink 5 V")
part("U9", "USBLC6-2SC6", SOT23_6, "USBLC6-2SC6", "C7519", "Protection ESD USB")
conn("U9", {1: "USB_DN", 6: "USB_DN", 3: "USB_DP", 4: "USB_DP", 2: "GND", 5: "VBUS"})
two("C4", "10uF", C0603, "VBUS", "GND", "CL10A106MQ8NNNC", "C96446", "")

# ---------------------------------------------------------------- Chargeur LiPo + power-path
part("U2", "MCP73831T-2ACI/OT", SOT23_5, "MCP73831T-2ACI/OT", "C424093",
     "Chargeur Li-Po 4,2 V")
conn("U2", {1: "CHG_STAT", 2: "GND", 3: "VBAT", 4: "VBUS", 5: "CHG_PROG"})
two("R6", "3.3k", R0402, "CHG_PROG", "GND", "0402WGF3301TCE", "C25890", "I charge = 300 mA")
two("C5", "4.7uF", C0603, "VBAT", "GND", "CL10A475KO8NNNC", "C19666", "")
two("R7", "1k", R0402, "VBUS", "LED2_A", "0402WGF1001TCE", "C11702", "")
two("LED2", "ROUGE", LED0402, "CHG_STAT", "LED2_A", "KT-0402R", "C2827400",
    "LED charge (1=K, 2=A)")

part("J2", "BATT", "Connector_JST:JST_SH_SM02B-SRSS-TB_1x02-1MP_P1.00mm_Horizontal",
     "SM02B-SRSS-TB", "C160402", "Batterie Li-Po 1S (ex. 402030, 300 mAh)")
conn("J2", {1: "VBAT", 2: "GND"})

two("D1", "B5819W", "Diode_SMD:D_SOD-123", "VSYS", "VBUS", "B5819W", "C8598",
    "Power-path USB -> VSYS (1=K, 2=A)")
part("Q1", "DMG2305UX", SOT23_3, "DMG2305UX-7", "C150470",
     "P-MOS power-path batterie -> VSYS")
conn("Q1", {1: "VBUS", 2: "VSYS", 3: "VBAT"})
two("R8", "100k", R0402, "VBUS", "GND", "0402WGF1003TCE", "C25741", "Tire la grille de Q1 à 0 sans USB")
two("C6", "10uF", C0603, "VSYS", "GND", "CL10A106MQ8NNNC", "C96446", "")

# ---------------------------------------------------------------- 3V3
part("U3", "AP2112K-3.3", SOT23_5, "AP2112K-3.3TRG1", "C51118", "LDO 3,3 V 600 mA")
conn("U3", {1: "VSYS", 2: "GND", 3: "VSYS", 5: "+3V3"})
two("C7", "1uF", C0402, "VSYS", "GND", "CL05A105KA5NQNC", "C52923", "")

two("R9", "220k", R0402, "VBAT", "VBAT_SENSE", "0402WGF2203TCE", "C25767", "Pont mesure batterie")
two("R10", "220k", R0402, "VBAT_SENSE", "GND", "0402WGF2203TCE", "C25767", "Pont mesure batterie")
two("C9", "100nF", C0402, "VBAT_SENSE", "GND", "CL05B104KO5NNNC", "C1525", "")

# ---------------------------------------------------------------- Caméra OV2640
part("U4", "XC6206P282MR", SOT23_3, "XC6206P282MR", "C14949", "LDO 2,8 V (AVDD caméra)")
conn("U4", {1: "GND", 2: "+2V8", 3: "+3V3"})
part("U5", "XC6206P122MR", SOT23_3, "XC6206P122MR", "C21659", "LDO 1,2 V (DVDD caméra)")
conn("U5", {1: "GND", 2: "+1V2", 3: "+3V3"})
two("C10", "1uF", C0402, "+2V8", "GND", "CL05A105KA5NQNC", "C52923", "")
two("C11", "1uF", C0402, "+1V2", "GND", "CL05A105KA5NQNC", "C52923", "")
two("C12", "1uF", C0402, "+3V3", "GND", "CL05A105KA5NQNC", "C52923", "")

part("J3", "OV2640 FPC24", "Connector_FFC-FPC:Hirose_FH12-24S-0.5SH_1x24-1MP_P0.50mm_Horizontal",
     "FH12-24S-0.5SH(55)", "C506791",
     "Connecteur nappe caméra 24P 0,5 mm (brochage type ESP32-CAM)")
conn("J3", {
    2: "GND", 3: "CAM_SDA", 4: "+2V8", 5: "CAM_SCL", 6: "CAM_RESET",
    7: "CAM_VSYNC", 8: "CAM_PWDN", 9: "CAM_HREF", 10: "+1V2", 11: "+3V3",
    12: "CAM_D7", 13: "CAM_XCLK", 14: "CAM_D6", 15: "GND", 16: "CAM_D5",
    17: "CAM_PCLK", 18: "CAM_D4", 19: "CAM_D0", 20: "CAM_D3", 21: "CAM_D1",
    22: "CAM_D2", "MP": "GND",
})
two("R11", "4.7k", R0402, "+3V3", "CAM_SDA", "0402WGF4701TCE", "C25900", "Pull-up SCCB")
two("R12", "4.7k", R0402, "+3V3", "CAM_SCL", "0402WGF4701TCE", "C25900", "Pull-up SCCB")
two("R13", "10k", R0402, "+3V3", "CAM_RESET", "0402WGF1002TCE", "C25744", "Reset caméra RC")
two("C13", "100nF", C0402, "CAM_RESET", "GND", "CL05B104KO5NNNC", "C1525", "")
two("R14", "10k", R0402, "+3V3", "CAM_PWDN", "0402WGF1002TCE", "C25744",
    "Caméra éteinte par défaut (deep-sleep)")

# ---------------------------------------------------------------- Haut-parleur ultrason
part("U6", "MT3608", SOT23_6, "MT3608", "C84817", "Boost VSYS -> 11,4 V")
conn("U6", {1: "BOOST_SW", 2: "GND", 3: "BOOST_FB", 4: "BOOST_EN", 5: "VSYS"})
two("L1", "10uH", "Inductor_SMD:L_Taiyo-Yuden_NR-40xx", "VSYS", "BOOST_SW",
    "NR4018T100M", "C83459", "Inductance boost (Isat >= 1 A)")
two("D2", "SS34", "Diode_SMD:D_SMA", "+12V", "BOOST_SW", "SS34", "C8678",
    "Diode boost (1=K, 2=A)")
two("R15", "180k", R0402, "+12V", "BOOST_FB", "0402WGF1803TCE", "C25780",
    "Vout = 0,6 x (1 + 180k/10k) = 11,4 V")
two("R16", "10k", R0402, "BOOST_FB", "GND", "0402WGF1002TCE", "C25744", "")
two("R17", "100k", R0402, "BOOST_EN", "GND", "0402WGF1003TCE", "C25741", "Boost coupé par défaut")
two("C14", "22uF 25V", C1206, "+12V", "GND", "CL31A226KAHNNNE", "C12891", "Sortie boost")
two("C15", "22uF", C0805, "VSYS", "GND", "CL21A226MAQNNNE", "C45783", "Entrée boost")

part("U7", "TC4427AEOA", "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm", "TC4427AEOA", "C185143",
     "Double driver 1,5 A monté en pont -> transducteurs")
conn("U7", {2: "US_A", 3: "GND", 4: "US_B", 5: "US_OUT_B", 6: "+12V", 7: "US_OUT_A"})
two("C16", "10uF 25V", C0805, "+12V", "GND", "CL21A106KAYNNNE", "C15850", "Découplage driver")
two("C17", "100nF", C0402, "+12V", "GND", "CL05B104KO5NNNC", "C1525", "Découplage driver")
two("R18", "100k", R0402, "US_A", "GND", "0402WGF1003TCE", "C25741", "Driver au repos au boot")
two("R19", "100k", R0402, "US_B", "GND", "0402WGF1003TCE", "C25741", "Driver au repos au boot")

part("J4", "US_ARRAY", "Connector_JST:JST_SH_SM02B-SRSS-TB_1x02-1MP_P1.00mm_Horizontal",
     "SM02B-SRSS-TB", "C160402", "Vers réseau de transducteurs 40 kHz (en parallèle)")
conn("J4", {1: "US_OUT_A", 2: "US_OUT_B"})


# ---------------------------------------------------------------- Vérifications
def check():
    errors = []
    seen = {}
    for net, nodes in NETS.items():
        if len(nodes) < 2:
            errors.append(f"net {net} n'a qu'une connexion : {nodes}")
        for node in nodes:
            if node in seen:
                errors.append(f"{node} connecté à {seen[node]} et {net}")
            seen[node] = net
    unused = set(PARTS) - {r for nodes in NETS.values() for r, _ in nodes}
    if unused:
        errors.append(f"composants sans connexion : {sorted(unused)}")
    return errors


def ref_key(ref):
    head = ref.rstrip("0123456789")
    return head, int(ref[len(head):] or 0)


def write_kicad_netlist(path):
    q = lambda s: '"' + str(s).replace('"', "'") + '"'
    out = ["(export (version \"E\")",
           f"  (design (source \"gen_netlist.py\") (date {q(datetime.date.today())}) (tool \"gen_netlist.py\"))",
           "  (components"]
    for ref in sorted(PARTS, key=ref_key):
        value, fp, mpn, lcsc, desc = PARTS[ref]
        out.append(f"    (comp (ref {q(ref)}) (value {q(value)}) (footprint {q(fp)})")
        out.append(f"      (fields (field (name \"MPN\") {q(mpn)}) (field (name \"LCSC\") {q(lcsc)}))")
        out.append(f"      (libsource (lib \"ai_cam\") (part {q(value)}) (description {q(desc)})))")
    out.append("  )")
    out.append("  (nets")
    for code, net in enumerate(sorted(NETS), start=1):
        out.append(f"    (net (code {q(code)}) (name {q('/' + net)})")
        for ref, pad in sorted(NETS[net], key=lambda n: (ref_key(n[0]), n[1])):
            out.append(f"      (node (ref {q(ref)}) (pin {q(pad)}))")
        out.append("    )")
    out.append("  )")
    out.append(")")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def write_bom(path):
    groups = defaultdict(list)
    for ref, (value, fp, mpn, lcsc, desc) in PARTS.items():
        groups[(value, fp, mpn, lcsc)].append((ref, desc))
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Références", "Qté", "Valeur", "Empreinte", "Référence fabricant", "LCSC (indicatif, à vérifier)", "Rôle"])
        for (value, fp, mpn, lcsc), items in sorted(groups.items(), key=lambda g: ref_key(sorted(g[1])[0][0])):
            refs = sorted((r for r, _ in items), key=ref_key)
            desc = "; ".join(sorted({d for _, d in items if d}))
            w.writerow([" ".join(refs), len(refs), value, fp.split(":")[1], mpn, lcsc, desc])


def write_markdown(path):
    lines = ["# Netlist AI-CAM (générée par gen_netlist.py — ne pas éditer à la main)", ""]
    lines.append("| Net | Connexions |")
    lines.append("|---|---|")
    for net in sorted(NETS):
        nodes = ", ".join(f"{r}.{p}" for r, p in sorted(NETS[net], key=lambda n: (ref_key(n[0]), n[1])))
        lines.append(f"| `{net}` | {nodes} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    errs = check()
    if errs:
        print("\n".join(errs), file=sys.stderr)
        sys.exit(1)
    write_kicad_netlist(HERE / "ai_cam.net")
    write_bom(HERE / "BOM.csv")
    write_markdown(HERE / "NETLIST.md")
    print(f"OK : {len(PARTS)} composants, {len(NETS)} nets")
