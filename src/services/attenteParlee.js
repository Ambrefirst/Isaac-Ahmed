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

/* DES PHRASES, PAS DES INTERJECTIONS.

   Première version : « Hum... », « Un instant. », « Je cherche... », « Je
   regarde ça. » — quatre fragments courts, joués l'un après l'autre avec des
   silences entre eux. À l'écoute, cela ne ressemblait pas à quelqu'un qui
   réfléchit : cela ressemblait à une machine qui bégaie. Une synthèse vocale
   a besoin d'une phrase entière pour poser une intonation ; sur deux
   syllabes, elle n'a rien à poser, et le résultat est haché.

   On dit donc des phrases complètes, et moins souvent. Elles restent
   neutres : elles parlent de ce qu'Isaac fait, jamais de ce qu'il aurait
   compris — il n'a pas encore lu la question. */
/* Ecrites en PLUSIEURS PHRASES COURTES, et c'est volontaire : le silence ne
   s'insere qu'entre deux phrases. « Hum, un instant je vous prie » d'un seul
   tenant ne laisse aucun endroit ou respirer, quel que soit le reglage. */
/* LE HUM EST UN SON, PAS UN MOT — et Piper lit ce qu'on lui ecrit.

   Mesure du 01/10, duree de son reellement emis par graphie :

     « Hum. »     0,14 s     <- ce qui etait en place
     « Hmm. »     0,22 s
     « Mmm. »     0,56 s
     « Hmmm. »    0,76 s     (1,00 s etire)
     « Mmhmm. »   0,96 s

   Cent quarante millisecondes. Piper lisait « Hum » comme un mot d'une
   syllabe et le claquait : il n'y avait rien a entendre. Il fallait changer
   la graphie, pas le reglage.

   « Hmmm » est retenu plutot que « Mmhmm », pourtant plus long : « mm-hmm »
   veut dire oui. Isaac n'a pas encore lu la question — acquiescer serait
   exactement la faute qu'on s'interdit depuis le debut.

   Un clip peut donc etre une SUITE DE SEGMENTS, chacun a son rythme : le hum
   gagne a etre etire, la phrase qui suit perdrait a l'etre. */
const HUM_FR = [
  { texte: "Hmmm.", vitesse: 1.8, silence: 0.3 },
  { texte: "Un instant, je vous prie.", vitesse: 1.2, silence: 0 },
];
const HUM_EN = [
  { texte: "Hmmm.", vitesse: 1.8, silence: 0.3 },
  { texte: "One moment, please.", vitesse: 1.2, silence: 0 },
];

const CLIPS_FR = [HUM_FR, "Je regarde cela. Tout de suite."];
const CLIPS_EN = [HUM_EN, "I am looking into it. Right away."];

/* MESURE DU 01/10, calee sur une reference fournie.

   Premiere tentative : un memo de telephone comme cible. Mauvaise idee — un
   memo dicte contient des hesitations et de longs silences de reflexion, 64 %
   du temps. J'y ai cale Piper a 4,7 syllabes par seconde et 56 % de silence :
   plus lent et plus vide qu'il ne fallait.

   La bonne cible est une phrase PRODUITE pour etre entendue, pas une pensee
   dite a voix haute :

                            la reference   d'origine   retenu
     debit                  5,6 syll/s     7,6         5,2
     silence                38 % du temps  28 %        42 %
     pauses                 0,70 / 0,50 s  0,50 max    0,70 / 0,50 s
     dynamique              15,5 dB        17,0 dB     17,6 dB

   La structure de pauses tombe au centieme pres sur celle de la reference. La
   dynamique, elle, n'a jamais eu besoin d'etre corrigee : l'ecart entre
   passages forts et faibles etait deja celui d'une voix humaine. Ce qui
   manquait n'etait pas le timbre, c'etait le temps — et le temps se regle.

   Ces valeurs ne valent que pour l'attente. Une reponse garde le debit
   normal : la ralentir de vingt pour cent, c'est vingt pour cent d'attente en
   plus pour quelqu'un qui est debout. */
const ATTENTE_REGLAGES = { vitesse: 1.2, silence: 0.35 };

/* SECOND TEMPS : une fois la question connue.

   Pendant la transcription, Isaac ignore tout de ce qu'on lui a dit, et ses
   phrases doivent donc rester neutres. Après, c'est l'inverse : il a la
   question sous les yeux, et continuer à dire « un instant » gâche ce qu'il
   vient d'apprendre.

   Chaque phrase décrit CE QU'IL FAIT du sujet, jamais ce qu'il en penserait.
   « C'est une très belle proposition » serait charmant sur une offre de
   partenariat et grotesque sur un incident, et rien ici ne permet de
   distinguer les deux à coup sûr. Le classement est grossier ; une phrase qui
   ne juge rien ne peut pas tomber à côté.

   Le cas neutre est le défaut, et c'est voulu : un classement raté ne coûte
   alors qu'une phrase passe-partout. */
