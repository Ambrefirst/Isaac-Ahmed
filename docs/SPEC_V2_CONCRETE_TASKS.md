# Spec v2 — Changements Exacts + Ordre des Tâches Concrètes

**Date** : 2026-09-09  
**Objectif** : Implémenter Isaac Ahmed v2 (Outlook + CRM + alternatives)  
**Durée totale** : 3-4 heures  
**Target deadline** : Fin S4 (2026-09-09)

---

## PARTIE 1 : SPEC V2 — CHANGEMENTS EXACTS

### Changement 1 : Schéma `appointments.json`

**Avant (v1)** :
```json
{
  "id": "appt_001",
  "visitor": "Jean Dupont",
  "status": "en attente"
}
```

**Après (v2)** — Ajouter ces champs :
```json
{
  "id": "appt_001",
  "visitor": "Jean Dupont",
  "email": "jean@xyz.com",
  "company": "Entreprise",
  "host": "commercial",
  "date": "2026-09-12",
  "time": "14:00",
  "purpose": "Visite",
  
  // NOUVEAUX CHAMPS V2
  "status": "confirmé|en attente reprogrammation|risque_unavailability|refusé",
  "visitorType": "client|prospect",
  "assignedCommercialEmail": "paul@st.digital",
  "assignedCommercialName": "Paul Nguema",
  "validation_code": "G7J56V6J",
  "qr_image_url": "https://api.qrserver.com/...",
  "outlookEventId": "uuid-from-microsoft",
  "alternativeDatesOffered": [
    { "date": "2026-09-13", "time": "14:00" },
    { "date": "2026-09-16", "time": "10:00" },
    { "date": "2026-09-19", "time": "15:00" }
  ],
  "alternativeDatesStatus": "pending_visitor_choice|accepted|rejected",
  "confirmedAt": "2026-09-09T15:30:00Z",
  "arrivedAt": null
}
```

---

### Changement 2 : Nouveau Fichier `clients.json` (CRM)

Créer `/home/aminta/isaac-app-data/clients.json` :

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
      "dataCenter": "libreville"
    }
  ]
}
```

---

### Changement 3 : Nouvelle Logique `appointment_requested`

**Avant (v1)** :
```
POST webhook
  ↓
Enregistrer simplement
  ↓
HTTP 200
```

**Après (v2)** :
```
POST webhook
  ↓
[STEP 1] Lookup CRM par email
  → Trouvé = "client" → récupérer commercial assigné
  → Pas trouvé = "prospect"
  ↓
[STEP 2] Vérifier Outlook
  SI client assigné :
    → Check : commercial assigné + site_manager libres le [date/time] ?
  SI prospect :
    → Check : ≥1 du service + site_manager libres ?
  ↓
[STEP 3a] SI DISPO OK → CONFIRMATION AUTO
  ✅ Générer validation_code
  ✅ Créer événement Outlook
  ✅ Sauver appointment.json (status: "confirmé")
  ✅ Email au visiteur avec QR code
  ✅ HTTP 200 { status: "confirmé", code: "G7J56V6J" }
  
[STEP 3b] SI PAS DISPO → PROPOSER ALTERNATIVES
  ⚠️ Chercher 3 dates où commercial + site_manager libres
  ⚠️ Sauver appointment.json (status: "en attente reprogrammation")
  ⚠️ Email au visiteur : "Propositions :"
  ⚠️ HTTP 200 { status: "en attente reprogrammation", alternatives: [...] }
```

---

### Changement 4 : Nouvel Événement `appointment_reschedule_confirm`

**Quand** : Visiteur accepte l'une des 3 dates

**Payload** :
```json
{
  "event": "appointment_reschedule_confirm",
  "appointmentId": "appt_001",
  "selectedDate": "2026-09-13",
  "selectedTime": "14:00"
}
```

**Logic** :
```
Lookup appointment
  ↓
RE-check Outlook (date peut avoir changé)
  ↓
SI DISPO OK :
  → Status = "confirmé"
  → Générer code, créer event Outlook
  → Email confirmation
  ↓
SI PLUS DISPO :
  → Status reste "en attente reprogrammation"
  → Proposer 3 NOUVELLES dates
```

---

### Changement 5 : Modification `visitor_arrival_confirmed`

**Avant (v1)** :
```
POST { code }
  ↓
Lookup appointment
  ↓
Envoyer notification
```

**Après (v2)** :
```
POST { code }
  ↓
Lookup appointment
  ↓
CHECK : status == "confirmé" ?
  ├─→ NON → HTTP 409 "Pas confirmé"
  └─→ OUI → Envoyer notification (unchanged)
