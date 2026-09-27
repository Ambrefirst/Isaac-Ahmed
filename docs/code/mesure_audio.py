# -*- coding: utf-8 -*-
"""Second passage : un taux d'erreur honnete, et le vocabulaire metier.

Le premier passage annoncait 20,8 % de mots errones. En relisant les
transcriptions, la mesure etait fausse, pas le moteur :

  - « depart » -> « départ » etait compte comme une erreur alors que Whisper
    avait raison et que c'est mon texte de reference qui manquait l'accent ;
  - « a dix heures » -> « à 10h » et « monsieur » -> « Monsieur » sont des
    differences de normalisation, pas des erreurs d'ecoute.

Une mesure qui compte comme fautes les accents corrects et les chiffres bien
ecrits ne mesure pas la reconnaissance, elle mesure ma facon d'ecrire la
reference. On normalise donc avant de comparer.

Restent deux vraies erreurs au premier passage, toutes deux sur du vocabulaire
metier : « datacenter » entendu « data sante », et le nom « Obame » entendu
« Obama ». C'est precisement ce que l'amorce de contexte de Whisper sert a
corriger : on mesure ici ce qu'elle apporte.
"""
import json
import re
import subprocess
import time
import unicodedata
import wave

PIPER = "http://127.0.0.1:5002/synthese"
import os
VOIX = os.environ.get("VOIX", "siwis")
WHISPER = "http://127.0.0.1:9000/asr"

AMORCE = ("Borne d'accueil de ST Digital. Vocabulaire attendu : datacenter, "
          "data center, Nkok, Libreville, Douala, Grand-Bassam, Tier III, "
          "cloud souverain, colocation, Isaac Ahmed, rendez-vous, Obame, "
          "Nguema, Mba, Ella, Ndong, Moussavou.")

QUESTIONS = [
    "Bonjour, quels sont les horaires d'ouverture ?",
    "Je voudrais prendre rendez-vous avec le service commercial.",
    "Où se trouve le datacenter de Libreville ?",
    "J'ai un rendez-vous à dix heures avec monsieur Obame.",
    "Est-ce que vous proposez une offre de cloud souverain ?",
    "Comment faire pour signaler mon départ ?",
    "Le datacenter de Nkok est-il certifié Tier 3 ?",
    "Je viens voir madame Nguema au service technique.",
]

NOMBRES = {
    "zero": "0", "une": "1", "un": "1", "deux": "2", "trois": "3", "quatre": "4",
    "cinq": "5", "six": "6", "sept": "7", "huit": "8", "neuf": "9", "dix": "10",
    "onze": "11", "douze": "12", "treize": "13", "quatorze": "14", "quinze": "15",
    "seize": "16", "dix-sept": "17", "dix-huit": "18", "dix-neuf": "19", "vingt": "20",
}


def normalise(t):
    """Retire ce qui ne releve pas de l'ecoute : accents, casse, ponctuation,
    et l'ecriture des nombres et des heures."""
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = t.replace("'", " ").replace("-", " ")
    t = re.sub(r"(\d+)\s*h(?:eures?)?\b", r"\1 heures", t)
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    mots = [NOMBRES.get(m, m) for m in t.split()]
    # « 10 heures » et « dix heures » deviennent la meme chose
    return [m for m in mots if m]


def distance(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prec, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            prec, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prec + (x != y))
    return d[-1]


def duree_wav(c):
    with wave.open(c, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def synthetise(texte, chemin):
    subprocess.run(["curl", "-s", "-o", chemin, "-X", "POST", PIPER,
                    "-H", "Content-Type: application/json",
                    "-d", json.dumps({"texte": texte})], capture_output=True)
    return duree_wav(chemin)


def transcris(chemin, amorce=None):
    """L'amorce se passe en parametre d'URL, pas en champ de formulaire.
    Envoyee en champ, elle etait purement et simplement ignoree : les deux
    passages du premier essai rendaient exactement le meme texte, ce qui aurait
    du me mettre la puce a l'oreille immediatement."""
    from urllib.parse import quote
    url = WHISPER + "?task=transcribe&language=fr&output=json"
    if amorce:
        url += "&initial_prompt=" + quote(amorce)
    args = ["curl", "-s", "-X", "POST", url, "-F", "audio_file=@" + chemin]
    debut = time.time()
    r = subprocess.run(args, capture_output=True)
    t = time.time() - debut
    try:
        return t, json.loads(r.stdout.decode("utf8")).get("text", "").strip()
    except Exception:
        return t, r.stdout.decode("utf8", "replace").strip()


fichiers = []
for i, q in enumerate(QUESTIONS):
    c = "/tmp/q_%02d.wav" % i
    fichiers.append((q, c, synthetise(q, c)))

for titre, amorce in (("SANS amorce de contexte", None), ("AVEC amorce de contexte metier", AMORCE)):
    print("=" * 74)
    print(titre)
    print("=" * 74)
    tot_mots = tot_err = 0
    temps = []
    for texte, chemin, audio in fichiers:
        t, dit = transcris(chemin, amorce)
        a, b = normalise(texte), normalise(dit)
        err = distance(a, b)
        tot_mots += len(a)
        tot_err += err
        temps.append(t)
        marque = "   " if err == 0 else " ! "
        print("%s%4.1f s audio | %4.1f s | %d/%d mots" % (marque, audio, t, err, len(a)))
        if err:
            print("      attendu : %s" % texte)
            print("      entendu : %s" % dit)
    print("\n  transcription : %.2f s en moyenne, %.2f s au pire" %
          (sum(temps) / len(temps), max(temps)))
    print("  facteur temps reel : x%.2f" %
          (sum(temps) / sum(f[2] for f in fichiers)))
    print("  taux d'erreur mot : %.1f %%  (%d mots errones sur %d)\n" %
          (100.0 * tot_err / tot_mots, tot_err, tot_mots))
