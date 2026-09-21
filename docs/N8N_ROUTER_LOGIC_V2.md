# n8n Workflow Router Logic — v2 with Outlook + CRM

## Overview

This document describes the pseudocode logic for the **"Isaac - Rendez-vous"** n8n workflow router. It handles all events by dispatching to appropriate sub-workflows based on the `event` field.

---

## Workflow Structure (n8n visual)

```
[Webhook Input]
       ↓
[Parse JSON]
       ↓
[Router by Event Type]
       ├─→ appointment_requested        → [New flow A: Verify + Confirm/Propose]
       ├─→ appointment_reschedule_confirm → [Flow B: Accept reschedule]
       ├─→ invitation_lookup            → [Flow C: Lookup + Health Check]
       ├─→ appointments_otp_request     → [Flow D: Send OTP]
       ├─→ appointments_otp_verify      → [Flow E: Verify OTP]
       ├─→ appointments_lookup          → [Flow F: List appointments]
       ├─→ appointment_cancelled        → [Flow G: Cancel]
       ├─→ visitor_arrival_confirmed    → [Flow H: Notify host]
       ├─→ admin_*                      → [Admin flows]
       └─→ appointment_monitor          → [Cron monitoring]
```

---

## Flow A: `appointment_requested` (NEW v2 LOGIC)

### Input
```json
{
  "event": "appointment_requested",
  "request": {
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "jean.dupont@xyz.com",
    "phone": "+241612345678",
    "company": "Entreprise XYZ",
    "jobTitle": "Manager",
    "host": "commercial",
    "dataCenter": "libreville",
    "accessType": "visite",
    "date": "2026-09-12",
    "time": "14:00",
    "purpose": "Visite partenaire",
    "remarks": "Important client",
    "termsAccepted": true
  }
}
```

### Pseudocode

```
FUNCTION handleAppointmentRequested(event):
  
  // STEP 1: Validate basic fields
  IF NOT validate(event.request):
    RETURN error 400, "Missing required fields"
  
  // STEP 2: Extract key info
  email = event.request.email
  host_type = event.request.host           // "commercial", "technique", etc.
  data_center = event.request.dataCenter   // "libreville", "douala", "abidjan"
  requested_date = event.request.date      // "2026-09-12"
  requested_time = event.request.time      // "14:00"
  
  // STEP 3: Lookup CRM
  crm_result = await lookupCrmByEmail(email)
  visitor_type = crm_result.visitorType    // "client" or "prospect"
  assigned_commercial = crm_result.assignedCommercialEmail
  
  // STEP 4: Build list of staff to check
  IF visitor_type == "client" AND assigned_commercial:
    CASE_TYPE = "A_CLIENT_WITH_ASSIGNED"
    staff_to_check = [assigned_commercial]
    
  ELSE:
    CASE_TYPE = "B_PROSPECT_OR_NEW"
    staff_to_check = [] // Will be filled by service lookup (commercial, tech, etc.)
    
    // Lookup all staff for the requested service from staff.json
    service_staff = lookupStaffByService(host_type, data_center)
    staff_to_check = service_staff.map(s => s.email)
  
  ENDIF
  
  // STEP 5: Check Outlook availability
  site_manager_email = "manager@st.digital" // or from hosts.json
  
  IF CASE_TYPE == "A_CLIENT_WITH_ASSIGNED":
    assigned_avail = await checkOutlookAvailability(
      assigned_commercial, 
      requested_date, 
      requested_time
    )
    sm_avail = await checkOutlookAvailability(
      site_manager_email, 
      requested_date, 
      requested_time
    )
    
    any_available = assigned_avail.available
    available_staff = assigned_avail.available ? [assigned_commercial] : []
    
  ELSE:  // CASE_TYPE == "B_PROSPECT_OR_NEW"
    available_staff = []
    
    FOR each staff_email IN staff_to_check:
      avail = await checkOutlookAvailability(staff_email, requested_date, requested_time)
      IF avail.available:
        available_staff.push(staff_email)
    ENDFOR
    
    sm_avail = await checkOutlookAvailability(site_manager_email, requested_date, requested_time)
    any_available = (available_staff.length > 0)
  ENDIF
  
  // STEP 6: Make decision
  IF any_available AND sm_avail.available:
    // AUTO-CONFIRMATION PATH
    GOTO A_CONFIRM
    
  ELSE IF (any_available OR available_staff.length > 0) AND NOT sm_avail.available:
    // Site manager not available, propose alternatives
    GOTO A_PROPOSE_ALTERNATIVES
    
  ELSE IF NOT any_available:
    // Nobody available, propose alternatives
    GOTO A_PROPOSE_ALTERNATIVES
    
  ELSE IF (ERROR during Outlook checks):
    // Fallback: admin manual validation
    GOTO A_FALLBACK_ADMIN
  ENDIF

END FUNCTION
```

