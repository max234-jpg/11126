// Copier ce fichier en config.h et le remplir (config.h n'est pas versionné).
#pragma once

#define WIFI_SSID      "mon-wifi"
#define WIFI_PASSWORD  "mon-mot-de-passe"

// Adresse du serveur relais (server/relay.py) sur le réseau local.
#define SERVER_URL     "http://192.168.1.50:8000/ask"

// Doit être identique à la variable DEVICE_TOKEN du serveur.
#define DEVICE_TOKEN   "change-moi"

// Passage en deep-sleep après 60 s sans appui.
#define IDLE_SLEEP_MS  60000
