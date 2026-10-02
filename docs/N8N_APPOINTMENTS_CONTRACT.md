# Contrat des workflows n8n — Création, consultation et annulation des rendez-vous

## Architecture (mise à jour du 04/09/2026 — migration vers la tour auto-hébergée)

Les actions ci-dessous (création, recherche par code, flux OTP, annulation) sont traitées par le workflow n8n **"Isaac - Rendez-vous"**, auto-hébergé sur la tour (Docker, réseau Tailscale — même infrastructure que le chat), webhook `http://ADRESSE-DE-LA-TOUR:5678/webhook/isaac-rdv`, routé en interne selon le champ `event` du payload. Les variables d'environnement correspondantes (`REACT_APP_N8N_APPOINTMENT_WEBHOOK`, `REACT_APP_N8N_APPOINTMENTS_LOOKUP_WEBHOOK`, `REACT_APP_N8N_APPOINTMENT_CANCEL_WEBHOOK`) pointent toutes vers cette même URL — c'est le champ `event` qui détermine le traitement, pas l'URL. Ceci remplace l'ancienne architecture sur `n8n.cloud` (jamais réellement construite côté serveur).

**Stockage : fichiers JSON, pas de n8n Data Table.** Les Data Tables n8n nécessitent une création via l'éditeur graphique (pas d'équivalent CLI/API découvert à ce jour), inaccessible dans le contexte de développement actuel. À la place, un nœud **Code** unique (accès `fs` du conteneur Node.js activé via `NODE_FUNCTION_ALLOW_BUILTIN=fs,crypto,path`) lit/écrit des fichiers JSON montés en volume écrivable sur la tour (`/home/aminta/isaac-app-data` → `/home/node/.n8n-appdata` dans le conteneur) : `appointments.json`, `otp_codes.json`, `sessions.json`, `hosts.json`. Ce choix technique est documenté ici pour le mémoire : même objectif (pas de base de données externe, persistance qui survit aux redémarrages du conteneur — contrairement à la base vectorielle du chat, restée en mémoire), mécanisme différent car plus simple à automatiser sans accès à l'interface n8n.

**Notification hôte par email SMTP, pas Outlook/Teams.** En l'absence des credentials Azure AD (toujours non fournies par l'IT ST Digital au 04/09/2026), la notification de l'hôte utilise un envoi SMTP classique (nœud "Send Email" de n8n) comme canal de démonstration. Credential SMTP à créer manuellement dans l'éditeur n8n (nom du nœud concerné : "Envoyer email", workflow "Isaac - Rendez-vous") — jamais transmise ni saisie par l'assistant IA.

**Génération du QR code.** Toujours via `api.qrserver.com` (image générée à la volée, aucune dépendance ajoutée côté frontend), encodant directement le `validation_code` — confirmé fonctionnel dans le nœud "Router evenement" du workflow.

## 4. Back-office minimal — administration (un compte par pays/datacenter, 04/09/2026)

Un compte administrateur par pays disposant d'un datacenter (Gabon/Libreville, Cameroun/Douala, Côte d'Ivoire/Abidjan), chacun ne voyant et ne pouvant modifier **que** les rendez-vous de son propre `dataCenter` — isolation vérifiée par test (un rendez-vous créé avec `dataCenter: "douala"` est invisible au compte Gabon, visible et modifiable uniquement au compte Cameroun).

- `admin_list_appointments` (`{ "event": "admin_list_appointments", "adminCountry": "gabon"|"cameroun"|"cote_ivoire", "adminPassword": "..." }`) → `401` si les identifiants sont invalides, sinon la liste des rendez-vous **du pays uniquement**, triée du plus récent au plus ancien, plus un champ `country` (libellé affiché).
- `admin_update_status` (mêmes identifiants + `id`, `status`, `reason` optionnel) → `404` si le rendez-vous n'existe pas **ou appartient à un autre pays** (pas de distinction volontaire, pour ne pas révéler l'existence d'un enregistrement hors périmètre).

Page `/admin/` repensée en véritable page de connexion : sélection du pays (3 cartes avec drapeau) puis mot de passe, session mémorisée en `localStorage`, tableau de bord scopé avec bouton Déconnexion.

**Mots de passe actuels (générés côté serveur, à faire tourner avant toute mise en production réelle — ce sont des secrets de développement)** : conservés uniquement dans le code du nœud "Router evenement" du workflow n8n et communiqués à la stagiaire hors du dépôt de code (jamais commités).

