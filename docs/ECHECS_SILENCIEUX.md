# Catalogue des échecs silencieux

**Dernière mise à jour : 27/09/2026.**

Un échec silencieux est une panne qui ne produit **aucune erreur**. Le système répond, le code de retour est bon, l'interface ne clignote pas — et le résultat est faux. C'est la catégorie de défaut la plus coûteuse d'un projet comme celui-ci, parce que rien ne la signale : elle se découvre par hasard, ou par une vérification qu'on avait décidé de faire.

Ce document recense tous ceux rencontrés sur Isaac Ahmed, avec pour chacun : comment il se manifestait, pourquoi rien ne l'annonçait, comment il a été trouvé, et ce qui l'empêche aujourd'hui.

Il n'est pas écrit pour la forme. Plusieurs de ces défauts ont coûté des heures, et deux d'entre eux se sont produits **deux fois**, faute d'avoir été consignés la première.

---

## 1. Le magasin vectoriel vidé à chaque redémarrage

**Ce qui se passait.** La base de connaissances était indexée dans un magasin vectoriel **en mémoire**. Tout redémarrage du conteneur n8n la vidait. Isaac continuait de répondre, avec aplomb, mais **sans contexte** : il inventait.

**Pourquoi rien ne le signalait.** Le chat renvoyait `200`. La réponse était bien formée, en français correct, plausible. Rien dans le journal n'indiquait que le magasin était vide.

**Comment il a été trouvé.** Par une question de contrôle dont la réponse était connue. Le 27/09, à « Quels sont les horaires d'ouverture ? », Isaac a répondu « de 8h00 à 18h00, samedi de 8h00 à 12h00 » alors que la base validée indique **8h-17h, fermé le week-end**.

**Il s'est produit deux fois**, le 21/09 puis le 27/09, parce que tout déploiement de workflow impose un redémarrage.

**Ce qui l'empêche.** Le magasin est passé sur **PostgreSQL avec pgvector**, conteneur `isaac-pgvector`. Vérifié par un redémarrage sans réindexation : les 60 fragments survivent et les réponses restent justes.

> **Règle qui en découle.** Après toute intervention comportant un redémarrage, poser une question dont on connaît la réponse. C'est la seule façon de détecter ce type de panne.

---

## 2. Des workflows actifs mais jamais publiés

**Ce qui se passait.** Les workflows n8n apparaissaient `active: true`, mais ne s'exécutaient pas. Les webhooks répondaient `404`.

**Pourquoi rien ne le signalait.** Le drapeau d'activation et la publication sont deux choses distinctes dans cette version de n8n. L'interface montrait un workflow actif ; la ligne du journal disait `Processed 0 published workflows`, noyée dans le reste.

**Ce qui l'empêche.** Toute procédure de déploiement enchaîne désormais `import:workflow`, puis `update:workflow --active=true`, puis `publish:workflow`, puis le redémarrage, puis la **vérification dans le journal** que la ligne `Activated workflow` apparaît.

> **Piège dans le piège.** `import:workflow` **désactive** le workflow importé, en l'annonçant discrètement par `Deactivating workflow`. Réactiver après chaque import n'est pas une précaution, c'est une obligation.

---

## 3. Le journal des conversations écrit là où personne ne lit

**Ce qui se passait.** Le back-office lit les conversations dans PostgreSQL. Le workflow de chat les écrivait dans `/home/node/.n8n-appdata/conversations.json`, à l'intérieur du conteneur — vestige de l'architecture d'avant la migration.

**Pourquoi rien ne le signalait.** Les deux opérations réussissaient. L'écriture réussissait dans le fichier, la lecture réussissait en base. Simplement, ce n'était pas le même endroit.

**Ce que cela a coûté.** La ligne PostgreSQL était figée au **08/09**, avec 63 échanges. Le fichier en contenait **255**. Toute la recette des 20 questions du 21/09 et la journée de mesure du 24/09 étaient invisibles. Les compteurs d'usage du tableau de bord affichaient donc des **valeurs fausses**, et non un creux d'activité.

