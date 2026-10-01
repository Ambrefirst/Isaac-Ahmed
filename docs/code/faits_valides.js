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
    .replace(/[\u0300-\u036f]/g, "")
    /* Les elisions sont RECOLLEES avant le reste. Sans cela l'apostrophe
       devient une espace, « j'aimerais » s'ecrit « j aimerais », et un motif
       ecrit naturellement avec « je » ne trouve rien — en silence. Ce piege
       s'est referme quatre fois en une seule journee : on le traite ici, une
       fois, plutot qu'un motif a la fois. */
    .replace(/\b([jnmtsldc])['\u2019]/g, "$1e ")
    .replace(/\bqu['\u2019]/g, "que ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* Sujets qui ne doivent JAMAIS être servis depuis la table, même si la
   question mentionne par ailleurs un fait connu. « Quels sont vos horaires et
   combien coûte l'hébergement ? » ne doit pas recevoir les seuls horaires :
   la moitié de la question resterait sans réponse. */
const JAMAIS_RACCOURCI = [
  /* Contrats et engagements : aucune formule validee ne les couvre. La reponse
     sur les tarifs parle d'une proposition commerciale, ce qui ne convient pas
     a une question sur une resiliation ou une penalite. */
  /contrat|engagement|resiliation|sla|penalit|clause/,
  /* Une plainte demande un responsable, pas une phrase toute faite. */
  /\bplainte|porter plainte|reclamation/,
  /* Une tentative de detournement ne doit jamais recevoir de reponse
     preparee : elle doit passer par le modele, qui refusera. */
  /ignore (tes|les) instruction|desactive|code d acces|mot de passe|donne moi le code/,
];

/* Manieres de demander ou se trouve quelque chose. La derniere ligne compte :
   « le datacenter il est ou ? » place l'interrogatif a la fin, ce qu'aucun
   motif construit sur « ou se trouve » n'attrape. Une fois les accents retires,
   « ou » interrogatif et « ou » conjonction se confondent : on n'accepte donc
   le mot seul qu'en fin de phrase ou apres un verbe d'etat. */
const LOCALISATION = /ou se trouve|ou est|ou sont|adresse|situe|situee|localis|comment venir|comment vous rendre|(?:est|sont|situe|trouve)\s+ou\b|\bou\s*$|where is|where are|where can i find|address|located|\blocation of\b|\byour location\b|how do i get|how to get/;

const FAITS = [
  {
    /* Les politesses passaient par le modele, qui regenerait a chaque fois une
       phrase deja ecrite dans la fiche — cinq secondes pour dire bonjour. Ces
       formules sont fixes : on les rend directement.

       Chaque courtoisie a la sienne. Repondre « bonjour » a un remerciement
       donne l'impression de ne pas avoir ecoute. */
    cle: "salutation",
    exige: [/^(bonjour|bonsoir|salut|coucou|hello|hi|hey|yo|bjr)\b/],
    exclut: [/\?|horaire|adresse|datacenter|tarif|prix|visite|contact|qui|que|quoi|quel|comment|combien|ou\b/],
    reponse: {
      fr: "Bonjour et bienvenue chez ST DIGITAL. Comment puis-je vous aider ?",
      en: "Hello and welcome to ST DIGITAL. How may I help you?",
    },
  },
  {
    cle: "remerciement",
    /* Un acquiescement peut preceder le remerciement : « parfait, merci ».
       Sans cette tolerance, la phrase n'etait reconnue par aucun des deux. */
    exige: [/^(ok|okay|de accord|daccord|parfait|super|tres bien|genial|nickel)?[ ,]*(merci|thanks|thank you|je vous remercie)\b/],
    exclut: [/\?|horaire|adresse|datacenter|tarif|visite|contact/],
    reponse: {
      fr: "Je vous en prie. N'hésitez pas si vous avez une autre question.",
      en: "You are welcome. Do let me know if you have another question.",
    },
  },
  {
    /* Acquiescer n'est pas demander. « ok », « parfait », « d'accord » ne
       reclament pas de reponse : ils demandent qu'on prenne acte. Sans cette
       entree, ces phrases partaient au modele, qui les prenait pour une
       demande et repartait dans un accueil complet. */
    cle: "acquiescement",
    exige: [/^(ok|okay|de accord|daccord|tres bien|parfait|super|genial|impeccable|nickel|ce est note|entendu|compris|ca marche|tres bien merci)\b/],
    /* Un acquiescement suivi d'une vraie question n'en est plus un. */
    exclut: [/\?|horaire|adresse|datacenter|tarif|prix|visite|contact|rendez ?vous|rdv|qui |quel|comment|combien|merci\b/],
    reponse: {
      fr: "Parfait. Je reste à votre disposition si vous avez une autre question.",
      en: "Perfect. I remain at your disposal if you have another question.",
    },
  },
  {
    cle: "au_revoir",
    exige: [/^(au revoir|a bientot|a plus|bye|bonne journee|bonne soiree|bonne fin|salut a vous|a demain)\b/],
    exclut: [/\?/],
    reponse: {
      fr: "Bonne journée, et à bientôt chez ST DIGITAL.",
      en: "Have a good day, and see you soon at ST DIGITAL.",
    },
  },
  {
    /* « Comment allez-vous ? » n'appelle pas la fiche : c'est une politesse,
       et y repondre par une presentation d'entreprise serait a cote. */
    cle: "prise_de_contact",
    exige: [/^(ca va|comment ca va|comment allez[- ]vous|comment vas[- ]tu|tu vas bien|vous allez bien|how are you)\b/],
    exclut: [],
    reponse: {
      fr: "Très bien, merci. Que puis-je faire pour vous ?",
      en: "Very well, thank you. What can I do for you?",
    },
  },
  {
    cle: "horaires",
    /* Au moins un terme d'horaire... */
    /* Frontieres de mots obligatoires : sans elles, « ouvert » se trouve dans
       « decouverte » et une question sur les journees portes ouvertes recevait
       les horaires du bureau. */
    exige: [/\bhoraires?\b|\bouverts?\b|\bouvre[zr]?\b|\bouverture\b|\bfermet|\bfermeture\b|\bferme[zr]?\b|quelle heure|heures d|opening hours|business hours|what time|when.*open|are you open|closing time/],
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
    /* LA COLOCATION. Le visiteur demande s'il peut apporter son propre
       materiel : c'est la definition meme du service, et la documentation
       publique l'ecrit deja — le client deploie et gere son materiel dans
       un Datacenter ST DIGITAL, dans son environnement securise.

       Avant cette entree, la question recevait l'ADRESSE du Datacenter,
       parce que « colocation » contient « location ». La frontiere de mot
       a ete posee au-dessus ; ce bloc-ci donne la reponse qui manquait.

       La reponse dit oui, puis s'arrete net sur la configuration : le
       dimensionnement et les conditions appartiennent au commercial, et
       l'annonce de la transmission declenche vraiment le courriel.

       Une question de colocation qui parle d'argent est ecartee : elle
       appartient a « tarifs », qui porte la formule validee de la
       section 13. */
    cle: "colocation",
    exige: [/\bcolocations?\b|\bco location\b|(apporter|amener|installer|deployer|mettre|placer|loger|heberger)[^.?!]{0,30}\b(mes|nos|mon|notre|propres)\b[^.?!]{0,25}(serveurs?|materiel|equipements?|machines?|baies?|racks?)|(bring|install|deploy|host|place|put)[^.?!]{0,30}\b(my|our|their|own)\b[^.?!]{0,25}(servers?|hardware|equipment|machines?|racks?)/],
    exclut: [/tarif|prix|cout|couts|combien|devis|tarification|montant|facturation|budget|price|pricing|\bcost|how much/],
    reponse: {
      fr: "Oui. La colocation vous permet d'installer et de gérer votre propre matériel dans un Datacenter ST DIGITAL, en bénéficiant de son environnement sécurisé. La configuration et les conditions se définissent avec notre équipe commerciale : je peux lui transmettre votre demande.",
      en: "Yes. Colocation lets you install and manage your own hardware in an ST DIGITAL Datacenter, within its secured environment. The configuration and the terms are defined with our sales team: I can pass your request on to them.",
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
    /* Prendre un rendez-vous. Isaac oriente, il ne reserve pas : la rubrique
       verifie la date, consulte l'equipe, attend ses reponses, envoie la
       confirmation et produit le code d'invitation. Promettre de s'en charger
       serait une promesse qu'il ne tient pas. */
    cle: "prendre_rendez_vous",
    exige: [/(prendre|avoir|obtenir|fixer|caler|demander|reserver|planifier)[^.?!]{0,20}(rendez ?vous|rdv)/],
    exclut: [/j'?ai (un )?(rendez ?vous|rdv)|mon (rendez ?vous|rdv)|annuler|reporter|confirmer/],
    reponse: {
      fr: "Avec plaisir. Sur l'écran d'accueil, touchez « Rendez-vous », puis « Prendre un rendez-vous ». Vous y choisissez l'hôte souhaité — commercial pour les offres et les tarifs, mais aussi technique, sécurité, RH, marketing ou administratif — ainsi que la date qui vous arrange et le motif. Votre demande part aussitôt à l'équipe concernée, et votre code d'invitation vous est envoyé dès qu'elle est confirmée.",
      /* Des guillemets ne s'entendent pas, et une phrase longue se suit mal a
         l'oral : on va au geste a faire. */
      fr_vocal: "Avec plaisir. Touchez Rendez-vous sur l'écran d'accueil, puis Prendre un rendez-vous. Vous y choisissez qui vous souhaitez rencontrer — le commercial pour les offres et les tarifs, par exemple — la date et le motif. L'équipe concernée est prévenue aussitôt, et votre code d'invitation vous arrive dès que c'est confirmé.",
      en: "With pleasure. On the home screen, tap \"Appointment\", then \"Request an appointment\". You choose the host you want — sales for offers and pricing, but also technical, security, HR, marketing or administration — along with the date that suits you and the purpose. Your request goes straight to the team concerned, and your invitation code is sent as soon as it is confirmed.",
    },
  },
  {
    /* La personne est deja attendue : elle n'a pas besoin de prendre un
       rendez-vous, mais de faire reconnaitre celui qu'elle a. */
    cle: "arrivee_rendez_vous",
    /* Le texte est normalise avant comparaison : l'apostrophe y devient une
       espace, donc « j'ai » s'ecrit « j ai ». Un motif ecrit avec l'apostrophe
       ne trouve rien. */
    exige: [/\bje ai (un |mon )?(rendez ?vous|rdv)|je viens pour (mon|un) (rendez ?vous|rdv)|mon (rendez ?vous|rdv) est|je suis attendu/],
    exclut: [/prendre|reserver|annuler|reporter/],
    reponse: {
      fr: "Bienvenue chez ST DIGITAL. Si vous avez reçu un code d'invitation, saisissez-le dans la rubrique « Rendez-vous » de la borne ; sinon, présentez-vous à l'accueil, on vous orientera.",
      fr_vocal: "Bienvenue chez ST DIGITAL. Si vous avez un code d'invitation, touchez Rendez-vous sur l'écran ; sinon, présentez-vous à l'accueil.",
      en: "Welcome to ST DIGITAL. If you received an invitation code, enter it in the kiosk's \"Appointment\" section; otherwise, please come to the reception desk and someone will direct you.",
    },
  },
  {
    /* Reponse standard de la base, section 9. Elle est redigee mot pour mot :
       la regenerer ne peut que l'abimer. */
    cle: "visite_datacenter",
    exige: [/visit|acces|acceder|entrer|rentrer|tour/, /datacenter|data ?cent|centre de donnees|nkok/],
    exclut: [/portes ouvertes|open day|ou se trouve|adresse|situe/],
    reponse: {
      fr: "Les visites du Datacenter sont encadrées pour des raisons de sécurité. L'accès aux zones techniques nécessite une autorisation et un accompagnement par du personnel habilité. Je peux transmettre votre demande à l'équipe concernée.",
      en: "Datacenter visits are supervised for security reasons. Access to technical areas requires authorisation and an escort by authorised staff. I can pass your request on to the team concerned.",
    },
  },
  {
    /* Reponse standard, section 10. Aucune date n'est annoncee : c'est
       precisement la question ou le modele a le plus de chances d'en inventer
       une, et la formule validee dit exactement quoi repondre. */
    cle: "portes_ouvertes",
    exige: [/portes ouvertes|porte ouverte|journee decouverte|open day|journees portes/],
    exclut: [],
    reponse: {
      fr: "Aucune date de prochaine journée portes ouvertes n'est annoncée à ce jour. Je peux transmettre votre demande à notre équipe afin que vous soyez informé dès qu'une date sera fixée.",
      en: "No date for the next open day has been announced so far. I can pass your request on to our team so that you are informed as soon as a date is set.",
    },
  },
  {
    /* Reponse standard, section 13. Le prix est le sujet ou une invention
       engage le plus l'entreprise. */
    cle: "tarifs",
    exige: [/tarif|prix|cout|couts|combien (ca )?(coute|cout)|devis|tarification|montant|facturation|remise|budget|factur|price|pricing|\bcost|how much|\bquote\b|\bfees?\b|\brates?\b|discount/],
    exclut: [],
    reponse: {
      fr: "Les tarifs dépendent de votre besoin et de la configuration choisie. Je peux transmettre votre demande à notre équipe commerciale afin d'obtenir une proposition adaptée.",
      en: "Pricing depends on your needs and on the chosen configuration. I can pass your request on to our sales team so that you receive a tailored proposal.",
    },
  },
  {
    /* Reponse standard, section 30. C'est une interdiction, pas une lacune :
       repondre « je n'ai pas l'information » laisserait croire que l'equipe
       communiquerait la liste. Le modele l'a fait deux fois aujourd'hui. */
    cle: "confidentialite_clients",
    exige: [/client/, /heberge|heberges|hebergent|nkok|datacenter|data ?cent|chez vous|liste|qui sont vos clients|vos clients sont/],
    exclut: [/devenir client|etre client|nouveau client/],
    reponse: {
      fr: "Je ne peux pas communiquer cette information. Elle relève de procédures ou d'informations internes. Je peux toutefois vous orienter vers le service compétent si votre demande est légitime.",
      en: "I cannot share that information. It falls under internal procedures or internal information. I can however point you to the relevant department if your request is legitimate.",
    },
  },
  {
    /* Section 4.1 : l'identite de la direction gabonaise n'est PAS confirmee
       en interne. La base interdit explicitement de citer un nom. */
    cle: "direction_gabon",
    exige: [/qui dirige|directrice|directeur|dg\b|pdg|patron|responsable|dirigeant/, /gabon|st ?digital|entreprise|societe|filiale/],
    exclut: [/datacenter|technique|commercial|securite|accueil/],
    reponse: {
      fr: "Je n'ai pas cette information confirmée en interne à vous communiquer avec certitude. Je peux transmettre votre demande à notre équipe pour vous mettre en relation avec la bonne personne.",
      en: "I do not have that information confirmed internally, so I cannot state it with certainty. I can pass your request on to our team to put you in touch with the right person.",
    },
  },
  {
    /* Section 19 : Isaac annonce d'abord qu'il ne diagnostique pas, PUIS
       recueille. L'ordre est une decision de la tutrice du 24/08. */
    cle: "support_technique",
    exige: [/panne|ne marche plus|ne fonctionne plus|probleme|bug|indisponib|plante|coupure|incident/],
    exclut: [/porte|intrusion|force|forcer|suspect|alarme|badge|vol/],
    reponse: {
      fr: "Je ne peux pas effectuer de diagnostic technique. Pouvez-vous me décrire le problème rencontré ? Je transmettrai votre demande à l'équipe technique, qui reviendra vers vous.",
      en: "I cannot carry out any technical diagnosis. Could you describe the problem you are facing? I will pass your request on to the technical team, who will get back to you.",
    },
  },
  {
    /* Section 20 : un temoin n'est pas un demandeur d'acces. La confusion a
       ete constatee le 28/09 et corrigee dans la fiche ; ici la bonne reponse
       est servie directement. */
    cle: "alerte_securite",
    exige: [/forcer|force une porte|intrusion|effraction|suspect|s'est introduit|est entre|alarme|vol|voler|cambriol/],
    exclut: [],
    reponse: {
      fr: "Je vous remercie de le signaler. Je transmets immédiatement cette alerte à l'équipe de sécurité pour qu'elle intervienne. Si la situation présente un danger, éloignez-vous et prévenez le personnel autour de vous.",
      en: "Thank you for reporting it. I am immediately passing this alert to the security team so that they can act. If the situation is dangerous, move away and alert the staff around you.",
    },
  },
  {
    /* Presentation generale. La base exige le positionnement panafricain et au
       moins trois domaines : une phrase fixe les garantit tous les deux. */
    cle: "presentation",
    exige: [/que est ce que st ?digital|qui etes vous|que fait st ?digital|presentez vous|c est quoi st ?digital|votre entreprise fait quoi|what (is|does) st ?digital/],
    exclut: [/cloud|cybersecurite|intelligence artificielle|formation|datacenter/],
    reponse: {
      fr: "ST DIGITAL est un groupe panafricain spécialisé dans les solutions numériques : Cloud et infrastructures, datacenters et hébergement, cybersécurité, intelligence artificielle, conseil et formation. Le groupe est présent dans sept pays africains, et dispose au Gabon d'un bureau à Libreville et d'un Datacenter à Nkok.",
      en: "ST DIGITAL is a pan-African group specialising in digital solutions: Cloud and infrastructure, datacenters and hosting, cybersecurity, artificial intelligence, consulting and training. The group operates in seven African countries, with an office in Libreville and a Datacenter in Nkok, Gabon.",
    },
  },
  {
    /* Le nombre de salaries n'est pas public : la base le dit, et il n'y a
       donc rien a chercher. Sans cette entree, la question partait dans la
       recherche documentaire pour cent dix secondes. */
    cle: "effectifs",
    exige: [/combien de (salaries|employes|personnes|collaborateurs)|effectifs?\b|taille de (l'|votre )?equipe|nombre d'?(employes|salaries)/],
    exclut: [],
    reponse: {
      fr: "Le nombre de salariés n'est pas une information publique. Je peux transmettre votre demande à notre équipe si vous en avez besoin.",
      en: "Headcount is not public information. I can pass your request on to our team if you need it.",
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
      /* Lue a voix haute, l'adresse doit s'entendre. « info@st.digital » se
         prononce mal ; ecrite ainsi, elle se comprend a l'oreille et reste
         lisible a l'ecran, ou la reponse s'affiche aussi. */
      fr_vocal: "Vous pouvez nous joindre au 66 17 66 41, indicatif 241. Par courriel, c'est info, arobase, s t point digital.",
      en: "You can reach us by email at info@st.digital, or by phone on +241 66 17 66 41.",
      en_vocal: "You can reach us on 66 17 66 41, country code 241. By email, that is info, at, s t dot digital.",
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

/* `mode` vaut "vocal" quand la reponse sera lue a voix haute. Certaines
   reponses ont alors une variante ecrite pour l'oreille : une adresse
   electronique se prononce mal, des guillemets ne s'entendent pas. Les autres
   servent le meme texte dans les deux modes. */
function reponseValidee(question, langue, mode) {
  const fait = chercheFait(question);
  if (!fait) return null;
  const cle = langue === "en" ? "en" : "fr";
  const parlee = mode === "vocal" ? fait.reponse[cle + "_vocal"] : null;
  return { cle: fait.cle, reponse: parlee || fait.reponse[cle] };
}

module.exports = { normalise, chercheFait, reponseValidee, FAITS, JAMAIS_RACCOURCI };
