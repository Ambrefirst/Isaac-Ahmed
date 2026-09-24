import React, { useEffect, useRef, useState } from "react";
import "./ChatScreen.css";
import { useLanguage } from "./i18n";
import Orb from "./Orb";

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l16-8-6 16-2.5-6.5L4 12Z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Zm0 1.8c-3.6 0-7 1.9-7 4.3V21h14v-2.9c0-2.4-3.4-4.3-7-4.3Z" />
    </svg>
  );
}

// Ordre reel du traitement cote serveur. "quick" n'a pas d'etapes : une seule passe modele,
// il serait malhonnete d'afficher une recherche documentaire qui n'a pas lieu.
const ETAPES = ["understood", "searching", "writing"];
const CLEFS = {
  understood: "chat.step.understood",
  searching: "chat.step.searching",
  writing: "chat.step.writing",
};

function SequenceAttente({ phase, t }) {
  if (phase === "quick") {
    return (
      <div className="attente attente-simple">
        <span className="attente-rot" aria-hidden="true" />
        {t("chat.status.quick")}
      </div>
    );
  }
  const courante = phase === "searching" ? 1 : 2;
  return (
    <div className="attente">
      {ETAPES.map((etape, index) => {
        const etat = index < courante ? "fini" : index === courante ? "on" : "";
        return (
          <div className={`attente-etape ${etat}`.trim()} key={etape}>
            <span className="attente-marque" aria-hidden="true">
              {etat === "on" ? <span className="attente-rot" /> : <CheckIcon />}
            </span>
            {t(CLEFS[etape])}
          </div>
        );
      })}
      <div className="attente-jauge" aria-hidden="true"><i /></div>
    </div>
  );
}

const SUGGESTIONS = ["chat.suggest.hours", "chat.suggest.datacenter", "chat.suggest.visit", "chat.suggest.about"];

export default function ChatScreen({ messages, phase, typingText, busy, escalationOffer, onKeepWaiting, onEscalate, onSend, onMenu }) {
  const [input, setInput] = useState("");
  const { t } = useLanguage();
  const scrollRef = useRef(null);

  function submit(event) {
    event.preventDefault();
    if (busy) return;
    onSend(input);
    setInput("");
  }

  const displayMessages = [{ sender: "isaac", text: t("chat.greeting") }, ...messages];
  // Les suggestions n'ont de sens qu'au tout debut : apres, le visiteur sait quoi demander.
  const montrerSuggestions = messages.length === 0 && !busy;

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [displayMessages.length, phase, typingText]);

  function renderMessage(message, key) {
    const isIsaac = message.sender !== "visitor";
    return (
      <article className={`message ${message.sender}`} key={key}>
        <div className="message-row">
          {isIsaac && (
            <span className="message-avatar" aria-hidden="true">
              <PersonIcon />
            </span>
          )}
          <div>
            <span className="sender-label">{isIsaac ? t("chat.isaac") : t("chat.you")}</span>
            <p className="bubble">{message.text}</p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <main className="chat-page">
      <section className="chat-shell">
        <header className="screen-header">
          <button onClick={onMenu} aria-label={t("chat.back")}><BackIcon /></button>
          <span className="chat-portrait" aria-hidden="true">
            <PersonIcon />
            <i className="chat-dispo" />
          </span>
          <div>
            <h1>{t("chat.title")}</h1>
            <p>{t("chat.subtitle")}</p>
          </div>
          {/* La sphere suit la conversation : au repos, puis en reflexion pendant le traitement. */}
          <Orb className="chat-orb" state={phase ? "pense" : "repos"} size={54} />
        </header>

        <section className="chat-messages" aria-live="polite" ref={scrollRef}>
          {displayMessages.map((message, index) => renderMessage(message, `${message.sender}-${index}`))}
          {typingText !== null && renderMessage({ sender: "isaac", text: <>{typingText}<span className="typing-caret" aria-hidden="true" /></> }, "typing")}
          {phase && <SequenceAttente phase={phase} t={t} />}
        </section>

        {montrerSuggestions && (
          <div className="chat-suggestions">
            {SUGGESTIONS.map((clef) => (
              <button type="button" className="chat-suggestion" key={clef} onClick={() => onSend(t(clef))}>
                {t(clef)}
              </button>
            ))}
          </div>
        )}

        {escalationOffer && (
          <div className="escalation-card">
            <p>{t("chat.escalation.title")}</p>
            <div className="escalation-actions">
              <button type="button" className="ghost" onClick={onKeepWaiting}>{t("chat.escalation.wait")}</button>
              <button type="button" className="primary" onClick={onEscalate}>{t("chat.escalation.escalate")}</button>
            </div>
          </div>
        )}

        <form className="chat-input" onSubmit={submit}>
          <input
            required
            disabled={busy}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label={t("chat.ariaLabel")}
            placeholder={t("chat.placeholder")}
          />
          <button disabled={busy} aria-label={t("chat.send")}><SendIcon /></button>
        </form>
      </section>
    </main>
  );
}
