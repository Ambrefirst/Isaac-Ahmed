# À faire avant la mise en production réelle

**Créé le 21/09/2026.** Ces points sont **acceptés tels quels pendant la phase de stage et de démonstration**, parce que l'application ne contient aujourd'hui que des données de test. Ils doivent être traités avant toute exploitation avec de vraies données de visiteurs ou de collaborateurs.

## 1. Refermer la surface publique — FAIT le 21/09/2026

La surface publique servait, en plus de ce qui est nécessaire aux liens envoyés à l'équipe, l'interface d'administration et le routeur portant les opérations d'administration. Le seul contrôle d'accès était un mot de passe partagé par pays.

**Correctif appliqué et vérifié le 21/09/2026.** Dans le bloc `server { listen 8444; }` :

- `location = /webhook/isaac` en correspondance exacte, au lieu d'une correspondance par préfixe ;
- `location /webhook/ { return 404; }` pour refuser tout webhook non déclaré explicitement ;
- `location /admin/ { return 404; }` ;
- suppression du relais vers le routeur d'administration.

Restent ouverts sur la surface publique : l'application visiteur, la conversation, la page de réponse d'équipe et son webhook. L'interface d'administration reste joignable sur le réseau privé.

> **Piège nginx à retenir.** Une première tentative s'était contentée de supprimer le bloc `location /webhook/isaac-rdv`. Elle a été inefficace : nginx applique une correspondance par préfixe, et la règle `location /webhook/isaac` capturait donc aussi `/webhook/isaac-rdv` et `/webhook/isaac-index-kb`, en les relayant correctement vers le serveur d'orchestration. Une vérification par requête réelle, et non par simple lecture de la configuration, est indispensable après ce type de changement.

## 2. Nettoyer les mots de passe de repli

Les comptes admin sont stockés dans **PostgreSQL**, conteneur `isaac-postgres`, base et utilisateur `isaac`, table `app_data`, ligne de clé `admin_accounts`, colonne `value` de type `jsonb`. Le routeur interroge cette table à chaque appel.

> **Piège vérifié le 21/09/2026.** Les fichiers `/home/aminta/isaac-app-data/*.json` sont des **vestiges de l'ancienne architecture et ne sont plus lus par personne** depuis la migration vers PostgreSQL. Modifier `admin_accounts.json` n'a aucun effet, et ne produit aucune erreur : on croit avoir changé le mot de passe alors qu'il est inchangé. Ces fichiers devraient être archivés ou supprimés pour éviter que quelqu'un ne perde du temps dessus.

Le nœud Code du workflow `Isaac - Rendez-vous` contient par ailleurs une constante `DEFAULT_ADMIN_ACCOUNTS` avec trois mots de passe en dur, utilisée quand la lecture de la base échoue ou que la ligne est absente. Une rotation faite en base laisse donc ces valeurs actives en cas de perte de la ligne.

À faire : vider `DEFAULT_ADMIN_ACCOUNTS` et faire échouer l'authentification si la base est injoignable, plutôt que de retomber sur des valeurs en dur.

## 3. Passer à de vrais comptes utilisateurs

Un mot de passe partagé par pays ne permet ni de savoir qui a confirmé un rendez-vous, ni de retirer l'accès à une personne qui quitte l'équipe. À remplacer par des comptes nominatifs avant exploitation, avec limitation des tentatives de connexion.

**Atténué le 27/09/2026 par un journal d'activité.** Le back-office ne gardait aucune trace de ce qu'on y faisait : ni les confirmations, ni les refus, ni les clôtures manuelles, ni les changements de mot de passe. Seuls les courriels partis laissaient une trace, indirecte et incomplète — un changement de mot de passe n'en envoie aucun.

Le routeur journalise désormais, dans la clé `audit` de `app_data` et par ajout atomique : connexion, connexion refusée avec l'identifiant saisi, changement de statut d'un rendez-vous avec son motif, clôture manuelle d'une visite, clôture de nuit, ajout et retrait d'un membre d'équipe, changement de mot de passe. Le mot de passe lui-même n'y figure évidemment pas, seulement le fait qu'il a changé et sa longueur. L'événement `admin_list_audit` restitue les 500 dernières entrées du site, plus celles des tâches automatiques, qui n'ont pas de site et concernent tout le monde.

