# 🔥 Flammes Snapchat automatiques

Envoie un snap à tes amis **tous les matins à 9h** pour ne jamais perdre tes flammes.

Deux versions :

| | **Navigateur du PC** (recommandé) | Téléphone Android |
|---|---|---|
| Script | `flammes_web.py` | `flammes.py` |
| Comment | Pilote Snapchat Web dans Chrome | Pilote le téléphone via ADB |
| Il faut | PC allumé à 9h | PC allumé + téléphone branché |
| iPhone | ✅ (le téléphone ne sert pas) | ❌ |

> ⚠️ Snapchat interdit l'automatisation dans ses conditions d'utilisation. Il y a un risque
> (faible mais réel) de blocage temporaire du compte. Tu l'utilises à tes risques.
>
> Seuls les **snaps** (photos) comptent pour les flammes : un simple message de chat ne suffit pas.
> C'est pour ça que le script envoie une vraie photo via la caméra.

---

# 🖥️ Version navigateur (`flammes_web.py`)

Le script ouvre Chrome sur [Snapchat Web](https://www.snapchat.com/web), et pour chaque ami :
il ouvre sa conversation, active la caméra, prend une photo et l'envoie. Tu te connectes
**une seule fois** : la session est gardée dans le dossier `profil_navigateur/`.

## 1. Installation

1. **Python 3** : https://www.python.org/downloads/ (sous Windows, coche « Add Python to PATH »).
2. **Google Chrome** installé (sinon le script utilise Chromium).
3. Dans un terminal, dans le dossier du projet :

```bash
pip install -r requirements.txt
playwright install chromium
```

## 2. Configuration

```bash
cp config_web.example.json config_web.json      # Windows : copy config_web.example.json config_web.json
```

Ouvre `config_web.json` et mets les noms de tes amis **exactement comme ils apparaissent
dans Snapchat** (majuscules et emojis compris) :

```json
"amis": ["Léa", "Tom 🐸", "Maman"]
```

| Option | Rôle |
|---|---|
| `amis` | Liste des amis à qui envoyer le snap |
| `camera` | `"webcam"` = vraie webcam du PC · `"test"` = image de test (mire verte) · ou le chemin d'un fichier `.y4m`/`.mjpeg` pour envoyer toujours la même photo (voir plus bas) |
| `navigateur` | `"chrome"`, `"msedge"`, ou `null` pour Chromium |
| `chemin_navigateur` | Chemin d'un autre navigateur Chromium (Brave, etc.), sinon `null` |
| `navigateur_invisible` | `true` = fenêtre cachée. Snapchat peut bloquer ce mode : laisse `false` si ça ne marche pas |
| `delai_entre_actions` | Pause en secondes entre les clics. Augmente-la si ta connexion est lente |
| `attente_chargement` | Secondes d'attente pour que Snapchat Web charge |
| `delai_aleatoire_max_minutes` | Envoie à une heure aléatoire entre 9h00 et 9h+X min |
| `selecteurs` | Pour corriger un bouton que le script ne trouve pas (voir Dépannage) |

### Envoyer toujours la même photo (sans webcam)

Convertis ta photo avec [ffmpeg](https://ffmpeg.org/download.html) :

```bash
ffmpeg -loop 1 -i ma_photo.jpg -t 1 -vf "scale=720:-2" -pix_fmt yuv420p photo.y4m
```

Puis dans `config_web.json` : `"camera": "photo.y4m"`.

## 3. Connexion (une seule fois)

```bash
python flammes_web.py login
```

Une fenêtre Chrome s'ouvre : connecte-toi à Snapchat (code de vérification compris), coche
« Rester connecté », puis appuie sur **Entrée** dans le terminal.

## 4. Test

```bash
python flammes_web.py run --now
```

Regarde la fenêtre : chaque ami doit recevoir un snap. Le résultat est dans `flammes_web.log`.
Si un ami échoue, une capture d'écran est enregistrée dans `captures/`.

## 5. Programmer l'envoi chaque jour à 9h

**Windows** : double-clique sur `installer_windows.bat`.
Désinstaller : `schtasks /Delete /TN "FlammesSnapchat" /F`

**Mac / Linux** :

```bash
./installer_cron.sh
```

Désinstaller : `crontab -l | grep -v 'flammes' | crontab -`

Le PC doit être **allumé et ta session ouverte** à 9h. L'écran peut être verrouillé, mais
le PC ne doit pas être en veille.

## Dépannage (navigateur)

| Problème | Solution |
|---|---|
| « Pas connecté à Snapchat » | Relance `python flammes_web.py login` (la session expire de temps en temps) |
| Ami introuvable | Vérifie que le nom est identique à celui affiché dans Snapchat Web |
| Un bouton n'est pas trouvé (caméra, capture, envoyer) | Snapchat a peut-être changé son site. Lance `python flammes_web.py inspect`, clique sur « Pick locator » puis sur le bouton, copie le sélecteur et ajoute-le dans `config_web.json` (exemple ci-dessous) |
| La caméra est noire | Ferme les autres apps qui utilisent la webcam (Teams, Discord…), ou utilise `"camera": "photo.y4m"` |
| Rien ne se passe à 9h | PC en veille ? Coche « Réveiller l'ordinateur » dans le Planificateur de tâches (Windows) |

Exemple pour corriger le bouton caméra :

```json
"selecteurs": {
  "camera_conversation": ["button[aria-label='Ouvrir la caméra']"]
}
```

Les clés disponibles : `recherche`, `camera_conversation`, `capture`, `envoyer`, `page_connexion`.

---

# 📱 Version téléphone Android (`flammes.py`)

Le script pilote ton téléphone Android depuis l'ordi via ADB : il allume l'écran, ouvre
Snapchat, prend une photo, coche tes amis, envoie, puis reverrouille le téléphone.

## Prérequis

1. **Python 3**.
2. **ADB (Android Platform Tools)** : https://developer.android.com/tools/releases/platform-tools
   (dézippe-le et ajoute-le au PATH).
3. Sur le téléphone, active le **débogage USB** : Paramètres → À propos du téléphone → appuie
   7 fois sur « Numéro de build », puis Options pour les développeurs → « Débogage USB ».
4. Branche le téléphone, accepte « Autoriser le débogage USB ». `adb devices` doit l'afficher.

## Configuration et test

```bash
cp config.example.json config.json
python flammes.py run --dry-run     # simule, n'appuie sur rien
python flammes.py run --now         # envoie vraiment
python flammes.py dump              # liste les textes visibles à l'écran (calibrage)
python flammes.py tap 540 2100      # teste un appui à une position précise
```

| Option | Rôle |
|---|---|
| `amis` | Noms exacts tels qu'affichés dans la liste d'envoi Snapchat |
| `legende` | Texte sur le snap (sans emoji ni accent, ADB ne sait pas les taper). `""` pour aucun |
| `code_deverrouillage` | Code PIN du téléphone, ou `""` (mieux : Smart Lock pendant la charge) |
| `appareil` | Numéro de série ADB si plusieurs téléphones, sinon `null` |
| `coordonnees` | Position des boutons, en fraction de l'écran (0.5 = milieu) ou en pixels |

Astuce : Options pour les développeurs → « Afficher la position du curseur » pour lire les
coordonnées d'un bouton.

## Programmer à 9h

- **Windows** : `installer_windows.bat android`
- **Mac / Linux** : `./installer_cron.sh android`

ADB en Wi-Fi (Android 11+) : Options pour les développeurs → Débogage sans fil →
`adb pair IP:PORT` puis `adb connect IP:PORT`.

---

## Sécurité

- `config.json`, `config_web.json` et `profil_navigateur/` sont ignorés par git : ton code PIN
  et ta session Snapchat ne sont jamais publiés.
- Le dossier `profil_navigateur/` donne accès à ton compte Snapchat : ne le partage pas.