### Sub-paths

#### A_CONFIRM (Auto-confirmation)

```
FUNCTION A_CONFIRM:
  
  // Pick one available staff member
  IF CASE_TYPE == "A_CLIENT_WITH_ASSIGNED":
    selected_commercial = assigned_commercial
    selected_commercial_name = crm_result.assignedCommercialName
  ELSE:
    selected_commercial = available_staff[0]  // Pick first available
    selected_commercial_name = lookupStaffName(selected_commercial)
  ENDIF
  
  // Generate validation code
  validation_code = generateRandomCode(8) // "G7J56V6J"
  
  // Create Outlook event
  event_details = {
    title: "RDV " + event.request.firstName + " " + event.request.lastName + " - ST Digital",
    attendees: [selected_commercial, site_manager_email],
    start: requested_date + "T" + requested_time + ":00Z",
    end: (add 60 minutes),
    body: "Client: " + event.request.firstName + " " + event.request.lastName + 
          "\nEntreprise: " + event.request.company +
          "\nObjet: " + event.request.purpose
  }
  outlook_result = await createOutlookEvent(event_details)
  
  // Create appointment record
  appointment = {
    id: "appt_" + generateUUID(),
    status: "confirmé",
    visitor: event.request.firstName + " " + event.request.lastName,
    email: event.request.email,
    phone: event.request.phone,
    company: event.request.company,
    jobTitle: event.request.jobTitle,
    dataCenter: event.request.dataCenter,
    host: event.request.host,
    accessType: event.request.accessType,
    date: requested_date,
    time: requested_time,
    purpose: event.request.purpose,
    remarks: event.request.remarks,
    
    visitorType: visitor_type,
    assignedCommercialId: crm_result.assignedCommercialId,
    assignedCommercialName: selected_commercial_name,
    assignedCommercialEmail: selected_commercial,
    
    validation_code: validation_code,
    validation_code_generated_at: NOW(),
    qr_image_url: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + validation_code,
    
    outlookEventId: outlook_result.eventId,
    outlookAttendees: event_details.attendees,
    
    createdAt: NOW(),
    confirmedAt: NOW()
  }
  
  // Save to appointments.json
  appendToFile('/home/node/.n8n-appdata/appointments.json', appointment)
  
  // Send email to visitor
  visitor_email_body = buildEmailBody("confirmation", {
    visitorName: event.request.firstName,
    date: requested_date,
    time: requested_time,
    commercial: selected_commercial_name,
    purpose: event.request.purpose,
    code: validation_code,
    qr_url: appointment.qr_image_url
  })
  
  SEND_EMAIL(
    to: event.request.email,
    subject: "Votre rendez-vous est confirmé",
    body: visitor_email_body
  )
  
  // Send email to commercial + site manager
  SEND_EMAIL(
    to: selected_commercial,
    subject: "Vous recevrez " + event.request.firstName + " demain",
    body: "Bonjour,\n\nVous recevrez un visiteur demain :\n" +
          "Nom: " + event.request.firstName + " " + event.request.lastName + "\n" +
          "Entreprise: " + event.request.company + "\n" +
          "Heure: " + requested_time + "\n" +
          "Objet: " + event.request.purpose
  )
  
  SEND_EMAIL(
    to: site_manager_email,
    subject: "Accompagnement de visite demain",
    body: "Vous accompagnerez " + selected_commercial_name + " pour recevoir " +
          event.request.firstName + " demain à " + requested_time
  )
  
  // Return success
  RETURN 200, {
    accepted: true,
    id: appointment.id,
    status: "confirmé",
    validation_code: validation_code,
    commercial: selected_commercial_name,
    date: requested_date,
    time: requested_time,
    message: "Votre rendez-vous est confirmé. Un QR code a été envoyé."
  }

END FUNCTION
```

#### A_PROPOSE_ALTERNATIVES (Rescheduling proposal)

