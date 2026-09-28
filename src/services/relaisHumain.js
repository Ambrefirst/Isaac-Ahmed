/* Quand la question appelle une personne, et non un modèle.

   La proposition de mise en relation se déclenchait sur le TEMPS : passé
   dix-huit secondes d'attente, la borne offrait d'appeler quelqu'un. C'était
   répondre à la lenteur de la machine, pas au besoin du visiteur — et cela
   proposait un humain pour une question à laquelle Isaac allait très bien
   répondre, tout en n'en proposant aucun quand il répondait vite et à côté.

   Le bon critère n'est pas la durée, c'est la NATURE de la demande. Deux
   signaux, et il suffit qu'un seul se lève.

   1. LE SUJET. Certaines questions n'ont pas de réponse dans une base de
      connaissances, par construction : un tarif dépend du volume et de la
      durée, un contrat dépend de ce qui a été signé, une disponibilité dépend
      de l'état réel du site à cet instant. Y répondre depuis une
      documentation générale serait au mieux vague, au pire faux — et un prix
      annoncé par une borne d'accueil engage l'entreprise.

   2. CE QU'ISAAC DIT LUI-MÊME. La consigne système lui demande, quand
      l'information n'est pas dans le contexte, de le dire et d'orienter vers
      l'équipe. Plutôt que d'ajouter une seconde détection en parallèle, on
      lit ce qu'il fait déjà : s'il reconnaît ne pas savoir, c'est exactement
      le moment de proposer quelqu'un.

   On ne coupe jamais la réponse d'Isaac : elle s'affiche d'abord, la
   proposition vient après. Ce qu'il sait dire reste dit, et le relais
   s'ajoute au lieu de se substituer. */

/* Sujets qui engagent l'entreprise ou dépendent d'un dossier : ils demandent
   une personne habilitée, quelle que soit la qualité de la base. */
const SUJETS_RESERVES = [
  /\btarifs?\b|\bprix\b|\bco[uû]ts?\b|\bdevis\b|\btarification\b/i,
  /combien\s+(ça\s+)?(co[uû]te|cela\s+co[uû]te)|\bquel\s+est\s+le\s+montant\b/i,
  /\bremises?\b|\bn[ée]gocia|\bbudget\b|\bfactur/i,
  /\bcontrats?\b|\bengagement\b|\br[ée]siliation\b|\bsla\b|\bp[ée]nalit/i,
  /* Pas de \b apres « é » : en JavaScript un caractere accentue n'est pas un
     caractere de mot, et la frontiere attendue apres lui n'existe jamais. Le
     motif ne trouverait rien, en silence. C'est le piege du cas 15 du
     catalogue des echecs silencieux. */
  /disponibilit[ée]s?[^.?!]{0,24}\b(baies?|racks?|salle)/i,
  /\bcapacit[ée]\s+(restante|disponible)\b/i,
  /\bmon\s+(compte|dossier|contrat|abonnement|installation)\b/i,
];

/* Les tournures par lesquelles Isaac reconnaît ne pas avoir l'information.
   Elles suivent la consigne système, qui lui interdit d'inventer et lui
   demande d'orienter vers l'équipe. */
const AVEUX_D_IGNORANCE = [
  /je\s+ne\s+dispose\s+pas/i,
  /je\s+n'?ai\s+pas\s+(cette|l'|d')\s*informa/i,
  /n'?(est|sont)\s+pas\s+(pr[ée]cis|indiqu|mentionn|disponible)/i,
  /ne\s+figure(nt)?\s+pas/i,
  /je\s+ne\s+(peux|suis)\s+pas\s+(en\s+mesure\s+de\s+)?(vous\s+)?(r[ée]pondre|renseigner|donner)/i,
  /rapprochez[- ]vous\s+de/i,
  /contacter?\s+(directement\s+)?(l'|notre\s+|nos\s+)?[ée]quipes?/i,
  /je\s+vous\s+invite\s+[àa]\s+contacter/i,
];

export function sujetReserve(question) {
  return SUJETS_RESERVES.some((motif) => motif.test(question || ""));
}

export function avoueIgnorer(reponse) {
  return AVEUX_D_IGNORANCE.some((motif) => motif.test(reponse || ""));
}

/* Le motif est rendu à l'appelant, et pas seulement un booléen : l'écran ne
   dit pas la même chose selon qu'Isaac n'a pas su répondre ou que la question
   engage un devis. Un message générique ferait passer les deux pour une
   panne. */
export function relaisNecessaire(question, reponse) {
  if (sujetReserve(question)) return "reserve";
  if (avoueIgnorer(reponse)) return "ignorance";
  return null;
}
