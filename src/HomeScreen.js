import React, { useState } from "react";
import "./HomeScreen.css";
import { useLanguage } from "./i18n";

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
function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17l-6.1 3.5 1.4-6.8-5.1-4.7 6.9-.7Z" />
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

function HomeScreen({ onAppointment, onAssistant, onWelcome }) {
  const { t } = useLanguage();
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

        <section className="home-hero">
          <div className="home-hero-text">
            <span className="eyebrow">{t("home.eyebrow")}</span>
            <span className="accent-dash" />
            <h1>{t("home.title1")}<br />{t("home.title2")}</h1>
            <p className="home-subtitle">{t("home.subtitle")}</p>
            <span className="home-badge">{t("home.badge1")} <i>•</i> {t("home.badge2")} <i>•</i> {t("home.badge3")}</span>
          </div>
          <div className="home-orb-col">
            <div className="home-orb">
              <div className="home-orb-ring ring-outer" />
              <div className="home-orb-ring ring-inner" />
              <div className="home-orb-mark">
                <img src="/logo-mark.png" alt="ST Digital" />
              </div>
            </div>
            <div className="home-orb-base" />
          </div>
        </section>

        <div className="home-parcours-label"><span className="accent-dash" />{t("home.parcours")}</div>

        <section className="home-options">
          <button className="home-option" onClick={onAppointment}>
            <div className="option-icon">RDV</div>
            <div className="option-text">
              <h2>{t("home.rdv.title")}</h2>
              <p>{t("home.rdv.desc")}</p>
            </div>
            <span className="option-arrow">→</span>
          </button>

          <button className="home-option home-option-highlight" onClick={onAssistant}>
            <div className="option-icon option-icon-dark">IA</div>
            <div className="option-text">
              <h2>{t("home.ia.title")}</h2>
              <p>{t("home.ia.desc")}</p>
            </div>
            <span className="option-arrow">→</span>
          </button>
        </section>

        <footer className="home-trust-bar">
          <span><ShieldIcon />{t("home.trust.secure")}</span>
          <span className="dot" aria-hidden="true">•</span>
          <span><ClockIcon />{t("home.trust.available")}</span>
          <span className="dot" aria-hidden="true">•</span>
          <span><StarIcon />{t("home.trust.tech")}</span>
        </footer>
      </section>
    </main>
  );
}

export default HomeScreen;
