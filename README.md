# Central Rénovation — site vitrine

Site statique (HTML / CSS / JS, sans dépendance) pour Central Rénovation, entreprise de rénovation intérieure à Montreuil (93).

## Contenu

```
index.html              page d'accueil
assets/css/styles.css   styles (jetons de couleur clair/sombre en tête de fichier)
assets/js/main.js       menu mobile, validation et envoi du formulaire de devis
docs/directions-design.md  les 3 directions proposées (A retenue)
docs/revue-ui.md           revue UI et liste de ce qui reste à compléter
```

## Voir le site en local

```bash
npx serve .
# ou ouvrir index.html directement dans le navigateur
```

## À compléter avant mise en ligne

Voir la section « Reste à faire » de [`docs/revue-ui.md`](docs/revue-ui.md) : coordonnées réelles, branchement du formulaire (`data-endpoint`), mentions légales, photos de chantiers.

Le site peut être hébergé tel quel sur GitHub Pages, Netlify ou tout hébergeur de fichiers statiques.
