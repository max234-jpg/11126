# Revue UI — page d'accueil Central Rénovation

Revue faite sur des captures pleine page : bureau 1366 px (clair et sombre) et mobile 390 px (clair).
Aucun défilement horizontal ni erreur console aux trois tailles.

## Corrigé dans cette version

| # | Constat | Gravité | Correction |
|---|---------|---------|------------|
| 1 | Prestations : le bloc « Rénovation complète » occupait 2 lignes et laissait « Électricité et plomberie » seul sur une 3ᵉ ligne. | Moyenne | Le bloc principal passe en pleine largeur (texte à gauche, liste à droite) ; ajout du lot « Menuiseries intérieures » pour une grille régulière de 3 × 2. |
| 2 | Hero bureau : le titre tenait sur 6 lignes dans une colonne trop étroite. | Moyenne | Colonne texte élargie et taille maximale du titre réduite (4 rem → 3,5 rem). |
| 3 | Mode sombre : les bandeaux « engagements », « zone » et le pied de page s'inversaient en blanc cassé, avec un code postal pêche peu lisible sur fond clair. | Haute | Nouveaux jetons `--band` / `--on-band` : bandeaux en olive foncé légèrement surélevé dans les deux thèmes. |
| 4 | Zone : 9 communes sur 2 colonnes, « Paris 20ᵉ » seul en dernière ligne. | Faible | Liste ramenée aux communes limitrophes + Paris 12ᵉ/20ᵉ (8 entrées). |
| 5 | Plan du hero sur mobile : renvois (« Enduit plâtre », « Prise 16 A ») trop petits. | Faible | Taille des textes du dessin augmentée. |

## Points validés

- **Contraste** : texte principal olive sur enduit > 12:1 ; accent texte `--peach-ink` ≈ 5:1 en clair. Le pêche n'est jamais utilisé en texte sur fond clair, seulement en aplat avec texte foncé.
- **Accessibilité** : lien d'évitement, focus visible (contour pêche 3 px), menu mobile avec `aria-expanded` et fermeture par Échap, FAQ en `<details>` natifs, erreurs de formulaire reliées par `aria-describedby`, `prefers-reduced-motion` respecté.
- **Mobile** : cibles tactiles ≥ 44 px, boutons du hero en pleine largeur, formulaire sur une colonne.
- **SEO local** : `title` et `meta description` avec « Montreuil », données structurées `HomeAndConstructionBusiness`, titres hiérarchisés (un seul `h1`).

## Reste à faire (hors design)

1. Remplacer les coordonnées provisoires : téléphone `01 XX XX XX XX`, e-mail `contact@[domaine].fr`, adresse exacte.
2. Brancher le formulaire : ajouter `data-endpoint="https://…"` sur `<form id="quote-form">` (Formspree, Basin ou API maison). Sans cela, le formulaire affiche un message « démonstration ».
3. Vérifier les engagements affichés (assurance décennale, zone d'intervention, horaires) avec l'entreprise.
4. Ajouter de vraies photos de chantiers (section « Réalisations ») et des avis clients authentiques (Google Business Profile) — aucun avis n'a été inventé.
5. Créer les pages Mentions légales et Politique de confidentialité (obligatoires) et les lier dans le pied de page.
