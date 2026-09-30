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

## 3. Comptes nominatifs — posés le 28/09/2026, transition à terminer

Un mot de passe partagé par pays ne permettait ni de savoir qui avait confirmé un rendez-vous, ni de retirer l'accès à une personne qui quitte l'équipe. Il était de surcroît **stocké en clair**.

**Ce qui est en place :**

- des **comptes nominatifs**, mot de passe haché par scrypt avec un sel propre à chaque compte, comparaison à temps constant ;
- une **session par jeton**, valable douze heures. Le back-office gardait jusqu'ici le mot de passe dans le navigateur et le renvoyait à chaque appel ; un jeton se révoque, un mot de passe recopié partout, non ;
- une **limitation des tentatives** : cinq échecs sur une adresse, et elle est bloquée un quart d'heure, avec un `429` qui distingue le blocage d'un mauvais identifiant ;
- deux rôles, `administrateur` qui gère les comptes et `accueil` qui traite les rendez-vous ;
- la **désactivation ferme les sessions ouvertes** : sans cela la personne garderait l'accès jusqu'à l'expiration de son jeton ;
- le **journal d'activité nomme désormais la personne**, et reste honnête quand il ne la connaît pas — il écrit alors le site, pas un nom inventé.

Une rubrique **Paramètres → Comptes** permet de créer, désactiver et réactiver les comptes du site.

> **Ce qui reste à faire, et c'est important.** Les comptes partagés sont encore acceptés, sans quoi la création du premier compte nominatif serait impossible et l'équipe se retrouverait dehors. Le drapeau `AUTORISER_COMPTES_PARTAGES` en tête du routeur les autorise. **Dès que chaque personne a son compte, le basculer à `false` et supprimer la ligne `admin_accounts`.** Tant que ce n'est pas fait, les trois mots de passe compromis du point 7 restent des clés valides.

**Vérifié** par vingt essais au banc et un cycle complet en production : création depuis le compte partagé, connexion nominative, jeton acceptant les appels suivants, action attribuée à la personne dans le journal, cinq échecs bloquant le compte, désactivation fermant la session ouverte.

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

## 6. Canal de notification officiel — reporté à la mise en service réelle

Les notifications passent aujourd'hui par un compte Gmail avec mot de passe d'application, choisi comme solution de contournement. Le canal cible reste Outlook et Teams via l'API Graph.

**Ce blocage n'est pas technique, et ne peut pas être levé depuis le projet.** Il tient à deux décisions qui appartiennent à l'administration Microsoft de ST Digital :

- l'absence d'**enregistrement d'application Azure AD**, sans lequel l'API Graph est inaccessible ;
- la **politique du locataire** qui désactive l'authentification SMTP, et ferme donc aussi la voie de repli.

**Décision prise le 28/09/2026 : traiter ce point au moment où l'application sera réellement exploitée par l'entreprise**, et non pendant le stage. Le contournement Gmail tient son rôle de démonstrateur, et le remplacer maintenant n'apporterait rien tant que les adresses d'expédition restent celles de test, voir le point 4.

> **Ce qu'il faut demander, et à qui.** Un enregistrement d'application Azure AD dans le locataire ST Digital, avec les autorisations `Mail.Send` et, si les notifications Teams sont retenues, `ChannelMessage.Send`. La demande doit être écrite et adressée à l'administrateur du locataire : c'est le genre de dépendance qui dure des mois faute d'avoir été posée noir sur blanc. Tant qu'elle n'est pas obtenue, aucune ligne de code ne peut avancer sur ce point.

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

## 12. Chaîne audio — installée le 27/09/2026, non raccordée

Whisper et Piper tournent sur la tour, conteneurs `isaac-whisper` et `isaac-piper`. Rien ne sort de l'infrastructure. Mesuré sur dix enregistrements réels : **12,8 % de taux d'erreur mot**, transcription en 1,8 s pour 4,5 s de parole, synthèse en 0,19 s.

**Raccordée le 27/09/2026, ouverte au public le 28/09/2026.** Deux routes nginx, `/audio/transcription` et `/audio/synthese`, servies sur les deux surfaces.

Elles avaient d'abord été fermées côté public, par prudence. C'était une erreur d'appréciation : le dialogue avec le modèle, qui coûte **une à deux minutes** de processeur, y est ouvert depuis toujours, quand une transcription en coûte **deux secondes**. Fermer l'audio ne protégeait donc rien, et rendait le microphone inutilisable pour qui ouvre la borne par le lien public — c'est-à-dire le cas courant.

