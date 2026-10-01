/* Ces essais gardent deux regles apprises a la mesure du 27/09, et qui se
   perdraient sans eux parce qu'elles ne se devinent pas a la lecture du code.

   La premiere : un texte vide renvoye par la reconnaissance n'est PAS un
   silence du visiteur, c'est une panne. Neuf enregistrements sur dix sont
   revenus vides avec un code 200, en dix millisecondes, parce que le service
   ne savait pas decoder le format. Confondre les deux ferait passer une panne
   pour de la timidite.

   La seconde : le dictionnaire de correction apres transcription. « Nkok »,
   nom du Datacenter du Gabon donc mot le plus prononce du site, a resiste a
   toutes les variantes d'amorce essayees. */

describe("chaine audio de la borne", () => {
  let service;

  beforeEach(() => {
    jest.resetModules();
    process.env.REACT_APP_AUDIO_TRANSCRIPTION = "/audio/transcription";
    process.env.REACT_APP_AUDIO_SYNTHESE = "/audio/synthese";
    service = require("./audioService");
  });

  afterEach(() => {
    delete process.env.REACT_APP_AUDIO_TRANSCRIPTION;
    delete process.env.REACT_APP_AUDIO_SYNTHESE;
    delete global.fetch;
  });

  /* Le 28/09, la borne a affiche « Sous-titres realises par la communaute
     d'Amara.org » comme si le visiteur l'avait prononce, puis a passe deux
     minutes a y repondre. La reconnaissance a ete entrainee sur des sous-titres
     de video : quand le son ne porte pas de parole, elle rend la phrase la plus
     frequente de ce corpus, avec l'assurance d'une vraie transcription.

     Les seuils de confiance viennent de dix-huit mesures de parole reelle
     degradee faites le meme jour : no_speech_prob n'y a jamais depasse 0,441 et
     avg_logprob n'est jamais descendu sous -0,872. Refuser une vraie question
     coute plus cher que laisser passer une fausse, donc les seuils sont poses
     au-dela du pire cas observe. Ces essais gardent cette marge. */
  describe("ce que la reconnaissance rend quand elle n'a pas entendu de parole", () => {
    it("reconnait les generiques de sous-titrage, y compris celui vu sur la borne", () => {
      [
        "Sous-titres realises par la communaute d'Amara.org",
        "Sous-titres r\u00e9alis\u00e9s par la communaut\u00e9 d\u2019Amara.org",
        "Sous-titrage Societe Radio-Canada",
        "Merci d'avoir regarde cette video",
        "Abonnez-vous !",
      ].forEach((artefact) => {
        expect(service.estArtefact(artefact)).toBe(true);
      });
    });

    it("ne prend pas une vraie question pour un generique", () => {
      [
        "Quels sont vos horaires d'ouverture ?",
        "Ou se trouve le datacenter de Nkok ?",
        "Je voudrais prendre rendez-vous avec le service commercial",
        "Merci beaucoup, au revoir",
      ].forEach((question) => {
        expect(service.estArtefact(question)).toBe(false);
      });
    });

    it("refuse un segment dont les indices sortent de ce qu'on a mesure", () => {
      expect(service.confianceInsuffisante([{ no_speech_prob: 0.82, avg_logprob: -0.4 }])).toBe(true);
      expect(service.confianceInsuffisante([{ no_speech_prob: 0.1, avg_logprob: -1.6 }])).toBe(true);
    });

    it("laisse passer la parole reelle la plus degradee qu'on ait mesuree", () => {
      /* Pire cas des dix-huit mesures du 28/09 : ce sont de vraies phrases,
         correctement transcrites. Si un essai casse ici, c'est le seuil qui est
         trop serre, et ce sont des visiteurs qu'on renvoie repeter. */
      expect(service.confianceInsuffisante([{ no_speech_prob: 0.441, avg_logprob: -0.872 }])).toBe(false);
      expect(service.confianceInsuffisante([])).toBe(false);
      expect(service.confianceInsuffisante(undefined)).toBe(false);
    });

    it("retient le pire segment et non la moyenne", () => {
      /* Une phrase a moitie inventee est inutilisable meme si l'autre moitie
         est nette : une moyenne diluerait exactement le cas qu'on cherche. */
      expect(
        service.confianceInsuffisante([
          { no_speech_prob: 0.02, avg_logprob: -0.3 },
          { no_speech_prob: 0.95, avg_logprob: -0.3 },
        ])
      ).toBe(true);
    });
  });

  describe("corrections du vocabulaire du site", () => {
    const cas = [
      /* Le cas de l'elision : corriger le nom sans corriger le « d' » qui le
         precede laisserait « datacenter d'Nkok », ce qui est pire que l'erreur
         d'origine puisque la phrase devient impossible a lire. */
      ["Où se trouve le datacenter d'une coque ?", /datacenter de Nkok/],
      ["le datacenter de la coque", /datacenter de Nkok/],
      ["Où se trouve le détestateur de Libreville ?", /datacenter/],
      ["Le data santé de Douala", /datacenter/],
      ["Le datacenter de grand bassam", /Grand-Bassam/],
      ["certifié tier 3", /Tier III/],
    ];
    test.each(cas)("%s", (entree, attendu) => {
      expect(service.corrigeTranscription(entree)).toMatch(attendu);
    });

    /* LES NOMS DE PERSONNES NE SONT PLUS CORRIGES — retrait du 01/10.

       « Aubame » devenait « Obame » et « Nguma » devenait « Nguema ». Ces
       deux regles imposaient des noms qui ne figurent pas a l'organigramme.
       Le meme jour, un visiteur a dit « Obone » et la borne a ecrit
       « Obame », parce qu'« Obame » venait d'etre ajoute a l'amorce : lui
       apprendre un nom lui a fait preferer celui-la.

       Ecorcher le nom de quelqu'un a un accueil est pire que de l'ecrire
       comme il sonne. Corriger un nom propre n'est legitime que VERS un nom
       qu'on sait exister ici — et l'annuaire ne connait ni l'un ni l'autre.

       Ces deux cas restent donc ecrits, en negatif : si quelqu'un remet une
       correction de nom sans que le nom soit a l'organigramme, l'essai le
       dira. */
    const nomsLaissesTels = [
      "rendez-vous avec monsieur Aubame",
      "madame Nguma au service technique",
      "je viens voir Obone",
    ];
    test.each(nomsLaissesTels)("le nom n'est pas remplace : %s", (phrase) => {
      expect(service.corrigeTranscription(phrase)).toBe(phrase);
    });

    test("une phrase correcte n'est pas abimee", () => {
      const phrase = "Je voudrais prendre rendez-vous avec le service commercial.";
      expect(service.corrigeTranscription(phrase)).toBe(phrase);
    });
  });

  describe("un texte vide est une panne, pas un silence", () => {
    function reponse(corps, ok = true) {
      return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(corps) });
    }

    /* La conversion en WAV passe par AudioContext, absent de l'environnement
       de test : on la neutralise pour n'eprouver que le traitement de la
       reponse, qui est ce que ces essais protegent. */
    function blobFactice() {
      return { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    }
    beforeEach(() => {
      global.AudioContext = function () {
        return {
          decodeAudioData: () => Promise.resolve({
            numberOfChannels: 1,
            length: 16,
            sampleRate: 48000,
            getChannelData: () => new Float32Array(16),
          }),
          close: () => {},
        };
      };
      global.Blob = function (parties, options) { return { parties, type: options && options.type }; };
      global.FormData = function () { this.append = () => {}; };
    });

    test("un texte vide leve une erreur comprehensible", async () => {
      global.fetch = () => reponse({ text: "" });
      await expect(service.transcrire(blobFactice())).rejects.toThrow(/rien entendu/i);
    });

    test("un texte absent leve la meme erreur", async () => {
      global.fetch = () => reponse({ language: "fr", segments: [] });
      await expect(service.transcrire(blobFactice())).rejects.toThrow(/rien entendu/i);
    });

    test("un texte reconnu passe, et il est corrige au passage", async () => {
      global.fetch = () => reponse({ text: " Où se trouve le datacenter d'une coque ? " });
      await expect(service.transcrire(blobFactice())).resolves.toMatch(/Nkok/);
    });

    test("un service indisponible est distingue d'un silence", async () => {
      global.fetch = () => reponse({}, false);
      await expect(service.transcrire(blobFactice())).rejects.toThrow(/indisponible/i);
    });

    /* Ce qui a ete vu sur la borne le 28/09 : un generique de sous-titrage
       affiche comme une question, et deux minutes de recherche pour y repondre.
       Il doit desormais etre refuse avant de partir au modele. */
    test("un generique de sous-titrage ne part pas au modele", async () => {
      global.fetch = () => reponse({
        text: "Sous-titres realises par la communaute d'Amara.org",
        segments: [{ no_speech_prob: 0.2, avg_logprob: -0.5 }],
      });
      await expect(service.transcrire(blobFactice())).rejects.toMatchObject({ repeter: true });
    });

    test("une transcription sans confiance fait repeter, sans annoncer de panne", async () => {
      global.fetch = () => reponse({
        text: "peut-etre quelque chose",
        segments: [{ no_speech_prob: 0.91, avg_logprob: -1.4 }],
      });
      await expect(service.transcrire(blobFactice())).rejects.toMatchObject({ repeter: true });
    });

    /* La distinction qui compte : une chaine tombee ne doit PAS demander de
       repeter, sans quoi on envoie le visiteur articuler devant une panne. */
    test("une panne n'est pas un malentendu", async () => {
      global.fetch = () => reponse({}, false);
      const echec = await service.transcrire(blobFactice()).catch((e) => e);
      expect(echec.repeter).toBeFalsy();
      expect(echec.message).toMatch(/indisponible/i);
    });

    /* LE 01/10, LA BORNE A AFFICHE « ISAAC CHERCHE LA REPONSE — 6977 s ».

       Presque deux heures. `fetch` n'a pas de delai : un service qui cesse de
       repondre en cours de route ne rejette jamais, la promesse reste en
       suspens, et le tour de parole ne se termine pas. La conversation parlee
       restait bloquee jusqu'a ce que quelqu'un ferme l'onglet.

       Cet essai garde la seule chose qui compte ici : un appel sans reponse
       FINIT. Peu importe au bout de combien de temps — ce qui etait casse,
       c'est qu'il ne finissait pas. */
    test("un service qui ne repond jamais finit par rendre la main", async () => {
      jest.useFakeTimers();
      /* Un faux « fetch » fidele : il ne repond pas, mais il respecte le
         signal. Un faux qui ignorerait l'abandon ne prouverait rien. */
      global.fetch = (url, options) => new Promise((_, rejeter) => {
        options.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rejeter(e);
        });
      });

      const attente = service.transcrire(blobFactice());
      const echec = attente.catch((e) => e);
      /* La conversion en WAV est asynchrone : on la laisse finir avant
         d'avancer l'horloge, sans quoi le delai n'est pas encore arme. */
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(service.DELAI_TRANSCRIPTION + 1000);

      const e = await echec;
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/pas répondu/i);
      jest.useRealTimers();
    });

    test("une phrase nette et sure passe normalement", async () => {
      global.fetch = () => reponse({
        text: "Quels sont vos horaires ?",
        segments: [{ no_speech_prob: 0.07, avg_logprob: -0.43 }],
      });
      await expect(service.transcrire(blobFactice())).resolves.toBe("Quels sont vos horaires ?");
    });
  });

  test("la voix est annoncee indisponible quand rien n'est configure", () => {
    jest.resetModules();
    delete process.env.REACT_APP_AUDIO_TRANSCRIPTION;
    delete process.env.REACT_APP_AUDIO_SYNTHESE;
    const local = require("./audioService");
    expect(local.audioDisponible).toBe(false);
  });
});
