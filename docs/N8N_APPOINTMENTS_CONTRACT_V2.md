# Contrat n8n révisé — Rendez-vous avec intégration Outlook + CRM + intelligence calendrier

**Version** : 2.0  
**Date** : 2026-09-09  
**Architecture** : Tour auto-hébergée, Tailscale, Docker  
**Workflow** : `Isaac - Rendez-vous` (`http://100.71.79.97:5678/webhook/isaac-rdv`)

---

## 1. Vue d'ensemble des changements

### Avant (v1)
- Admin valide manuellement chaque RDV
- Pas de vérification calendrier
- RDV confirmés sans synchronisation Outlook
- Pas de lien CRM client/commercial

### Après (v2)
- ✅ Vérification calendrier Outlook automatique
- ✅ Lookup CRM : reconnaître client existant & commercial assigné
- ✅ Confirmation auto si dispo, sinon 3 dates alternatives
- ✅ Création d'événements Outlook automatique
- ✅ Monitoring des changements imprévus
- ✅ Escalade intelligente si situation change

---

## 2. Structures de données

### 2.1 `clients.json` (CRM léger — MVP)

```json
{
  "clients": [
    {
      "email": "jean.dupont@xyz.com",
      "firstName": "Jean",
      "lastName": "Dupont",
      "company": "Entreprise XYZ",
      "status": "client",
      "assignedCommercialId": "STAFF-001",
      "assignedCommercialName": "Paul Nguema",
      "assignedCommercialEmail": "paul@st.digital",
      "dataCenter": "libreville",
      "lastVisit": "2026-08-15"
    },
    {
      "email": "prospect@example.com",
      "firstName": "Alice",
      "lastName": "Prospect",
      "company": "Nouvelle Boîte",
      "status": "prospect",
      "assignedCommercialId": null,
      "dataCenter": null,
      "createdAt": "2026-09-01"
    }
  ]
}
```

### 2.2 `appointments.json` (enrichi)

```json
{
  "appointments": [
    {
      "id": "appt_2026_001",
      "visitor": "Jean Dupont",
      "email": "jean.dupont@xyz.com",
      "company": "Entreprise XYZ",
      "phone": "+241612345678",
      "jobTitle": "Manager IT",
      "dataCenter": "libreville",
      "host": "commercial",
      "accessType": "visite",
      "purpose": "Visite partenaire",
      "date": "2026-09-12",
      "endDate": "2026-09-12",
      "time": "14:00",
      "requestReason": "Nouvelle application cloud",
      "referrerName": "Marie Commercial",
      "referrerPhone": "+241698765432",
      "remarks": "Client existant, renouvellement de contrat",
      
      "status": "confirmé",
      "statusReason": "Calendar check passed - assigned commercial available",
      "statusChangedAt": "2026-09-09T15:30:00Z",
      
      "visitorType": "client",
      "assignedCommercialId": "STAFF-001",
      "assignedCommercialName": "Paul Nguema",
      "assignedCommercialEmail": "paul@st.digital",
      "receivingStaffId": "STAFF-999",
      "receivingStaffName": "Manager Site",
      
      "validation_code": "G7J56V6J",
      "validation_code_generated_at": "2026-09-09T15:30:00Z",
      "qr_image_url": "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=G7J56V6J",
      
      "outlookEventId": "calendar-event-uuid-12345",
      "outlookAttendees": ["paul@st.digital", "manager@st.digital"],
      
      "createdAt": "2026-09-09T15:20:00Z",
      "confirmedAt": "2026-09-09T15:30:00Z",
      "arrivedAt": null,
      "cancelledAt": null,
      "cancellationReason": null,
      
      "alternativeDatesOffered": null,
      "alternativeDatesStatus": null,
      "selectedAlternativeDate": null,
      
      "notes": "First visit, high-value client"
    }
  ]
}
```

### 2.3 `hosts.json` (inchangé)

```json
{
  "hosts": {
    "site_manager": {
      "label": "Direction Site",
      "email": "manager@st.digital"
    },
    "commercial": {
      "label": "Service Commercial",
      "email": "commercial@st.digital"
    },
    "technique": {
      "label": "Support Technique",
      "email": "tech@st.digital"
    },
    "securite": {
      "label": "Sécurité",
      "email": "security@st.digital"
    },
    "rh": {
      "label": "Ressources Humaines",
      "email": "rh@st.digital"
    }
  }
}
```

---

## 3. Flux d'événements majeurs

### 3.1 `appointment_requested` (RÉVISÉ)

**Quand** : Visiteur soumet un formulaire de demande RDV  
**Appelé par** : Frontend RendezVousScreen.js

