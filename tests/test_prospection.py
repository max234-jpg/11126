import json
import tomllib
import unittest
from pathlib import Path

from prospection import filtres, messages
from prospection.places import Client
from prospection.run import chercher

RACINE = Path(__file__).resolve().parent.parent
CFG = tomllib.loads((RACINE / "prospection" / "config.toml").read_text(encoding="utf-8"))
FIXTURE = RACINE / "tests" / "fiches_exemple.json"


class TestNumeros(unittest.TestCase):
    def test_portables(self):
        for brut in ["06 12 34 56 78", "+33 6 12 34 56 78", "0033612345678", "06.12.34.56.78"]:
            self.assertEqual(filtres.normaliser_numero(brut), "+33612345678")
        self.assertEqual(filtres.normaliser_numero("07 81 22 33 44"), "+33781223344")

    def test_pas_portables(self):
        for brut in ["01 45 00 00 04", "09 70 00 00 00", "+32 470 12 34 56", "", None, "0612"]:
            self.assertIsNone(filtres.normaliser_numero(brut))

    def test_affichage(self):
        self.assertEqual(filtres.numero_lisible("+33612345678"), "06 12 34 56 78")
        self.assertNotIn("34", filtres.masquer("+33612345678"))


class TestFiltres(unittest.TestCase):
    def setUp(self):
        self.fiches = {f["id"]: f for f in json.loads(FIXTURE.read_text(encoding="utf-8"))}

    def raison(self, pid):
        return filtres.evaluer(self.fiches[pid], CFG["filtres"])[1]

    def test_raisons(self):
        self.assertEqual(self.raison("ChIJ_ok_facebook_0001"), "retenu")   # page Facebook ≠ site
        self.assertEqual(self.raison("ChIJ_ok_sans_site_0002"), "retenu")
        self.assertEqual(self.raison("ChIJ_site_0003"), "a déjà un site")
        self.assertEqual(self.raison("ChIJ_fixe_0004"), "pas de 06/07")
        self.assertEqual(self.raison("ChIJ_ferme_0005"), "fermé")
        self.assertIn("réseau", self.raison("ChIJ_sos_0006"))
        self.assertIn("magasin", self.raison("ChIJ_magasin_0009"))
        self.assertEqual(self.raison("ChIJ_zero_avis_0010"), "pas assez d'avis")

    def test_vrai_site(self):
        exclus = CFG["filtres"]["domaines_sans_vrai_site"]
        self.assertFalse(filtres.a_un_vrai_site("https://m.facebook.com/x", exclus))
        self.assertFalse(filtres.a_un_vrai_site("https://plombier-x.business.site/", exclus))
        self.assertTrue(filtres.a_un_vrai_site("https://www.plombier-x.fr", exclus))
        self.assertFalse(filtres.a_un_vrai_site("", exclus))

    def test_stop(self):
        for t in ["STOP", "stop merci", "Arrêtez svp", "pas intéressé", "Non merci"]:
            self.assertTrue(filtres.est_un_stop(t), t)
        for t in ["Oui ça m'intéresse", "C'est combien ?", "Bonjour"]:
            self.assertFalse(filtres.est_un_stop(t), t)


class TestRecherche(unittest.TestCase):
    def test_bout_en_bout(self):
        etat = {}
        retenus, suspects, stats, _, alerte = chercher(
            CFG, etat, Client(None, str(FIXTURE)), set(), set(), set(), objectif=100)
        self.assertEqual(alerte, "")
        self.assertEqual({p["place_id"] for p in retenus}, {"ChIJ_ok_facebook_0001", "ChIJ_ok_sans_site_0002"})
        self.assertIn("+33699999999", suspects)   # même 06 sur deux fiches → écarté
        self.assertEqual(stats["même 06 sur plusieurs fiches (plateformes)"], 2)
        par_id = {p["place_id"]: p for p in retenus}
        self.assertEqual(par_id["ChIJ_ok_sans_site_0002"]["metier"], "électricien")  # catégorie Google
        self.assertEqual(par_id["ChIJ_ok_sans_site_0002"]["ville"], "Paris")         # tirée de l'adresse
        self.assertEqual(par_id["ChIJ_ok_facebook_0001"]["ville"], "Montreuil")

    def test_deja_contacte_et_stop(self):
        retenus, *_ = chercher(CFG, {}, Client(None, str(FIXTURE)), set(),
                               {"+33612345678"}, {"+33781223344"}, objectif=100)
        self.assertEqual(retenus, [])

    def test_message_et_lien(self):
        p = {"nom": "Plomberie Martin", "ville": "Montreuil", "code_postal": "93100", "place_id": "abcd1234",
             "metier": "peintre en bâtiment", "nb_avis": "23", "note": "4.8"}
        p["url_demo"] = messages.url_demo(p, CFG)
        self.assertTrue(p["url_demo"].endswith("/peintre-en-batiment"))
        texte = messages.texte_message(p, CFG)
        self.assertIn("« Plomberie Martin »", texte)
        self.assertIn("4,8/5", texte)
        self.assertIn("STOP", texte)
        self.assertTrue(messages.lien_whatsapp("+33612345678", texte).startswith("https://wa.me/33612345678?text="))


if __name__ == "__main__":
    unittest.main()
