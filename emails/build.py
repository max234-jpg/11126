"""Render the prospecting email for each sector.

  python3 emails/build.py previews            -> emails/previews/<secteur>.html (sample company)
  python3 emails/build.py batch <in.csv> <out.json>
      -> one {to, subject, htmlBody, body} entry per CSV row, ready to send.

The CSV needs at least the columns: Entreprise, Secteur, Métiers RGE, Ville, Email.
"""
import csv
import html
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
CONFIG["BASE_URL"] = os.environ.get("BASE_URL", CONFIG["BASE_URL"]).rstrip("/")
TEMPLATE = (ROOT / "template.html").read_text(encoding="utf-8")

SECTORS = {
    "BTP": {
        "slug": "btp",
        "CIBLE_COURTE": "artisans du bâtiment",
        "DARK": "#111c2d", "ACCENT": "#f26b1d", "ACCENT_LIGHT": "#ffb07a", "SOFT": "#fff4ec",
        "SUBJECT": "{entreprise} : une idée de site internet pour vous",
        "PREHEADER": "J'ai préparé un exemple concret de site pour votre entreprise. 1 minute pour y jeter un œil.",
        "TITRE": "Vos chantiers méritent d'être vus sur Internet.",
        "INTRO": "Je crée des sites internet pour les artisans du bâtiment en Île-de-France. J'ai trouvé <b>{entreprise}</b> dans l'annuaire officiel des professionnels RGE{metiers_ville}, mais je n'ai pas trouvé de site internet à votre nom. C'est dommage : beaucoup de particuliers cherchent leur artisan sur Google avant de décrocher le téléphone.",
        "ICON1": "🔎", "B1_T": "Trouvé sur Google", "B1_D": "Les clients de votre secteur vous trouvent, pas vos concurrents.",
        "ICON2": "📩", "B2_T": "Plus de devis", "B2_D": "Un formulaire de devis et un bouton d'appel sur chaque page.",
        "ICON3": "🛠️", "B3_T": "Clé en main", "B3_D": "Je m'occupe de tout, vous gardez la main sur vos chantiers.",
        "SOURCE_MENTION": "Vous recevez cet email car les coordonnées professionnelles de votre entreprise figurent dans l'annuaire public des entreprises RGE (ADEME, data.gouv.fr).",
    },
    "Coiffure": {
        "slug": "coiffeur",
        "CIBLE_COURTE": "salons de coiffure",
        "DARK": "#2e1a24", "ACCENT": "#b98d55", "ACCENT_LIGHT": "#e6c99f", "SOFT": "#f7f1ea",
        "SUBJECT": "{entreprise} : à quoi pourrait ressembler votre site",
        "PREHEADER": "J'ai imaginé un site pour votre salon, avec réservation en ligne. Jetez un œil !",
        "TITRE": "Un salon comme le vôtre mérite une belle vitrine en ligne.",
        "INTRO": "Je crée des sites internet pour les salons de coiffure en Île-de-France. En cherchant <b>{entreprise}</b>{ville_only}, je n'ai pas trouvé de site à votre nom : vos futures clientes ne voient ni vos réalisations, ni vos tarifs, ni vos disponibilités.",
        "ICON1": "📅", "B1_T": "Réservation 24h/24", "B1_D": "Vos clientes réservent même quand le salon est fermé.",
        "ICON2": "✨", "B2_T": "Vos créations", "B2_D": "Une galerie qui donne envie de pousser la porte.",
        "ICON3": "📍", "B3_T": "Trouvé sur Google", "B3_D": "Bien placé quand on cherche un coiffeur près de chez soi.",
        "SOURCE_MENTION": "Vous recevez cet email car les coordonnées professionnelles de votre salon figurent sur un annuaire professionnel public.",
    },
    "Santé": {
        "slug": "medecin",
        "CIBLE_COURTE": "cabinets médicaux",
        "DARK": "#0b2530", "ACCENT": "#0c8a8f", "ACCENT_LIGHT": "#8fe3dc", "SOFT": "#eef8f8",
        "SUBJECT": "{entreprise} : un site simple pour informer vos patients",
        "PREHEADER": "Horaires, accès, honoraires, prise de rendez-vous : un exemple de site conforme à la déontologie.",
        "TITRE": "Moins d'appels au secrétariat, des patients mieux informés.",
        "INTRO": "Je crée des sites internet pour les cabinets médicaux et paramédicaux en Île-de-France. En cherchant <b>{entreprise}</b>{ville_only}, je n'ai pas trouvé de site présentant les informations pratiques du cabinet. Un site d'information, sobre et conforme aux règles déontologiques, évite à vos patients de devoir appeler pour chaque question.",
        "ICON1": "☎️", "B1_T": "Moins d'appels", "B1_D": "Horaires, accès et documents à apporter, en ligne.",
        "ICON2": "📅", "B2_T": "RDV en un clic", "B2_D": "Lien direct vers votre outil de prise de rendez-vous.",
        "ICON3": "⚖️", "B3_T": "Conforme", "B3_D": "Site d'information, sans publicité, dans le respect du code de déontologie.",
        "SOURCE_MENTION": "Vous recevez cet email car les coordonnées professionnelles de votre cabinet figurent sur un annuaire professionnel public.",
    },
}