```
FUNCTION A_PROPOSE_ALTERNATIVES:
  
  // Determine which commercial to find alternatives for
  IF CASE_TYPE == "A_CLIENT_WITH_ASSIGNED":
    search_email = assigned_commercial
    search_name = crm_result.assignedCommercialName
  ELSE:
    search_email = available_staff[0] IF available_staff.length > 0 ELSE staff_to_check[0]
    search_name = lookupStaffName(search_email)
  ENDIF
  
  // Generate 3 alternative dates
  alternatives = await generateAlternativeDates(
    search_email,
    requested_date,
    requested_time,
    daysAhead: 30
  )
  
  // Create appointment record (status "en attente reprogrammation")
  appointment = {
    id: "appt_" + generateUUID(),
    status: "en attente reprogrammation",
    statusReason: "Assigned commercial unavailable on requested date",
    
    // ... (same fields as before)
    visitor: event.request.firstName + " " + event.request.lastName,
    email: event.request.email,
    date: requested_date,
    time: requested_time,
    
    assignedCommercialEmail: search_email,
    assignedCommercialName: search_name,
    
    alternativeDatesOffered: alternatives.map(alt => ({
      date: alt.date,
      time: alt.time,
      available: alt.available
    })),
    alternativeDatesStatus: "pending_visitor_choice",
    
    createdAt: NOW()
  }
  
  appendToFile('/home/node/.n8n-appdata/appointments.json', appointment)
  
  // Send email to visitor
  alternatives_link = "https://st.digital/rdv/confirm?apptId=" + appointment.id
  
  visitor_email_body = buildEmailBody("alternatives", {
    visitorName: event.request.firstName,
    requestedDate: requested_date,
    requestedTime: requested_time,
    alternatives: alternatives,
    reschedule_link: alternatives_link
  })
  
  SEND_EMAIL(
    to: event.request.email,
    subject: "Propositions de dates pour votre rendez-vous",
    body: visitor_email_body
  )
  
  // Notify admin
  SEND_EMAIL(
    to: "admin@st.digital",
    subject: "[RDV] Reprogrammation proposée pour " + event.request.firstName,
    body: "Un rendez-vous demandé pour " + requested_date + " a été reprogrammé.\n" +
          "Alternatives proposées :\n" +
          alternatives.map(alt => "- " + alt.date + " à " + alt.time).join("\n")
  )
  
  // Return response
  RETURN 200, {
    accepted: true,
    id: appointment.id,
    status: "en attente reprogrammation",
    message: "Cette date n'est pas disponible. Nous proposons 3 alternatives.",
    alternatives: alternatives
  }

END FUNCTION
```

#### A_FALLBACK_ADMIN (Calendar API down)

```
FUNCTION A_FALLBACK_ADMIN:
  
  appointment = {
    id: "appt_" + generateUUID(),
    status: "en attente validation manuelle",
    statusReason: "Calendar check failed - manual review required",
    
    // ... appointment fields
    createdAt: NOW(),
    
    requiresManualReview: true,
    adminActionRequired: true
  }
  
  appendToFile('/home/node/.n8n-appdata/appointments.json', appointment)
  
  // Alert admin urgently
  SEND_EMAIL(
    to: "admin@st.digital",
    subject: "⚠️ ALERTE CALENDRIER - Validation manuelle requise",
    body: "⚠️ Les calendriers Outlook ne sont pas disponibles.\n\n" +
          "Rendez-vous à valider manuellement :\n" +
          "ID: " + appointment.id + "\n" +
          "Visiteur: " + event.request.firstName + " " + event.request.lastName + "\n" +
          "Date demandée: " + requested_date + " à " + requested_time + "\n\n" +
          "Lien admin: https://st.digital/admin/appointments/" + appointment.id
  )
  
  // Notify visitor (best-effort)
  SEND_EMAIL(
    to: event.request.email,
    subject: "Votre demande de rendez-vous est en cours de validation",
    body: "Bonjour " + event.request.firstName + ",\n\n" +
          "Votre demande de rendez-vous pour le " + requested_date + " a été reçue.\n" +
          "Nous validons les disponibilités et vous confirmerons rapidement.\n\n" +
          "Merci de votre patience."
  )
  
  RETURN 200, {
    accepted: true,
    id: appointment.id,
    status: "en attente validation manuelle",
    message: "Calendrier indisponible. Validation admin en cours."
  }

END FUNCTION
```

---

## Flow B: `appointment_reschedule_confirm` (NEW)

