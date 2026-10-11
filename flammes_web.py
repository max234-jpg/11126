#!/usr/bin/env python3
"""Envoie automatiquement un snap a une liste d'amis depuis Snapchat Web (navigateur du PC).

Usage :
    python flammes_web.py login          # 1re fois : ouvre le navigateur pour te connecter
    python flammes_web.py run            # envoie les snaps
    python flammes_web.py run --now      # sans le delai aleatoire
    python flammes_web.py inspect        # ouvre l'inspecteur Playwright (calibrage)
"""

import argparse
import json
import logging
import random
import re
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import Error as PwError
    from playwright.sync_api import TimeoutError as PwTimeout
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Playwright manque : pip install playwright && playwright install chromium")

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config_web.json"
PROFILE_DIR = ROOT / "profil_navigateur"
SHOTS_DIR = ROOT / "captures"
LOG_PATH = ROOT / "flammes_web.log"

DEFAULT_URL = "https://www.snapchat.com/web"

# Plusieurs selecteurs possibles par bouton : le premier visible gagne.
# Snapchat change parfois son site ; ajuste-les dans config_web.json ("selecteurs").
DEFAULT_SELECTORS = {
    "recherche": [
        "input[placeholder*='Search' i]",
        "input[placeholder*='Rechercher' i]",
        "[aria-label*='Search' i]",
        "[aria-label*='Rechercher' i]",
    ],
    "camera_conversation": [
        "button[aria-label*='camera' i]",
        "button[aria-label*='caméra' i]",
        "[title*='camera' i]",
        "[title*='caméra' i]",
        "role=button[name=/cam[eé]ra/i]",
    ],
    "capture": [
        "button[aria-label*='capture' i]",
        "button[aria-label*='take' i]",
        "button[aria-label*='prendre' i]",
        "role=button[name=/capture|take snap|prendre/i]",
    ],
    "envoyer": [
        "button[aria-label*='send' i]",
        "button[aria-label*='envoyer' i]",
        "button:has-text('Send')",
        "button:has-text('Envoyer')",
        "role=button[name=/send|envoyer/i]",
    ],
    "page_connexion": [
        "input[name='accountIdentifier']",
        "input[type='password']",
        "a[href*='accounts.snapchat.com']",
    ],
}

log = logging.getLogger("flammes_web")


class Introuvable(Exception):
    pass


# ---------------------------------------------------------------- Navigateur

def launch(pw, cfg, headless):
    args = ["--use-fake-ui-for-media-stream"]  # accepte la camera sans popup
    camera = cfg.get("camera", "webcam")
    if camera != "webcam":
        args.append("--use-fake-device-for-media-stream")
        if camera != "test":
            path = (ROOT / camera).resolve()
            if not path.exists():
                sys.exit(f"Fichier camera introuvable : {path}")
            args.append(f"--use-file-for-fake-video-capture={path}")

    opts = dict(
        user_data_dir=str(PROFILE_DIR),
        headless=headless,
        args=args,
        viewport={"width": 1280, "height": 860},
        locale=cfg.get("langue", "fr-FR"),
    )
    if cfg.get("chemin_navigateur"):
        opts["executable_path"] = cfg["chemin_navigateur"]
    channel = None if opts.get("executable_path") else cfg.get("navigateur", "chrome")
    try:
        ctx = pw.chromium.launch_persistent_context(channel=channel or None, **opts)
    except PwError as e:
        if not channel:
            raise
        log.warning("navigateur '%s' indisponible (%s), utilisation de Chromium",
                    channel, str(e).splitlines()[0])
        ctx = pw.chromium.launch_persistent_context(**opts)
    try:
        ctx.grant_permissions(["camera", "microphone"])
    except PwError:
        pass
    return ctx


