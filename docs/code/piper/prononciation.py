# -*- coding: utf-8 -*-
"""Dictionnaire de prononciation, applique avant la synthese.

Piper lit ce qu'on lui ecrit. Sur un texte metier, cela produit trois familles
de fautes, toutes entendues sur les premiers essais du 27/09 :

  - les sigles lus comme des mots. « ST Digital » etait prononce « sans
    digital ». Or ST n'est pas un mot : c'est Solutions de Transformation, et
    les deux lettres doivent s'entendre.
  - les noms propres hors du francais courant. « Isaac » sortait deforme, au
    point d'etre reentendu « Isalak » par la reconnaissance.
  - les chiffres romains, lus a voix haute comme tels : « Tier III » devenait
    « Tier trois romain ».

On ne corrige pas cela en changeant de moteur, mais en ecrivant au moteur ce
qu'il doit dire. Ce fichier est donc une table, pas du code : elle se complete
au fil des mots qu'on entend mal, sans toucher au service.

Regle de redaction : la cle est la forme ecrite telle qu'elle apparait dans les
reponses d'Isaac ou dans la base de connaissances ; la valeur est la graphie
qui se prononce juste. La substitution respecte les limites de mots, pour ne
pas transformer « district » en « diS Trict ».
"""
import re

# Le prenom de l'assistant. La graphie retenue a ete choisie a l'oreille parmi
# plusieurs candidates, la forme normale etant mal prononcee par la voix upmc.
PRENOM = "Izak"

# Le sigle de l'entreprise. Il s'epelle : S, puis T. Jamais « st » en un son.
SIGLE = "S T"

TABLE = {
    # --- identite
    r"\bIsaac\b": PRENOM,
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
    r"\bNkok\b": "Nkok",
    r"\bGrand-Bassam\b": "Grand Bassam",

    # --- courriels et adresses : lus lettre a lettre, c'est inutilisable a
    # l'oral. Isaac doit dire qu'il les affiche, pas les epeler.
    r"\b[\w.+-]+@[\w-]+\.[\w.]+\b": "l'adresse affichee a l'ecran",
    r"https?://\S+": "le lien affiche a l'ecran",
}

# Les heures ecrites « 8h » ou « 17h30 » se lisent mal. On les developpe.
HEURE_PLEINE = re.compile(r"\b(\d{1,2})\s*h\b(?!\d)")
HEURE_MINUTES = re.compile(r"\b(\d{1,2})\s*h\s*(\d{2})\b")

COMPILEES = [(re.compile(motif), remplacement) for motif, remplacement in TABLE.items()]


def prepare(texte):
    """Rend le texte tel qu'il doit etre prononce, sans changer son sens."""
    t = HEURE_MINUTES.sub(lambda m: "%s heures %s" % (m.group(1), m.group(2)), texte)
    t = HEURE_PLEINE.sub(lambda m: "%s heures" % m.group(1), t)
    for motif, remplacement in COMPILEES:
        t = motif.sub(remplacement, t)
    # Les puces et tirets de liste deviennent des pauses, pas des mots.
    t = re.sub(r"^\s*[-*•]\s*", "", t, flags=re.M)
    t = re.sub(r"\n{2,}", ". ", t)
    t = re.sub(r"\n", ", ", t)
    return re.sub(r"\s{2,}", " ", t).strip()
