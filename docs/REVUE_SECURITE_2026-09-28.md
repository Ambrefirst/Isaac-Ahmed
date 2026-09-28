# Revue de sécurité du back-office — 28/09/2026

Cette revue a été déclenchée par une question simple : **est-il normal que
n'importe qui puisse créer un compte administrateur ?** La réponse était non,
et l'examen du code a fait apparaître quatre autres défauts, dont un qui
aurait laissé passer n'importe quel mot de passe.

Elle porte sur l'authentification et la gestion des comptes. Elle ne couvre
pas le chiffrement des sauvegardes ni la sécurité physique de la tour, qui
sortent du périmètre du stage.

---

## Méthode

Le code du routeur a été lu ligne à ligne, puis chaque hypothèse a été
**vérifiée par le canal réel** plutôt que par relecture : requêtes HTTP depuis
l'extérieur, exécution du banc d'essai, et, pour le défaut de comparaison,
exécution isolée de la fonction fautive.

C'est ce dernier point qui a compté : le défaut le plus grave de cette revue
se lit correctement et ne se voit qu'en l'exécutant.

---

## Ce qui allait déjà bien

| Point | État |
|---|---|
| Mots de passe des comptes nominatifs | scrypt, sel propre par compte |
| Comparaison des empreintes | temps constant (`timingSafeEqual`) |
| Jetons de session | 24 octets d'aléa cryptographique, expiration 12 h |
| Désactivation d'un compte | ferme aussi ses sessions ouvertes |
| Cloisonnement par site | un compte ne voit et ne modifie que son pays |
| Empreintes et sels | ne sortent jamais du serveur, même pour un administrateur |
| **Surface publique** | **le routeur d'administration n'est pas joignable depuis le lien public** |

Ce dernier point a été vérifié en appelant `admin_login`, `admin_add_user` et
`admin_list_appointments` depuis l'adresse publique : **404** pour les trois.
C'est la mitigation la plus importante du lot, et elle réduit la gravité de
tout ce qui suit à « quelqu'un ayant déjà accès au réseau interne ».

---

## Défauts trouvés et corrigés

### 1. Comparaison de mots de passe contournable par n'importe quelle valeur

**Gravité : critique.** Trouvé en écrivant le correctif du point 3, pas en
cherchant celui-ci.

La fonction de comparaison en temps constant interprète ses arguments comme de
l'**hexadécimal**. Employée sur des empreintes, elle est correcte. Employée sur
des mots de passe ordinaires, les deux chaînes deviennent deux tampons
**vides** — donc de même longueur, donc égaux.

```
memeEmpreinte('un-mot-de-passe-quelconque', 'une-valeur-sans-rapport')  →  true
longueur des tampons : 0 et 0
```

J'allais l'utiliser pour comparer le mot de passe partagé. Le contrôle aurait
accepté n'importe quelle saisie, en paraissant plus rigoureux qu'avant.

**Correction.** Une fonction distincte pour le texte, qui compare les condensés
SHA-256 — toujours trente-deux octets, donc jamais de longueur nulle. Un essai
du banc garde la distinction.

> Ce défaut n'aurait été trouvé par aucune relecture : le code est correct
> pour l'usage prévu de la fonction, et faux pour l'usage que j'allais en
> faire. Seule l'exécution le montre.

### 2. Le mot de passe partagé fabriquait des administrateurs permanents

**Gravité : élevée.** C'est le défaut signalé.

Le mot de passe partagé du site (`GABON`, `CAMEROUN`, `IVOIRE`) recevait le
rôle `administrateur`. Or il est connu de toute l'équipe et a circulé : ce
n'est pas un secret personnel. Quiconque le détenait pouvait créer un compte
nominatif d'administrateur — qui **survit à la rotation du mot de passe
partagé** et paraît parfaitement légitime dans le journal.

**Correction.** Le mot de passe partagé n'a plus le rôle d'administrateur mais
un rôle d'amorce. Tant que le site n'a **aucun** compte nominatif, il peut en
créer un — et ce sera un administrateur, sinon personne ne pourrait créer les
suivants. Dès qu'un compte existe, il ne peut plus rien créer ni activer.

*État au 28/09 : le Gabon a un compte nominatif, son amorce est donc consommée.
Le Cameroun et la Côte d'Ivoire n'en ont pas encore.*

### 3. Aucun frein sur le mot de passe partagé

**Gravité : élevée.** La connexion nominative bloque après cinq échecs. Le
chemin par mot de passe partagé n'avait aucun compteur : il suffisait de
frapper à cette porte-là pour essayer autant de fois qu'on voulait.

**Correction.** Le même frein — cinq échecs, quinze minutes — s'applique aux
deux chemins. Un frein posé sur une seule entrée n'est pas un frein.

### 4. Le rôle d'administrateur se choisissait dans une liste déroulante

