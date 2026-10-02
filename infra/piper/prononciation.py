# -*- coding: utf-8 -*-
"""Dictionnaire de prononciation, applique avant la synthese.

Piper lit ce qu'on lui ecrit. Sur un texte metier, cela produit quatre familles
de fautes, toutes entendues sur les essais du 27/09 :

  - les sigles lus comme des mots. « ST Digital » etait prononce « sans
    digital ». Or ST n'est pas un mot : c'est Solutions de Transformation, et
    les deux lettres doivent s'entendre.
  - les noms propres hors du francais courant. « Isaac » sortait deforme, au
    point d'etre reentendu « Isalak » par la reconnaissance.
  - les chiffres romains, lus a voix haute comme tels : « Tier III » devenait
    « Tier trois romain ».
  - la ponctuation typographique. Le modele de langue rend volontiers
    l'apostrophe courbe ; une apostrophe que le moteur ne reconnait pas casse
    l'elision, et « l'assistant » se met a se lire « L assistant », la lettre
    epelee.

On ne corrige pas cela en changeant de moteur, mais en ecrivant au moteur ce
qu'il doit dire. Ce fichier est donc une table, pas du code : elle se complete
au fil des mots qu'on entend mal, sans toucher au service.

Regle de redaction : la cle est la forme ecrite telle qu'elle apparait dans les
reponses d'Isaac ou dans la base de connaissances ; la valeur est la graphie
qui se prononce juste. La substitution respecte les limites de mots, pour ne
pas transformer « district » en « diS Trict ».
"""
import re

# Le prenom de l'assistant. La graphie a ete choisie a l'oreille parmi quatre
# candidates soumises en contexte : ecrit normalement, la voix upmc le deforme.
PRENOM = "Izak"

# Le sigle de l'entreprise. Il s'epelle : S, puis T. Jamais « st » en un son.
SIGLE = "S T"

TABLE = {
    # --- identite
    r"\bST\s+DIGITAL\b": SIGLE + " Digital",
    r"\bST\s+Digital\b": SIGLE + " Digital",
    r"\bST\b": SIGLE,
    r"\bSTD\b": "S T D",

    # --- vocabulaire technique
    r"\bTier\s+III\b": "Tier 3",
    r"\bTier\s+II\b": "Tier 2",
    r"\bTier\s+I\b": "Tier 1",
    r"\bQR\s*code\b": "cu ar code",
    r"\bFAQ\b": "F A Q",
    r"\bRDV\b": "rendez-vous",
    r"\bIA\b": "I A",
    r"\bISO\b": "I S O",
    r"\bHDS\b": "H D S",
    r"\bTIA-942\b": "T I A 942",
    r"\bDatacenter\b": "Data center",
    r"\bdatacenter\b": "data center",
    r"\bDatacenters\b": "Data centers",
    r"\bdatacenters\b": "data centers",

    # --- lieux, souvent hors du francais courant
    r"\bGrand-Bassam\b": "Grand Bassam",

}

# --- regles qui ne valent QU'EN FRANCAIS -------------------------------------
#
# « Izak » a ete choisi a l'oreille pour une voix francaise, qui deforme
# « Isaac ». Une voix anglaise dit « Isaac » tres bien, et lirait « Izak »
# comme un mot etranger.
#
# Les adresses, elles, doivent etre annoncees dans la langue de la phrase qui
# les porte : « l'adresse affichee a l'ecran » au milieu d'un texte anglais
# etait la faute la plus visible, et c'est celle qu'un visiteur anglophone
# entendait chaque fois qu'il demandait un contact.
TABLE_FR = {
    r"\bIsaac\b": PRENOM,
    r"\b[\w.+-]+@[\w-]+\.[\w.]+\b": "l'adresse affichee a l'ecran",
    r"https?://\S+": "le lien affiche a l'ecran",
}

TABLE_EN = {
    r"\b[\w.+-]+@[\w-]+\.[\w.]+\b": "the address shown on the screen",
    r"https?://\S+": "the link shown on the screen",
}

