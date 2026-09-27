import React, { useCallback, useEffect, useRef, useState } from "react";
import "./ConversationVocale.css";
import Orb from "./Orb";
import { useLanguage } from "./i18n";
import { creerEnregistreur, synthetiser, transcrire } from "./services/audioService";

/* Conversation parlee avec Isaac : on appuie une fois, il salue a voix haute,
   puis on se parle. C'est un mode a part entiere, distinct de la dictee, parce
   que les deux n'ont pas le meme but. La dictee remplace le clavier ; ici, on
   ne touche plus rien.

   La regle qui gouverne tout ce fichier : ON N'ECOUTE JAMAIS PENDANT QU'ISAAC
   PARLE. Sans elle, le micro entend la reponse, la transcrit, la renvoie, et
   la borne boucle sur sa propre voix. C'est arrive, et c'est la raison d'etre
   de la machine a etats ci-dessous plutot qu'un simple va-et-vient. */

const ETATS = {
  PRET: "pret",         // rien ne se passe, on attend le premier appui
  PARLE: "parle",       // Isaac parle : micro ferme, obligatoirement
  ECOUTE: "ecoute",     // le visiteur parle
  REFLECHIT: "reflechit", // transcription puis reponse en cours
};

export default function ConversationVocale({ onEnvoyer, onFermer, derniereReponse }) {
  const { t } = useLanguage();
  const [etat, setEtat] = useState(ETATS.PRET);
  const [transcrit, setTranscrit] = useState("");
  const [erreur, setErreur] = useState("");
  const enregistreurRef = useRef(null);
  const lecteurRef = useRef(null);
  const vivantRef = useRef(true);

  const dire = useCallback(async (texte) => {
    if (!texte) return;
    setEtat(ETATS.PARLE);
    try {
      const url = await synthetiser(texte);
      if (!url || !vivantRef.current) return;
      await new Promise((resolve) => {
        const audio = new Audio(url);
        lecteurRef.current = audio;
        const fin = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onended = fin;
        audio.onerror = fin;
        audio.play().catch(fin);
      });
    } catch (e) {
      /* Isaac muet n'interrompt pas la conversation : la reponse reste
         affichee, et le visiteur peut continuer a parler. */
    }
    if (vivantRef.current) setEtat(ETATS.PRET);
  }, []);

  async function ecouter() {
    setErreur("");
    setTranscrit("");
    try {
      enregistreurRef.current = creerEnregistreur({ surApercu: setTranscrit });
      await enregistreurRef.current.demarrer();
      setEtat(ETATS.ECOUTE);
    } catch (e) {
      setErreur(t("chat.voice.micRefuse"));
      setEtat(ETATS.PRET);
    }
  }

  async function terminerEtEnvoyer() {
    setEtat(ETATS.REFLECHIT);
    try {
      const blob = await enregistreurRef.current.arreter();
      const texte = await transcrire(blob);
      setTranscrit(texte);
      onEnvoyer(texte);
      /* On ne repasse pas a PRET ici : c'est l'arrivee de la reponse qui fera
         parler Isaac, et lui seul decidera quand le micro peut rouvrir. */
    } catch (e) {
      setErreur(e.message);
      setEtat(ETATS.PRET);
    }
  }

  /* Isaac dit la derniere reponse des qu'elle arrive. Le micro reste ferme
     pendant toute la lecture, sans exception. */
  const dejaDitRef = useRef(null);
  useEffect(() => {
    if (!derniereReponse || derniereReponse === dejaDitRef.current) return;
    dejaDitRef.current = derniereReponse;
    dire(derniereReponse);
  }, [derniereReponse, dire]);

  /* Salutation au premier affichage : c'est elle qui ouvre la conversation,
     comme le ferait une personne a l'accueil. */
  const salueRef = useRef(false);
  useEffect(() => {
    if (salueRef.current) return;
    salueRef.current = true;
    dire(t("voix.salutation"));
  }, [dire, t]);

  useEffect(() => () => {
    vivantRef.current = false;
    if (enregistreurRef.current) enregistreurRef.current.liberer();
    if (lecteurRef.current) lecteurRef.current.pause();
  }, []);

  /* La sphere porte l'etat reel, jamais une decoration : « ecoute » ne
     s'affiche que lorsque le micro est reellement ouvert, ce que sa
     documentation exige depuis M1 et que ce module rend enfin possible. */
  const etatOrbe = etat === ETATS.ECOUTE ? "ecoute" : etat === ETATS.PARLE ? "parle"
    : etat === ETATS.REFLECHIT ? "pense" : "repos";

  const libelleEtat = {
    [ETATS.PRET]: "voix.etat.pret",
    [ETATS.PARLE]: "voix.etat.parle",
    [ETATS.ECOUTE]: "voix.etat.ecoute",
    [ETATS.REFLECHIT]: "voix.etat.reflechit",
  }[etat];

  return (
    <div className="voix-voile" role="dialog" aria-modal="true" aria-label={t("voix.titre")}>
      <div className="voix-panneau">
        <button type="button" className="voix-fermer" onClick={onFermer} aria-label={t("voix.fermer")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>

        <Orb state={etatOrbe} size={150} className="voix-orbe" />

        <p className="voix-etat" aria-live="polite">{t(libelleEtat)}</p>

        {/* Ce qui a ete entendu, sous les yeux du visiteur : sans cela il ne
            sait pas si Isaac l'a compris avant d'entendre la reponse. */}
        {transcrit && <p className="voix-transcrit">{transcrit}</p>}
        {erreur && <p className="voix-erreur" role="alert">{erreur}</p>}

        <button
          type="button"
          className={`voix-bouton ${etat === ETATS.ECOUTE ? "ecoute" : ""}`}
          onClick={etat === ETATS.ECOUTE ? terminerEtEnvoyer : ecouter}
          /* Pendant qu'Isaac parle ou reflechit, le bouton est ferme. Ce n'est
             pas un detail d'ergonomie : c'est ce qui empeche la boucle. */
          disabled={etat === ETATS.PARLE || etat === ETATS.REFLECHIT}
        >
          {t(etat === ETATS.ECOUTE ? "voix.bouton.fini" : "voix.bouton.parler")}
        </button>

        <p className="voix-aide">{t("voix.aide")}</p>
      </div>
    </div>
  );
}
