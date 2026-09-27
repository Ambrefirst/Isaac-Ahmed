# Contrat du routeur « Rendez-vous » — état au 27/09/2026

Ce document décrit l'interface **telle qu'elle tourne**, et non telle qu'elle a été conçue. Il a été rédigé à partir du code du nœud `Router evenement` réellement déployé, et chaque règle qu'il énonce est couverte par le banc d'essai (61 vérifications) ou par un essai contre le routeur en production.

> **À ne pas confondre avec `N8N_APPOINTMENTS_CONTRACT_V2.md`**, qui est une note de conception antérieure. Elle décrit une intégration Outlook et un CRM léger qui n'ont pas été réalisés, et des événements (`appointment_reschedule_confirm`, `appointment_monitor`) qui n'existent pas dans le routeur. Elle garde sa valeur comme trace d'une étude ; elle ne décrit pas le système.

## Point d'entrée

Un webhook unique, `POST /webhook/isaac-rdv`, reçoit tous les appels. Le champ `event` du corps JSON désigne l'opération. La réponse est toujours un objet JSON, accompagné du code HTTP indiqué ci-dessous.

**Ce point d'entrée n'est pas exposé sur internet.** La configuration nginx du port public 8444 lui répond 404. Il n'est joignable que depuis le réseau privé Tailscale, ou depuis la tour elle-même.

## Stockage

Tout est dans **PostgreSQL**, conteneur `isaac-postgres`, base et utilisateur `isaac`, table `app_data`, une ligne par clé, colonne `value` de type `jsonb`.

| Clé | Contenu |
|---|---|
| `appointments` | Demandes de rendez-vous, avec leur statut et leur code de validation |
| `visits` | Registre des visites : entrées, sorties, clôtures |
| `audit` | Journal des actions d'administration |
| `conversations` | Échanges avec Isaac |
| `notifications` | Courriels envoyés, pour preuve |
| `staff` | Membres d'équipe par site et par service |
| `admin_accounts` | Comptes administrateurs par pays |
| `otp_codes` | Codes de vérification à usage unique |
| `sessions` | Jetons de consultation des rendez-vous |

> **Piège.** Les fichiers `/home/aminta/isaac-app-data/*.json` et `/home/node/.n8n-appdata/*.json` sont des vestiges de l'architecture antérieure. Plus rien ne les lit. Les modifier n'a aucun effet et ne produit aucune erreur : on croit avoir changé quelque chose alors que rien n'a bougé. Ce piège a coûté du temps deux fois, la seconde le 27/09 sur le journal des conversations.

## Statuts d'un rendez-vous

`en attente`, `en attente equipe`, `confirme`, `refuse`, `annule`.

Le **code de validation n'est émis qu'au passage en `confirme`**, et par un administrateur humain. Aucun chemin ne délivre un code sans cette validation : c'est une ligne rouge de conception, pas une commodité.

---

## Parcours du visiteur

### `appointment_requested` — dépôt d'une demande

**Entrée** : `{ event, request: { firstName, lastName, email, phone, company, host, purpose, dataCenter?, accessType?, date?, time?, termsAccepted: true } }`

Les sept premiers champs et `termsAccepted` sont obligatoires. À défaut : **400**, avec la liste des champs manquants.

**Effet** : crée le rendez-vous au statut `en attente equipe`, `validation_code` à `null`, et sollicite par courriel les membres du service demandé sur le site concerné. Chacun reçoit un lien personnel d'acceptation ou de refus.

**Réponse** : `{ accepted: true, id, status, message }`.

### `invitation_lookup` — lecture d'un code

**Entrée** : `{ event, code }`

| Situation | Code | Réponse |
|---|---|---|
| Code absent | **400** | `{ error: "Code manquant" }` |
| Code inconnu | **404** | `{ error: "Invitation introuvable" }` |
| Rendez-vous non `confirme` | **403** | `{ error, raison: "statut", status }` |
| Code présenté un autre jour | **403** | `{ error, raison: "date", dateAttendue }` |
| Recevable | **200** | voir ci-dessous |

La date est comparée dans le **fuseau du site visité**, jamais celui du serveur, qui tourne en UTC. Entre minuit et une heure, comparer à la date du serveur rejetterait un code parfaitement valable.

Réponse recevable :

```
{ visitor, company, host, date, time, purpose, status, code,
  dateNonVerifiee,          // le rendez-vous n'a pas de date : aucun controle possible
  visiteEnCours,            // { id, entryAt } si le visiteur est deja entre
  visiteTerminee }          // { id, entryAt, exitAt, clotureConstatee } si le code est epuise
```

La lecture reste permise même quand le code est épuisé : la borne en a besoin pour expliquer au visiteur pourquoi, plutôt que de lui proposer une confirmation qui sera refusée.

### `visitor_arrival_confirmed` — signalement de présence

**Entrée** : `{ event, visit: { code?, visitor?, company?, host?, purpose?, dataCenter? } }`

Sans `code`, l'appel reste accepté : c'est le parcours du visiteur sans rendez-vous, qui se signale à l'accueil. La visite est alors enregistrée sans code, et le responsable de site est prévenu.

| Situation | Code | Effet |
|---|---|---|
| Rendez-vous non `confirme` | **403** | rien n'est écrit |
| Code d'un autre jour | **403** | rien n'est écrit |
| Code déjà épuisé | **409** | `raison: "code_epuise"`, rien n'est écrit |
| Visite déjà ouverte | **200** | `dejaPresent: true`, **aucun second courriel** |
| Recevable | **200** | visite ouverte, hôtes prévenus |

**Usage unique.** Un code n'ouvre qu'une visite, une seule fois. Il ne meurt pas à la première présentation — il sert encore au départ — mais aucune seconde visite ne peut être ouverte avec lui, même après la sortie, même le jour même. Une visite close d'office épuise le code au même titre.