SMALL = {"de", "du", "des", "la", "le", "les", "et", "en", "à", "au", "aux", "d", "l", "sur"}


def pretty_name(raw):
    """'L'AVENIR DE LA CONSTRUCTION' -> "L'Avenir de la Construction"; keeps short acronyms."""
    if raw != raw.upper():
        return raw.strip()
    out = []
    for i, w in enumerate(raw.split()):
        parts = re.split(r"(['’\-])", w)
        res = []
        for p in parts:
            lp = p.lower()
            if p in "'’-":
                res.append(p)
            elif i > 0 and lp in SMALL:
                res.append(lp)
            elif "." in p or (len(p) <= 3 and not re.search(r"[AEIOUY]", p)):
                res.append(p)  # acronyms such as SAS, BTP, SRL
            elif p in {"SAS", "SARL", "EURL", "SASU", "IDF", "BTP", "SA"}:
                res.append(p)
            else:
                res.append(lp[:1].upper() + lp[1:])
        out.append("".join(res))
    return " ".join(out)


def render(entreprise, secteur, metiers="", ville=""):
    s = SECTORS[secteur]
    name = pretty_name(entreprise)
    metiers_ville = ""
    if metiers and ville:
        metiers_ville = f" ({html.escape(metiers)} à {html.escape(ville)})"
    elif ville:
        metiers_ville = f" ({html.escape(ville)})"
    values = dict(CONFIG)
    values.update({k: v for k, v in s.items() if k.isupper()})
    values.update({
        "ENTREPRISE": html.escape(name),
        "SUBJECT": s["SUBJECT"].format(entreprise=name),
        "INTRO": s["INTRO"].format(entreprise=html.escape(name), metiers_ville=metiers_ville,
                                   ville_only=f" à {html.escape(ville)}" if ville else ""),
        "DEMO_URL": f"{CONFIG['BASE_URL']}/{s['slug']}/",
        "MOCKUP_URL": f"{CONFIG['BASE_URL']}/assets/email/{s['slug']}-mockup.jpg",
    })
    out = TEMPLATE
    for k, v in values.items():
        if k.startswith("_"):
            continue
        out = out.replace("{{" + k + "}}", str(v))
    missing = sorted(set(re.findall(r"{{(\w+)}}", out)))
    if missing:
        raise ValueError(f"placeholders non remplis : {missing}")
    text = plain_text(values, s)
    return values["SUBJECT"], out, text


def plain_text(v, s):
    intro = re.sub(r"<[^>]+>", "", v["INTRO"])
    return (
        f"Bonjour,\n\n{html.unescape(intro)}\n\n"
        f"J'ai préparé un exemple concret de ce que pourrait être votre site :\n{v['DEMO_URL']}\n\n"
        f"L'offre : votre site, à votre nom, pour {v['PRIX']}, en ligne en {v['DELAI']}. "
        f"Nom de domaine et hébergement inclus la 1re année.\n\n"
        f"Intéressé ? Répondez simplement « OUI » à cet email, ou appelez-moi au {v['TEL']}.\n\n"
        f"Bonne journée,\n{v['EXPEDITEUR']}\n{v['AGENCE']} · {v['TEL']}\n\n"
        f"--\n{s['SOURCE_MENTION']} Pour ne plus recevoir de message, répondez « STOP ».\n"
        f"{v['AGENCE']} · {v['ENTITE_LEGALE']} · {v['ADRESSE_EXPEDITEUR']}\n"
    )


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "previews"
    if cmd == "previews":
        outdir = ROOT / "previews"
        outdir.mkdir(exist_ok=True)
        samples = {"BTP": ("RENOV HABITAT IDF", "isolation, menuiseries", "Créteil"),
                   "Coiffure": ("SALON ÉLÉGANCE", "", "Paris 11e"),
                   "Santé": ("CABINET MÉDICAL DES LILAS", "", "Montreuil")}
        for sect, (ent, met, ville) in samples.items():
            subject, body, _ = render(ent, sect, met, ville)
            (outdir / f"{SECTORS[sect]['slug']}.html").write_text(body, encoding="utf-8")
            print(f"{sect}: {subject}")
    elif cmd == "batch":
        src, dst = sys.argv[2], sys.argv[3]
        rows = list(csv.DictReader(open(src, encoding="utf-8")))
        batch = []
        for r in rows:
            subject, body, text = render(r["Entreprise"], r["Secteur"], r.get("Métiers RGE", ""), r.get("Ville", ""))
            batch.append({"n": r.get("#"), "to": r["Email"].strip(), "subject": subject, "htmlBody": body, "body": text})
        Path(dst).write_text(json.dumps(batch, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(batch)} emails -> {dst}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
