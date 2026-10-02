import { useCallback, useEffect, useRef, useState } from "react";
import { askIsaac, prevenirService } from "./services/aiService";
import { creerEnregistreur, synthetiser, transcrire } from "./services/audioService";
import { comblerAttente, comblerContexte, libereAttente, prepareAttente } from "./services/attenteParlee";
import { surPlace } from "./services/presence";
import { accordDonne, contactDit, intentionApparente, relaisCommercial } from "./services/relaisHumain";
import { creerRelaisDiffere } from "./services/relaisDiffere";

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

/* GARDE-FOU DU TOUR DE PAROLE. Plus long que le plus long enchainement
   legitime — deux minutes de reconnaissance puis cinq minutes de reponse —
   parce qu'il ne doit JAMAIS couper quelqu'un qui allait etre servi. Il ne
   sert qu'a rattraper ce que les delais des appels n'ont pas rattrape.

   Sans lui, la borne est restee a « Isaac cherche la reponse » pendant
   6977 secondes le 01/10. */
const DELAI_TOUR = 8 * 60 * 1000;

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
  /* La demande pour laquelle Isaac attend un oui ou un non, a voix haute. */
  const accordRef = useRef(null);
  /* La meme chose, mais visible par l'ecran : c'est elle qui fait
     apparaitre les deux boutons. */
  const [accordDemande, setAccordDemande] = useState(null);
  const besoinTransmisRef = useRef(null);
  /* Le courriel au service commercial attend l'adresse avant de partir. Voir
     relaisDiffere.js : il partait jusqu'ici AVANT qu'Isaac ait pu demander ou
     joindre la personne, donc toujours marque « non communique ». */
  const courrielRef = useRef(null);
  if (!courrielRef.current) courrielRef.current = creerRelaisDiffere(prevenirService);
  /* Les bruits d'attente, synthetises une fois au demarrage. Les fabriquer au
     moment ou l'on a besoin de combler une attente ajouterait une attente pour
     combler une attente. */
  const attenteRef = useRef([]);
  const comblementRef = useRef(null);
  /* La demande dont on attend une adresse, ou null. Elle ouvre le champ de
     saisie et ferme le micro : ecouter pendant qu'on tape n'a pas de sens, et
     laisserait la borne entendre le hall pendant tout ce temps. */
  const [contactDemande, setContactDemande] = useState(null);
  const contactDemandeRef = useRef(null);
  /* Les phrases du relais changent de langue en cours de conversation ; on les
     lit dans une reference pour ne pas reconstruire la boucle d'ecoute a
     chaque rendu, ce qui couperait le micro. */
  /* La langue de la conversation, pour les quelques phrases que le crochet
     dit lui-meme. Elles etaient ecrites en francais en dur : un visiteur
     anglophone lisait une panne francaise au milieu d'un echange anglais. */
  const anglais = String(langue || "fr").toLowerCase().startsWith("en");
  const relaisRef = useRef(relais);
  relaisRef.current = relais;

  /* --- parler ------------------------------------------------------------ */
  /* `desQuePret` est appele au retour de la synthese, avant la lecture : le
     service est libre a cet instant, et il reste toute la duree de la phrase
     pour fabriquer autre chose sans faire attendre personne. */
  const dire = useCallback(async (texte, desQuePret) => {
    if (!texte || !vivantRef.current) return;
    setEtat(ETATS.PARLE);
    try {
      const url = await synthetiser(texte, { langue });
      if (desQuePret) desQuePret();
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
    /* `langue` est une dependance reelle : sans elle, cette fonction garderait
       la langue du premier rendu, et un visiteur qui bascule en anglais
       continuerait d'entendre la voix francaise. */
  }, [langue]);

  /* --- ecouter, et rendre la parole au silence --------------------------- */
  const ecouter = useCallback(async () => {
    if (!vivantRef.current) return;
    /* ON LIBERE L'ENREGISTREUR PRECEDENT AVANT D'EN OUVRIR UN AUTRE.

       « Ce n'est pas ce que j'ai dit » invalide le tour et rappelle cette
       fonction ; sans cette ligne, la reference vers l'ancien enregistreur
       etait simplement ecrasee et son flux micro restait ouvert. Quelques
       corrections de suite, et plusieurs flux coexistent sur le meme
       peripherique : l'ouverture suivante ne rend plus la main, l'ecran reste
       sur « Isaac vous ecoute » et aucun bouton ne semble repondre — parce
       qu'aucun etat ne change plus.

       Une diode de micro qui reste allumee sur une borne d'accueil est de
       toute facon inacceptable. */
    if (enregistreurRef.current) {
      try { enregistreurRef.current.liberer(); } catch (e) {}
      enregistreurRef.current = null;
    }
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

      /* ON COMBLE LE SILENCE, SANS FAIRE SEMBLANT D'AVOIR COMPRIS.

         Entre le moment ou le visiteur se tait et celui ou Isaac repond, rien
         n'est audible : la reconnaissance travaille, puis le modele ecrit.
         Debout devant une sphere muette, rien ne distingue une borne qui
         cherche d'une borne en panne.

         Les bruits emis ici le sont AVANT que la transcription soit lue :
         Isaac ne sait donc pas encore ce qui lui a ete dit, et ne peut pas
         dire « d'accord » ni « je vois ». Voir l'en-tete de attenteParlee.js —
         la regle tient surtout dans le cas qui compte, celui ou quelqu'un
         signale un incident. */
      /* `.clips` ET PAS L'OBJET ENTIER. `prepareAttente` rend
         { clips, selonContexte } ; `comblerAttente` attend le tableau. Passer
         l'objet le faisait renoncer des sa premiere ligne — un objet n'a pas
         de `length` — et aucun son d'attente n'a jamais ete joue. */
      const comblement = comblerAttente(
        (attenteRef.current && attenteRef.current.clips) || [], courant);
      comblementRef.current = comblement;

      let question;
      try {
        question = await transcrire(blob, { langue });
      } catch (e) {
        comblement.couper();
        comblementRef.current = null;
        throw e;
      }
      if (!courant()) { comblement.couper(); comblementRef.current = null; return; }

      /* ON NE COMBLE QUE LA TRANSCRIPTION.

         Des que la phrase est reconnue, elle s'AFFICHE a l'ecran : le visiteur
         voit qu'Isaac a compris, et le compteur lui dit que la recherche
         continue. Entendre « un instant... je regarde cela » par-dessus cette
         preuve ne rassure plus, cela inquiete — on croit la borne bloquee sur
         une question qu'elle a pourtant sous les yeux.

         La premiere version comblait jusqu'a la reponse. Sur une recherche de
         quinze secondes, cela faisait parler Isaac six fois pour ne rien dire.
         C'est le defaut signale le 01/10, et il venait d'une erreur de ma
         part : j'ai comble l'attente entiere la ou il ne fallait couvrir que
         le moment ou l'on ne sait meme pas ce qui a ete demande.

         `arreter` et non `couper` : on ne tranche pas une phrase en cours, qui
         s'entendrait comme une panne. On cesse d'en lancer d'autres, et la
         derniere finit pendant que le modele travaille. */
      comblement.arreter();
      malEntenduRef.current = 0;
      setEntendu(question);

      /* LE SCENARIO EST UNE MACHINE A ETATS, PAS UNE SUITE DE QUESTIONS.

         Quand Isaac vient de poser une question fermee, le mot qui suit est
         la REPONSE a cette question — pas une demande nouvelle. On la lit
         ici, avant tout appel au modele, exactement comme a l'ecrit.

         Sans cela, dire « oui » coutait une generation complete : douze
         secondes pour un texte qui etait ensuite remplace. */
      const accordOral = accordRef.current ? accordDonne(question) : null;
      if (accordOral !== null) {
        const phrasesOral = relaisRef.current || {};
        if (accordOral === true) {
          const demandeOral = accordRef.current;
          accordRef.current = null;
          setAccordDemande(null);
          besoinTransmisRef.current = demandeOral;
          courrielRef.current.ouvrir(demandeOral, {
            service: "commercial", surPlace: surPlace(), mode: "vocal",
          });
          contactDemandeRef.current = demandeOral;
          setContactDemande(demandeOral);
          comblement.couper();
          comblementRef.current = null;
          setAttenteDepuis(null);
          if (phrasesOral.transmisSuite) {
            setReponse(phrasesOral.transmisSuite);
            await dire(phrasesOral.transmisSuite);
          }
          /* Le champ est ouvert : on laisse le visiteur ecrire plutot que de
             rouvrir le micro par-dessus. */
          if (courant()) { setNiveau(0); setEtat(ETATS.PAUSE); }
          return;
        }
        accordRef.current = null;
        setAccordDemande(null);
        comblement.couper();
        comblementRef.current = null;
        setAttenteDepuis(null);
        if (phrasesOral.transmisRefus) {
          setReponse(phrasesOral.transmisRefus);
          await dire(phrasesOral.transmisRefus);
        }
        if (courant()) ecouter();
        return;
      }
      /* ET MAINTENANT, UNE PHRASE QUI A DU SENS.

         La question est transcrite : Isaac sait enfin de quoi on lui parle,
         et il peut le dire — « je verifie cette information », « je prends
         note, c'est important ». C'est le plus long des silences, celui
         pendant lequel le modele ecrit, et c'est celui qu'on entendait le
         plus. `comblerContexte` etait ecrite pour cela depuis le 01/10 et
         n'etait appelee nulle part. */
      const suite = comblerContexte(
        attenteRef.current, intentionApparente(question), courant);
      comblementRef.current = suite;

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

      const accord = accordRef.current ? accordDonne(question) : null;

      if (accordRef.current && accord === true) {
        /* Le visiteur a dit oui : c'est maintenant que la demande part. */
        const demande = accordRef.current;
        accordRef.current = null;
        besoinTransmisRef.current = demande;
        courrielRef.current.ouvrir(demande, {
          service: "commercial", surPlace: ici, mode: "vocal",
        });
        contactDemandeRef.current = demande;
        setContactDemande(demande);
        if (phrases.transmisSuite) aDire = phrases.transmisSuite;
      } else if (accordRef.current && accord === false) {
        accordRef.current = null;
        if (phrases.transmisRefus) aDire = phrases.transmisRefus;
      } else if (besoinTransmisRef.current && contact) {
        /* Il vient de laisser de quoi le rappeler, a voix haute : l'adresse
           rejoint la demande qui attendait, et UN seul courriel part. */
        courrielRef.current.avecContact(contact);
        if (phrases.contactRecu) aDire = dit + " " + phrases.contactRecu;
      } else if (!besoinTransmisRef.current && !accordRef.current
                 && relaisCommercial(question, dit)) {
        /* ON DEMANDE AVANT DE TRANSMETTRE. « C'est fait » suppose un accord,
           et personne n'avait rien dit. La question est fermee — oui ou non —
           parce qu'a la voix on ne fait pas peser une decision ouverte sur
           quelqu'un qui est debout. */
        accordRef.current = question;
        setAccordDemande(question);
        if (phrases.transmisDemande) aDire = dit + " " + phrases.transmisDemande;
      }

      setReponse(aDire);
      setAttenteDepuis(null);

      /* On attend que le bruit d'attente se soit TU avant de repondre : deux
         voix qui se recouvrent s'entendent comme un bogue, et couper un mot au
         milieu s'entend comme une panne. En pratique il s'est deja tu — il a
         cesse des la transcription — mais une recherche servie par la table
         revient en deux dixiemes de seconde, et la phrase peut courir encore. */
      /* Les deux bruits se taisent avant la reponse : deux voix qui se
         recouvrent s'entendent comme un bogue. */
      suite.arreter();
      await comblement.fini;
      await suite.fini;
      comblementRef.current = null;

      await dire(aDire);
      if (!courant()) return;
      /* Le champ est ouvert : on laisse le visiteur ecrire. Rouvrir le micro
         par-dessus rendrait la borne bavarde au moment precis ou elle attend
         quelque chose de precis. */
      /* On attend un appui sur Oui ou Non : le micro reste ferme. Ecouter
         pendant qu'on repond du doigt ferait entendre le hall a la borne. */
      if (accordRef.current) { setNiveau(0); setEtat(ETATS.PAUSE); return; }
      if (contactDemandeRef.current) { setNiveau(0); setEtat(ETATS.PAUSE); return; }
      ecouter();
    } catch (e) {
      /* Le bruit d'attente tourne en boucle tant que le tour est le sien : une
         recherche qui echoue le laisserait donc marmonner indefiniment. On le
         coupe ICI, au seul endroit par lequel passent toutes les pannes. */
      if (comblementRef.current) { comblementRef.current.couper(); comblementRef.current = null; }

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
        setErreur(anglais
          ? "I cannot hear you from here. You can type your question to Isaac."
          : "Je n'arrive pas à vous entendre d'ici. Vous pouvez écrire votre question à Isaac.");
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
  }, [dire, langue, anglais]);

  /* Ce que le visiteur a ecrit. On complete le signalement deja parti, puis on
     reprend la conversation la ou elle s'etait arretee. */
  const envoyerContact = useCallback(async (valeur) => {
    const propre = String(valeur || "").trim();
    const demande = contactDemandeRef.current || besoinTransmisRef.current;
    if (!propre || !demande) return false;
    contactDemandeRef.current = null;
    setContactDemande(null);
    const parti = await courrielRef.current.avecContact(propre);
    const phrases = relaisRef.current || {};
    const mot = parti ? phrases.contactRecu : phrases.transmisEchec;
    if (mot) {
      if (parti) setReponse(mot); else setErreur(mot);
      await dire(mot);
    }
    if (vivantRef.current) ecouter();
    return parti;
  }, [dire, ecouter]);

  /* « Plus tard » n'annule rien : la demande est deja partie. Le visiteur
     refuse seulement d'etre rappele, ce qui est son droit. */
  /* ROUVRIR LE CHAMP APRES UN « PLUS TARD ». La demande est deja partie ;
     il ne manque qu'un moyen de repondre, et on doit pouvoir le donner
     quand on veut. Sans cela, un visiteur qui remet a plus tard ne peut
     plus jamais laisser son adresse — defaut signale le 01/10 a 12h32,
     repare a l'ecrit et oublie a l'oral. */
  const rouvrirContact = useCallback(() => {
    const demande = besoinTransmisRef.current || accordRef.current;
    if (!demande) return;
    contactDemandeRef.current = demande;
    setContactDemande(demande);
  }, []);

  /* LES DEUX BOUTONS. Ils refont, hors d'un tour de parole, ce que le
     raccourci vocal fait a l'interieur d'un tour. Les deux coexistent :
     on peut appuyer, ou dire oui — mais on n'a plus BESOIN de le dire. */
  const accepterAccord = useCallback(async () => {
    const demande = accordRef.current;
    if (!demande) return;
    accordRef.current = null;
    setAccordDemande(null);
    besoinTransmisRef.current = demande;
    courrielRef.current.ouvrir(demande, {
      service: "commercial", surPlace: surPlace(), mode: "vocal",
    });
    contactDemandeRef.current = demande;
    setContactDemande(demande);
    const phrases = relaisRef.current || {};
    if (phrases.transmisSuite) {
      setReponse(phrases.transmisSuite);
      await dire(phrases.transmisSuite);
    }
    if (vivantRef.current) { setNiveau(0); setEtat(ETATS.PAUSE); }
  }, [dire]);

  const refuserAccord = useCallback(async () => {
    if (!accordRef.current) return;
    accordRef.current = null;
    setAccordDemande(null);
    const phrases = relaisRef.current || {};
    if (phrases.transmisRefus) {
      setReponse(phrases.transmisRefus);
      await dire(phrases.transmisRefus);
    }
    if (vivantRef.current) ecouter();
  }, [dire, ecouter]);

  const passerContact = useCallback(() => {
    contactDemandeRef.current = null;
    setContactDemande(null);
    if (vivantRef.current) ecouter();
  }, [ecouter]);

  /* --- ouverture et fermeture -------------------------------------------- */
  const demarrer = useCallback(async () => {
    /* UN SEUL APPUI. Le bouton reste visible tant que l'etat n'a pas change,
       et l'etat ne changeait qu'au retour de la synthese : un second appui,
       facile sur un ecran tactile, lancait une seconde salutation par-dessus
       la premiere. C'est la deuxieme voix entendue le 01/10. */
    if (vivantRef.current) return;
    vivantRef.current = true;
    /* L'etat passe AVANT toute requete : le bouton disparait a l'appui, et
       l'ecran repond tout de suite meme si la voix met une seconde a venir. */
    setEtat(ETATS.PARLE);
    malEntenduRef.current = 0;
    setEntendu("");
    setReponse("");
    setErreur("");
    historiqueRef.current = [];
    besoinTransmisRef.current = null;
    accordRef.current = null;
    setAccordDemande(null);
    courrielRef.current.cloturer();
    contactDemandeRef.current = null;
    setContactDemande(null);

    /* LA SALUTATION PASSE DEVANT. Les clips d'attente partaient d'abord, et
       le service de synthese traite une requete a la fois : la salutation
       faisait la queue derriere quatre clips, d'ou les quelques secondes de
       silence apres « Parler a Isaac » qui n'existaient pas avant.

       Ils sont maintenant prepares APRES, pendant qu'Isaac parle — du temps
       deja paye, ce qui etait l'intention d'origine. On ne les attend pas :
       si la synthese traine, le premier tour sera simplement silencieux. */
    libereAttente(attenteRef.current);
    attenteRef.current = null;
    const clipsApres = () => prepareAttente(langue).then((prepare) => {
      if (vivantRef.current) attenteRef.current = prepare;
      else libereAttente(prepare);
    });

    /* Les clips se fabriquent PENDANT que la salutation est dite : la
       synthese est libre des qu'elle a rendu le son de la salutation, et le
       visiteur n'attend rien. Les lancer apres la lecture, comme je l'avais
       fait, les rendait prets trop tard pour le premier tour — et le premier
       tour se passait en silence. */
    await dire(salutation, clipsApres);
    if (vivantRef.current) ecouter();
  }, [dire, ecouter, salutation, langue]);

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
    if (comblementRef.current) { comblementRef.current.couper(); comblementRef.current = null; }
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
    if (comblementRef.current) { comblementRef.current.couper(); comblementRef.current = null; }
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
    if (comblementRef.current) { comblementRef.current.couper(); comblementRef.current = null; }
    libereAttente(attenteRef.current);
    attenteRef.current = null;
    if (requeteRef.current) { requeteRef.current.abort(); requeteRef.current = null; }
    if (enregistreurRef.current) enregistreurRef.current.liberer();
    if (lecteurRef.current) lecteurRef.current.pause();
    if (analyseRef.current) { try { analyseRef.current.contexte.close(); } catch (e) {} }
    setNiveau(0);
    setAttenteDepuis(null);
    enregistreurRef.current = null;
    lecteurRef.current = null;
    analyseRef.current = null;
    /* La conversation se ferme : une demande qui attendait encore une adresse
       part maintenant, sans elle. Mieux vaut un besoin sans adresse qu'un
       besoin perdu. */
    courrielRef.current.cloturer();
    contactDemandeRef.current = null;
    setContactDemande(null);
    setEtat(ETATS.ARRET);
  }, []);

  /* Le garde-fou. Il INVALIDE le tour (`tourRef`) en plus d'annuler la
     requete : sans cela, un appel qui reviendrait apres coup reprendrait le
     fil, et le visiteur entendrait la reponse a une question qu'il a vue
     abandonner. */
  useEffect(() => {
    if (etat !== ETATS.REFLECHIT || !attenteDepuis) return undefined;
    const m = setTimeout(() => {
      tourRef.current += 1;
      if (requeteRef.current) { requeteRef.current.abort(); requeteRef.current = null; }
      if (comblementRef.current) { comblementRef.current.couper(); comblementRef.current = null; }
      setNiveau(0);
      setAttenteDepuis(null);
      setErreur(anglais
        ? "The search did not complete. You can speak again."
        : "La recherche n'a pas abouti. Vous pouvez reprendre la parole.");
      setEtat(ETATS.PAUSE);
    }, DELAI_TOUR);
    return () => clearTimeout(m);
  }, [etat, attenteDepuis, anglais]);

  useEffect(() => arreter, [arreter]);

  /* La sphere porte l'etat reel, jamais une decoration. */
  const etatOrbe = etat === ETATS.ECOUTE ? "ecoute"
    : etat === ETATS.PARLE ? "parle"
    : etat === ETATS.REFLECHIT ? "pense"
    : "repos";

  return { etat, etatOrbe, entendu, reponse, erreur, niveau, niveaux, attenteDepuis,
           contactDemande, envoyerContact, passerContact,
           demarrer, reprendre, corriger, couper, arreter, rouvrirContact,
           accordDemande, accepterAccord, refuserAccord,
           /* Une adresse peut encore etre laissee : la demande est partie,
              mais personne ne sait ou repondre. */
           contactPossible: !!besoinTransmisRef.current,
           actif: etat !== ETATS.ARRET };
}
