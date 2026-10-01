import { synthetiser } from "./audioService";

/* Combler le silence pendant qu'Isaac cherche — sans faire semblant.

   LE PROBLÈME. Entre le moment où le visiteur se tait et celui où Isaac
   répond, il ne se passe rien d'audible : la reconnaissance travaille, puis le
   modèle écrit. Deux à six secondes de silence, debout, devant une sphère qui
   tourne. C'est long, et surtout c'est muet : rien ne distingue une borne qui
   réfléchit d'une borne en panne.

   Un humain, lui, ne se tait pas pendant ce temps-là. Il souffle, il dit
   « mm », il fait savoir qu'il a entendu. C'est exactement ce que fait ce
   module.

   LA RÉSERVE, ET ELLE EST FERME. Ces sons sont émis AVANT qu'Isaac sache ce
   qui a été dit — la transcription n'est pas finie. Il ne peut donc pas dire
   « d'accord », « très intéressant » ou « je vois ce que vous voulez » : ce
   serait prétendre avoir compris une phrase qu'il n'a pas encore lue.

   Ce n'est pas une pudeur de style. Quelqu'un signale une porte forcée au
   Datacenter, et la borne répond « très intéressant » : la faute est
   irrattrapable, et elle tombe précisément dans la situation où elle coûte le
   plus cher. La règle « Isaac ne fait jamais semblant de savoir » vaut aussi
   pour les deux secondes où il ne sait rien du tout.

   On garde donc ce qui marque l'ATTENTION et le TRAVAIL EN COURS, et on écarte
   tout ce qui marque la compréhension ou le jugement.

   LA SYNTHÈSE EST FAITE D'AVANCE. Demander à Piper de dire « un instant » au
   moment où l'on a besoin de combler une attente ajouterait une attente pour
   combler une attente. Les clips sont donc fabriqués une fois, au démarrage de
   la conversation, pendant qu'Isaac prononce sa salutation — c'est-à-dire sur
   du temps déjà payé. */

/* Rendus dans l'ordre, puis en boucle. Les premiers sont les plus courts :
   c'est celui-là qu'on entend presque toujours, les suivants n'arrivent que
   sur les recherches longues. */
const CLIPS_FR = ["Hum...", "Un instant.", "Je cherche...", "Je regarde ça."];
const CLIPS_EN = ["Hmm...", "One moment.", "I'm looking...", "Let me check."];

/* Avant ce délai, on ne dit rien : une réponse servie par la table arrive en
   deux dixièmes de seconde, et la combler serait la retarder. */
const AVANT_PREMIER = 600;
/* Silence entre deux clips. Trop court, Isaac bavarde ; trop long, le vide
   revient. */
const ENTRE_DEUX = 2600;

function patiente(ms, encore) {
  return new Promise((resolve) => {
    const pas = 120;
    let passe = 0;
    const minuterie = setInterval(() => {
      passe += pas;
      if (passe >= ms || !encore()) {
        clearInterval(minuterie);
        resolve();
      }
    }, pas);
  });
}

/* Fabrique les clips une fois pour toute la conversation.

   Un échec ne casse rien : sans clips, on retombe sur le silence d'avant, qui
   est un défaut de confort et non une panne. C'est le bon ordre de priorité —
   mieux vaut une borne muette pendant qu'elle cherche qu'une borne qui refuse
   de répondre parce qu'un bruit d'attente n'a pas pu être synthétisé. */
export async function prepareAttente(langue) {
  const textes = langue === "en" ? CLIPS_EN : CLIPS_FR;
  const clips = [];
  for (const texte of textes) {
    try {
      const url = await synthetiser(texte);
      if (url) clips.push(url);
    } catch (e) {
      /* On garde ceux qui ont abouti. */
    }
  }
  return clips;
}

export function libereAttente(clips) {
  for (const url of clips || []) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      /* deja libere */
    }
  }
}

/* Démarre le comblement. Rend de quoi l'arrêter, et de quoi attendre qu'il se
   soit tu — on ne parle jamais par-dessus soi-même. */
export function comblerAttente(clips, estVivant) {
  if (!clips || !clips.length) {
    return { arreter() {}, fini: Promise.resolve() };
  }

  let actif = true;
  let lecteur = null;
  const encore = () => actif && estVivant();

  const joue = (url) =>
    new Promise((resolve) => {
      const audio = new Audio(url);
      lecteur = audio;
      const fin = () => {
        lecteur = null;
        resolve();
      };
      audio.onended = fin;
      audio.onerror = fin;
      audio.play().catch(fin);
    });

  const fini = (async () => {
    await patiente(AVANT_PREMIER, encore);
    let i = 0;
    while (encore()) {
      await joue(clips[i % clips.length]);
      i += 1;
      if (!encore()) break;
      await patiente(ENTRE_DEUX, encore);
    }
  })();

  return {
    arreter() {
      actif = false;
      /* On ne coupe PAS le clip en cours : une phrase tranchée au milieu
         s'entend comme une panne. On cesse seulement d'en lancer d'autres, et
         l'appelant attend `fini` avant de parler. */
    },
    /* Coupe net, pour les cas où il faut rendre la main tout de suite — le
       visiteur qui appuie sur « ce n'est pas ce que j'ai dit », par exemple. */
    couper() {
      actif = false;
      if (lecteur) {
        try {
          lecteur.pause();
        } catch (e) {
          /* deja arrete */
        }
        lecteur = null;
      }
    },
    fini,
  };
}
