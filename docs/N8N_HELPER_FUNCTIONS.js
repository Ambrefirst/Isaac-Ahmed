/**
 * Helper functions for n8n workflow "Isaac - Rendez-vous"
 * To be used in n8n "Code" nodes
 *
 * Usage in n8n :
 * 1. Copy these functions into separate Code nodes
 * 2. Reference them by name in the router logic
 * 3. Mount /home/aminta/isaac-app-data as volume with fs access enabled
 *    (NODE_FUNCTION_ALLOW_BUILTIN=fs,crypto,path)
 */

// ============================================================================
// 1. LOOKUP CRM - Find client or treat as prospect
// ============================================================================

async function lookupCrmByEmail(visitorEmail, crmFilePath = '/home/node/.n8n-appdata/clients.json') {
  /**
   * Lookup a visitor in the CRM by email
   *
   * Returns:
   * {
   *   found: boolean,
   *   visitorType: "client" | "prospect",
   *   assignedCommercialId: string | null,
   *   assignedCommercialName: string | null,
   *   assignedCommercialEmail: string | null,
   *   dataCenter: string | null,
   *   originalData: object
   * }
   */

  const fs = require('fs');
  const path = require('path');

  try {
    if (!fs.existsSync(crmFilePath)) {
      console.log(`CRM file not found at ${crmFilePath}, treating as prospect`);
      return {
        found: false,
        visitorType: 'prospect',
        assignedCommercialId: null,
        assignedCommercialName: null,
        assignedCommercialEmail: null,
        dataCenter: null,
        originalData: null,
        reason: 'CRM file not found'
      };
    }

    const crmData = JSON.parse(fs.readFileSync(crmFilePath, 'utf-8'));
    const client = crmData.clients?.find(c => c.email?.toLowerCase() === visitorEmail.toLowerCase());

    if (client) {
      return {
        found: true,
        visitorType: client.status || 'prospect',
        assignedCommercialId: client.assignedCommercialId || null,
        assignedCommercialName: client.assignedCommercialName || null,
        assignedCommercialEmail: client.assignedCommercialEmail || null,
        dataCenter: client.dataCenter || 'libreville',
        originalData: client,
        reason: 'Client found in CRM'
      };
    } else {
      return {
        found: false,
        visitorType: 'prospect',
        assignedCommercialId: null,
        assignedCommercialName: null,
        assignedCommercialEmail: null,
        dataCenter: null,
        originalData: null,
        reason: 'Email not in CRM'
      };
    }
  } catch (error) {
    console.error('CRM lookup error:', error.message);
    return {
      found: false,
      visitorType: 'prospect',
      assignedCommercialId: null,
      assignedCommercialName: null,
      assignedCommercialEmail: null,
      dataCenter: null,
      originalData: null,
      reason: `CRM lookup failed: ${error.message}`
    };
  }
}

// ============================================================================
// 2. CHECK OUTLOOK AVAILABILITY - Verify calendar for staff members
// ============================================================================

async function checkOutlookAvailability(staffEmail, dateRequested, timeRequested, durationMinutes = 60) {
  /**
   * Check if a staff member is available on Outlook calendar
   *
   * NOTE: This requires n8n to have Microsoft 365 Outlook OAuth credential configured
   * This is a MOCK implementation — replace with actual Outlook API call in n8n
   *
   * In real n8n workflow:
   * - Use "Microsoft Outlook Calendar" nodes to query events
   * - This function would be the POST-PROCESSING step
   *
   * Mock response format:
   * {
   *   available: boolean,
   *   reason: string | null,
   *   conflictingEvents: [{title, start, end}]
   * }
   */

  try {
    // MOCK: In real workflow, use n8n's Outlook integration
    // This is placeholder - replace with actual calendar API call

    const startTime = `${dateRequested}T${timeRequested}:00Z`;
    const endTime = new Date(new Date(`${dateRequested}T${timeRequested}:00Z`).getTime() + durationMinutes * 60000).toISOString();

    // Example: hardcoded mock data for demo
    const mockCalendar = {
      'paul@st.digital': {
        '2026-09-12': {
          busy: [
            { title: 'Reunion DG', start: '2026-09-12T10:00:00Z', end: '2026-09-12T12:00:00Z' }
          ]
        }
      }
    };

    const staffCalendar = mockCalendar[staffEmail]?.[dateRequested];
    if (!staffCalendar) {
      return { available: true, reason: null, conflictingEvents: [] };
    }

    const conflicts = staffCalendar.busy.filter(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const reqStart = new Date(startTime);
      const reqEnd = new Date(endTime);
      return !(reqEnd <= eventStart || reqStart >= eventEnd);
    });

    return {
      available: conflicts.length === 0,
      reason: conflicts.length > 0 ? `Conflict with: ${conflicts.map(c => c.title).join(', ')}` : null,
      conflictingEvents: conflicts
    };
  } catch (error) {
    console.error('Outlook check error:', error.message);
    return {
      available: false,
      reason: `Calendar check failed: ${error.message}`,
      conflictingEvents: []
    };
  }
}