**Comment il a été trouvé.** En regardant la date de dernière modification des lignes de `app_data`. Une ligne figée depuis trois semaines dans un système utilisé quotidiennement ne s'explique pas.

**Ce qui l'empêche.** Le nœud écrit en base, par ajout atomique. Les 255 conversations ont été rapatriées, sauvegarde conservée.

---

## 4. Les fichiers JSON vestiges

**Ce qui se passait.** Les fichiers `/home/aminta/isaac-app-data/*.json` ne sont plus lus par personne depuis la migration vers PostgreSQL. Modifier `admin_accounts.json` n'a **aucun effet**, et ne produit **aucune erreur**.

**Pourquoi c'est vicieux.** On croit avoir changé un mot de passe. L'édition réussit, le fichier est bien modifié. Et l'ancien mot de passe continue de fonctionner.

**Ce qui l'empêche.** C'est écrit dans `A_FAIRE_AVANT_MISE_EN_PRODUCTION.md` et dans `CONTRAT_ROUTEUR_RENDEZ_VOUS.md`. Ces fichiers devraient être archivés ou supprimés.

---

## 5. Whisper répond 200 avec un texte vide

**Ce qui se passait.** Les enregistrements `.m4a` produits par l'Enregistreur vocal de Windows étaient refusés par le service de transcription. Réponse : `HTTP 200`, `{"text": ""}`, **en dix millisecondes**.

**Pourquoi rien ne le signalait.** Le code de retour est celui du succès. Le corps est du JSON valide. Un client naïf conclut « le visiteur n'a rien dit ».

**Comment il a été trouvé.** Neuf fichiers sur dix revenant vides **en 0,0 seconde**. Une transcription instantanée de cinq secondes de parole est impossible : c'est le temps qui a trahi, pas le contenu.

**Ce qui l'empêche.** L'audio est **converti en WAV 16 kHz mono** avant d'être transmis. Le même fichier, converti, se transcrit parfaitement en 1,7 s. Cette conversion doit figurer dans la chaîne de la borne, et pas seulement dans les essais.

> **À surveiller dans le code à venir.** Un texte vide doit être traité comme une **erreur**, pas comme un silence du visiteur. Les deux cas ne se ressemblent que pour la machine.

---

## 6. Un paramètre passé au mauvais endroit, ignoré sans bruit

**Ce qui se passait.** L'amorce de vocabulaire de Whisper était envoyée en **champ de formulaire** alors qu'elle s'attend en **paramètre d'URL**. Elle était purement ignorée.

**Pourquoi rien ne le signalait.** Le service acceptait la requête et la traitait normalement, sans l'amorce.

**Comment il a été trouvé.** Les deux passages, avec et sans amorce, rendaient un texte **rigoureusement identique**, caractère pour caractère. Un réglage sans le moindre effet mesurable n'est pas un réglage sans effet : c'est un réglage qui n'est pas appliqué.

**Ce que cela masquait.** Corrigée, l'amorce fait passer le taux d'erreur de **26,9 % à 15,4 %** sur de vrais enregistrements. On serait passé à côté.

---

## 7. nginx : la correspondance par préfixe

**Ce qui se passait.** Pour fermer la surface publique, le bloc `location /webhook/isaac-rdv` avait été supprimé. Sans effet : nginx applique une correspondance **par préfixe**, et la règle `location /webhook/isaac` capturait donc aussi `/webhook/isaac-rdv` et `/webhook/isaac-index-kb`, en les relayant correctement.

**Pourquoi rien ne le signalait.** La configuration était syntaxiquement valide, nginx rechargeait sans broncher, et la lecture du fichier donnait l'impression que la règle avait disparu.

**Comment il a été trouvé.** Par une **requête réelle**, pas par relecture de la configuration.

**Ce qui l'empêche.** `location = /webhook/isaac` en correspondance exacte, et `location /webhook/ { return 404; }` en filet. Vérifié par sondes HTTP après chaque changement.

