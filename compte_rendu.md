# Compte rendu — Analyse de la sécurité du processus de paiement

**Étudiant :** _(ton nom)_
**Module :** Cybersécurité — Sécurité des applications web
**Date :** _(date)_
**Cible :** Application e-commerce d'entraînement fournie dans le cadre du TP
**Cadre :** Tests réalisés dans l'environnement autorisé du cours.

---

## 1. Objectif
Analyser le tunnel de commande d'une boutique en ligne et déterminer s'il
existe des moyens de **contourner ou altérer le paiement**. Présenter les
différentes approches possibles, les résultats, et les contre-mesures.

## 2. Méthodologie
L'analyse s'appuie sur l'observation du trafic HTTP côté navigateur
(Chrome DevTools, onglet *Network*), sans accès aux fichiers serveur.
Étapes :
1. Passer une commande normale et capturer la requête de validation.
2. Identifier les paramètres transmis.
3. Pour chaque paramètre, formuler une hypothèse d'abus et la tester.
4. Observer la réponse serveur pour conclure (accepté / rejeté).

## 3. Observation de la requête de commande
La validation s'effectue via un **POST** (formulaire classique, rechargement
de page). Les champs observés dans l'onglet *Payload* :

| Champ | Rôle probable |
|-------|---------------|
| `securityToken` | Jeton anti-falsification / anti-CSRF (unique par session) |
| `dc_redeem_code` | Code de réduction (discount) |
| `gv_redeem_code` | Bon cadeau (gift voucher) |
| `cot_gv` | Montant du bon appliqué au panier |
| `payment` | Mode de paiement sélectionné |
| `mtp_cc_number` / `mtp_cc_cvv` / `mtp_cc_expires_*` | Données carte bancaire |
| `mtp_timing` | Fuseau horaire du client (signal anti-fraude) |
| `mtp_resolution` | Résolution d'écran du client (signal anti-fraude) |

**Première conclusion :** le prix total n'est **pas** transmis en clair comme
paramètre modifiable → le serveur recalcule probablement le montant lui-même.

## 4. Approches testées (« plusieurs façons possibles »)

### 4.1 Altération directe du prix (approche naïve)
- **Principe :** modifier un champ `price` dans la requête.
- **Résultat :** non applicable ici — aucun champ `price` modifiable n'est
  transmis. Le montant est maîtrisé côté serveur.
- **Enseignement :** c'est la faille du TP précédent ; elle est ici corrigée.

### 4.2 Manipulation de la quantité
- **Principe :** envoyer une quantité négative ou nulle pour fausser le total.
- **À tester :** `quantity = -1`, `quantity = 0`.
- **Résultat :** _(à compléter avec ton observation)_

### 4.3 Abus des codes de réduction / bons cadeaux
- **Principe :** rejouer plusieurs fois `dc_redeem_code` / `gv_redeem_code`,
  ou tester une valeur `cot_gv` supérieure au total.
- **À tester :** appliquer deux fois le même code ; forcer `cot_gv` élevé.
- **Résultat :** _(à compléter)_

### 4.4 Contournement de l'étape de paiement (faille de logique)
- **Principe :** appeler directement l'URL de confirmation de commande sans
  passer par l'étape de paiement, ou changer `payment` pour un mode gratuit.
- **Résultat :** _(à compléter)_

### 4.5 Rejeu / falsification du `securityToken`
- **Principe :** vérifier si le jeton est réellement contrôlé (réutilisation,
  valeur vide, jeton d'une autre session).
- **Résultat :** _(à compléter)_

## 5. Analyse des défenses observées
La cible met en œuvre plusieurs protections qui bloquent les attaques simples :
- **Validation côté serveur du montant** → l'altération du prix est inopérante.
- **`securityToken`** → protège contre la falsification/rejeu de requête (CSRF).
- **Signaux anti-fraude** (`mtp_timing`, `mtp_resolution`) → le serveur peut
  détecter des requêtes forgées qui ne correspondent pas à un vrai navigateur.

C'est le signe d'un tunnel de paiement **mûr** : la sécurité ne repose pas sur
le client. Les failles restantes, s'il y en a, sont des **failles de logique
métier** (étapes, quantités, cumul de codes), pas des altérations de prix.

## 6. Contre-mesures (remédiation)
- Recalculer systématiquement le total **côté serveur** (fait ici ✔).
- Vérifier l'unicité et la validité des codes promo / bons cadeaux.
- Contrôler les bornes (quantité > 0, montant du bon ≤ total).
- Valider l'enchaînement du workflow : chaque étape vérifie la précédente,
  impossible de confirmer une commande non payée.
- Invalider le `securityToken` après usage (anti-rejeu).
- Journaliser et corréler les signaux anti-fraude.

## 7. Conclusion
L'attaque « classique » de modification de prix est **neutralisée** par la
validation côté serveur. L'analyse s'oriente donc vers les failles de logique
métier (quantité, codes promo, enchaînement des étapes), seules susceptibles
de subsister. _(Conclure selon ce que tu as réellement pu tester.)_
