# Revue UI — page d'accueil Central Rénovation (v2, « Atelier Premium »)

Revue faite avec la grille de priorités **ui-ux-pro-max** (accessibilité → interaction → performance → style → responsive → typo/couleur → animation → formulaires → navigation),
sur des captures pleine page : bureau 1440 px (clair et sombre), tablette 820 px, mobile 390 px (avec menu ouvert).
Aucun défilement horizontal, aucune erreur console.

> 21st-ui-review n'a pas pu être utilisé : le plugin 21st n'est pas activé sur le compte et le code des composants 21st demande une clé API.
> Les motifs 21st (Editorial Collage Hero, Split Hero With Image Cards) ont été repris d'après leurs descriptions sur 21st.dev.

## Pourquoi la v1 ne fonctionnait pas

ui-ux-pro-max classe pour ce secteur l'anti-pattern « 2D-only layouts + poor image quality » et exige
des photos haute qualité et des coordonnées visibles. La v1 n'avait aucune photo et cachait le téléphone en bas de page.

## Corrigé pendant la revue

| # | Constat | Priorité ui-ux-pro-max | Correction |
|---|---------|------------------------|------------|
| 1 | Mobile : la fin du texte du hero passait sur la zone claire de la photo (contraste insuffisant). | 1 · Accessibilité | Voile vertical plus dense sous 560 px. |
| 2 | Mobile : l'intitulé au-dessus du titre passait sur 3 lignes. | 5 · Responsive | Intitulé raccourci (« Rénovation intérieure · Montreuil »). |
| 3 | Tuile « Cuisine » : étiquette et titre identiques. | 4 · Style | Étiquette « Pose et agencement ». |

## Points validés

- **Conversion** : téléphone visible en permanence dans l'en-tête, 4 boutons « devis » répartis, garanties dès le hero, formulaire court (2 champs obligatoires).
- **Contraste** : texte blanc sur voile ≥ 0,6 d'opacité ; bronze `#A16207` sur fond clair ≈ 5:1 ; bouton bronze avec texte noir ≈ 8:1.
- **Interaction** : cibles ≥ 44 px (boutons 48–56 px), menu mobile avec `aria-expanded`, fermeture par Échap, en-tête qui devient opaque au défilement.
- **Performance** : photos redimensionnées (90–400 Ko), `width`/`height` sur chaque image (pas de décalage de mise en page), `loading="lazy"` hors hero, hero préchargé.
- **Animation** : une seule séquence d'entrée (titre + carte) et un léger zoom de la photo ; tout est coupé avec `prefers-reduced-motion`.
- **Thème sombre** : jetons dédiés, sections photo identiques dans les deux thèmes.

## Reste à faire avant mise en ligne

1. **Photos** : ce sont des photos d'illustration Unsplash (licence libre). Les remplacer par de vrais chantiers de Central Rénovation dès que possible, et ajouter une section « Réalisations ».
2. **Coordonnées** : téléphone `01 XX XX XX XX` (et le lien `tel:+33100000000` de l'en-tête), e-mail `contact@[domaine].fr`, adresse.
3. **Formulaire** : ajouter `data-endpoint="https://…"` sur `<form id="quote-form">` (Formspree, Basin…).
4. **À confirmer** : assurance décennale, zone d'intervention, horaires, gratuité de la visite.
5. **Avis clients** : brancher de vrais avis Google (aucun n'a été inventé).
6. **Mentions légales** et politique de confidentialité.

## v3 — site multi-pages et animations

- 6 pages : Accueil, Prestations, Méthode, Zone, FAQ, Contact. Les liens du menu ouvrent chaque page (plus de défilement vers le bas).
- Lien de la page en cours souligné dans le menu, fil d'Ariane sur chaque page intérieure.
- Les boutons « Demander un devis » de la page Prestations présélectionnent le type de travaux dans le formulaire.
- Animations légères : apparition des blocs au défilement (en cascade), bandeau défilant des métiers, ligne de la frise qui se dessine, schéma de zone avec pulsation sur Montreuil, transition douce entre les pages (navigateurs compatibles), zoom lent des photos au survol.
- Toutes les animations sont coupées si l'utilisateur a activé « réduire les animations ». Sans JavaScript, tout le contenu reste visible.
- Vérifié sur les 6 pages en 1440 px et 390 px : aucun débordement horizontal, aucune erreur console, tous les blocs apparaissent.
