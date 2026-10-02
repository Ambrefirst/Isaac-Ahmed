import React, { useEffect, useRef, useState } from "react";
import { avancement, estimationAttente } from "./services/attente";
import "./ChatScreen.css";
import { useLanguage } from "./i18n";
import Orb from "./Orb";
import { audioDisponible, creerEnregistreur, transcrire } from "./services/audioService";
import ConversationVocale from "./ConversationVocale";

function MicroIcon({ actif }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={actif ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" fill="none" />
      <path d="M12 17.5V21" fill="none" />
    </svg>
  );
}
/* L'icone reprend les barres de la sphere quand Isaac parle. Deux microphones
   cote a cote ne disaient pas lequel faisait quoi : le micro sert a dicter, ce
   bouton-ci sert a entendre Isaac. Le dessin doit porter cette difference, pas
   le seul emplacement. */
function OndeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 11v2" /><path d="M7.5 8v8" /><path d="M12 4.5v15" /><path d="M16.5 8v8" /><path d="M21 11v2" />
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
/* Une porte et une fleche qui sort. Le symbole d'arret — un cercle barre —
   aurait dit « eteindre la borne », ce que ce bouton ne fait pas : il clot une
   conversation, et la borne reste allumee pour le visiteur suivant. */
function PorteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <polyline points="16 16 20 12 16 8" />
      <line x1="20" y1="12" x2="10" y2="12" />
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

/* La barre d'attente, reglee sur ce qu'Isaac met REELLEMENT.

   Elle etait figee a cent secondes — la duree observee le jour ou elle a ete
   ecrite. La borne repond desormais en quelques secondes : la barre ne
   bougeait plus, et annoncait une attente disparue. Plutot que de lui donner
   une nouvelle duree fixe, qui redeviendrait fausse au prochain changement,
   elle suit la mediane des dernieres reponses.

   Elle n'atteint jamais cent pour cent d'elle-meme : seule l'arrivee de la
   reponse la remplit. Une barre qui annonce « termine » avant la fin fait
   croire a une panne a partir de cet instant. */
function JaugeAttente() {
  const [part, setPart] = useState(0);

  useEffect(() => {
    const estimation = estimationAttente();
    const depart = Date.now();
    let image = null;
    const avancer = () => {
      setPart(avancement(Date.now() - depart, estimation));
      image = window.requestAnimationFrame(avancer);
    };
    avancer();
    return () => image && window.cancelAnimationFrame(image);
  }, []);

  return (
    <div className="attente-jauge" aria-hidden="true">
      <i style={{ width: `${(part * 100).toFixed(1)}%` }} />
    </div>
  );
}

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
      <JaugeAttente />
    </div>
  );
}

const SUGGESTIONS = ["chat.suggest.hours", "chat.suggest.datacenter", "chat.suggest.visit", "chat.suggest.about"];

