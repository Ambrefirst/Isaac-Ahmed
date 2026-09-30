import React, { useRef, useState } from "react";
import ClavierEcran from "./ClavierEcran";
import { useLanguage } from "./i18n";

/* Le seul endroit de la conversation parlée où l'on écrit.

   UNE ADRESSE ÉLECTRONIQUE NE SE DICTE PAS. « ambre arobase s t point
   digital » : la reconnaissance rend des mots, pas des signes, et une lettre
   épelée de travers suffit à rendre l'adresse inutilisable. On sait la
   recomposer — c'est fait, et ça marche sur des phrases propres — mais une
   recomposition juste à quatre-vingt-dix pour cent produit une adresse fausse
   à cent pour cent, et un courriel qui part dans le vide.

   Or c'est précisément le moment où tout le travail se joue : sans adresse
   exacte, le commercial a un besoin qu'il ne peut rattacher à personne.

   On rend donc le clavier au visiteur, et uniquement là. Trois mots, un
   champ, une flèche. Ce n'est pas un formulaire — il n'y a ni nom, ni
   entreprise, ni motif : tout cela, Isaac l'a déjà transmis. Il ne reste que
   ce qu'une machine ne peut pas entendre à sa place.

   « Plus tard » est aussi une réponse. La demande est partie de toute façon ;
   laisser une adresse la rend seulement joignable. */

/* On accepte une adresse électronique ou un numéro : certains préfèrent être
   appelés, et refuser leur numéro serait refuser leur demande. */
function valide(valeur) {
  const v = String(valeur || "").trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) return v;
  const chiffres = v.replace(/\D/g, "");
  if (/^[+\d\s.-]+$/.test(v) && chiffres.length >= 8 && chiffres.length <= 15) return chiffres;
  return null;
}

/* Y a-t-il de quoi ecrire sur cet appareil ?

   Un ordinateur a un clavier : le champ suffit, et lui superposer un clavier
   a l'ecran serait encombrant et vexant. Une borne tactile n'en a pas, et
   Windows n'affiche le sien qu'en mode tablette — pas ici.

   On lit donc ce que le navigateur sait du POINTEUR. « coarse » veut dire un
   doigt ; « any-pointer: fine » veut dire qu'il existe en plus une souris ou
   un stylet quelque part. Un portable tactile avec souris est donc traite
   comme un ordinateur, ce qui est le bon choix : son clavier est sous les
   doigts du visiteur.

   Ce n'est qu'une presomption, et c'est pourquoi le clavier reste rappelable
   d'un bouton. Une detection qui se trompe doit couter un appui, pas la
   saisie. */
function sansClavierPhysique() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  const doigt = window.matchMedia("(pointer: coarse)").matches;
  const precis = window.matchMedia("(any-pointer: fine)").matches;
  return doigt && !precis;
}

export default function ChampContact({ onEnvoyer, onPlusTard, classe = "" }) {
  const { t } = useLanguage();
  const [valeur, setValeur] = useState("");
  const [faux, setFaux] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [clavier, setClavier] = useState(sansClavierPhysique);
  const saisieRef = useRef(null);

  function ecrire(touche) {
    setFaux(false);
    setValeur((v) => (v + touche).slice(0, 120));
    if (saisieRef.current) saisieRef.current.focus();
  }

  function effacer() {
    setFaux(false);
    setValeur((v) => v.slice(0, -1));
    if (saisieRef.current) saisieRef.current.focus();
  }

  async function soumettre(e) {
    e.preventDefault();
    const propre = valide(valeur);
    if (!propre) {
      setFaux(true);
      return;
    }
    setFaux(false);
    setEnvoi(true);
    await onEnvoyer(propre);
  }

  return (
    <form className={`contact-champ ${classe}`} onSubmit={soumettre}>
      <label className="contact-invite" htmlFor="contact-saisie">
        {t("voix.contact.invite")}
      </label>
      <div className="contact-ligne">
        <input
          ref={saisieRef}
          id="contact-saisie"
          className={`contact-saisie ${faux ? "contact-faux" : ""}`}
          type="email"
          autoComplete="email"
          autoFocus
          /* Quand notre clavier est affiche, on demande au systeme de ne pas
             ouvrir le sien par-dessus : deux claviers valent moins qu'un. */
          inputMode={clavier ? "none" : "email"}
          disabled={envoi}
          value={valeur}
          placeholder={t("voix.contact.exemple")}
          onChange={(e) => { setValeur(e.target.value); setFaux(false); }}
          aria-invalid={faux}
          aria-describedby={faux ? "contact-erreur" : undefined}
        />
        <button type="submit" className="contact-envoyer" disabled={envoi} aria-label={t("voix.contact.envoyer")}>
          {envoi ? (
            <span className="contact-encours" aria-hidden="true" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h13M12 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
      {faux && <p id="contact-erreur" className="contact-erreur" role="alert">{t("voix.contact.invalide")}</p>}
      {clavier && !envoi && (
        <ClavierEcran onTouche={ecrire} onEffacer={effacer} onFermer={() => setClavier(false)} />
      )}

      <div className="contact-pied">
        <button type="button" className="contact-plustard" onClick={onPlusTard} disabled={envoi}>
          {t("voix.contact.plustard")}
        </button>
        {!clavier && !envoi && (
          <button type="button" className="contact-plustard" onClick={() => setClavier(true)}>
            {t("voix.clavier.ouvrir")}
          </button>
        )}
      </div>
    </form>
  );
}
