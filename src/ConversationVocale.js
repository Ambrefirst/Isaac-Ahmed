import React, { useEffect } from "react";
import "./ConversationVocale.css";
import ChampContact from "./ChampContact";
import Orb from "./Orb";
import { useLanguage } from "./i18n";
import useConversationParlee from "./useConversationParlee";

/* Conversation parlee, ouverte depuis le fil de discussion.

   Elle se comporte exactement comme sur la borne : on parle, Isaac repond A
   VOIX HAUTE, et l'echange s'enchaine. Elle N'ECRIT RIEN dans le fil.

   Une premiere version envoyait la question transcrite dans la conversation
   ecrite et laissait Isaac repondre en texte. C'etait un contresens : ce
   parcours-la existe deja, c'est le bouton micro du champ de saisie, qui sert
   de transcripteur pour qui n'a pas envie de taper. Ici, on veut entendre une
   voix, et rien d'autre.

   La seule difference avec la borne est la fenetre : on est deja dans un fil,
   il est normal de s'y superposer plutot que de le remplacer. */

export default function ConversationVocale({ onFermer }) {
  const { t, language } = useLanguage();
  const vocal = useConversationParlee({
    salutation: t("voix.salutation"),
    langue: language,
    relais: {
      transmisSurPlace: t("voix.commercial.surplace"),
      transmisADistance: t("voix.commercial.adistance"),
      transmisSuite: t("voix.commercial.suite"),
      transmisDemande: t("voix.commercial.demande"),
      transmisRefus: t("voix.commercial.refus"),
      contactRecu: t("voix.commercial.contact"),
      transmisEchec: t("voix.commercial.echec"),
    },
  });

  /* La conversation s'ouvre d'elle-meme : le visiteur a deja appuye pour
     arriver ici, lui demander un second geste n'aurait pas de sens. */
  useEffect(() => {
    vocal.demarrer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fermer() {
    vocal.arreter();
    onFermer();
  }

  return (
    <div className="voix-voile" role="dialog" aria-modal="true" aria-label={t("voix.titre")}>
      <div className="voix-panneau">
        <button type="button" className="voix-fermer" onClick={fermer} aria-label={t("voix.fermer")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>

        <Orb
          state={vocal.etatOrbe}
          size={150}
          className="voix-orbe"
          niveau={vocal.niveau}
          niveaux={vocal.niveaux}
        />

        <p className="voix-etat" aria-live="polite">
          {vocal.etat === "arret" ? t("voix.etat.pret") : t(`voix.etat.${vocal.etat}`)}
        </p>
        {vocal.etat === "reflechit" && <p className="voix-attente">{t("voix.attentecourt")}</p>}

        {/* Ce qui a ete entendu et ce qui a ete repondu restent lisibles : le
            visiteur verifie qu'il a ete compris, sans que cela devienne un fil
            de discussion. Ce sont des reperes, pas des messages. */}
        {/* Une phrase par etat, et chacune dit ce qui est utile a ce
            moment-la : articuler avant de parler, ne pas couvrir sa voix
            pendant qu'il repond. Pendant la recherche, c'est le compteur
            au-dessus qui parle. */}
        {(vocal.etat === "ecoute" || vocal.etat === "parle") && (
          <p className="voix-consigne">
            {t(vocal.etat === "ecoute" ? "voix.ecoute.consigne" : "voix.parle.consigne")}
          </p>
        )}
        {vocal.entendu && <p className="voix-transcrit">{vocal.entendu}</p>}
        {vocal.reponse && <p className="voix-reponse">{vocal.reponse}</p>}
        {vocal.erreur && <p className="voix-erreur" role="alert">{vocal.erreur}</p>}
        {vocal.contactDemande && (
          <ChampContact onEnvoyer={vocal.envoyerContact} onPlusTard={vocal.passerContact} />
        )}
        {/* OUI ET NON SE TOUCHENT, ILS NE SE DISENT PLUS. Un mot d'une
            syllabe est ce que la reconnaissance rate le plus, et c'est
            celui dont depend toute la suite. */}
        {vocal.accordDemande && (
          <div className="voix-accord">
            <button type="button" className="voix-accord-oui" onClick={vocal.accepterAccord}>
              {t("voix.accord.oui")}
            </button>
            <button type="button" className="voix-accord-non" onClick={vocal.refuserAccord}>
              {t("voix.accord.non")}
            </button>
          </div>
        )}
        {/* Plus tard n'est pas un refus definitif : la demande est deja
            partie, il ne manque qu'un moyen de repondre. */}
        {!vocal.contactDemande && vocal.contactPossible && (
          <button type="button" className="contact-rouvrir" onClick={vocal.rouvrirContact}>
            {t("chat.commercial.rouvrir")}
          </button>
        )}
        {vocal.etat === "pause" && !vocal.erreur && !vocal.contactDemande && (
          <p className="voix-attente">{t("voix.pause.explication")}</p>
        )}

        {/* Apres un silence prolonge, la conversation se met en pause d'elle-meme
            plutot que de garder le micro ouvert. Il faut alors pouvoir la
            reprendre : sans ce bouton, la fenetre restait muette et sans issue
            autre que la fermer. */}
        {(vocal.etat === "arret" || vocal.etat === "pause") && !vocal.contactDemande && (
          <button
            type="button"
            className="voix-bouton"
            /* Reprendre garde l'echange et rouvre simplement le micro ;
               demarrer recommence, salutation comprise. Les deux boutons
               appelaient « reprendre » : depuis l'arret, la fenetre se
               remettait a ecouter sans qu'Isaac ait dit un mot. */
            onClick={vocal.etat === "pause" ? vocal.reprendre : vocal.demarrer}
          >
            {vocal.etat === "pause" ? t("voix.reprendre") : t("voix.bouton.parler")}
          </button>
        )}

        {/* Reprendre la main : dire que ce n'est pas ce qu'on a prononce, pendant
            que la recherche tourne encore, et couper le micro pendant qu'il
            ecoute. Sans le premier, une phrase mal comprise coutait deux minutes
            d'attente avant de pouvoir recommencer. */}
        {vocal.etat === "reflechit" && vocal.entendu && (
          <button type="button" className="voix-reprise" onClick={vocal.corriger}>{t("voix.corriger")}</button>
        )}
        {vocal.etat === "ecoute" && (
          <button type="button" className="voix-reprise" onClick={vocal.couper}>{t("voix.couper")}</button>
        )}

        <button type="button" className="voix-terminer" onClick={fermer}>{t("voix.terminer")}</button>
      </div>
    </div>
  );
}