**La protection est la limitation de débit**, pas la fermeture : 24 requêtes par minute et par adresse, rafale de 10, refus en `429` et non en `503` pour que « trop de requêtes » se distingue d'une panne. Le seuil a été calculé sur l'usage réel : un aperçu de dictée part toutes les trois secondes, soit vingt par minute en dictée continue. Une limite plus basse aurait coupé l'usage normal au lieu de l'abus.

Vérifié : quatorze aperçus consécutifs passent tous, une rafale de trente appels immédiats en voit dix-neuf refusés.

Dans la borne : un bouton micro et un bouton haut-parleur, volontairement **indépendants** — dicter sa question n'oblige pas à subir la réponse à voix haute.

Les quatre points ci-dessous ont tous été tenus au raccordement, et sont couverts par des essais :

- la conversion en **WAV 16 kHz mono se fait dans le navigateur**, avant l'envoi. Elle rend le format indépendant de ce que `MediaRecorder` décide de produire selon le navigateur, et garantit à Whisper le seul format dont on ait vérifié qu'il passe ;
- un **texte vide lève une erreur** et affiche « Je n'ai rien entendu », au lieu d'être pris pour un silence ;
- l'**amorce est passée en paramètre d'URL** ;
- un **dictionnaire de correction** rattrape « une coque » en « Nkok », en traitant l'élision : sans cela « datacenter d'une coque » devenait « datacenter d'Nkok », pire que l'erreur d'origine.

Le texte reconnu est **déposé dans le champ de saisie, pas envoyé directement** : avec un taux d'erreur mot de l'ordre de 12 %, envoyer sans montrer ferait poser à Isaac une question que le visiteur n'a pas posée.

**Reste à faire sur ce point.** Mesurer en environnement bruyant, et éprouver la chaîne sur la borne réelle avec son micro, et non au navigateur avec un micro simulé.

> **La configuration nginx n'est pas versionnée**, et ne doit pas l'être : elle donne la carte complète des services internes, leurs ports et les adresses du réseau privé, alors que le dépôt est public. Elle vit sur la tour, dans `isaac-app-conf/`, avec une copie de sauvegarde avant chaque modification. Les routes audio ajoutées le 27/09 sont décrites ci-dessus en toutes lettres, ce qui suffit à les reconstituer.

Quatre points doivent être tenus au moment du raccordement, chacun venant d'un défaut déjà constaté :

1. **Convertir l'audio en WAV 16 kHz mono avant transcription.** Sans cela le service répond `200` avec un texte vide, et un client naïf conclut que le visiteur n'a rien dit. C'est le point 5 de `ECHECS_SILENCIEUX.md`.
2. **Traiter un texte vide comme une erreur**, jamais comme un silence.
3. **Passer l'amorce de vocabulaire en paramètre d'URL**, pas en champ de formulaire — elle divise le taux d'erreur par deux, et passée au mauvais endroit elle est ignorée sans bruit.
4. **Poser un dictionnaire de correction après transcription.** « Nkok » est la seule erreur qui résiste au réglage, et c'est le nom du Datacenter du Gabon.

Reste également à mesurer en **environnement bruyant** : les dix enregistrements ont été faits au calme.

---

## 15. Annuaire du personnel — mécanisme posé le 30/09/2026, données à saisir

**Ce qui est fait.** Isaac lit la table du personnel et répond à « qui s'occupe
du commercial ? » par un nom et une fonction. C'est **la même table** que celle
alimentée par la rubrique Équipe du back-office, et celle que le parcours
Rendez-vous interroge pour prévenir les bonnes personnes. Une seule saisie sert
aux trois usages.

Elle est relue à chaque question plutôt que recopiée dans la fiche : un
changement fait dans le back-office prend effet immédiatement, sans
redéploiement.

**Décision du 30/09/2026.** La base interdit de communiquer « des informations
sur les employés ». Prise à la lettre, cette règle empêcherait Isaac d'orienter
un visiteur. Il a été décidé qu'**un nom et une fonction ne relèvent pas du
confidentiel**, et sont donc communicables.

La frontière reste celle-ci, et elle est appliquée dans le code : l'annuaire
dit **à qui** s'adresser, jamais **comment** joindre quelqu'un directement.
Aucune adresse électronique, aucun téléphone direct n'est rendu.

### Ajouter un service : les cinq endroits

Un service — commercial, technique, marketing… — se déclare à **cinq
endroits**. En oublier un produit une panne qui ne se voit qu'à l'usage.

