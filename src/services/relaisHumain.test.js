/* La mise en relation se déclenchait sur le TEMPS d'attente : passé dix-huit
   secondes, la borne proposait d'appeler quelqu'un. Elle répondait donc à la
   lenteur de la machine, et jamais au besoin du visiteur — un humain proposé
   pour une question qu'Isaac traitait très bien, et aucun quand il répondait
   vite et à côté.

   Ces essais gardent le nouveau critère : ce qui appelle une personne, c'est
   la nature de la demande. Ils gardent aussi ce qui NE doit pas la déclencher,
   parce qu'une proposition affichée à chaque question deviendrait un bruit de
   fond qu'on cesse de lire. */

import { avoueIgnorer, relaisNecessaire, sujetReserve } from "./relaisHumain";

describe("quand une question appelle une personne plutot qu'un modele", () => {
  describe("sujets qui engagent l'entreprise", () => {
    /* Un prix annonce par une borne d'accueil engage ST DIGITAL. Il depend du
       volume, de la duree et de ce qui a ete negocie : aucune base de
       connaissances ne peut le donner sans se tromper. */
    const reserves = [
      "Quels sont vos tarifs pour la colocation ?",
      "Combien coûte une baie au mois ?",
      "Pouvez-vous me faire un devis ?",
      "Quel est le prix de l'hébergement ?",
      "Y a-t-il une remise pour un engagement de trois ans ?",
      "Quelles sont les pénalités prévues au SLA ?",
      "Quelles sont les conditions de résiliation du contrat ?",
      "Avez-vous de la disponibilité de baie à Nkok ?",
      "Où en est mon dossier ?",
    ];
    reserves.forEach((q) => {
      it(`met en relation : ${q}`, () => {
        expect(sujetReserve(q)).toBe(true);
        expect(relaisNecessaire(q, "Une réponse quelconque.")).toBe("reserve");
      });
    });
  });

  describe("questions auxquelles Isaac doit repondre seul", () => {
    /* Le point sensible : si la proposition apparaissait a chaque question,
       elle deviendrait un decor qu'on ne lit plus, et elle derangerait
       l'equipe pour des horaires d'ouverture. */
    const ordinaires = [
      "Quels sont vos horaires d'ouverture ?",
      "Où se trouve le datacenter de Nkok ?",
      "Puis-je visiter le datacenter sans rendez-vous ?",
      "Quels services proposez-vous ?",
      "Comment prendre rendez-vous ?",
      "Le datacenter est-il certifié Tier III ?",
      "Faut-il une pièce d'identité pour entrer ?",
    ];
    ordinaires.forEach((q) => {
      it(`ne derange personne : ${q}`, () => {
        expect(sujetReserve(q)).toBe(false);
        expect(relaisNecessaire(q, "Nos horaires sont de 8h à 17h, du lundi au vendredi.")).toBeNull();
      });
    });
  });

  describe("quand Isaac reconnait lui-meme ne pas savoir", () => {
    /* On lit ce que la consigne systeme lui fait deja faire, plutot que
       d'ajouter une seconde detection en parallele qui divergerait. */
    const aveux = [
      "Je ne dispose pas de cette information dans ma documentation.",
      "Cette information n'est pas précisée dans les documents dont je dispose.",
      "Cela ne figure pas dans ma base de connaissances.",
      "Je ne suis pas en mesure de vous répondre sur ce point.",
      "Je vous invite à contacter l'équipe commerciale.",
      "Rapprochez-vous de l'accueil pour cette demande.",
    ];
    aveux.forEach((r) => {
      it(`propose alors une personne : ${r.slice(0, 40)}...`, () => {
        expect(avoueIgnorer(r)).toBe(true);
        expect(relaisNecessaire("Une question quelconque", r)).toBe("ignorance");
      });
    });

    it("une reponse qui repond ne declenche rien", () => {
      expect(avoueIgnorer("Le datacenter de Nkok est certifié Tier III.")).toBe(false);
    });

    /* Piege : Isaac cite souvent l'equipe en fin de reponse pour aller plus
       loin. Le mot « équipe » seul ne doit donc pas suffire, sinon la
       proposition s'afficherait derriere presque chaque reponse. */
    it("mentionner l'equipe sans avouer d'ignorance ne suffit pas", () => {
      expect(avoueIgnorer("Notre équipe technique assure une présence continue sur le site.")).toBe(false);
      expect(avoueIgnorer("L'équipe commerciale se tient à votre disposition.")).toBe(false);
    });
  });

  describe("ordre des deux signaux", () => {
    it("le sujet prime sur l'aveu, parce que le message n'est pas le meme", () => {
      /* « Je n'ai pas l'info » ferait croire a une lacune de la base, alors
         qu'un tarif n'a pas a s'y trouver. */
      expect(relaisNecessaire("Quel est votre tarif ?", "Je ne dispose pas de cette information."))
        .toBe("reserve");
    });

    it("rien ne se declenche quand aucun des deux ne se leve", () => {
      expect(relaisNecessaire("Bonjour", "Bonjour, comment puis-je vous aider ?")).toBeNull();
      expect(relaisNecessaire("", "")).toBeNull();
      expect(relaisNecessaire(undefined, undefined)).toBeNull();
    });
  });
});
