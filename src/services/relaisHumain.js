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

/* Parmi les sujets réservés, ceux qui appellent le SERVICE COMMERCIAL.

   Tous ne s'y adressent pas : une disponibilité de baies ou l'état d'un
   compte relèvent de l'exploitation, pas de la vente. On sépare donc les deux
   plutôt que d'envoyer toute demande réservée au même endroit — un service
   qui reçoit ce qui ne le concerne pas cesse vite de lire ce qu'il reçoit.

   S'y ajoutent les marques d'intérêt commercial qui ne parlent pas d'argent :
   « je cherche une solution de sauvegarde », « on voudrait héberger nos
   serveurs ». Ce sont des clients potentiels, et personne ne les rappellera
   si la borne se contente de leur décrire le catalogue. */
const BESOINS_COMMERCIAUX = [
  /\btarifs?\b|\bprix\b|\bco[uû]ts?\b|\bdevis\b|\bcotations?\b|\btarification\b/i,
  /combien\s+(ça\s+)?(co[uû]te|cela\s+co[uû]te)|\bquel\s+est\s+le\s+montant\b/i,
  /\bremises?\b|\bn[ée]gocia|\bbudget\b|\boffres?\s+commerciale|\bproposition\s+commerciale/i,
  /\bs?['’]?abonner\b|\bsouscrire\b|\bdevenir\s+client\b|\bouvrir\s+un\s+compte\b/i,
  /\b(je|nous|on)\s+(cherche|cherchons|voudrai(?:s|ons)|aimerai(?:s|ons)|souhaite(?:rions|rais)?)[^.?!]{0,40}\b(solution|service|offre|h[ée]berge|sauvegarde|infogérance|infog[ée]rance|connectivit[ée]|cloud|baie|rack)/i,
  /\b(parler|[ée]changer|rencontrer|joindre|contacter)[^.?!]{0,20}\b(commercial|service\s+commercial|vendeur|charg[ée]\s+d['’]affaires)/i,
];

/* Ce dont on parle, quand on ne parle pas encore d'argent. Sert à décider si
   un « je ne dispose pas de cette information » relève du commercial ou d'un
   simple trou dans la base. */
const OBJETS_VENDABLES =
  /\bh[ée]berge|\bsite\s+web\b|\bcloud\b|\bserveurs?\b|\bbaies?\b|\bracks?\b|\bsauvegarde|\bbackup\b|\binfog[ée]rance\b|\bconnectivit[ée]\b|\bliaison\b|\bfibre\b|\bvpn\b|\bcolocation\b|\bdatacenter\b|\bcapacit[ée]\b|\bvolum|\babonnement\b|\bservices?\b|\boffres?\b|\bsolution/i;

export function besoinCommercial(question) {
  return BESOINS_COMMERCIAUX.some((motif) => motif.test(question || ""));
}

/* LE CAS QU'UNE BASE DOCUMENTAIRE NE PEUT PAS COUVRIR.

   « Combien coûterait l'hébergement de mon site ? » n'a pas de réponse dans
   une documentation, et n'en aura jamais : le prix dépend du volume, du
   trafic, de la durée, de ce qui existe déjà chez le client. Aucun de ces
   paramètres n'est connu de la borne, et seul un commercial est habilité à
   les mettre en face d'un montant. Chercher plus loin dans la base ne sert
   à rien — c'est une question qui se transmet, pas qui se résout.

   Deux façons de le reconnaître, et une seule suffit :

   1. LA DEMANDE elle-même est commerciale : un devis, une cotation, un prix,
      une envie de souscrire, une demande de parler à un commercial.

   2. ISAAC AVOUE ne pas savoir, ET la question portait sur quelque chose que
      ST DIGITAL vend. Le second test compte autant que le premier : sans lui,
      « je ne dispose pas de cette information » sur les horaires du parking
      déclencherait un courriel au service commercial. */
export function relaisCommercial(question, reponse) {
  if (besoinCommercial(question)) return true;
  return avoueIgnorer(reponse) && OBJETS_VENDABLES.test(question || "");
}

/* Ce que le visiteur a bien voulu laisser pour être rappelé.

   Rien n'est obligatoire : l'équipe est prévenue avec ou sans, et c'est le
   point de toute la manœuvre. Mais si la phrase contient un numéro ou une
   adresse, la transmettre transforme un signalement en rappel possible.

   La reconnaissance vocale écrit les chiffres en chiffres, espacés par deux
   ou par trois selon la diction : on recolle avant de compter. En deçà de
   huit chiffres ce n'est pas un numéro — c'est une date, un étage ou un prix. */
export function contactDit(texte) {
  const t = String(texte || "");

  const courriel = t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (courriel) return courriel[0];

  const suite = t.match(/(?:\+?\d[\d\s.-]{7,}\d)/);
  if (suite) {
    const chiffres = suite[0].replace(/\D/g, "");
    if (chiffres.length >= 8 && chiffres.length <= 15) return chiffres;
  }
  return null;
}

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
