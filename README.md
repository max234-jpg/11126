# Prospection automatique d'artisans sans site internet

Tous les matins vers **9h**, une automatisation GitHub Actions :

1. **cherche des artisans du BTP** (plombiers, électriciens, maçons, couvreurs, peintres, chauffagistes…) sur Google Maps via l'API officielle Google Places. Elle couvre d'abord **Paris et toute l'Île-de-France**, puis les grandes villes, et reprend chaque jour là où elle s'était arrêtée ;
2. **ne garde que les bons prospects** (jusqu'à 100 par jour) :
   - entreprise ouverte, en France, et qui n'est pas un magasin ;
   - **pas de vrai site internet** (une simple page Facebook, Instagram ou Pages Jaunes compte comme « pas de site », ces artisans restent ciblés) ;
   - **un portable 06/07** affiché sur la fiche Google ;
   - au moins 1 avis ;
   - pas un réseau de « dépannage SOS 24h/24 ». Un même 06 présent sur plusieurs fiches signale une plateforme de leads ou une arnaque, et ces fiches sont écartées automatiquement ;
   - jamais contacté auparavant, et absent de la liste STOP ;
3. **prépare ou envoie le message WhatsApp** avec le lien vers ton site de démo ;
4. **publie un rapport** sous forme d'issue GitHub. Tu reçois une notification par mail et dans l'appli GitHub. Le rapport liste les réponses de la veille (« intéressé » ou STOP) et les prospects du jour.

## Les deux modes WhatsApp

| | **`liens`** (par défaut) | **`api`** |
|---|---|---|
| Coût | **Gratuit** | Facturé par Meta à chaque message marketing (de l'ordre de quelques centimes d'euro par message, soit environ 200 € par mois pour 100 messages par jour, [voir la grille Meta](https://developers.facebook.com/docs/whatsapp/pricing)) |
| Envoi | Tu appuies sur **📲 Envoyer** pour chaque artisan dans l'issue du matin : WhatsApp s'ouvre avec le message déjà écrit. Compte environ 10 minutes par jour | 100 % automatique à 9h |
| Numéro | Ton WhatsApp (de préférence **WhatsApp Business** sur une **SIM dédiée** à 2 €/mois) | Un numéro enregistré sur l'API WhatsApp Cloud |
| Réponses | Directement sur ton téléphone | Récupérées par le webhook (dossier `webhook/`), notification instantanée possible, et listées dans le rapport du lendemain |
| STOP | Tu ajoutes le numéro dans `data/stop.txt` | Enregistrés automatiquement |

### « Un outil gratuit sans numéro pour WhatsApp » : ce qu'il faut savoir

- **WhatsApp exige toujours un numéro.** Le numéro de test gratuit de Meta n'envoie qu'à 5 destinataires validés à l'avance, il ne sert donc à rien pour prospecter.
- Les outils gratuits qui pilotent un compte WhatsApp en automatique (whatsapp-web.js, Baileys, extensions Chrome d'« envoi en masse ») **n'ont volontairement pas été branchés** : ils violent les conditions de WhatsApp, et 100 messages par jour à des inconnus mènent en général au **bannissement du numéro** en quelques jours.
- **La solution gratuite et fiable est le mode `liens`.** La recherche, le tri, le message et le suivi sont automatiques, seul l'appui sur « Envoyer » reste manuel. Utilise une SIM dédiée pour ne jamais risquer ton numéro perso.
- Le mode `api` est officiel. Meta demande toutefois en principe que le destinataire ait accepté d'être contacté : sur de la prospection à froid, surveille la note qualité du numéro dans WhatsApp Manager. Si beaucoup d'artisans te bloquent, Meta peut restreindre le numéro.
- En France, le **SMS** reste le canal le plus clair juridiquement pour la prospection B2B (voir plus bas).

## Mise en route (environ 20 minutes)

### 1. Passer le dépôt en **privé** (obligatoire)
Les numéros des artisans sont des données personnelles. Tant que le dépôt est public, le script refuse de tourner.
*Settings → General → Danger Zone → Change repository visibility → Private.*

### 2. Clé Google Places (API officielle)
1. Sur [console.cloud.google.com](https://console.cloud.google.com), crée un projet et active **Places API (New)**. Un moyen de paiement est requis, mais Google offre un quota gratuit chaque mois.
2. *APIs & Services → Credentials → Create credentials → API key.* Restreins la clé à « Places API (New) ».
3. Dans GitHub : *Settings → Secrets and variables → Actions → New repository secret* : `GOOGLE_PLACES_API_KEY`.

Budget : chaque jour, le script fait au maximum `max_requetes_google_par_jour` requêtes (60 par défaut, une requête = 20 fiches). Pour 100 prospects il en faut souvent 30 à 60, puisque seule une minorité d'artisans n'a ni site ni 06 affiché. Cela peut dépasser légèrement le quota gratuit mensuel : vérifie la [tarification Google](https://developers.google.com/maps/billing-and-pricing/pricing) et fixe une **alerte de budget** dans Google Cloud.

### 3. Remplir `prospection/config.toml`
- `[expediteur]` : ton prénom et le nom de ta société (obligatoires : la loi impose de s'identifier) ;
- `[demo] url` : le lien vers ton site de démo. `{metier}` permet une démo par métier (`…/demo/plombier`), `{slug}` une démo personnalisée par artisan ;
- le texte du message, les métiers et les zones si tu veux les ajuster.

Tant que des champs `A-REMPLIR` restent dans la config, **aucun message ne part**.

### 4. Activer
Fusionne cette branche dans la branche principale : GitHub ne déclenche les tâches planifiées que depuis la branche par défaut. Ensuite, dans *Actions → Prospection quotidienne → Run workflow*, coche « Test à blanc » pour vérifier que tout fonctionne. Les jours suivants, l'automatisation tourne seule vers 9h.

### 5. (Option) Mode `api` : envoi 100 % automatique
1. [developers.facebook.com](https://developers.facebook.com) → *Create app → Business* → ajoute **WhatsApp**, puis ajoute et vérifie ton numéro.
2. Dans *WhatsApp Manager → Modèles de messages*, crée un modèle **Marketing** nommé `demo_site_artisan`, langue **Français**, avec par exemple ce corps :
   > Bonjour, je suis [ton prénom] de [ta société]. J'ai trouvé « {{1}} » sur Google Maps mais je n'ai pas vu de site internet. J'ai préparé un exemple de site pour votre activité : {{2}} Ça vous plairait que je l'adapte à votre entreprise ? Répondez STOP si ce n'est pas pour vous.

   `{{1}}` = nom de l'entreprise, `{{2}}` = lien de démo.
3. Crée un **token permanent** (utilisateur système dans Business Settings) et ajoute ces secrets GitHub : `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
4. **Réponses** : déploie le webhook gratuit sur Cloudflare Workers :
   ```bash
   cd webhook && npx wrangler kv namespace create REPONSES   # copie l'id dans wrangler.toml
   npx wrangler secret put VERIFY_TOKEN   # mot de passe de ton choix
   npx wrangler secret put APP_SECRET     # Meta → App settings → Basic → App secret
   npx wrangler secret put API_TOKEN      # autre mot de passe de ton choix
   npx wrangler secret put NTFY_TOPIC     # optionnel : nom secret pour les notifs ntfy.sh
   npx wrangler deploy
   ```
   Dans Meta, configure le webhook : URL `https://<ton-worker>.workers.dev/webhook`, le *verify token* = `VERIFY_TOKEN`, puis abonne-toi au champ **messages**.
   Ajoute ensuite les secrets GitHub `REPONSES_URL` (`https://<ton-worker>.workers.dev`) et `REPONSES_TOKEN` (= `API_TOKEN`).
   Pour recevoir chaque réponse en notification instantanée, installe l'appli **ntfy** et abonne-toi au même `NTFY_TOPIC`.
5. Passe `mode = "api"` dans `config.toml`.

## Garanties « sans se tromper »

- **Jamais deux messages au même artisan** : l'historique (`data/prospects.csv`) est sauvegardé avant l'envoi et après **chaque** message. Il est commité même si le job plante.
- **STOP respecté à vie** (`data/stop.txt`).
- Si Meta bloque les envois (quota, modèle refusé, compte restreint), la tournée s'arrête net et les artisans non contactés sont repris le lendemain.
- Les journaux GitHub n'affichent jamais un numéro en entier.
- Tests automatiques avant chaque lancement (`python3 -m unittest discover -s tests`).

## Commandes utiles (en local)

```bash
python3 -m prospection.run --dry-run --force --fixture tests/fiches_exemple.json   # démo sans clé
```
```bash
GOOGLE_PLACES_API_KEY=... python3 -m prospection.run --dry-run --force             # vraie recherche, rien envoyé
```

## Cadre légal (France), à respecter

- La prospection B2B par message électronique d'un professionnel est permise sans accord préalable **si l'offre concerne son métier** (position de la CNIL). Il faut **s'identifier** et proposer un **moyen simple de refuser** : le message inclut « répondez STOP ».
- Ne recontacte jamais quelqu'un qui a dit STOP.
- Garde le dépôt privé, et supprime les prospects qui n'ont pas donné suite après 3 ans au plus (recommandation CNIL).

## Structure

```
prospection/config.toml   ← tout ce qui se règle
prospection/run.py        ← orchestration du matin
prospection/filtres.py    ← tri des fiches (site, 06/07, arnaques…)
prospection/places.py     ← API Google Places
prospection/whatsapp.py   ← API WhatsApp Cloud + lecture des réponses
prospection/rapport.py    ← issue GitHub du matin
webhook/worker.js         ← réception des réponses WhatsApp (Cloudflare)
data/                     ← historique (créé au 1er lancement)
.github/workflows/prospection.yml
```
