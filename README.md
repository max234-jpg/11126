# WebSell Local

Ta version perso de [websell.app](https://websell.app), à faire tourner sur ton ordinateur :

1. **Tu choisis un métier et une ville** : l'outil cherche sur OpenStreetMap les commerces **sans site web** (avec la source et la fiabilité de chaque fiche).
2. **Il crée leur site** : une page vitrine soignée par commerce, avec 4 directions artistiques (Éditorial, Noir, Suisse, Organique) animées avec GSAP, ScrollTrigger, Lenis et SplitType. Option : **Claude** rédige les textes, ou conçoit tout le site en suivant **tes skills** (`SKILL.md`).
3. **Tu valides, il envoie** : emails de prospection avec capture du site, **relances automatiques** (J+4, J+7…), quota par jour, horaires de bureau, désinscription. Les relances s'arrêtent dès que le prospect répond, signe ou se désinscrit.

Tout est stocké en local (`data/`), sans base de données ni compte en ligne.

## Démarrer

```bash
npm install
```

```bash
npx playwright install chromium
```

(optionnel : captures des sites jointes aux emails)

```bash
cp .env.example .env
```

(optionnel : ajoute ta clé `ANTHROPIC_API_KEY` pour activer Claude)

```bash
npm start
```

Puis ouvre **http://localhost:3000**. Node.js 22.9 ou plus récent est requis.

## Parcours

| Écran | Ce que tu y fais |
|---|---|
| **Accueil** | CA signé, pipeline, état des envois automatiques, liste de démarrage |
| **Campagnes** | Recherche métier + ville, sélection des prospects, génération des sites, préparation des emails, séquence et relances |
| **Prospects** | Fiches (email, horaires, prestations réelles, notes), statut (répondu / signé / perdu), import CSV, ajout manuel |
| **Sites** | Galerie. Retouche des textes, changement de thème, téléchargement du HTML livrable (sans bandeau « maquette ») |
| **Envois** | Brouillons à valider (modifiables), programmés, envoyés, échecs. « Tout valider » ou « Envoyer maintenant » |
| **Réglages** | Expéditeur, SMTP, simulation, rythme d'envoi, URL publique, IA et skills, bibliothèques JS des sites |

## Emails

- **Mode simulation** (activé par défaut) : rien ne part, chaque email est écrit dans `data/outbox/` en JSON. Désactive-le dans Réglages une fois ton SMTP testé.
- **SMTP** : n'importe quel fournisseur (Gmail avec mot de passe d'application, OVH, Brevo, Mailjet…). Les boutons « Tester la connexion » et « M'envoyer un email test » sont dans Réglages.
- **Variables** dans les modèles : `{{entreprise}} {{metier}} {{ville}} {{lien_site}} {{prix}} {{expediteur}} {{prenom_expediteur}} {{societe}} {{telephone}} {{signature}}`.
- Tes mentions légales et un moyen de se désinscrire sont ajoutés automatiquement à chaque email, ainsi que l'en-tête `List-Unsubscribe`.
- Rythme : 30 emails par jour au maximum par défaut, 90 à 240 s entre deux envois, du lundi au vendredi de 9 h à 18 h.

## Rendre les sites visibles par les prospects

Sans URL publique, le premier email contient une **capture** du site. Pour envoyer un vrai lien cliquable, expose ton serveur avec un tunnel, puis colle l'URL dans Réglages, champ « URL publique » :

```bash
cloudflared tunnel --url http://localhost:3000
```

Depuis l'extérieur, seuls `/s/…` (les sites) et `/u/…` (la désinscription) répondent : le tableau de bord reste privé. Les visites des prospects sont comptées sur chaque fiche.

## IA et skills

Avec `ANTHROPIC_API_KEY` dans `.env` :

- **Textes sur mesure** : Claude écrit l'accroche, l'intro et la description des prestations, et choisit le thème le plus adapté.
- **Design complet** : Claude produit un fichier HTML unique avec les bibliothèques configurées, en suivant les skills cochés dans Réglages.

Les skills sont lus dans `~/.claude/skills` et `./skills` (les dossiers se modifient dans Réglages). Un skill de design est fourni : `skills/site-design-premium/SKILL.md`. Le prompt interdit d'inventer des avis, des chiffres, des photos ou des récompenses : seules les informations de la fiche sont utilisées.

## Règles du jeu

- Prospecte uniquement des adresses professionnelles liées à l'activité, et honore chaque demande de désinscription (c'est automatique ici).
- Vérifie chaque fiche OpenStreetMap avant l'envoi : l'absence de site sur OSM ne garantit pas que le commerce n'en a pas.
- Les données OpenStreetMap sont © les contributeurs OpenStreetMap, sous licence ODbL.

## Structure

```
server.js              API + pages publiques + planificateur
src/db.js              stockage JSON (data/db.json) et réglages par défaut
src/osm.js             recherche Nominatim + Overpass
src/trades.js          métiers, tags OSM, prestations types, ambiance
src/generator/         rendu des sites (render.js), Claude (ai.js), captures (index.js)
src/mailer.js          construction des emails, SMTP / simulation
src/campaigns.js       séquences, validation, relances, quotas
src/skills.js          découverte des SKILL.md
public/                tableau de bord (HTML, CSS, JS sans build)
skills/                tes skills de design
```
