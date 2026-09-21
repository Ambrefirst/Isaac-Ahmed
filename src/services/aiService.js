const fallbackAnswers = [
  "Je peux vous orienter vers la prise de rendez-vous ou vous aider à trouver le bon interlocuteur.",
  "Pour une visite, ouvrez la rubrique Rendez-vous afin de saisir votre invitation ou créer une demande.",
];

function fallbackAnswer(message) {
  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes("rendez-vous") || normalizedMessage.includes("rendez vous")) {
    return fallbackAnswers[1];
  }
  return fallbackAnswers[0];
}

const SESSION_STORAGE_KEY = "isaac_session_id";

function getSessionId() {
  let sessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

export async function askIsaac(message, history = [], lang = "fr", signal) {
  const webhookUrl = process.env.REACT_APP_N8N_CHAT_WEBHOOK;
  if (!webhookUrl) return fallbackAnswer(message);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "visitor_question", message, history, lang, sessionId: getSessionId() }),
    signal,
  });
  if (!response.ok) throw new Error("Isaac n'a pas pu répondre pour le moment.");
  const { answer } = await response.json();
  return answer;
}

export async function escalateToStaff(question) {
  const webhookUrl = process.env.REACT_APP_N8N_NOTIFICATION_WEBHOOK;
  if (!webhookUrl) return { accepted: true };
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "chat_escalate", question, sessionId: getSessionId() }),
  });
  if (!response.ok) throw new Error("Impossible de prévenir l'équipe pour le moment.");
  return response.json();
}
