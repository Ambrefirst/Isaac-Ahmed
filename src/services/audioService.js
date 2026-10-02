/* Chaîne audio de la borne : reconnaissance et synthèse, toutes deux servies
   par la tour. Aucune voix ne sort de l'infrastructure — c'est la même exigence
   qui a fait retirer l'appel au générateur de QR code tiers. */

const TRANSCRIPTION = process.env.REACT_APP_AUDIO_TRANSCRIPTION;
const SYNTHESE = process.env.REACT_APP_AUDIO_SYNTHESE;

/* Vocabulaire du site, passé à la reconnaissance pour l'orienter. Mesuré sur
   dix enregistrements réels le 27/09 : il fait passer le taux d'erreur mot de
   26,9 % à 15,4 %. Il se passe en PARAMÈTRE D'URL — envoyé en champ de
   formulaire, il est accepté puis purement ignoré, sans le moindre signe. */
/* L'amorce n'est pas une consigne : c'est un CONTEXTE que la reconnaissance lit
   avant d'écouter. Elle y pioche des mots qu'elle sait désormais possibles, et
   cela suffit à lui faire préférer « Nkok » à « une coque » ou « Rodrigue » à
   « Rodrigues ». Un mot absent d'ici sera écrit comme il sonne.

   Trois familles, et chacune pour une raison :

   LES LIEUX ET LES OFFRES, parce qu'une borne d'accueil n'entend presque que
   cela et que ce sont des noms propres ou des termes de métier.

   LES PRÉNOMS DE L'ÉQUIPE, parce que « j'ai rendez-vous avec Rodrigue » ne
   sert à rien si le prénom ressort faux : c'est précisément le mot qui permet
   d'orienter la personne.

   ATTENTION : cette liste est un SEPTIÈME endroit où un membre de l'équipe se
   déclare.
   Ajouter quelqu'un au back-office sans l'ajouter ici ne casse rien — son
   prénom sera simplement mal entendu, en silence. Voir le tableau des six
   autres dans A_FAIRE_AVANT_MISE_EN_PRODUCTION.

   Whisper n'en retient qu'environ deux cent vingt mots : au-delà, le début est
   tronqué. On reste donc volontairement court. */
const AMORCE_FR =
  "Borne d'accueil de ST Digital, à Libreville. " +
  "Vocabulaire attendu : datacenter, Nkok, Libreville, Douala, Grand-Bassam, " +
  "Tier III, cloud souverain, colocation, hébergement, infogérance, sauvegarde, " +
  "connectivité, baie, rack, devis, cotation, tarif, rendez-vous, " +
  "code d'invitation, portes ouvertes, immeuble Cofina, boulevard Triomphal. " +
  /* LA LISTE DE NOMS EST COURTE, ET FERMÉE À L'ORGANIGRAMME. Chaque nom ajouté
     ici rend les noms voisins plus probables : le 01/10, un visiteur a dit
     « Obone » et la reconnaissance a écrit « Obame », parce qu'« Obame »
     venait d'être ajouté. Écorcher le nom de quelqu'un à un accueil est pire
     que de l'écrire comme il sonne.
     On n'y met donc que les prénoms du personnel — ceux qu'un visiteur
     prononce pour demander qui il vient voir, et qui servent à l'orienter. Le
     nom du VISITEUR, lui, n'a pas à être transcrit : Isaac ne recueille plus
     d'identité, c'est la rubrique Rendez-vous qui s'en charge. */
  "Prénoms de l'équipe : Rodrigue, Marleth, Olivia, Doviane, Daniel, Aminta.";

/* La meme chose en anglais. Une amorce francaise sur un visiteur anglophone
   n'aide pas : elle oriente la reconnaissance vers des mots qui ne seront pas
   prononces, et le vocabulaire metier — qui est la seule raison d'etre de
   cette liste — n'y figure plus dans la bonne langue. */