export default function ChatScreen({ messages, phase, typingText, busy, escalationOffer, contactDemande, finProche, sessionFinie, onResterLa, onTerminer, onKeepWaiting, onEscalate, onSend, onMenu }) {
  const [input, setInput] = useState("");
  const { t, language } = useLanguage();
  const scrollRef = useRef(null);

  /* --- voix ---------------------------------------------------------------
     Deux fonctions distinctes, et volontairement independantes : le visiteur
     peut vouloir parler sans qu'Isaac lui reponde a voix haute, ou l'inverse.
     Les lier aurait impose une borne sonore a qui ne veut que dicter. */
  const [ecoute, setEcoute] = useState(false);
  const [transcription, setTranscription] = useState(false);
  const [erreurVoix, setErreurVoix] = useState("");
  /* Ici, et seulement ici, la conversation parlee s'ouvre dans une fenetre :
     on est deja dans un fil de discussion, l'y superposer a du sens. Sur la
     borne d'accueil, au contraire, tout se passe autour de la sphere. */
  const [modeVocal, setModeVocal] = useState(false);
  const enregistreurRef = useRef(null);

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
        const texte = await transcrire(blob, { langue: language });
        /* La dictee remplit le champ de saisie, et rien de plus. C'est tout ce
           qu'on lui demande : ecrire a la place du clavier. L'envoi reste un
           geste du visiteur, sur la fleche, comme pour un texte tape.
           Une version precedente envoyait toute seule : combinee a la lecture
           a voix haute, elle faisait boucler la borne sur sa propre reponse. */
        setInput(texte);
      } catch (e) {
        setErreurVoix(e.message);
      } finally {
        setTranscription(false);
      }
      return;
    }
    try {
      /* L'apercu s'ecrit dans le champ, la ou le visiteur ecrirait a la main :
         il voit sa phrase se former a l'endroit ou il l'attend, et peut la
         corriger avant d'envoyer. */
      enregistreurRef.current = creerEnregistreur({ surApercu: setInput });
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
  }, []);


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
          {/* La sphere suit la conversation : au repos, puis en reflexion pendant
              le traitement. Le bouton de conversation parlee se place JUSTE
              DESSOUS, comme sur la borne : c'est la meme sphere, donc le meme
              geste, et le visiteur n'a rien de nouveau a apprendre. */}
          <div className="chat-orb-zone">
            {/* La sphere ne reagit PAS au traitement d'un message ecrit. Elle
                appartient a la conversation parlee, et elle se tient juste
                au-dessus du bouton qui l'ouvre : l'animer pendant un echange
                au clavier laisserait croire que le micro est actif. Le suivi
                d'un message ecrit se lit dans le fil, a sa place. */}
            <Orb className="chat-orb" state="repos" size={54} />
            {audioDisponible && (
              <button
                type="button"
                className="chat-orb-parler"
                onClick={() => setModeVocal(true)}
                title={t("voix.ouvrir")}
              >
                <OndeIcon />
                <span>{t("voix.parler")}</span>
              </button>
            )}
          </div>
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

        {/* La proposition ne vient plus d'une attente trop longue mais de la
            nature de la demande. Le texte suit donc le motif : un tarif n'est
            pas une question a laquelle Isaac a echoue, c'est une question
            qu'il n'a pas a trancher. */}
        {escalationOffer && (
          <div className="escalation-card">
            <p>{t(`chat.relais.${escalationOffer.motif}`)}</p>
            <div className="escalation-actions">
              <button type="button" className="ghost" onClick={onKeepWaiting}>{t("chat.relais.non")}</button>
              <button type="button" className="primary" onClick={onEscalate}>{t("chat.relais.oui")}</button>
            </div>
          </div>
        )}

        {/* Le meme champ qu'a l'oral, et pour la meme raison : c'est le seul
            renseignement qu'Isaac ne peut pas deduire, et le seul sans lequel
            le commercial ne peut pas repondre. Ici le visiteur a deja un
            clavier — le champ sert a valider la forme et a envoyer d'un geste,
            plutot qu'a esperer qu'il ecrive son adresse dans une phrase. */}
        {/* La fin approche : on le dit, et on laisse de quoi rester. Quelqu'un
            qui lit encore sa reponse ne doit pas etre puni de ne pas taper. */}
        {finProche && !!messages.length && (
          <div className="session-avis">
            <p>{t("chat.session.bientot")}</p>
            <button type="button" className="primary" onClick={onResterLa}>
              {t("chat.session.rester")}
            </button>
          </div>
        )}

        {/* Et quand c'est fait, on le dit aussi : un ecran vide sans
            explication se lit comme une perte, pas comme une protection. */}
        {sessionFinie && !messages.length && (
          <p className="session-finie" role="status">{t("chat.session.finie")}</p>
        )}

        {/* PAS D'ENCADRE DE SAISIE ICI — IL Y EN AVAIT UN, ET C'ETAIT UN
            DOUBLON. Un champ « votre adresse electronique » avec son bouton
            et son lien « plus tard », pose a dix pixels au-dessus du champ
            de la conversation : deux endroits pour taper, deux boutons pour
            envoyer, et il fallait deviner lequel servait a quoi.

            Sur la borne, en conversation PARLEE, ce champ a un sens : il n'y
            a rien d'autre pour ecrire. Dans un fil de discussion, aucun. On
            le dit donc dans le champ qui existe deja — voir le texte
            d'invite plus bas — et le visiteur repond comme il repond a tout
            le reste. L'application reconnait l'adresse avant d'appeler le
            modele ; ce chemin existe, il etait cache derriere l'encadre. */}
        {/* LE PIED DE CONVERSATION. « Terminer » vivait dans l'en-tete, coince
            entre le titre et la sphere : la regle generale des boutons d'en-tete
            lui imposait un cercle de 48 pixels, dans lequel le mot debordait
            sans cadre visible. Il n'avait l'air ni d'un bouton ni d'un lien.

            Il descend ici, au bas du fil, du cote ou l'on finit une
            conversation — a cote de la reprise de contact, et non plus en
            concurrence avec « Parler », qui est l'action principale de
            l'en-tete. Il reste au-DESSUS du champ de saisie : un clavier a
            l'ecran recouvre le bas de la page, et un bouton recouvert n'existe
            pas. */}
        {!!messages.length && (
          <div className="chat-pied">
            {/* Plus de lien « laisser mon adresse » : il rouvrait un encadre
                qui n'existe plus. L'adresse se donne a tout moment, en la
                tapant dans le champ de la conversation. */}
            <span />
            {/* Il n'apparait qu'avec une conversation a effacer : un bouton qui
                ne fait rien apprend a ne plus le regarder. */}
            <button type="button" className="chat-terminer" onClick={onTerminer}>
              <PorteIcon />
              <span>{t("chat.session.terminer")}</span>
            </button>
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
              aria-label={t(ecoute ? "chat.voice.stop" : "chat.voice.dicter")}
              title={t(ecoute ? "chat.voice.stop" : "chat.voice.dicter")}
            >
              {transcription ? <SablierIcon /> : <MicroIcon actif={ecoute} />}
            </button>
          )}
          <input
            required
            disabled={busy}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label={t("chat.ariaLabel")}
            /* QUAND ISAAC ATTEND UNE ADRESSE, LE CHAMP LE DIT. C'est ce qui
               remplace l'encadre : pas un second endroit pour ecrire, mais
               le meme, qui annonce ce qu'on attend de vous. */
            placeholder={t(ecoute ? "chat.voice.listening"
              : transcription ? "chat.voice.working"
              : contactDemande ? "chat.commercial.placeholder"
              : "chat.placeholder")}
          />
          <button disabled={busy || ecoute} aria-label={t("chat.send")}><SendIcon /></button>
        </form>
      </section>

      {/* La conversation parlee n'ecrit rien dans le fil : elle parle. Le
          parcours « je dicte puis j'envoie » existe deja, c'est le bouton micro
          du champ de saisie. */}
      {modeVocal && <ConversationVocale onFermer={() => setModeVocal(false)} />}

    </main>
  );
}
