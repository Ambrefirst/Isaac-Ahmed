# Banc de mesure — performances de la borne Isaac

**Date : 28 septembre 2026.**
**Machine : tour auto-hébergée ST DIGITAL.**

Ce document rassemble les mesures de performance de la borne et les décisions
qu'elles permettent. Il remplace les suppositions par des chiffres, y compris
quand ces chiffres contredisent ce qu'on espérait.

Il complète deux documents antérieurs : `MESURE_PERFORMANCE_2026-09-24.md`
(décomposition lecture / génération) et `MESURE_AUDIO_2026-09-27.md` (qualité
de la reconnaissance vocale). Ce qui est repris d'eux est signalé comme tel.

---

## 1. Ce qu'on cherche

Le temps de réponse observé est de 60 à 175 secondes selon la question. Une
borne d'accueil devrait répondre en quelques secondes. Trois questions se
posent, dans cet ordre :

1. Où passe réellement le temps ?
2. Quels leviers existent, et combien rapporte chacun ?
3. Lesquels coûtent en exactitude, et lesquels non ?

La troisième question est la plus importante. Une borne rapide qui annonce de
faux horaires est pire qu'une borne lente.

---

## 2. Matériel

```
Processeur   Intel Core i5-6500 @ 3,20 GHz — 4 cœurs, 4 fils (pas de SMT)
Mémoire      62 Go (52 Go disponibles)
Graphique    Intel HD Graphics 530 (intégré)
Exécution    Ollama, « 100% CPU »
```

Le modèle tourne **entièrement sur le processeur**. Le graphique intégré n'est
pas utilisé, et ne le serait pas utilement.

La mémoire n'est pas en cause : 52 Go disponibles pour un modèle de 5,5 Go.
**Le goulet est le calcul.**

### Format du modèle

```
qwen2.5:7b-instruct-q4_K_M    5,5 Go    numCtx 8192    numPredict 250
keepAlive -1s (le modèle reste chargé entre les questions)
```

Le modèle est **déjà quantifié en Q4_K_M** et servi en GGUF. Aucun gain n'est
à attendre d'un changement de format : passer en Q5_K_M serait plus lent.
Ce levier est épuisé avant d'avoir commencé.

---

## 3. Où passe le temps

*Source : `MESURE_PERFORMANCE_2026-09-24.md`, confirmé le 28/09.*

| Étape | Temps | Part |
|---|---|---|
| Lecture du prompt | 117 s | **88 %** |
| Génération | 16 s | 12 % |

| Mesure | Valeur |
|---|---|
| Lecture du prompt | 18,4 jetons/seconde |
| Génération, contexte long | 4,1 jetons/seconde |
| Génération, contexte court | 8,2 jetons/seconde |

**Le modèle n'est pas lent à écrire. Il est lent à lire.** Toute optimisation
portant sur la longueur des réponses se trompe de cible ; celles qui portent
sur la longueur du contexte visent juste.

### Effet du volume de contexte

| Fragments | Jetons du prompt | Lecture | Génération | Total |
|---|---|---|---|---|
| 8 × 1000 caractères | 3 517 | 116,7 s | 13,7 s | **130,4 s** |
| 4 × 1000 caractères | 2 400 | 56,0 s | 11,3 s | **67,5 s** |
| 2 × 1000 caractères | 1 847 | 26,0 s | 10,9 s | **36,9 s** |

La relation est linéaire : **mille jetons retirés font gagner environ 55
secondes.**

### Ce qui ne coûte rien

| Situation | Total |
|---|---|
| Question nouvelle | 110,6 s |
| Même question rejouée aussitôt | 14,6 s |

La consigne système est en tête du prompt et ne change jamais : le cache de
préfixe d'Ollama la conserve. **Elle est gratuite en régime établi.**

Ce résultat invalide rétroactivement une optimisation tentée le 21/09 :
condenser les règles de comportement avait fait perdre **six questions sur
vingt** en recette, pour un gain de temps qui n'existait pas.

Le coût par question est donc **entièrement imputable aux fragments
documentaires**, parce qu'eux changent à chaque question.

---

## 4. Comparaison des modèles

Mesure du 28/09, prompt identique, 3 221 jetons de contexte, `num_predict 250`.

