# Isaac Ahmed — note de présentation

**02/10/2026.** État de la borne au moment de la présentation, ce qu'il faut
mettre en avant, ce qui a freiné, et ce qui reste à faire.

Tous les chiffres de ce document sont mesurés, pas estimés. Les sources sont
citées : `BENCHMARKING_2026-09-28.md`, `MESURE_AUDIO_2026-09-27.md`, le journal
des conversations de la borne, et les mesures du 01 et 02/10.

---

## 1. Ce qui tourne en ce moment

| | |
|---|---|
| Interface | `main.d8379170.js` |
| Modèle de langue | `qwen2.5:7b-instruct-q4_K_M`, en local sur la tour |
| Reconnaissance vocale | Whisper `medium`, moteur `faster_whisper` |
| Synthèse vocale | Piper — `pierre` en français, `ryan` en anglais |
| Table de réponses validées | **27 entrées**, français et anglais |
| Recherche documentaire | **éteinte** (interrupteur, réversible) |

Rien n'est hébergé à l'extérieur. Le modèle, la reconnaissance, la synthèse, la
base et le back-office tournent tous sur la tour, dans le réseau interne.

---

## 2. Ce qu'il faut mettre en avant

### 2.1. La borne répond sans appeler le modèle pour la majorité des questions

C'est la décision d'architecture la plus importante du projet, et elle est
mesurée sur le trafic réel.

**133 des 233 questions distinctes réellement posées à la borne — 57 % — sont
servies en moins d'une seconde**, sans passer par le modèle de langue.

| Question | Avant | Maintenant |
|---|---|---|
| « Quels sont vos horaires ? » | 105 s | **0,2 s** |
| « Où se trouve le Datacenter ? » | 105 s | **0,2 s** |
| « Je voudrais un devis » | 105 s | **0,2 s** |
| « Rendez-vous » | 105 s | **0,2 s** |

Et ce n'est pas qu'une question de vitesse : ces réponses sont les
**formulations validées par ST DIGITAL**, servies mot pour mot. Une valeur lue
dans une table ne peut pas dériver, alors qu'une réponse régénérée le peut — et
l'a déjà fait, le jour où la borne a annoncé « 8h-18h, samedi 8h-12h » alors
que les horaires validés sont 8h-17h.

> **Phrase à dire :** « La fiabilité et la vitesse ne s'opposent pas ici. La
> même décision améliore les deux. »

### 2.2. Isaac ne promet rien qu'il ne tienne

Quand une demande ne peut être traitée que par un commercial — un prix
dimensionné sur un besoin, une offre, un projet à chiffrer — Isaac le dit,
**demande l'accord du visiteur**, et le service commercial reçoit réellement un
courriel.

Le scénario complet, en cinq temps :

```
1. Isaac répond ce qu'il sait, puis propose de transmettre
2. le visiteur touche « Oui » ou « Non »
3. Isaac demande une adresse pour la réponse
4. le visiteur la saisit
5. « C'est fait » — et le courriel part avec l'adresse
```

Points à souligner :

- **un seul courriel**, et il porte de quoi répondre ;
- **l'accord est explicite** — Isaac n'agit pas au nom de quelqu'un qui n'a rien
  demandé ;
- **un service est prévenu, jamais une personne nommée** : un commercial peut
  être absent, le service ne l'est pas ;
- le visiteur n'attend rien — la réponse s'affiche immédiatement, le courriel
  part en arrière-plan.

### 2.3. Ce qu'Isaac refuse de faire

C'est souvent ce qui impressionne le plus dans une démonstration.

| Situation | Ce qu'il fait |
|---|---|
| On lui demande un prix | Il n'en invente aucun, il transmet |
| On lui demande qui sont les clients hébergés | Il invoque la confidentialité, il ne dit pas « je ne sais pas » |
| On lui demande un code, un badge, un identifiant | Il refuse fermement, sans se justifier par une ignorance |
| On lui demande la date des prochaines portes ouvertes | Aucune date annoncée tant qu'il n'y en a pas d'officielle |
| On lui demande le nom de la direction gabonaise | Information non confirmée en interne : il ne cite personne |
| On lui pose une question hors sujet | Il recadre vers l'accueil, sans renvoyer vers un site web |

Ces règles viennent de la base de connaissances validée, pas de moi.

### 2.4. Deux langues, vraiment

Français et anglais : la transcription, la réponse, **et la voix**. Un visiteur
anglophone entend une voix anglaise (`ryan`), pas de l'anglais lu avec un accent
français.

Les 250 clés d'interface sont à parité stricte, et les réponses validées ont
leur version anglaise.

### 2.5. La conversation parlée tient debout

- la fin de parole est détectée au silence, pas par un bouton ;
- un seuil de bruit se calibre sur le hall, pas sur une constante ;
- pendant la recherche, Isaac dit quelque chose plutôt que de laisser un
  silence ;
- une panne met la conversation en pause, elle ne la ferme pas ;
- le visiteur sait quand sa session va s'effacer, et peut la terminer lui-même.

### 2.6. Tout est éprouvé

- **103 essais automatiques** qui passent, dont plusieurs gardent des décisions
  que le code ne révèle pas à la lecture ;
- **la recette des 20 questions validée par l'encadrante le 02/10** ;
- un banc de mesure complet du 28/09 : quatre configurations, 20 questions
  chacune, notées avec la même grille.