---

## 8. Un message d'erreur qui masquait toutes les causes

**Ce qui se passait.** Le back-office affichait « Identifiants invalides. » pour **toute** erreur de connexion, y compris quand le serveur était injoignable.

**La vraie cause du jour** n'avait rien à voir avec un mot de passe : la page servie en HTTPS appelait le serveur en HTTP, et le navigateur bloquait la requête. Le message envoyait chercher du côté du mot de passe, c'est-à-dire exactement à l'opposé.

**Ce qui l'empêche.** Le bloc de capture distingue trois cas : refus du serveur, serveur injoignable, autre erreur — et affiche le message du serveur quand il y en a un.

> **Règle qui en découle.** Un message d'erreur qui recouvre plusieurs causes n'est pas un message d'erreur, c'est un obstacle au diagnostic.

---

## 9. Le mauvais gabarit de courriel, et une variable orpheline

**Ce qui se passait.** Une refonte des courriels avait visé le mauvais gabarit : le message de **refus** portait le texte de confirmation avec un code QR d'un code nul, et le message de **confirmation** gardait une référence à `qrUrl`, variable supprimée au même moment.

**Pourquoi c'était grave.** Confirmer un rendez-vous depuis le back-office levait une `ReferenceError`. La fonction principale du produit était cassée.

**Comment il a été trouvé.** En relisant le routeur déployé pour autre chose.

**Ce qui l'empêche.** Le banc d'essai vérifie désormais que la confirmation ne lève pas d'exception, que le courriel de refus porte le bon texte, et que le code et le QR sont bien dans la confirmation.

---

## 10. Une arrivée qui ressuscitait un rendez-vous annulé

**Ce qui se passait.** `visitor_arrival_confirmed` remettait le statut du rendez-vous à `confirme` à chaque passage. Un rendez-vous annulé redevenait donc valide dès que quelqu'un présentait le code.

**Pourquoi rien ne le signalait.** L'opération réussissait. Le registre se remplissait. Le statut changeait « dans le bon sens » du point de vue du code.

**Ce qui l'empêche.** L'arrivée se note sur la visite, jamais sur le rendez-vous. Le banc d'essai vérifie explicitement qu'un rendez-vous annulé reste annulé.

---

## 11. Des codes QR cohérents avec eux-mêmes et illisibles

**Ce qui se passait.** L'encodeur QR écrit pour le projet produisait des matrices qui se relisaient parfaitement avec le décodeur maison, et qu'**aucun lecteur standard** n'acceptait.

**Pourquoi rien ne le signalait.** Le test maison passait. C'est le pire cas : une vérification qui confirme sa propre erreur.

**Comment il a été trouvé.** En essayant avec un décodeur **indépendant**, puis en éprouvant toutes les combinaisons possibles de l'information de format. L'ordre des bits devait aller du poids fort au poids faible.

> **Règle qui en découle.** Un encodeur ne se teste pas avec son propre décodeur.

---

## 12. Une exception qui vidait tout le tableau de bord

**Ce qui se passait.** `renderUsers` lisait `DC_INFO[session.country].name` sans repli. Une session dont le pays ne correspondait à aucun site connu faisait échouer **tout** le tableau de bord.

**Pourquoi le diagnostic partait de travers.** L'utilisateur voyait « Échec de connexion », alors que la connexion avait réussi et que l'affichage avait déjà basculé.

**Ce qui l'empêche.** Un repli, et un message qui distingue les causes, voir le point 8.

---

## 13. Une fonction hors de portée, et un registre vide

**Ce qui se passait.** En ajoutant la colonne de sortie du registre, la fonction `heure()` était restée déclarée à l'intérieur de `renderVisits`, donc invisible de la nouvelle fonction qui en avait besoin.

**Comment il a été trouvé.** Par la vérification en navigateur, avant livraison. Le registre s'affichait vide, avec `heure is not defined`.