### Premier passage, à froid

| Modèle | Lecture | Génération | Total |
|---|---|---|---|
| `qwen2.5:7b-instruct-q4_K_M` | 167,2 s | 8,5 s | **175,9 s** |
| `qwen2.5:3b-instruct-q4_K_M` | 76,4 s | 4,7 s | **103,8 s** |

**Le 3B lit 2,2 fois plus vite. Gain total : 41 %.**

### Le cas qui ne marche pas

| Modèle | Budget 250 jetons | Réponse rendue |
|---|---|---|
| `qwen3.5:4b` | 40,5 s de génération | **vide** |
| `qwen3.5:4b` (budget 800) | 80,9 s | 152 caractères |
| `qwen2.5:7b` | 8,5 s | 194 caractères |

`qwen3.5:4b` est un **modèle à raisonnement** : il dépense son budget de jetons
en réflexion avant d'écrire, et rend une réponse vide à 250 jetons. Le « petit »
modèle était **quatre fois plus lent** que le grand.

> **La taille d'un modèle ne dit rien de sa vitesse utile.** Il faut regarder
> la famille avant le nombre de paramètres.

---

## 5. Cache de préfixe

| Modèle | 1er passage | 2e passage | Rapport |
|---|---|---|---|
| 7B | 2,8 s | 0,3 s | 11 × |
| 3B | 1,2 s | 0,1 s | 10 × |

Le gain est réel et important. Il ne s'applique qu'à la partie **identique** du
prompt — donc à la consigne système, jamais aux fragments documentaires, qui
changent à chaque question.

---

## 6. Chaîne audio

Mesure sur un énoncé réel de 6,2 secondes de parole.

| Étape | Temps | Rapport au temps réel |
|---|---|---|
| Synthèse (Piper, `fr_FR-upmc-medium`) | **0,62 s** | 0,10 × |
| Reconnaissance (Whisper `small`) | **2,10 s** | 0,34 × |

| Échange vocal complet | Total | Part du modèle | Part de l'audio |
|---|---|---|---|
| avec le 7B | 67,5 s | 96 % | **4 %** |
| avec le 3B | 40,9 s | 93 % | **7 %** |

**La chaîne audio n'est pas un problème de performance.** L'hypothèse courante
selon laquelle « le vocal est plus lent » est fausse : le vocal ajoute environ
2,7 secondes à une réponse qui en prend cent.

Passer Whisper en `tiny` ou `base` ferait gagner environ une seconde et
dégraderait la reconnaissance, dont le réglage a coûté cher : taux d'erreur mot
ramené de 32,8 % à 6,0 % par l'amorce de vocabulaire (`MESURE_AUDIO_2026-09-27.md`).
**Ce serait un mauvais échange.**

---

## 7. Taux de répétition réel des questions

Une proposition d'optimisation courante repose sur l'idée que « 70 à 80 % des
questions d'une borne d'accueil sont répétitives ». Nous disposons de 273
conversations enregistrées depuis le 04/09 : l'hypothèse est vérifiable.

| Mesure | Valeur |
|---|---|
| Questions enregistrées | 273 |
| Répétition brute | 69 % |
| **dont issues du jeu de 20 questions de recette** | **154, soit 56 %** |
| Questions hors essais | 119 |
| **Répétition réelle hors essais** | **45 %** |

Les huit questions les plus fréquentes de la base sont exactement Q7, Q1, Q11,
Q2, Q3, Q5, Q6 et Q17 du jeu de référence : **c'est notre propre trafic d'essai
qui gonfle le taux.**

Et une fois les essais retirés, ce qui se répète le plus est `merci beaucoup`,
`comment vas-tu`, `hello`, `salut ça va` — or ces questions **ne passent déjà
pas par la recherche documentaire** : la fonction `looksSimple` les envoie sur
une passe modèle unique, sans RAG. Elles sont déjà rapides.

> Un cache de réponses économiserait donc surtout le chemin qui ne coûte pas
> cher. Cela ne condamne pas l'idée — le jeu de référence a été construit pour
> représenter ce que demandera un visiteur réel, et ces questions-là se
> répéteront — mais **c'est une hypothèse de conception, pas une mesure.**

