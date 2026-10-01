/* UN SEUL COURRIEL, ET IL PORTE DE QUOI RÉPONDRE.

   Ce qui se passait avant. Isaac reconnaît une demande commerciale, prévient
   le service AUSSITÔT, puis demande au visiteur une adresse où le rappeler.
   Le commercial recevait donc un premier message portant « Pour le
   recontacter : non communiqué » — il ne pouvait pas en être autrement,
   puisque la question n'avait pas encore été posée. Si le visiteur laissait
   ensuite son adresse, un SECOND message partait, identique au premier à une
   ligne près, et rien ne disait que l'un complétait l'autre.

   Deux courriels pour une demande, dont le premier inutilisable.

   CE QU'ON NE VEUT PAS POUR AUTANT. Attendre l'adresse pour prévenir
   quiconque : la moitié des visiteurs ne la donnera jamais, et un besoin
   client perdu coûte plus cher qu'un besoin client sans adresse. L'envoi
   immédiat existait pour cette raison, et elle reste valable.

   CE QU'ON FAIT. On garde la demande quelques secondes — le temps que la
   question posée au visiteur trouve sa réponse — et on envoie UNE fois, avec
   l'adresse si elle est arrivée. Quoi qu'il arrive, la demande part :

     - le visiteur laisse une adresse  -> on envoie avec ;
     - il répond « plus tard »         -> on envoie sans, tout de suite ;
     - il s'en va sans rien dire       -> la minuterie envoie sans ;
     - la session est close ou l'écran -> on vide avant de fermer.
       quitté

   Le visiteur, lui, n'attend rien : Isaac a déjà répondu et le lui a déjà
   dit. Ce qui patiente, c'est le courriel, et personne ne le regarde partir.

   LA DURÉE. Une minute. C'est le temps d'écrire une adresse au clavier
   d'écran sans se sentir pressé, et c'est court devant les cinq minutes au
   bout desquelles la borne efface d'elle-même la conversation. */

export const ATTENTE_CONTACT = 60 * 1000;

/* `envoyer` a la signature de `prevenirService` : (question, options) et rend
   une promesse de booléen. On l'injecte plutôt que de l'importer, pour que
   les essais puissent compter les envois sans réseau. */
export function creerRelaisDiffere(envoyer, { attente = ATTENTE_CONTACT } = {}) {
  let demande = null;
  let options = null;
  let minuterie = null;
  let parti = false;
  let resultat = null;

  function envoi(contact) {
    /* UNE SEULE FOIS. C'est toute la raison d'être de ce module : trois
       chemins mènent ici — l'adresse, le refus, la minuterie — et deux
       peuvent se produire à quelques millisecondes d'écart. */
    if (parti) return resultat;
    parti = true;
    if (minuterie) {
      clearTimeout(minuterie);
      minuterie = null;
    }
    const avec = Object.assign({}, options, { contact: contact || null });
    /* L'appel part TOUT DE SUITE, pas au tour de boucle suivant : la clôture
       d'une session est la dernière chose qui s'exécute avant que la page
       change, et une micro-tâche de plus est une micro-tâche de trop.
       Best-effort pour autant, comme `prevenirService` : une notification qui
       échoue ne doit jamais interrompre une conversation, et surtout pas une
       conversation parlée. */
    try {
      resultat = Promise.resolve(envoyer(demande, avec)).catch(() => false);
    } catch (e) {
      resultat = Promise.resolve(false);
    }
    return resultat;
  }

  return {
    /* Ouvre l'attente. Rend false si une demande est déjà en cours : une
       personne qui insiste ne doit pas produire cinq courriels pour un seul
       besoin. */
    ouvrir(question, opts) {
      if (demande) return false;
      demande = question;
      options = opts || {};
      minuterie = setTimeout(() => { envoi(null); }, attente);
      return true;
    },
    get enCours() { return !!demande; },
    get envoye() { return parti; },
    get question() { return demande; },

    /* Le visiteur a laissé de quoi le rappeler.

       S'IL A PRIS PLUS D'UNE MINUTE, la demande est déjà partie sans adresse,
       et on ne peut pas revenir dessus. On envoie alors un COMPLÉMENT, marqué
       comme tel pour que le service voie qu'il complète une demande qu'il a
       déjà reçue, et non qu'il en reçoive une seconde. Perdre l'adresse pour
       ne pas écrire deux fois serait le mauvais arbitrage : c'est l'adresse
       qui fait la valeur du signalement. */
    avecContact(contact) {
      if (!demande) return Promise.resolve(false);
      if (parti) {
        const complement = Object.assign({}, options, { contact: contact || null, complement: true });
        try {
          return Promise.resolve(envoyer(demande, complement)).catch(() => false);
        } catch (e) {
          return Promise.resolve(false);
        }
      }
      return envoi(contact);
    },

    /* « Plus tard », ou la minuterie : la demande part quand même. */
    sansContact() {
      if (!demande) return Promise.resolve(false);
      return envoi(null);
    },

    /* Fin de conversation. On vide AVANT d'oublier : une demande qui attendait
       encore doit partir, sinon la clôture ferait disparaître le besoin que
       tout ce mécanisme existe pour faire remonter. */
    cloturer() {
      const p = demande && !parti ? envoi(null) : Promise.resolve(parti);
      if (minuterie) {
        clearTimeout(minuterie);
        minuterie = null;
      }
      demande = null;
      options = null;
      parti = false;
      resultat = null;
      return p;
    },
  };
}