const AMORCE_EN =
  "ST Digital reception kiosk, in Libreville. " +
  "Expected vocabulary: datacenter, Nkok, Libreville, Douala, Grand-Bassam, " +
  "Tier III, sovereign cloud, colocation, hosting, managed services, backup, " +
  "connectivity, rack, quote, pricing, appointment, " +
  "invitation code, open day, Cofina building, Boulevard Triomphal. " +
  "Team first names: Rodrigue, Marleth, Olivia, Doviane, Daniel, Aminta.";

function amorceDe(langue) {
  return String(langue || "fr").toLowerCase().startsWith("en") ? AMORCE_EN : AMORCE_FR;
}

/* Ce que la reconnaissance entend mal sur le vocabulaire du site, et que
   l'amorce ne suffit pas à corriger. C'est le miroir exact du dictionnaire de
   prononciation posé côté synthèse : l'un écrit au moteur ce qu'il doit dire,
   l'autre rattrape ce qu'il a mal entendu.

   « Nkok » est le cas qui compte : c'est le nom du Datacenter du Gabon, donc
   le mot le plus prononcé du site, et la seule erreur qui ait résisté à toutes
   les variantes d'amorce essayées. */
const CORRECTIONS = [
  /* L'elision se traite AVANT le mot seul, sans quoi « datacenter d'une coque »
     devient « datacenter d'Nkok » : on corrige le nom et on laisse derriere une
     apostrophe qui n'a plus de raison d'etre. L'ordre de ces regles compte. */
  [/\bd(?:e\s+|['’]\s*)(?:une?|la)\s+coques?\b/gi, "de Nkok"],
  [/\b(?:une|un)\s+coques?\b/gi, "Nkok"],
  [/\bn['’ ]?kok\b/gi, "Nkok"],
  [/\bd[ée]testateur\b/gi, "datacenter"],
  /* TOUTE LA FAMILLE EN UN MOTIF. « data sainte-tour », « data sante »,
     « data sainte » tout court : trois graphies de la meme erreur, et la
     troisieme manquait — relevee le 02/10 apres la bascule en `small`, sur
     le mot le plus prononce de la borne. Aucune de ces suites n'est une
     expression francaise, le motif ne peut donc rien abimer. */
  /* `[éé]*` ET PAS `[ée]?` : « é » s'écrit de deux façons en Unicode —
     un seul caractère, ou « e » suivi d'un accent combinant. La seconde forme
  /* Trois graphies pour la meme erreur, et il en faut trois motifs : la
     classe accentuee ne se retape pas sans risque — « é » s'ecrit de deux
     facons en Unicode, et une classe qui ne contient que l'une des deux
     laisse l'accent orphelin derriere le mot corrige. Celle du milieu est
     la graphie que `small` a produite le 02/10, sur le mot le plus
     prononce de la borne. */
  [/\bdata\s+sain?te?[- ]?tour\b/gi, "datacenter"],
  [/\bdata\s+sant[ée]/gi, "datacenter"],
  [/\bdata\s+sain?te?\b/gi, "datacenter"],
  /* Pas de \b final : en JavaScript, « é » n'est pas un caractère de mot, et la
     frontière attendue après lui n'existe donc jamais. Le motif ne trouvait
     rien, en silence. */
  [/\bgrand\s+bass?[ea]m?\b/gi, "Grand-Bassam"],
  /* « Aubame » → « Obame » et « Nguma » → « Nguema » ont été retirés le
     01/10, pour la même raison que les prénoms de l'amorce : ces deux noms ne
     figurent pas à l'organigramme, et les imposer revient à écrire le nom de
     quelqu'un d'autre à la place de celui qu'on a entendu. Corriger un nom
     propre n'est légitime que vers un nom qu'on sait exister ici. */
  [/\btier\s*(?:3|iii)\b/gi, "Tier III"],
];

/* Signatures du corpus de sous-titres sur lequel la reconnaissance a ete
   entrainee. Elle les rend quand le son ne porte pas de parole : ce sont des
   generiques de fin, pas des questions d'accueil. */
const ARTEFACTS = [
  /amara\.org/i,
  /sous[- ]?titr(?:es?|age|eur)/i,
  /subtitl/i,
  /abonnez[- ]vous/i,
  /merci d['\u2019]avoir regard/i,
  /merci de votre attention/i,
  /* \u00ab Enregistr\u00e9. \u00bb \u2014 rendu tel quel le 30/09 sur la borne principale, quand
     le micro n'a capte que le bruit du hall. Ce n'est pas une question
     d'accueil, et le laisser passer a fait repondre Isaac a une phrase que
     personne n'avait dite. Le motif est ancre aux DEUX bouts : il attrape la
     transcription entiere, jamais \u00ab j'ai enregistre ma demande \u00bb. */
  /^[^a-z0-9]*enregistr(?:[\u00e9e]e?s?|ement)?[^a-z0-9]*$/i,
  /^[^a-z0-9]*(?:g[\u00e9e]n[\u00e9e]rique|musique|applaudissements?|rires?|silence|bruits?)[^a-z0-9]*$/i,
  /* Une transcription sans une seule lettre ni un seul chiffre \u2014 \u00ab ... \u00bb,
     \u00ab \u266a \u00bb, \u00ab [ ] \u00bb \u2014 ne porte aucune parole, quelle qu'en soit la forme. */
  /^[^a-z0-9]+$/i,
];

/* Mesures du 28/09 sur dix-huit enregistrements de parole reelle degradee.
   Voir l'en-tete : les seuils sont volontairement au-dela du pire cas observe. */
const SEUIL_NON_PAROLE = 0.6;
const SEUIL_VRAISEMBLANCE = -0.95;

/* Une erreur que l'appelant doit traiter autrement qu'une panne : la chaine
   fonctionne, c'est le son qui n'etait pas exploitable. Dans un cas on demande
   de repeter, dans l'autre on arrete la conversation. */
function malEntendu(message) {
  const e = new Error(message);
  e.repeter = true;
  return e;
}

export function estArtefact(texte) {
  return ARTEFACTS.some((motif) => motif.test(texte || ""));
}

/* On retient le pire segment, pas la moyenne : une phrase dont la moitie est
   inventee est inutilisable meme si l'autre moitie est nette. */
/* Pour l'apercu de dictee, on peut se permettre d'etre bien plus exigeant :
   un apercu refuse ne coute rien — le champ garde le texte precedent — alors
   qu'un apercu faux ecrit dans le champ du visiteur. Mesures du 28/09 : la
   parole reelle attenuee plafonnait a 0,247, l'extrait tronque qui a invente
   une phrase etait a 0,536. Le seuil passe entre les deux. */
const SEUIL_NON_PAROLE_APERCU = 0.4;
const SEUIL_VRAISEMBLANCE_APERCU = -0.8;

export function confianceInsuffisante(segments, strict) {
  if (!Array.isArray(segments) || !segments.length) return false;
  const nonParole = strict ? SEUIL_NON_PAROLE_APERCU : SEUIL_NON_PAROLE;
  const vraisemblance = strict ? SEUIL_VRAISEMBLANCE_APERCU : SEUIL_VRAISEMBLANCE;
  return segments.some(
    (seg) =>
      (typeof seg.no_speech_prob === "number" && seg.no_speech_prob > nonParole) ||
      (typeof seg.avg_logprob === "number" && seg.avg_logprob < vraisemblance)
  );
}

/* Chaque apercu retranscrit l'enregistrement DEPUIS LE DEBUT : le texte ne
   peut donc que s'allonger. S'il raccourcit, ou s'il ne reprend pas le debut
   du precedent, il ne decrit pas la meme parole. C'est la regle qui attrape
   les inventions qu'aucun seuil ne distingue d'une vraie phrase. */
export function apercuCoherent(precedent, nouveau) {
  const a = (precedent || "").trim();
  const b = (nouveau || "").trim();
  if (!b) return false;
  if (!a) return true;
  if (b.length < a.length * 0.8) return false;
  /* On compare sur une base normalisee : la reconnaissance change volontiers
     la ponctuation et les majuscules d'un passage a l'autre sans que la parole
     ait change. */
  const net = (x) => x.toLowerCase().replace(/[^a-z0-9\u00e0-\u00ff ]/g, "").replace(/\s+/g, " ").trim();
  const na = net(a);
  const nb = net(b);
  if (!na) return true;
  if (nb.startsWith(na)) return true;
  /* Tolerance : les derniers mots d'un apercu sont souvent repris autrement
     une fois la suite entendue. On n'exige donc pas le prefixe entier. */
  const socle = na.slice(0, Math.floor(na.length * 0.6));
  return socle.length === 0 || nb.startsWith(socle);
}

export function corrigeTranscription(texte) {
  let t = texte;
  for (const [motif, remplacement] of CORRECTIONS) t = t.replace(motif, remplacement);
  return t.trim();
}

export const audioDisponible = Boolean(TRANSCRIPTION && SYNTHESE);

/* ------------------------------------------------------------------ capture */

/* Whisper refuse silencieusement certains conteneurs audio : il répond 200 avec
   un texte vide, en quelques millisecondes. Neuf enregistrements sur dix y sont
   passés le 27/09. On ne lui envoie donc jamais ce que le navigateur a produit,
   mais toujours du WAV 16 kHz mono, seul format dont on ait vérifié qu'il passe.
   La conversion se fait ici, dans le navigateur, plutôt que sur la tour : elle
   évite d'ajouter une dépendance côté serveur, et rend le format indépendant
   de ce que MediaRecorder décide de produire selon le navigateur. */
const FREQUENCE_CIBLE = 16000;

async function versWav16k(blob) {
  const brut = await blob.arrayBuffer();
  const contexte = new (window.AudioContext || window.webkitAudioContext)();
  let decode;
  try {
    decode = await contexte.decodeAudioData(brut);
  } finally {
    contexte.close();
  }

  /* Mixage mono : la borne a un micro, et Whisper travaille en mono de toute
     façon. Envoyer de la stéréo doublerait le poids pour rien. */
  const canaux = decode.numberOfChannels;
  const longueur = decode.length;
  const mono = new Float32Array(longueur);
  for (let c = 0; c < canaux; c += 1) {
    const donnees = decode.getChannelData(c);
    for (let i = 0; i < longueur; i += 1) mono[i] += donnees[i] / canaux;
  }

  /* Rééchantillonnage linéaire. Suffisant ici : on descend vers 16 kHz depuis
     44,1 ou 48 kHz, et la parole ne porte rien d'utile au-dessus de 8 kHz. */
  const rapport = decode.sampleRate / FREQUENCE_CIBLE;
  const taille = Math.floor(longueur / rapport);
  const reduit = new Float32Array(taille);
  for (let i = 0; i < taille; i += 1) {
    const position = i * rapport;
    const bas = Math.floor(position);
    const haut = Math.min(bas + 1, longueur - 1);
    const frac = position - bas;
    reduit[i] = mono[bas] * (1 - frac) + mono[haut] * frac;
  }

  return enveloppeWav(reduit, FREQUENCE_CIBLE);
}

function enveloppeWav(echantillons, frequence) {
  const octets = echantillons.length * 2;
  const tampon = new ArrayBuffer(44 + octets);
  const vue = new DataView(tampon);
  const texte = (position, chaine) => {
    for (let i = 0; i < chaine.length; i += 1) vue.setUint8(position + i, chaine.charCodeAt(i));
  };
  texte(0, "RIFF");
  vue.setUint32(4, 36 + octets, true);
  texte(8, "WAVEfmt ");
  vue.setUint32(16, 16, true); // taille du bloc de format
  vue.setUint16(20, 1, true); // PCM entier
  vue.setUint16(22, 1, true); // un canal
  vue.setUint32(24, frequence, true);
  vue.setUint32(28, frequence * 2, true); // octets par seconde
  vue.setUint16(32, 2, true); // alignement de bloc
  vue.setUint16(34, 16, true); // bits par echantillon
  texte(36, "data");
  vue.setUint32(40, octets, true);
  for (let i = 0; i < echantillons.length; i += 1) {
    const v = Math.max(-1, Math.min(1, echantillons[i]));
    vue.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([tampon], { type: "audio/wav" });
}

/* --------------------------------------------------------- reconnaissance */

/* `langue` choisit la langue de reconnaissance ET l'amorce. Figee sur le
   francais, Whisper forcait le francais sur une phrase anglaise : il rendait
   alors des mots francais qui sonnent comme l'anglais entendu, ce qui est
   pire qu'une transcription vide — c'est du charabia qui a l'air d'une
   reponse. */
/* UN APPEL QUI NE REPOND PAS DOIT FINIR PAR ECHOUER.

   `fetch` n'a pas de delai. Si le service cesse de repondre en cours de
   route, la promesse reste en suspens pour toujours : pas d'erreur, pas de
   reponse, rien. La borne a ainsi affiche « Isaac cherche la reponse »
   pendant 6977 secondes, le 01/10.

   Les valeurs viennent de ce qu'on a mesure sur cette machine, doublees :
   la reconnaissance rend en moins de dix secondes avec le modele medium, la
   synthese est plus rapide encore. Large, parce qu'un delai trop court
   renverrait un visiteur qui allait etre servi. */
export const DELAI_TRANSCRIPTION = 120000;
export const DELAI_SYNTHESE = 60000;

/* Un `fetch` qui abandonne au bout de `delai`, avec un message qui dit ce
   qui s'est passe plutot que « Failed to fetch ». */
async function fetchAvecDelai(url, options, delai, quoi) {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), delai);
  try {
    return await fetch(url, Object.assign({}, options, { signal: arret.signal }));
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error(quoi);
    throw e;
  } finally {
    clearTimeout(minuterie);
  }
}

/* Ce que le visiteur lit quand la chaine audio tombe. Les deux langues, ou
   la panne se raconte en francais a quelqu'un qui parle anglais. */
const PANNES = {
  fr: {
    nonConfiguree: "La reconnaissance vocale n'est pas configurée sur cette borne.",
    debit: "Trop de demandes en peu de temps. Patientez quelques secondes et réessayez.",
    mauvaisLien: "La voix n'est pas disponible depuis ce lien. Ouvrez la borne par son adresse du réseau interne.",
    indisponible: "La reconnaissance vocale est indisponible pour le moment.",
    syntheseAbsente: "La synthèse vocale n'est pas configurée sur cette borne.",
    syntheseEnPanne: "La synthèse vocale est indisponible pour le moment.",
  },
  en: {
    nonConfiguree: "Speech recognition is not configured on this kiosk.",
    debit: "Too many requests in a short time. Please wait a few seconds and try again.",
    mauvaisLien: "The voice service is not available from this link. Please open the kiosk using its internal network address.",
    indisponible: "Speech recognition is unavailable at the moment.",
    syntheseAbsente: "Speech synthesis is not configured on this kiosk.",
    syntheseEnPanne: "Speech synthesis is unavailable at the moment.",
  },
};
function panne(langue, cle) {
  const table = String(langue || "fr").toLowerCase().startsWith("en") ? PANNES.en : PANNES.fr;
  return new Error(table[cle]);
}

export async function transcrire(blobAudio, { strict = false, langue = "fr" } = {}) {
  if (!TRANSCRIPTION) throw panne(langue, "nonConfiguree");

  const wav = await versWav16k(blobAudio);
  const formulaire = new FormData();
  formulaire.append("audio_file", wav, "voix.wav");

  const url =
    TRANSCRIPTION +
    "?task=transcribe&language=" +
    (String(langue || "fr").toLowerCase().startsWith("en") ? "en" : "fr") +
    "&output=json&vad_filter=true&initial_prompt=" +
    encodeURIComponent(amorceDe(langue));

  const reponse = await fetchAvecDelai(url, { method: "POST", body: formulaire },
    DELAI_TRANSCRIPTION, String(langue || "fr").toLowerCase().startsWith("en")
      ? "Speech recognition did not respond. You can try again."
      : "La reconnaissance vocale n'a pas répondu. Vous pouvez réessayer.");
  if (!reponse.ok) {
    /* Un 404 ne veut pas dire la meme chose qu'une panne : il signifie que la
       chaine audio n'est pas servie sur cette adresse. Le cas s'est produit en
       vrai, et « indisponible pour le moment » envoyait chercher du cote d'une
       panne passagere alors qu'il fallait changer de lien. */
    if (reponse.status === 429) {
      /* Trop de requetes : la surface publique limite le debit. Ce n'est pas
         une panne, et le message doit le dire pour ne pas envoyer chercher
         ailleurs. */
      throw panne(langue, "debit");
    }
    if (reponse.status === 404) {
      throw panne(langue, "mauvaisLien");
    }
    throw panne(langue, "indisponible");
  }

  const donnees = await reponse.json().catch(() => ({}));
  const texte = (donnees.text || "").trim();

  /* Un texte vide n'est PAS un silence du visiteur : c'est le signal que le
     service n'a rien pu décoder. Les deux cas ne se ressemblent que pour la
     machine, et les confondre ferait passer une panne pour de la timidité. */
  if (!texte) throw malEntendu("Je n'ai rien entendu. Rapprochez-vous du micro et réessayez.");

  /* Un générique de sous-titrage n'est pas une question : c'est ce que rend la
     reconnaissance quand elle n'a pas entendu de parole. Le laisser passer
     coûte deux minutes de recherche pour une phrase que personne n'a dite. */
  if (estArtefact(texte)) {
    throw malEntendu("Je n'ai pas entendu de parole. Rapprochez-vous du micro et réessayez.");
  }

  if (confianceInsuffisante(donnees.segments, strict)) {
    throw malEntendu("Je n'ai pas bien entendu. Pouvez-vous répéter, un peu plus près du micro ?");
  }

  return corrigeTranscription(texte);
}

/* ------------------------------------------------------------- synthèse */

/* `reglages` peut porter `vitesse` (etirement des phonemes) et `silence`
   (duree inseree entre deux phrases). Ils ne servent QUE pour les phrases
   d'attente : ralentir une reponse de trente pour cent, c'est trente pour cent
   d'attente en plus pour quelqu'un qui est debout. */
export async function synthetiser(texte, reglages) {
  if (!SYNTHESE) throw panne(reglages && reglages.langue, "syntheseAbsente");
  const propre = Array.isArray(texte) ? "" : (texte || "").trim();
  if (!propre && !Array.isArray(texte)) return null;

  const reponse = await fetchAvecDelai(SYNTHESE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    /* Le texte part tel quel : c'est le service qui porte le dictionnaire de
       prononciation, pour que la borne et tout autre appelant disent la même
       chose du même texte. */
    body: JSON.stringify(
      /* Une SUITE DE SEGMENTS plutot qu'un texte : chacun a son rythme, et le
         service les rend d'un seul tenant. C'est ce qui permet un « Hmmm »
         tenu une seconde suivi d'une phrase au debit normal — un reglage
         unique ne pouvait pas donner les deux. */
      Array.isArray(texte)
        ? { segments: texte }
        : { texte: propre, ...(reglages || {}) }
    ),
  }, DELAI_SYNTHESE, String((reglages && reglages.langue) || "fr").toLowerCase().startsWith("en")
    ? "Speech synthesis did not respond. You can try again."
    : "La synthèse vocale n'a pas répondu. Vous pouvez réessayer.");
  if (!reponse.ok) throw panne(reglages && reglages.langue, "syntheseEnPanne");

  return URL.createObjectURL(await reponse.blob());
}

/* ------------------------------------------------------------ enregistreur */

/* Un petit objet plutôt qu'un lot de fonctions : l'enregistrement a un état, et
   il faut pouvoir libérer le micro même si l'utilisateur quitte l'écran en
   cours de route. Une piste laissée ouverte garde la diode du micro allumée,
   ce qui est inacceptable sur une borne d'accueil. */
export function creerEnregistreur({ surApercu, intervalleApercu = 3000 } = {}) {
  let flux = null;
  let enregistreur = null;
  let morceaux = [];
  let minuterie = null;
  let enCours = false; // une transcription d'apercu est deja partie
  let debutEnregistrement = 0;
  let dernierApercu = ""; // pour verifier que le suivant le prolonge

  /* Apercu pendant que le visiteur parle. On retranscrit a chaque fois TOUT ce
     qui a ete dit depuis le debut, et non le seul fragment nouveau : decouper
     l'audio toutes les deux secondes couperait des mots en deux, et le texte
     affiche serait pire que pas de texte du tout.

     Le cout augmente donc avec la duree. C'est assume : une question de borne
     dure quelques secondes, et si elle s'allonge les apercus s'espacent
     d'eux-memes puisqu'on n'en lance jamais deux a la fois. */
  /* En dessous de ce seuil, la reconnaissance comble au lieu de transcrire :
     un extrait de 0,4 s de parole reelle est ressorti en « Qu'est-ce qu'il y
     a ? » le 28/09. On ne lui demande donc rien avant d'avoir de quoi
     repondre. */
  const SON_MINIMAL_APERCU = 2500;

  async function apercu() {
    if (!surApercu || enCours || !morceaux.length) return;
    if (Date.now() - debutEnregistrement < SON_MINIMAL_APERCU) return;
    enCours = true;
    try {
      const partiel = new Blob(morceaux, { type: enregistreur.mimeType || "audio/webm" });
      const texte = await transcrire(partiel, { strict: true });
      /* Chaque apercu porte sur tout l'enregistrement : il doit prolonger le
         precedent. Sinon il ne decrit pas la meme parole, et l'ecrire dans le
         champ du visiteur reviendrait a lui preter des mots. */
      if (enregistreur && apercuCoherent(dernierApercu, texte)) {
        dernierApercu = texte;
        surApercu(texte);
      }
    } catch (e) {
      /* Un apercu qui echoue ne doit rien casser : le visiteur parle toujours,
         et la transcription finale reste a venir. C'est aussi pourquoi on peut
         se permettre d'etre severe ici. */
    } finally {
      enCours = false;
    }
  }

  return {
    async demarrer() {
      debutEnregistrement = Date.now();
      dernierApercu = "";
      flux = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      morceaux = [];
      enregistreur = new MediaRecorder(flux);
      enregistreur.ondataavailable = (e) => {
        if (e.data && e.data.size) morceaux.push(e.data);
      };
      /* Le decoupage en tranches d'une seconde sert uniquement a disposer d'un
         audio exploitable avant la fin : sans lui, MediaRecorder ne rend rien
         tant qu'on ne l'a pas arrete. */
      enregistreur.start(1000);
      if (surApercu) minuterie = setInterval(apercu, intervalleApercu);
    },

    arreter() {
      return new Promise((resolve, reject) => {
        if (!enregistreur) {
          reject(new Error("Aucun enregistrement en cours."));
          return;
        }
        enregistreur.onstop = () => {
          const blob = new Blob(morceaux, { type: enregistreur.mimeType || "audio/webm" });
          this.liberer();
          resolve(blob);
        };
        enregistreur.stop();
      });
    },

    /* Le flux brut, pour brancher une mesure de niveau sonore dessus : la
       conversation parlee doit savoir quand le visiteur a fini, et personne
       n'annonce la fin de sa phrase dans une conversation. */
    flux() {
      return flux;
    },

    liberer() {
      if (minuterie) clearInterval(minuterie);
      minuterie = null;
      if (flux) flux.getTracks().forEach((piste) => piste.stop());
      flux = null;
      enregistreur = null;
      morceaux = [];
    },
  };
}
