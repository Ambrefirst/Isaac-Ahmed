/* Le routeur refuse un code pour une raison precise : rendez-vous annule, refuse,
   pas encore confirme, ou presente un autre jour que celui prevu. Chacune se
   traite differemment a l'accueil, et « impossible de verifier » les confondait
   toutes. On remonte donc le message du serveur quand il y en a un. */
async function messageDErreur(response, defaut) {
  try {
    const data = await response.json();
    if (data && data.error) return data.error;
  } catch (e) {
    /* reponse sans corps JSON : on garde le message par defaut */
  }
  return defaut;
}

export async function getVisitFromInvitation(code) {
  const webhookUrl = process.env.REACT_APP_N8N_APPOINTMENT_WEBHOOK;
  if (!webhookUrl) return { code, visitor: "Jean Dupont", company: "Entreprise Exemple", host: "Responsable ST DIGITAL", date: "20 août 2026", time: "10:30", purpose: "Rendez-vous professionnel" };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "invitation_lookup", code }),
  });
  if (response.status === 404) throw new Error("Invitation introuvable. Vérifiez le code saisi.");
  if (response.status === 403) throw new Error(await messageDErreur(response, "Ce code n'est pas utilisable aujourd'hui. Merci de vous adresser à l'accueil."));
  if (!response.ok) throw new Error("Impossible de vérifier cette invitation pour le moment.");
  return response.json();
}

/* Sortie du visiteur : le meme code, presente une seconde fois. Sans elle, le
   registre des visites ne sait jamais qui a quitte le batiment. */
export async function recordDeparture(code) {
  const webhookUrl = process.env.REACT_APP_N8N_APPOINTMENT_WEBHOOK;
  if (!webhookUrl) return { accepted: true, code, entryAt: Date.now() - 3600000, exitAt: Date.now(), durationMinutes: 60, message: "Votre sortie a été enregistrée." };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "visitor_departure", code }),
  });
  if (response.status === 404) throw new Error(await messageDErreur(response, "Aucune visite en cours pour ce code. Si vous venez d'arriver, signalez d'abord votre présence."));
  if (!response.ok) throw new Error(await messageDErreur(response, "Votre sortie n'a pas pu être enregistrée. Merci de vous adresser à l'accueil."));
  return response.json();
}

export async function submitAppointmentRequest(request) {
  const webhookUrl = process.env.REACT_APP_N8N_APPOINTMENT_WEBHOOK;
  if (!webhookUrl) return { accepted: true, request };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "appointment_requested", request }),
  });
  if (!response.ok) throw new Error("La demande de rendez-vous n'a pas pu être envoyée.");
  return response.json();
}

export const sampleAppointments = [
  { id: "STD-RDV-2026-039", host: "Responsable ST DIGITAL", date: "10 août 2026", time: "11:00", purpose: "Démonstration Cloud Souverain", status: "refusé" },
  { id: "STD-RDV-2026-041", host: "Responsable ST DIGITAL", date: "18 août 2026", time: "09:00", purpose: "Audit sécurité", status: "confirmé" },
  { id: "STD-RDV-2026-052", host: "Direction Technique", date: "25 août 2026", time: "14:30", purpose: "Visite partenaire", status: "en attente" },
];

export async function requestAppointmentsOtp(email) {
  const webhookUrl = process.env.REACT_APP_N8N_APPOINTMENTS_LOOKUP_WEBHOOK;
  if (!webhookUrl) return { sent: true };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "appointments_otp_request", email }),
  });
  if (!response.ok) throw new Error("Impossible d'envoyer le code de vérification pour le moment.");
  return response.json();
}

export async function verifyAppointmentsOtp(email, otp) {
  const webhookUrl = process.env.REACT_APP_N8N_APPOINTMENTS_LOOKUP_WEBHOOK;
  if (!webhookUrl) return { appointments: sampleAppointments, sessionToken: "dev" };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "appointments_otp_verify", email, otp }),
  });
  if (response.status === 401) throw new Error("Code invalide ou expiré. Redemandez un nouveau code.");
  if (!response.ok) throw new Error("Vérification impossible pour le moment.");
  return response.json();
}

export async function cancelAppointmentRequest(id, sessionToken) {
  const webhookUrl = process.env.REACT_APP_N8N_APPOINTMENT_CANCEL_WEBHOOK;
  if (!webhookUrl) return { accepted: true, id };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "appointment_cancelled", id, sessionToken }),
  });
  if (!response.ok) throw new Error("L'annulation n'a pas pu être transmise.");
  return response.json();
}
