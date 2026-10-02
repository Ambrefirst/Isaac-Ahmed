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

   Trois façons de le reconnaître, et une seule suffit :

   1. LA DEMANDE elle-même est commerciale : un devis, une cotation, un prix,
      une envie de souscrire, une demande de parler à un commercial.

   2. ISAAC L'A ANNONCÉ. Plusieurs réponses validées se terminent par « je
      peux transmettre votre demande à notre équipe commerciale » — celle des
      tarifs, celle de la colocation, celles de la section 12 de la base.
      C'est une promesse faite au visiteur à voix haute. Sans ce test, elle
      était tenue une fois sur deux : le courriel partait quand la QUESTION
      contenait le mot « prix », et pas quand c'était la RÉPONSE qui
      proposait le relais. Un visiteur de colocation à qui Isaac disait
      « je transmets » repartait sans que personne ne soit prévenu.

   3. ISAAC AVOUE ne pas savoir, ET la question portait sur quelque chose que
      ST DIGITAL vend. Ce test compte autant que les autres : sans lui,
      « je ne dispose pas de cette information » sur les horaires du parking
      déclencherait un courriel au service commercial. */

/* Les tournures par lesquelles Isaac annonce lui-même le relais commercial.
   Elles sont tirées des réponses validées, où elles sont écrites mot pour
   mot : on lit ce qu'il a réellement dit, on ne le devine pas.

   LE MOT « COMMERCIAL » NE SUFFIT PAS. « Le service commercial est ouvert de
   8h à 17h » le contient et n'annonce rien du tout. Ce qu'on cherche, c'est
   une PROMESSE : transmettre, faire suivre, ou se tenir à disposition. Sans
   cette exigence, toute réponse qui nomme le service enverrait un courriel,
   et un service qui reçoit ce qui ne le concerne pas cesse vite de lire. */
/* La promesse, et celui à qui elle renvoie. Les deux doivent se trouver dans
   la MÊME phrase — d'où le `[^.?!]` entre eux : « Nos tarifs dépendent de
   votre besoin. Le service commercial est ouvert de 8h à 17h. » contient les
   deux mots et ne promet rien.

   Et dans LES DEUX ORDRES. La réponse de la colocation dit « ...avec notre
   équipe commerciale : je peux lui transmettre votre demande » : le verbe y
   vient après, et un seul sens de lecture laissait passer exactement la
   réponse pour laquelle ce signal a été écrit. */
const PROMESSE = "(transmets|transmettre|transmettrai|transmise?|faire\\s+suivre|fais\\s+suivre"
  + "|signale|signaler|pr[ée]viens|pr[ée]venir|mettre\\s+en\\s+relation"
  + "|pass\\w*\\s+(?:your\\s+request|it|this)|forward\\w*|notif\\w+)";
/* Pas de \b après « spécialisé » : il se termine par un caractère accentué,
   et en JavaScript la frontière de mot attendue après lui n'existe jamais.
   C'est le piège du cas 15 du catalogue des échecs silencieux. */
const CIBLE = "([ée]quipe\\s+commerciale|service\\s+commercial|[ée]quipe\\s+sp[ée]cialis"
  + "|sales\\s+team|\\bcommercial\\b)";
const ANNONCES_DE_RELAIS = [
  new RegExp(PROMESSE + "[^.?!]{0,80}" + CIBLE, "i"),
  new RegExp(CIBLE + "[^.?!]{0,80}" + PROMESSE, "i"),
  /* « L'équipe commerciale se tient à votre disposition. » C'est le cas
     demandé le 30/09 : quand le besoin n'appelle pas de rendez-vous, Isaac
     dit simplement qu'un commercial est disponible — et c'est précisément là
     qu'un courriel doit partir, sans quoi personne ne sait que quelqu'un
     attend. */
  new RegExp(CIBLE + "[^.?!]{0,40}(se\\s+tien\\w+|est|sont|reste\\w*|demeure\\w*)\\s+[àa]\\s+(votre|sa|leur)\\s+disposition", "i"),
  new RegExp("[àa]\\s+votre\\s+disposition[^.?!]{0,40}" + CIBLE, "i"),
  /\bsales\s+team\b[^.?!]{0,40}(is\s+)?(at\s+your\s+disposal|available|happy\s+to)/i,
];

export function annonceRelaisCommercial(reponse) {
  return ANNONCES_DE_RELAIS.some((motif) => motif.test(reponse || ""));
}