# Ponctuation typographique ramenee a la ponctuation simple. Les guillemets
# disparaissent : la pause qu'ils marquent suffit a l'oral.
TYPOGRAPHIE = {
    "’": "'",      # apostrophe courbe, celle que produit le modele
    "‘": "'",
    "“": "",       # guillemets anglais
    "”": "",
    "«": "",       # guillemets francais
    "»": "",
    "–": ", ",     # tiret demi-cadratin
    "—": ", ",     # tiret cadratin
    "…": ". ",     # points de suspension
    " ": " ",      # espace insecable
    " ": " ",      # espace fine insecable
    "œ": "oe",     # ligature, rarement bien rendue
    "Œ": "OE",
}

# Les heures ecrites « 8h » ou « 17h30 » se lisent mal. On les developpe.
HEURE_MINUTES = re.compile(r"\b(\d{1,2})\s*h\s*(\d{2})\b")
HEURE_PLEINE = re.compile(r"\b(\d{1,2})\s*h\b(?!\d)")

def _compile(table):
    return [(re.compile(motif), remplacement) for motif, remplacement in table.items()]


COMPILEES = _compile(TABLE)
COMPILEES_FR = _compile(TABLE_FR)
COMPILEES_EN = _compile(TABLE_EN)

PUCE = re.compile(r"^\s*[-*•]\s*", re.M)
ESPACE_AVANT_PONCT = re.compile(r"\s+([,.;:!?])")
ESPACE_APRES_PONCT = re.compile(r"([,.;:!?])(?=[^\s,.;:!?])")
PONCT_REPETEE = re.compile(r"([,.;:!?])(?:\s*[,.;:!?])+")
ESPACES = re.compile(r"\s{2,}")


def prepare(texte, langue="fr"):
    """Rend le texte tel qu'il doit etre prononce, sans changer son sens.

    `langue` choisit les regles propres a chaque langue. Le defaut reste le
    francais : tout appelant ecrit avant aujourd'hui continue de fonctionner
    exactement comme avant."""
    anglais = str(langue or "fr").lower().startswith("en")
    t = texte
    for avant, apres in TYPOGRAPHIE.items():
        t = t.replace(avant, apres)

    # « 17h30 » est une ecriture francaise. En anglais la regle ne trouverait
    # presque rien, mais quand elle trouve, elle injecte le mot « heures » au
    # milieu d'une phrase anglaise.
    if not anglais:
        t = HEURE_MINUTES.sub(lambda m: "%s heures %s" % (m.group(1), m.group(2)), t)
        t = HEURE_PLEINE.sub(lambda m: "%s heures" % m.group(1), t)

    for motif, remplacement in (COMPILEES_EN if anglais else COMPILEES_FR):
        t = motif.sub(remplacement, t)

    for motif, remplacement in COMPILEES:
        t = motif.sub(remplacement, t)

    # Une liste a puces se lit comme une suite d'elements, pas comme des tirets.
    t = PUCE.sub("", t)
    t = re.sub(r"\n{2,}", ". ", t)
    t = t.replace("\n", ", ")

    # Les substitutions laissent la ponctuation decollee du mot, et Piper
    # marquerait alors sa pause au mauvais endroit.
    t = ESPACE_AVANT_PONCT.sub(r"\1", t)
    t = PONCT_REPETEE.sub(r"\1", t)
    t = ESPACE_APRES_PONCT.sub(r"\1 ", t)
    return ESPACES.sub(" ", t).strip()


# Note deliberee : on ne tente PAS de reconstituer une elision absente, du
# genre « l assistant » vers « l'assistant ». La tentation etait grande, le
# defaut ayant ete remarque a l'ecoute, mais il venait d'une commande d'essai
# ou les apostrophes avaient ete retirees pour contourner le shell, pas d'un
# texte reel : la base de connaissances et les reponses du modele portent de
# vraies apostrophes. Deviner l'elision reviendrait a reecrire du texte correct
# sur la foi d'une heuristique, pour corriger un cas qui ne se produit pas.
