# Central Rénovation — 3 directions de design (v2)

Sources :
- **ui-ux-pro-max** (données `products.csv`, `colors.csv`, `ui-reasoning.csv`, `landing.csv`), profils
  « Construction/Architecture », « Architecture / Interior » et « Home Services ».
- **21st.dev**, catalogue de heroes : motifs « Editorial Collage Hero », « Split Hero With Image Cards », « Cinematic landing Hero ».

Ce que disent les données ui-ux-pro-max pour ce secteur :
- Pattern : *Hero-Centric + Feature-Rich*, orienté conversion et confiance.
- À éviter : « 2D-only layouts + poor image quality », « Hidden contact info + No certifications ».
- À avoir : photos haute qualité, portfolio de projets, coordonnées visibles, assurances / certifications affichées.

La v1 (« Mur à pêches », sans photo, tons olive) tombait précisément dans l'anti-pattern « 2D-only layout ». Elle est abandonnée.

---

## 1. « Atelier Premium » — retenue

Palette ui-ux-pro-max *Architecture / Interior* : monochrome + accent doré, imagerie forte.

- **Couleurs** : noir graphite `#171717`, blanc pierre `#F7F7F5`, pierre `#EFEDE8`, accent bronze `#A16207` (`#D4A24C` sur fond sombre).
- **Typo** : Archivo élargi en capitales pour les titres (architectural, solide), Manrope pour le texte.
- **Hero** : photo plein cadre d'un séjour rénové, voile sombre, titre très grand, deux CTA, téléphone visible, carte flottante « garanties ».
- **Sections** : collage éditorial 2 photos qui se chevauchent (motif 21st « Editorial Collage »), grille bento de prestations en photos, méthode sur fond noir, bâti montreuillois, bandeau d'appel, FAQ, formulaire.
- **Pour** : haut de gamme, rassurant, met en valeur les chantiers. **Contre** : dépend de bonnes photos (à remplacer par les vraies réalisations).

## 2. « Chantier Pro »

Palette ui-ux-pro-max *Construction/Architecture* : gris industriel + orange sécurité + bleu plan.

- **Couleurs** : ardoise `#334155`, blanc `#F8FAFC`, orange `#EA580C`.
- **Typo** : grotesque suisse très gras, chiffres et intitulés en mono.
- **Hero** : split 50/50 (motif 21st « Split Hero With Image Cards ») texte / pile de 3 photos de chantier, bandeau orange avec téléphone.
- **Pour** : énergique, très « pro du bâtiment ». **Contre** : plus commun dans le secteur, moins haut de gamme.

## 3. « Confiance Locale »

Palette ui-ux-pro-max *Home Services* : bleu confiance + orange d'action.

- **Couleurs** : bleu `#1E40AF`, fond `#EFF6FF`, orange `#EA580C` pour les CTA.
- **Typo** : sans-serif ronde et lisible.
- **Hero** : centré avec formulaire de devis directement dans le hero, badges d'assurance, avis Google.
- **Pour** : conversion maximale, rassure une clientèle familiale. **Contre** : look « artisan dépannage », peu différenciant.

---

## Recommandation

**Direction 1, « Atelier Premium »**, avec les éléments de conversion de la direction 3 (téléphone toujours visible, garanties dans le hero, formulaire court). C'est la version livrée dans `index.html`.