// ============================================================================
// 3. GENERATE ALTERNATIVE DATES - Find 3 best alternatives
// ============================================================================

async function generateAlternativeDates(
  staffEmail,
  requestedDate,
  requestedTime = '14:00',
  daysAhead = 30,
  durationMinutes = 60
) {
  /**
   * Generate 3 alternative dates where the staff member is available
   * Prioritizes:
   * 1. Same week (if possible)
   * 2. Same time slot
   * 3. Close to originally requested date
   *
   * Returns:
   * [
   *   { date: "2026-09-13", time: "14:00", available: true },
   *   { date: "2026-09-16", time: "10:00", available: true },
   *   { date: "2026-09-19", time: "14:00", available: true }
   * ]
   */

  const alternatives = [];
  const [year, month, day] = requestedDate.split('-').map(Number);
  let current = new Date(year, month - 1, day + 1); // Start from day+1
  const endDate = new Date(year, month - 1, day + daysAhead);

  // Try different time slots (preferred times: 10:00, 14:00, 16:00)
  const preferredTimes = ['10:00', '14:00', '16:00'];
  const allowedTimes = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

  while (current <= endDate && alternatives.length < 3) {
    const dateStr = current.toISOString().split('T')[0];

    // Skip weekends
    if (current.getDay() === 0 || current.getDay() === 6) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Try preferred times first, then allowed times
    const times = alternatives.length === 0 ? preferredTimes : allowedTimes;

    for (const time of times) {
      const availability = await checkOutlookAvailability(staffEmail, dateStr, time, durationMinutes);

      if (availability.available) {
        alternatives.push({
          date: dateStr,
          time: time,
          available: true,
          reason: null
        });
        break; // Found a slot for this day, move to next day
      }
    }

    current.setDate(current.getDate() + 1);
  }

  // Fallback: if less than 3 found, add placeholders
  while (alternatives.length < 3) {
    const placeholderDate = new Date(requestedDate);
    placeholderDate.setDate(placeholderDate.getDate() + (alternatives.length * 7));
    const dateStr = placeholderDate.toISOString().split('T')[0];
    alternatives.push({
      date: dateStr,
      time: '14:00',
      available: false,
      reason: 'Unable to confirm availability for all alternatives'
    });
  }

  return alternatives.slice(0, 3);
}

// ============================================================================
// 4. CREATE OUTLOOK EVENT - Add to calendar
// ============================================================================

async function createOutlookEvent(eventDetails) {
  /**
   * Create an event on Outlook calendar
   *
   * eventDetails: {
   *   title: "RDV Jean Dupont - ST Digital",
   *   attendees: ["paul@st.digital", "manager@st.digital"],
   *   start: "2026-09-12T14:00:00Z",
   *   end: "2026-09-12T15:00:00Z",
   *   body: "Client: Jean Dupont\nEntreprise: Exemple Corp\nObjet: Visite"
   * }
   *
   * Returns: { eventId: "uuid...", created: true } or error
   *
   * NOTE: In real n8n workflow, use "Microsoft Outlook Calendar" node with CreateEvent action
   */

  try {
    // Generate a mock event ID (in real workflow, Outlook API returns this)
    const eventId = 'event_' + require('crypto').randomBytes(16).toString('hex');

    console.log('Creating Outlook event:', {
      title: eventDetails.title,
      attendees: eventDetails.attendees,
      start: eventDetails.start,
      end: eventDetails.end
    });

    // Mock response - in real n8n, this comes from Outlook API
    return {
      eventId: eventId,
      created: true,
      message: 'Event created successfully',
      outlookLink: `https://outlook.office365.com/calendar/view/event/${eventId}`
    };
  } catch (error) {
    console.error('Outlook event creation error:', error.message);
    return {
      eventId: null,
      created: false,
      message: `Failed to create event: ${error.message}`,
      outlookLink: null
    };
  }
}

