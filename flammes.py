#!/usr/bin/env python3
"""Envoie automatiquement un snap a une liste d'amis pour garder les flammes.

Fonctionne avec un telephone Android branche (USB ou Wi-Fi) via ADB.

Usage :
    python flammes.py run            # envoie les snaps
    python flammes.py run --dry-run  # simule sans rien envoyer
    python flammes.py dump           # affiche les textes visibles a l'ecran (calibrage)
    python flammes.py tap X Y        # teste un tap a des coordonnees
"""

import argparse
import json
import logging
import random
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
LOG_PATH = ROOT / "flammes.log"
SNAPCHAT_PKG = "com.snapchat.android"

log = logging.getLogger("flammes")


# --------------------------------------------------------------------------- ADB

class Adb:
    def __init__(self, serial=None, dry_run=False):
        self.base = ["adb"] + (["-s", serial] if serial else [])
        self.dry_run = dry_run

    def run(self, *args, check=True):
        cmd = self.base + list(args)
        log.debug("$ %s", " ".join(cmd))
        res = subprocess.run(cmd, capture_output=True, text=True)
        if check and res.returncode != 0:
            raise RuntimeError(f"adb a echoue : {' '.join(cmd)}\n{res.stderr.strip()}")
        return res.stdout

    def shell(self, *args, check=True):
        return self.run("shell", *args, check=check)

    def act(self, *args):
        """Commande qui modifie l'etat du telephone (ignoree en dry-run)."""
        if self.dry_run:
            log.info("[dry-run] adb shell %s", " ".join(args))
            return ""
        return self.shell(*args)

    def tap(self, x, y):
        log.info("tap (%d, %d)", x, y)
        self.act("input", "tap", str(int(x)), str(int(y)))

    def swipe(self, x1, y1, x2, y2, ms=300):
        self.act("input", "swipe", *(str(int(v)) for v in (x1, y1, x2, y2, ms)))

    def key(self, keycode):
        self.act("input", "keyevent", keycode)

    def text(self, value):
        # input text ne gere que l'ASCII, et pas les espaces bruts
        ascii_only = value.encode("ascii", "ignore").decode()
        if ascii_only != value:
            log.warning("emojis/accents ignores dans %r (non supportes par adb)", value)
        if ascii_only.strip():
            self.act("input", "text", ascii_only.replace(" ", "%s"))

    def screen_size(self):
        out = self.shell("wm", "size")
        m = re.findall(r"(\d+)x(\d+)", out)
        if not m:
            raise RuntimeError(f"Impossible de lire la taille d'ecran : {out!r}")
        w, h = m[-1]  # "Override size" en dernier s'il existe
        return int(w), int(h)

    def screen_on(self):
        out = self.shell("dumpsys", "power", check=False)
        return "mWakefulness=Awake" in out or "Display Power: state=ON" in out

    def ui_nodes(self):
        """Renvoie la liste des elements visibles : dicts avec text, desc, id, centre."""
        self.shell("uiautomator", "dump", "/sdcard/flammes_ui.xml", check=False)
        xml = self.shell("cat", "/sdcard/flammes_ui.xml", check=False)
        start = xml.find("<?xml")
        if start < 0:
            return []
        return parse_nodes(xml[start:])