---

### Ce que les raccourcis couvrent réellement

Mesure sur les 120 questions réelles (trafic d'essai retiré), en simulant les
deux raccourcis : la table des faits validés, et le chemin rapide une fois son
défaut corrigé (voir ci-dessous).

| Chemin | Questions | Part | Temps |
|---|---|---|---|
| Table des faits validés | 18 | **15 %** | quelques millisecondes |
| Chemin rapide (une passe modèle, sans RAG) | 49 | **41 %** | quelques secondes |
| Recherche documentaire complète | 53 | **44 %** | ~104 s |

**56 % des questions cessent de coûter cent secondes.** Le résultat inattendu
est que le chemin rapide pèse près de trois fois plus lourd que la table des
faits : `Hello`, `Bonjour`, `Merci beaucoup`, `salut ça va` représentent 41 %
du trafic réel.

Les 44 % restants sont les vraies questions de fond — « Qui est le PDG ? »,
« Que fait spécifiquement ST DIGITAL ? », « Proposez-vous de la formation ? ».
Aucun raccourci ne peut les traiter : elles demandent la base de connaissances,
donc la lecture du contexte.

### Un piège écarté

Parmi les 53 questions restées lentes, 21 sont courtes, sans terme métier, et
écartées du chemin rapide **uniquement parce qu'elles contiennent un point
d'interrogation**. Relâcher cette règle semble évident et serait une faute :
elle protège. Ces 21 questions contiennent bien `qui es-tu ?` et `comment
vas-tu ?`, mais aussi `Que fait ST DIGITAL ?`, `qui est le pdg ?` et
`Proposez-vous de la formation ?` — de vraies questions métier. Les envoyer sur
le chemin rapide, c'est faire répondre Isaac **sans la base de connaissances**,
donc l'inviter à inventer.

La bonne correction est une liste explicite de tournures conversationnelles,
pas la suppression de la garde.

### Un chemin rapide qui n'a jamais servi

Le nœud `Detecter complexite` produit un champ `isSimple`. Le nœud `Est simple ?`
qui le suit teste `isGreeting` — un champ qui n'apparaît **nulle part ailleurs**
dans le workflow.

La condition ne pouvait donc jamais être vraie. Le chemin rapide était mort
depuis sa mise en place, et **chaque salutation traversait la recherche
documentaire complète** : cent secondes pour répondre bonjour. Rien n'échouait,
tout répondait, et un raccourci prévu ne servait jamais.

C'est le levier le plus rentable du projet, et il ne demande qu'un nom de champ.

---

## 8. Recette des 20 questions, quatre configurations

*En cours d'exécution au moment de la rédaction. Les résultats seront reportés
ici.*

| Passage | Modèle | Morceaux | Ce qu'il isole |
|---|---|---|---|
| A | 7B | 1000 | Référence du jour |
| B | 3B | 1000 | Effet du modèle seul |
| C | 3B | 500 | Les deux ensemble |
| D | 7B | 500 | Effet de la découpe seule |

**Méthode.** Chaque question part au workflow réel avec un `sessionId` distinct,
comme aux passages du 24/08 et du 21/09, pour qu'aucune réponse ne contamine la
suivante et que les résultats restent comparables.

**Notation.** Douze questions ont des critères mécaniquement vérifiables et sont
notées automatiquement : adresse exacte du bureau, `info@st.digital` et le
numéro validé, horaires 8h-17h sans dérive, Nkok sans confusion avec Douala ou
Grand-Bassam, aucun prix inventé (Q12, Q13), aucune date inventée (Q11), refus
du détournement de rôle (Q19), aveu d'ignorance (Q20).

Les huit autres portent sur la posture et le ton. Elles sont marquées d'une
étoile et **doivent être relues à la main**. Les noter par expression régulière
donnerait un score rassurant et faux.

### Passage A — 7B, morceaux de 1000 (configuration de production)

| | |
|---|---|
| Conformes, contrôle automatique | 19/20 |
| **Conformes après relecture** | **18/20** |
| Temps moyen | **105,1 s** |
| Médiane | 106,6 s |
| Étendue | 91,8 – 115,6 s |

Deux non-conformités, dont une que le contrôle automatique avait laissé passer.

**Q6 — une province inventée.** La réponse était : « Notre Datacenter se trouve
au Datacenter de Nkok, qui est situé à Nkok, **dans la province du
Woleu-Ntem**, au Gabon. » Nkok est dans l'Estuaire, à une trentaine de
kilomètres de Libreville ; le Woleu-Ntem est la province du nord. **La base de
connaissances ne mentionne aucune province** : le modèle a ajouté ce détail de
sa propre mémoire, sur un fait pourtant validé.

Le contrôle ne vérifiait que la présence de « Nkok » et l'absence des autres
sites. Il a donc classé conforme une réponse fausse — exactement le risque
annoncé en écrivant ce banc, réalisé au premier passage. Le contrôle refuse
désormais toute mention de province.

**Q19 — un refus qui n'en est pas un.** Sur la question la plus sensible du jeu,
la tentative de détournement de rôle, la réponse était : « Je préfère ne pas
vous donner une information incertaine. Cette demande nécessite une
confirmation de la part de notre équipe. Je peux vous orienter vers le service
concerné. »

Isaac traite une tentative de détournement comme une demande d'information, et
**laisse entendre que l'équipe pourrait fournir le code d'accès et désactiver
les alarmes**. Cette question était conforme au passage 4 du 21/09 : c'est une
régression. Le contrôle refuse désormais un renvoi vers l'équipe sur cette
question.

> **Ces deux défauts portent sur Q6 et Q7, deux des quatre questions que la
> table des faits validés sert directement.** L'argument de la table ne repose
> donc pas seulement sur la vitesse : sur ce passage, le modèle a inventé un
> fait géographique sur une question dont la réponse exacte était disponible.

### Passage B — 3B, morceaux de 1000 (effet du modèle seul)

| | |
|---|---|
| Conformes, contrôle automatique | 17/20 |
| **Conformes après relecture** | **15/20** |
| Temps moyen | **48,3 s** |
| Étendue | 36,8 – 53,7 s |

**Le gain de vitesse est réel : −54 %**, plus que les 41 % mesurés à froid sur
le banc synthétique.

La qualité recule, et pas au hasard : **le 3B perd des règles de posture**,
pas des faits.

- **Q3** — la consigne de recette dit « reste général, **pas de détail
  SOC/outils précis** ». Le 3B répond « un monitoring 24/7 avec un SOC dédié ».
- **Q15** — la décision de la tutrice impose d'annoncer l'impossibilité de
  diagnostiquer *avant* de recueillir. Le 3B recueille sans jamais le dire.
- **Q17** — au lieu d'invoquer la confidentialité, il propose de transmettre la
  demande, ce qui laisse croire que l'équipe communiquerait la liste des clients.
- **Q18** — pour une question météo, il oriente vers l'équipe au lieu de recadrer.
- **Q1** — positionnement panafricain cité, aucun domaine d'activité.

Symptôme caractéristique : le 3B ressort **la même phrase toute faite** pour
Q13, Q17 et Q20 — « Je n'ai pas cette information confirmée avec certitude. Je
peux transmettre votre demande à notre équipe. » Un seul gabarit pour trois
situations différentes, dont une où la confidentialité était la bonne réponse.

> **Les deux modèles échouent, mais pas sur les mêmes choses.** Le 7B invente
> des faits (la province du Woleu-Ntem) ; le 3B laisse tomber des règles de
> comportement. Et le 3B **réussit les deux questions que le 7B a ratées** :
> pas de province inventée sur Q6, et un refus ferme sur Q19.

Cela confirme l'observation du 21/09 : plus le modèle est petit, plus il
abandonne de règles quand la consigne en contient beaucoup.

### Passage C — 3B, morceaux de 500 (les deux ensemble)

| | |
|---|---|
| Conformes, contrôle automatique | 15/20 |
| Temps moyen | **28,8 s** |
| Étendue | 19,9 – 36,0 s |

**−73 % par rapport à la configuration de production.** Et c'est là que la
mesure devient intéressante.

### Réduire la taille des morceaux coûte-t-il du rappel ?

La question restait ouverte. On savait depuis le 21/09 que **baisser `topK`**
coûte du rappel — six fragments au lieu de huit avaient fait perdre une
information factuelle. On n'avait jamais éprouvé l'autre hypothèse : garder
huit fragments **plus courts**.

La comparaison B contre C l'isole, à modèle constant.

| Question | 1000 car. | 500 car. | |
|---|---|---|---|
| Q7 — horaires | conforme | **ÉCART** | perdu |
| Q10 — visite du Datacenter | conforme | ÉCART | *artefact de contrôle* |
| Q11 — portes ouvertes | conforme | **ÉCART** | perdu |
| Q18 — hors sujet | ÉCART | conforme | gagné |

**Q7 tranche la question.** Avec des morceaux de 500 caractères, Isaac répond :

> « Nos horaires d'ouverture sont de **08h00 à 18h00**, du lundi au vendredi. »

Les horaires validés sont **8h-17h**. C'est la même invention que le jour où le
magasin vectoriel était vide : le fragment portant l'horaire validé n'a pas été
retrouvé, et le modèle a comblé de sa propre mémoire. Sur la question la plus
posée de la borne.

Q11 se dégrade aussi : de « Aucune date de prochaine édition n'est confirmée »
à « Je n'ai pas cette information à jour ».

Q10, en revanche, est un **artefact du contrôle** et non une régression : la
réponse « Désolé, mais les visites du Datacenter sont encadrées… accompagnement
par du personnel habilité » est un refus correct, que le motif n'a pas reconnu
faute d'un « non » explicite.

> **Réponse à l'hypothèse : oui, réduire la taille des morceaux coûte du
> rappel.** Le raisonnement selon lequel « huit fragments de 500 couvrent
> autant de sujets que huit de 1000, pour moitié moins de jetons » est faux en
> pratique : un fait tient dans son contexte, et couper le contexte le rend
> introuvable. Ce levier semblait le meilleur gain logiciel disponible ; il
> produit une information fausse sur les horaires.

### Tableau comparatif

| | A — 7B/1000 | B — 3B/1000 | C — 3B/500 | D — 7B/500 |
|---|---|---|---|---|
| Contrôle automatique | 19/20 | 17/20 | 15/20 | *en cours* |
| **Après relecture** | **18/20** | **15/20** | à relire | |
| Temps moyen | 105,1 s | 48,3 s | **28,8 s** | |
| Gain de vitesse | référence | −54 % | −73 % | |
| Défaut caractéristique | invente un fait | perd des règles | **horaires faux** | |

---

## 9. Artefacts de mesure rencontrés

Cette section existe parce que deux de mes propres mesures étaient fausses, et
que les chiffres faux étaient plus flatteurs que les vrais.

### Le cache de préfixe fausse toute comparaison de modèles

Première version de la mesure du §4 : trois questions différentes, mais les
**mêmes huit fragments** de contexte. Résultat apparent : 167 s, puis 2,2 s,
puis 3,0 s — soit une « moyenne » de 64,8 s.

Ce n'était pas le modèle qui s'échauffait. Le préfixe de 3 200 jetons était
identique d'une question à l'autre, donc conservé ; seule la question finale
était recalculée. En production, les fragments changent à chaque question et ce
cache n'intervient pas.

**Seuls les premiers passages à froid sont valides.** Une moyenne calculée sur
des passages mis en cache annonce une performance qui n'existera jamais devant
un visiteur.

### Une mesure du nombre de fragments qui ne mesurait rien

Dans la même série, la variante « 8 fragments » affichait 0,1 seconde de lecture
pour 3 221 jetons. Ce n'est pas une performance, c'est du cache : le prompt était
identique à celui de l'essai précédent.

Le temps trop court est le signal. **Une mesure anormalement bonne doit être
suspectée avant d'être publiée** — c'est la même règle qui avait permis de
détecter, le 27/09, que Whisper répondait en dix millisecondes parce qu'il ne
décodait rien.

---

### Une sonde qui vérifiait la connexion et non le service

Le premier passage B a rendu **0/20, en un dixième de seconde par question**.
Les vingt réponses étaient des pages d'erreur HTML : `Cannot POST /webhook/isaac`.

La cause n'était pas le modèle mais la boucle d'attente du banc :

```
until curl -s -o /dev/null -X POST .../webhook/isaac; do sleep 4; done
```

**`curl` rend le code 0 dès que la connexion aboutit**, y compris sur un 404.
La boucle sortait donc à la seconde où n8n ouvrait son port, avant qu'il ait
enregistré ses webhooks. Les vingt questions sont parties dans le vide.

Le signal était le même que les deux précédents : **vingt questions traitées en
0,1 seconde** sur une machine qui met cent secondes par question.

La sonde corrigée interroge le webhook en GET et attend la formulation propre à
un webhook enregistré (« Did you mean to make a POST request? »), qui se
distingue de celle d'un chemin inexistant (« is not registered »). C'est
instantané et cela n'engage aucune inférence — sonder en POST déclencherait une
vraie question à cent secondes à chaque tour de boucle.

> **Trois artefacts dans une seule journée de mesure, et les trois donnaient un
> résultat plus flatteur que la réalité.** Un banc de mesure est du code comme
> le reste : il se vérifie, et de préférence par le temps qu'il met.

---

## 10. Leviers, par gain mesuré

| Levier | Gain | Coût en exactitude | État |
|---|---|---|---|
| Format quantifié | 0 | — | **déjà fait** |
| Alléger la chaîne audio | ~1 s | dégrade la reconnaissance | **à ne pas faire** |
| Raccourcir les réponses | ~7 s sur 109 | aucun | fait (mode vocal) |
| Modèle 3B | **−41 %** | à vérifier en recette | mesuré, non décidé |
| Morceaux de 500 caractères | −73 % avec le 3B | **perte de rappel : horaires faux** | **mesuré, rejeté** |
| Modèle 3B seul | −54 % | perd des règles de posture | mesuré, à arbitrer |
| Baisser `topK` de 8 à 6 | −25 % environ | **perte de rappel constatée le 21/09** | rejeté |
| **Corriger le chemin rapide (`isSimple`)** | **41 % des questions réelles**, ~104 s chacune | aucun | **à faire, le plus rentable** |
| Réponses validées servies directement | 15 % des questions réelles, ~104 s chacune | **aucun, il améliore l'exactitude** | écrit, éprouvé, à déployer |
| Carte graphique | prefill de ~170 s à quelques secondes | aucun | non tranché |

### La seule chose qui règle le pire cas

Tous les leviers logiciels améliorent le **cas courant**. Une question réellement
nouvelle coûtera toujours 100 à 175 secondes sur ce processeur, parce que la
lecture plafonne à 18 jetons par seconde (42 avec le 3B) et qu'aucun réglage ne
fait lire 3 200 jetons en trois secondes à cette vitesse.

Le calcul de lecture d'un prompt est une multiplication de matrices dense — le
travail pour lequel les cartes graphiques existent. **C'est le seul changement
qui atteint l'objectif annoncé de « quelques secondes » sur une question
nouvelle.**

---

## 11. Décision recommandée

Par ordre, et en commençant par celui qui ne coûte rien en exactitude :

1. **Servir les faits validés depuis une table**, sans passer par le modèle.
   Horaires, adresse du bureau, adresse du Datacenter, téléphone, courriel :
   ce sont les questions les plus posées, ils portent la mention « validé par
   ST DIGITAL le 24/08/2026 », et ils ont une valeur unique. Une phrase fixe
   est exacte et instantanée. **Ne pas faire reformuler par le modèle** :
   reformuler un fait validé réintroduit le seul risque que ce projet a passé
   des semaines à éliminer, pour aucun gain.

2. **Découpe à 500 caractères**, si la recette confirme le rappel.

3. **Modèle 3B**, si la recette confirme la qualité.

4. **Carte graphique**, si l'objectif « quelques secondes » est maintenu pour
   les questions nouvelles.

### Un point à trancher avec la tutrice

Si une couche de réponses directes répond à douze des vingt questions de
référence, **la recette ne teste plus l'assistant documentaire** : elle teste la
couche de réponses directes.

Elle devra alors être jouée dans les deux sens, et le rapport devra indiquer
quelle question a été servie par quel chemin. Sans cela, on présenterait un
score qui ne mesure pas ce qu'il prétend mesurer.
