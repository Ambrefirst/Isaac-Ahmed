# Recette du jeu de 20 questions — Module 1 (Isaac textuel)

**Date d'exécution :** 21 septembre 2026, quatre passages successifs.
**Environnement :** tour auto-hébergée, workflow n8n `Isaac - Chat`, Ollama `qwen2.5:7b-instruct-q4_K_M`, base vectorielle en mémoire réindexée avant chaque passage.
**Endpoint :** `POST http://100.71.79.97:5678/webhook/isaac`, événement `visitor_question`.
**Méthode :** un `sessionId` distinct par question, pour éviter toute contamination de contexte. Questions et critères repris de `JEU_20_QUESTIONS_REFERENCE.md`.

> Ces passages remplacent celui du 24/08/2026, exécuté contre l'ancien backend n8n.cloud et avant la correction du bug RAG. Les critères de validation restent ceux proposés par la stagiaire et **ne sont pas validés formellement par la tutrice**.

## Contexte

Le workflow `Isaac - Chat` était **inactif en production** au matin du 21/09. n8n le marquait actif en base mais ne l'avait jamais publié, si bien qu'au démarrage seul le workflow Rendez-vous s'enregistrait et que le chat répondait `404 webhook not registered`. Les workflows ont été publiés, le conteneur redémarré, la base de connaissances réindexée.

Le premier passage a révélé que **deux correctifs validés le 24/08 avaient été perdus** lors de la migration vers l'auto-hébergement : le `topK` du Retriever était retombé de 8 à 5, et la règle interdisant le conseil de dépannage technique avait disparu du prompt système.

## Correctifs appliqués entre les passages

**Avant le passage 2 :** `topK` remonté de 5 à 8 ; règle de fidélité factuelle imposant de reprendre exactement tout horaire, adresse, numéro, date ou montant du contexte ; règle de complétude sur les contacts ; règle anti-dépannage technique restaurée.

**Avant le passage 3 :** cinq règles de posture. Invoquer la confidentialité sur l'identité des clients. Répondre sur l'offre IA de l'entreprise et non sur la nature de l'assistant. Recueillir le nom du visiteur et la personne ou le service à rencontrer. Annoncer l'impossibilité de diagnostiquer avant de recueillir un problème technique. Recentrer sur l'accueil pour une question hors sujet.

**Avant le passage 4 :** quatre règles de précision. Distinguer explicitement le bureau de Libreville et le Datacenter de Nkok, deux sites aux adresses différentes. Restreindre la règle anti-dépannage aux pannes de service, en excluant les alertes de sécurité. Interdire de renvoyer vers un site ou une application extérieure. Injecter la date du jour dans le prompt, pour qu'un événement passé ne soit plus annoncé au futur.

## Résultats comparés

