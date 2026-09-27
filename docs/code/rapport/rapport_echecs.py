# -*- coding: utf-8 -*-
"""Ajoute au rapport de stage une section sur les echecs silencieux.

Elle se place en fin de chapitre 6, apres « Limites identifiees » et avant la
conclusion : c'est un resultat de la demarche de test, pas une difficulte de
mise en oeuvre.

Le fichier d'origine n'est pas modifie. Une v6 est ecrite a cote.
"""
import copy
import os
import sys

from docx import Document
from docx.shared import Pt

DOSSIER = r"C:/Users/AMBER/OneDrive - ST DIGITAL SARL/Documents/Dossier Stage"
SOURCE = os.path.join(DOSSIER, "RapportStageSTD_v4.docx")
CIBLE = os.path.join(DOSSIER, "RapportStageSTD_v6.docx")

TITRE = "6.6  Les échecs silencieux : une catégorie de défaut à part"

CORPS = [
    ("p", "Une part importante du temps de mise au point n'a pas été consacrée à des erreurs, "
          "mais à des pannes qui n'en produisaient aucune. Le système répondait, le code de "
          "retour était celui du succès, l'interface ne signalait rien — et le résultat était "
          "faux. Ces défauts, que l'on peut appeler échecs silencieux, se sont révélés la "
          "catégorie la plus coûteuse du projet, et méritent d'être traités comme un résultat "
          "à part entière plutôt que comme des anecdotes de développement."),

    ("p", "Seize cas ont été recensés au cours du stage. Quatre suffisent à en montrer le "
          "mécanisme."),

    ("h", "L'assistant qui inventait sans le dire"),
    ("p", "La base de connaissances était indexée dans un magasin vectoriel en mémoire. Tout "
          "redémarrage du conteneur d'orchestration la vidait. Isaac continuait alors de "
          "répondre, en français correct et avec aplomb, mais sans aucun contexte : il "
          "inventait. Interrogé sur les horaires d'accueil, il a annoncé « de 8h00 à 18h00, "
          "samedi de 8h00 à 12h00 », quand la base validée indique 8h-17h du lundi au vendredi, "
          "fermé le week-end."),
    ("p", "Aucun signal ne l'accompagnait : ni erreur, ni avertissement, ni trace dans le "
          "journal. Le défaut s'est produit deux fois, à six jours d'intervalle, car tout "
          "déploiement impose un redémarrage. Il a été résolu en remplaçant le magasin en "
          "mémoire par une base PostgreSQL dotée de l'extension pgvector."),

    ("h", "Un journal écrit là où personne ne lisait"),
    ("p", "Le back-office lisait l'historique des conversations dans la base de données, tandis "
          "que le workflow de dialogue continuait de l'écrire dans un fichier du conteneur, "
          "vestige de l'architecture antérieure à la migration. Les deux opérations "
          "réussissaient ; simplement, ce n'était pas le même endroit."),
    ("p", "La conséquence n'est apparue qu'en examinant les dates de dernière modification : la "
          "ligne de base était figée depuis trois semaines. Elle contenait 63 échanges, le "
          "fichier en contenait 255. Toute la recette des vingt questions et la journée de mesure "
          "des performances étaient invisibles depuis l'interface d'administration, et les "
          "compteurs d'usage affichaient donc des valeurs fausses, non un creux d'activité."),

    ("h", "Un service qui répond « succès » sur un résultat vide"),
    ("p", "Lors de la mesure de la reconnaissance vocale, neuf enregistrements sur dix sont "
          "revenus vides, avec un code de retour 200 et un corps de réponse valide. Un client "
          "naïf en aurait conclu que le visiteur n'avait rien dit."),
    ("p", "C'est le temps de réponse qui a trahi le défaut, et non son contenu : dix "
          "millisecondes pour transcrire cinq secondes de parole est impossible. Le service ne "
          "savait pas décoder le format produit par l'enregistreur, et échouait sans le signaler. "
          "Converti en WAV 16 kHz mono, le même fichier se transcrit parfaitement en 1,7 seconde."),

    ("h", "Une vérification qui confirmait sa propre erreur"),
    ("p", "L'encodeur de codes QR écrit pour le projet produisait des matrices qui se relisaient "
          "parfaitement avec le décodeur développé en parallèle, et qu'aucun lecteur standard "
          "n'acceptait. Le test maison passait, et validait l'erreur qu'il aurait dû détecter."),
    ("p", "Le défaut n'a été identifié qu'en confrontant la sortie à un décodeur indépendant : "
          "l'information de format devait être inscrite du bit de poids fort vers le bit de poids "
          "faible, et l'ordre inverse produisait une matrice cohérente avec elle-même mais "
          "illisible pour tout autre."),

    ("h", "Ce que ces cas ont en commun, et ce qu'ils enseignent"),
    ("p", "Un mécanisme unique les explique tous : quelque part dans la chaîne, une opération qui "
          "échoue renvoie exactement le même signal qu'une opération qui réussit. Un code 200 sur "
          "un texte vide. Un fichier correctement écrit que plus personne ne lit. Un paramètre "
          "accepté puis ignoré. Un magasin vectoriel vide qui répond quand même."),
    ("p", "Trois habitudes de travail se sont révélées plus efficaces que tout outillage pour les "
          "détecter, et elles ont été adoptées comme règles pour la suite du projet."),
    ("l", "Vérifier par le canal réel plutôt que par relecture. Une requête effectivement émise "
          "plutôt qu'une lecture de configuration ; un décodeur indépendant plutôt que le sien. "
          "Une règle de filtrage supprimée d'un fichier de configuration a ainsi paru corrigée "
          "pendant plusieurs jours alors qu'une règle voisine, appliquée par préfixe, continuait "
          "de laisser passer les appels."),
    ("l", "Se méfier de ce qui est trop rapide, trop identique ou trop figé. Dix millisecondes "
          "pour cinq secondes d'audio ; deux réglages censés différer qui rendent le même texte au "
          "caractère près, signe qu'un paramètre n'est pas appliqué ; une ligne de base inchangée "
          "depuis trois semaines dans un système utilisé tous les jours."),
    ("l", "Poser, après chaque intervention, une question dont la réponse est connue. C'est cette "
          "seule habitude qui a permis de surprendre l'assistant en train d'inventer des horaires, "
          "et elle l'a permis deux fois."),
    ("p", "Ces seize cas ont été consignés dans un document dédié, avec pour chacun la manière "
          "dont il se manifestait, la raison pour laquelle rien ne l'annonçait, la façon dont il a "
          "été découvert et le correctif qui l'empêche aujourd'hui. Deux d'entre eux s'étaient "
          "produits deux fois, faute d'avoir été consignés la première : c'est précisément ce qui "
          "justifie l'existence de ce document."),
    ("p", "Au-delà du projet lui-même, cette expérience conduit à une conclusion méthodologique. "
          "Dans un système composé de services hétérogènes — application web, orchestrateur, "
          "modèle de langage, base de données, serveur mandataire —, le risque principal n'est pas "
          "que les composants tombent en panne, car une panne visible se corrige. Le risque est "
          "qu'ils continuent de fonctionner en donnant des résultats faux, et que rien dans la "
          "chaîne ne soit chargé de s'en apercevoir."),
]


