/* Le service commercial recevait une demande marquée « Pour le recontacter :
   non communiqué » — toujours, et par construction : le courriel partait
   avant qu'Isaac ait posé la question. Si le visiteur laissait ensuite son
   adresse, un second message partait, indiscernable du premier.

   Ces essais gardent les quatre sorties du mécanisme qui remplace cela. Trois
   d'entre elles sont des sorties de secours : elles n'arrivent que si le
   visiteur ne répond pas, et ce sont justement celles que personne ne pense à
   vérifier à la main. */

import { creerRelaisDiffere } from "./relaisDiffere";

describe("le courriel au service commercial attend l'adresse", () => {
  let envois;
  let envoyer;

  beforeEach(() => {
    jest.useFakeTimers();
    envois = [];
    envoyer = jest.fn((question, options) => {
      envois.push({ question, ...options });
      return Promise.resolve(true);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("n'envoie rien tant que la question posee au visiteur n'a pas de reponse", () => {
    const relais = creerRelaisDiffere(envoyer, { attente: 60000 });
    relais.ouvrir("Combien coute l'hebergement ?", { service: "commercial" });
    jest.advanceTimersByTime(59000);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("part avec l'adresse des qu'elle est donnee, et une seule fois", async () => {
    const relais = creerRelaisDiffere(envoyer, { attente: 60000 });
    relais.ouvrir("Combien coute l'hebergement ?", { service: "commercial", mode: "chat" });
    await relais.avecContact("ambre@st.digital");
    /* La minuterie ne doit pas produire un second courriel apres coup. */
    jest.advanceTimersByTime(120000);
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({
      question: "Combien coute l'hebergement ?",
      service: "commercial",
      mode: "chat",
      contact: "ambre@st.digital",
    });
  });

  /* LA SORTIE DE SECOURS QUI COMPTE LE PLUS. Un besoin client sans adresse
     reste un besoin client ; un besoin client perdu n'est rien. */
  it("part sans adresse si le visiteur ne dit rien", () => {
    const relais = creerRelaisDiffere(envoyer, { attente: 60000 });
    relais.ouvrir("Je voudrais un devis", { service: "commercial" });
    jest.advanceTimersByTime(60000);
    expect(envois).toHaveLength(1);
    expect(envois[0].contact).toBeNull();
  });

  it("part immediatement quand la conversation se termine", () => {
    const relais = creerRelaisDiffere(envoyer, { attente: 60000 });
    relais.ouvrir("Je voudrais un devis", { service: "commercial" });
    relais.cloturer();
    expect(envois).toHaveLength(1);
    expect(envois[0].contact).toBeNull();
    /* Et la minuterie annulee ne rallume rien. */
    jest.advanceTimersByTime(120000);
    expect(envois).toHaveLength(1);
  });

  it("ne previent qu'une fois, meme si le visiteur insiste", () => {
    const relais = creerRelaisDiffere(envoyer, { attente: 60000 });
    expect(relais.ouvrir("Un devis ?", { service: "commercial" })).toBe(true);
    expect(relais.ouvrir("Et pour la colocation ?", { service: "commercial" })).toBe(false);
    jest.advanceTimersByTime(60000);
    expect(envois).toHaveLength(1);
    expect(envois[0].question).toBe("Un devis ?");
  });

  /* Une adresse tapee au clavier d'ecran peut prendre plus d'une minute. La
     demande est alors deja partie : l'adresse la COMPLETE, elle n'ouvre pas
     une seconde demande — et le courriel le dit. */
  it("complete la demande quand l'adresse arrive trop tard", async () => {
    const relais = creerRelaisDiffere(envoyer, { attente: 60000 });
    relais.ouvrir("Combien coute la colocation ?", { service: "commercial" });
    jest.advanceTimersByTime(60000);
    await relais.avecContact("ambre@st.digital");
    expect(envois).toHaveLength(2);
    expect(envois[0].contact).toBeNull();
    expect(envois[1]).toMatchObject({ contact: "ambre@st.digital", complement: true });
    expect(envois[1].question).toBe("Combien coute la colocation ?");
  });

  it("une cloture sans demande en cours n'envoie rien", () => {
    const relais = creerRelaisDiffere(envoyer, { attente: 60000 });
    relais.cloturer();
    relais.avecContact("ambre@st.digital");
    relais.sansContact();
    expect(envoyer).not.toHaveBeenCalled();
  });

  /* Best-effort par construction : une notification qui echoue ne doit jamais
     faire remonter une erreur dans une conversation parlee. */
  it("un envoi qui echoue ne leve pas", async () => {
    const casse = jest.fn(() => Promise.reject(new Error("reseau")));
    const relais = creerRelaisDiffere(casse, { attente: 60000 });
    relais.ouvrir("Un devis ?", { service: "commercial" });
    await expect(relais.avecContact("ambre@st.digital")).resolves.toBe(false);
  });

  /* Le visiteur suivant n'herite pas de la demande du precedent. */
  it("se reouvre apres une cloture", () => {
    const relais = creerRelaisDiffere(envoyer, { attente: 60000 });
    relais.ouvrir("Un devis ?", { service: "commercial" });
    relais.cloturer();
    expect(relais.ouvrir("Autre chose ?", { service: "commercial" })).toBe(true);
    jest.advanceTimersByTime(60000);
    expect(envois).toHaveLength(2);
    expect(envois[1].question).toBe("Autre chose ?");
  });
});