> **Ce que cela dit.** La vérification en navigateur n'est pas une formalité de fin de tâche. Elle a attrapé ce défaut, et un second le même jour.

---

## 14. Une mesure qui mesurait autre chose

Trois fois, une mesure a donné un chiffre faux **sans se tromper de calcul**.

**Le taux d'erreur qui comptait les accents.** 20,8 % annoncés, parce que « départ » correctement accentué était compté comme une faute contre ma référence écrite sans accent, et « à 10h » comptait pour trois erreurs contre « à dix heures ». La mesure ne portait pas sur la reconnaissance, mais sur ma façon d'écrire la référence.

**La prononciation prise pour de l'écoute.** La transcription était mesurée sur de la parole **synthétique**. « Nkok » revenait « une coque », « signaler » revenait « signer les mots ». En rejouant les mêmes phrases avec une autre voix de synthèse, ces erreurs disparaissaient : elles venaient de la synthèse, pas de la reconnaissance.

**Le streaming présenté comme le levier principal.** Avant la journée de mesure du 24/09, l'optimisation du temps de réponse visait le streaming. La mesure a montré que le **prefill représente 88 %** du temps : le streaming n'aurait retiré que les 11 % restants.

> **Règle qui en découle.** Avant de conclure d'une mesure, se demander ce qu'elle mesure vraiment. Un chiffre juste peut porter sur la mauvaise chose.

---

## 15. L'apostrophe courbe

**Ce qui se passait.** Un défaut signalé à l'écoute : « l'assistant » prononcé « L assistant », la lettre épelée.

**La cause réelle** était une commande d'essai où les apostrophes avaient été retirées pour contourner les guillemets du shell. Le service n'était pas en cause : sans apostrophe, la synthèse dure 4,2 s au lieu de 3,9 s, la différence étant tout juste le temps d'épeler la lettre.

**Mais le risque, lui, était réel.** Le modèle de langue produit volontiers l'apostrophe **courbe** `’` plutôt que la droite. Le défaut serait survenu pour de bon, sur du texte parfaitement correct.

**Ce qui l'empêche.** Toute la ponctuation typographique est ramenée à la ponctuation simple avant la synthèse.

> **Ce qui a été refusé.** Reconstituer une élision absente, du genre « l assistant » vers « l'assistant ». Cela reviendrait à réécrire du texte correct sur la foi d'une heuristique, pour un cas qui ne se produit pas en production.

---

## 16. Le modèle de reconnaissance n'est pas déterministe

**Ce qui se passait.** Le même fichier, le même réglage, deux appels : deux transcriptions différentes. « à dix heures » une fois, « à disir » la suivante.

**Pourquoi c'est important.** Cela interdit de conclure d'un essai sur une poignée de phrases. Les écarts mesurés entre variantes d'amorce se sont révélés **du même ordre que le bruit du modèle lui-même**.

**Ce qui en découle.** Tout réglage se juge sur l'ensemble des enregistrements, jamais sur les trois phrases qui posaient problème. Sur-ajuster sur quatre exemples aurait donné un réglage pire en moyenne.

---

## Ce que ces seize cas ont en commun

Un seul mécanisme les explique tous : **quelque part, une opération qui échoue renvoie le même signal qu'une opération qui réussit**. Un `200` sur un texte vide. Un fichier écrit que personne ne lit. Un paramètre ignoré. Un magasin vectoriel vide qui répond quand même.

Trois habitudes les attrapent, et elles sont plus efficaces que n'importe quel outillage :

1. **Vérifier par le canal réel**, pas par relecture. Une requête HTTP plutôt qu'une lecture de configuration. Un décodeur indépendant plutôt que le sien.
2. **Se méfier de ce qui est trop rapide, ou trop identique.** Dix millisecondes pour cinq secondes d'audio. Deux réglages qui rendent le même texte au caractère près. Une ligne de base figée depuis trois semaines.
3. **Poser une question dont on connaît la réponse**, après toute intervention. C'est ce qui a rattrapé Isaac en train d'inventer des horaires, deux fois.