def style_present(doc, nom):
    return any(s.name == nom for s in doc.styles)


d = Document(SOURCE)

# La section se place juste avant la conclusion.
ancre = None
for p in d.paragraphs:
    if p.style.name.startswith("Heading") and p.text.strip().upper().startswith("CONCLUSION"):
        ancre = p
        break
if ancre is None:
    print("ECHEC : conclusion introuvable, rien n'a ete ecrit")
    sys.exit(1)


def insere_avant(paragraphe_ancre, texte, style):
    """python-docx n'offre pas d'insertion ; on clone un paragraphe existant et
    on le replace au bon endroit dans l'arbre XML."""
    nouveau = copy.deepcopy(paragraphe_ancre._p)
    paragraphe_ancre._p.addprevious(nouveau)
    from docx.text.paragraph import Paragraph
    par = Paragraph(nouveau, paragraphe_ancre._parent)
    for r in list(par.runs):
        r._r.getparent().remove(r._r)
    par.style = d.styles[style]
    par.add_run(texte)
    return par


STYLE_TITRE = "Heading 3" if style_present(d, "Heading 3") else "Heading 2"
STYLE_SOUS = "Heading 4" if style_present(d, "Heading 4") else STYLE_TITRE
STYLE_CORPS = "Normal"
STYLE_LISTE = "List Paragraph" if style_present(d, "List Paragraph") else "Normal"

insere_avant(ancre, TITRE, STYLE_TITRE)
poses = 1
for genre, texte in CORPS:
    if genre == "h":
        insere_avant(ancre, texte, STYLE_SOUS)
    elif genre == "l":
        p = insere_avant(ancre, texte, STYLE_LISTE)
        p.paragraph_format.left_indent = Pt(18)
    else:
        insere_avant(ancre, texte, STYLE_CORPS)
    poses += 1

d.save(CIBLE)
print("section posee : %d paragraphes" % poses)
print("styles employes : %s / %s / %s" % (STYLE_TITRE, STYLE_SOUS, STYLE_LISTE))
print("ecrit -> %s" % CIBLE)
print("l'original n'a pas ete modifie")