```
FUNCTION handleRescheduleConfirm(event):
  
  appointment_id = event.appointmentId
  selected_date = event.selectedDate    // "2026-09-13"
  selected_time = event.selectedTime    // "14:00"
  
  // Lookup appointment
  appointment = readFromFile('/home/node/.n8n-appdata/appointments.json', appointment_id)
  
  IF NOT appointment:
    RETURN 404, "Appointment not found"
  ENDIF
  
  commercial_email = appointment.assignedCommercialEmail
  site_manager_email = "manager@st.digital"
  
  // RE-CHECK availability (situation may have changed)
  commercial_avail = await checkOutlookAvailability(commercial_email, selected_date, selected_time)
  sm_avail = await checkOutlookAvailability(site_manager_email, selected_date, selected_time)
  
  IF commercial_avail.available AND sm_avail.available:
    // SUCCESS: Confirm new date
    appointment.status = "confirmé"
    appointment.date = selected_date
    appointment.time = selected_time
    appointment.selectedAlternativeDate = selected_date
    appointment.alternativeDatesStatus = "accepted"
    appointment.confirmedAt = NOW()
    appointment.validation_code = generateRandomCode(8)
    appointment.qr_image_url = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + appointment.validation_code
    
    // Create Outlook event for new date
    outlook_result = await createOutlookEvent({
      title: "RDV " + appointment.visitor + " - ST Digital",
      attendees: [commercial_email, site_manager_email],
      start: selected_date + "T" + selected_time + ":00Z",
      end: (add 60 minutes),
      body: appointment.purpose
    })
    appointment.outlookEventId = outlook_result.eventId
    
    // Save updated appointment
    updateFile('/home/node/.n8n-appdata/appointments.json', appointment)
    
    // Notify visitor: confirmed
    SEND_EMAIL(
      to: appointment.email,
      subject: "Votre rendez-vous est confirmé pour le " + selected_date,
      body: "Votre rendez-vous est confirmé pour le " + selected_date + " à " + selected_time +
            "\nCode d'accès: " + appointment.validation_code +
            "\n[QR code image]"
    )
    
    RETURN 200, {
      accepted: true,
      id: appointment.id,
      status: "confirmé",
      validation_code: appointment.validation_code,
      date: selected_date,
      time: selected_time
    }
    
  ELSE:
    // FAILURE: Date became unavailable, propose new alternatives
    appointment.status = "en attente reprogrammation"
    appointment.alternativeDatesStatus = "rejected_date_unavailable"
    updateFile('/home/node/.n8n-appdata/appointments.json', appointment)
    
    new_alternatives = await generateAlternativeDates(commercial_email, selected_date, selected_time)
    
    SEND_EMAIL(
      to: appointment.email,
      subject: "Date indisponible - nouvelles propositions",
      body: "La date " + selected_date + " vient de devenir indisponible.\n" +
            "Nous proposons 3 nouvelles dates :\n" +
            new_alternatives.map(alt => "- " + alt.date + " à " + alt.time).join("\n")
    )
    
    RETURN 200, {
      accepted: false,
      id: appointment.id,
      status: "en attente reprogrammation",
      message: "Date became unavailable. New alternatives proposed.",
      alternatives: new_alternatives
    }
  ENDIF

END FUNCTION
```

---

## Flow H: `visitor_arrival_confirmed` (MODIFIED)

```
FUNCTION handleVisitorArrivalConfirmed(event):
  
  code = event.visit.code // or from payload
  
  // Lookup appointment
  appointment = readFromFile('/home/node/.n8n-appdata/appointments.json', code)
  
  IF NOT appointment:
    RETURN 404, "Appointment not found"
  ENDIF
  
  // CHECK STATUS
  IF appointment.status != "confirmé":
    RETURN 409, "This appointment is not confirmed (status: " + appointment.status + ")"
  ENDIF
  
  // Mark as arrived
  appointment.arrivedAt = NOW()
  updateFile('/home/node/.n8n-appdata/appointments.json', appointment)
  
  // Send notifications (existing logic)
  // ... (email to commercial, site manager, Teams, etc.)
  
  RETURN 200, {
    accepted: true,
    message: "Visitor arrival confirmed"
  }

END FUNCTION
```

---

## Flow: `appointment_monitor` (CRON - NEW)

**Triggered**: Every night at 22:00

