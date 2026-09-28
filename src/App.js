import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import WelcomeScreen from "./WelcomeScreen";
import HomeScreen from "./HomeScreen";
import RendezVousScreen from "./RendezVousScreen";
import ChatScreen from "./ChatScreen";
import { askIsaac, escalateToStaff } from "./services/aiService";
import { relaisNecessaire } from "./services/relaisHumain";
import { useLanguage } from "./i18n";

const TYPE_CHAR_DELAY_MS = 18;
const RETRIEVAL_PHASE_MS = 4000; // approx. observed embeddings + vector search time before generation starts

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
  // Phase de traitement reellement en cours, ou null au repos. Sert a la fois a la sequence
  // affichee au visiteur et a l'etat de la sphere : aucune etape n'est simulee.
  const [phase, setPhase] = useState(null); // null | "quick" | "searching" | "writing"
  const [typingText, setTypingText] = useState(null); // null while not typing, string while typing out an answer
  /* Proposition de mise en relation : { question, motif } quand la demande
     appelle une personne, null sinon. Le motif distingue « Isaac n'a pas su »
     de « ce sujet engage l'entreprise » : l'ecran ne dit pas la meme chose. */
  const [escalationOffer, setEscalationOffer] = useState(null);
  const timers = useRef([]);
  const abortRef = useRef(null);
  const escalatedRef = useRef(false);
  /* Minuterie d'effacement du fil. Voir l'en-tete du fichier : une borne est
     partagee, et ce qu'un visiteur a demande ne regarde pas le suivant. */
  const oubliRef = useRef(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Photo du Data Center en arriere-plan. Sert uniquement de decor : opacite reglee
  // dans index.css (--fond-opacite), volontairement basse pour ne pas nuire a la lisibilite.
  useEffect(() => {
    const url = `${process.env.PUBLIC_URL || ""}/fond-datacenter.jpg`;
    document.documentElement.style.setProperty("--fond-image", `url("${url}")`);
  }, []);

  /* --- confidentialite du fil ---------------------------------------------- */

  const GRACE_APRES_SORTIE = 2 * 60 * 1000;   // sortir par erreur ne doit pas punir
  const OUBLI_SI_INACTIF = 5 * 60 * 1000;     // parti sans rien dire : il ne revient pas
  const ECHANGES_GARDES = 20;                 // au-dela, les plus anciens tombent

  /* Une borne ne garde pas un historique sans fin : au-dela de vingt echanges,
     les plus anciens tombent. Cela borne ce qu'un curieux peut remonter en
     faisant defiler, et ce qui repart au modele a chaque question. */
  function garde(liste) {
    return liste.length > ECHANGES_GARDES ? liste.slice(-ECHANGES_GARDES) : liste;
  }

  function annuleOubli() {
    if (oubliRef.current) {
      clearTimeout(oubliRef.current);
      oubliRef.current = null;
    }
  }

  function oublieLeFil() {
    annuleOubli();
    setMessages([]);
    setEscalationOffer(null);
    escalatedRef.current = false;
  }

  function programmeOubli(delai) {
    annuleOubli();
    oubliRef.current = setTimeout(oublieLeFil, delai);
  }

  /* Quitter l'ecran de discussion arme la minuterie ; y revenir la desarme.
     C'est ce qui distingue « je suis sorti par erreur » de « j'ai fini ». */
  useEffect(() => {
    if (screen === "chat") { annuleOubli(); return undefined; }
    if (screen === "welcome") { oublieLeFil(); return undefined; }
    programmeOubli(GRACE_APRES_SORTIE);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  /* Reste ouvert mais plus personne devant : on efface aussi. La minuterie
     repart a chaque message, donc une vraie conversation ne la declenche pas. */
  useEffect(() => {
    if (screen !== "chat" || !messages.length) return undefined;
    const m = setTimeout(oublieLeFil, OUBLI_SI_INACTIF);
    return () => clearTimeout(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, messages]);

  useEffect(() => () => annuleOubli(), []);

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
          setMessages((current) => garde([...current, { sender: "isaac", text: answer }]));
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
    setMessages((current) => garde([...current, { sender: "visitor", text: cleanMessage }]));

    const controller = new AbortController();
    abortRef.current = controller;
    escalatedRef.current = false;

    let retrievalTimer = null;
    if (looksSimple(cleanMessage, history)) {
      // Single direct model call, no document search -- one honest status, no fake staging.
      setPhase("quick");
    } else {
      // Real two-stage pipeline, in the order it actually executes: retrieval, then generation.
      setPhase("searching");
      retrievalTimer = setTimeout(() => setPhase("writing"), RETRIEVAL_PHASE_MS);
      timers.current.push(retrievalTimer);
    }

    let answer;
    try {
      answer = await askIsaac(cleanMessage, history, language, controller.signal);
    } catch (err) {
      if (escalatedRef.current) return; // visitor already chose to escalate; drop the aborted request silently
      answer = t("chat.fallbackError");
    }
    if (retrievalTimer) clearTimeout(retrievalTimer);
    setEscalationOffer(null);
    setPhase(null);
    await typeOutAnswer(answer);

    /* La proposition de mise en relation vient APRES la reponse, et depend de
       ce qui a ete demande — plus de la duree de l'attente. Un tarif, un
       contrat, une disponibilite reelle : ce sont des sujets qui engagent
       l'entreprise, et une borne d'accueil n'a pas a s'engager a sa place. */
    const motif = relaisNecessaire(cleanMessage, answer);
    if (motif) setEscalationOffer({ question: cleanMessage, motif });
  }

  function keepWaiting() {
    setEscalationOffer(null);
  }

  async function escalate() {
    const question = escalationOffer && escalationOffer.question;
    escalatedRef.current = true;
    setEscalationOffer(null);
    setPhase(null);
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
        phase={phase}
        typingText={typingText}
        busy={phase !== null || typingText !== null}
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
