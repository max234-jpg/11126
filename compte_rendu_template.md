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

## 5bis. Récupération de fichiers serveur (si demandé)

> Objectif : démontrer qu'une faille applicative permet de **lire des fichiers
> côté serveur** à distance (et non en accédant physiquement à la machine).

**Classes de failles à tester :**

| Faille | Exemple de symptôme | Ce que ça permet |
|--------|---------------------|------------------|
| Path traversal | un paramètre `?file=rapport.pdf` qui lit un fichier | lire `../../etc/passwd`, un `.env`… |
| Local File Inclusion (LFI) | une page incluse via un paramètre | lire/inclure du code serveur |
| Divulgation de code source | `.php.bak`, `.git/`, `index.php~` accessibles | récupérer le code backend |
| Mauvaise config | listing de répertoire, fichiers de conf exposés | clés, mots de passe en clair |

**Méthode (sur le lab autorisé) :**
1. Cartographier les paramètres qui manipulent un nom de fichier ou un chemin.
2. Tester une valeur de contrôle légitime, observer la réponse.
3. Tenter une variation (traversée de répertoire, extension alternative) et
   comparer la réponse.
4. Documenter la requête exacte et la preuve (extrait du fichier obtenu).

**Remédiation :**
- Ne jamais construire un chemin de fichier à partir d'une entrée utilisateur.
- Liste blanche de fichiers autorisés / identifiants indirects.
- Normaliser et vérifier le chemin final (rester dans un dossier racine).
- Interdire l'accès web aux fichiers sensibles (`.env`, `.git`, backups).
- Droits système minimaux pour le processus web.

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
