"""Décide si une fiche Google est un bon prospect : artisan ouvert, en France,
sans vrai site internet, joignable sur un portable (06/07)."""

import re
import unicodedata
from urllib.parse import urlparse


def sans_accents(texte: str) -> str:
    return unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode().lower()


def normaliser_numero(texte: str | None) -> str | None:
    """Renvoie « +336XXXXXXXX » / « +337XXXXXXXX » pour un portable français, sinon None."""
    if not texte:
        return None
    chiffres = re.sub(r"\D", "", texte)
    if chiffres.startswith("0033"):
        chiffres = chiffres[4:]
    elif chiffres.startswith("33") and len(chiffres) == 11:
        chiffres = chiffres[2:]
    elif chiffres.startswith("0") and len(chiffres) == 10:
        chiffres = chiffres[1:]
    if len(chiffres) == 9 and chiffres[0] in "67":
        return "+33" + chiffres
    return None


def numero_lisible(tel: str) -> str:
    """+33612345678 → 06 12 34 56 78"""
    n = "0" + tel[3:]
    return " ".join(n[i:i + 2] for i in range(0, 10, 2))


def masquer(tel: str) -> str:
    """Pour les journaux : 06 •• •• •• 78"""
    return numero_lisible(tel)[:2] + " •• •• •• " + tel[-2:]


def mobile_de(fiche: dict) -> str | None:
    return normaliser_numero(fiche.get("internationalPhoneNumber")) or normaliser_numero(
        fiche.get("nationalPhoneNumber"))


def domaine(url: str) -> str:
    try:
        hote = urlparse(url if "://" in url else "https://" + url).hostname or ""
    except ValueError:
        return ""
    return hote.removeprefix("www.")


def a_un_vrai_site(url: str | None, domaines_exclus: list[str]) -> bool:
    if not url or not url.strip():
        return False
    hote = domaine(url.strip())
    if not hote:
        return False
    return not any(hote == d or hote.endswith("." + d) for d in domaines_exclus)


def _adresse(fiche: dict) -> tuple[str, str, str]:
    cp = ville = pays = ""
    for c in fiche.get("addressComponents") or []:
        types = c.get("types") or []
        if "postal_code" in types:
            cp = c.get("longText", "")
        elif "locality" in types:
            ville = c.get("longText", "")
        elif "country" in types:
            pays = c.get("shortText", "")
    adresse = fiche.get("formattedAddress", "")
    m = re.search(r"\b(\d{5})\s+([^,]+)", adresse)
    if m:
        cp = cp or m.group(1)
        ville = ville or m.group(2).strip()
    if not pays and adresse.rstrip().endswith("France"):
        pays = "FR"
    return cp, ville, pays


def _contient_mot(texte: str, motif: str) -> bool:
    return re.search(r"(?<![a-z0-9])" + re.escape(motif) + r"(?![a-z0-9])", texte) is not None


# Catégorie Google → métier (sert au lien de démo). Sinon : le métier recherché.
METIERS_GOOGLE = {
    "plumber": "plombier", "electrician": "électricien", "roofing_contractor": "couvreur",
    "painter": "peintre en bâtiment", "locksmith": "serrurier",
}


def evaluer(fiche: dict, cfg: dict) -> tuple[dict | None, str]:
    """Renvoie (prospect, "retenu") ou (None, raison du rejet)."""
    if fiche.get("businessStatus", "OPERATIONAL") != "OPERATIONAL":
        return None, "fermé"
    cp, ville, pays = _adresse(fiche)
    if pays != "FR":
        return None, "hors France"
    if (fiche.get("primaryType") or "") in cfg["types_exclus"]:
        return None, "pas un artisan (magasin…)"
    nom = (fiche.get("displayName") or {}).get("text", "").strip()
    if not nom:
        return None, "fiche incomplète"
    nom_simple = sans_accents(nom)
    if any(_contient_mot(nom_simple, sans_accents(m)) for m in cfg["noms_exclus"]):
        return None, "réseau de dépannage (SOS, 24h/24…)"
    site = (fiche.get("websiteUri") or "").strip()
    if a_un_vrai_site(site, cfg["domaines_sans_vrai_site"]):
        return None, "a déjà un site"
    tel = mobile_de(fiche)
    if not tel:
        return None, "pas de 06/07"
    nb_avis = int(fiche.get("userRatingCount") or 0)
    note = float(fiche.get("rating") or 0)
    if nb_avis < cfg["avis_minimum"]:
        return None, "pas assez d'avis"
    if nb_avis and note < cfg["note_minimum"]:
        return None, "note trop basse"
    return {
        "place_id": fiche["id"],
        "nom": nom,
        "adresse": fiche.get("formattedAddress", ""),
        "code_postal": cp,
        "ville": ville,
        "telephone": tel,
        "note": f"{note:.1f}" if nb_avis else "",
        "nb_avis": str(nb_avis),
        "maps_url": fiche.get("googleMapsUri", ""),
        "lien_existant": site,
        "metier": METIERS_GOOGLE.get(fiche.get("primaryType") or "", ""),
    }, "retenu"


_STOP = re.compile(r"(?<![a-z])(stop|arret|arreter|desabonn|desinscri|ne plus|pas interess|non merci|laissez moi)")


def est_un_stop(texte: str) -> bool:
    return _STOP.search(sans_accents(texte).replace("-", " ")) is not None
