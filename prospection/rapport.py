"""Rapport du matin publié en issue GitHub (notification mail + appli mobile)."""

import json
import os
import urllib.error
import urllib.request

from .filtres import numero_lisible
from .messages import lien_whatsapp, texte_message

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]
TAILLE_MAX = 60_000   # limite GitHub : 65 536 caractères par issue / commentaire


def date_fr(d) -> str:
    return f"{JOURS[d.weekday()]} {d.day} {MOIS[d.month - 1]} {d.year}"


def _md(texte: str) -> str:
    for c in "\\*_[]|<>`#":
        texte = texte.replace(c, "\\" + c)
    return texte


def _ligne(p: dict, mode: str, cfg: dict) -> str:
    morceaux = [f"**{_md(p['nom'])}**", _md(p["metier"]),
                f"{_md(p['ville'])} ({p['code_postal']})", numero_lisible(p["telephone"])]
    if p.get("note"):
        morceaux.append(f"{p['note'].replace('.', ',')}★ ({p['nb_avis']} avis)")
    if p.get("lien_existant"):
        morceaux.append(f"[sa page]({p['lien_existant']})")
    morceaux.append(f"[fiche Google]({p['maps_url']})")
    if mode == "liens":
        lien = lien_whatsapp(p["telephone"], texte_message(p, cfg))
        return "- [ ] " + " · ".join(morceaux) + f" · **[📲 Envoyer]({lien})**"
    icone = {"envoye": "✅", "pas_whatsapp": "🚫", "non_livre": "⏸️"}.get(p["statut"], "❌")
    suite = "" if p["statut"] == "envoye" else f" — {_md(p.get('info_envoi', ''))}"
    return f"- {icone} " + " · ".join(morceaux) + suite


def construire(jour, mode: str, cfg: dict, retenus: list[dict], reponses: list[tuple],
               stats: dict, infos: dict) -> tuple[str, list[str]]:
    titre = f"Prospection du {date_fr(jour)} — {len(retenus)} artisans"
    entete = [f"**Mode :** {mode} · **{len(retenus)}** nouveaux prospects · "
              f"{infos['requetes']} requêtes Google · zones parcourues : {_md(infos['zones'])}"]
    if infos.get("alerte"):
        entete.append(f"\n> [!WARNING]\n> {infos['alerte']}")
    if stats:
        detail = ", ".join(f"{n} {r}" for r, n in sorted(stats.items(), key=lambda x: -x[1]))
        entete.append(f"\n<details><summary>Fiches écartées</summary>\n\n{detail}\n</details>")

    if reponses:
        entete.append(f"\n### 💬 Réponses reçues ({len(reponses)})")
        for r, p, stop in reponses:
            qui = f"**{_md(p['nom'])}** ({_md(p['ville'])})" if p else "Numéro inconnu"
            tel = numero_lisible("+" + r["de"]) if r["de"].startswith("33") else r["de"]
            tag = " — 🛑 STOP enregistré" if stop else " — 🔥 à rappeler"
            entete.append(f"- {qui} · {tel} : « {_md(r['texte'][:400])} »{tag}")

    if retenus:
        if mode == "liens":
            entete.append("\n### À envoyer\nSur ton téléphone, appuie sur **📲 Envoyer** : WhatsApp s'ouvre "
                          "avec le message déjà écrit, il ne reste qu'à l'envoyer. Coche la case une fois fait.\n")
        else:
            entete.append("\n### Envoyés ce matin\n")

    morceaux, courant = [], "\n".join(entete) + "\n"
    for p in retenus:
        ligne = _ligne(p, mode, cfg) + "\n"
        if len(courant) + len(ligne) > TAILLE_MAX:
            morceaux.append(courant)
            courant = ""
        courant += ligne
    morceaux.append(courant)
    return titre, morceaux


# ── API GitHub ─────────────────────────────────────────────────────────

def _github(methode: str, chemin: str, corps: dict | None = None) -> dict:
    req = urllib.request.Request(
        "https://api.github.com" + chemin, method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
                 "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def repo_prive() -> bool | None:
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not repo or not os.environ.get("GITHUB_TOKEN"):
        return None
    try:
        return bool(_github("GET", f"/repos/{repo}")["private"])
    except urllib.error.URLError:
        return None


def publier(titre: str, morceaux: list[str]) -> str:
    repo = os.environ["GITHUB_REPOSITORY"]
    issue = _github("POST", f"/repos/{repo}/issues", {"title": titre, "body": morceaux[0]})
    for m in morceaux[1:]:
        _github("POST", f"/repos/{repo}/issues/{issue['number']}/comments", {"body": m})
    return issue["html_url"]