**Gravité : élevée.** Une fois le point 2 corrigé, il restait une porte plus
large : un administrateur en fabriquait un autre d'un clic. Rien ne
distinguait ce geste de la création d'un compte d'accueil — ni confirmation,
ni limite, ni trace particulière.

Ce n'est pourtant pas le même geste. Un administrateur crée des comptes et en
désactive : il **se reproduit**. Un seul suffit pour que le droit se répande
sans que personne l'ait décidé.

**Correction, en trois verrous parce qu'un seul se contourne :**

1. **Redonner son propre mot de passe.** Un jeton de session vaut douze
   heures ; il ne doit pas valoir la nomination d'un administrateur permanent.
2. **Trois administrateurs actifs par site au maximum.** La limite n'est pas
   technique : elle oblige à retirer le droit avant de le donner, donc à savoir
   qui l'a.
3. **Une action distincte au journal** (`administrateur_nomme`), pour répondre
   à « qui a donné ce droit, et quand » sans tout relire.

*Choix délibéré : il n'existe aucun moyen de changer le rôle d'un compte
existant. Une promotion silencieuse serait exactement le geste qu'on cherche à
encadrer ; il faut désactiver et recréer, ce qui laisse deux traces.*

### 5. Changer son mot de passe ne changeait pas le sien

**Gravité : élevée, et entièrement silencieuse.**

L'événement écrivait toujours le mot de passe **partagé du site**, quelle que
soit la façon dont on s'était connecté. Pour un compte nominatif, deux issues,
toutes deux mauvaises :

- la personne tape son mot de passe personnel : il ne correspond pas au secret
  partagé, l'opération échoue, et l'écran affiche « le mot de passe actuel est
  incorrect » alors qu'il était correct ;
- elle tape par hasard le mot de passe partagé : il est **remplacé pour tout le
  site**, et elle croit avoir changé le sien, qui n'a pas bougé.

**Correction.** L'événement regarde qui appelle. Un compte nominatif change son
empreinte après avoir redonné son mot de passe actuel, et ses autres sessions
sont fermées. Le mot de passe partagé, lui, cesse d'être stocké en clair : il
est salé et empreint comme les autres, avec repli de lecture sur l'ancien
format pour ne pas enfermer tout le monde dehors pendant la bascule.

### 6. Une longueur ne faisait pas un mot de passe

**Gravité : moyenne.** La seule règle était « au moins dix caractères », que
`0000000000` satisfait.

**Correction.** Sont désormais refusés : un caractère répété, une suite
évidente, un mot courant (`motdepasse`, `azerty`, `isaac`, le nom des sites…),
et **tout fragment du nom ou de l'adresse de la personne** — qui figurent tous
deux en clair dans la liste des comptes. Le minimum passe de 8 à 10 partout :
les deux valeurs coexistaient selon l'endroit.

### 7. Un mot de passe provisoire qui ne le restait pas

**Gravité : moyenne.** Un compte créé par un administrateur a un mot de passe
que cette personne connaît, et rien n'obligeait à le changer. Le journal
nommait donc un titulaire dont le secret était partagé avec son créateur.

**Correction.** Le compte porte un indicateur `doitChanger`, et le back-office
affiche un bandeau tant que le mot de passe n'a pas été changé. *Ce n'est pas
un blocage : le changement n'est pas encore imposé à la connexion. Inscrit aux
points restants.*

---

## Ce qui reste à faire

| Point | Pourquoi ce n'est pas fait |
|---|---|
| **Rotation des trois mots de passe partagés** | Ils ont circulé. À faire par l'équipe, pas par moi. |
| **Basculer `AUTORISER_COMPTES_PARTAGES` à `false`** | Dès que chaque site a ses comptes nominatifs. |
| **Vider `DEFAULT_ADMIN_ACCOUNTS` du routeur** | Trois mots de passe y figurent en clair ; quiconque lit le flux n8n les lit. |
| **Imposer le changement du mot de passe provisoire** | Aujourd'hui signalé, pas imposé. |
| **Second facteur** | Hors périmètre du stage ; à poser si le back-office s'ouvre hors du réseau interne. |

---

## Ce que cette revue apprend

**Un correctif est un endroit où chercher d'autres défauts.** Le défaut
critique n° 1 a été trouvé en écrivant le correctif du n° 3, et le n° 5 en
relisant le code du n° 4. Aucun n'a été trouvé en le cherchant.

**Une fonction correcte peut être fausse ailleurs.** La comparaison en temps
constant est juste pour des empreintes et dangereuse pour du texte. Le nom ne
le dit pas, la signature non plus, et le compilateur encore moins.

**La vérification doit passer par le canal réel.** Que le back-office soit
inaccessible publiquement se lit dans la configuration ; cela se *sait* en
envoyant trois requêtes depuis l'extérieur.

Le banc d'essai du routeur passe de 80 à **111 vérifications**, dont onze
gardent précisément les défauts ci-dessus.
