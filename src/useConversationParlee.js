import { useCallback, useEffect, useRef, useState } from "react";
import { askIsaac } from "./services/aiService";
import { creerEnregistreur, synthetiser, transcrire } from "./services/audioService";

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

const SEUIL_SILENCE = 0.012;      // niveau sonore en deca duquel on considere qu'il ne parle plus
const SILENCE_POUR_FINIR = 1500;  // ms de silence avant de rendre la parole a Isaac
const PAROLE_MINIMALE = 700;      // ms en deca desquelles on ne transcrit meme pas
const ATTENTE_MAXIMALE = 12000;   // ms : si rien ne vient, on ne laisse pas le micro ouvert

export const ETATS = {
  ARRET: "arret",
  PARLE: "parle",
  ECOUTE: "ecoute",
  REFLECHIT: "reflechit",
};

export default function useConversationParlee({ salutation, langue = "fr" }) {
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

      await new Promise((resolve) => {
        const battement = setInterval(() => {
          if (!vivantRef.current) { clearInterval(battement); resolve(); return; }
          analyseur.getFloatTimeDomainData(echantillons);
          let somme = 0;
          for (let i = 0; i < echantillons.length; i += 1) somme += echantillons[i] * echantillons[i];
          const niveau = Math.sqrt(somme / echantillons.length);

          /* Echelle ramenee a 0..1 pour l'affichage : le seuil de silence
             correspond a 0, et on sature bien avant le maximum theorique pour
             que la sphere reagisse a une voix normale, pas seulement a un cri. */
          setNiveau(Math.min(1, Math.max(0, (niveau - SEUIL_SILENCE) / 0.08)));
          if (niveau > SEUIL_SILENCE) { dernierSon = Date.now(); aParle = true; }

          const silence = Date.now() - dernierSon;
          const ecoule = Date.now() - debut;
          const finDeTour = aParle && ecoule > PAROLE_MINIMALE && silence > SILENCE_POUR_FINIR;
          const tropLong = ecoule > ATTENTE_MAXIMALE;
          if (finDeTour || tropLong) { clearInterval(battement); resolve(); }
        }, 120);
      });

      try { contexte.close(); } catch (e) { /* deja ferme */ }
      analyseRef.current = null;

      const blob = await enregistreur.arreter();
      if (!vivantRef.current) return;
      if (!aParle) { setEtat(ETATS.ARRET); return; }

      setNiveau(0);
      setEtat(ETATS.REFLECHIT);
      setAttenteDepuis(Date.now());
      const question = await transcrire(blob);
      if (!vivantRef.current) return;
      setEntendu(question);

      const dit = await askIsaac(question, historiqueRef.current, langue);
      if (!vivantRef.current) return;
      historiqueRef.current = [
        ...historiqueRef.current,
        { sender: "visitor", text: question },
        { sender: "isaac", text: dit },
      ].slice(-8);
      setReponse(dit);
      setAttenteDepuis(null);

      await dire(dit);
      if (vivantRef.current) ecouter();
    } catch (e) {
      if (!vivantRef.current) return;
      setErreur(e.message);
      setEtat(ETATS.ARRET);
    }
  }, [dire, langue]);

  /* --- ouverture et fermeture -------------------------------------------- */
  const demarrer = useCallback(async () => {
    vivantRef.current = true;
    setEntendu("");
    setReponse("");
    setErreur("");
    historiqueRef.current = [];
    await dire(salutation);
    if (vivantRef.current) ecouter();
  }, [dire, ecouter, salutation]);

  /* Reprendre apres un silence trop long : on rouvre le micro sans refaire la
     salutation, qui n'aurait aucun sens au milieu d'une conversation. */
  const reprendre = useCallback(() => {
    vivantRef.current = true;
    setErreur("");
    ecouter();
  }, [ecouter]);

  const arreter = useCallback(() => {
    vivantRef.current = false;
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
           demarrer, reprendre, arreter, actif: etat !== ETATS.ARRET };
}
