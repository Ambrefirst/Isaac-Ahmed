# -*- coding: utf-8 -*-
"""Service de synthese vocale, pour Isaac.

Piper tourne ici meme, sur la tour : aucune phrase prononcee par Isaac, et
surtout aucune question de visiteur, ne sort de l'infrastructure. C'est la meme
exigence qui a fait retirer l'appel au generateur de QR code tiers.

Le modele est charge une fois au demarrage et reste en memoire. Le relire a
chaque requete couterait plusieurs centaines de millisecondes pour rien.

    POST /synthese   {"texte": "...", "voix": "siwis"}   ->  audio/wav
    GET  /sante                                          ->  etat et voix chargees
"""
import io
import json
import os
import sys
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from piper.voice import PiperVoice

import prononciation

DOSSIER_VOIX = os.environ.get("DOSSIER_VOIX", "/voix")
VOIX_PAR_DEFAUT = os.environ.get("VOIX_PAR_DEFAUT", "siwis")
PORT = int(os.environ.get("PORT", "5002"))
LONGUEUR_MAX = 2000  # caracteres ; au-dela, on refuse plutot que de faire attendre

VOIX = {}


def charge_les_voix():
    for nom in os.listdir(DOSSIER_VOIX):
        if not nom.endswith(".onnx"):
            continue
        chemin = os.path.join(DOSSIER_VOIX, nom)
        # fr_FR-siwis-medium.onnx -> siwis
        cle = nom.replace(".onnx", "").split("-")
        cle = cle[1] if len(cle) > 1 else nom
        debut = time.time()
        VOIX[cle] = PiperVoice.load(chemin, config_path=chemin + ".json", use_cuda=False)
        print("voix chargee : %s (%s) en %.1f s" % (cle, nom, time.time() - debut), flush=True)
    if not VOIX:
        print("ERREUR : aucune voix dans " + DOSSIER_VOIX, flush=True)
        sys.exit(1)


def synthetise(texte, cle):
    """Le texte passe par le dictionnaire de prononciation avant d'etre lu.
    Piper lit ce qu'on lui ecrit : les sigles, les noms propres et les chiffres
    romains doivent lui etre ecrits comme ils se prononcent."""
    voix = VOIX.get(cle) or VOIX.get(VOIX_PAR_DEFAUT) or next(iter(VOIX.values()))
    texte = prononciation.prepare(texte)
    tampon = io.BytesIO()
    with wave.open(tampon, "wb") as sortie:
        voix.synthesize(texte, sortie)
    return tampon.getvalue()


class Service(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        """Le journal par defaut ecrit une ligne par requete sur stderr ; on garde
        la meme information mais sur stdout, ou docker logs la lit sans la
        presenter comme une erreur."""
        print("%s - %s" % (self.address_string(), format % args), flush=True)

    def _repond(self, code, corps, type_contenu):
        self.send_response(code)
        self.send_header("Content-Type", type_contenu)
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def _json(self, code, objet):
        self._repond(code, json.dumps(objet, ensure_ascii=False).encode("utf8"),
                     "application/json; charset=utf-8")

    def do_GET(self):
        if self.path.rstrip("/") in ("/sante", ""):
            self._json(200, {"etat": "pret", "voix": sorted(VOIX.keys()),
                             "defaut": VOIX_PAR_DEFAUT,
                             "prononciations": len(prononciation.TABLE),
                             "prenom": prononciation.PRENOM,
                             "sigle": prononciation.SIGLE})
        else:
            self._json(404, {"error": "Chemin inconnu"})

    def do_POST(self):
        if self.path.rstrip("/") != "/synthese":
            self._json(404, {"error": "Chemin inconnu"})
            return
        try:
            taille = int(self.headers.get("Content-Length") or 0)
            corps = json.loads(self.rfile.read(taille) or b"{}")
        except Exception:
            self._json(400, {"error": "Corps JSON invalide"})
            return

        texte = (corps.get("texte") or "").strip()
        if not texte:
            self._json(400, {"error": "Texte manquant"})
            return
        if len(texte) > LONGUEUR_MAX:
            self._json(400, {"error": "Texte trop long", "maximum": LONGUEUR_MAX,
                             "recu": len(texte)})
            return

        debut = time.time()
        try:
            audio = synthetise(texte, corps.get("voix") or VOIX_PAR_DEFAUT)
        except Exception as e:
            print("echec de synthese : %s" % e, flush=True)
            self._json(500, {"error": "Synthese impossible"})
            return
        duree = time.time() - debut

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        # Utile pour mesurer sans instrumenter le client.
        self.send_header("X-Duree-Synthese-Ms", str(int(duree * 1000)))
        self.send_header("X-Caracteres", str(len(texte)))
        # Utile quand une prononciation surprend : on voit ce qui a ete lu.
        self.send_header("X-Texte-Lu", prononciation.prepare(texte)[:180]
                         .encode("ascii", "replace").decode("ascii"))
        self.end_headers()
        self.wfile.write(audio)


if __name__ == "__main__":
    charge_les_voix()
    print("service de synthese en ecoute sur le port %d" % PORT, flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Service).serve_forever()
