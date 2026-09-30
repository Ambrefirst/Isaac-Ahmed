import { useCallback, useEffect, useRef, useState } from "react";
import { askIsaac, prevenirService } from "./services/aiService";
import { creerEnregistreur, synthetiser, transcrire } from "./services/audioService";
import { surPlace } from "./services/presence";
import { contactDit, relaisCommercial } from "./services/relaisHumain";

/* Conversation parlee, sans fenetre et sans fil de texte.

   Le visiteur appuie une fois, Isaac salue, et l'echange s'enchaine tout seul :
   il ecoute, repond a voix haute, puis se remet a ecouter. Personne ne touche
   plus rien. C'est ce qui distingue ce mode de la dictee : la dictee remplace
   le clavier, ici on ne tape pas du tout.

   Deux regles gouvernent ce fichier.

   La premiere : ON N'ECOUTE JAMAIS PENDANT QU'ISAAC PARLE. Sans elle, le micro
   entend la reponse, la transcrit et la renvoie : la borne boucle sur sa propre
   voix. C'est arrive, et c'est pour cela que l'enchainement est une machine a
   etats et non un va-et-vient.

   La seconde : le tour de parole se rend TOUT SEUL. Un visiteur qui parle ne
   va pas chercher un bouton pour dire qu'il a fini ; on detecte le silence. */

const SEUIL_SILENCE = 0.012;      // plancher absolu : en dessous, ce n'est de la parole nulle part
const SILENCE_POUR_FINIR = 1500;  // ms de silence avant de rendre la parole a Isaac
const PAROLE_MINIMALE = 700;      // ms de son continu en deca desquelles on ne transcrit meme pas

/* Le seuil de silence etait une valeur fixe. Dans un bureau silencieux elle
   convient ; dans un hall d'accueil, le bruit de fond la depasse a lui seul, et
   la borne croit alors entendre parler en permanence. Elle envoyait donc a la
   reconnaissance douze secondes de brouhaha, qui les rendait en « Enregistré. »
   — et Isaac repondait a une phrase que personne n'avait dite.
   On MESURE donc la salle avant d'ecouter, et on demande a la parole de
   dominer ce fond plutot que d'exister dans l'absolu. */
const CALIBRAGE = 480;            // ms de mesure du bruit ambiant, micro deja ouvert
const MARGE_SUR_BRUIT = 2.2;      // combien la voix doit depasser ce fond

/* Un seul nombre servait a deux questions differentes : « personne ne dit
   rien » et « il parle depuis trop longtemps ». Douze secondes sont trop
   courtes pour la premiere — on vient de lire une reponse a l'ecran avant de
   repondre — et elles coupaient la seconde au milieu d'une phrase commencee a
   la onzieme seconde. Ce sont deux limites, elles valent donc deux nombres. */
const ATTENTE_AVANT_PAUSE = 25000; // ms sans un mot : le micro se met en pause
const PAROLE_MAXIMALE = 40000;     // ms de parole d'affilee : on transcrit ce qu'on a

export const ETATS = {
  ARRET: "arret",
  PARLE: "parle",
  ECOUTE: "ecoute",
  REFLECHIT: "reflechit",
  /* Micro coupe, conversation gardee. Ce n'est pas ARRET : l'historique reste,
     et reprendre ne refait pas la salutation. */
  PAUSE: "pause",
};

/* Au-dela, on cesse de demander de repeter : insister ne sert plus a rien, et
   la borne doit proposer autre chose plutot que de tourner en rond. */
const ESSAIS_AVANT_ABANDON = 2;

