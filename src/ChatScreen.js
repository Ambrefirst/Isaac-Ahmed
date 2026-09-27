import React, { useEffect, useRef, useState } from "react";
import "./ChatScreen.css";
import { useLanguage } from "./i18n";
import Orb from "./Orb";
import { audioDisponible, creerEnregistreur, synthetiser, transcrire } from "./services/audioService";

function MicroIcon({ actif }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={actif ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" fill="none" />
      <path d="M12 17.5V21" fill="none" />
    </svg>
  );
}
function SablierIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9" />
    </svg>
  );
}
function HautParleurIcon({ actif }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {actif ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="m16.5 9.5 4 5M20.5 9.5l-4 5" />}
    </svg>
  );
}

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

  /* --- voix ---------------------------------------------------------------
     Deux fonctions distinctes, et volontairement independantes : le visiteur
     peut vouloir parler sans qu'Isaac lui reponde a voix haute, ou l'inverse.
     Les lier aurait impose une borne sonore a qui ne veut que dicter. */
  const [ecoute, setEcoute] = useState(false);
  const [transcription, setTranscription] = useState(false);
  const [erreurVoix, setErreurVoix] = useState("");
  const [apercu, setApercu] = useState("");
  /* Sur une borne, Isaac parle par defaut : un visiteur qui vient de dicter sa
     question attend une reponse a voix haute, et personne ne va chercher un
     bouton pour l'activer. Il reste coupable d'un geste. */
  const [lectureActive, setLectureActive] = useState(audioDisponible);
  const enregistreurRef = useRef(null);
  const lecteurRef = useRef(null);
  const dernierLuRef = useRef(-1);

  function submit(event) {
    event.preventDefault();
    if (busy) return;
    onSend(input);
    setInput("");
  }

  async function basculerMicro() {
    setErreurVoix("");
    if (ecoute) {
      setEcoute(false);
      setTranscription(true);
      try {
        const blob = await enregistreurRef.current.arreter();
        const texte = await transcrire(blob);
        setApercu("");
        /* Le visiteur a appuye pour dire qu'il avait fini : sa question part.
           Lui demander un second geste sur la fleche apres avoir parle casse le
           mouvement, et sur une borne d'accueil personne ne relit son texte
           avant de l'envoyer. Le texte reste visible dans la conversation, et
           il peut toujours reformuler si la reconnaissance s'est trompee. */
        if (texte && !busy) {
          onSend(texte);
          setInput("");
        } else {
          setInput(texte);
        }
      } catch (e) {
        setApercu("");
        setErreurVoix(e.message);
      } finally {
        setTranscription(false);
      }
      return;
    }
    try {
      setApercu("");
      enregistreurRef.current = creerEnregistreur({ surApercu: setApercu });
      await enregistreurRef.current.demarrer();
      setEcoute(true);
    } catch (e) {
      setErreurVoix(t("chat.voice.micRefuse"));
    }
  }

  /* Le micro doit etre rendu si le visiteur quitte l'ecran en cours
     d'enregistrement : une piste laissee ouverte garde la diode allumee, ce
     qui est inacceptable sur une borne d'accueil. */
  useEffect(() => () => {
    if (enregistreurRef.current) enregistreurRef.current.liberer();
    if (lecteurRef.current) lecteurRef.current.pause();
  }, []);

  /* Lecture a voix haute de la derniere reponse d'Isaac, quand elle est
     demandee. On repere le message par son rang : sans cela, deux reponses
     identiques a la suite ne seraient lues qu'une fois. */
  useEffect(() => {
    if (!lectureActive || busy) return;
    const dernier = messages.length - 1;
    if (dernier < 0 || dernier === dernierLuRef.current) return;
    const message = messages[dernier];
    if (!message || message.sender === "visitor" || !message.text) return;
    dernierLuRef.current = dernier;
    let annule = false;
    synthetiser(message.text)
      .then((url) => {
        if (annule || !url) return;
        if (lecteurRef.current) lecteurRef.current.pause();
        const audio = new Audio(url);
        lecteurRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch(() => URL.revokeObjectURL(url));
      })
      .catch(() => {
        /* Une synthese indisponible ne doit pas interrompre la conversation :
           la reponse reste lisible a l'ecran. */
      });
    return () => { annule = true; };
  }, [messages, lectureActive, busy]);

  const displayMessages = [{ sender: "isaac", text: t("chat.greeting") }, ...messages];
  // Les suggestions n'ont de sens qu'au tout debut : apres, le visiteur sait quoi demander.
  const montrerSuggestions = messages.length === 0 && !busy;

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [displayMessages.length, phase, typingText, apercu, ecoute]);

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
          {audioDisponible && (
            <button
              type="button"
              className={`chat-lecture ${lectureActive ? "active" : ""}`}
              onClick={() => {
                if (lectureActive && lecteurRef.current) lecteurRef.current.pause();
                /* On repart du dernier message : reactiver la lecture ne doit
                   pas faire relire tout l'historique. */
                dernierLuRef.current = messages.length - 1;
                setLectureActive(!lectureActive);
              }}
              aria-pressed={lectureActive}
              aria-label={t(lectureActive ? "chat.voice.muteOff" : "chat.voice.muteOn")}
              title={t(lectureActive ? "chat.voice.muteOff" : "chat.voice.muteOn")}
            >
              <HautParleurIcon actif={lectureActive} />
            </button>
          )}
          {/* La sphere suit la conversation : au repos, puis en reflexion pendant le traitement. */}
          <Orb className="chat-orb" state={phase ? "pense" : "repos"} size={54} />
        </header>

        <section className="chat-messages" aria-live="polite" ref={scrollRef}>
          {displayMessages.map((message, index) => renderMessage(message, `${message.sender}-${index}`))}
          {typingText !== null && renderMessage({ sender: "isaac", text: <>{typingText}<span className="typing-caret" aria-hidden="true" /></> }, "typing")}
          {/* Bulle provisoire pendant que le visiteur parle : elle se remplit au
              fil de la dictee, pour qu'il voie qu'il est entendu sans attendre
              la fin. Le texte n'est pas definitif, d'ou le trait pointille. */}
          {(ecoute || transcription) && renderMessage({
            sender: "visitor",
            text: apercu
              ? <span className="apercu-dictee">{apercu}<span className="typing-caret" aria-hidden="true" /></span>
              : <span className="apercu-dictee attente">{t(transcription ? "chat.voice.working" : "chat.voice.listening")}</span>,
          }, "apercu")}
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

        {erreurVoix && <p className="chat-voix-erreur" role="alert">{erreurVoix}</p>}

        <form className="chat-input" onSubmit={submit}>
          {audioDisponible && (
            <button
              type="button"
              className={`chat-micro ${ecoute ? "ecoute" : ""}`}
              onClick={basculerMicro}
              disabled={busy || transcription}
              aria-pressed={ecoute}
              aria-label={t(ecoute ? "chat.voice.stop" : "chat.voice.start")}
              title={t(ecoute ? "chat.voice.stop" : "chat.voice.start")}
            >
              {transcription ? <SablierIcon /> : <MicroIcon actif={ecoute} />}
            </button>
          )}
          <input
            required
            disabled={busy || ecoute || transcription}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label={t("chat.ariaLabel")}
            placeholder={t(ecoute ? "chat.voice.listening" : transcription ? "chat.voice.working" : "chat.placeholder")}
          />
          <button disabled={busy || ecoute || transcription} aria-label={t("chat.send")}><SendIcon /></button>
        </form>
      </section>
    </main>
  );
}
