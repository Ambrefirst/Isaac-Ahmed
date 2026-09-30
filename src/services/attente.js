/* Combien de temps Isaac va-t-il mettre, d'après ce qu'il a mis jusqu'ici.

   La jauge d'attente était réglée sur une durée fixe de cent secondes — la
   durée réellement observée quand elle a été écrite. Depuis, la borne répond
   entre une fraction de seconde et une quinzaine : la barre ne bougeait
   pratiquement plus avant l'arrivée de la réponse, et annonçait une attente
   qui n'existe plus.

   Lui donner une nouvelle durée fixe ne ferait que déplacer le problème :
   elle redeviendrait fausse au prochain changement, et personne ne s'en
   apercevrait — c'est exactement ce qui vient de se passer. On la fait donc
   MESURER au lieu de la supposer.

   Deux décisions dans ce fichier.

   LA MÉDIANE, PAS LA MOYENNE. Une réponse sur vingt part dans la recherche
   documentaire de secours et prend deux minutes. Une moyenne en serait tirée
   vers le haut et la barre ramperait pour toutes les autres ; la médiane
   ignore ces cas isolés.

   LA BARRE N'ATTEINT JAMAIS CENT POUR CENT. Elle s'en approche sans jamais y
   arriver, et ne se remplit qu'au moment où la réponse est réellement là.
   Une barre qui annonce « terminé » avant la fin est pire que pas de barre :
   à partir de cet instant, le visiteur croit que quelque chose est cassé. */

const CLEF = "isaac_durees_reponse";
const GARDEES = 12;
/* Tant qu'on n'a rien mesuré sur cette borne, on part de ce qu'on sait de la
   machine : une dizaine de secondes pour une question documentaire. */
const DEFAUT = 10000;
const PLANCHER = 2000;
const PLAFOND = 180000;

function lit() {
  try {
    const brut = window.localStorage.getItem(CLEF);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste.filter((n) => typeof n === "number" && n > 0) : [];
  } catch (e) {
    /* Stockage indisponible ou illisible : on se rabat sur l'estimation par
       défaut plutôt que d'empêcher l'affichage. */
    return [];
  }
}

export function enregistreDuree(millisecondes) {
  if (!millisecondes || millisecondes < 200) return;
  try {
    const liste = lit().concat(Math.min(millisecondes, PLAFOND)).slice(-GARDEES);
    window.localStorage.setItem(CLEF, JSON.stringify(liste));
  } catch (e) {
    /* Ne rien enregistrer n'empêche rien : l'estimation repart du défaut. */
  }
}

export function estimationAttente() {
  const liste = lit();
  if (!liste.length) return DEFAUT;
  const triees = [...liste].sort((a, b) => a - b);
  const milieu = triees.length % 2
    ? triees[(triees.length - 1) / 2]
    : (triees[triees.length / 2 - 1] + triees[triees.length / 2]) / 2;
  return Math.max(PLANCHER, Math.min(PLAFOND, milieu));
}

/* Avancement de la barre à l'instant `ecoule`, pour une attente estimée.

   La courbe atteint 90 % au moment estimé, puis continue de progresser en
   ralentissant vers 95 % sans jamais l'atteindre. Une réponse plus rapide que
   prévu trouve donc la barre en chemin, une réponse plus lente la trouve
   encore en train d'avancer — dans les deux cas, elle ne raconte rien de
   faux. */
export function avancement(ecoule, estimation) {
  const e = Math.max(PLANCHER, estimation || DEFAUT);
  return 0.95 * (1 - Math.exp((-3 * ecoule) / e));
}
