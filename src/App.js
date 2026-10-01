import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import WelcomeScreen from "./WelcomeScreen";
import HomeScreen from "./HomeScreen";
import RendezVousScreen from "./RendezVousScreen";
import ChatScreen from "./ChatScreen";
import { askIsaac, escalateToStaff, prevenirService } from "./services/aiService";
import { surPlace } from "./services/presence";
import { enregistreDuree } from "./services/attente";
import { contactDit, relaisCommercial, relaisNecessaire } from "./services/relaisHumain";
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
  /* La demande commerciale deja transmise dans cette conversation, s'il y en a
     une. Elle evite d'envoyer un courriel par question a quelqu'un qui insiste,
     et sert d'ancrage quand le visiteur donne son numero deux phrases plus loin. */
  const commercialRef = useRef(null);
  /* La demande dont on attend une adresse, ou null : elle affiche le champ. */
  const [contactDemande, setContactDemande] = useState(null);
  /* Trois etats possibles du fil : vivant, bientot efface, efface. Le dernier
     n'est pas un detail d'affichage — sans lui, le visiteur qui revient trouve
     un ecran vide et croit avoir tout perdu par sa faute. */
  const [finProche, setFinProche] = useState(false);
  const [sessionFinie, setSessionFinie] = useState(false);
  /* Bouge a chaque signe de vie : c'est ce qui relance la minuterie. */
  const [reveil, setReveil] = useState(0);
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
  /* ON PREVIENT AVANT D'EFFACER.

     Le fil disparaissait d'un coup, sans un mot. La regle est bonne — une
     borne est partagee, et ce qu'un visiteur a demande ne regarde pas le
     suivant — mais l'executer en silence donne l'impression d'une panne, et
     punit celui qui lisait encore sa reponse.

     On annonce donc la fin une minute avant, avec de quoi rester. Quelqu'un
     qui est toujours la n'est jamais coupe : il repousse l'echeance autant de
     fois qu'il veut. La purge ne frappe que les fils que PERSONNE ne regarde,
     ce qui etait son but depuis le debut. */
  const PREAVIS_AVANT_OUBLI = 60 * 1000;

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
    /* Le visiteur suivant n'herite pas de la demande commerciale du precedent :
       sans cette remise a zero, le service ne serait plus prevenu du tout, et
       un numero dicte irait completer le besoin de quelqu'un d'autre. */
    commercialRef.current = null;
    setContactDemande(null);
    setFinProche(false);
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
    const avertit = setTimeout(() => setFinProche(true), OUBLI_SI_INACTIF - PREAVIS_AVANT_OUBLI);
    const efface = setTimeout(() => {
      oublieLeFil();
      /* On le DIT. Un ecran qui se vide sans explication se lit comme une
         perte, pas comme une protection. */
      setSessionFinie(true);
    }, OUBLI_SI_INACTIF);
    return () => { clearTimeout(avertit); clearTimeout(efface); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, messages, reveil]);

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

  /* TERMINER, TOUT DE SUITE ET SUR DEMANDE.

     Il n'existait aucun moyen de clore soi-meme : la fleche de retour ramene
     au menu et arme une minuterie de deux minutes, pendant lesquelles le fil
     reste lisible. Quelqu'un qui vient de poser une question personnelle et
     qui s'eloigne n'a aucune facon de l'effacer derriere lui.

     La minuterie reste utile — elle rattrape ceux qui partent sans rien dire —
     mais elle ne remplace pas un geste volontaire. */
  function terminerSession() {
    oublieLeFil();
    setSessionFinie(true);
  }

  /* « Je suis toujours la » : on repousse l'echeance, sans rien effacer. */
  function resterLa() {
    setFinProche(false);
    setReveil((n) => n + 1);
  }

  async function sendMessage(message) {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;
    /* Ecrire est un signe de vie : il vaut le bouton. */
    setFinProche(false);
    setSessionFinie(false);
    const history = messages;
    setMessages((current) => garde([...current, { sender: "visitor", text: cleanMessage }]));

    /* UNE ADRESSE N'EST PAS UNE QUESTION.

       Quand Isaac vient de demander un moyen de contact, ce que le visiteur
       ecrit ensuite est une reponse a cette demande — pas une nouvelle
       question. La poser au modele produit ce qu'elle a produit le 01/10 :
       « Pouvez-vous me dire quel service vous souhaitez contacter ? », suivi
       seulement apres du « c'est note » qui etait la vraie reponse. Deux
       messages, dont un absurde, et huit secondes d'attente pour l'obtenir.

       On traite donc le contact AVANT d'appeler le modele, et on s'arrete la. */
    if (commercialRef.current) {
      const contact = contactDit(cleanMessage);
      if (contact) {
        setContactDemande(null);
        const parti = await prevenirService(commercialRef.current, {
          service: "commercial", surPlace: surPlace(), mode: "chat", contact,
        });
        await typeOutAnswer(t(parti ? "chat.commercial.contact" : "chat.escalateFailed"));
        return;
      }
    }

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

    /* On chronometre pour que la barre d'attente se regle sur la realite
       plutot que sur une constante ecrite un jour donne. */
    const debutReponse = Date.now();
    let answer;
    try {
      answer = await askIsaac(cleanMessage, history, language, controller.signal);
      enregistreDuree(Date.now() - debutReponse);
    } catch (err) {
      if (escalatedRef.current) return; // visitor already chose to escalate; drop the aborted request silently
      answer = t("chat.fallbackError");
    }
    if (retrievalTimer) clearTimeout(retrievalTimer);
    setEscalationOffer(null);
    setPhase(null);
    await typeOutAnswer(answer);

    /* UNE DEMANDE COMMERCIALE NE SE PROPOSE PAS, ELLE SE TRANSMET.

       « Combien coûterait l'hébergement de mon site ? » n'a pas de réponse
       dans une base documentaire, et n'en aura jamais : le prix dépend du
       volume, du trafic, de la durée, de l'existant. Isaac ne connaît aucun
       de ces paramètres, et seul un commercial est habilité à les chiffrer.
       Chercher plus loin serait perdre du temps ; demander au visiteur s'il
       veut être mis en relation, c'est lui faire porter une décision qui est
       déjà prise par la nature de sa question.

       Le service commercial est donc prévenu TOUT DE SUITE, une fois par
       conversation, avec la demande telle qu'elle a été posée. Le bouton de
       mise en relation reste pour les autres cas — ceux où une personne peut
       aider sans qu'on sache encore laquelle. */
    if (relaisCommercial(cleanMessage, answer) && !commercialRef.current) {
      commercialRef.current = cleanMessage;
      const ici = surPlace();
      const parti = await prevenirService(cleanMessage, {
        service: "commercial", surPlace: ici, mode: "chat",
      });
      await typeOutAnswer(
        t(parti ? (ici ? "chat.commercial.surplace" : "chat.commercial.adistance") : "chat.escalateFailed")
      );
      if (parti) setContactDemande(cleanMessage);
      return;
    }

    /* La proposition de mise en relation vient APRES la reponse, et depend de
       ce qui a ete demande — plus de la duree de l'attente. Un tarif, un
       contrat, une disponibilite reelle : ce sont des sujets qui engagent
       l'entreprise, et une borne d'accueil n'a pas a s'engager a sa place. */
    const motif = relaisNecessaire(cleanMessage, answer);
    if (motif) setEscalationOffer({ question: cleanMessage, motif });
  }

  async function envoyerContact(valeur) {
    const demande = contactDemande || commercialRef.current;
    if (!valeur || !demande) return false;
    setContactDemande(null);
    const parti = await prevenirService(demande, {
      service: "commercial", surPlace: surPlace(), mode: "chat", contact: valeur,
    });
    await typeOutAnswer(t(parti ? "chat.commercial.contact" : "chat.escalateFailed"));
    return parti;
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
      /* On dit a l'equipe d'ou vient la demande : sans cela, elle recoit une
         question sans savoir s'il faut descendre a l'accueil ou rappeler. */
      const ici = surPlace();
      await escalateToStaff(question, ici);
      await typeOutAnswer(t(ici ? "chat.escalated.surplace" : "chat.escalated.adistance"));
    } catch (err) {
      await typeOutAnswer(t("chat.escalateFailed"));
    }
  }

  if (screen === "welcome") return <WelcomeScreen onStart={() => setScreen("home")} />;
  if (screen === "rdv") return <RendezVousScreen onMenu={() => setScreen("home")} />;
  if (screen === "chat")
    return (
      <ChatScreen
        onTerminer={terminerSession}
        finProche={finProche}
        sessionFinie={sessionFinie}
        onResterLa={resterLa}
        contactDemande={contactDemande}
        onContact={envoyerContact}
        onPasserContact={() => setContactDemande(null)}
        onRouvrirContact={() => setContactDemande(commercialRef.current)}
        contactPossible={!!commercialRef.current}
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