const CONTEXTE_FR = {
  /* Une alerte appelle de la gravite, pas de l'entrain. Pas de « très bien »
     ici : on ne felicite pas quelqu'un qui signale une porte forcee. */
  securite: "Je prends note. C'est important.",
  technique: "Je note votre problème. Un instant.",
  /* Vrai au moment ou c'est dit : le courriel au service commercial part
     pendant qu'Isaac parle. */
  commercial: "Très bien. Je prépare cela.",
  /* « Je regarde le parcours Rendez-vous » laissait entendre qu'Isaac allait
     consulter quelque chose. Il ne consulte rien : il le connaît, et il
     s'apprête à l'expliquer. Dire qu'on cherche ce qu'on sait déjà est une
     petite fausseté, mais c'est celle qui fait sonner faux. */
  rendezvous: "Très bien. Je vous explique.",
  renseignement: "Je vérifie cette information.",
  defaut: "Je réfléchis. Un instant.",
};
const CONTEXTE_EN = {
  securite: "I am noting this. It matters.",
  technique: "I am noting your problem. One moment.",
  commercial: "Very well. I am preparing that.",
  rendezvous: "Very well. Let me explain.",
  renseignement: "I am checking that information.",
  defaut: "I am thinking. One moment.",
};

/* Les clefs attendues, declarees ici pour pouvoir etre VERIFIEES. Ajouter une
   intention dans relaisHumain.js sans lui donner de phrase ne casserait rien
   de visible : on retomberait sur le cas neutre, en silence, et personne ne
   s'en apercevrait avant d'avoir trouve la borne fade. */
export const INTENTIONS_ATTENDUES = [
  "securite", "technique", "commercial", "rendezvous", "renseignement", "defaut",
];

/* Avant ce délai, on ne dit rien : une réponse servie par la table arrive en
   deux dixièmes de seconde, et la combler serait la retarder. */
const AVANT_PREMIER = 700;
/* Silence entre deux phrases. Assez long pour que la seconde n'ait pas l'air
   de poursuivre la première. */
const ENTRE_DEUX = 3400;

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
  const contextes = langue === "en" ? CONTEXTE_EN : CONTEXTE_FR;

  const fabrique = async (texte) => {
    try {
      return await synthetiser(texte, { ...ATTENTE_REGLAGES, langue });
    } catch (e) {
      return null;
    }
  };

  const clips = [];
  for (const texte of textes) {
    const url = await fabrique(texte);
    if (url) clips.push(url);
  }

  /* Les phrases de contexte viennent APRES les neutres : ce sont les neutres
     qu'on entend a chaque echange, et elles doivent etre pretes les premieres
     si la synthese traine. */
  const selonContexte = {};
  for (const cle of Object.keys(contextes)) {
    const url = await fabrique(contextes[cle]);
    if (url) selonContexte[cle] = url;
  }

  return { clips, selonContexte };
}

/* Une seule phrase, choisie par le sujet, pendant que le modele ecrit. */
export function comblerContexte(prepare, intention, estVivant) {
  const table = (prepare && prepare.selonContexte) || {};
  const url = table[intention || "defaut"] || table.defaut;
  if (!url) return { arreter() {}, couper() {}, fini: Promise.resolve() };
  return comblerAttente([url], estVivant);
}

export function libereAttente(prepare) {
  const clips = Array.isArray(prepare)
    ? prepare
    : [...((prepare && prepare.clips) || []),
       ...Object.values((prepare && prepare.selonContexte) || {})];
  for (const url of clips) {
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

  /* La boucle est FINIE. Elle tournait tant qu'on cherchait : sur une
     recherche de quinze secondes, le visiteur entendait six fragments
     d'affilée et croyait la borne bloquée. Deux phrases suffisent à dire
     « je m'en occupe » ; au-delà, c'est le compteur à l'écran qui informe,
     et il le fait sans parler. */
  const fini = (async () => {
    await patiente(AVANT_PREMIER, encore);
    for (let i = 0; i < clips.length && encore(); i += 1) {
      await joue(clips[i]);
      if (i + 1 < clips.length) await patiente(ENTRE_DEUX, encore);
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
