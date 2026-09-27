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
  if (!response.ok) {
    /* Le routeur refait ici les controles de statut et de date : l'arrivee est
       un appel distinct de la lecture du code. Son message est precis, il doit
       arriver jusqu'au visiteur. */
    let precis = null;
    try {
      const data = await response.json();
      precis = data && data.error;
    } catch (e) {
      /* reponse sans corps JSON */
    }
    throw new Error(precis || "La notification de l'hôte n'a pas pu être envoyée.");
  }
  const data = await response.json().catch(() => ({}));
  return {
    accepted: true,
    message: data.message || "Votre présence a été confirmée. L'hôte a été prévenu.",
    dejaPresent: data.dejaPresent === true,
  };
}
