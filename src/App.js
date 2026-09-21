import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import WelcomeScreen from "./WelcomeScreen";
import HomeScreen from "./HomeScreen";
import RendezVousScreen from "./RendezVousScreen";
import ChatScreen from "./ChatScreen";
import { askIsaac, escalateToStaff } from "./services/aiService";
import { useLanguage } from "./i18n";

const TYPE_CHAR_DELAY_MS = 18;
const RETRIEVAL_PHASE_MS = 4000; // approx. observed embeddings + vector search time before generation starts
const ESCALATION_DELAY_MS = 18000; // on a kiosk, nobody should stand and wait indefinitely with no way out

// Mirrors the server-side heuristic (complexity_detector.js in the n8n workflow) so the
// status shown here matches which real path the request will actually take.
const TOPIC_KEYWORDS = [
  "horaire", "service", "tarif", "prix", "adresse", "localisation", "situe",
  "data center", "datacenter", "centre de donnees", "rendez-vous", "rendez vous", "rdv",
  "cloud", "securite", "certification", "contact", "email", "telephone", "ouvert", "ferme",
  "visite", "gabon", "cameroun", "ivoire", "entreprise", "client", "offre", "solution",
  "hours", "price", "address", "contact", "security", "visit", "appointment", "office",
];
function looksSimple(message, history) {
  const raw = message.trim();
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  const hasQuestionMark = /\?/.test(raw);
  const normalized = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const mentionsTopic = TOPIC_KEYWORDS.some((k) => normalized.includes(k));
  const lastTurn = history && history[history.length - 1];
  const answeringOwnQuestion = !!lastTurn && lastTurn.sender !== "visitor" && /\?\s*$/.test((lastTurn.text || "").trim());
  return (wordCount <= 6 && !hasQuestionMark && !mentionsTopic) || answeringOwnQuestion;
}

function App() {
  const { t, language } = useLanguage();
  const [screen, setScreen] = useState("welcome");
  const [messages, setMessages] = useState([]);
  const [statusText, setStatusText] = useState(null); // null while idle, rotating phrase text while waiting
  const [typingText, setTypingText] = useState(null); // null while not typing, string while typing out an answer
  const [escalationOffer, setEscalationOffer] = useState(null); // pending question text once the wait has gone on too long, else null
  const timers = useRef([]);
  const abortRef = useRef(null);
  const escalatedRef = useRef(false);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function typeOutAnswer(answer) {
    return new Promise((resolve) => {
      let shown = 0;
      setTypingText("");
      function tick() {
        shown += 1;
        setTypingText(answer.slice(0, shown));
        if (shown < answer.length) {
          timers.current.push(setTimeout(tick, TYPE_CHAR_DELAY_MS));
        } else {
          setTypingText(null);
          setMessages((current) => [...current, { sender: "isaac", text: answer }]);
          resolve();
        }
      }
      tick();
    });
  }

  async function sendMessage(message) {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;
    const history = messages;
    setMessages((current) => [...current, { sender: "visitor", text: cleanMessage }]);

    const controller = new AbortController();
    abortRef.current = controller;
    escalatedRef.current = false;

    let retrievalTimer = null;
    let escalationTimer = null;
    if (looksSimple(cleanMessage, history)) {
      // Single direct model call, no document search -- one honest status, no fake staging.
      setStatusText(t("chat.status.quick"));
    } else {
      // Real two-stage pipeline, in the order it actually executes: retrieval, then generation.
      setStatusText(t("chat.status.retrieving"));
      retrievalTimer = setTimeout(() => setStatusText(t("chat.status.generating")), RETRIEVAL_PHASE_MS);
      timers.current.push(retrievalTimer);
      // On a kiosk especially, nobody should be left standing with no way out of a long wait.
      escalationTimer = setTimeout(() => setEscalationOffer(cleanMessage), ESCALATION_DELAY_MS);
      timers.current.push(escalationTimer);
    }

    let answer;
    try {
      answer = await askIsaac(cleanMessage, history, language, controller.signal);
    } catch (err) {
      if (escalatedRef.current) return; // visitor already chose to escalate; drop the aborted request silently
      answer = t("chat.fallbackError");
    }
    if (retrievalTimer) clearTimeout(retrievalTimer);
    if (escalationTimer) clearTimeout(escalationTimer);
    setEscalationOffer(null);
    setStatusText(null);
    await typeOutAnswer(answer);
  }

  function keepWaiting() {
    setEscalationOffer(null);
  }

  async function escalate() {
    const question = escalationOffer;
    escalatedRef.current = true;
    if (abortRef.current) abortRef.current.abort();
    timers.current.forEach(clearTimeout);
    setEscalationOffer(null);
    setStatusText(null);
    try {
      await escalateToStaff(question);
      await typeOutAnswer(t("chat.escalated"));
    } catch (err) {
      await typeOutAnswer(t("chat.escalateFailed"));
    }
  }

  if (screen === "welcome") return <WelcomeScreen onStart={() => setScreen("home")} />;
  if (screen === "rdv") return <RendezVousScreen onMenu={() => setScreen("home")} />;
  if (screen === "chat")
    return (
      <ChatScreen
        messages={messages}
        statusText={statusText}
        typingText={typingText}
        busy={statusText !== null || typingText !== null}
        escalationOffer={escalationOffer}
        onKeepWaiting={keepWaiting}
        onEscalate={escalate}
        onSend={sendMessage}
        onMenu={() => setScreen("home")}
      />
    );
  return <HomeScreen onAppointment={() => setScreen("rdv")} onAssistant={() => setScreen("chat")} onWelcome={() => setScreen("welcome")} />;
}

export default App;
