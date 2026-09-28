/* Faits validés par ST DIGITAL, servis sans passer par le modèle.
   ================================================================

   POURQUOI. Sur cette machine, la lecture du contexte coûte 88 % du temps de
   réponse : une question documentaire demande de cent à cent soixante-quinze
   secondes. Or les questions les plus posées à un accueil portent sur quatre
   faits qui ont une valeur unique, vérifiée, et qui doivent être restitués
   MOT POUR MOT : les horaires, l'adresse du bureau, celle du Datacenter, et
   les coordonnées.

   Ces faits portent tous la mention « [Validé par ST Digital le 24/08/2026] »
   dans la base de connaissances. Les servir depuis une table plutôt que par
   récupération documentaire les rend instantanés ET exacts : une valeur lue
   dans une table ne peut pas dériver, alors qu'une réponse générée le peut —
   et l'a déjà fait, quand Isaac a annoncé « 8h-18h, samedi 8h-12h » un jour
   où le magasin vectoriel était vide.

   C'est la seule optimisation de ce projet qui n'échange rien contre la
   vitesse. Toutes les autres coûtent quelque chose : le modèle plus petit
   coûte de la qualité, les morceaux plus courts coûtent du rappel. Celle-ci
   améliore les deux.

   CE QU'ELLE NE FAIT PAS. Elle ne reformule rien. Faire reparaphraser un fait
   validé par le modèle réintroduirait exactement le risque qu'on élimine, y
   ajouterait cent secondes, et n'apporterait rien : une phrase écrite une fois
   et relue est meilleure qu'une phrase régénérée à chaque visiteur.

   POURQUOI DES MOTIFS ET NON UNE COMPARAISON SÉMANTIQUE. Une correspondance
   par similarité demande un seuil, et un seuil mal placé produit une réponse
   FAUSSE avec aplomb — le pire résultat possible ici. Des motifs explicites se
   lisent, se testent, et se corrigent. Ils ratent des formulations : c'est
   voulu. Un raté coûte cent secondes ; une fausse correspondance coûte la
   confiance.

   RÈGLE DE PRUDENCE. Au moindre doute, on ne répond pas depuis la table et on
   laisse la recherche documentaire faire son travail. */

function normalise(texte) {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* Sujets qui ne doivent JAMAIS être servis depuis la table, même si la
   question mentionne par ailleurs un fait connu. « Quels sont vos horaires et
   combien coûte l'hébergement ? » ne doit pas recevoir les seuls horaires :
   la moitié de la question resterait sans réponse. */
const JAMAIS_RACCOURCI = [
  /tarif|prix|cout|couts|devis|remise|budget|factur/,
  /contrat|engagement|resiliation|sla|penalit/,
  /ignore (tes|les) instruction|desactive|code d acces|mot de passe/,
  /\bplainte|incident|urgence|forcer/,
];

/* Manieres de demander ou se trouve quelque chose. La derniere ligne compte :
   « le datacenter il est ou ? » place l'interrogatif a la fin, ce qu'aucun
   motif construit sur « ou se trouve » n'attrape. Une fois les accents retires,
   « ou » interrogatif et « ou » conjonction se confondent : on n'accepte donc
   le mot seul qu'en fin de phrase ou apres un verbe d'etat. */
const LOCALISATION = /ou se trouve|ou est|ou sont|adresse|situe|situee|localis|comment venir|comment vous rendre|(?:est|sont|situe|trouve)\s+ou\b|\bou\s*$|where is|where are|where can i find|address|located|location|how do i get|how to get/;

const FAITS = [
  {
    cle: "horaires",
    /* Au moins un terme d'horaire... */
    exige: [/horaire|ouvert|ouvre|ouverture|fermet|fermeture|quelle heure|heures d|opening hours|business hours|what time|when.*open|are you open|closing time/],
    /* ...et aucun de ceux-ci, qui désignent une autre question. Les horaires
       validés sont ceux du BUREAU de Libreville : une question sur la visite
       du Datacenter ou sur les portes ouvertes n'a pas la même réponse. */
    exclut: [/datacenter|data center|nkok|centre de donnees|portes ouvertes|visite|rendez vous|rdv|open day|open days|visit|appointment/],
    reponse: {
      fr: "Le bureau de Libreville est ouvert du lundi au vendredi, de 8h00 à 17h00. Il est fermé le samedi et le dimanche.",
      en: "The Libreville office is open Monday to Friday, from 8:00 am to 5:00 pm. It is closed on Saturdays and Sundays.",
    },
  },
  {
    cle: "adresse_bureau",
    /* Deux conditions : une intention de localisation ET le mot « bureau ».
       Sans la seconde, « où se trouve votre Datacenter » tomberait ici. */
    exige: [LOCALISATION,
            /bureau|siege|agence|locaux|libreville|office|branch|headquarters/],
    exclut: [/datacenter|data center|nkok|centre de donnees|data centre/],
    reponse: {
      fr: "Notre bureau de Libreville est situé à l'Immeuble Cofina, avenue Jean-Paul II, Boulevard Triomphal, à Libreville au Gabon.",
      en: "Our Libreville office is located at Immeuble Cofina, avenue Jean-Paul II, Boulevard Triomphal, in Libreville, Gabon.",
    },
  },
  {
    cle: "adresse_datacenter",
    exige: [LOCALISATION,
            /datacenter|data center|data centre|centre de donnees/],
    exclut: [],
    reponse: {
      fr: "Le Datacenter de ST DIGITAL au Gabon se trouve à Nkok, dans la zone économique spéciale, à proximité de Libreville.",
      en: "ST DIGITAL's Gabon Datacenter is located in Nkok, in the special economic zone, near Libreville.",
    },
  },
  {
    cle: "contact",
    exige: [/contacter|vous joindre|joindre|coordonnees|telephone|numero|courriel|adresse mail|adresse e mail|email|vous ecrire|contact you|reach you|get in touch|phone number|your number|e mail|write to you/],
    /* Prendre rendez-vous n'est pas demander les coordonnées : la borne a un
       parcours dédié pour cela, et y renvoyer est une meilleure réponse. */
    exclut: [/rendez vous|rdv|visite|portes ouvertes|appointment|visit|open day/],
    reponse: {
      fr: "Vous pouvez nous joindre par courriel à info@st.digital, ou par téléphone au +241 66 17 66 41.",
      en: "You can reach us by email at info@st.digital, or by phone on +241 66 17 66 41.",
    },
  },
];

/* Rend le fait correspondant, ou null. Jamais d'approximation : si deux faits
   correspondent, on ne tranche pas et on laisse la recherche documentaire
   décider — deux correspondances signifient que la question en contient deux,
   et une table ne sait pas répondre à une question double. */
function chercheFait(question) {
  const q = normalise(question);
  if (!q) return null;
  if (JAMAIS_RACCOURCI.some((m) => m.test(q))) return null;

  const trouves = FAITS.filter(
    (f) => f.exige.every((m) => m.test(q)) && !f.exclut.some((m) => m.test(q))
  );
  return trouves.length === 1 ? trouves[0] : null;
}

function reponseValidee(question, langue) {
  const fait = chercheFait(question);
  if (!fait) return null;
  return { cle: fait.cle, reponse: fait.reponse[langue === "en" ? "en" : "fr"] };
}

module.exports = { normalise, chercheFait, reponseValidee, FAITS, JAMAIS_RACCOURCI };