```

---

### Changement 6 : Nouvelle Tâche Cron `appointment_monitor`

**Quand** : Chaque nuit 22:00

```
FOR chaque appointment.status == "confirmé" :
  ↓
  Re-check Outlook ce jour
  ↓
  SI changement détecté (commercial absent maintenant) :
    → Status = "risque_unavailability"
    → Email urgent à admin
  ↓
  SINON : rien
```

---

## PARTIE 2 : ORDRE DES TÂCHES CONCRÈTES

### TÂCHE 1 : Créer `clients.json` (5 min)

**Sur la tour** :
```bash
cat > /home/aminta/isaac-app-data/clients.json << 'EOF'
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
      "dataCenter": "libreville"
    }
  ]
}
EOF
```

**Vérif** : `cat /home/aminta/isaac-app-data/clients.json`

---

### TÂCHE 2 : Créer Code Node `lookupCrmByEmail` (10 min)

**n8n UI** → Workflow "Isaac - Rendez-vous" → Add Node "Code (JavaScript)"

**Nom** : `lookupCrmByEmail`

**Code** :
```javascript
const fs = require('fs');

try {
  const crmData = JSON.parse(
    fs.readFileSync('/home/node/.n8n-appdata/clients.json', 'utf-8')
  );
  
  const email = items[0].json.request.email.toLowerCase();
  const client = crmData.clients.find(c => c.email.toLowerCase() === email);
  
  if (client) {
    return [{
      json: {
        found: true,
        visitorType: client.status || 'prospect',
        assignedCommercialEmail: client.assignedCommercialEmail,
        assignedCommercialName: client.assignedCommercialName,
        assignedCommercialId: client.assignedCommercialId
      }
    }];
  } else {
    return [{
      json: {
        found: false,
        visitorType: 'prospect',
        assignedCommercialEmail: null,
        assignedCommercialName: null
      }
    }];
  }
} catch (error) {
  return [{
    json: {
      found: false,
      visitorType: 'prospect',
      error: error.message
    }
  }];
}
```

**Input** : `items[0].json.request.email`  
**Output** : `{ found, visitorType, assignedCommercialEmail, assignedCommercialName }`

**Test** : Passer email "jean.dupont@xyz.com" → doit retourner client trouvé ✅

---

### TÂCHE 3 : Créer Code Node `checkOutlookAvailability` (15 min)

**Nom** : `checkOutlookAvailability`

**Code MOCK** (à remplacer par nœuds natifs n8n Outlook après) :
```javascript
// MOCK: Returns availability check
// IN REAL IMPLEMENTATION: Use n8n's "Microsoft Outlook - Get Events" node

const staffEmail = items[0].json.staffEmail;
const dateStr = items[0].json.date; // "2026-09-12"
const timeStr = items[0].json.time; // "14:00"

// Mock data for demo
const mockCalendar = {
  'paul@st.digital': {
    '2026-09-12': {
      busy: [
        { title: 'Reunion', start: '2026-09-12T10:00:00Z', end: '2026-09-12T12:00:00Z' }
      ]
    }
  }
};

const events = mockCalendar[staffEmail]?.[dateStr]?.busy || [];
const conflicts = events.filter(e => {
  // Simple overlap check (in real code, use proper time parsing)
  return true; // For now, assume no conflicts
});

return [{
  json: {
    available: conflicts.length === 0,
    reason: conflicts.length > 0 ? 'Conflict: ' + conflicts[0].title : null,
    conflicts: conflicts
  }
}];
```

**Input** : `{ staffEmail, date, time }`  
**Output** : `{ available: bool, reason: string|null }`

**Test** : Vérifier que ça retourne `available: true` ✅

---

### TÂCHE 4 : Créer Code Node `generateAlternativeDates` (20 min)

**Nom** : `generateAlternativeDates`

**Code** :
```javascript
const staffEmail = items[0].json.staffEmail;
const requestedDate = items[0].json.requestedDate; // "2026-09-12"
const daysAhead = items[0].json.daysAhead || 30;

// Generate 3 alternative dates (simplified - just offset days)
const alternatives = [];
const baseDate = new Date(requestedDate);

for (let i = 1; i <= 3; i++) {
  const altDate = new Date(baseDate);
  altDate.setDate(altDate.getDate() + i);
  
  // Skip weekends
  if (altDate.getDay() === 0 || altDate.getDay() === 6) {
    altDate.setDate(altDate.getDate() + 1);
  }
  
  const dateStr = altDate.toISOString().split('T')[0];
  alternatives.push({
    date: dateStr,
    time: '14:00',
    available: true
  });
}

