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

/* `mode` vaut "vocal" quand la reponse sera lue a voix haute. Le workflow
   ajoute alors une consigne de brievete : une reponse longue est acceptable a
   l'ecrit, ou on la survole, mais pas a l'oral, ou l'on attend debout. */
/* Cinq minutes. Une reponse documentaire demande de cent a cent soixante-
   quinze secondes sur cette machine ; au-dela du double, ce n'est plus une
   machine lente, c'est un appel qui ne reviendra pas. Sans ce delai, la
   conversation parlee restait bloquee indefiniment — 6977 secondes mesurees
   a la borne le 01/10. */
export const DELAI_REPONSE = 300000;

export async function askIsaac(message, history = [], lang = "fr", signal, mode = null) {
  const webhookUrl = process.env.REACT_APP_N8N_CHAT_WEBHOOK;
  if (!webhookUrl) return fallbackAnswer(message);

  /* Deux facons d'arreter, et il faut les deux : le signal de l'appelant —
     le bouton « ce n'est pas ce que j'ai dit » — sert a renoncer, le delai
     sert a ne pas attendre l'impossible. */
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_REPONSE);
  const relai = signal ? () => arret.abort() : null;
  if (signal) signal.addEventListener("abort", relai);

  let response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "visitor_question", message, history, lang, mode, sessionId: getSessionId() }),
      signal: arret.signal,
    });
  } catch (e) {
    /* Une annulation du visiteur reste une annulation : le crochet vocal la
       reconnait a son nom et n'affiche rien. Le delai, lui, est une panne et
       doit se dire. */
    if (signal && signal.aborted) throw e;
    if (e && e.name === "AbortError") throw new Error("Isaac n'a pas pu répondre pour le moment.");
    throw e;
  } finally {
    clearTimeout(minuterie);
    if (signal) signal.removeEventListener("abort", relai);
  }
  if (!response.ok) throw new Error("Isaac n'a pas pu répondre pour le moment.");
  const { answer } = await response.json();
  return answer;
}

/* Prevenir un service pendant que la conversation continue.

   A l'ecrit, la mise en relation est un BOUTON : la proposition s'affiche, le
   visiteur decide. A l'oral, ce bouton n'existe pas — on ne fait pas cliquer
   quelqu'un qui parle — et le formulaire non plus : demander un nom, une
   entreprise et un besoin a voix haute, comme la borne le faisait le 30/09,
   transforme une question en interrogatoire, et ne produit RIEN si le visiteur
   s'en va avant la fin.

   Ici l'action se fait donc en arriere-plan : le service concerne recoit la
   demande telle qu'elle a ete posee, pendant qu'Isaac repond. Le visiteur n'a
   rien a remplir, et l'equipe a de quoi rappeler.

   `service` designe un SERVICE, jamais une personne : une demande de devis va
   au service commercial, pas a un commercial nomme qui peut etre absent.
   `contact` est facultatif — il porte ce que le visiteur a bien voulu laisser.

   Best-effort par construction : la fonction ne leve pas. Une notification qui
   echoue ne doit pas interrompre une conversation parlee, ou le visiteur
   entendrait une panne a la place d'une reponse. */
export async function prevenirService(question, { service, surPlace = true, mode = null, contact = null } = {}) {
  const webhookUrl = process.env.REACT_APP_N8N_NOTIFICATION_WEBHOOK;
  if (!webhookUrl) return false;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "chat_escalate",
        question,
        surPlace,
        service,
        mode,
        contact,
        sessionId: getSessionId(),
      }),
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

export async function escalateToStaff(question, surPlace = true) {
  const webhookUrl = process.env.REACT_APP_N8N_NOTIFICATION_WEBHOOK;
  if (!webhookUrl) return { accepted: true };
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    /* `surPlace` dit a l'equipe si la personne attend dans le hall ou si elle
       consulte la borne a distance : la conduite a tenir n'est pas la meme. */
    body: JSON.stringify({ event: "chat_escalate", question, surPlace, sessionId: getSessionId() }),
  });
  if (!response.ok) throw new Error("Impossible de prévenir l'équipe pour le moment.");
  return response.json();
}