// ============================================================================
// 5. SEND EMAIL - Notification helper
// ============================================================================

function buildEmailBody(type, data) {
  /**
   * Build email body based on notification type
   *
   * type: "confirmation" | "alternatives" | "alert_staff" | "reschedule_alert"
   */

  const headerStyle = `
    <div style="background: #1A4D7A; color: white; padding: 20px; text-align: center;">
      <h1>ST DIGITAL</h1>
      <p>Assistant d'accueil IA - Isaac Ahmed</p>
    </div>
  `;

  const footerStyle = `
    <div style="background: #1A4D7A; color: white; padding: 10px; text-align: center; font-size: 12px;">
      <p>SÉCURISÉ · FIABLE · SOUVERAIN</p>
      <p><a href="mailto:info@st.digital" style="color: #C8DCF0;">info@st.digital</a></p>
    </div>
  `;

  let body = '';

  if (type === 'confirmation') {
    body = `
      ${headerStyle}
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <p>Bonjour ${data.visitorName},</p>
        <p>Votre rendez-vous est <strong>confirmé</strong> !</p>
        <table style="width: 100%; margin: 20px 0; border: 1px solid #ddd;">
          <tr><td style="padding: 10px; background: #f5f5f5;"><strong>Date</strong></td><td style="padding: 10px;">${data.date}</td></tr>
          <tr><td style="padding: 10px; background: #f5f5f5;"><strong>Heure</strong></td><td style="padding: 10px;">${data.time}</td></tr>
          <tr><td style="padding: 10px; background: #f5f5f5;"><strong>Contact</strong></td><td style="padding: 10px;">${data.commercial}</td></tr>
          <tr><td style="padding: 10px; background: #f5f5f5;"><strong>Objet</strong></td><td style="padding: 10px;">${data.purpose}</td></tr>
          <tr><td style="padding: 10px; background: #f5f5f5;"><strong>Code d'accès</strong></td><td style="padding: 10px;"><strong>${data.code}</strong></td></tr>
        </table>
        <p style="text-align: center;">
          <img src="${data.qr_url}" alt="QR Code" style="width: 200px; height: 200px;" />
        </p>
        <p>À bientôt !</p>
      </div>
      ${footerStyle}
    `;
  } else if (type === 'alternatives') {
    const altList = data.alternatives
      .map((alt, i) => `<li>${alt.date} à ${alt.time}</li>`)
      .join('');

    body = `
      ${headerStyle}
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <p>Bonjour ${data.visitorName},</p>
        <p>Le créneau demandé (${data.requestedDate} à ${data.requestedTime}) n'est pas disponible.</p>
        <p><strong>Nous vous proposons 3 alternatives :</strong></p>
        <ul style="border-left: 3px solid #1A4D7A; padding-left: 20px;">
          ${altList}
        </ul>
        <p>Pour confirmer l'une de ces dates, cliquez sur le lien ci-dessous :</p>
        <p style="text-align: center;">
          <a href="${data.reschedule_link}" style="background: #2E7AB5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Confirmer une date</a>
        </p>
      </div>
      ${footerStyle}
    `;
  }

  return body;
}

// ============================================================================
// EXPORT for use in n8n Code nodes
// ============================================================================

// In n8n, after importing these functions, use like:
// const result = await lookupCrmByEmail(items[0].json.request.email);
// return [{ json: result }];

module.exports = {
  lookupCrmByEmail,
  checkOutlookAvailability,
  generateAlternativeDates,
  createOutlookEvent,
  buildEmailBody
};
