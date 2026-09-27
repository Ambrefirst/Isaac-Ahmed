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

Un mot de passe partagé par pays ne permet ni de savoir qui a confirmé un rendez-vous, ni de retirer l'accès à une personne qui quitte l'équipe. La section « Utilisateurs » du back-office le signale déjà honnêtement. À remplacer par des comptes nominatifs avant exploitation, avec limitation des tentatives de connexion.

## 4. Adresses e-mail réelles

Les constantes d'expédition et le fichier `hosts.json` pointent vers une boîte Gmail personnelle utilisée pour les tests, pas vers les adresses ST Digital. À basculer avant toute démonstration à un client, et avant exploitation.

## 5. Persistance de la base vectorielle — atténué le 27/09/2026, non résolu

La base de connaissances est indexée dans un magasin vectoriel **en mémoire**. Tout redémarrage du conteneur n8n la vide, et le chat se met alors à répondre sans contexte, donc à inventer, sans aucun message d'erreur.

> **Le défaut s'est produit une seconde fois le 27/09/2026**, à la suite des redémarrages nécessaires au déploiement des workflows. Isaac a répondu « ouvert de 8h00 à 18h00, samedi de 8h00 à 12h00 » alors que la base validée indique **8h-17h du lundi au vendredi, fermé le week-end**. Aucune erreur, aucun signe visible : seule une question de contrôle permettait de s'en apercevoir.

**Atténuation posée.** Le workflow `Isaac - Indexation base de connaissances` a reçu un déclencheur planifié, toutes les trente minutes. Le nœud d'insertion ayant `clearStore`, la réindexation est idempotente et ne crée pas de doublons. La durée maximale de la panne silencieuse passe ainsi de « jusqu'à ce que quelqu'un s'en aperçoive » à trente minutes.

**Ce n'est pas un correctif.** Une demi-heure de réponses inventées reste inacceptable en exploitation, et une réindexation concurrente d'une question laisse une fenêtre de quelques secondes sans contexte. Il faut un magasin vectoriel persistant. En attendant, **toute intervention comportant un `docker restart n8n` doit être suivie immédiatement** de :

```
curl -s -X POST http://127.0.0.1:5678/webhook/isaac-index-kb -H 'Content-Type: application/json' -d '{}'
```

puis d'une question de contrôle dont la réponse est connue, par exemple les horaires d'accueil.

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

**Reste ouvert.** Le code demeure réutilisable autant de fois qu'on le présente dans sa journée de validité. Un usage unique, ou un jeton renouvelé à chaque passage, reste à décider.

## 11. Registre des visites — posé le 27/09/2026

Les entrées et sorties sont désormais horodatées : `visitor_arrival_confirmed` ouvre la visite, `visitor_departure` la ferme et calcule sa durée, `admin_list_visits` la restitue au back-office. La borne propose un parcours « Signaler mon départ » qui reprend le même code.

Ce registre répond à une obligation de procédure sur les sites ST Digital, et à une question que le système ne savait pas traiter : **qui se trouve dans le bâtiment en ce moment**, ce qu'une évacuation exige de savoir immédiatement.

**Limite connue.** Rien n'oblige un visiteur à signaler son départ. Une visite jamais close reste indéfiniment ouverte et fausse le compteur des présents. Il faut prévoir une clôture automatique en fin de journée, ou une clôture manuelle depuis le back-office. Aucune des deux n'existe aujourd'hui.
