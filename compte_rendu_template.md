# Compte rendu — Test de failles de logique métier sur le paiement

**Étudiant :** _(ton nom)_
**Module / Cours :** _(intitulé)_
**Date :** _(date)_
**Cible :** Lab d'entraînement hébergé par l'école — _(nom/URL du lab)_
**Autorisation :** TP encadré, environnement dédié fourni par l'enseignant.

---

## 1. Objectif
_(Recopie l'énoncé du prof : ce qu'il faut démontrer.)_

## 2. Périmètre et cadre légal
Tests réalisés exclusivement sur le lab fourni par l'école, dans le cadre
pédagogique autorisé. Aucun test sur un système tiers.

## 3. Méthodologie
1. **Observation** du trafic avec Chrome DevTools (onglet *Network*) / Burp Suite.
2. **Identification** de la requête portant le montant et le panier.
3. **Manipulation** d'un paramètre à la fois (prix, quantité, coupon, workflow).
4. **Vérification** de l'acceptation côté serveur.

Outil utilisé : script `payment_logic_test.py` (joint).

## 4. Requête de référence
```
# Colle ici la requête normale (Copy as cURL)
```

## 5. Tests réalisés et résultats

| # | Test | Paramètre modifié | Résultat serveur | Vulnérable ? |
|---|------|-------------------|------------------|--------------|
| 1 | Prix fixé par le client | `price=0.01` | _(à remplir)_ | _(oui/non)_ |
| 2 | Prix négatif | `price=-100` | _(à remplir)_ | _(oui/non)_ |
| 3 | Quantité négative | `quantity=-5` | _(à remplir)_ | _(oui/non)_ |
| 4 | Rejeu de coupon | `coupon=...` x2 | _(à remplir)_ | _(oui/non)_ |

_(Insère une capture d'écran DevTools/Burp pour chaque cas trouvé.)_

## 6. Analyse
_(Explique POURQUOI la faille existe : le serveur fait confiance à une
donnée venant du client au lieu de la recalculer lui-même.)_

## 7. Remédiation (partie clé)
- Recalculer le prix **côté serveur** depuis une source fiable (BDD).
- Ne jamais faire confiance à une valeur fournie par le client.
- Valider les bornes (quantité > 0, prix cohérent).
- Vérifier l'enchaînement du workflow (chaque étape contrôle la précédente).
- Garantir l'unicité d'usage des codes promo.

## 8. Conclusion
_(Synthèse : failles trouvées, impact, corrections proposées.)_
