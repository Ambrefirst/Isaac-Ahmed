# -*- coding: utf-8 -*-
"""Service de synthese vocale, pour Isaac.

Piper tourne ici meme, sur la tour : aucune phrase prononcee par Isaac, et
surtout aucune question de visiteur, ne sort de l'infrastructure. C'est la meme
exigence qui a fait retirer l'appel au generateur de QR code tiers.

Le modele est charge une fois au demarrage et reste en memoire. Le relire a
chaque requete couterait plusieurs centaines de millisecondes pour rien.

    POST /synthese   {"texte"|"segments", "langue", "voix", "vitesse", "silence"}   ->  audio/wav
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
VOIX_PAR_DEFAUT = os.environ.get("VOIX_PAR_DEFAUT", "pierre")
# La voix anglaise. Les modeles anglais portent « en_ » dans leur nom de
# fichier ; a defaut de reglage, on prend la premiere trouvee plutot que de
# servir une voix francaise a un texte anglais.
VOIX_ANGLAISE = os.environ.get("VOIX_ANGLAISE", "ryan")
PORT = int(os.environ.get("PORT", "5002"))
LONGUEUR_MAX = 2000  # caracteres ; au-dela, on refuse plutot que de faire attendre

VOIX = {}

# Nom public d'une voix -> (modele, identifiant de locuteur dans ce modele).
#
# Un fichier .onnx peut contenir plusieurs voix : `upmc` en porte deux, jessica
# et pierre. Le serveur ne transmettait aucun identifiant, donc Piper servait
# toujours la premiere et la seconde etait inatteignable. On lit desormais la
# carte que chaque modele declare, et on expose chaque locuteur par son nom.
LOCUTEURS = {}
# Les noms des voix anglaises, deduits du nom de fichier du modele. Sert de
# secours quand la voix anglaise declaree n'est pas installee : mieux vaut une
# autre voix anglaise qu'une voix francaise lisant de l'anglais.
ANGLAISES = set()


def charge_les_voix():
    for nom in sorted(os.listdir(DOSSIER_VOIX)):
        if not nom.endswith(".onnx"):
            continue
        chemin = os.path.join(DOSSIER_VOIX, nom)
        # fr_FR-siwis-medium.onnx -> siwis
        cle = nom.replace(".onnx", "").split("-")
        cle = cle[1] if len(cle) > 1 else nom
        debut = time.time()
        VOIX[cle] = PiperVoice.load(chemin, config_path=chemin + ".json", use_cuda=False)

        # Les locuteurs declares par le modele, s'il y en a plusieurs.
        carte = {}
        try:
            with io.open(chemin + ".json", encoding="utf8") as f:
                carte = json.load(f).get("speaker_id_map") or {}
        except Exception as e:
            print("carte des locuteurs illisible pour %s : %s" % (cle, e), flush=True)

        # Le nom du modele reste valide : un appelant ecrit avant aujourd'hui
        # demande « upmc » et doit continuer d'obtenir une voix.
        LOCUTEURS[cle] = (cle, None)
        if nom.lower().startswith("en_"):
            ANGLAISES.add(cle)
        for locuteur, ident in carte.items():
            LOCUTEURS[str(locuteur).lower()] = (cle, int(ident))
            if nom.lower().startswith("en_"):
                ANGLAISES.add(str(locuteur).lower())

        detail = ", ".join(sorted(carte)) if carte else "voix unique"
        print("voix chargee : %s (%s) en %.1f s [%s]"
              % (cle, nom, time.time() - debut, detail), flush=True)
    if not VOIX:
        print("ERREUR : aucune voix dans " + DOSSIER_VOIX, flush=True)
        sys.exit(1)
    print("voix exposees : %s | defaut : %s"
          % (", ".join(sorted(LOCUTEURS)), VOIX_PAR_DEFAUT), flush=True)
    if VOIX_PAR_DEFAUT not in LOCUTEURS:
        # On ne s'arrete pas — la borne doit parler — mais on le DIT, sinon la
        # voix changerait en silence au prochain redemarrage.
        print("ATTENTION : la voix par defaut « %s » n'existe pas, "
              "on servira « %s »" % (VOIX_PAR_DEFAUT, sorted(LOCUTEURS)[0]), flush=True)


def colle(morceaux):
    """Assemble plusieurs WAV de meme format en un seul.

    Tous sortent du meme modele : meme frequence, meme profondeur, meme nombre
    de canaux. On peut donc reprendre le premier en-tete et n'y corriger que
    les deux tailles. Si on se trompait de l'une des deux, le lecteur
    s'arreterait au nombre d'octets annonce et rendrait un son tronque — sans
    erreur, naturellement."""
    import struct

    morceaux = [m for m in morceaux if m and len(m) > 44]
    if not morceaux:
        return b""
    if len(morceaux) == 1:
        return morceaux[0]
    donnees = b"".join(m[44:] for m in morceaux)
    entete = bytearray(morceaux[0][:44])
    entete[4:8] = struct.pack("<I", 36 + len(donnees))
    entete[40:44] = struct.pack("<I", len(donnees))
    return bytes(entete) + donnees


def rogne_les_bords(wav):
    """Retire le silence de tete et de queue d'un WAV 16 bits mono.

    Les silences INTERIEURS sont conserves : c'est la respiration, et c'est
    precisement ce qu'on vient de regler. Seuls les bords partent."""
    import array
    import struct

    if len(wav) < 48 or wav[:4] != b"RIFF":
        return wav
    # L'en-tete produit par Piper fait 44 octets ; on ne cherche pas plus loin
    # que cela, et on rend le fichier tel quel si la forme surprend.
    entete, donnees = wav[:44], wav[44:]
    if len(donnees) < 2:
        return wav

    ech = array.array("h")
    ech.frombytes(donnees[: len(donnees) - (len(donnees) % 2)])
    if not len(ech):
        return wav

    pic = max(abs(v) for v in ech) or 1
    seuil = pic * 0.02
    MARGE = 1200   # environ 55 ms a 22 kHz : une attaque nette sans etre seche

    debut = 0
    while debut < len(ech) and abs(ech[debut]) < seuil:
        debut += 1
    fin = len(ech) - 1
    while fin > debut and abs(ech[fin]) < seuil:
        fin -= 1
    if fin <= debut:
        return wav

    debut = max(0, debut - MARGE)
    fin = min(len(ech) - 1, fin + MARGE)
    coupe = ech[debut:fin + 1].tobytes()

    # On reecrit les deux tailles de l'en-tete, sinon le lecteur s'arrete au
    # nombre d'octets annonce et rend un fichier tronque ou muet.
    neuf = bytearray(entete)
    neuf[4:8] = struct.pack("<I", 36 + len(coupe))
    neuf[40:44] = struct.pack("<I", len(coupe))
    return bytes(neuf) + coupe


