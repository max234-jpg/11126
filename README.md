# 🔥 Flammes Snapchat automatiques

Envoie un snap à tes amis **tous les matins à 9h** pour ne jamais perdre tes flammes.

Le script pilote ton **téléphone Android** depuis un ordinateur grâce à ADB. Il allume
l'écran, ouvre Snapchat, prend une photo, coche tes amis, envoie le snap puis reverrouille
le téléphone.

> ⚠️ **À savoir**
> - Snapchat interdit l'automatisation dans ses conditions d'utilisation. Il y a un risque
>   (faible mais réel) de blocage temporaire du compte. Tu l'utilises à tes risques.
> - **iPhone : non compatible.** iOS ne permet pas de contrôler une app de cette façon.
> - L'ordinateur doit être **allumé à 9h** et le téléphone **connecté** (USB ou Wi-Fi).

---

## 1. Prérequis

1. **Python 3** : https://www.python.org/downloads/ (sous Windows, coche « Add Python to PATH »).
2. **ADB (Android Platform Tools)** : https://developer.android.com/tools/releases/platform-tools
   Dézippe le dossier et ajoute-le à ton PATH (ou mets `adb` dans le même dossier que le script).
3. Sur le téléphone, **active le débogage USB** :
   - Paramètres → À propos du téléphone → appuie 7 fois sur « Numéro de build ».
   - Paramètres → Options pour les développeurs → active « Débogage USB ».
   - Sur Xiaomi : active aussi « Débogage USB (paramètres de sécurité) ».
4. Branche le téléphone, accepte la fenêtre « Autoriser le débogage USB » (coche « Toujours »).
5. Vérifie : `adb devices` doit afficher ton téléphone avec la mention `device`.

## 2. Configuration

```bash
cp config.example.json config.json      # Windows : copy config.example.json config.json
```

Ouvre `config.json` et mets les **noms de tes amis exactement comme ils apparaissent dans
la liste d'envoi Snapchat** (majuscules et emojis compris) :

```json
"amis": ["Léa", "Tom 🐸", "Maman"]
```

| Option | Rôle |
|---|---|
| `amis` | Liste des amis à qui envoyer le snap |
| `legende` | Texte ajouté sur le snap (sans emoji ni accent, ADB ne sait pas les taper). Mets `""` pour aucun texte |
| `code_deverrouillage` | Ton code PIN si le téléphone en a un (voir sécurité plus bas). `""` sinon |
| `appareil` | Numéro de série ADB si plusieurs téléphones sont branchés, sinon `null` |
| `delai_entre_actions` | Pause en secondes entre chaque action. Augmente-la si ton téléphone est lent |
| `attente_ouverture_snapchat` | Secondes d'attente pour que Snapchat se lance |
| `delai_aleatoire_max_minutes` | Envoie à une heure aléatoire entre 9h00 et 9h+X min, pour faire plus naturel |
| `verrouiller_apres` | Reverrouille l'écran à la fin |
| `coordonnees` | Position des boutons, en fraction de l'écran (0.5 = milieu) ou en pixels |

## 3. Test

Laisse le téléphone déverrouillé pour le premier essai :

```bash
python flammes.py run --dry-run    # simule, n'appuie sur rien
python flammes.py run --now        # envoie vraiment, tout de suite
```

Regarde le téléphone pendant que ça tourne. Si un bouton est raté :

```bash
python flammes.py dump      # liste les textes visibles à l'écran avec leurs coordonnées
python flammes.py tap 540 2100   # teste un appui à une position précise
```

Astuce : active **Options pour les développeurs → « Afficher la position du curseur »** pour
lire les coordonnées en touchant l'écran, puis mets-les dans `coordonnees` (en pixels).

## 4. Programmer l'envoi chaque jour à 9h

**Windows** : double-clique sur `installer_windows.bat`.
Désinstaller : `schtasks /Delete /TN "FlammesSnapchat" /F`

**Mac / Linux** :

```bash
./installer_cron.sh
```

Désinstaller : `crontab -l | grep -v 'flammes.py run' | crontab -`

Les résultats de chaque envoi sont écrits dans `flammes.log`.

## 5. Sans câble (ADB en Wi-Fi)

Android 11 et plus : Options pour les développeurs → **Débogage sans fil** → « Associer avec
un code », puis :

```bash
adb pair IP:PORT_ASSOCIATION     # entre le code affiché
adb connect IP:PORT
```

Le téléphone et le PC doivent être sur le même Wi-Fi, et la connexion se perd parfois au
redémarrage du téléphone. Le câble USB reste le plus fiable.

## Sécurité

- `config.json` est ignoré par git, donc ton code PIN n'est jamais publié.
- Mettre ton PIN dans un fichier n'est pas très sûr. Le plus simple : laisser le téléphone
  **sans verrouillage pendant qu'il charge**, avec Smart Lock (« Appareils de confiance » ou
  « Lieux de confiance ») dans les paramètres de sécurité Android.

## Dépannage

| Problème | Solution |
|---|---|
| `adb a echoue` / `no devices` | Rebranche le câble, accepte l'autorisation, vérifie `adb devices` |
| Ami introuvable | Le nom doit être identique à celui de la liste d'envoi. Vérifie avec `dump` sur cet écran |
| La photo n'est pas prise | Corrige `bouton_capture` dans `coordonnees` |
| Rien ne se passe à 9h | PC en veille ? Désactive la mise en veille, ou coche « Réveiller l'ordinateur » dans le Planificateur de tâches |
| Le téléphone reste verrouillé | Ajoute `code_deverrouillage` ou utilise Smart Lock |
