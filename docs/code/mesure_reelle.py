# -*- coding: utf-8 -*-
"""Mesure de la reconnaissance sur de VRAIS enregistrements.

Les mesures du 27/09 portaient sur de la parole synthetique, et ne valaient
donc rien pour la qualite : on y mesurait la prononciation de Piper autant que
l'ecoute de Whisper. Ce passage-ci porte sur dix phrases dictees au micro, a la
distance d'une borne.

Trois conditions comparees, sur les memes fichiers :

  - sans amorce, pour avoir la mesure brute du modele ;
  - avec l'amorce metier, pour chiffrer ce qu'elle apporte reellement et non
    sur de la voix de synthese ;
  - avec l'amorce et le filtre de silence, qui est le reglage candidat pour la
    borne.

Le taux d'erreur est calcule APRES normalisation des accents, de la casse, de
la ponctuation et de l'ecriture des nombres et des heures. Une mesure qui
compte comme fautes les accents corrects et « 10h » ecrit en chiffres ne
mesure pas la reconnaissance, elle mesure la facon dont j'ai ecrit la
reference. C'est l'erreur du premier passage.
"""
import json
import re
import subprocess
import time
import unicodedata

WHISPER = "http://127.0.0.1:9000/asr"
DOSSIER = "/tmp/essais_reels"

AMORCE = ("Borne d'accueil de ST Digital. Vocabulaire attendu : datacenter, "
          "Nkok, Libreville, Douala, Grand-Bassam, Tier III, cloud souverain, "
          "colocation, rendez-vous, Obame, Nguema.")

REFERENCES = {
    "01": "Bonjour, quels sont les horaires d'ouverture ?",
    "02": "Ou se trouve le datacenter de Nkok ?",
    "03": "J'ai rendez-vous a dix heures avec monsieur Obame.",
    "04": "Je viens voir madame Nguema au service technique.",
    "05": "Est-ce que ST Digital propose du cloud souverain ?",
    "06": "Je voudrais prendre rendez-vous avec le service commercial.",
    "07": "Comment faire pour signaler mon depart ?",
    "08": "Le datacenter de Grand-Bassam est-il certifie Tier III ?",
    "09": "Euh je cherche la salle de reunion, s'il vous plait.",
    "10": "Merci.",
}

NOMBRES = {
    "zero": "0", "une": "1", "un": "1", "deux": "2", "trois": "3", "quatre": "4",
    "cinq": "5", "six": "6", "sept": "7", "huit": "8", "neuf": "9", "dix": "10",
    "onze": "11", "douze": "12", "treize": "13", "quatorze": "14", "quinze": "15",
    "seize": "16", "vingt": "20", "i": "1", "ii": "2", "iii": "3",
}


def normalise(t):
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = t.replace("'", " ").replace("-", " ")
    t = re.sub(r"(\d+)\s*h(?:eures?)?\b", r"\1 heures", t)
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return [NOMBRES.get(m, m) for m in t.split() if m]


def distance(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prec, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            prec, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prec + (x != y))
    return d[-1]


def duree(chemin):
    """Le conteneur porte ffmpeg mais pas ffprobe : on lit la duree dans ce que
    ffmpeg annonce sur son flux d'erreur, faute de mieux."""
    r = subprocess.run(["ffmpeg", "-i", chemin], capture_output=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", r.stderr.decode("utf8", "replace"))
    if not m:
        return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def transcris(chemin, amorce=None, vad=False):
    from urllib.parse import quote
    url = WHISPER + "?task=transcribe&language=fr&output=json"
    if amorce:
        url += "&initial_prompt=" + quote(amorce)
    if vad:
        url += "&vad_filter=true"
    debut = time.time()
    r = subprocess.run(["curl", "-s", "-X", "POST", url, "-F", "audio_file=@" + chemin],
                       capture_output=True)
    t = time.time() - debut
    try:
        return t, json.loads(r.stdout.decode("utf8")).get("text", "").strip()
    except Exception:
        return t, "(reponse illisible)"


durees = {}
for cle in REFERENCES:
    durees[cle] = duree("%s/%s.wav" % (DOSSIER, cle))

print("Dix enregistrements reels, %.1f s de parole au total, %.1f s en moyenne.\n"
      % (sum(durees.values()), sum(durees.values()) / len(durees)))

resume = []
for titre, amorce, vad in (
        ("SANS amorce", None, False),
        ("AVEC amorce metier", AMORCE, False),
        ("AVEC amorce et filtre de silence", AMORCE, True)):
    print("=" * 76)
    print(titre)
    print("=" * 76)
    tot_mots = tot_err = 0
    temps = []
    parfaites = 0
    for cle in sorted(REFERENCES):
        chemin = "%s/%s.wav" % (DOSSIER, cle)
        t, dit = transcris(chemin, amorce, vad)
        a, b = normalise(REFERENCES[cle]), normalise(dit)
        err = distance(a, b)
        tot_mots += len(a)
        tot_err += err
        temps.append(t)
        if err == 0:
            parfaites += 1
        marque = "  ok " if err == 0 else " !!! "
        print("%s %s | %4.1f s audio | %4.1f s | %d/%d mots"
              % (marque, cle, durees[cle], t, err, len(a)))
        if err:
            print("        attendu : %s" % REFERENCES[cle])
            print("        entendu : %s" % dit)
    taux = 100.0 * tot_err / tot_mots
    facteur = sum(temps) / sum(durees.values())
    resume.append((titre, taux, parfaites, sum(temps) / len(temps), facteur))
    print("\n  taux d'erreur mot : %.1f %%   (%d sur %d)" % (taux, tot_err, tot_mots))
    print("  phrases parfaites : %d sur %d" % (parfaites, len(REFERENCES)))
    print("  transcription : %.2f s en moyenne, facteur x%.2f\n" %
          (sum(temps) / len(temps), facteur))

print("=" * 76)
print("COMPARAISON")
print("=" * 76)
print("  %-36s %8s %10s %9s" % ("", "erreur", "parfaites", "facteur"))
for titre, taux, parfaites, moy, facteur in resume:
    print("  %-36s %7.1f %% %6d/%d %9.2f" % (titre, taux, parfaites, len(REFERENCES), facteur))