def borne(valeur, mini, maxi, defaut):
    """Un reglage venu du reseau ne doit pas pouvoir immobiliser le service :
    une vitesse de 50 ferait parler Piper pendant des minutes."""
    try:
        v = float(valeur)
    except (TypeError, ValueError):
        return defaut
    return max(mini, min(maxi, v))


def voix_de_la_langue(langue):
    """La voix a servir quand l'appelant n'en a pas demande une en particulier."""
    if str(langue or "fr").lower().startswith("en"):
        if VOIX_ANGLAISE in LOCUTEURS:
            return VOIX_ANGLAISE
        for nom in sorted(ANGLAISES):
            return nom
    return VOIX_PAR_DEFAUT


def synthetise(texte, cle, vitesse=None, silence=None, langue="fr"):
    """Le texte passe par le dictionnaire de prononciation avant d'etre lu.
    Piper lit ce qu'on lui ecrit : les sigles, les noms propres et les chiffres
    romains doivent lui etre ecrits comme ils se prononcent."""
    cible = (LOCUTEURS.get(str(cle or "").lower())
             or LOCUTEURS.get(VOIX_PAR_DEFAUT)
             or LOCUTEURS[sorted(LOCUTEURS)[0]])
    modele, locuteur = cible
    voix = VOIX[modele]
    texte = prononciation.prepare(texte, langue)
    tampon = io.BytesIO()
    with wave.open(tampon, "wb") as sortie:
        reglages = {"speaker_id": locuteur}
        if vitesse is not None:
            reglages["length_scale"] = vitesse
        if silence is not None:
            reglages["sentence_silence"] = silence
        voix.synthesize(texte, sortie, **reglages)
    return rogne_les_bords(tampon.getvalue())


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
            self._json(200, {"etat": "pret", "voix": sorted(LOCUTEURS.keys()),
                             "anglaises": sorted(ANGLAISES),
                             "defaut_en": voix_de_la_langue("en"),
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
        if not texte and isinstance(corps.get("segments"), list):
            # Une suite de segments se suffit a elle-meme ; `texte` sert alors
            # seulement aux controles de longueur ci-dessous.
            texte = " ".join((s or {}).get("texte") or "" for s in corps["segments"]).strip()
        if not texte:
            self._json(400, {"error": "Texte manquant"})
            return
        if len(texte) > LONGUEUR_MAX:
            self._json(400, {"error": "Texte trop long", "maximum": LONGUEUR_MAX,
                             "recu": len(texte)})
            return

        debut = time.time()
        try:
            # Bornes volontairement etroites : au-dela de 1,6 la parole traine
            # au point qu'on la croit ralentie par une panne.
            # Bornes volontairement etroites : au-dela de 2,2 la parole traine
            # au point qu'on la croit ralentie par une panne.
            def reglage(d):
                v = borne(d.get("vitesse"), 0.7, 2.2, None) if "vitesse" in d else None
                si = borne(d.get("silence"), 0.0, 1.2, None) if "silence" in d else None
                return v, si

            langue = corps.get("langue") or "fr"
            # Une voix demandee explicitement l'emporte : c'est ce qui permet
            # d'essayer plusieurs voix anglaises sans rien redeployer.
            cle_voix = corps.get("voix") or voix_de_la_langue(langue)
            segments = corps.get("segments")
            if isinstance(segments, list) and segments:
                # Chaque segment a ses reglages : un hum gagne a etre etire, la
                # phrase qui suit perdrait a l'etre.
                morceaux = []
                for seg in segments[:8]:
                    t = (seg.get("texte") or "").strip()
                    if not t:
                        continue
                    v, si = reglage(seg)
                    morceaux.append(synthetise(t, cle_voix, v, si, langue))
                audio = colle(morceaux)
            else:
                v, si = reglage(corps)
                audio = synthetise(texte, cle_voix, v, si, langue)
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