#### Payload d'entrée (inchangé)
```json
{
  "event": "appointment_requested",
  "request": {
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "jean.dupont@xyz.com",
    "phone": "+241612345678",
    "company": "Entreprise Exemple",
    "jobTitle": "Manager",
    "host": "commercial",
    "dataCenter": "libreville",
    "accessType": "visite",
    "date": "2026-09-12",
    "endDate": "2026-09-12",
    "time": "14:00",
    "purpose": "Visite partenaire",
    "referrerName": "Marie",
    "referrerPhone": "+241698765432",
    "remarks": "Important client",
    "idDocumentProvided": true,
    "photoProvided": true,
    "termsAccepted": true
  }
}
```

#### Workflow détaillé (NOUVEAU)

```
STEP 1 : Validation basique
  - Champs obligatoires présents ?
  - Email valide ?
  - Date/heure valides ?
  → 400 si non

STEP 2 : Lookup CRM
  Query clients.json par email
  Résultat :
    - Client existant → récupérer commercial assigné
    - Prospect → aucun assignement
    - NON TROUVÉ → traiter comme prospect
  
STEP 3 : Vérification calendrier Outlook (NOUVEAU)
  Si client assigné :
    - Vérifier Outlook du commercial assigné
    - Vérifier Outlook du site manager
    - Détection absences (congés, out-of-office, busy)
    
  Si prospect :
    - Vérifier Outlook : quelqu'un du service demandé est libre ?
    - Vérifier Outlook du site manager
  
  Résultat possible :
    A) Tous libres → confirmation auto
    B) Au moins 1 du service libre + site manager libre → confirmation auto (prospect)
    C) Pas dispo ce jour → générer alternatives
    D) API Outlook down → fallback admin
    E) Absence détectée → proposer alternatives intelligentes

STEP 4a : CONFIRMATION AUTO (cas A, B)
  - Générer validation_code (8 chars, ex: "G7J56V6J")
  - Créer événement Outlook :
    * Title: "RDV [Visiteur] - ST Digital"
    * Attendees: [commercial], [site_manager]
    * Start: date + time demandée
    * Duration: 60 min (hardcodé)
    * Body: Informations du visiteur + objet
  - Status = "confirmé"
  - Envoyer email au visiteur :
    Subject: "Votre rendez-vous est confirmé"
    Body: Récapitulatif + code d'accès + QR code
  - Envoyer email au commercial + site manager :
    "Vous recevrez [visiteur] le [date] à [heure]"
  - Enregistrer dans appointments.json
  - Répondre 200 OK

STEP 4b : REPROGRAMMATION (cas C, E)
  - Status = "en attente reprogrammation"
  - Appel fonction : generateAlternativeDates(commercial, service, requestedDate, days_ahead=30)
  - Résultat : 3 dates [date1, date2, date3]
  - Envoyer email au visiteur :
    "La date demandée n'est pas disponible.
     Nous proposons :
     - [date1] à [time1]
     - [date2] à [time2]
     - [date3] à [time3]
     Confirmez-vous l'une de ces dates ?"
  - Enregistrer alternatives dans appointments.json
  - Répondre 200 OK avec status et alternatives

STEP 4d : FALLBACK (cas D)
  - Status = "en attente validation manuelle"
  - Email urgent à admin :
    "⚠️ ERREUR CALENDRIER : Outlook indisponible pour [commercial]
     Veuillez valider manuellement : [link to admin]"
  - Répondre 200 OK (pas bloquer le visiteur)
  - Enregistrer avec flag "manual_required": true
```

#### Réponse HTTP

**Cas confirmation auto** (200 OK)
```json
{
  "accepted": true,
  "id": "appt_2026_001",
  "status": "confirmé",
  "validation_code": "G7J56V6J",
  "commercial": "Paul Nguema",
  "date": "2026-09-12",
  "time": "14:00",
  "message": "Votre rendez-vous est confirmé. Un QR code a été envoyé à votre email."
}
```

**Cas reprogrammation** (200 OK)
```json
{
  "accepted": true,
  "id": "appt_2026_001",
  "status": "en attente reprogrammation",
  "message": "Cette date n'est pas disponible. Nous proposons 3 alternatives.",
  "alternatives": [
    { "date": "2026-09-13", "time": "14:00", "available_staff_count": 2 },
    { "date": "2026-09-16", "time": "10:00", "available_staff_count": 2 },
    { "date": "2026-09-19", "time": "15:00", "available_staff_count": 1 }
  ]
}
```

**Cas erreur** (4xx/5xx)
```json
{
  "accepted": false,
  "error": "Validation failed",
  "details": "Email invalid or required fields missing"
}
```