export default function useConversationParlee({ salutation, langue = "fr", relais = {} }) {
  const [etat, setEtat] = useState(ETATS.ARRET);
  const [entendu, setEntendu] = useState("");
  const [reponse, setReponse] = useState("");
  const [erreur, setErreur] = useState("");
  /* Niveau sonore du micro, rendu a l'interface. C'est lui qui fait reagir la
     sphere pendant que le visiteur parle : sans ce retour, on a le sentiment
     de parler a un mur, et c'est exactement ce qui a ete reproche. */
  const [niveau, setNiveau] = useState(0);
  /* Cinq bandes de frequences de la voix d'Isaac pendant qu'il parle. Les
     barres de la sphere suivent ce qu'il dit reellement : une animation qui
     boucle toujours pareil se voit immediatement, et donne l'impression d'un
     decor plutot que d'une parole. */
  const [niveaux, setNiveaux] = useState([0, 0, 0, 0, 0]);
  /* Depuis quand Isaac cherche. Sur cette machine, une reponse demande une a
     deux minutes : une attente muette passe pour une panne. */
  const [attenteDepuis, setAttenteDepuis] = useState(null);

  const enregistreurRef = useRef(null);
  const lecteurRef = useRef(null);
  const analyseRef = useRef(null);
  /* Un seul contexte audio pour toute la conversation : en creer un par phrase
     finit par saturer le navigateur, qui en limite le nombre. */
  const sonRef = useRef(null);
  const vivantRef = useRef(false);
  const historiqueRef = useRef([]);
  /* Numero du tour d'ecoute en cours. Quand on reprend la parole ou qu'on
     corrige, l'ancien tour peut encore avoir une transcription ou une reponse
     en vol : sans ce compteur, elle revient ecraser le nouvel etat. */
  const tourRef = useRef(0);
  /* De quoi interrompre la recherche en cours : c'est ce qui rend le bouton
     « ce n'est pas ce que j'ai dit » immediat plutot que decoratif. */
  const requeteRef = useRef(null);
  const malEntenduRef = useRef(0);
  /* La demande commerciale deja transmise, s'il y en a une. Elle sert a deux
     choses : ne pas prevenir le service a chaque phrase d'un meme echange, et
     savoir a quelle demande rattacher un numero donne ensuite. */
  const besoinTransmisRef = useRef(null);
  /* Les phrases du relais changent de langue en cours de conversation ; on les
     lit dans une reference pour ne pas reconstruire la boucle d'ecoute a
     chaque rendu, ce qui couperait le micro. */
  const relaisRef = useRef(relais);
  relaisRef.current = relais;

  /* --- parler ------------------------------------------------------------ */
  const dire = useCallback(async (texte) => {
    if (!texte || !vivantRef.current) return;
    setEtat(ETATS.PARLE);
    try {
      const url = await synthetiser(texte);
      if (!url || !vivantRef.current) return;
      await new Promise((resolve) => {
        const audio = new Audio(url);
        audio.crossOrigin = "anonymous";
        lecteurRef.current = audio;

        /* On branche une analyse sur le son reellement joue. Les barres de la
           sphere doivent suivre l'intonation d'Isaac : quand il appuie, elles
           montent ; quand il baisse, elles retombent. Une vague qui repasse
           toujours a l'identique se reconnait tout de suite comme un decor. */
        let image = null;
        try {
          const contexte = sonRef.current || new (window.AudioContext || window.webkitAudioContext)();
          sonRef.current = contexte;
          if (contexte.state === "suspended") contexte.resume();
          const source = contexte.createMediaElementSource(audio);
          const analyseur = contexte.createAnalyser();
          analyseur.fftSize = 256;
          analyseur.smoothingTimeConstant = 0.55;
          source.connect(analyseur);
          analyseur.connect(contexte.destination);

          const spectre = new Uint8Array(analyseur.frequencyBinCount);
          /* Cinq bandes, des graves aux aigus : la voix ne bouge pas de la meme
             facon partout, et c'est ce qui rend le mouvement credible. */
          const bornes = [0, 4, 10, 20, 38, 64];
          const suivre = () => {
            if (!vivantRef.current || audio.paused || audio.ended) return;
            analyseur.getByteFrequencyData(spectre);
            const bandes = [];
            for (let b = 0; b < 5; b += 1) {
              let somme = 0;
              const debut = bornes[b];
              const fin = Math.min(bornes[b + 1], spectre.length);
              for (let i = debut; i < fin; i += 1) somme += spectre[i];
              const moyenne = somme / Math.max(1, fin - debut) / 255;
              bandes.push(Math.min(1, moyenne * 1.7));
            }
            setNiveaux(bandes);
            image = requestAnimationFrame(suivre);
          };
          image = requestAnimationFrame(suivre);
        } catch (e) {
          /* Sans analyse, la parole reste audible : on perd le mouvement,
             pas la voix. C'est le bon ordre de priorite. */
        }

        const fin = () => {
          if (image) cancelAnimationFrame(image);
          setNiveaux([0, 0, 0, 0, 0]);
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onended = fin;
        audio.onerror = fin;
        audio.play().catch(fin);
      });
    } catch (e) {
      /* Isaac muet n'arrete pas la conversation : on passe a l'ecoute. */
    }
  }, []);

  /* --- ecouter, et rendre la parole au silence --------------------------- */
  const ecouter = useCallback(async () => {
    if (!vivantRef.current) return;
    const monTour = tourRef.current + 1;
    tourRef.current = monTour;
    const courant = () => vivantRef.current && tourRef.current === monTour;
    /* On n'efface PAS ce qui vient d'etre entendu en rouvrant le micro : le
       visiteur doit pouvoir relire le dernier echange pendant qu'il prepare sa
       phrase suivante. Il sera remplace quand la prochaine sera transcrite. */
    setErreur("");
    try {
      const enregistreur = creerEnregistreur();
      enregistreurRef.current = enregistreur;
      await enregistreur.demarrer();
      setEtat(ETATS.ECOUTE);

      /* Mesure du niveau sonore en direct, pour savoir quand il a fini de
         parler. On ne peut pas s'en remettre a un bouton : dans une
         conversation, personne n'annonce la fin de sa phrase. */
      const flux = enregistreur.flux();
      const contexte = new (window.AudioContext || window.webkitAudioContext)();
      const analyseur = contexte.createAnalyser();
      analyseur.fftSize = 1024;
      contexte.createMediaStreamSource(flux).connect(analyseur);
      analyseRef.current = { contexte };

      const echantillons = new Float32Array(analyseur.fftSize);
      const debut = Date.now();
      let dernierSon = Date.now();
      let aParle = false;
      let debutParole = 0;
      /* Le fond sonore de la salle, mesure micro ouvert pendant les premieres
         centiemes de seconde. Tant qu'on le mesure, on n'ecoute pas. */
      let fond = 0;
      let seuil = SEUIL_SILENCE;

      await new Promise((resolve) => {
        const battement = setInterval(() => {
          if (!vivantRef.current) { clearInterval(battement); resolve(); return; }
          analyseur.getFloatTimeDomainData(echantillons);
          let somme = 0;
          for (let i = 0; i < echantillons.length; i += 1) somme += echantillons[i] * echantillons[i];
          const niveau = Math.sqrt(somme / echantillons.length);
          const ecoule = Date.now() - debut;

          if (ecoule < CALIBRAGE) {
            /* On retient le pire echantillon du fond, pas la moyenne : un hall
               n'est pas bruyant en continu, et c'est sa pointe qui declenche a
               tort. Le compte a rebours du silence ne court pas encore. */
            fond = Math.max(fond, niveau);
            dernierSon = Date.now();
            seuil = Math.max(SEUIL_SILENCE, fond * MARGE_SUR_BRUIT);
            return;
          }

          /* Echelle ramenee a 0..1 pour l'affichage : le seuil de silence
             correspond a 0, et on sature bien avant le maximum theorique pour
             que la sphere reagisse a une voix normale, pas seulement a un cri. */
          setNiveau(Math.min(1, Math.max(0, (niveau - seuil) / 0.08)));
          if (niveau > seuil) {
            dernierSon = Date.now();
            if (!aParle) debutParole = Date.now();
            aParle = true;
          }

          const silence = Date.now() - dernierSon;
          const duree = aParle ? dernierSon - debutParole : 0;
          /* Il a dit quelque chose d'assez long, puis s'est tu : a Isaac. */
          const finDeTour = duree >= PAROLE_MINIMALE && silence > SILENCE_POUR_FINIR;
          /* Il parle encore au bout de quarante secondes : on prend ce qu'on a
             plutot que de garder le micro ouvert indefiniment. */
          const parleTropLongtemps = aParle && Date.now() - debutParole > PAROLE_MAXIMALE;
          /* Rien n'est venu — ou seulement des bruits trop brefs pour etre une
             phrase. Dans les deux cas, on ne transcrira pas. */
          const rienNeVient = duree < PAROLE_MINIMALE && ecoule > ATTENTE_AVANT_PAUSE;
          if (finDeTour || parleTropLongtemps || rienNeVient) { clearInterval(battement); resolve(); }
        }, 120);
      });

      try { contexte.close(); } catch (e) { /* deja ferme */ }
      analyseRef.current = null;

      const blob = await enregistreur.arreter();
      if (!courant()) return;
      /* Rien d'exploitable n'a ete dit : on ne coupe pas la conversation, on met
         le micro en pause. Terminer pour un silence obligerait a tout reprendre
         depuis la salutation.
         La condition porte sur la DUREE du son, pas sur sa seule presence : une
         porte qui claque suffisait a declencher une transcription, et la
         reconnaissance rendait alors un generique de sous-titres. */
      if (!aParle || dernierSon - debutParole < PAROLE_MINIMALE) {
        setNiveau(0);
        setEtat(ETATS.PAUSE);
        return;
      }

      setNiveau(0);
      setEtat(ETATS.REFLECHIT);
      setAttenteDepuis(Date.now());
      const question = await transcrire(blob);
      if (!courant()) return;
      malEntenduRef.current = 0;
      setEntendu(question);

      /* "vocal" : le workflow ajoute alors une consigne de brievete, parce que
         cette reponse sera lue a voix haute et qu'on ne survole pas une parole. */
      const controleur = new AbortController();
      requeteRef.current = controleur;
      const dit = await askIsaac(question, historiqueRef.current, langue, controleur.signal, "vocal");
      requeteRef.current = null;
      if (!courant()) return;
      historiqueRef.current = [
        ...historiqueRef.current,
        { sender: "visitor", text: question },
        { sender: "isaac", text: dit },
      ].slice(-8);
      /* UNE DEMANDE COMMERCIALE SE TRANSMET, ELLE NE SE REMPLIT PAS.

         Un devis, une cotation, un prix sur un service : Isaac n'a pas a y
         repondre, et il n'a pas non plus a transformer la conversation en
         formulaire. Le 30/09, a la question d'un tarif, il demandait a voix
         haute le nom du visiteur et celui de son entreprise — trois echanges
         avant la moindre action, et rien du tout si la personne s'eloigne.

         L'action utile se fait donc derriere : le service commercial recoit la
         demande telle qu'elle a ete posee, pendant qu'Isaac repond. On previent
         un SERVICE et pas une personne : un commercial nomme peut etre absent,
         le service ne l'est pas. Une seule fois par conversation, sinon une
         personne qui insiste declenche cinq courriels pour un seul besoin. */
      const phrases = relaisRef.current || {};
      let aDire = dit;
      const ici = surPlace();
      const contact = contactDit(question);

      if (besoinTransmisRef.current && contact) {
        /* Il vient de laisser de quoi le rappeler : on COMPLETE le signalement
           deja parti, au lieu d'en ouvrir un second pour le meme besoin. */
        prevenirService(besoinTransmisRef.current, {
          service: "commercial", surPlace: ici, mode: "vocal", contact,
        });
        if (phrases.contactRecu) aDire = dit + " " + phrases.contactRecu;
      } else if (!besoinTransmisRef.current && relaisCommercial(question, dit)) {
        besoinTransmisRef.current = question;
        /* On n'ATTEND PAS l'envoi pour parler. Le visiteur est debout ; lui
           faire patienter une requete de plus pour une action qui ne le
           concerne pas serait payer deux fois la lenteur de la borne. Si
           l'envoi echoue, on le dit apres coup plutot que de l'avoir promis. */
        prevenirService(question, { service: "commercial", surPlace: ici, mode: "vocal" })
          .then((parti) => {
            if (!parti && courant() && phrases.transmisEchec) setErreur(phrases.transmisEchec);
          });
        const suite = ici ? phrases.transmisSurPlace : phrases.transmisADistance;
        if (suite) aDire = dit + " " + suite;
      }

      setReponse(aDire);
      setAttenteDepuis(null);

      await dire(aDire);
      if (courant()) ecouter();
    } catch (e) {
      /* Une recherche interrompue volontairement n'est pas une panne : c'est le
         visiteur qui a dit « ce n'est pas ca ». On ne lui affiche pas d'erreur. */
      if (e && e.name === "AbortError") return;
      if (!courant()) return;

      /* Mal entendu n'est pas en panne. La chaine repond, c'est le son qui
         n'etait pas exploitable : on redonne la parole au lieu de raccrocher. */
      if (e && e.repeter) {
        malEntenduRef.current += 1;
        setEntendu("");
        setAttenteDepuis(null);
        if (malEntenduRef.current <= ESSAIS_AVANT_ABANDON) {
          setErreur(e.message);
          ecouter();
          return;
        }
        malEntenduRef.current = 0;
        setErreur("Je n'arrive pas a vous entendre d'ici. Vous pouvez ecrire votre question a Isaac.");
        setEtat(ETATS.PAUSE);
        return;
      }

      /* UNE PANNE N'ARRETE PAS LA CONVERSATION, elle l'interrompt.

         Ce chemin allait a ARRET : la fenetre se refermait sur l'ecran de
         depart, l'echange etait perdu, et de la place du visiteur la borne
         s'etait fermee toute seule. C'est le defaut rapporte le 30/09, et il
         n'avait pas besoin d'une cause unique pour se produire — un service
         audio indisponible, une limite de debit, un micro pris par une autre
         page y menaient tous.
         Desormais on dit ce qui s'est passe et on laisse « Reprendre la
         parole » a portee de main. Seul le visiteur termine. */
      setNiveau(0);
      setAttenteDepuis(null);
      setErreur(e.message);
      setEtat(ETATS.PAUSE);
    }
  }, [dire, langue]);

  /* --- ouverture et fermeture -------------------------------------------- */
  const demarrer = useCallback(async () => {
    vivantRef.current = true;
    malEntenduRef.current = 0;
    setEntendu("");
    setReponse("");
    setErreur("");
    historiqueRef.current = [];
    besoinTransmisRef.current = null;
    await dire(salutation);
    if (vivantRef.current) ecouter();
  }, [dire, ecouter, salutation]);

  /* Reprendre apres un silence trop long : on rouvre le micro sans refaire la
     salutation, qui n'aurait aucun sens au milieu d'une conversation. */
  const reprendre = useCallback(() => {
    vivantRef.current = true;
    malEntenduRef.current = 0;
    setErreur("");
    ecouter();
  }, [ecouter]);

  /* --- reprendre la main ------------------------------------------------- */

  /* « Ce n'est pas ce que j'ai dit ». On abandonne la recherche en cours et on
     rouvre le micro tout de suite, sans attendre une reponse a une question qui
     n'a pas ete posee. */
  const corriger = useCallback(() => {
    if (requeteRef.current) { requeteRef.current.abort(); requeteRef.current = null; }
    tourRef.current += 1;
    setEntendu("");
    setReponse("");
    setErreur("");
    setAttenteDepuis(null);
    malEntenduRef.current = 0;
    if (vivantRef.current) ecouter();
  }, [ecouter]);

  /* Couper le micro sans quitter la conversation : on referme la piste — la
     diode s'eteint, ce qui est le seul signe visible qu'on n'est plus ecoute —
     et on garde l'historique pour la suite. */
  const couper = useCallback(() => {
    tourRef.current += 1;
    if (requeteRef.current) { requeteRef.current.abort(); requeteRef.current = null; }
    if (enregistreurRef.current) { enregistreurRef.current.liberer(); enregistreurRef.current = null; }
    if (analyseRef.current) { try { analyseRef.current.contexte.close(); } catch (e) {} }
    analyseRef.current = null;
    setNiveau(0);
    setAttenteDepuis(null);
    setEtat(ETATS.PAUSE);
  }, []);

  const arreter = useCallback(() => {
    vivantRef.current = false;
    tourRef.current += 1;
    if (requeteRef.current) { requeteRef.current.abort(); requeteRef.current = null; }
    if (enregistreurRef.current) enregistreurRef.current.liberer();
    if (lecteurRef.current) lecteurRef.current.pause();
    if (analyseRef.current) { try { analyseRef.current.contexte.close(); } catch (e) {} }
    setNiveau(0);
    setAttenteDepuis(null);
    enregistreurRef.current = null;
    lecteurRef.current = null;
    analyseRef.current = null;
    setEtat(ETATS.ARRET);
  }, []);

  useEffect(() => arreter, [arreter]);

  /* La sphere porte l'etat reel, jamais une decoration. */
  const etatOrbe = etat === ETATS.ECOUTE ? "ecoute"
    : etat === ETATS.PARLE ? "parle"
    : etat === ETATS.REFLECHIT ? "pense"
    : "repos";

  return { etat, etatOrbe, entendu, reponse, erreur, niveau, niveaux, attenteDepuis,
           demarrer, reprendre, corriger, couper, arreter, actif: etat !== ETATS.ARRET };
}
