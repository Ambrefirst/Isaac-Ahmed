# Phrases à enregistrer pour mesurer la reconnaissance vocale

## Pourquoi ces enregistrements sont nécessaires

La mesure du 27/09 a donné un taux d'erreur de 6 %, mais **ce chiffre ne vaut rien** : il a été obtenu sur de la parole synthétique produite par Piper. Pas de bruit de hall, pas d'accent, pas de distance au micro, et surtout une prononciation qui n'est pas celle d'un humain. En rejouant les mêmes phrases avec une autre voix de synthèse, une partie des erreurs disparaissait — preuve qu'on mesurait la synthèse et non l'écoute.

Seuls de vrais enregistrements permettront de conclure. C'est la raison de ce document.

## Comment enregistrer

**Sur Windows** : l'application « Enregistreur vocal » suffit. Le format `.m4a` qu'elle produit est accepté, tout comme `.wav` ou `.mp3`.

**Un fichier par phrase**, nommé par son numéro : `01.m4a`, `02.m4a`, et ainsi de suite. Sans cette correspondance, la comparaison avec le texte de référence est impossible.

**Trois consignes qui comptent plus que la qualité du micro :**

1. **Se tenir à la distance réelle d'une borne**, environ cinquante à soixante-dix centimètres. Un micro collé à la bouche donnerait le même biais que la parole synthétique.
2. **Parler normalement.** Ne pas sur-articuler, ne pas ralentir. Une diction de dictée fausserait la mesure dans le sens flatteur, ce qui est précisément le défaut qu'on cherche à corriger.
3. **Si possible, refaire la série une seconde fois dans un moment bruyant** — couloir passant, climatisation, conversation en fond. Ces enregistrements-là seront les plus instructifs, car ils représentent le hall d'accueil réel.

## Les phrases

Chaque phrase a une raison d'être ; elles ne sont pas interchangeables.

| N° | Phrase | Ce qu'elle éprouve |
|---|---|---|
| 01 | Bonjour, quels sont les horaires d'ouverture ? | Phrase courante, référence de base |
| 02 | Où se trouve le datacenter de Nkok ? | Vocabulaire métier et toponyme local |
| 03 | J'ai rendez-vous à dix heures avec monsieur Obame. | Heure parlée et patronyme gabonais |
| 04 | Je viens voir madame Nguema au service technique. | Second patronyme, service demandé |
| 05 | Est-ce que ST Digital propose du cloud souverain ? | Le sigle de l'entreprise, à l'oreille cette fois |
| 06 | Je voudrais prendre rendez-vous avec le service commercial. | Intention réelle de la borne |
| 07 | Comment faire pour signaler mon départ ? | Intention réelle, et la phrase qui échouait en synthèse |
| 08 | Le datacenter de Grand-Bassam est-il certifié Tier III ? | Toponyme composé et certification |
| 09 | Euh… je cherche la salle de réunion, s'il vous plaît. | Hésitation naturelle, que la parole synthétique ne produit jamais |
| 10 | Merci. | Énoncé très court, cas limite de la détection de fin de phrase |

## Ce qui sera mesuré

- le **taux d'erreur mot**, après normalisation des accents, de la casse et de l'écriture des nombres, pour ne pas compter comme fautes des transcriptions correctes ;
- l'**écart entre environnement calme et bruyant**, qui décidera s'il faut un micro directionnel ;
- l'**apport réel de l'amorce de vocabulaire métier**, qui a fait passer le taux de 32,8 % à 6 % sur la parole synthétique, et dont il faut vérifier qu'elle tient sur de la vraie voix ;
- le **temps de transcription** sur des durées réelles, le facteur mesuré étant de × 0,75 et donc sans marge.