**Ce que le journal ne peut pas dire tant que les comptes sont partagés.** Il indique le **site** d'où l'action a été prononcée, pas la personne. C'est écrit en clair dans la section. Le jour où les comptes seront nominatifs, il suffira d'enrichir la même entrée — la structure est prévue pour.

La connexion n'est journalisée que lorsque la borne de connexion pose le drapeau `journaliserConnexion` : l'événement `admin_list_appointments` sert aussi à chaque actualisation, et le journal se remplirait d'entrées sans intérêt.

> **Deux sections retirées le 27/09/2026.** « Data Centers » n'affichait que du texte figé recopié du site public, déjà présent dans la base de connaissances d'Isaac — deux sources pour le même fait, sans lien entre elles : le jour où une certification change, l'une des deux ment. Sa suppression enlève un doublon, pas une fonction. « Utilisateurs » n'affichait que le compte de la session en cours, c'est-à-dire ce que Paramètres → Session dit déjà ; la carte de compte a rejoint Paramètres → Compte et sécurité, et l'emplacement sert maintenant au journal. **Onze sections.**

## 4. Adresses e-mail réelles

Les constantes d'expédition et le fichier `hosts.json` pointent vers une boîte Gmail personnelle utilisée pour les tests, pas vers les adresses ST Digital. À basculer avant toute démonstration à un client, et avant exploitation.

## 5. Persistance de la base vectorielle — RÉSOLU le 27/09/2026

La base de connaissances était indexée dans un magasin vectoriel **en mémoire**. Tout redémarrage du conteneur n8n la vidait, et le chat se mettait alors à répondre sans contexte, donc à inventer, **sans aucun message d'erreur**.

> **Le défaut s'est produit deux fois**, le 21/09 puis le 27/09. La seconde fois, Isaac a répondu « ouvert de 8h00 à 18h00, samedi de 8h00 à 12h00 » alors que la base validée indique **8h-17h du lundi au vendredi, fermé le week-end**. Rien ne le signalait : seule une question de contrôle dont la réponse était connue permettait de s'en apercevoir.

**Résolu.** Le magasin vectoriel est désormais **PostgreSQL avec l'extension pgvector**, dans un conteneur dédié `isaac-pgvector` (image `pgvector/pgvector:pg16`, base `isaac_kb`, table `isaac_kb`, port 5434 sur la boucle locale). Les deux workflows concernés utilisent le nœud `vectorStorePGVector` avec l'identifiant n8n « Isaac - Magasin vectoriel ».

> **Pourquoi un second conteneur plutôt que l'extension dans `isaac-postgres`.** L'image officielle `postgres:16-alpine` ne porte pas l'extension. Basculer sur l'image pgvector aurait fait passer la base métier de musl à glibc, donc changer de bibliothèque de collation sous un répertoire de données existant, ce qui expose à une corruption des index textuels. La base de connaissances est petite et vit très bien à part : le risque ne valait pas l'économie d'un conteneur.

**Vérifié.** 60 fragments indexés, puis `docker restart n8n` **sans réindexation** : les 60 fragments sont toujours en base et Isaac répond correctement sur les horaires, l'adresse du Datacenter, et refuse d'inventer un tarif absent de la base.

Deux conséquences sur l'indexation :

- le nœud pgvector n'a pas d'équivalent de `clearStore`. Un nœud `Vider l index` a donc été ajouté avant l'insertion, faute de quoi chaque réindexation empilerait un exemplaire de plus de toute la base ;
- le déclencheur toutes les trente minutes, posé le matin même comme pis-aller, n'a plus de raison d'être. Il est ramené à **un passage quotidien à 3h00**, pour que l'index suive les modifications du fichier de la base de connaissances sans ouvrir de fenêtre de vidage en pleine journée.

Le secret d'accès à `isaac-pgvector` est conservé sur la tour dans `/home/aminta/isaac-pgvector.acces`, en droits 600.

## 6. Canal de notification officiel