| # | Où | Ce qui casse si on l'oublie |
|---|---|---|
| 1 | `ALLOWED_SERVICES` dans le nœud routeur n8n | Le serveur refuse : « Champs invalides » |
| 2 | `HOST_VALUES` dans `src/RendezVousScreen.js` | Le service n'est pas proposé comme hôte |
| 3 | Les clefs `rdv.host.*` de `src/i18n.js` | La borne affiche la clef brute |
| 4 | `HOST_LABELS` et la liste déroulante de `public/admin/index.html` | L'identifiant s'affiche au lieu du nom |
| 5 | La table `SERVICES` du nœud « Faits valides » | Isaac ne reconnaît pas la question |

*Constaté le 30/09 : marketing et administratif-financier avaient été ajoutés
aux quatre derniers mais pas au premier. Le formulaire proposait donc un choix
que le serveur refusait. Le refus était visible, ce qui est une chance — un
enregistrement silencieusement ignoré aurait été pire.*

**Ce qui reste à faire, et qui n'est pas technique.** La table contient
aujourd'hui quatre entrées d'essai — « Site Manager Gabon », « Sophie
Commercial » — avec des adresses Gmail de test. Il faut y saisir le véritable
organigramme depuis la rubrique Équipe. Cela réglera du même coup le point 4 de
cette liste, les adresses électroniques réelles.

---

## 16. Les adresses électroniques du système — bloquant, décision attendue

**Constat du 30/09/2026.** Deux constantes, déclarées à l'identique dans les
deux workflows n8n (`Isaac - Rendez-vous` et `Isaac - Visiteur (public)`),
portent encore une **adresse Gmail personnelle** :

| Constante | Rôle | Conséquence |
|---|---|---|
| `FROM` | expéditeur de **tous** les courriels | le visiteur reçoit sa confirmation de demande depuis une adresse personnelle, pas depuis ST DIGITAL |
| `ACCUEIL_EMAIL` | destinataire de l'accueil, et secours quand l'annuaire ne donne personne | la copie « Nouvelle demande de rendez-vous » et toute escalade arrivent dans une boîte personnelle |

Les envois **nominatifs** sont corrects : la confirmation au visiteur part vers
l'adresse qu'il a saisie, les sollicitations d'équipe vers les adresses de
l'annuaire. C'est l'en-tête et le secours qui n'ont jamais été mis à jour.

Recensement des points touchés :

- `appointment_requested` — copie accueil de la nouvelle demande (destinataire)
- `chat_escalate` — mise en relation avec l'équipe (destinataire)
- `visitor_arrival_confirmed` — secours si aucun *site manager* n'est inscrit
- `visits_autoclose` — secours, même raison
- `admin_update_status` — secours à la confirmation d'une visite
- **tous** les envois, sans exception, pour l'expéditeur

**Pourquoi ce n'est pas qu'un changement de chaîne.** Le canal SMTP est un
compte Gmail avec mot de passe d'application, choisi le 04/09 parce que
l'authentification SMTP est désactivée sur le tenant M365 (voir
`N8N_NOTIFICATION_CONTRACT.md`). Gmail refuse d'expédier au nom d'une adresse
qui n'est pas un alias vérifié du compte. Remplacer `FROM` par une adresse
`@st.digital` sans préparer l'alias ferait **échouer tous les envois** — et
l'envoi est en *best-effort*, donc l'échec serait silencieux.

Trois décisions à prendre, dans cet ordre :

1. **Destinataire d'accueil** (`ACCUEIL_EMAIL`) — sans contrainte technique,
   modifiable immédiatement. Quelle adresse ST DIGITAL reçoit les demandes
   arrivées à la borne ?
2. **Expéditeur** (`FROM`) — soit déclarer l'adresse ST DIGITAL comme alias
   vérifié du compte Gmail, soit obtenir l'activation SMTP côté M365 (demande
   ouverte depuis le 04/09), soit assumer l'adresse actuelle pour la
   soutenance et la documenter comme telle.
3. **Garde-fou** — refuser au démarrage une adresse qui n'est pas un domaine
   de l'entreprise, plutôt que de laisser une valeur de test survivre trois
   semaines sans que rien ne le signale.

---

## Lire aussi

`ECHECS_SILENCIEUX.md` recense les vingt-cinq pannes qui n'ont produit **aucune erreur** au cours du projet, avec pour chacune comment elle a été trouvée et ce qui l'empêche aujourd'hui. Trois d'entre elles se sont produites **deux fois**, faute d'avoir été consignées la première : c'est la raison d'être de ce document.

Le dix-huitième cas est le seul qu'aucun essai automatique n'aurait pu attraper : la reconnaissance vocale rend une phrase inventée aussi bien formée qu'une phrase entendue. Les filtres posés le 28/09 en écartent les formes connues et les transcriptions peu sûres ; ils n'écartent pas une phrase plausible mais fausse. C'est une limite de la chaîne, pas un défaut à corriger : elle est traitée en rendant la main au visiteur, qui peut interrompre et reprendre.

