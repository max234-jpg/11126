#!/usr/bin/env python3
"""Vérifie si tes propres données ont fuité.

  - Email : est-il présent dans des fuites de données connues ? (Have I Been Pwned)
  - Mot de passe : figure-t-il dans des fuites ? (Pwned Passwords, k-anonymat :
    le mot de passe ne quitte jamais ta machine, seuls 5 caractères de son
    empreinte SHA-1 sont envoyés)

Produit un rapport Markdown avec quoi faire pour chaque fuite trouvée.

Usage :
  python3 self_audit.py --email moi@exemple.fr
  python3 self_audit.py --password            # demande le mot de passe sans l'afficher
  python3 self_audit.py --email moi@exemple.fr --password -o rapport.md

Bibliothèque standard uniquement, aucune dépendance.
"""

import argparse
import getpass
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

USER_AGENT = "self-audit/1.0 (personal breach check)"
TIMEOUT = 10


def http_get(url, headers=None):
    """Renvoie (code HTTP, corps en texte). Code 0 en cas d'erreur réseau."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, str(e)


def check_email(email):
    """Interroge HIBP. L'API par compte exige une clé (variable HIBP_API_KEY)."""
    api_key = os.environ.get("HIBP_API_KEY")
    if not api_key:
        return {"status": "no_key"}

    url = ("https://haveibeenpwned.com/api/v3/breachedaccount/"
           f"{urllib.parse.quote(email)}?truncateResponse=false")
    code, body = http_get(url, {"hibp-api-key": api_key})
    if code == 404:
        return {"status": "clean"}
    if code == 200:
        return {"status": "pwned", "breaches": [
            {"name": b["Name"], "date": b.get("BreachDate", "?"),
             "data": b.get("DataClasses", [])} for b in json.loads(body)]}
    return {"status": "error", "detail": f"HTTP {code}: {body[:200]}"}


def check_password(password):
    """k-anonymat : seuls les 5 premiers caractères du SHA-1 partent sur le réseau."""
    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    code, body = http_get(f"https://api.pwnedpasswords.com/range/{prefix}",
                          {"Add-Padding": "true"})
    if code != 200:
        return {"status": "error", "detail": f"HTTP {code}"}
    for line in body.splitlines():
        h, _, count = line.partition(":")
        if h == suffix and int(count) > 0:
            return {"status": "pwned", "count": int(count)}
    return {"status": "clean"}


def report(email, email_res, pwd_res):
    lines = [f"# Rapport de fuites — {date.today().isoformat()}", ""]

    if email_res is not None:
        lines += [f"## Email : `{email}`", ""]
        s = email_res["status"]
        if s == "clean":
            lines.append("Aucune fuite connue pour cet email.")
        elif s == "no_key":
            lines += ["Pas de clé `HIBP_API_KEY` : vérification automatique impossible.",
                      "Vérifie gratuitement à la main sur https://haveibeenpwned.com/ "
                      "(et abonne-toi aux alertes : https://haveibeenpwned.com/NotifyMe)."]
        elif s == "error":
            lines.append(f"Erreur : {email_res['detail']}")
        else:
            breaches = email_res["breaches"]
            lines += [f"**Trouvé dans {len(breaches)} fuite(s) :**", "",
                      "| Service | Date | Données exposées |", "|---|---|---|"]
            for b in sorted(breaches, key=lambda b: b["date"], reverse=True):
                lines.append(f"| {b['name']} | {b['date']} | {', '.join(b['data'])} |")
            lines += ["", "**À faire :**",
                      "- Change le mot de passe de chaque service listé, et partout où tu l'as réutilisé.",
                      "- Active la double authentification (2FA) sur ces comptes.",
                      "- Si des numéros de téléphone ou adresses ont fuité, méfie-toi des "
                      "SMS/mails d'hameçonnage qui s'appuient dessus."]
        lines.append("")

    if pwd_res is not None:
        lines += ["## Mot de passe", ""]
        s = pwd_res["status"]
        if s == "clean":
            lines.append("Ce mot de passe n'apparaît dans aucune fuite connue.")
        elif s == "error":
            lines.append(f"Erreur : {pwd_res['detail']}")
        else:
            lines += [f"**Ce mot de passe apparaît {pwd_res['count']:,} fois dans des fuites.**",
                      "", "**À faire :** ne l'utilise plus nulle part. Un gestionnaire de mots "
                      "de passe (Bitwarden, KeePassXC…) permet d'en avoir un unique par site."]
        lines.append("")

    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser(description="Vérifie si tes données ont fuité.")
    p.add_argument("--email", help="ton adresse email")
    p.add_argument("--password", action="store_true",
                   help="vérifier un mot de passe (saisi de façon masquée)")
    p.add_argument("-o", "--output", help="écrire le rapport dans ce fichier")
    args = p.parse_args()

    if not args.email and not args.password:
        p.error("indique au moins --email ou --password")

    email_res = check_email(args.email) if args.email else None
    pwd_res = check_password(getpass.getpass("Mot de passe à vérifier : ")) if args.password else None

    text = report(args.email, email_res, pwd_res)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print(f"Rapport écrit dans {args.output}")
    else:
        print(text)

    sys.exit(1 if any(r and r["status"] == "pwned" for r in (email_res, pwd_res)) else 0)


if __name__ == "__main__":
    main()