class Bot:
    def __init__(self, page, cfg):
        self.page = page
        self.cfg = cfg
        self.sel = {**DEFAULT_SELECTORS, **cfg.get("selecteurs", {})}
        self.delay = cfg.get("delai_entre_actions", 1.5)
        self.timeout = cfg.get("timeout_secondes", 10) * 1000

    def pause(self, factor=1.0):
        time.sleep(self.delay * factor)

    def find(self, key, timeout=None):
        """Renvoie le premier element visible parmi les selecteurs de `key`."""
        timeout = self.timeout if timeout is None else timeout
        deadline = time.monotonic() + timeout / 1000
        while True:
            for s in self.sel[key]:
                loc = self.page.locator(s).first
                try:
                    if loc.is_visible():
                        log.debug("%s -> %s", key, s)
                        return loc
                except PwError:
                    continue
            if time.monotonic() > deadline:
                raise Introuvable(key)
            time.sleep(0.3)

    def click(self, key, timeout=None):
        self.find(key, timeout).click()
        self.pause()

    def screenshot(self, name):
        SHOTS_DIR.mkdir(exist_ok=True)
        path = SHOTS_DIR / f"{time.strftime('%Y%m%d-%H%M%S')}-{name}.png"
        try:
            self.page.screenshot(path=str(path))
            log.info("capture d'ecran : %s", path)
        except PwError:
            pass

    def open_home(self):
        log.info("ouverture de Snapchat Web")
        self.page.goto(self.cfg.get("url", DEFAULT_URL), wait_until="domcontentloaded")
        time.sleep(self.cfg.get("attente_chargement", 6))
        if "accounts.snapchat.com" in self.page.url:
            return False
        try:
            self.find("page_connexion", timeout=500)
            return False
        except Introuvable:
            return True

    def open_chat(self, friend):
        exact = re.compile(rf"^\s*{re.escape(friend)}\s*$")
        item = self.page.get_by_text(exact).first
        try:
            item.wait_for(state="visible", timeout=3000)
        except PwTimeout:
            # Pas dans les conversations recentes : passer par la recherche
            log.info("  %s pas visible, recherche...", friend)
            box = self.find("recherche")
            box.click()
            try:
                box.fill("")
            except PwError:
                self.page.keyboard.press("ControlOrMeta+A")
            self.pause(0.5)
            self.page.keyboard.type(friend, delay=60)
            self.pause()
            item = self.page.get_by_text(exact).first
            try:
                item.wait_for(state="visible", timeout=self.timeout)
            except PwTimeout:
                raise Introuvable(f"ami '{friend}'")
        item.click()
        self.pause()

    def send_snap(self, friend):
        self.open_chat(friend)
        self.click("camera_conversation")
        time.sleep(self.cfg.get("attente_camera", 3))
        self.click("capture")
        self.pause()
        self.click("envoyer")
        self.pause(1.5)
        # Retour a l'accueil pour repartir d'un etat propre
        self.page.keyboard.press("Escape")
        self.pause(0.5)

    def run(self):
        if not self.open_home():
            log.error("Pas connecte a Snapchat. Lance d'abord : python flammes_web.py login")
            self.screenshot("non-connecte")
            return False
        missing = []
        for friend in self.cfg["amis"]:
            try:
                self.send_snap(friend)
                log.info("  ✓ %s", friend)
            except (Introuvable, PwError) as e:
                log.warning("  ✗ %s : element introuvable (%s)", friend, str(e).splitlines()[0])
                self.screenshot(re.sub(r"\W+", "_", friend))
                missing.append(friend)
                self.open_home()  # recharge la page avant l'ami suivant
        if missing:
            log.warning("Non envoye a : %s", ", ".join(missing))
        return not missing


# ------------------------------------------------------------------------ CLI

def load_config():
    if not CONFIG_PATH.exists():
        sys.exit("config_web.json introuvable. Copie config_web.example.json en config_web.json et remplis-le.")
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not cfg.get("amis"):
        sys.exit("Ajoute au moins un ami dans \"amis\" (config_web.json).")
    return cfg


def main():
    parser = argparse.ArgumentParser(description="Garde tes flammes Snapchat depuis le navigateur.")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("login", help="se connecter a Snapchat (a faire une fois)")
    p_run = sub.add_parser("run", help="envoyer les snaps")
    p_run.add_argument("--now", action="store_true", help="ignorer le delai aleatoire")
    sub.add_parser("inspect", help="ouvrir l'inspecteur Playwright pour trouver les selecteurs")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(),
                  logging.FileHandler(LOG_PATH, encoding="utf-8")],
    )
    cfg = load_config()

    if args.cmd == "run":
        jitter = cfg.get("delai_aleatoire_max_minutes", 0)
        if jitter and not args.now:
            wait = random.uniform(0, jitter * 60)
            log.info("attente aleatoire de %d s", wait)
            time.sleep(wait)

    headless = args.cmd == "run" and cfg.get("navigateur_invisible", False)
    with sync_playwright() as pw:
        ctx = launch(pw, cfg, headless)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.set_default_timeout(cfg.get("timeout_secondes", 10) * 1000)
        try:
            if args.cmd == "login":
                page.goto(cfg.get("url", DEFAULT_URL))
                input("\nConnecte-toi dans la fenetre (coche « Rester connecte »), "
                      "puis appuie sur Entree ici...")
                log.info("Session enregistree dans %s", PROFILE_DIR.name)
                return
            if args.cmd == "inspect":
                page.goto(cfg.get("url", DEFAULT_URL))
                print("Utilise le bouton « Pick locator » de l'inspecteur pour copier un selecteur.")
                page.pause()
                return

            log.info("=== Envoi des flammes a %d ami(s) ===", len(cfg["amis"]))
            try:
                ok = Bot(page, cfg).run()
            except Exception:
                log.exception("Erreur pendant l'envoi")
                ok = None
        finally:
            ctx.close()

    if ok is None:
        sys.exit(1)
    log.info("=== Termine %s ===", "avec succes" if ok else "avec des erreurs")
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()
