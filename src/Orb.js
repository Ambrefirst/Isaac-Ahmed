import React from "react";
import "./Orb.css";

/**
 * Sphere d'Isaac. Un seul composant, quatre etats, branches sur des etats reels du systeme :
 *
 *   repos   : rien ne se passe, la borne est vivante mais n'appelle pas.
 *   ecoute  : le microphone est ouvert. Reserve au module vocal (M2).
 *             Cet etat ne doit JAMAIS etre affiche sans micro reellement actif :
 *             l'onde qui s'anime est le temoin visible que le visiteur est enregistre.
 *   pense   : la question est en cours de traitement (recherche documentaire puis generation).
 *   parle   : restitution vocale en cours. Reserve au module vocal (M2).
 *
 * Aucun etat ne doit etre simule : la sphere est un indicateur, pas une decoration.
 */
export default function Orb({ state = "repos", size = 180, className = "", niveau = 0, niveaux = null }) {
  const etat = ["repos", "ecoute", "pense", "parle"].includes(state) ? state : "repos";
  /* Le niveau sonore du micro fait reagir la sphere en direct pendant l'ecoute.
     C'est le seul temoin qui dise au visiteur qu'il est entendu au moment meme
     ou il parle : un libelle « je vous ecoute » ne bouge pas, et on a le
     sentiment de parler a un mur. La valeur ne sert qu'a l'etat ecoute. */
  const reaction = etat === "ecoute" ? Math.min(1, Math.max(0, niveau)) : 0;
  return (
    <div
      className={`orb orb-${etat} ${className}`.trim()}
      style={{
        width: size,
        height: size,
        "--niveau": reaction,
        /* Les cinq barres suivent chacune une bande de frequences de la voix
           d'Isaac. Sans cela elles bougeraient toutes ensemble, ce qui se
           reconnait aussitot comme une animation et non comme une parole. */
        ...(etat === "parle" && niveaux
          ? niveaux.reduce((acc, v, i) => ({ ...acc, [`--b${i + 1}`]: Math.min(1, Math.max(0, v)) }), {})
          : {}),
      }}
      data-state={etat}
      aria-hidden="true"
    >
      <span className="orb-halo" />
      {etat === "ecoute" && (
        <>
          <span className="orb-onde" />
          <span className="orb-onde orb-onde-2" />
          <span className="orb-onde orb-onde-3" />
        </>
      )}
      <span className="orb-anneau orb-anneau-1" />
      <span className="orb-anneau orb-anneau-2" />
      {etat === "pense" && (
        <>
          <span className="orb-orbite"><i /></span>
          <span className="orb-orbite orb-orbite-2"><i /></span>
        </>
      )}
      {etat === "parle" ? (
        <span className="orb-barres"><i /><i /><i /><i /><i /></span>
      ) : (
        <span className="orb-noyau" />
      )}
    </div>
  );
}