---

### 3.2 `appointment_reschedule_confirm` (NOUVEAU EVENT)

**Quand** : Visiteur confirme l'une des 3 dates alternatives  
**Appelé par** : Email avec lien cliquable ou API frontend

#### Payload
```json
{
  "event": "appointment_reschedule_confirm",
  "appointmentId": "appt_2026_001",
  "selectedDate": "2026-09-13",
  "selectedTime": "14:00"
}
```

#### Workflow
```
STEP 1 : Lookup appointment
STEP 2 : Vérifier AGAIN Outlook (la situation a pu changer)
  Si dispo ✅ :
    → Générer validation_code
    → Créer événement Outlook
    → Envoyer emails de confirmation
    → Status = "confirmé"
  Si plus dispo ❌ :
    → Status reste "en attente reprogrammation"
    → Générer 3 NOUVELLES dates
    → Email : "Cette date vient de devenir indisponible, voici 3 nouvelles propositions"
STEP 3 : Répondre 200 OK
```

#### Réponse
```json
{
  "accepted": true,
  "id": "appt_2026_001",
  "status": "confirmé" | "en attente reprogrammation",
  "validation_code": "G7J56V6J",
  "date": "2026-09-13",
  "time": "14:00"
}
```

---

### 3.3 `invitation_lookup` (INCHANGÉ mais enrichi)

#### Workflow ajouté
```
Avant réponse :
  - Lookup code
  - Vérifier si la situation a changé depuis (commercial absent maintenant ?)
  - Si risque détecté : ajouter warning à la réponse
```

#### Réponse enrichie
```json
{
  "visitor": "Jean Dupont",
  "company": "Entreprise Exemple",
  "host": "Commercial",
  "date": "2026-09-12",
  "time": "14:00",
  "purpose": "Visite partenaire",
  "status": "confirmé",
  "code": "G7J56V6J",
  
  "warning": null | "Votre commercial référent est absent ce jour. L'accueil vous contactera."
}
```

---

### 3.4 `visitor_arrival_confirmed` (MODIFIÉ)

#### Workflow ajouté
```
STEP 1 : Lookup appointment par code
STEP 2 : Vérifier status
  Si status !== "confirmé" :
    → 409 Conflict
    → Message : "Ce rendez-vous n'est pas confirmé" / "Rendez-vous annulé"
STEP 3 : Notification hôte (existant)
  Email + Teams au commercial
  Email au site manager
STEP 4 : Marquer "arrivedAt"
  appointment.arrivedAt = now()
```

---

### 3.5 `appointment_monitor` (NOUVEAU EVENT — cron job)

**Quand** : Chaque nuit à 22h00  
**Appelé par** : n8n cron trigger

#### Workflow
```
Pour chaque appointment en status "confirmé" :
  STEP 1 : Lookup appointment
  STEP 2 : Vérifier Outlook du commercial assigné ce jour
  STEP 3 : Comparer avec le statut enregistré
  
  Si changement détecté (nouveau block occupé, congés marqués) :
    → Status = "risque_unavailability"
    → Email urgent à admin :
      "⚠️ ALERTE CALENDRIER
       Appointment appt_2026_001 : Jean Dupont vs Paul Nguema
       Paul vient d'être marqué ABSENT le 2026-09-12 (Congés 10-15 sept)
       RDV en danger. Action requise : annuler/reschedule."
    → Email optionnel au visiteur (best-effort) :
      "Votre rendez-vous pourrait être affecté. L'accueil vous recontacte."
  
  Si tout OK :
    → Rien (log silencieux)
```

---

## 4. Événements existants (inchangés)

### 4.1 `appointments_otp_request`, `appointments_otp_verify`, `appointments_lookup`, `appointment_cancelled`
Voir N8N_APPOINTMENTS_CONTRACT.md v1 — aucun changement.

### 4.2 Admin events
`admin_list_appointments`, `admin_update_status`, `admin_list_staff`, `admin_add_staff`, `admin_remove_staff` — aucun changement au workflow, mais l'affichage back-office est enrichi (voir §5).

---

## 5. Back-office (mise à jour UI/affichage)

### 5.1 Affichage de disponibilité calendrier

Avant de confirmer/refuser un RDV, l'admin voit :

```
APPOINTMENT : appt_2026_001
Visiteur : Jean Dupont
Commercial assigné : Paul Nguema (paul@st.digital)
Date demandée : 2026-09-12 14:00

CALENDRIER OUTLOOK :
  Paul Nguema :
    - 12 sept 10:00-12:00 : Réunion direction
    - 12 sept 14:00-15:00 : [VOTRE RDV] ✅ LIBRE
    → Verdict : LIBRE
  
  Site Manager :
    - 12 sept 14:00-15:00 : [VOTRE RDV] ✅ LIBRE
    → Verdict : LIBRE

RECOMMANDATION : Confirmer (tous les participants sont libres)

[CONFIRMER] [REFUSER avec raison...]
```

