"""Recherche de fiches via l'API officielle Google Places (New) – Text Search."""

import json
import time
import urllib.error
import urllib.request

URL = "https://places.googleapis.com/v1/places:searchText"
CHAMPS = ",".join([
    "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
    "places.nationalPhoneNumber", "places.internationalPhoneNumber", "places.websiteUri",
    "places.businessStatus", "places.types", "places.primaryType", "places.googleMapsUri",
    "places.rating", "places.userRatingCount", "nextPageToken",
])


class ErreurGoogle(Exception):
    pass


class Client:
    def __init__(self, cle: str | None, fixture: str | None = None):
        self.cle = cle
        self.requetes = 0
        self._fixture = None
        if fixture:
            with open(fixture, encoding="utf-8") as f:
                self._fixture = json.load(f)

    def rechercher(self, requete: str, page_token: str | None = None) -> tuple[list[dict], str | None]:
        self.requetes += 1
        if self._fixture is not None:          # mode test hors ligne
            fiches, self._fixture = self._fixture, []
            return fiches, None
        corps = {"textQuery": requete, "languageCode": "fr", "regionCode": "FR", "pageSize": 20}
        if page_token:
            corps["pageToken"] = page_token
        req = urllib.request.Request(
            URL, data=json.dumps(corps).encode(), method="POST",
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": self.cle,
                     "X-Goog-FieldMask": CHAMPS})
        for essai in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.load(r)
                return data.get("places", []), data.get("nextPageToken")
            except urllib.error.HTTPError as e:
                detail = e.read().decode(errors="replace")[:300]
                if e.code in (429, 500, 502, 503, 504) and essai < 3:
                    time.sleep(2 ** (essai + 1))
                    continue
                raise ErreurGoogle(f"HTTP {e.code} : {detail}") from None
            except urllib.error.URLError as e:
                if essai < 3:
                    time.sleep(2 ** (essai + 1))
                    continue
                raise ErreurGoogle(f"réseau : {e.reason}") from None
        raise ErreurGoogle("échecs répétés")
