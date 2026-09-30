import React, { useEffect, useState } from "react";
import "./HomeScreen.css";
import { useLanguage } from "./i18n";
import Orb from "./Orb";
import ChampContact from "./ChampContact";
import { audioDisponible } from "./services/audioService";
import useConversationParlee from "./useConversationParlee";

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}
function AssistantIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 1 1-3.2-6.4" />
      <path d="M12 8v4l3 2" />
      <circle cx="19" cy="5" r="2" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <div className="lang-switcher">
      <button className="lang-button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        {language.toUpperCase()} <ChevronDownIcon />
      </button>
      {open && (
        <ul className="lang-menu" role="listbox">
          {LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                className={lang.code === language ? "active" : ""}
                onClick={() => { setLanguage(lang.code); setOpen(false); }}
              >
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Heure locale du site, rafraichie chaque minute. Ancre la borne dans un lieu et un instant.
function useLocalTime(language) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString(language === "en" ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function MicroIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

/* Une reponse demande une a deux minutes sur cette machine, sans GPU. Une
   attente muette passe pour une panne : on montre qu'elle avance. */
function CompteurAttente({ depuis, t }) {
  const [secondes, setSecondes] = React.useState(0);
  React.useEffect(() => {
    if (!depuis) return undefined;
    const suivre = () => setSecondes(Math.round((Date.now() - depuis) / 1000));
    suivre();
    const m = setInterval(suivre, 1000);
    return () => clearInterval(m);
  }, [depuis]);
  return <p className="home-attente">{t("voix.attente").replace("{s}", secondes)}</p>;
}

function HomeScreen({ onAppointment, onAssistant, onWelcome }) {
  const { t, language } = useLanguage();
  /* La conversation parlee se tient ICI, sur la borne, autour de la sphere.
     Elle n'ouvre pas de fenetre et ne mene pas au fil de discussion : appuyer
     sur « Parler a Isaac » veut dire qu'on veut entendre une voix, pas lire. */
  const vocal = useConversationParlee({
    salutation: t("voix.salutation"),
    langue: language,
    /* Les phrases du relais commercial sont fournies par l'ecran : le crochet
       n'a pas de traduction a lui, et une chaine ecrite en dur dedans serait
       restee en francais pour un visiteur anglophone. */
    relais: {
      transmisSurPlace: t("voix.commercial.surplace"),
      transmisADistance: t("voix.commercial.adistance"),
      contactRecu: t("voix.commercial.contact"),
      transmisEchec: t("voix.commercial.echec"),
    },
  });
  const heure = useLocalTime(language);

  /* L'espace du personnel n'est pas servi sur tous les acces. Y envoyer
     directement affichait la page d'erreur du serveur : un 404 nu, qui donne
     l'impression que l'application est cassee alors qu'il s'agit d'un refus
     volontaire. On verifie d'abord, et on explique. */
  const [accesPersonnel, setAccesPersonnel] = useState(null); // null | "refuse"

  async function openBackOffice() {
    setAccesPersonnel(null);
    try {
      const reponse = await fetch("/admin/", { method: "GET", cache: "no-store" });
      if (reponse.ok) {
        window.location.href = "/admin/";
        return;
      }
    } catch (e) {
      /* Injoignable ou refuse : pour le visiteur, la conclusion est la meme. */
    }
    setAccesPersonnel("refuse");
  }

  return (
    <main className="home-page">
      <section className="home-container">
        <header className="home-header">
          <button className="home-logo-button" onClick={onWelcome} aria-label={t("home.logo")}>
            <img className="home-logo-image" src="/logo-st-digital.png" alt="ST Digital Data Center Services" />
          </button>
          <div className="home-header-actions">
            <LanguageSwitcher />
            <button className="icon-button" onClick={openBackOffice} aria-label={t("home.profile")}><UserIcon /></button>
          </div>
        </header>

        {accesPersonnel === "refuse" && (
          <div className="acces-personnel" role="status">
            {t("home.backoffice.indispo")}
            <button onClick={() => setAccesPersonnel(null)} aria-label={t("home.backoffice.fermer")}>{t("home.backoffice.fermer")}</button>
          </div>
        )}

        {/* Bandeau d'ancrage : ou l'on est, quelle heure il est, et si Isaac repond */}
        <div className="home-ancrage">
          <span className="ancrage-item">
            <span className="ancrage-pastille" aria-hidden="true" />
            {t("home.available")}
          </span>
          <span className="ancrage-item">{t("home.site")} · {heure}</span>
        </div>

        <section className="home-hero">
          <div className="home-hero-text">
            <span className="eyebrow">{t("home.eyebrow")}</span>
            <h1>{t("home.title1")}<br /><em>{t("home.title2")}</em></h1>
            <p className="home-subtitle">{t("home.subtitle")}</p>
            <span className="home-badge">{t("home.badge1")} <i>•</i> {t("home.badge2")} <i>•</i> {t("home.badge3")}</span>
          </div>
        </section>

        {/* La sphere est l'interface, pas un decor : elle ouvre la conversation
            ecrite. Sous elle, le bouton qui ouvre la conversation parlee : c'est
            sur la borne qu'un visiteur decide de parler plutot que de taper, pas
            une fois entre dans l'ecran de discussion. */}
        <div className={`home-orb-zone ${vocal.actif ? "en-conversation" : ""}`}>
          <button
            className="home-orb-button"
            onClick={vocal.actif ? undefined : onAssistant}
            aria-label={vocal.actif ? t(`voix.etat.${vocal.etat}`) : t("home.orbAria")}
            disabled={vocal.actif}
          >
            {/* La sphere porte l'etat reel de la conversation : elle ecoute,
                elle reflechit, elle parle. C'est la que M2 rend enfin vrais les
                etats que le composant reservait depuis M1. */}
            <Orb state={vocal.etatOrbe} size={190} niveau={vocal.niveau} niveaux={vocal.niveaux} />
          </button>

          {/* Mise en page de la maquette : une invite en capitales espacees, la
              phrase entendue en dessous, et rien d'autre. Le gros bouton rouge
              precedent ecrasait la sphere, qui est pourtant l'interface. */}
          <div className="home-invite">
            {vocal.actif ? (
              <>
                <p className="home-etat-txt" aria-live="polite">{t(`voix.etat.${vocal.etat}`)}</p>
                {vocal.etat === "reflechit" && <CompteurAttente depuis={vocal.attenteDepuis} t={t} />}
                {vocal.entendu && <p className="home-transcript">{vocal.entendu}</p>}
                {vocal.reponse && <p className="home-vocal-reponse">{vocal.reponse}</p>}
                {vocal.erreur && <p className="home-vocal-erreur" role="alert">{vocal.erreur}</p>}
                {/* Le seul moment ou l'on ecrit pendant une conversation
                    parlee. Il vient apres la reponse, jamais a la place. */}
                {vocal.contactDemande && (
                  <ChampContact
                    classe="contact-borne"
                    onEnvoyer={vocal.envoyerContact}
                    onPlusTard={vocal.passerContact}
                  />
                )}
                {vocal.etat === "pause" && !vocal.erreur && !vocal.contactDemande && (
                  <p className="home-vocal-pause">{t("voix.pause.explication")}</p>
                )}

                {/* Les deux facons de reprendre la main.

                    Pendant la recherche : ce qui a ete compris est affiche, et
                    s'il est faux il ne sert a rien d'attendre la reponse. La
                    lenteur de la borne, qui est son pire defaut, laisse ici tout
                    le temps de le voir et de recommencer.

                    Pendant l'ecoute : couper le micro sans quitter. Sinon, dans
                    un hall, il reste ouvert tant que la conversation dure. */}
                <div className="home-vocal-actions">
                  {vocal.etat === "reflechit" && vocal.entendu && (
                    <button className="home-reprise" onClick={vocal.corriger}>{t("voix.corriger")}</button>
                  )}
                  {vocal.etat === "ecoute" && (
                    <button className="home-reprise" onClick={vocal.couper}>{t("voix.couper")}</button>
                  )}
                  {vocal.etat === "pause" && (
                    <button className="home-reprise reprise-forte" onClick={vocal.reprendre}>{t("voix.reprendre")}</button>
                  )}
                  <button className="home-terminer" onClick={vocal.arreter}>{t("voix.terminer")}</button>
                </div>
              </>
            ) : (
              audioDisponible && (
                <button className="home-cta" onClick={vocal.demarrer}>
                  <MicroIcon />
                  {t("voix.appuyez")}
                </button>
              )
            )}
          </div>
        </div>

        <div className="home-parcours-label"><span className="accent-dash" />{t("home.parcours")}</div>

        <section className="home-options">
          <button className="home-option" onClick={onAppointment}>
            <span className="option-icon" aria-hidden="true"><CalendarIcon /></span>
            <span className="option-text">
              <strong>{t("home.rdv.title")}</strong>
              <span>{t("home.rdv.desc")}</span>
            </span>
            <span className="option-arrow" aria-hidden="true"><ArrowIcon /></span>
          </button>

          <button className="home-option" onClick={onAssistant}>
            <span className="option-icon" aria-hidden="true"><AssistantIcon /></span>
            <span className="option-text">
              <strong>{t("home.ia.title")}</strong>
              <span>{t("home.ia.desc")}</span>
            </span>
            <span className="option-arrow" aria-hidden="true"><ArrowIcon /></span>
          </button>
        </section>
      </section>
    </main>
  );
}

export default HomeScreen;
