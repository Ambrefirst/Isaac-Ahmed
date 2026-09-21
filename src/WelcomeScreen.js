import React from "react";
import "./WelcomeScreen.css";
import { useLanguage } from "./i18n";

export default function WelcomeScreen({ onStart }) {
  const { t } = useLanguage();
  return (
    <main className="welcome-page">
      <section className="welcome-panel">
        <img className="welcome-logo" src="/logo-st-digital.png" alt="ST Digital Data Center Services" />
        <p className="eyebrow">{t("welcome.eyebrow")}</p>
        <h1>{t("welcome.title")}</h1>
        <p className="welcome-copy">{t("welcome.copy")}</p>
        <button className="primary-action" onClick={onStart}>{t("welcome.cta")}</button>
      </section>
    </main>
  );
}