Les notifications passent aujourd'hui par un compte Gmail avec mot de passe d'application, choisi comme solution de contournement. Le canal cible reste Outlook et Teams via l'API Graph, bloqué par l'absence d'enregistrement d'application Azure AD côté ST Digital, et par la politique du locataire Microsoft qui désactive aussi l'authentification SMTP.

## 7. Rotation des secrets exposés

Les trois mots de passe admin ont été joignables depuis internet entre le 07/09 et la date de fermeture de la surface publique. Ils doivent être considérés comme compromis et remplacés, de même que le mot de passe d'application Gmail si le compte reste utilisé.

## 8. Souveraineté des courriels — corrigé le 24/09/2026

Le code QR envoyé au visiteur avec son invitation était généré par un service tiers : l'adresse de l'image transmettait le code d'accès du Datacenter à `api.qrserver.com`. Une invitation confirmée suffisait donc à exposer un code d'accès valide à un prestataire extérieur, ce qui contredit frontalement le positionnement souverain du projet.

**Corrigé.** Un encodeur QR autonome est désormais embarqué dans le workflow, et le code est rendu en tableau HTML plutôt qu'en image. Aucune requête ne sort de l'infrastructure, et le code reste visible même lorsque le client de messagerie bloque les images.

Copie de référence de l'encodeur : `docs/code/qr_encoder.js`. Vérifié par un décodeur indépendant sur cinq codes de test.

Reste à traiter sur ce point : les adresses d'expédition et de réception des courriels pointent encore vers une boîte personnelle, voir le point 4.

## 9. Journal des conversations — corrigé le 27/09/2026

Le back-office lit les conversations dans PostgreSQL, mais le workflow de chat les écrivait encore dans `/home/node/.n8n-appdata/conversations.json`, à l'intérieur du conteneur n8n. C'est le même piège que celui décrit au point 2, cette fois dans l'autre sens : personne ne lisait ce que le chat écrivait.

**Conséquence mesurée.** La ligne PostgreSQL était figée au **08/09/2026**, avec 63 échanges. Le fichier en contenait **255**. Tout ce qui a été dit à Isaac depuis le 08/09 était invisible depuis le back-office, y compris l'intégralité de la recette des 20 questions du 21/09 et la journée de mesure du 24/09. Les compteurs d'usage du tableau de bord affichaient donc des valeurs fausses, et non un creux d'activité.

**Corrigé.** Les 255 conversations ont été fusionnées et rapatriées, sauvegarde préalable conservée sous la clé `conversations_avant_migration_26092026`. Le nœud `Log conversation` écrit désormais en base, par **ajout atomique** en SQL plutôt que par lecture-modification-écriture : deux visiteurs qui interrogent Isaac en même temps ne peuvent plus effacer l'échange l'un de l'autre, ce que la version précédente permettait. Le bornage à 3000 échanges se fait en base, sans rapatrier le tableau entier.

Reste à traiter : les conversations sont stockées comme **un seul tableau JSON** sous une clé unique. À 255 échanges c'est sans conséquence ; à plusieurs dizaines de milliers, toute lecture rapatriera l'ensemble. Une vraie table, une ligne par échange, s'impose avant exploitation. C'est aussi ce qui permettrait une recherche côté serveur, là où le back-office filtre aujourd'hui la liste déjà chargée.

## 10. Contrôles du code d'invitation — posés le 27/09/2026

Le code d'invitation n'était soumis à aucune vérification au-delà de son existence. Un code restait donc une clé d'entrée valable **indéfiniment**, et **quel que soit le statut** du rendez-vous : un rendez-vous confirmé puis annulé conservait un code fonctionnel, et un code émis pour le 30 septembre ouvrait encore la borne en janvier.

**Posé.** `invitation_lookup` et `visitor_arrival_confirmed` refusent maintenant, avec un motif distinct à chaque fois :

- un rendez-vous dont le statut n'est pas `confirme` : annulé, refusé, ou en attente ;
- un code présenté un autre jour que celui du rendez-vous, la date étant comparée dans le **fuseau du site visité** et non celui du serveur, qui tourne en UTC.

