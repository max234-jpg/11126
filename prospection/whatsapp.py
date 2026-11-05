"""Envoi via l'API WhatsApp Cloud officielle (Meta) et lecture des réponses."""

import json
import urllib.error
import urllib.parse
import urllib.request

# Erreurs qui touchent TOUS les envois : on arrête la tournée au lieu d'insister.
ERREURS_BLOQUANTES = {
    "0", "3", "10", "100", "190", "200", "368", "130497", "131031", "131042", "131048",
    "132000", "132001", "132005", "132007", "132012", "132015", "132016",
}
NON_WHATSAPP = {"131026"}          # numéro sans WhatsApp / injoignable
NON_LIVRE = {"131049", "131050"}   # Meta a choisi de ne pas livrer ce message marketing


def envoyer_template(tel: str, parametres: list[str], cfg: dict, token: str, phone_id: str) -> tuple[bool, str, str]:
    """Renvoie (ok, code_erreur, info)."""
    w = cfg["whatsapp_api"]
    corps = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": tel.lstrip("+"),
        "type": "template",
        "template": {
            "name": w["template"],
            "language": {"code": w["langue"]},
            "components": [{"type": "body",
                            "parameters": [{"type": "text", "text": v} for v in parametres]}],
        },
    }
    req = urllib.request.Request(
        f"https://graph.facebook.com/{w['version_graph']}/{phone_id}/messages",
        data=json.dumps(corps).encode(), method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rep = json.load(r)
        return True, "", rep["messages"][0]["id"]
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read()).get("error", {})
        except ValueError:
            err = {}
        code = str(err.get("code", e.code))
        return False, code, f"{code} {err.get('message', '')}".strip()[:300]
    except urllib.error.URLError as e:
        return False, "reseau", f"réseau : {e.reason}"


def recuperer_reponses(url: str, token: str, depuis: int) -> list[dict]:
    """Lit les réponses stockées par le Worker Cloudflare (webhook/worker.js)."""
    req = urllib.request.Request(
        url.rstrip("/") + "/reponses?" + urllib.parse.urlencode({"depuis": depuis}),
        headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)