**Limite connue** : mots de passe statiques partagés par pays, pas de comptes utilisateurs individuels — proportionné à un back-office minimal en développement avec données fictives (PR-12), mais pas un mécanisme d'authentification à faire évoluer tel quel avant une vraie mise en production.

## 5. Évolutions du 04/09/2026 (suite retours utilisateur)

**Champ `jobTitle` (fonction/statut du visiteur)** — optionnel, ex. "Responsable IT", "Étudiante". Simple champ texte transmis tel quel dans `request`, aucune validation particulière côté serveur. Affiché dans le back-office sous le nom du visiteur.

**`host` : liste fermée de catégories, plus de texte libre.** Le visiteur ne choisit plus le nom d'une personne précise mais un **type d'hôte** parmi : `site_manager` (par défaut, toujours disponible), `commercial`, `technique`, `securite`, `rh`. `hosts.json` fait correspondre chaque code à une adresse email — reste à remplacer les adresses de test par les vraies boîtes ST Digital par service avant mise en production. Le back-office traduit les codes en libellés lisibles.

**Motif de refus.** `admin_update_status` accepte un champ `reason` optionnel (utilisé uniquement quand `status: "refuse"`) : stocké dans `refusalReason` sur l'enregistrement, et envoyé au visiteur par email (« Nous ne pouvons pas donner suite... [motif] »). Le back-office demande ce motif via une invite avant d'envoyer l'action.

## 0. Création d'une demande de rendez-vous (`REACT_APP_N8N_APPOINTMENT_WEBHOOK`)