return [{ json: { alternatives } }];
```

**Input** : `{ staffEmail, requestedDate, daysAhead }`  
**Output** : `{ alternatives: [{date, time, available}, ...] }`

**Test** : Passer date → doit retourner 3 dates ✅

---

### TÂCHE 5 : Créer Code Node `buildEmailHtml` (15 min)

**Nom** : `buildEmailHtml`

**Code** :
```javascript
const type = items[0].json.type; // "confirmation" | "alternatives"
const data = items[0].json.data;

let html = `
  <div style="font-family: Arial; background: #f5f5f5; padding: 20px;">
    <div style="background: #1A4D7A; color: white; padding: 20px; text-align: center;">
      <h1>ST DIGITAL - Isaac Ahmed</h1>
    </div>
    <div style="background: white; padding: 20px; max-width: 600px; margin: 20px auto;">
`;

if (type === 'confirmation') {
  html += `
    <p>Bonjour ${data.visitorName},</p>
    <p>Votre rendez-vous est <strong>confirmé</strong> !</p>
    <table style="width: 100%; margin: 20px 0;">
      <tr><td style="background: #f0f0f0; padding: 10px;"><strong>Date</strong></td>
          <td style="padding: 10px;">${data.date}</td></tr>
      <tr><td style="background: #f0f0f0; padding: 10px;"><strong>Heure</strong></td>
          <td style="padding: 10px;">${data.time}</td></tr>
      <tr><td style="background: #f0f0f0; padding: 10px;"><strong>Code</strong></td>
          <td style="padding: 10px;"><strong>${data.code}</strong></td></tr>
    </table>
    <p style="text-align: center;">
      <img src="${data.qr_url}" alt="QR" style="width: 150px; height: 150px;" />
    </p>
  `;
} else if (type === 'alternatives') {
  html += `
    <p>Bonjour ${data.visitorName},</p>
    <p>Les créneaux demandés ne sont pas disponibles. Propositions :</p>
    <ul>
      ${data.alternatives.map(a => `<li>${a.date} à ${a.time}</li>`).join('')}
    </ul>
  `;
}

html += `
    </div>
    <div style="background: #1A4D7A; color: white; padding: 10px; text-align: center; font-size: 12px;">
      <p>SÉCURISÉ · FIABLE · SOUVERAIN</p>
    </div>
  </div>
`;

return [{ json: { html } }];
```

**Input** : `{ type: "confirmation"|"alternatives", data }`  
**Output** : `{ html: string }`

**Test** : Générer HTML confirmation → vérifier format ✅

---

### TÂCHE 6 : Mettre à jour `appointment_requested` Router (1h)

**Dans le workflow, remplacer/augmenter la logique** :

```
[START: appointment_requested webhook received]
  ↓
[Code: lookupCrmByEmail]
  Input: request.email
  Output: { found, visitorType, assignedCommercialEmail, assignedCommercialName }
  ↓
[IF: found and assignedCommercialEmail?]
  ├─→ YES [Check Outlook: commercialEmail + date/time]
  └─→ NO [Check Outlook: service staff + date/time]
  ↓
[IF: available?]
  ├─→ YES : [CONFIRM PATH]
  │    ├─→ [Code: Generate Code] → "G7J56V6J"
  │    ├─→ [Code: Build Appointment JSON] → { status: "confirmé", code, ... }
  │    ├─→ [Code: Append to appointments.json]
  │    ├─→ [Send Email] (confirmation)
  │    └─→ [HTTP Response 200] { status: "confirmé", code }
  │
  └─→ NO : [ALTERNATIVES PATH]
       ├─→ [Code: generateAlternativeDates]
       ├─→ [Code: Build Appointment JSON] → { status: "en attente reprogrammation", alternatives }
       ├─→ [Code: Append to appointments.json]
       ├─→ [Send Email] (alternatives)
       └─→ [HTTP Response 200] { status: "en attente reprogrammation", alternatives }
```

**Code pour CONFIRM PATH** :
```javascript
// Generate validation code
const code = Math.random().toString(36).substring(2, 10).toUpperCase();