```
FUNCTION handleAppointmentMonitor:
  
  all_appointments = readAllFromFile('/home/node/.n8n-appdata/appointments.json')
  
  FOR each appointment IN all_appointments WHERE appointment.status == "confirmé":
    
    commercial_email = appointment.assignedCommercialEmail
    appt_date = appointment.date
    appt_time = appointment.time
    
    // Re-check Outlook
    current_avail = await checkOutlookAvailability(commercial_email, appt_date, appt_time)
    
    // Compare with stored state
    IF NOT current_avail.available:
      // SITUATION DEGRADED
      
      appointment.status = "risque_unavailability"
      appointment.riskReason = current_avail.reason
      appointment.monitoredAt = NOW()
      
      updateFile('/home/node/.n8n-appdata/appointments.json', appointment)
      
      // Send urgent alert to admin
      SEND_EMAIL(
        to: "admin@st.digital",
        subject: "⚠️ ALERTE RDV: " + appointment.visitor,
        body: "⚠️ ALERTE CALENDRIER\n\n" +
              "Rendez-vous en risque :\n" +
              "ID: " + appointment.id + "\n" +
              "Visiteur: " + appointment.visitor + "\n" +
              "Date: " + appt_date + " à " + appt_time + "\n" +
              "Commercial: " + appointment.assignedCommercialName + "\n" +
              "Raison: " + current_avail.reason + "\n\n" +
              "Action requise: Annuler/Reschedule\n" +
              "Lien: https://st.digital/admin/appointments/" + appointment.id,
        priority: "HIGH"
      )
      
      // Optional: Notify visitor (best-effort)
      SEND_EMAIL(
        to: appointment.email,
        subject: "Notification concernant votre rendez-vous",
        body: "Bonjour " + appointment.visitor + ",\n\n" +
              "Votre rendez-vous du " + appt_date + " pourrait être affecté.\n" +
              "Nous vous contactons pour confirmer ou le reprogrammer.\n" +
              "Merci de votre compréhension.",
        priority: "NORMAL"
      )
    
    ELSE:
      // All good, no action needed (silent log)
      LOG("OK: " + appointment.id + " still available")
    
    ENDIF
  
  ENDFOR

END FUNCTION
```

---

## Implementation Notes for n8n

### 1. Code Node Setup

Each function should be placed in a separate **Code Node** (JavaScript runtime):

```javascript
// Code Node 1: CRM Lookup
const crmResult = await lookupCrmByEmail(items[0].json.request.email);
return [{ json: crmResult }];

// Code Node 2: Check Outlook Availability
const availability = await checkOutlookAvailability(
  items[0].json.commercialEmail,
  items[0].json.date,
  items[0].json.time
);
return [{ json: availability }];

// Code Node 3: Generate Alternatives
const alternatives = await generateAlternativeDates(
  items[0].json.commercialEmail,
  items[0].json.requestedDate
);
return [{ json: { alternatives } }];
```

### 2. Conditional Branching

Use **IF nodes** to branch based on results:

```
[Code: Check Outlook]
  ├─→ [IF: available] → [Code: Confirm]
  └─→ [IF: NOT available] → [Code: Propose Alternatives]
```

### 3. File Operations

Use n8n's **Set** or custom **Code** nodes with `fs` module (ensure `NODE_FUNCTION_ALLOW_BUILTIN=fs` is set):

```javascript
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/home/node/.n8n-appdata/appointments.json', 'utf-8'));
data.appointments.push(newAppointment);
fs.writeFileSync('/home/node/.n8n-appdata/appointments.json', JSON.stringify(data, null, 2));
```

### 4. Email Sending

Use n8n's built-in **Send Email** node:
- Configure SMTP credentials (Gmail or company mail)
- Template with HTML from `buildEmailBody()` helper

### 5. Cron Jobs

For `appointment_monitor`:
- Use n8n's **Cron** trigger
- Set to: `0 22 * * *` (every day at 22:00)
- Webhook workflows can't directly call this; instead use n8n's **Recurring Workflow** feature or external cron service

---

## Testing Checklist

- [ ] Create test appointment with existing client (should auto-confirm)
- [ ] Create test appointment with prospect (should auto-confirm if service staff available)
- [ ] Create test with no availability (should propose alternatives)
- [ ] Test reschedule_confirm when new date is still available
- [ ] Test reschedule_confirm when new date became unavailable (should generate new alternatives)
- [ ] Test visitor_arrival_confirmed with non-confirmed appointment (should reject)
- [ ] Run appointment_monitor cron, simulate calendar change, verify alert sent
- [ ] Test fallback when Outlook API is down
