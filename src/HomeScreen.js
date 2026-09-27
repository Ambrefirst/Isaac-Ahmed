import React, { useEffect, useState } from "react";
import "./HomeScreen.css";
import { useLanguage } from "./i18n";
import Orb from "./Orb";
import { audioDisponible } from "./services/audioService";

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

function HomeScreen({ onAppointment, onAssistant, onParler, onWelcome }) {
  const { t, language } = useLanguage();
  const heure = useLocalTime(language);

  function openBackOffice() {
    window.location.href = "/admin/";
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
        <div className="home-orb-zone">
          <button className="home-orb-button" onClick={onAssistant} aria-label={t("home.orbAria")}>
            <Orb state="repos" size={190} />
          </button>
          {audioDisponible && (
            <button className="home-parler" onClick={onParler}>
              <span className="home-parler-icone" aria-hidden="true"><MicroIcon /></span>
              {t("voix.ouvrir")}
            </button>
          )}
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