def parse_nodes(xml):
    nodes = []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return nodes
    for el in root.iter("node"):
        m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", el.get("bounds", ""))
        if not m:
            continue
        x1, y1, x2, y2 = map(int, m.groups())
        nodes.append({
            "text": el.get("text", ""),
            "desc": el.get("content-desc", ""),
            "id": el.get("resource-id", ""),
            "center": ((x1 + x2) // 2, (y1 + y2) // 2),
        })
    return nodes


def find_node(nodes, labels, exact=False):
    """Cherche un element dont le texte ou la description correspond a un des labels."""
    labels = [l.lower() for l in labels]
    for n in nodes:
        for field in (n["text"], n["desc"]):
            value = field.strip().lower()
            if not value:
                continue
            if any(value == l if exact else l in value for l in labels):
                return n
    return None


# ---------------------------------------------------------------------- Actions

class Bot:
    def __init__(self, adb, cfg):
        self.adb = adb
        self.cfg = cfg
        self.w, self.h = adb.screen_size()
        self.delay = cfg.get("delai_entre_actions", 2.0)

    def wait(self, factor=1.0):
        time.sleep(self.delay * factor)

    def coord(self, name):
        """Coordonnees du config (en pixels, ou en fraction de l'ecran si <= 1)."""
        x, y = self.cfg["coordonnees"][name]
        if x <= 1 and y <= 1:
            x, y = x * self.w, y * self.h
        return x, y

    def tap_label_or_coord(self, labels, coord_name, exact=False):
        node = find_node(self.adb.ui_nodes(), labels, exact)
        if node:
            log.info("trouve '%s'", node["text"] or node["desc"])
            self.adb.tap(*node["center"])
        else:
            log.info("'%s' introuvable a l'ecran, utilisation des coordonnees", labels[0])
            self.adb.tap(*self.coord(coord_name))

    def wake_and_unlock(self):
        if not self.adb.screen_on():
            log.info("reveil de l'ecran")
            self.adb.key("KEYCODE_WAKEUP")
            self.wait(0.5)
        # Glisser vers le haut pour enlever l'ecran de verrouillage
        self.adb.swipe(self.w / 2, self.h * 0.85, self.w / 2, self.h * 0.25)
        self.wait(0.5)
        code = str(self.cfg.get("code_deverrouillage") or "")
        if code:
            log.info("saisie du code de deverrouillage")
            self.adb.text(code)
            self.adb.key("KEYCODE_ENTER")
            self.wait()

    def open_camera(self):
        log.info("ouverture de Snapchat")
        self.adb.act("am", "force-stop", SNAPCHAT_PKG)
        self.wait(0.5)
        self.adb.act("monkey", "-p", SNAPCHAT_PKG,
                     "-c", "android.intent.category.LAUNCHER", "1")
        time.sleep(self.cfg.get("attente_ouverture_snapchat", 6))

    def take_snap(self):
        log.info("prise du snap")
        self.adb.tap(*self.coord("bouton_capture"))
        self.wait(1.5)
        legende = self.cfg.get("legende")
        if legende:
            self.adb.tap(self.w / 2, self.h / 2)
            self.wait(0.5)
            self.adb.text(legende)
            self.adb.key("KEYCODE_BACK")  # ferme le clavier
            self.wait(0.5)

    def open_send_to(self):
        log.info("ouverture de la liste d'envoi")
        self.tap_label_or_coord(["Send To", "Envoyer à", "Envoyer a"], "bouton_envoyer_a")
        self.wait(1.5)

    def select_friends(self):
        missing = []
        for friend in self.cfg["amis"]:
            if self.select_friend(friend):
                log.info("  ✓ %s", friend)
            else:
                log.warning("  ✗ %s introuvable", friend)
                missing.append(friend)
        return missing

    def select_friend(self, friend):
        # 1) cherche dans la liste visible, en scrollant un peu
        for _ in range(self.cfg.get("scrolls_max", 4) + 1):
            node = find_node(self.adb.ui_nodes(), [friend], exact=True)
            if node:
                self.adb.tap(*node["center"])
                self.wait(0.5)
                return True
            self.adb.swipe(self.w / 2, self.h * 0.75, self.w / 2, self.h * 0.35, 400)
            self.wait(0.7)
        # remonte en haut de la liste pour l'ami suivant
        for _ in range(self.cfg.get("scrolls_max", 4)):
            self.adb.swipe(self.w / 2, self.h * 0.35, self.w / 2, self.h * 0.8, 200)
        self.wait(0.5)
        return False

    def send(self):
        log.info("envoi")
        self.tap_label_or_coord(["Send", "Envoyer"], "bouton_envoyer", exact=True)
        self.wait(2)

    def finish(self):
        self.adb.key("KEYCODE_HOME")
        if self.cfg.get("verrouiller_apres", True):
            self.wait(0.5)
            self.adb.key("KEYCODE_POWER")

    def run(self):
        self.wake_and_unlock()
        self.open_camera()
        self.take_snap()
        self.open_send_to()
        missing = self.select_friends()
        if len(missing) == len(self.cfg["amis"]):
            log.error("Aucun ami trouve, annulation de l'envoi.")
            self.adb.key("KEYCODE_BACK")
            self.finish()
            return False
        self.send()
        self.finish()
        if missing:
            log.warning("Non envoye a : %s", ", ".join(missing))
        return not missing


# -------------------------------------------------------------------------- CLI

def load_config():
    if not CONFIG_PATH.exists():
        sys.exit("config.json introuvable. Copie config.example.json en config.json et remplis-le.")
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not cfg.get("amis"):
        sys.exit("Ajoute au moins un ami dans \"amis\" (config.json).")
    return cfg


def main():
    parser = argparse.ArgumentParser(description="Garde tes flammes Snapchat automatiquement.")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_run = sub.add_parser("run", help="envoyer les snaps")
    p_run.add_argument("--dry-run", action="store_true", help="simuler sans rien toucher")
    p_run.add_argument("--now", action="store_true", help="ignorer le delai aleatoire")
    sub.add_parser("dump", help="lister les elements visibles a l'ecran")
    p_tap = sub.add_parser("tap", help="tester un tap")
    p_tap.add_argument("x", type=float)
    p_tap.add_argument("y", type=float)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(),
                  logging.FileHandler(LOG_PATH, encoding="utf-8")],
    )

    cfg = load_config()
    adb = Adb(cfg.get("appareil"), dry_run=getattr(args, "dry_run", False))

    if args.cmd == "dump":
        for n in adb.ui_nodes():
            if n["text"] or n["desc"]:
                print(f"{n['center']!s:>14}  text={n['text']!r}  desc={n['desc']!r}")
        print("\nTaille ecran :", adb.screen_size())
        return

    if args.cmd == "tap":
        adb.tap(args.x, args.y)
        return

    jitter = cfg.get("delai_aleatoire_max_minutes", 0)
    if jitter and not args.now and not args.dry_run:
        wait = random.uniform(0, jitter * 60)
        log.info("attente aleatoire de %d s", wait)
        time.sleep(wait)

    log.info("=== Envoi des flammes a %d ami(s) ===", len(cfg["amis"]))
    try:
        ok = Bot(adb, cfg).run()
    except Exception:
        log.exception("Erreur pendant l'envoi")
        sys.exit(1)
    log.info("=== Termine %s ===", "avec succes" if ok else "avec des erreurs")
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()
