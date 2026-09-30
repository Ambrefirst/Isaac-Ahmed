/* La barre d'attente était réglée sur cent secondes — la durée observée le
   jour où elle a été écrite. La borne répond désormais en quelques secondes :
   la barre ne bougeait plus, et annonçait une attente qui n'existe plus. Rien
   ne l'avait signalé, parce qu'une barre qui avance trop lentement n'a l'air
   d'aucune panne.

   Ces essais gardent les deux décisions qui empêchent que cela se reproduise :
   l'estimation se mesure au lieu de se supposer, et la barre ne prétend jamais
   avoir fini avant la fin. */

import { avancement, enregistreDuree, estimationAttente } from "./attente";

describe("estimation de l'attente", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("part d'une valeur raisonnable quand rien n'a encore été mesuré", () => {
    expect(estimationAttente()).toBe(10000);
  });

  it("suit les durées réellement observées", () => {
    [9000, 11000, 10000, 12000, 10500].forEach(enregistreDuree);
    const e = estimationAttente();
    expect(e).toBeGreaterThan(9000);
    expect(e).toBeLessThan(12000);
  });

  /* Le point qui justifie la médiane plutôt que la moyenne : une réponse sur
     vingt part dans la recherche documentaire de secours et prend deux
     minutes. Une moyenne en serait tirée vers le haut, et la barre ramperait
     pour toutes les autres. */
  it("ignore une réponse isolée très lente", () => {
    [9000, 10000, 11000, 10000, 9500, 120000].forEach(enregistreDuree);
    expect(estimationAttente()).toBeLessThan(15000);
  });

  it("ne garde que les dernières mesures, pour suivre une machine qui change", () => {
    for (let i = 0; i < 12; i += 1) enregistreDuree(100000);
    for (let i = 0; i < 12; i += 1) enregistreDuree(8000);
    expect(estimationAttente()).toBe(8000);
  });

  it("écarte les valeurs aberrantes plutôt que de s'y fier", () => {
    enregistreDuree(0);
    enregistreDuree(-500);
    enregistreDuree(50);
    expect(estimationAttente()).toBe(10000);
  });

  it("survit à un stockage indisponible", () => {
    const vrai = window.localStorage.getItem;
    window.localStorage.getItem = () => { throw new Error("bloqué"); };
    expect(estimationAttente()).toBe(10000);
    window.localStorage.getItem = vrai;
  });
});

describe("avancement de la barre", () => {
  const E = 10000;

  it("part de zéro", () => {
    expect(avancement(0, E)).toBe(0);
  });

  it("atteint environ 90 % au moment estimé", () => {
    const p = avancement(E, E);
    expect(p).toBeGreaterThan(0.85);
    expect(p).toBeLessThan(0.93);
  });

  /* Le point le plus important. Une barre qui annonce « terminé » avant la fin
     est pire que pas de barre : à partir de cet instant, le visiteur croit que
     quelque chose est cassé. Seule l'arrivée de la réponse la remplit. */
  it("n'atteint JAMAIS cent pour cent, même très longtemps après", () => {
    expect(avancement(E * 10, E)).toBeLessThan(1);
    expect(avancement(E * 1000, E)).toBeLessThan(1);
  });

  it("continue d'avancer au-delà du moment estimé", () => {
    expect(avancement(E * 2, E)).toBeGreaterThan(avancement(E, E));
  });

  it("progresse toujours dans le même sens", () => {
    let precedent = -1;
    for (let t = 0; t <= E * 3; t += E / 10) {
      const p = avancement(t, E);
      expect(p).toBeGreaterThanOrEqual(precedent);
      precedent = p;
    }
  });

  /* Une borne rapide doit avoir une barre rapide : c'est tout l'objet du
     changement. */
  it("va plus vite quand l'attente estimée est plus courte", () => {
    expect(avancement(3000, 5000)).toBeGreaterThan(avancement(3000, 60000));
  });

  it("supporte une estimation absente ou absurde", () => {
    expect(avancement(1000, 0)).toBeGreaterThan(0);
    expect(avancement(1000, undefined)).toBeGreaterThan(0);
  });
});