Champs alignés (24/08/2026) sur le système officiel **Stargate** (`stargate.datacenter-services.net`, gestion d'accès data center ST Digital) — voir Étape 1 de son formulaire pour référence.

### Payload envoyé

```json
{
  "event": "appointment_requested",
  "request": {
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "visiteur@exemple.com",
    "phone": "+241612345678",
    "company": "Entreprise Exemple",
    "host": "Direction Technique",
    "dataCenter": "libreville",
    "accessType": "visite",
    "date": "2026-09-01",
    "endDate": "2026-09-01",
    "time": "10:00",
    "purpose": "Visite partenaire",
    "referrerName": "Marie Commercial",
    "referrerPhone": "+241698765432",
    "remarks": "Rencontre commerciale",
    "idDocumentProvided": true,
    "photoProvided": true,
    "termsAccepted": true
  }
}
```

Champs obligatoires : `firstName`, `lastName`, `email`, `phone`, `company`, `host`, `purpose`, `termsAccepted` (doit valoir `true`). `dataCenter` (`libreville`/`douala`/`abidjan`) et `accessType` (`visite`/`interne`/`intervention`/`prestataire`/`client`/`stagiaire`/`livraison`) ont une valeur par défaut côté frontend. `date`/`endDate`/`time` ne sont affichés et envoyés que lorsque `accessType === "visite"`. `referrerName`/`referrerPhone`/`remarks` sont optionnels. `idDocumentProvided`/`photoProvided` sont des indicateurs booléens (un fichier a été sélectionné / une photo a été prise) — **le contenu du fichier ou de la photo n'est pas transmis ni stocké côté n8n dans cette version** (limitation connue, la Data Table n8n ne stocke que des champs structurés).

### Réponse attendue

```json
{ "accepted": true, "id": "appt_...", "status": "en attente", "message": "Demande de rendez-vous enregistree" }
```

### Workflow attendu

1. Webhook `POST` d'entrée, routage sur `event === "appointment_requested"`.
2. Validation des champs obligatoires de `request` — rejet en `4xx` si un champ requis est manquant ou si `termsAccepted` n'est pas `true`.
3. Génération d'un identifiant de demande, statut initial `en attente`, horodatage.
4. Enregistrement dans la Data Table `appointments` (22 colonnes, cf. champs ci-dessus + `visitor` calculé comme `firstName + " " + lastName`).
5. **Notification de l'équipe d'accueil** : un email récapitulatif est envoyé à une adresse fixe (`info@st.digital`, à remplacer par la bonne boîte de réception interne une fois confirmée) via le nœud `Notifier accueil (nouvelle demande)`.
6. **Mise à jour du 04/09/2026 — le code/QR n'est PLUS généré à cette étape.** À la demande, le visiteur reçoit un simple accusé de réception (« en attente de validation »), sans code ni QR. Le `validation_code` (8 caractères, alphabet sans ambiguïté visuelle `ABCDEFGHJKMNPQRSTUVWXYZ23456789`) et l'email contenant le QR (`api.qrserver.com`) ne sont générés et envoyés **qu'au moment où le personnel confirme la demande** via le back-office (`admin_update_status` → `status: "confirme"`, voir §4). Décision volontaire : la ligne rouge de conception de la fiche de stage interdit qu'un code d'accès fonctionnel soit délivré sans validation humaine — générer le QR dès la demande aurait permis à n'importe qui de s'auto-délivrer une invitation valide.
7. Les deux envois d'email (5 et 6) sont en **best-effort** (`onError: continueRegularOutput`) : un échec d'envoi (ex. credentials Outlook non finalisées) n'empêche jamais l'enregistrement de la demande ni la confirmation au visiteur.
8. Réponse `200` si accepté, `5xx` en cas d'échec du workflow (validation ou enregistrement Data Table uniquement — pas les notifications).

## 1. Recherche d'une invitation par code (`invitation_lookup`)

Utilisé par l'écran "J'ai un rendez-vous" (saisie manuelle ou scan QR — les deux aboutissent au même code).

### Payload envoyé
```json
{ "event": "invitation_lookup", "code": "G7J56V6J" }
```

### Réponse attendue
```json
{ "visitor": "Jean Dupont", "company": "Entreprise Exemple", "host": "Direction Technique", "date": "2026-09-01", "time": "10:00", "purpose": "Visite partenaire", "status": "en attente", "code": "G7J56V6J" }
```

### Workflow
1. Rejette en `400` si `code` est vide.
2. Recherche dans la Data Table `appointments` par `validation_code`.
3. `404` si aucune correspondance, `200` avec les infos de la visite sinon.

## 2. Consultation sécurisée des rendez-vous — flux OTP

⚠️ **Changement de sécurité** : consulter la liste des rendez-vous d'une personne ne se fait plus avec le seul email (trivialement devinable/énumérable). Il faut désormais prouver la possession de la boîte mail via un code à usage unique (OTP).

### 2a. Demande de code (`appointments_otp_request`, `REACT_APP_N8N_APPOINTMENTS_LOOKUP_WEBHOOK`)
```json
{ "event": "appointments_otp_request", "email": "visiteur@exemple.com" }
```
→ génère un OTP à 6 chiffres (Data Table `otp_codes`, expire après 5 minutes), l'envoie par email (best-effort), répond `{ "sent": true }` (`400` si email invalide).

### 2b. Vérification du code (`appointments_otp_verify`, même webhook)
```json
{ "event": "appointments_otp_verify", "email": "visiteur@exemple.com", "otp": "123456" }
```
→ `401` si code invalide/expiré/déjà utilisé. Si valide : marque l'OTP comme utilisé, crée une **session temporaire** (Data Table `sessions`, jeton aléatoire, expire après 15 minutes), et répond avec la liste des rendez-vous **et** le jeton :
```json
{ "appointments": [ { "id": "appt_...", "host": "...", "date": "...", "time": "...", "purpose": "...", "status": "en attente" } ], "sessionToken": "Xt79EmtgfQ..." }
```

### 2c. Rafraîchir la liste avec un jeton existant (`appointments_lookup`, même webhook)
```json
{ "event": "appointments_lookup", "email": "visiteur@exemple.com", "sessionToken": "Xt79EmtgfQ..." }
```
→ `401` si le jeton est absent, expiré, ou ne correspond pas à cet email. `200` avec la liste sinon.

## 3. Annulation d'une demande (`REACT_APP_N8N_APPOINTMENT_CANCEL_WEBHOOK`)

### Payload envoyé
```json
{ "event": "appointment_cancelled", "id": "appt_...", "sessionToken": "Xt79EmtgfQ..." }
```

### Réponse attendue
```json
{ "accepted": true, "id": "appt_..." }
```

### Workflow attendu
1. Recherche du rendez-vous par `id`.
2. **Vérifie que le `sessionToken` correspond à l'email associé à ce rendez-vous précis** (empêche d'annuler le rendez-vous de quelqu'un d'autre même avec une session valide sur son propre email).
3. Vérifie que le statut est `en attente` (seul un rendez-vous en attente peut être annulé par le visiteur).
4. `409` si introuvable / session invalide / déjà traité. `200` si accepté.

## Configuration locale

`.env.local` : `REACT_APP_N8N_APPOINTMENT_WEBHOOK`, `REACT_APP_N8N_APPOINTMENTS_LOOKUP_WEBHOOK` et `REACT_APP_N8N_APPOINTMENT_CANCEL_WEBHOOK` pointent tous vers `https://aistd.app.n8n.cloud/webhook/isaac`. Sans elles, `appointmentService.js` retombe sur des données de démonstration locales — pratique en développement, pas le comportement cible.
