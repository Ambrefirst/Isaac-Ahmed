export async function prepareHostNotification(visit) {
  const webhookUrl = process.env.REACT_APP_N8N_NOTIFICATION_WEBHOOK;
  if (!webhookUrl) {
    return { accepted: true, message: "Votre présence a été enregistrée. L'hôte sera prévenu par l'équipe d'accueil." };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "visitor_arrival_confirmed",
      channels: ["outlook", "teams"],
      visit,
    }),
  });
  if (!response.ok) throw new Error("La notification de l'hôte n'a pas pu être envoyée.");
  return { accepted: true, message: "Votre présence a été confirmée. L'hôte a été prévenu." };
}
