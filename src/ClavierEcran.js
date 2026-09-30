import React from "react";
import { useLanguage } from "./i18n";

/* Un clavier, parce qu'une borne n'en a pas.

   Le champ de saisie suppose de quoi écrire. Sur un ordinateur, c'est acquis.
   Sur la borne du hall, il n'y a qu'une dalle tactile : le clavier du système
   ne s'affiche de lui-même que si Windows est en mode tablette, ce qui n'est
   pas le cas ici. Sans ce composant, le visiteur voit un champ où il lui est
   impossible d'écrire — ce qui est pire que ne rien lui demander.

   CE QU'IL N'EST PAS. Ce n'est pas un clavier général : il sert à saisir une
   adresse électronique, et rien d'autre. D'où trois partis pris.

   Pas de majuscules : une adresse ne les distingue pas, et une touche de
   bascule est une occasion de se tromper pour un gain nul.

   Pas de lettres accentuées : elles n'ont pas cours dans une adresse, et les
   proposer inviterait à des erreurs qu'on ne pourrait pas rattraper.

   Une rangée dédiée aux signes qui comptent ici — l'arobase, le point, le
   tiret — plus « .com », qui épargne quatre appuis sur la majorité des
   adresses.

   La disposition est AZERTY : c'est celle des claviers du bureau, et chercher
   une lettre là où elle n'est pas fait abandonner. */

const RANGEES = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
  ["w", "x", "c", "v", "b", "n", "-", "_"],
];

const SIGNES = ["@", ".", ".com"];

export default function ClavierEcran({ onTouche, onEffacer, onFermer }) {
  const { t } = useLanguage();

  /* `onMouseDown` avec `preventDefault` plutôt que `onClick` : sans cela,
     chaque appui vole le focus au champ, le curseur disparaît, et le visiteur
     ne voit plus où il écrit. */
  const appui = (action) => (e) => {
    e.preventDefault();
    action();
  };

  return (
    <div className="clavier" role="group" aria-label={t("voix.clavier.titre")}>
      {RANGEES.map((rangee, i) => (
        <div className="clavier-rangee" key={i}>
          {rangee.map((touche) => (
            <button
              type="button"
              key={touche}
              className="clavier-touche"
              onMouseDown={appui(() => onTouche(touche))}
              onTouchStart={appui(() => onTouche(touche))}
            >
              {touche}
            </button>
          ))}
        </div>
      ))}

      <div className="clavier-rangee">
        {SIGNES.map((signe) => (
          <button
            type="button"
            key={signe}
            className="clavier-touche clavier-signe"
            onMouseDown={appui(() => onTouche(signe))}
            onTouchStart={appui(() => onTouche(signe))}
          >
            {signe}
          </button>
        ))}
        <button
          type="button"
          className="clavier-touche clavier-effacer"
          aria-label={t("voix.clavier.effacer")}
          onMouseDown={appui(onEffacer)}
          onTouchStart={appui(onEffacer)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6H9l-5 6 5 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zM16 10l-4 4M12 10l4 4" />
          </svg>
        </button>
        {/* La détection du clavier physique est une heuristique : on laisse
            toujours de quoi refermer, sinon une borne mal reconnue afficherait
            un clavier dont on ne peut plus se débarrasser. */}
        <button
          type="button"
          className="clavier-touche clavier-fermer"
          aria-label={t("voix.clavier.fermer")}
          onMouseDown={appui(onFermer)}
          onTouchStart={appui(onFermer)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
