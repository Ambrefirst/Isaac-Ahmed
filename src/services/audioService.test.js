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
      ["rendez-vous avec monsieur Aubame", /Obame/],
      ["madame Nguma au service technique", /Nguema/],
      ["certifié tier 3", /Tier III/],
    ];
    test.each(cas)("%s", (entree, attendu) => {
      expect(service.corrigeTranscription(entree)).toMatch(attendu);
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
  });

  test("la voix est annoncee indisponible quand rien n'est configure", () => {
    jest.resetModules();
    delete process.env.REACT_APP_AUDIO_TRANSCRIPTION;
    delete process.env.REACT_APP_AUDIO_SYNTHESE;
    const local = require("./audioService");
    expect(local.audioDisponible).toBe(false);
  });
});