### 5.2 Cas "reprogrammation en attente"

```
APPOINTMENT : appt_2026_001
Status : EN ATTENTE REPROGRAMMATION
Raison : Commercial assigné indisponible à la date demandée

Alternative dates offered to visitor :
  ☐ 2026-09-13 14:00 (Paul libre)
  ☐ 2026-09-16 10:00 (Paul libre)
  ☐ 2026-09-19 15:00 (Paul libre)

Visitor confirmation status : En attente

[RELANCER VISITEUR] [ANNULER] [FORCER CONFIRMATION MANUELLE]
```

---

## 6. Configuration et dépendances

### 6.1 OAuth Microsoft 365

**Dans n8n UI** :
1. Créer une credential "Microsoft 365 Outlook OAuth"
2. Application registration ou compte service
3. Scopes requis :
   - `Calendars.Read`
   - `Calendars.ReadWrite`
   - `Presence.Read`

### 6.2 Fichiers JSON stockés

```
/home/aminta/isaac-app-data/
  ├── appointments.json
  ├── clients.json (CRM léger)
  ├── hosts.json
  ├── otp_codes.json
  ├── sessions.json
  └── notifications.json
```

### 6.3 Variables d'environnement (.env.local)

```
# Webhooks (unchanged)
REACT_APP_N8N_APPOINTMENT_WEBHOOK=http://100.71.79.97:5678/webhook/isaac-rdv
REACT_APP_N8N_APPOINTMENTS_LOOKUP_WEBHOOK=http://100.71.79.97:5678/webhook/isaac-rdv
REACT_APP_N8N_APPOINTMENT_CANCEL_WEBHOOK=http://100.71.79.97:5678/webhook/isaac-rdv

# CRM source (new)
REACT_APP_CRM_SOURCE=file
REACT_APP_CRM_FILE_PATH=/home/aminta/isaac-app-data/clients.json
# Alternative : API réelle plus tard
# REACT_APP_CRM_SOURCE=api
# REACT_APP_CRM_API_URL=https://crm.st.digital/api/lookup-client
# REACT_APP_CRM_API_KEY=...

# Outlook OAuth credential n8n (configured in n8n UI, not in .env)
N8N_OUTLOOK_CREDENTIAL_NAME=st_digital_outlook

# Jours à l'avance pour alternatives (default: 30)
APPOINTMENT_ALTERNATIVE_DAYS_AHEAD=30
```

---

## 7. Cas limites et fallbacks

### 7.1 API Outlook indisponible
```
→ Status = "en attente validation manuelle"
→ Email admin urgent
→ Pas d'auto-confirmation
→ Admin valide manuellement
```

### 7.2 CRM lookup fail
```
→ Traiter comme prospect
→ Chercher dispo du service demandé
→ Workflow normal
```

### 7.3 Changement calendrier après confirmation
```
Visiteur a RDV confirmé, mais commercial se marque "absent"
→ Monitoring job détecte
→ Status = "risque_unavailability"
→ Admin escalade
```

### 7.4 Visiteur ne choisit pas d'alternative dans 48h
```
→ Email de rappel : "Confirmer l'une des 3 dates proposées"
→ Après 7 jours : RDV automatiquement annulé
```

---

## 8. Schéma de version et déploiement

**v2.0** : Intégration Outlook + CRM + alternatives intelligentes  
**Date de déploiement cible** : Fin S4 (2026-09-09) ou début S5  
**Dépendances bloquantes** :
- OAuth Microsoft 365 configuration en n8n UI ✅ (peut être manual)
- Fichier `clients.json` initial ✅ (peut être vide MVP)
- Fonction generateAlternativeDates() ✅ (à implémenter)

---

## 9. Points de suivi et révisions futures

1. **Intégration API CRM réelle** (actuellement JSON local)
2. **Notifications Teams** (Outlook emails OK, Teams bloqué par IT)
3. **Gestion des remplaçants** (si commercial assigné indisponible, assigner automatiquement remplaçant du même service)
4. **Scoring de disponibilité** (si besoin : chercher dates où le PLUS de gens du service sont libres, pas juste "quelqu'un")
5. **Intégration calendrier partagé** (groupe Exchange au lieu d'individus)
6. **Timezone handling** (Libreville/Douala/Abidjan déjà même UTC+1, mais à vérifier avec expansion future)