---

## 3. Ce qui a freiné

À dire franchement : ce sont des contraintes réelles, pas des excuses, et les
avoir mesurées fait partie du travail.

### 3.1. Le matériel

**Intel i5-6500, 4 cœurs, sans carte graphique.**

Le modèle de langue y génère **2,5 jetons par seconde**. Une réponse de deux
phrases demande donc une douzaine de secondes, et aucun réglage logiciel ne
change cet ordre de grandeur : c'est la vitesse de la mémoire.

C'est précisément ce qui a conduit à la table de réponses validées. Le frein a
produit la meilleure décision d'architecture du projet.

### 3.2. Les compromis mesurés, et assumés

| Choix | Gain | Coût | Décision |
|---|---|---|---|
| Modèle 3 milliards | −54 % de temps | perd des règles de posture | **rejeté** |
| Morceaux de 500 caractères | −73 % | **annonce de faux horaires** | **rejeté** |
| Whisper `small` | −7 s par phrase dite | moins fin sur une voix réelle | à ré-arbitrer |
| Table de réponses validées | 105 s → 0,2 s | **aucun** | **retenu** |

Le passage aux morceaux de 500 caractères méritait d'être essayé et il a produit
une information fausse sur les horaires — la question la plus posée de la borne.
C'est le genre d'essai qu'il faut raconter : il montre que la mesure a servi à
quelque chose.

### 3.3. Le réseau

La borne est publiée par un relais public. Depuis Libreville, le trajet est
**Gabon → Madrid → Gabon, 113 ms l'aller-retour**, et un échange parlé fait
quatre allers-retours.

Résultat mesuré sur la même requête :

| | depuis la tour | par le relais public |
|---|---|---|
| une réponse de la table | **0,30 s** | 1,15 s |
| la synthèse d'une phrase | **0,32 s** | 2,5 s |

**Une seconde par phase, quatre phases par échange.** La liaison directe par le
réseau interne supprime ce détour.

### 3.4. Des défauts silencieux, et ce qu'ils ont appris

Plusieurs défauts n'ont levé aucune erreur et ne se voyaient pas à la lecture.
Ce sont les plus instructifs :

- **253 secondes** après chaque salutation : deux nœuds demandaient une taille
  de contexte différente au même modèle, ce qui vidait le cache. Un seul nombre
  séparait 0,4 s de 253,9 s.
- **Les sons d'attente étaient muets** : un objet passé là où un tableau était
  attendu. La fonction renonçait à sa première ligne, sans erreur.
- **« Colocation » contient « location »** : une frontière de mot manquante
  faisait répondre l'adresse du Datacenter à une question de colocation.
- **Un compteur à 6977 secondes** : aucun appel réseau n'avait de délai, et un
  appel sans réponse ne rejette jamais.

> **Leçon à formuler :** ce qui échoue bruyamment se corrige. Ce qui échoue en
> silence demande qu'on aille mesurer.

---

## 4. Pistes d'amélioration

Par gain attendu, du plus élevé au plus faible.

### 4.1. Une carte graphique

**Le seul changement qui règle le pire cas.** La lecture de l'invite est une
multiplication de matrices dense — le travail pour lequel les cartes graphiques
existent. Une question réellement nouvelle passerait de 100-175 s à quelques
secondes.

Tout le reste améliore le cas courant ; seul celui-ci change le plafond.

### 4.2. Élargir la table de réponses validées

Chaque entrée ajoutée fait basculer une famille de questions de 12 s à 0,2 s,
**sans aucun coût en exactitude**. La couverture est passée de 47 % à 57 % en une
journée.

La prochaine étape est en cours d'étude : reconnaître le hors sujet **par ce
qu'il ne contient pas** — une phrase qui n'emploie aucun mot du domaine d'Isaac
n'est pas une question pour lui. Éprouvée sur les 233 questions réelles, cette
règle recadrait encore quelques demandes légitimes : elle n'est pas déployée.

### 4.3. La lecture du son en flux

Aujourd'hui la borne télécharge toute la phrase synthétisée avant de la jouer.
Si le service acceptait une lecture directe, la voix partirait en quelques
centaines de millisecondes au lieu d'attendre la fin du transfert — sur chaque
phrase, salutation comprise.

### 4.4. La boîte aux lettres institutionnelle

L'expéditeur et le destinataire des courriels doivent être une adresse de
fonction (`accueil@st.digital`), pas une adresse personnelle. C'est la même
demande d'administration Microsoft 365 qui débloquerait l'envoi SMTP.

### 4.5. Sécurité et exploitation

- faire tourner les trois mots de passe partagés ;
- documenter l'administrateur général ;
- réécrire l'historique Git, qui porte l'adresse du réseau interne dans
  17 commits (le dépôt est privé, ce n'est donc pas urgent) ;
- identification par badge, prévue et non commencée.

---

## 5. Ce que je ferais si on me demandait « et après ? »

Trois phrases, dans cet ordre :

1. **Isaac est fiable parce qu'il refuse d'inventer** — et cette discipline a
   coûté plus de travail que les réponses elles-mêmes.
2. **Il est rapide parce qu'il sait quand ne pas réfléchir** — plus d'une
   question sur deux ne touche jamais le modèle.
3. **Ce qui reste à gagner est matériel, pas logiciel** — le plafond actuel est
   celui d'un processeur de bureau de 2015.