/* OUI, NON, OU RIEN DE CLAIR.

   Rend true, false, ou null quand la phrase ne tranche pas. Le null compte
   autant que les deux autres : devant une reponse qu'on n'a pas comprise,
   on ne transmet pas et on ne refuse pas — on laisse la phrase suivre son
   chemin normal, et le visiteur repose sa question comme il l'entend.

   Les deux motifs sont ancres au DEBUT : « non merci, mais combien ca
   coute ? » commence par un refus et n'en est pas un. Un visiteur qui
   developpe repart vers le modele, ce qui est le bon endroit. */
const OUI = /^\s*(oui|ouais|yes|yep|yeah|ok|okay|d'?accord|daccord|volontiers|avec plaisir|je veux bien|allez-?y|allez y|vas-?y|bien s[uû]r|carr[ée]ment|s'?il vous pla[iî]t|please|sure|go ahead|yes please)\b[\s.!,]*$/i;
const NON = /^\s*(non|no|nope|pas besoin|pas la peine|non merci|no thanks|not now|plus tard|later|laissez tomber|ce n'?est pas la peine)\b[\s.!,]*$/i;

/* EST-CE UNE TENTATIVE D'ADRESSE, OU UNE AUTRE QUESTION ?

   On ne le sait pas avec certitude, et on n'en a pas besoin : il suffit
   de distinguer ce qui RESSEMBLE a une adresse ratee d'une vraie question
   posee pendant que le champ est ouvert.

   Une tentative d'adresse est courte, sans point d'interrogation et sans
   mot interrogatif. Une question en a presque toujours au moins un. En cas
   de doute, on laisse passer : renvoyer quelqu'un corriger une adresse
   alors qu'il posait une question est pire que l'inverse. */
const INTERROGE = /\?|\b(qui|que|quoi|quel|quelle|quels|quelles|o[uù]|quand|comment|combien|pourquoi|est-ce|puis-je|pouvez|avez|faites|proposez|what|where|when|how|why|who|can|could|do you|are you)\b/i;

export function tentativeAdresse(texte) {
  const t = String(texte || "").trim();
  if (!t) return false;
  if (INTERROGE.test(t)) return false;
  return t.split(/\s+/).filter(Boolean).length <= 6;
}

export function accordDonne(texte) {
  const t = String(texte || "").trim();
  if (!t) return null;
  if (OUI.test(t)) return true;
  if (NON.test(t)) return false;
  return null;
}

export function relaisCommercial(question, reponse) {
  if (besoinCommercial(question)) return true;
  if (annonceRelaisCommercial(reponse)) return true;
  return avoueIgnorer(reponse) && OBJETS_VENDABLES.test(question || "");
}

/* Ce que le visiteur a bien voulu laisser pour être rappelé.

   Rien n'est obligatoire : l'équipe est prévenue avec ou sans, et c'est le
   point de toute la manœuvre. Mais si la phrase contient un numéro ou une
   adresse, la transmettre transforme un signalement en rappel possible.

   La reconnaissance vocale écrit les chiffres en chiffres, espacés par deux
   ou par trois selon la diction : on recolle avant de compter. En deçà de
   huit chiffres ce n'est pas un numéro — c'est une date, un étage ou un prix. */
/* Une adresse électronique DICTÉE ne s'écrit pas comme une adresse tapée.

   « ambre arobase s t point digital » : la reconnaissance rend les mots, pas
   les signes, et sépare les lettres épelées. Chercher un `@` dans ce texte ne
   trouve rien — et c'est tout le problème, parce qu'à la borne on parle, on ne
   tape pas. Promettre un courriel sans pouvoir noter l'adresse serait une
   promesse creuse.

   On recompose donc avant de chercher : les signes dits en toutes lettres
   redeviennent des signes, et les lettres épelées se recollent. « s t point
   digital » redevient « st.digital ». */
function recomposeAdresse(texte) {
  let t = String(texte || "").toLowerCase();
  t = t.replace(/\s*(?:arobase|arrobase|at)\s*/g, "@");
  t = t.replace(/\s*(?:point|dot)\s*/g, ".");
  t = t.replace(/\s*(?:tiret|trait d'union|dash)\s*/g, "-");
  t = t.replace(/\s*(?:underscore|tiret bas|souligne)\s*/g, "_");
  /* Les lettres épelées une à une se recollent. On répète tant qu'il en
     reste : une seule passe ne recollerait que les paires. */
  for (let i = 0; i < 12; i += 1) {
    const avant = t;
    t = t.replace(/\b([a-z])\s+(?=[a-z]\b)/g, "$1");
    if (t === avant) break;
  }
  return t;
}

export function contactDit(texte) {
  const t = String(texte || "");

  const courriel = t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (courriel) return courriel[0];

  /* Rien d'écrit : peut-être a-t-elle été dite. */
  const dicte = recomposeAdresse(t).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  if (dicte) return dicte[0];

  const suite = t.match(/(?:\+?\d[\d\s.-]{7,}\d)/);
  if (suite) {
    const chiffres = suite[0].replace(/\D/g, "");
    if (chiffres.length >= 8 && chiffres.length <= 15) return chiffres;
  }
  return null;
}

/* DE QUOI PARLE-T-ON ? — reconnaissance grossière, et assumée comme telle.

   Sert uniquement à choisir ce qu'Isaac dit PENDANT qu'il cherche. Une fois la
   question transcrite, il sait de quoi il s'agit : lui faire répéter « hum »
   serait gâcher ce qu'il vient d'apprendre.

   Trois précautions, parce qu'une erreur de classement s'entend.

   Les motifs sont ceux qui servent déjà ailleurs, pas des nouveaux : un
   second jeu de règles finirait par diverger du premier, et personne ne
   saurait lequel fait foi.

   Chaque phrase décrit CE QU'ISAAC FAIT, jamais ce qu'il penserait de la
   demande. « C'est une très belle proposition » serait charmant sur une offre
   de partenariat et grotesque sur un incident ; et rien ici ne permet de
   distinguer les deux à coup sûr.

   Le défaut est le cas neutre. Un classement raté ne doit coûter qu'une
   phrase passe-partout, jamais une phrase à côté.

   L'ANGLAIS A LES MÊMES DROITS. Les motifs n'étaient écrits qu'en français :
   un visiteur anglophone tombait donc toujours sur la phrase passe-partout,
   quoi qu'il dise. Les six intentions avaient pourtant leur phrase anglaise
   dans attenteParlee.js — cinq d'entre elles n'étaient jamais atteintes. */
export function intentionApparente(question) {
  const t = String(question || "");
  /* Pas de \b apres « é » : en JavaScript un caractere accentue n'est pas un
     caractere de mot, et la frontiere attendue apres lui n'existe jamais. Les
     formes verbales sont donnees en entier plutot que suffixees — « forcer »
     ne se deduit pas de « forcé ». */
  if (/\b(alerte|intrusion|forc(er|ée?|ant)|effraction|suspect|incident|urgence)/i.test(t)
      || /\b(alarm|intrusion|break[- ]?in|broke in|forced|suspicious|incident|emergency|theft|stolen)\b/i.test(t)) {
    return "securite";
  }
  if (/\b(panne|bug|hors service|support)\b|ne (marche|fonctionne) plus|probl[èe]me technique/i.test(t)
      || /\b(outage|bug|down|broken|not working|technical (problem|issue)|support)\b|doesn'?t work/i.test(t)) {
    return "technique";
  }
  /* Le commercial en anglais : on lit la QUESTION, parce que le second
     signal — ce qu'Isaac annonce — n'a pas encore été dit au moment où l'on
     choisit la phrase d'attente. */
  if (besoinCommercial(t)
      || /\b(price|pricing|cost|costs|quote|quotation|how much|subscribe|rate card|fees?)\b/i.test(t)) {
    return "commercial";
  }
  /* « rendez-vous » s'ecrit avec un trait d'union neuf fois sur dix, et le
     motif ne l'acceptait pas. */
  if (/\b(rendez[ -]?vous|rdv|invitation|visite)\b/i.test(t)
      || /\b(appointment|meeting|invitation|visit|tour)\b/i.test(t)) {
    return "rendezvous";
  }
  /* Pas de frontiere de mot FINALE : « où », « situé » et « fermé » se
     terminent par un caractere accentue, et la frontiere attendue apres lui
     n'existe pas en JavaScript. Ces trois formes ne correspondaient donc
     jamais. « où » recoit une garde explicite a la place, sans quoi le motif
     trouverait « ou » dans « oublier ». */
  if (/\bo[uù](?![a-z\u00e0-\u00ff])|\badresse|\bsitu[ée]|\bhoraire|\bouvert|\bferm[ée]|\bt[ée]l[ée]phone|\bcontact/i.test(t)
      || /\b(where|address|located|location|opening|hours|open|closed|phone|contact)\b/i.test(t)) {
    return "renseignement";
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
