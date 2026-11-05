"""Historique des prospects dans data/ (commité dans le dépôt privé)."""

import csv
import json
from pathlib import Path

from .filtres import normaliser_numero

DATA = Path(__file__).resolve().parent.parent / "data"
F_PROSPECTS = DATA / "prospects.csv"
F_ETAT = DATA / "etat.json"
F_STOP = DATA / "stop.txt"
F_SUSPECTS = DATA / "telephones_suspects.txt"

CHAMPS = [
    "place_id", "nom", "metier", "zone", "adresse", "code_postal", "ville",
    "telephone", "note", "nb_avis", "maps_url", "lien_existant", "url_demo",
    "date_ajout", "statut", "date_envoi", "info_envoi", "reponse", "date_reponse",
]
# statut : lien_pret | a_envoyer | envoi_en_cours | envoye | pas_whatsapp
#          | non_livre | echec | repondu | stop


def charger_prospects() -> list[dict]:
    if not F_PROSPECTS.exists():
        return []
    with F_PROSPECTS.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sauver_prospects(lignes: list[dict]) -> None:
    DATA.mkdir(exist_ok=True)
    tmp = F_PROSPECTS.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CHAMPS, extrasaction="ignore")
        w.writeheader()
        w.writerows(lignes)
    tmp.replace(F_PROSPECTS)


def charger_etat() -> dict:
    if not F_ETAT.exists():
        return {}
    return json.loads(F_ETAT.read_text(encoding="utf-8"))


def sauver_etat(etat: dict) -> None:
    DATA.mkdir(exist_ok=True)
    F_ETAT.write_text(json.dumps(etat, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def charger_numeros(fichier: Path) -> set[str]:
    """Une ligne par numéro, n'importe quel format (06 12 34 56 78, +33…). # = commentaire."""
    if not fichier.exists():
        return set()
    numeros = set()
    for ligne in fichier.read_text(encoding="utf-8").splitlines():
        tel = normaliser_numero(ligne.split("#", 1)[0])
        if tel:
            numeros.add(tel)
    return numeros


def ajouter_numeros(fichier: Path, numeros: set[str]) -> None:
    nouveaux = sorted(numeros - charger_numeros(fichier))
    if not nouveaux:
        return
    DATA.mkdir(exist_ok=True)
    with fichier.open("a", encoding="utf-8") as f:
        f.writelines(n + "\n" for n in nouveaux)
