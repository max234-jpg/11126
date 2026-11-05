"""Prospection quotidienne : trouve des artisans du BTP sans site internet
(Île-de-France en priorité), puis prépare ou envoie le message WhatsApp.

    python -m prospection.run                 # lancement normal (créneau 8h30-12h, 1 fois / jour)
    python -m prospection.run --force         # ignorer le créneau horaire
    python -m prospection.run --dry-run       # tester : n'envoie rien, n'écrit rien
    python -m prospection.run --dry-run --force --fixture tests/fiches_exemple.json
"""

import argparse
import os
import sys
import time
import tomllib
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from . import filtres, messages, places, rapport, stockage, whatsapp

PARIS = ZoneInfo("Europe/Paris")
CONFIG = Path(__file__).with_name("config.toml")
A_REMPLIR = "A-REMPLIR"


def log(*args) -> None:
    print(*args, flush=True)


def dans_le_creneau(maintenant: datetime, etat: dict) -> tuple[bool, str]:
    if etat.get("derniere_execution") == maintenant.date().isoformat():
        return False, "déjà lancé aujourd'hui"
    minutes = maintenant.hour * 60 + maintenant.minute
    if not 8 * 60 + 30 <= minutes <= 12 * 60:
        return False, f"il est {maintenant:%H:%M} à Paris, hors du créneau 8h30-12h"
    return True, ""


def verifier_config(cfg: dict, mode: str, args) -> tuple[list[str], list[str]]:
    erreurs, avertissements = [], []
    if not args.fixture and not os.environ.get("GOOGLE_PLACES_API_KEY"):
        erreurs.append("secret GOOGLE_PLACES_API_KEY manquant")
    if mode == "api":
        for var in ("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"):
            if not os.environ.get(var):
                erreurs.append(f"secret {var} manquant (mode api)")
        if not os.environ.get("REPONSES_URL"):
            avertissements.append("REPONSES_URL absent : les réponses WhatsApp ne seront pas relevées")
    a_remplir = [champ for champ, val in [
        ("[expediteur] prenom", cfg["expediteur"]["prenom"]),
        ("[expediteur] societe", cfg["expediteur"]["societe"]),
        ("[demo] url", cfg["demo"]["url"]),
    ] if A_REMPLIR in val]
    if a_remplir:
        msg = "à compléter dans prospection/config.toml : " + ", ".join(a_remplir)
        (avertissements if args.dry_run else erreurs).append(msg)
    return erreurs, avertissements


def relever_reponses(prospects: list[dict], etat: dict, stop: set[str], maintenant) -> list[tuple]:
    url, token = os.environ.get("REPONSES_URL"), os.environ.get("REPONSES_TOKEN", "")
    if not url:
        return []
    par_tel = {p["telephone"]: p for p in prospects}
    deja = list(etat.get("reponses_ids", []))
    depuis = int(etat.get("reponses_depuis", 0))
    recues = []
    for r in sorted(whatsapp.recuperer_reponses(url, token, depuis), key=lambda r: r["ts"]):
        if r["id"] in deja:
            continue
        deja.append(r["id"])
        depuis = max(depuis, int(r["ts"]))
        tel = filtres.normaliser_numero("+" + r["de"])
        p = par_tel.get(tel)
        est_stop = filtres.est_un_stop(r["texte"])
        if est_stop and tel:
            stop.add(tel)
        if p:
            if p["statut"] != "stop":
                p["statut"] = "stop" if est_stop else "repondu"
            p["reponse"] = (p["reponse"] + " | " if p.get("reponse") else "") + r["texte"][:300]
            p["date_reponse"] = maintenant.isoformat(timespec="minutes")
        recues.append((r, p, est_stop))
    etat["reponses_ids"] = deja[-2000:]
    etat["reponses_depuis"] = depuis
    return recues


