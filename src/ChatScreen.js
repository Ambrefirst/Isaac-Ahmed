import React, { useEffect, useRef, useState } from "react";
import "./ChatScreen.css";
import { useLanguage } from "./i18n";

export default function ChatScreen({ messages, statusText, typingText, busy, escalationOffer, onKeepWaiting, onEscalate, onSend, onMenu }) {
  const [input, setInput] = useState("");
  const { t } = useLanguage();
  const scrollRef = useRef(null);
  function submit(event) { event.preventDefault(); if (busy) return; onSend(input); setInput(""); }
  const displayMessages = [{ sender: "isaac", text: t("chat.greeting") }, ...messages];

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [displayMessages.length, statusText, typingText]);

  function renderMessage(message, key, extraClass) {
    const isIsaac = message.sender !== "visitor";
    return <article className={`message ${message.sender}${extraClass ? ` ${extraClass}` : ""}`} key={key}>
      <div className="message-row">
        {isIsaac && <span className="message-avatar" aria-hidden="true">IA</span>}
        <div>
          <span className="sender-label">{isIsaac ? t("chat.isaac") : t("chat.you")}</span>
          <p className="bubble">{message.text}</p>
        </div>
      </div>
    </article>;
  }

  return <main className="chat-page"><section className="chat-shell"><header className="screen-header"><button onClick={onMenu} aria-label={t("chat.back")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg></button><div><h1>{t("chat.title")}</h1><p>{t("chat.subtitle")}</p></div></header><section className="chat-messages" aria-live="polite" ref={scrollRef}>{displayMessages.map((message, index) => renderMessage(message, `${message.sender}-${index}`))}{typingText !== null && renderMessage({ sender: "isaac", text: <>{typingText}<span className="typing-caret" aria-hidden="true" /></> }, "typing")}{statusText && renderMessage({ sender: "isaac", text: statusText }, "status", "message-status")}</section>{escalationOffer && <div className="escalation-card"><p>{t("chat.escalation.title")}</p><div className="escalation-actions"><button type="button" className="ghost" onClick={onKeepWaiting}>{t("chat.escalation.wait")}</button><button type="button" className="primary" onClick={onEscalate}>{t("chat.escalation.escalate")}</button></div></div>}<form className="chat-input" onSubmit={submit}><input required disabled={busy} value={input} onChange={(event) => setInput(event.target.value)} aria-label={t("chat.ariaLabel")} placeholder={t("chat.placeholder")} /><button disabled={busy} aria-label={t("chat.send")}>➤</button></form></section></main>;
}