Les hôtes prévenus sont les membres d'équipe **qui se sont déclarés disponibles** pour ce rendez-vous. À défaut, le responsable de site.

> Le statut du rendez-vous n'est **pas** modifié par l'arrivée. Une version antérieure le remettait à `confirme` à chaque passage, ce qui ressuscitait un rendez-vous annulé. L'arrivée se note sur la visite, pas sur le rendez-vous.

### `visitor_departure` — signalement de sortie

**Entrée** : `{ event, code }`

| Situation | Code |
|---|---|
| Code absent | **400** |
| Aucune visite ouverte pour ce code | **404** |
| Recevable | **200** — `{ accepted, visitId, entryAt, exitAt, durationMinutes, message }` |

### Consultation de ses rendez-vous

`appointments_otp_request` envoie un code à six chiffres, valable cinq minutes, à l'adresse indiquée. `appointments_otp_verify` l'échange contre un jeton de session et la liste des rendez-vous. `appointments_lookup` relit la liste avec ce jeton. `appointment_cancelled` annule un rendez-vous, jeton à l'appui.

---

## Administration

Tous ces événements exigent `adminCountry` et `adminPassword` dans le corps. Sans eux, ou avec un mot de passe faux : **401**, `{ error: "Identifiants invalides" }`.

Chaque administrateur ne voit que **son** site : tout est filtré sur le datacenter associé à son compte.

| Événement | Rôle |
|---|---|
| `admin_list_appointments` | Liste des demandes du site. Sert aussi à la connexion. |
| `admin_update_status` | Change le statut. Émet le code de validation au passage en `confirme`. |
| `admin_list_visits` | Registre des visites, plus le nombre de personnes présentes. |
| `admin_close_visit` | Clôture manuelle d'une visite restée ouverte. |
| `admin_list_audit` | Journal d'activité, 500 dernières entrées. |
| `admin_list_conversations` | Échanges avec Isaac, 200 plus récents. |
| `admin_list_notifications` | Courriels envoyés au personnel. |
| `admin_get_kb` | Base de connaissances, en lecture seule. |
| `admin_list_staff`, `admin_add_staff`, `admin_remove_staff` | Équipe du site. |
| `admin_change_password` | Nouveau mot de passe, huit caractères minimum. |

### `admin_list_appointments` et la connexion

Cet événement sert à la fois à la connexion et à chaque actualisation. Seule la borne de connexion pose `journaliserConnexion: true` et `adminEmail`, sans quoi le journal se remplirait d'actualisations sans intérêt.

Un **échec** de connexion est journalisé lui aussi, avec l'identifiant saisi : c'est le seul signal qui permettrait de repérer une tentative de forçage.

### `admin_close_visit`

**Entrée** : `{ event, visitId, adminCountry, adminPassword }`

| Situation | Code |
|---|---|
| Visite inconnue, ou d'un autre site | **404** |
| Visite déjà close | **409** |
| Recevable | **200** |

La visite reçoit `clotureConstatee: false`, `clotureMotif: "manuelle"` et le site qui l'a prononcée. **Une visite close sans que le départ ait été constaté n'est pas un départ** : le registre l'affiche comme telle, et la durée portée n'est pas une durée observée.

---

## Tâches automatiques

### `visits_autoclose` — clôture de nuit

Déclenchée à **20h30 heure de Libreville** par le workflow `Isaac - Cloture des visites`. Cet événement modifie le registre sans authentification d'administrateur : il est protégé par un **secret partagé** avec ce seul workflow, et refusé sans lui (**401**).

Toute visite ouverte **dont le jour d'entrée a déjà vu la fermeture du site** est soldée à l'heure de fermeture, pas à l'heure courante. Les responsables de site reçoivent la liste : une clôture d'office est un défaut de procédure, quelqu'un est entré sans jamais ressortir du registre.

### Réindexation de la base de connaissances

Workflow `Isaac - Indexation base de connaissances`, déclenchable par `POST /webhook/isaac-index-kb` et programmé chaque nuit à 3h00. Il vide la table vectorielle puis la reconstruit ; le nœud pgvector n'ayant pas d'équivalent de `clearStore`, sans ce vidage chaque passage empilerait un exemplaire de plus de toute la base.

---

## Journal d'activité

Entrées écrites par **ajout atomique** en SQL, bornées à 3000, le découpage se faisant en base sans rapatrier le tableau.

```
{ id, timestamp, site, pays, action, cible, detail }
```

Actions tracées : `connexion`, `connexion_refusee`, `mot_de_passe_change`, `rendez_vous_confirme`, `rendez_vous_refuse`, `rendez_vous_annule`, `rendez_vous_en_attente`, `rendez_vous_en_attente_equipe`, `visite_close_manuellement`, `visites_closes_d_office`, `membre_ajoute`, `membre_retire`.

Le mot de passe n'y figure jamais, seulement le fait qu'il a changé et sa longueur.

**Tant que les comptes sont partagés par site, le journal dit le site, pas la personne.** Les entrées sans site sont celles des tâches automatiques : elles concernent tous les sites et restent visibles partout.

---

## Ce que ce contrat ne couvre pas

- **`endDate`** est collectée par le formulaire pour les visites sur plusieurs jours, mais **aucun contrôle ne s'en sert**. Le code n'est valable que le jour de `date`. Une visite de trois jours est donc impossible aujourd'hui.
- Le code reste **présentable plusieurs fois dans sa journée** pour la lecture et pour le départ ; c'est l'ouverture d'une seconde visite qui est interdite.
- Une visite ouverte **sans code** (visiteur sans rendez-vous) n'est soumise à aucun contrôle d'identité.
