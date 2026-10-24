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

### 4.3 Falsification du montant de réduction (`cot_gv`)
- **Principe :** le champ `cot_gv` (montant du bon appliqué au panier) est
  transmis par le client. On teste si le serveur l'accepte tel quel.
- **Manipulation :** via la console du navigateur, valeur forcée de `0.00`
  à `9999` avant validation :
  ```js
  document.querySelector('[name="cot_gv"]').value = "9999"
  ```
- **Résultat :** le **total à payer n'a pas changé**. Le serveur **ignore**
  la valeur envoyée et **recalcule la réduction de son côté**.
- **Conclusion :** vecteur **sécurisé** ✔ — pas de confiance accordée à la
  donnée client. (Capture d'écran : _à insérer_.)

### 4.4 Contournement de l'étape de paiement (faille de logique)
- **Principe :** appeler directement l'URL de confirmation de commande sans
  passer par l'étape de paiement, ou changer `payment` pour un mode gratuit.
- **Résultat :** _(à compléter)_

### 4.5 Falsification du jeton `securityToken` — ⚠️ FAILLE TROUVÉE
- **Principe :** le `securityToken` est censé protéger la requête contre la
  falsification (anti-CSRF / anti-tamper). On teste s'il est réellement
  contrôlé côté serveur.
- **Manipulation :** via la console, remplacement du jeton légitime par une
  valeur arbitraire avant validation :
  ```js
  document.querySelector('[name="securityToken"]').value = "0000"
  ```
- **Résultat :** malgré ce jeton **invalide**, le serveur **accepte la requête
  et poursuit le processus de commande** (le test a été arrêté juste avant
  l'envoi final).
- **Conclusion :** ⚠️ **VULNÉRABLE** — le jeton de sécurité n'est pas validé
  côté serveur. La protection est présente dans le formulaire mais **non
  appliquée**, ce qui ouvre la voie à la falsification de requêtes.
  (Capture d'écran : _à insérer_.)

### 4.6 Évaluation de la robustesse de la protection CSRF (synthèse)

Vérification des 4 critères d'un bon jeton anti-CSRF, testés depuis la console :

| Critère | Attendu | Observé | Verdict |
|---------|---------|---------|---------|
| Imprévisibilité | jeton aléatoire, longue entropie | 32 caractères hexadécimaux | ✔ OK |
| Validation côté serveur | requête rejetée si jeton absent/faux | jeton `0000` **accepté** (cf. 4.5) | ⚠️ **ÉCHEC** |
| Rotation / usage unique | nouveau jeton à chaque requête | **identique** après rechargement (rejouable) | ⚠️ faible |
| Secret non exposé au JS | session en cookie `HttpOnly` | `document.cookie` ne révèle que des cookies d'analytics, pas le jeton de session | ✔ OK |

**Conclusion CSRF :** la protection est **inopérante**. Le jeton existe et est
bien aléatoire, mais il n'est **pas validé côté serveur** et il est
**rejouable** (statique). Un attaquant peut donc forger une requête de commande
valide. Seul point positif : le cookie de session n'est pas exposé au
JavaScript.

## 5. Analyse des défenses observées
La cible met en œuvre plusieurs protections qui bloquent les attaques simples :
- **Validation côté serveur du montant** → l'altération du prix est inopérante.
- **`securityToken`** → **présent mais NON appliqué** : le serveur accepte un
  jeton invalide (cf. 4.5). Protection en façade uniquement.
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
La cible est **bien protégée** contre les attaques classiques : le prix et le
montant de réduction (`cot_gv`) sont recalculés côté serveur (cf. 4.3).

En revanche, une **faille réelle a été identifiée** : le jeton `securityToken`
n'est **pas validé côté serveur** (cf. 4.5). Un attaquant peut donc envoyer une
requête de commande forgée avec un jeton invalide sans être bloqué.

**Recommandation prioritaire :** valider systématiquement le `securityToken`
côté serveur, le lier à la session, le rendre à usage unique, et rejeter toute
requête dont le jeton est absent ou invalide.