def chercher(cfg: dict, etat: dict, client: places.Client, deja_place: set, deja_tel: set,
             bloques: set, objectif: int) -> tuple[list[dict], set[str], Counter, list[str], str]:
    """Parcourt les couples (zone, métier) à partir du curseur sauvegardé."""
    rech = cfg["recherche"]
    paires = [(z, m) for z in rech["zones"] for m in rech["metiers"]]
    debut = int(etat.get("curseur", 0)) % len(paires)
    budget = cfg["general"]["max_requetes_google_par_jour"]
    vus = defaultdict(set)          # portable → fiches Google qui l'affichent
    selection: dict[str, dict] = {}
    stats: Counter = Counter()
    zones: list[str] = []
    alerte = ""

    def valides() -> list[dict]:
        # Un même 06 sur plusieurs fiches = plateforme de leads / réseau d'arnaque.
        return [p for p in selection.values() if len(vus[p["telephone"]]) < 2]

    i = 0
    reste_des_pages = False
    while i < len(paires) and client.requetes < budget and len(valides()) < objectif and not alerte:
        zone, metier = paires[(debut + i) % len(paires)]
        i += 1
        if not zones or zones[-1] != zone:
            zones.append(zone)
        token = None
        for _ in range(cfg["general"]["pages_par_recherche"]):
            try:
                fiches, token = client.rechercher(f"{metier} {zone}", token)
            except places.ErreurGoogle as e:
                alerte = f"Erreur Google Places, recherche interrompue : {e}"
                break
            for f in fiches:
                tel = filtres.mobile_de(f)
                if tel:
                    vus[tel].add(f["id"])
                if f["id"] in selection or f["id"] in deja_place:
                    stats["déjà vus"] += 1
                    continue
                p, raison = filtres.evaluer(f, cfg["filtres"])
                if p is None:
                    stats[raison] += 1
                elif p["telephone"] in bloques:
                    stats["liste STOP / numéro suspect"] += 1
                elif p["telephone"] in deja_tel:
                    stats["déjà contactés"] += 1
                else:
                    p["metier"] = p["metier"] or metier
                    p["zone"] = zone
                    selection[f["id"]] = p
            reste_des_pages = bool(token)
            if not token or client.requetes >= budget or len(valides()) >= objectif:
                break
    # Si on s'est arrêté au milieu d'une recherche, on la reprendra demain.
    etat["curseur"] = (debut + i - (1 if reste_des_pages else 0)) % len(paires)

    suspects = {t for t, ids in vus.items() if len(ids) >= 2}
    ecartes = sum(1 for p in selection.values() if p["telephone"] in suspects)
    if ecartes:
        stats["même 06 sur plusieurs fiches (plateformes)"] += ecartes
    return valides()[:objectif], suspects, stats, zones, alerte


