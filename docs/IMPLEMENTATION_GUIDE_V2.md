# Guide d'implémentation — Isaac Rendez-vous v2

**Date** : 2026-09-09  
**Cible** : Intégration Outlook + CRM + reprogrammation intelligente  
**Durée estimée** : 2-3 jours de travail n8n

---

## 1. Prérequis

### 1.1 Infrastructure
- ✅ Tour auto-hébergée avec Docker (déjà en place)
- ✅ n8n workflow "Isaac - Rendez-vous" (déjà en place)
- ✅ Fichiers JSON persistants dans `/home/aminta/isaac-app-data/`
- ✅ Node.js avec `NODE_FUNCTION_ALLOW_BUILTIN=fs,crypto,path`

### 1.2 Accès Microsoft 365 (NOUVEAU)
- [ ] OAuth credential "Microsoft 365 Outlook" en n8n UI
- [ ] Azure AD app registration (ou compte service) avec scopes :
  - `Calendars.Read`
  - `Calendars.ReadWrite`
  - `Presence.Read`

**Référence** : [Microsoft 365 Outlook Integration in n8n](https://docs.n8n.io/integrations/nodes/n8n-nodes-base.microsoftOutlook/)

### 1.3 CRM initial
- [ ] Copier `clients.json.example` → `/home/aminta/isaac-app-data/clients.json`
- [ ] Remplir avec les vrais clients de ST Digital (ou garder vide pour MVP)

---

## 2. Architecture Fichiers

### 2.1 Fichiers docs à copier/consulter

```
docs/
├── N8N_APPOINTMENTS_CONTRACT_V2.md      ← Contrat complet (NOUVELLE VERSION)
├── N8N_ROUTER_LOGIC_V2.md              ← Pseudocode détaillé
├── N8N_HELPER_FUNCTIONS.js             ← Fonctions réutilisables
├── clients.json.example                 ← Template CRM
└── IMPLEMENTATION_GUIDE_V2.md (ce fichier)
```

### 2.2 Fichiers JSON à créer dans la tour

```
/home/aminta/isaac-app-data/
├── appointments.json                    ← Mises à jour du schéma v2
├── clients.json                         ← NOUVEAU (CRM)
├── hosts.json                          ← Inchangé
├── otp_codes.json                      ← Inchangé
└── sessions.json                       ← Inchangé
```

**Format `clients.json`** : voir `docs/clients.json.example`

---

## 3. Étapes d'implémentation

### Phase 1 : Préparation (Jour 0 — 2 heures)

#### 1.1 Configurer OAuth Microsoft 365 dans n8n UI

1. Ouvrir n8n interface web : `http://100.71.79.97:5678/`
2. Menu "Credentials" → "Create new"
3. Type : "Microsoft 365 Outlook"
4. Connexion OAuth :
   - Cliquer "Authenticate with Microsoft"
   - Se logger avec compte ST DIGITAL (ou test)
   - Accepter les scopes (Calendars, Presence)
   - Credentials sauvegardées
5. Nommer : `st_digital_outlook` (pour référence dans le workflow)

#### 1.2 Initialiser CRM

```bash
# Sur la tour
cd /home/aminta/isaac-app-data/
cp /home/aminta/docs/clients.json.example clients.json
# Éditer clients.json avec les vrais clients (ou garder l'exemple pour MVP)
```

#### 1.3 Vérifier fichiers JSON existants

```bash
ls -la /home/aminta/isaac-app-data/
# Doit avoir : appointments.json, hosts.json, otp_codes.json, sessions.json
# Ajouter : clients.json
```

---

### Phase 2 : Implémentation n8n (Jour 1-2 — 1-2 jours)

#### 2.1 Créer les Code Nodes réutilisables

Dans n8n, créer 5 **Code Nodes** séparés (Util Nodes) pour chaque fonction :

**Code Node 1 : lookupCrmByEmail**
```
Name: "CRM Lookup by Email"
Type: "Code (JavaScript)"

Input: items[0].json.request.email
Output: { found, visitorType, assignedCommercialId, assignedCommercialName, ... }

Utiliser le code de N8N_HELPER_FUNCTIONS.js, fonction lookupCrmByEmail()
```

**Code Node 2 : checkOutlookAvailability**
```
Name: "Check Outlook Availability"
Input: staffEmail, date, time
Output: { available, reason, conflictingEvents }

NOTE: Cette fonction est MOCK dans N8N_HELPER_FUNCTIONS.js
À REMPLACER par les nœuds natifs n8n "Microsoft Outlook - Get Events" :

[Code: Parse Input] → [Microsoft Outlook - Get Events] → [Code: Filter Conflicts] → [Output]
```

**Code Node 3 : generateAlternativeDates**
```
Name: "Generate Alternative Dates"
Input: staffEmail, requestedDate, daysAhead=30
Output: [{ date, time, available }, ...]

Utiliser la fonction generateAlternativeDates() de N8N_HELPER_FUNCTIONS.js
(Appelle checkOutlookAvailability() pour chaque date candidate)
```

**Code Node 4 : createOutlookEvent**
```
Name: "Create Outlook Event"
Input: eventDetails { title, attendees, start, end, body }
Output: { eventId, created, outlookLink }

À REMPLACER par le nœud natif n8n "Microsoft Outlook - Create Event"
```

**Code Node 5 : buildEmailBody**
```
Name: "Build Email HTML"
Input: type ("confirmation" | "alternatives" | "alert"), data
Output: { body: HTML string }

Utiliser buildEmailBody() de N8N_HELPER_FUNCTIONS.js
```

#### 2.2 Mettre à jour le Router Principal

**Workflow existant** : "Isaac - Rendez-vous" (webhook handler)

**Modifications** :

```
[Webhook Input]
  ↓
[Parse JSON Request]
  ↓
[Switch on event type]
  ├─→ Case "appointment_requested"
  │    ↓
  │    [CRM Lookup by Email]
  │    ↓
  │    [IF: client found?]
  │    │  ├─→ YES: [Check Outlook - Commercial + Site Manager]
  │    │  └─→ NO: [Check Outlook - Service Staff + Site Manager]
  │    ↓
  │    [IF: all available?]
  │    │  ├─→ YES: [CONFIRM PATH]
  │    │  │  ├─→ [Generate Code]
  │    │  │  ├─→ [Create Outlook Event]
  │    │  │  ├─→ [Save to appointments.json]
  │    │  │  ├─→ [Send Email - Confirmation]
  │    │  │  └─→ [HTTP Response 200 - Confirmed]
  │    │  │
  │    │  └─→ NO: [ALTERNATIVES PATH]
  │    │     ├─→ [Generate Alternative Dates]
  │    │     ├─→ [Save to appointments.json (status: "en attente reprogrammation")]
  │    │     ├─→ [Send Email - Alternatives]
  │    │     └─→ [HTTP Response 200 - Alternatives]
  │    │
  │
  ├─→ Case "appointment_reschedule_confirm"
  │    ├─→ [Lookup Appointment]
  │    ├─→ [RE-CHECK Outlook]
  │    ├─→ [IF: still available → CONFIRM, ELSE → propose new alternatives]
  │    └─→ [HTTP Response]
  │
  ├─→ Case "invitation_lookup" (MODIFIÉ)
  │    ├─→ [Lookup code]
  │    ├─→ [Health check: is situation still OK?]
  │    └─→ [HTTP Response + warning si needed]
  │
  ├─→ Case "visitor_arrival_confirmed" (MODIFIÉ)
  │    ├─→ [Lookup appointment]
  │    ├─→ [Check: status == "confirmé"?]
  │    ├─→ [IF NOT → reject 409]
  │    ├─→ [Send notifications]
  │    └─→ [HTTP Response]
  │
  └─→ [... autres events unchanged ...]
```

#### 2.3 Implémenter les chemins de la logique

**Pseudocode → n8n visual** :

Chaque branche (`CONFIRM PATH`, `ALTERNATIVES PATH`) devient :
- Une série de nœuds connectés
- Avec des nœuds `IF` / `Switch` pour les décisions
- Terminée par un nœud `HTTP Response`

**Exemple concret : CONFIRM PATH**

```
[Generate Validation Code]
  ↓
[Create Outlook Event]
  (using: Microsoft Outlook - Create Event native node)
  ↓
[Code: Build Appointment JSON]
  (construct appointment object with validation_code, outlookEventId, etc.)
  ↓
[Code: Append to appointments.json]
  (using fs module)
  ↓
[Send Email - Confirmation]
  (using n8n Send Email node with HTML from buildEmailBody)
  ↓
[Send Email - To Commercial]
  ↓
[Send Email - To Site Manager]
  ↓
[HTTP Response 200 OK]
  (return { accepted: true, id, status: "confirmé", validation_code, ... })
```

---

### Phase 3 : Tester (Jour 2-3 — 4-6 heures)

#### 3.1 Tests unitaires (chaque Code Node)

**Test 1 : CRM Lookup**
```
Input: "jean.dupont@xyz.com"
Expected: { found: true, visitorType: "client", assignedCommercialName: "Paul Nguema" }
```

**Test 2 : Check Outlook (MOCK)**
```
Input: "paul@st.digital", "2026-09-12", "14:00"
Expected: { available: true/false, reason: null | "Réunion DG 10h-12h" }
```

**Test 3 : Generate Alternatives**
```
Input: "paul@st.digital", "2026-09-12", daysAhead=30
Expected: [ { date: "2026-09-13", time: "14:00", available: true }, ... ]
```

#### 3.2 Tests d'intégration (workflows complets)

**Test A : Visiteur client avec dispo**
1. Soumettre formulaire RDV avec email client existant
2. Vérifier : status = "confirmé", email reçu avec QR code
3. Vérifier : événement créé dans Outlook

**Test B : Visiteur client sans dispo ce jour**
1. Soumettre formulaire RDV avec date indisponible
2. Vérifier : status = "en attente reprogrammation", alternatives proposées
3. Vérifier : email client avec 3 dates

**Test C : Visiteur prospect**
1. Soumettre avec email non trouvé en CRM
2. Vérifier : traité comme prospect, dispo du service cherchée

**Test D : Confirmer reschedule**
1. Après test B, accepter l'une des alternatives
2. Vérifier : status change à "confirmé", nouvel événement Outlook

**Test E : Arrivée sans confirmation**
1. Créer rendez-vous dans appointments.json avec status "en attente"
2. Soumettre `visitor_arrival_confirmed` avec ce code
3. Vérifier : rejeté 409

#### 3.3 Monitoring cron

**Test F : appointment_monitor**
1. Créer RDV confirmé pour demain
2. Simuler un changement calendrier (ajouter "congés" pour ce jour)
3. Exécuter manuellement le cron job
4. Vérifier : alert email envoyée à admin, status = "risque_unavailability"

---

### Phase 4 : Déploiement et rollout (Jour 3 — 2 heures)

#### 4.1 Validation avec l'équipe ST Digital

- [ ] Réunion avec l'équipe accueil + tutrice
- [ ] Démo : créer RDV, recevoir confirmation, vérifier Outlook
- [ ] Feedback sur templates email

#### 4.2 Mise en production

1. Exporter le workflow n8n révisé
2. Garder backup du workflow v1
3. Déployer la v2
4. Monitorer les premières demandes (quelques jours)

#### 4.3 Documentation de transition

- [ ] Mettre à jour `N8N_APPOINTMENTS_CONTRACT.md` avec les vraies URLs de test
- [ ] Créer un changelog "v1 → v2 pour l'admin"
- [ ] Former l'équipe back-office sur les nouveaux statuts ("en attente reprogrammation", "risque_unavailability")

---

## 4. Configuration Fichiers Importants

### 4.1 `.env.local` (frontend)

```
# Webhooks - UNCHANGED (mais vérifier qu'ils pointent vers la tour v2)
REACT_APP_N8N_APPOINTMENT_WEBHOOK=http://100.71.79.97:5678/webhook/isaac-rdv
REACT_APP_N8N_APPOINTMENTS_LOOKUP_WEBHOOK=http://100.71.79.97:5678/webhook/isaac-rdv
REACT_APP_N8N_APPOINTMENT_CANCEL_WEBHOOK=http://100.71.79.97:5678/webhook/isaac-rdv

# CRM source (NOUVEAU)
REACT_APP_CRM_SOURCE=file
REACT_APP_CRM_FILE_PATH=/home/aminta/isaac-app-data/clients.json

# Outlook OAuth credential en n8n (à configurer en n8n UI, pas dans .env)
# Référencé dans les Code Nodes comme : credentials("st_digital_outlook")

# Jours à l'avance pour alternatives (default: 30)
APPOINTMENT_ALTERNATIVE_DAYS_AHEAD=30
```

### 4.2 `appointments.json` — Nouveau schéma

**Avant (v1)** :
```json
{
  "id": "appt_001",
  "visitor": "Jean Dupont",
  "status": "confirmé" | "en attente" | "refusé"
}
```

**Après (v2)** :
```json
{
  "id": "appt_001",
  "status": "confirmé" | "en attente reprogrammation" | "risque_unavailability" | "refusé" | "annulé",
  "statusReason": "Calendar check passed" | "Assigned commercial unavailable" | "...",
  
  "assignedCommercialName": "Paul Nguema",
  "assignedCommercialEmail": "paul@st.digital",
  
  "validation_code": "G7J56V6J",
  "outlookEventId": "calendar-uuid-123",
  
  "alternativeDatesOffered": [
    { "date": "2026-09-13", "time": "14:00" },
    ...
  ],
  
  "confirmedAt": "2026-09-09T15:30:00Z",
  "arrivedAt": null
}
```

**Migration** : Les anciens rendez-vous restent comme-is ; seuls les nouveaux auront tous les champs v2.

### 4.3 `hosts.json` — Inchangé

```json
{
  "site_manager": { "label": "...", "email": "..." },
  "commercial": { ... },
  ...
}
```

### 4.4 `clients.json` — NOUVEAU

Voir `docs/clients.json.example`

---

## 5. Fallbacks et Contingences

### 5.1 Si OAuth Outlook échoue

**Plan B** : 
- Status = "en attente validation manuelle"
- Email urgent à admin
- Admin valide manuellement via back-office
- Pas de blocage visiteur

### 5.2 Si CRM lookup échoue

**Plan B** :
- Traiter comme prospect (fallback sûr)
- Chercher dispo du service demandé

### 5.3 Si generateAlternativeDates retourne < 3 dates

**Plan B** :
- Pad avec des placeholders
- Dire au visiteur "Autres créneaux à confirmer"
- Pas de blocage

---

## 6. Points de contrôle avant production

- [ ] OAuth Microsoft 365 testé et fonctionnel en n8n UI
- [ ] CRM file (`clients.json`) remplie et accessible
- [ ] Tous les 5 Code Nodes testés individuellement
- [ ] Workflow "appointment_requested" testé A/B/C/D complets
- [ ] Workflow "appointment_reschedule_confirm" testé
- [ ] Workflow "visitor_arrival_confirmed" rejette les non-confirmés
- [ ] Cron `appointment_monitor` exécuté manuellement et fonctionne
- [ ] Templates emails en français, accents corrects
- [ ] Logs n8n vérifiés pour erreurs/warnings
- [ ] Rollout discuté avec tutrice + équipe accueil

---

## 7. Dépannage courant

### Problème : "Calendar API call timeout"

**Cause** : Outlook API lent ou down  
**Solution** : Mettre en place timeout de 10s dans le nœud, fallback admin

### Problème : "Outlook event created but not showing"

**Cause** : versionId vs activeVersionId (ancien piège)  
**Solution** : Exporter workflow, vérifier `activeVersionId`, republish si needed

### Problème : "Email templates garbled (caractères spéciaux)"

**Cause** : Encoding UTF-8 pas appliqué  
**Solution** : S'assurer que buildEmailBody() retourne `text/html; charset=utf-8`

### Problème : "CRM lookup très lent"

**Cause** : File JSON trop grosse ou lente à parser  
**Solution** : Switcher vers une vraie API CRM (Salesforce, Odoo) plus tard

---

## 8. Évolutions futures (Post-v2)

1. **API CRM réelle** : Remplacer `clients.json` par appel API Salesforce/Odoo
2. **Notifications Teams** : Une fois IT débloque les credentials
3. **Gestion des remplaçants** : Auto-assign if commercial indisponible
4. **Timezone support** : Si expansion vers autres fuseaux
5. **Analytics** : Dashboard "Rendez-vous par jour/semaine/commercial"

---

## Contact & Support

- **Questions n8n** : [n8n Docs](https://docs.n8n.io/)
- **Questions Outlook** : [Microsoft Graph API Docs](https://docs.microsoft.com/graph)
- **Questions projet** : Tutrice, MEBANG MBOUROUNOU Aminta