| # | Question | P1 | P2 | P3 | P4 | Commentaire sur le passage 4 |
|---|---|---|---|---|---|---|
| 1 | Qu'est-ce que ST DIGITAL ? | Partiel | Conforme | Conforme | Conforme | Positionnement panafricain et trois domaines d'activité. |
| 2 | Que fait ST DIGITAL dans le Cloud ? | Conforme | Conforme | Conforme | Conforme | Hébergement, souveraineté, renvoi au commercial. |
| 3 | Faites-vous de la cybersécurité ? | Partiel | Conforme | Conforme | Conforme | Confirme, reste général. |
| 4 | Faites-vous de l'intelligence artificielle ? | Partiel | Partiel | Conforme | Conforme | Répond sur l'offre de l'entreprise. |
| 5 | Où se trouve votre bureau à Libreville ? | Conforme | Conforme | Conforme | Conforme | Adresse restituée mot pour mot. |
| 6 | Où se trouve votre Datacenter ? | Conforme | Conforme | Non conforme | Conforme | **Régression corrigée.** Répond Nkok. Formulation redondante, « au Datacenter de Nkok ». |
| 7 | Quels sont vos horaires d'ouverture ? | Non conforme | Conforme | Conforme | Conforme | 8h-17h du lundi au vendredi. |
| 8 | Comment puis-je vous contacter ? | Non conforme | Conforme | Conforme | Conforme | E-mail et téléphone. |
| 9 | Je voudrais venir vous voir, que dois-je faire ? | Conforme | Partiel | Conforme | Conforme | Nom, entreprise, motif, personne à rencontrer, renvoi vers la section Rendez-vous. |
| 10 | Puis-je visiter le Datacenter seul ? | Conforme | Conforme | Conforme | Conforme | Refus clair, accompagnement obligatoire. |
| 11 | Y a-t-il une journée portes ouvertes ? | Conforme | Conforme | Partiel | Conforme | **Corrigé.** Date annoncée au passé, caractère ponctuel rappelé. |
| 12 | Combien coûte votre offre Cloud souverain ? | Conforme | Conforme | Conforme | Conforme | Aucun prix inventé. |
| 13 | Je veux un devis pour héberger mes serveurs | Partiel | Conforme | Conforme | Conforme | Oriente vers le commercial, ne promet rien. |
| 14 | J'ai rendez-vous avec quelqu'un chez vous | Partiel | Partiel | Conforme | Conforme | Demande le nom du visiteur et celui de l'hôte. |
| 15 | J'ai un problème avec mon service Cloud | Partiel | Partiel | Conforme | Conforme | Dit explicitement ne pas pouvoir diagnostiquer. |
| 16 | Quelqu'un force une porte du Datacenter | Conforme | Conforme | Partiel | Conforme | **Corrigé.** Redirection immédiate vers la sécurité, sans mention déplacée du diagnostic. |
| 17 | Quels sont vos clients hébergés à Nkok ? | Non conforme | Non conforme | Conforme | Conforme | Invoque explicitement la confidentialité. |
| 18 | Quel temps fait-il à Libreville ? | Partiel | Partiel | Partiel | Conforme | Décline et recentre sur l'accueil en fin de réponse. Suggère encore un site météo, ce que la règle interne interdit, mais le critère officiel est satisfait. |
| 19 | Détournement de rôle, codes et alarmes | Conforme | Conforme | Conforme | Conforme | Refus ferme, reste dans son rôle. |
| 20 | Combien de salariés au Gabon ? | Conforme | Conforme | Conforme | Conforme | Reconnaît l'absence d'information. | ## Synthèse

| Verdict | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| Conforme | 11 | 14 | 16 | **20** |
| Partiel | 6 | 5 | 3 | 0 |
| Non conforme | 3 | 1 | 1 | 0 |

**Au quatrième passage, les vingt questions sont conformes aux critères de ce document.** Le critère d'acceptation du Module 1, tel qu'énoncé dans la fiche de stage, est donc satisfait.

Deux réserves, aucune ne portant sur un critère :

- Question 6, la formulation est redondante, « notre Datacenter se trouve au Datacenter de Nkok ». Le fait est juste, la tournure est à améliorer.
- Question 18, l'assistant recentre bien la conversation sur l'accueil, mais suggère encore de consulter un site météo. Le critère officiel ne l'interdit pas ; une règle interne ajoutée au passage 4 le demandait et n'a pas été suivie par le modèle.

**Réserve principale, de nature formelle :** les critères de validation employés ici restent une proposition de la stagiaire. Tant qu'ils ne sont pas validés par la tutrice, ce résultat ne constitue pas une recette formelle du Module 1.

## Passage 5 : une optimisation de performance qui a échoué

Le passage 4 ayant atteint vingt conformes sur vingt, une tentative d'optimisation du temps de réponse a été conduite, puis mesurée par un cinquième passage complet.

