/* Chaîne audio de la borne : reconnaissance et synthèse, toutes deux servies
   par la tour. Aucune voix ne sort de l'infrastructure — c'est la même exigence
   qui a fait retirer l'appel au générateur de QR code tiers. */

const TRANSCRIPTION = process.env.REACT_APP_AUDIO_TRANSCRIPTION;
const SYNTHESE = process.env.REACT_APP_AUDIO_SYNTHESE;

/* Vocabulaire du site, passé à la reconnaissance pour l'orienter. Mesuré sur
   dix enregistrements réels le 27/09 : il fait passer le taux d'erreur mot de
   26,9 % à 15,4 %. Il se passe en PARAMÈTRE D'URL — envoyé en champ de
   formulaire, il est accepté puis purement ignoré, sans le moindre signe. */
const AMORCE =
  "Borne d'accueil de ST Digital. Vocabulaire attendu : datacenter, Nkok, " +
  "Libreville, Douala, Grand-Bassam, Tier III, cloud souverain, colocation, " +
  "rendez-vous, Obame, Nguema.";

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
  [/\bdata\s+sain?te?[- ]?tour\b/gi, "datacenter"],
  /* Pas de \b final : en JavaScript, « é » n'est pas un caractère de mot, et la
     frontière attendue après lui n'existe donc jamais. Le motif ne trouvait
     rien, en silence. */
  [/\bdata\s+sant[ée]/gi, "datacenter"],
  [/\bgrand\s+bass?[ea]m?\b/gi, "Grand-Bassam"],
  [/\bAubame\b/g, "Obame"],
  [/\bNguma\b/gi, "Nguema"],
  [/\btier\s*(?:3|iii)\b/gi, "Tier III"],
];

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

export async function transcrire(blobAudio) {
  if (!TRANSCRIPTION) throw new Error("La reconnaissance vocale n'est pas configurée sur cette borne.");

  const wav = await versWav16k(blobAudio);
  const formulaire = new FormData();
  formulaire.append("audio_file", wav, "voix.wav");

  const url =
    TRANSCRIPTION +
    "?task=transcribe&language=fr&output=json&vad_filter=true&initial_prompt=" +
    encodeURIComponent(AMORCE);

  const reponse = await fetch(url, { method: "POST", body: formulaire });
  if (!reponse.ok) {
    /* Un 404 ne veut pas dire la meme chose qu'une panne : il signifie que la
       chaine audio n'est pas servie sur cette adresse. Le cas s'est produit en
       vrai, et « indisponible pour le moment » envoyait chercher du cote d'une
       panne passagere alors qu'il fallait changer de lien. */
    if (reponse.status === 404) {
      throw new Error(
        "La voix n'est pas disponible depuis ce lien. Ouvrez la borne par son adresse du reseau interne."
      );
    }
    throw new Error("La reconnaissance vocale est indisponible pour le moment.");
  }

  const donnees = await reponse.json().catch(() => ({}));
  const texte = (donnees.text || "").trim();

  /* Un texte vide n'est PAS un silence du visiteur : c'est le signal que le
     service n'a rien pu décoder. Les deux cas ne se ressemblent que pour la
     machine, et les confondre ferait passer une panne pour de la timidité. */
  if (!texte) throw new Error("Je n'ai rien entendu. Rapprochez-vous du micro et réessayez.");

  return corrigeTranscription(texte);
}

/* ------------------------------------------------------------- synthèse */

export async function synthetiser(texte) {
  if (!SYNTHESE) throw new Error("La synthèse vocale n'est pas configurée sur cette borne.");
  const propre = (texte || "").trim();
  if (!propre) return null;

  const reponse = await fetch(SYNTHESE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    /* Le texte part tel quel : c'est le service qui porte le dictionnaire de
       prononciation, pour que la borne et tout autre appelant disent la même
       chose du même texte. */
    body: JSON.stringify({ texte: propre }),
  });
  if (!reponse.ok) throw new Error("La synthèse vocale est indisponible pour le moment.");

  return URL.createObjectURL(await reponse.blob());
}

/* ------------------------------------------------------------ enregistreur */

/* Un petit objet plutôt qu'un lot de fonctions : l'enregistrement a un état, et
   il faut pouvoir libérer le micro même si l'utilisateur quitte l'écran en
   cours de route. Une piste laissée ouverte garde la diode du micro allumée,
   ce qui est inacceptable sur une borne d'accueil. */
export function creerEnregistreur({ surApercu, intervalleApercu = 2500 } = {}) {
  let flux = null;
  let enregistreur = null;
  let morceaux = [];
  let minuterie = null;
  let enCours = false; // une transcription d'apercu est deja partie

  /* Apercu pendant que le visiteur parle. On retranscrit a chaque fois TOUT ce
     qui a ete dit depuis le debut, et non le seul fragment nouveau : decouper
     l'audio toutes les deux secondes couperait des mots en deux, et le texte
     affiche serait pire que pas de texte du tout.

     Le cout augmente donc avec la duree. C'est assume : une question de borne
     dure quelques secondes, et si elle s'allonge les apercus s'espacent
     d'eux-memes puisqu'on n'en lance jamais deux a la fois. */
  async function apercu() {
    if (!surApercu || enCours || !morceaux.length) return;
    enCours = true;
    try {
      const partiel = new Blob(morceaux, { type: enregistreur.mimeType || "audio/webm" });
      const texte = await transcrire(partiel);
      if (enregistreur) surApercu(texte);
    } catch (e) {
      /* Un apercu qui echoue ne doit rien casser : le visiteur parle toujours,
         et la transcription finale reste a venir. */
    } finally {
      enCours = false;
    }
  }

  return {
    async demarrer() {
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