// Build appointment
const appointment = {
  id: 'appt_' + Date.now(),
  status: 'confirmé',
  visitor: items[0].json.request.firstName + ' ' + items[0].json.request.lastName,
  email: items[0].json.request.email,
  company: items[0].json.request.company,
  host: items[0].json.request.host,
  date: items[0].json.request.date,
  time: items[0].json.request.time,
  purpose: items[0].json.request.purpose,
  
  visitorType: items[0].json.visitorType,
  assignedCommercialEmail: items[0].json.assignedCommercialEmail,
  assignedCommercialName: items[0].json.assignedCommercialName,
  
  validation_code: code,
  qr_image_url: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${code}`,
  
  confirmedAt: new Date().toISOString(),
  arrivedAt: null
};

// Save to appointments.json
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/home/node/.n8n-appdata/appointments.json', 'utf-8'));
data.appointments.push(appointment);
fs.writeFileSync('/home/node/.n8n-appdata/appointments.json', JSON.stringify(data, null, 2));

return [{ json: { appointment, code } }];
```

---

### TÂCHE 7 : Ajouter `appointment_reschedule_confirm` Event (30 min)

**Nouveau case dans le router** :

```
[IF event == "appointment_reschedule_confirm"]
  ↓
  [Code: Lookup appointment by ID]
  ↓
  [Check Outlook: still available?]
  ↓
  [IF still available?]
    ├─→ YES: Update appointment.json → status "confirmé", new date
    ├─→ Send confirmation email
    └─→ HTTP 200 { status: "confirmé" }
  └─→ NO: Generate 3 NEW alternatives
       → Send email with new alternatives
       → HTTP 200 { status: "en attente reprogrammation" }
```

---

### TÂCHE 8 : Modifier `visitor_arrival_confirmed` (10 min)

**Remplacer la logique** :

```javascript
// Get code from payload
const code = items[0].json.code;

// Lookup appointment
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/home/node/.n8n-appdata/appointments.json', 'utf-8'));
const appointment = data.appointments.find(a => a.validation_code === code);

// CHECK STATUS
if (!appointment) {
  return [{ json: { error: 'Appointment not found' }, statusCode: 404 }];
}

if (appointment.status !== 'confirmé') {
  return [{ json: { error: 'Appointment not confirmed: ' + appointment.status }, statusCode: 409 }];
}

// Mark as arrived
appointment.arrivedAt = new Date().toISOString();
fs.writeFileSync('/home/node/.n8n-appdata/appointments.json', JSON.stringify(data, null, 2));

// Send notification (unchanged from v1)
// ... email to commercial, site_manager, etc.

return [{ json: { accepted: true, message: 'Arrival confirmed' } }];
```

---

### TÂCHE 9 : Ajouter Cron Job `appointment_monitor` (15 min)

**Nouveau workflow** :

```
[Cron: 0 22 * * * (every night 22:00)]
  ↓
  [Code: Read appointments.json]
  ↓
  [FOR EACH appointment.status == "confirmé"]
    ├─→ [Check Outlook: still available?]
    ├─→ [IF NOT available anymore]
    │   ├─→ Update status → "risque_unavailability"
    │   ├─→ [Send Email] Alert to admin
    │   └─→ [Send Email] Optional to visitor
    └─→ [IF OK] → silent (no action)
```

---

### TÂCHE 10 : Tests (2h)

**Test A** : POST appointment_requested with client email + dispo date
- Expected : HTTP 200, status "confirmé", code + QR in email ✅

**Test B** : POST appointment_requested with client email + indispo date
- Expected : HTTP 200, status "en attente reprogrammation", 3 alternatives in email ✅

**Test C** : POST appointment_reschedule_confirm with alternative date
- Expected : HTTP 200, status "confirmé", new outlook event ✅

**Test D** : POST visitor_arrival_confirmed with non-confirmed code
- Expected : HTTP 409, error message ✅

**Test E** : POST visitor_arrival_confirmed with confirmed code
- Expected : HTTP 200, notification sent ✅

**Test F** : Run appointment_monitor cron manually
- Simulate calendar change
- Expected : Alert email sent ✅

---

## RÉSUMÉ

| Tâche | Fichier/Node | Effort |
|-------|---|---|
| 1 | `/home/aminta/isaac-app-data/clients.json` | 5 min |
| 2 | n8n: `lookupCrmByEmail` | 10 min |
| 3 | n8n: `checkOutlookAvailability` | 15 min |
| 4 | n8n: `generateAlternativeDates` | 20 min |
| 5 | n8n: `buildEmailHtml` | 15 min |
| 6 | n8n: `appointment_requested` router | 60 min |
| 7 | n8n: `appointment_reschedule_confirm` | 30 min |
| 8 | n8n: `visitor_arrival_confirmed` | 10 min |
| 9 | n8n: `appointment_monitor` cron | 15 min |
| 10 | Tests A-F | 120 min |

**Total : 3-4 heures**

---

**Commence par TÂCHE 1. 🚀**