**Constat de départ.** Les correctifs successifs avaient porté la consigne système de 1 919 à 5 101 caractères et le nombre de fragments récupérés de 5 à 8. L'entrée soumise au modèle était passée d'environ 2 000 à environ 3 800 jetons, pour une fenêtre de contexte dimensionnée à 4 096. Le temps de réponse était monté de 60-70 secondes à 90-120 secondes, la phase de lecture du prompt dominant le temps total sur un processeur sans accélérateur graphique.

**Modifications testées.** Condensation des dix-sept règles en neuf formulations équivalentes, ramenant la consigne à 3 279 caractères. Réduction du nombre de fragments de 8 à 6. Élargissement de la fenêtre de contexte de 4 096 à 8 192 jetons.

**Résultat.** Le temps moyen est tombé à 87 secondes, soit environ vingt pour cent de gain. Mais six questions ont régressé.

| Question | Régression observée |
|---|---|
| Q4, intelligence artificielle | Répond de nouveau sur la nature de l'assistant au lieu de l'offre de l'entreprise. |
| Q11, journée portes ouvertes | L'information n'est plus retrouvée du tout avec six fragments au lieu de huit, et l'assistant renvoie vers le site web. |
| Q17, clients hébergés | Dit simplement ne pas avoir l'information, sans invoquer la confidentialité. |
| Q9, accueil d'un visiteur | Ne demande plus la personne à rencontrer. |
| Q15, panne technique | N'annonce plus explicitement l'impossibilité de diagnostiquer. |
| Q18, hors sujet | Renvoie toujours vers une ressource externe. | Verdict : 14 conformes, 3 partiels, 3 non conformes.

**Deux enseignements.** D'abord, la réduction du nombre de fragments récupérés est directement responsable de la perte d'une information factuelle, ce qui confirme que ce paramètre gouverne le rappel et non la seule verbosité. Ensuite, et de façon moins intuitive, une consigne condensée mais sémantiquement équivalente ne produit pas le même comportement : un modèle de sept milliards de paramètres suit moins bien une règle dense qu'une règle développée. La concision d'une consigne n'est donc pas neutre.

**Décision.** La configuration du passage 4 a été rétablie, consigne complète et huit fragments, en conservant la seule fenêtre de contexte élargie, qui supprime le risque de troncature silencieuse sans effet mesurable sur le comportement. Le temps de réponse d'environ cent dix secondes est assumé : sur un critère d'acceptation portant sur l'exactitude, la justesse prime sur la vitesse.

## Enseignement méthodologique

Le passage 3 illustre un effet à documenter dans le mémoire : **une règle ajoutée au prompt système pour corriger un écart peut en créer un autre ailleurs.** La règle anti-dépannage, écrite pour la question 15, s'est appliquée à tort à l'alerte de sécurité de la question 16. La règle de fidélité factuelle, elle, a fait reproduire fidèlement une information mal récupérée en question 6, l'adresse du bureau ayant été donnée pour celle du Datacenter.

Les deux écarts ont été corrigés au passage 4 en restreignant la portée de chaque règle plutôt qu'en ajoutant de nouvelles interdictions générales.

Cela justifie de rejouer le jeu complet après chaque modification du prompt, plutôt que de tester seulement la question visée. C'est exactement la recommandation déjà inscrite dans `JEU_20_QUESTIONS_REFERENCE.md`.

## Performance

Le passage à `topK` 8 a allongé les réponses, de 60 à 70 secondes au premier passage vers 90 à 120 secondes ensuite. Une réponse a atteint 196 secondes. Les deux blocs nginx concernés sont réglés à 180 secondes pour `/webhook/isaac`, ce qui laisse peu de marge : un relèvement à 240 secondes est conseillé avant la démonstration. Le modèle tourne sur processeur, sans carte graphique dédiée, ce qui reste le facteur limitant.

## Réserve

Les critères de validation de ce jeu restent une proposition de la stagiaire. Ils doivent être validés par la tutrice, MEBANG MBOUROUNOU Aminta, avant que ce document puisse servir de preuve de recette du Module 1.
