# Analyse du temps de réponse de l'assistant

**Date :** 24 septembre 2026
**Objet :** localiser l'étape qui consomme le temps de réponse, la mesurer, et déterminer les leviers réels.

## Contexte

Le temps de réponse observé en production était d'environ cent dix secondes par question nouvelle. Cette durée rend impossible toute interaction vocale et dégrade l'expérience sur borne. L'hypothèse initiale, non vérifiée, attribuait ce temps à la génération du modèle.

Le matériel est une station de travail équipée d'un processeur Intel i5-6500 à quatre cœurs, sans accélérateur graphique, avec soixante-deux gigaoctets de mémoire. Le modèle est `qwen2.5:7b-instruct-q4_K_M`, servi par Ollama.

## Protocole

Trois mesures indépendantes, conduites directement sur la machine de production.

1. **Appel direct au modèle**, sans passer par la couche d'orchestration, en exploitant les champs de durée renvoyés par l'interface de programmation d'Ollama : `prompt_eval_duration` pour la lecture du prompt et `eval_duration` pour la génération. Ces valeurs séparent sans ambiguïté les deux phases.
2. **Comparaison du temps total du point d'entrée** avec le temps total du modèle, la différence donnant le coût de l'orchestration, de la recherche vectorielle et du réseau.
3. **Mesure isolée du calcul de l'embedding** de la question, répétée trois fois.

Une quatrième mesure a été ajoutée en cours d'analyse : faire varier le nombre de fragments documentaires transmis, toutes choses égales par ailleurs, pour vérifier la linéarité du coût.

## Résultats

### Répartition du temps sur une question nouvelle

| Étape | Durée | Part |
|---|---|---|
| Lecture du prompt | 117 s | 88 % |
| Génération de la réponse | 14 s | 11 % |
| Calcul de l'embedding de la question | 0,03 s | négligeable |
| Orchestration, recherche vectorielle, réseau | environ 3 s | 2 % |

**L'hypothèse initiale était fausse.** Ce n'est pas la génération qui coûte, c'est la lecture du prompt, c'est-à-dire la phase pendant laquelle le modèle ingère le contexte avant de produire le premier mot.

### Débits mesurés

| Grandeur | Valeur |
|---|---|
| Lecture du prompt | 18,4 jetons par seconde |
| Génération, contexte long | 4,1 jetons par seconde |
| Génération, contexte court | 8,2 jetons par seconde |

La vitesse de génération dépend de la longueur du contexte, ce qui est attendu : le coût de l'attention croît avec le nombre de jetons déjà présents.

### Effet du volume de contexte

Mesure conduite avec une consigne système identique et des fragments documentaires différents à chaque appel, afin de reproduire les conditions réelles.

| Fragments récupérés | Jetons du prompt | Lecture | Génération | Total |
|---|---|---|---|---|
| 8 de 1000 caractères | 3 517 | 116,7 s | 13,7 s | 130,4 s |
| 4 de 1000 caractères | 2 400 | 56,0 s | 11,3 s | 67,5 s |
| 2 de 1000 caractères | 1 847 | 26,0 s | 10,9 s | 36,9 s |

La relation est linéaire : mille jetons retirés du prompt font gagner environ cinquante-cinq secondes.

### Effet du cache de préfixe

| Situation | Temps total |
|---|---|
| Question nouvelle | 110,6 s |
| Même question immédiatement rejouée | 14,6 s |

Ollama conserve le calcul déjà effectué pour le début du prompt lorsque celui-ci est identique. La consigne système, placée en tête et invariante, est donc lue une seule fois puis réutilisée : **elle ne coûte rien en régime établi.**

Ce résultat valide a posteriori la décision du 21 septembre de refuser de condenser les règles de comportement. Cette condensation avait fait perdre six questions sur vingt lors de la recette, pour un gain de temps qui, on le sait maintenant, n'existait pas.

## Conclusion et décision

Le coût par question est entièrement imputable aux fragments documentaires, qui changent à chaque question et doivent donc être relus intégralement.

La réduction du nombre de fragments ferait gagner du temps mais dégraderait le rappel : la recette du 21 septembre a montré qu'en passant de huit à six fragments, l'information sur la journée portes ouvertes n'était plus retrouvée du tout.

**Décision retenue : réduire la taille des fragments plutôt que leur nombre.** Le découpage passe de mille à cinq cents caractères, avec un recouvrement ramené de deux cents à cent. Huit points d'ancrage sont conservés dans la base, donc le même rappel, pour un volume de prompt divisé par deux.

**Gain de vitesse, mesuré :** moyenne de 64 s sur les vingt questions, contre environ 110 s auparavant. Le gain est conforme à la prévision.

**Mais l'essai a été abandonné.** Conformément à la règle établie lors des passages précédents, le jeu complet des vingt questions a été rejoué. Deux questions ont régressé.

| Question | Comportement avec des fragments de 500 caractères |
|---|---|
| Horaires d'ouverture | Répond « 8h00 à 18h00 » alors que la base validée indique 8h00 à 17h00. Fait validé déformé. |
| Journée portes ouvertes | L'information n'est plus retrouvée du tout. |

Le raisonnement qui a conduit à cet essai était faux sur un point. Conserver huit fragments ne conserve pas le rappel si chaque fragment est deux fois plus court : le volume total de base consulté est divisé par deux, et la probabilité qu'un fait tienne entièrement dans un fragment diminue. Le découpage a donc été ramené à mille caractères avec un recouvrement de deux cents, et la réponse sur les horaires est redevenue exacte.

**Le compromis est donc mesuré et documenté :** sur ce matériel, la vitesse s'achète en exactitude. Un critère d'acceptation portant sur l'exactitude, la vitesse cède.

## Leviers restants, par ordre d'efficacité

| Levier | Gain attendu | Coût |
|---|---|---|
| Carte graphique dédiée | Facteur dix à trente sur la lecture du prompt, qui est massivement parallélisable | Achat matériel |
| Cache applicatif des questions fréquentes | Réponse quasi immédiate sur les questions déjà posées, mesurée à 14,6 s | Développement léger |
| Reclassement des fragments récupérés | Récupérer large puis ne transmettre que les meilleurs | Développement moyen |
| Modèle plus petit pour le parcours vocal uniquement | Proportionnel à la taille du modèle | Perte de qualité à évaluer |

**Deux leviers ont été écartés après mesure.** La réduction de la taille des fragments, qui coûte deux questions sur vingt, comme montré ci-dessus. Et la diffusion de la réponse au fil de l'eau : Elle ne supprime que la phase de génération, soit onze pour cent du temps, puisque le premier mot ne peut sortir qu'une fois le prompt entièrement lu. Elle reste utile pour le confort, mais ne résout pas le problème.

## Portée pour la suite du projet

Le module vocal suppose qu'une réponse commence en quelques secondes. Avec les fragments de cinq cents caractères et un cache des questions courantes, une question déjà connue se traite en une quinzaine de secondes et une question nouvelle en une soixantaine. C'est tenable avec un accusé de réception parlé immédiat, mais une conversation orale réellement fluide suppose l'acquisition d'une ressource de calcul dédiée.
