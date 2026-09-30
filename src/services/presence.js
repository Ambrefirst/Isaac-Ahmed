/* Le visiteur est-il devant la borne, ou ailleurs ?

   La question n'est pas théorique. Quand Isaac transmet une demande à
   l'équipe, il répondait « un membre de l'équipe a été prévenu et va venir
   vous voir ». C'est juste devant la borne du hall. Ce l'est beaucoup moins
   pour quelqu'un qui a ouvert le lien public depuis chez lui : on lui promet
   une visite qui n'arrivera jamais, et l'équipe reçoit une demande sans
   savoir où joindre la personne.

   COMMENT ON LE SAIT. Les deux accès ne passent pas par la même porte. La
   borne du hall est servie sur le réseau interne, sur un port explicite ; le
   lien public est servi sur le port HTTPS par défaut, qui n'apparaît pas dans
   l'adresse. Cette distinction existe déjà pour des raisons de sécurité — le
   back-office n'est joignable que par la première — et on s'en sert ici.

   CE QUE CE SIGNAL NE DIT PAS. Quelqu'un qui ouvre l'adresse interne depuis
   son poste, dans un bureau de l'étage, sera compté comme présent. C'est
   acceptable : il est dans le bâtiment. Ce qu'on cherche à éviter, c'est de
   promettre une rencontre à quelqu'un qui est à Port-Gentil. */

export function surPlace() {
  if (typeof window === "undefined" || !window.location) return true;
  const port = window.location.port;
  const hote = window.location.hostname || "";

  /* Développement local : on se comporte comme la borne. */
  if (hote === "localhost" || hote === "127.0.0.1" || hote === "[::1]") return true;

  /* Un port explicite dans l'adresse signale l'accès interne. Le lien public
     passe par le port par défaut, que le navigateur n'affiche pas. */
  return port !== "" && port !== "443" && port !== "80";
}