def envoyer_api(a_envoyer: list[dict], prospects: list[dict], cfg: dict, stop: set[str]) -> str:
    """Envoie le modèle WhatsApp. Sauvegarde après CHAQUE message : jamais de double envoi."""
    token, phone_id = os.environ["WHATSAPP_TOKEN"], os.environ["WHATSAPP_PHONE_NUMBER_ID"]
    pause = cfg["whatsapp_api"]["pause_entre_envois_s"]
    for n, p in enumerate(a_envoyer):
        p["statut"] = "envoi_en_cours"
        stockage.sauver_prospects(prospects)
        ok, code, info = whatsapp.envoyer_template(p["telephone"], [p["nom"], p["url_demo"]],
                                                   cfg, token, phone_id)
        p["date_envoi"] = datetime.now(PARIS).isoformat(timespec="minutes")
        p["info_envoi"] = info
        if ok:
            p["statut"] = "envoye"
        elif code in whatsapp.NON_WHATSAPP:
            p["statut"] = "pas_whatsapp"
        elif code == "131050":           # l'artisan a bloqué les messages marketing
            p["statut"] = "stop"
            stop.add(p["telephone"])
        elif code in whatsapp.NON_LIVRE:
            p["statut"] = "non_livre"
        else:
            p["statut"] = "echec"
        stockage.sauver_prospects(prospects)
        log(f"  {p['statut']:<13} {filtres.masquer(p['telephone'])}  {'' if ok else info[:80]}")
        if code in whatsapp.ERREURS_BLOQUANTES:
            # Problème de compte / modèle, pas du destinataire : on retentera demain.
            for q in a_envoyer[n:]:
                q["statut"] = "a_envoyer"
            stockage.sauver_prospects(prospects)
            return f"Envois WhatsApp stoppés par Meta ({info}). Les {len(a_envoyer) - n} restants seront retentés demain."
        time.sleep(pause)
    return ""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="ignorer le créneau 9h / déjà lancé aujourd'hui")
    ap.add_argument("--dry-run", action="store_true", help="n'envoie rien, n'écrit rien")
    ap.add_argument("--fixture", help="JSON de fiches Google (test sans clé API)")
    ap.add_argument("--mode", choices=["liens", "api"], help="remplace le mode de config.toml")
    args = ap.parse_args(argv)

    cfg = tomllib.loads(CONFIG.read_text(encoding="utf-8"))
    mode = args.mode or cfg["general"]["mode"]
    etat = stockage.charger_etat()
    maintenant = datetime.now(PARIS)
    jour = maintenant.date()

    if not args.force:
        ok, raison = dans_le_creneau(maintenant, etat)
        if not ok:
            log(f"Rien à faire : {raison}.")
            return 0

    if not args.dry_run and rapport.repo_prive() is False and not cfg["general"]["autoriser_repo_public"]:
        log("ERREUR : ce dépôt GitHub est PUBLIC. Les numéros des artisans y seraient visibles par tous.\n"
            "Passe-le en privé : Settings → General → Danger Zone → Change visibility.")
        return 2

    erreurs, avertissements = verifier_config(cfg, mode, args)
    for a in avertissements:
        log("Attention :", a)
    if erreurs:
        for e in erreurs:
            log("ERREUR :", e)
        return 2

    prospects = stockage.charger_prospects()
    stop = stockage.charger_numeros(stockage.F_STOP)
    suspects_connus = stockage.charger_numeros(stockage.F_SUSPECTS)

    # 1. Réponses de la veille (mode api)
    reponses = relever_reponses(prospects, etat, stop, maintenant) if mode == "api" else []
    for p in prospects:
        if p["telephone"] in stop and p["statut"] in ("a_envoyer", "lien_pret"):
            p["statut"] = "stop"

    # 2. File d'attente : envois interrompus la veille d'abord
    en_attente = [p for p in prospects if p["statut"] == "a_envoyer"] if mode == "api" else []
    objectif = max(0, cfg["general"]["objectif_par_jour"] - len(en_attente))

    # 3. Recherche Google
    client = places.Client(os.environ.get("GOOGLE_PLACES_API_KEY"), args.fixture)
    nouveaux, suspects, stats, zones, alerte = chercher(
        cfg, etat, client,
        deja_place={p["place_id"] for p in prospects},
        deja_tel={p["telephone"] for p in prospects},
        bloques=stop | suspects_connus,
        objectif=objectif)
    log(f"{client.requetes} requêtes Google → {len(nouveaux)} nouveaux prospects "
        f"({', '.join(f'{n} {r}' for r, n in stats.most_common())})")
    if alerte:
        log("ATTENTION :", alerte)

    for p in nouveaux:
        p["date_ajout"] = jour.isoformat()
        p["url_demo"] = messages.url_demo(p, cfg)
        p["statut"] = "lien_pret" if mode == "liens" else "a_envoyer"
    a_traiter = en_attente + nouveaux

    if args.dry_run:
        for p in a_traiter[:5]:
            log("\n—", p["nom"], "·", p["ville"], "·", filtres.masquer(p["telephone"]))
            log(messages.texte_message(p, cfg))
        titre, morceaux = rapport.construire(jour, mode, cfg, a_traiter, reponses, dict(stats),
                                             {"requetes": client.requetes, "zones": " → ".join(zones[:1] + zones[-1:]),
                                              "alerte": alerte})
        sortie = Path("rapport_test.md")
        sortie.write_text(f"# {titre}\n\n" + "\n".join(morceaux), encoding="utf-8")
        log(f"\n[dry-run] rien envoyé, rien sauvegardé. Aperçu du rapport : {sortie.resolve()}")
        return 0

    # 4. Sauvegarde AVANT tout envoi
    prospects.extend(nouveaux)
    stockage.sauver_prospects(prospects)
    stockage.ajouter_numeros(stockage.F_SUSPECTS, suspects)
    stockage.ajouter_numeros(stockage.F_STOP, stop)

    # 5. Envoi (mode api) — en mode liens c'est toi qui appuies sur Envoyer
    if mode == "api" and a_traiter:
        log(f"Envoi de {len(a_traiter)} messages WhatsApp…")
        alerte = envoyer_api(a_traiter, prospects, cfg, stop) or alerte
        stockage.ajouter_numeros(stockage.F_STOP, stop)

    # 6. Rapport
    etat["derniere_execution"] = jour.isoformat()
    stockage.sauver_etat(etat)
    titre, morceaux = rapport.construire(
        jour, mode, cfg, a_traiter, reponses, dict(stats),
        {"requetes": client.requetes, "zones": " → ".join(zones[:1] + zones[-1:]), "alerte": alerte})
    if os.environ.get("GITHUB_ACTIONS"):
        log("Rapport :", rapport.publier(titre, morceaux))
    else:
        Path("rapport_du_jour.md").write_text(f"# {titre}\n\n" + "\n".join(morceaux), encoding="utf-8")
        log("Rapport écrit dans rapport_du_jour.md")
    return 1 if alerte and not a_traiter else 0


if __name__ == "__main__":
    sys.exit(main())