Corrigé au passage : `visitor_arrival_confirmed` remettait le rendez-vous à `confirme` à chaque arrivée, ce qui ressuscitait un rendez-vous annulé.

### Usage unique — posé le 27/09/2026

Le code demeurait réutilisable autant de fois qu'on le présentait dans sa journée de validité. Il suffisait donc de signaler sa sortie pour pouvoir rentrer à nouveau, ou de prêter son code à quelqu'un d'autre.

**Ce que « usage unique » veut dire ici.** Le code sert trois fois dans le parcours normal : à la lecture, à l'arrivée, puis au départ. Le faire mourir à la première présentation aurait cassé le départ, donc le registre. La règle posée est donc : **une seule visite par code**. Une fois qu'une visite a été ouverte avec un code, aucune autre ne peut l'être, même après le départ, même le jour même. Une visite close d'office épuise le code au même titre, sans quoi il aurait suffi d'attendre la clôture de nuit pour recommencer le lendemain.

La lecture du code reste permise et renseigne l'état : la borne en a besoin pour guider le visiteur. Elle affiche trois écrans distincts selon le cas — proposition de confirmer sa présence, rappel de l'arrivée déjà enregistrée avec un bouton pour enregistrer la sortie, ou refus explicite si le code est épuisé.

**Reste ouvert sur ce point.** Le formulaire de demande collecte une `endDate` pour les visites sur plusieurs jours, mais aucun contrôle ne s'en sert : le code n'est valable que le jour de `date`. Une visite de trois jours est donc impossible aujourd'hui, et l'usage unique ne change rien à cette limite puisque le contrôle de date la bloquait déjà. À traiter ensemble, quand le besoin sera confirmé.

## 11. Registre des visites — complété le 27/09/2026

Les entrées et sorties sont horodatées : `visitor_arrival_confirmed` ouvre la visite, `visitor_departure` la ferme et calcule sa durée, `admin_list_visits` la restitue au back-office. La borne propose un parcours « Signaler mon départ » qui reprend le même code.

Ce registre répond à une obligation de procédure sur les sites ST Digital, et à une question que le système ne savait pas traiter : **qui se trouve dans le bâtiment en ce moment**, ce qu'une évacuation exige de savoir immédiatement.

**La faille comblée.** Rien n'oblige un visiteur à signaler son départ, et une visite jamais close restait ouverte indéfiniment, faussant précisément ce compteur. Deux réponses ont été posées :

- `admin_close_visit` : clôture manuelle depuis le registre du back-office, avec confirmation, sur les seules lignes encore ouvertes ;
- `visits_autoclose` : clôture de nuit, déclenchée à 20h30 heure de Libreville par le workflow `Isaac - Cloture des visites`. Toute visite dont le jour d'entrée a déjà vu la fermeture du site est soldée à l'heure de fermeture, pas à l'heure courante. Les responsables de site reçoivent la liste des visites ainsi closes : une clôture d'office est un défaut de procédure, quelqu'un est entré sans jamais ressortir du registre.

> **Une première version de la règle épargnait les visites du jour même.** Elle laissait donc le compteur des présents faux toute la nuit, alors que la tâche tourne justement après la fermeture. Corrigée : la condition porte sur l'heure de fermeture du jour d'entrée, pas sur la date.

**Le principe qui gouverne les deux.** Une visite close sans que le départ ait été constaté **n'est pas un départ**. Les deux mécanismes posent `clotureConstatee: false` et un `clotureMotif`, et le registre affiche la mention « clôture d'office » ou « clôture manuelle » sur la ligne elle-même, en couleur d'alerte. La durée affichée n'est alors pas une durée observée, et le tableau le dit. Un registre qui ne distinguerait pas les deux cas ne vaudrait rien comme pièce de traçabilité.

L'événement `visits_autoclose` modifie le registre sans authentification d'administrateur : il est protégé par un secret partagé avec le seul workflow planifié, et refusé sans lui. Le point d'entrée `isaac-rdv` n'est de toute façon pas exposé sur la surface publique.

**Reste ouvert.** Un visiteur peut encore présenter son code plusieurs fois dans sa journée de validité, voir le point 10.
