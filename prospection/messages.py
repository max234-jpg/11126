"""Rédaction du message et des liens WhatsApp."""

import re
from urllib.parse import quote

from .filtres import sans_accents


def slugifier(texte: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", sans_accents(texte)).strip("-")


def url_demo(p: dict, cfg: dict) -> str:
    slug = slugifier(f"{p['nom']} {p['ville'] or p['code_postal']}")[:60] + "-" + p["place_id"][-4:].lower()
    return cfg["demo"]["url"].format_map({"metier": slugifier(p["metier"]), "slug": slug})


def compliment(p: dict) -> str:
    n = int(p.get("nb_avis") or 0)
    note = float(p.get("note") or 0)
    if n >= 5 and note >= 4.5:
        return f" (bravo pour vos {n} avis à {str(note).replace('.', ',')}/5)"
    return ""


def texte_message(p: dict, cfg: dict) -> str:
    return cfg["message"]["texte"].format_map({
        "prenom": cfg["expediteur"]["prenom"],
        "societe": cfg["expediteur"]["societe"],
        "nom": p["nom"],
        "compliment": compliment(p),
        "url": p["url_demo"],
    })


def lien_whatsapp(tel: str, texte: str = "") -> str:
    lien = "https://wa.me/" + tel.lstrip("+")
    return lien + "?text=" + quote(texte) if texte else lien