## 13. Ne pas décrire l'architecture dans l'interface — corrigé le 28/09/2026

Les messages d'attente de la conversation nommaient les rouages : « Isaac consulte la base de connaissances ST DIGITAL », et, pendant quelques heures, « Isaac répond directement, sans consulter la base ». La confirmation de rendez-vous annonçait de son côté que la demande avait été « transmise au workflow d'accueil ».

**Pourquoi cela compte.** Un visiteur n'a rien à faire de ces informations. Quelqu'un qui cherche une faille, si : savoir qu'il existe deux chemins de traitement, et surtout **lequel a été emprunté pour une entrée donnée**, permet de déterminer par essais successifs quelles formulations contournent la recherche documentaire. C'est le premier pas d'une injection de consigne, et l'interface le donnait gratuitement.

**Corrigé.** Le chemin rapide et la recherche documentaire affichent désormais **le même texte**, « Isaac prépare votre réponse » : de l'extérieur, les deux sont indistinguables. Les étapes détaillées décrivent une progression, plus un mécanisme. La confirmation de rendez-vous ne nomme plus l'orchestrateur.

Vérifié sur le bundle réellement servi par la tour : zéro occurrence de « base de connaissances », « knowledge base » et « workflow ».

> **Règle qui en découle.** Un message d'interface décrit ce que le visiteur attend, jamais comment le système s'y prend. Cela vaut pour les messages d'erreur autant que pour les messages d'attente : nommer le composant qui a échoué aide à le viser.

## 14. Latence de réponse — mesures du 28/09/2026

Le temps de réponse reste le seul obstacle qui empêche une fonction de marcher : la conversation parlée n'est pas tenable à ce rythme.

### Le modèle plus petit a été essayé, et rejeté

`qwen3.5:4b` avait été retenu comme candidat parce que plus petit donc réputé plus rapide. La mesure dit l'inverse.

| Modèle | Budget de jetons | Temps | Réponse rendue |
|---|---|---|---|
| `qwen3.5:4b` | 250 | 40,5 s | **vide** |
| `qwen3.5:4b` | 800 | 80,9 s | 152 caractères |
| `qwen2.5:7b` | 250 | **20,9 s** | 194 caractères |

**C'est un modèle à raisonnement.** Il produit un bloc de réflexion avant de répondre — 854 caractères de pensée pour zéro de réponse à 250 jetons, 1916 à 800. Le budget est consommé par la réflexion, et la réponse arrive vide ou tard. Le « petit » modèle est **quatre fois plus lent** que le grand sur cette machine.

> **Ce que cela apprend.** La taille d'un modèle ne dit rien de sa vitesse utile. Un modèle à raisonnement dépense son budget avant d'écrire un mot, et le comparer sur le seul nombre de paramètres conduit à la conclusion inverse de la bonne.

### Les réponses brèves à l'oral

Le mode vocal demande désormais deux phrases au maximum, pas de liste, pas d'adresse écrite. Mesuré sur la même question :

| | Temps | Longueur |
|---|---|---|
| Écrit | 185 s | 289 caractères |
| **Vocal** | **123 s** | 235 caractères |

Un tiers de gagné, et surtout une réponse **écoutable** : à la cadence de Piper, 250 jetons font quarante secondes de parole, que personne n'écoute debout devant une borne.

### Ce qui reste, et c'est le vrai levier

**123 secondes restent inutilisables.** La génération ne pèse que sept secondes sur les cent-neuf mesurées : le coût dominant est la **lecture du contexte**, confirmant la mesure du 24/09.

Une observation du 28/09 mérite d'être creusée : sur trois questions consécutives, la lecture du contexte est passée de **176 secondes à 2,4 secondes** grâce au cache de préfixe. Quand le contexte se répète, elle est presque gratuite ; quand il change, elle est brutale.

Deux leviers, dans cet ordre :

1. **Réduire le nombre de fragments récupérés**, de huit à quatre. Le prefill est divisé par deux, et le contexte devient plus souvent identique d'une question à l'autre, donc plus souvent en cache. **Risque réel sur le rappel** : l'essai `chunkSize 500` du 24/09 avait fait échouer deux questions. À ne faire qu'en rejouant les vingt questions derrière, selon la règle posée ce jour-là.
2. **Un accélérateur graphique.** C'est la vraie réponse, et elle se chiffre. À porter en décision plutôt qu'à contourner indéfiniment.