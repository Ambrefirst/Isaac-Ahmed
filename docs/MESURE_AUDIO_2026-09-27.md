# Mesure de la chaîne audio — 27/09/2026

Même démarche que la journée de mesure du 24/09 sur le texte : mesurer avant de décider, plutôt qu'estimer. Le matériel est la tour, **sans GPU** : Intel i5-6500, 4 cœurs, 62 Go de RAM.

## Décision d'architecture

Deux chemins existaient, et ils ne se valent pas pour ce projet.

L'API Web Speech du navigateur aurait demandé quelques dizaines de lignes. Mais dans Chrome, **l'audio du visiteur part chez Google**, et la reconnaissance n'existe pas sous Firefox. Le projet a fait retirer un appel à `api.qrserver.com` le 24/09 parce qu'un code d'accès ne doit pas transiter par un tiers ; envoyer la voix des visiteurs d'un Datacenter Tier III à un prestataire extérieur pose le même problème, en plus grave.

Retenu : **tout sur la tour**. Whisper pour la reconnaissance, Piper pour la synthèse, les deux libres, les deux en français, les deux sans GPU. Rien ne sort de l'infrastructure.

| Service | Conteneur | Port | Modèle |
|---|---|---|---|
| Synthèse | `isaac-piper` | 5002 | Piper, voix `fr_FR-upmc-medium` et `fr_FR-siwis-medium` |
| Reconnaissance | `isaac-whisper` | 9000 | Whisper `small`, moteur `faster-whisper` |

## Résultats

### Synthèse — largement suffisante

| | Moyenne | Pire cas |
|---|---|---|
| Temps de synthèse | **0,19 s** | 0,53 s |
| Facteur temps réel | **× 0,05** | |

Piper produit une phrase de dix secondes en un demi-seconde. La synthèse n'est pas un sujet : elle est perceptuellement instantanée, et laisse toute la marge pour lire la réponse au fil de sa génération plus tard.

### Reconnaissance — utilisable, sans marge pour le flux continu

| | Moyenne | Pire cas |
|---|---|---|
| Temps de transcription | **1,86 s** | 2,01 s |
| Facteur temps réel | **× 0,75** | |

Un facteur de 0,75 signifie que la machine transcrit plus vite qu'on ne parle, mais de peu. **Conséquence de conception : il faut enregistrer la phrase puis la transcrire, pas transcrire en direct.** Un flux continu n'aurait que 25 % de marge, ce qui ne tient pas dès qu'une autre tâche occupe le processeur.

### Ce que le visiteur attendra

Transcription **1,9 s** + Isaac (mesuré le 24/09) + synthèse **0,2 s**, soit **environ 2 secondes ajoutées** au temps de réponse déjà connu.

## Trois erreurs de mesure, et ce qu'elles ont appris

### 1. Un taux d'erreur qui mesurait ma façon d'écrire

Le premier passage annonçait **20,8 %** de mots erronés. En relisant les transcriptions, la mesure était fausse, pas le moteur : « départ » correctement accentué était compté comme une faute parce que ma référence l'écrivait sans accent, et « à 10h » comptait pour trois erreurs contre « à dix heures ». Une mesure qui compte comme fautes les accents corrects et les chiffres bien écrits ne mesure pas la reconnaissance.

Après normalisation — accents, casse, ponctuation, écriture des nombres et des heures — la comparaison porte enfin sur ce qui a été entendu.

### 2. Une amorce de contexte purement ignorée

Whisper accepte une **amorce** qui oriente le décodage vers un vocabulaire attendu. Je l'ai d'abord passée en champ de formulaire alors qu'elle s'attend en paramètre d'URL. Elle était donc ignorée : les deux passages, avec et sans, rendaient un texte **rigoureusement identique**, ce qui aurait dû me mettre la puce à l'oreille immédiatement.

Corrigée, son effet est considérable :

| | Taux d'erreur mot |
|---|---|
| Sans amorce | 32,8 % |
| Avec amorce métier | **6,0 %** |

L'amorce contient le vocabulaire du site : datacenter, Nkok, Libreville, Douala, Grand-Bassam, Tier III, cloud souverain, et des patronymes gabonais.

> **L'amorce n'est pas gratuite.** Elle biaise le décodage, et une amorce trop longue a dégradé une phrase qui passait sans elle. Elle se règle, elle ne s'allonge pas indéfiniment.

### 3. Je mesurais la prononciation de Piper, pas l'écoute de Whisper

L'erreur la plus instructive. La transcription était mesurée sur de la parole **synthétique**, produite par Piper. « Nkok » revenait « une coque », « signaler » revenait « signer les mots ».

En rejouant les mêmes phrases avec l'autre voix, ces erreurs **disparaissent**. Elles venaient de la synthèse, pas de la reconnaissance : Whisper transcrivait fidèlement ce qu'on lui faisait entendre.

**Conséquence : le taux d'erreur mesuré ici ne dit rien de la réalité.** Pas de bruit de hall, pas d'accent, pas de distance au micro, et surtout une prononciation qui n'est pas celle d'un humain. Les **temps** sont représentatifs ; la **qualité de reconnaissance reste à mesurer sur de vrais enregistrements**, et ne peut pas l'être autrement.

## Prononciation : une couche nécessaire avant la synthèse

Piper lit ce qu'on lui écrit. Sur un texte métier, cela produit trois familles de fautes, toutes entendues :

| Écrit | Prononcé | Corrigé en |
|---|---|---|
| `ST Digital` | « sans digital » | `S T Digital` |
| `Isaac` | déformé, réentendu « Isalak » | `Izak` |
| `Tier III` | « Tier trois romain » | `Tier 3` |
| `8h` | mal découpé | `8 heures` |
| `info@st.digital` | épelé lettre à lettre | « l'adresse affichée à l'écran » |
| `l’assistant` (apostrophe courbe) | risque de lire « L assistant » | ramené à `l'assistant` |

> **L'apostrophe mérite son paragraphe.** Un défaut a été signalé à l'écoute : « l'assistant » prononcé « L assistant », la lettre épelée. Vérification faite, il venait d'une **commande d'essai** où j'avais retiré les apostrophes pour contourner les guillemets du shell — la synthèse dure alors 4,2 s au lieu de 3,9 s, la différence étant exactement le temps d'épeler la lettre. Le service n'était pas en cause.
>
> Mais l'essai a révélé un risque réel : le modèle de langue produit volontiers l'**apostrophe courbe** `’` plutôt que la droite `'`, ainsi que des guillemets français, des tirets cadratins et des points de suspension. Toute cette ponctuation typographique est désormais ramenée à la ponctuation simple avant la synthèse.
>
> En revanche, **aucune tentative de reconstituer une élision absente**. La tentation était grande, mais réécrire « l assistant » en « l'assistant » reviendrait à corriger du texte correct sur la foi d'une heuristique, pour un cas qui ne se produit pas : la base de connaissances et les réponses du modèle portent de vraies apostrophes.

> **ST n'est pas un mot.** C'est le sigle de **Solutions de Transformation**, et les deux lettres doivent s'entendre séparément. C'est une exigence de l'entreprise, pas une préférence de lecture.

La graphie du prénom a été choisie à l'oreille, parmi quatre candidates soumises en contexte : `Izak` est celle qui a été retenue.

Ces règles vivent dans une **table**, `prononciation.py`, appliquée avant chaque synthèse. Elle se complète au fil des mots qu'on entend mal, sans toucher au service. L'en-tête `X-Texte-Lu` de la réponse restitue le texte réellement prononcé : quand une prononciation surprend, on voit immédiatement ce qui a été lu.

## Choix de la voix

`upmc` est retenue. Deux raisons, l'une mesurée, l'autre écoutée :

- **mesurée** : elle est nettement mieux reconnue par la machine sur le vocabulaire métier et les patronymes ;
- **écoutée** : elle est plus fluide, là où `siwis` découpe les phrases et donne l'impression d'une récitation.

`siwis` reste embarquée et reste sélectionnable par le champ `voix` de la requête.

## Mesure sur de vrais enregistrements — le seul chiffre qui compte

Dix phrases dictées au micro, à la distance d'une borne, **44,8 s de parole**, 4,5 s par phrase en moyenne.

| Réglage | Taux d'erreur mot | Phrases parfaites | Facteur temps réel |
|---|---|---|---|
| Sans amorce | 26,9 % | 3 / 10 | × 0,38 |
| Avec amorce métier | 15,4 % | 4 / 10 | × 0,40 |
| **Avec amorce et filtre de silence** | **12,8 %** | **5 / 10** | **× 0,40** |

**Le temps est meilleur que prévu.** Le facteur × 0,40 sur de la vraie voix, contre × 0,75 mesuré sur la synthèse : la transcription prend **1,8 s pour 4,5 s de parole**. La marge est confortable, là où la mesure synthétique laissait craindre le contraire.

**L'amorce vaut son poids** : elle divise le taux d'erreur par deux. Le filtre de silence apporte un gain plus modeste.

### Ce que valent vraiment ces 12,8 %

Plusieurs écarts comptés comme erreurs n'en sont pas :

- « quels sont **les** horaires » entendu « **vos** horaires » — c'est vraisemblablement ce qui a été dit, ma référence ne correspond pas à l'énoncé réel ;
- « J'ai rendez-vous » entendu « J'ai **un** rendez-vous », même remarque ;
- « **Euh** je cherche » entendu « Je cherche » — Whisper écarte l'hésitation, ce qui est souhaitable pour une borne.

**Le taux réel est donc inférieur à 12,8 %.** Une seule erreur résiste vraiment, et elle compte : **« Nkok » entendu « une coque »**. C'est le nom du Datacenter du Gabon, donc le mot le plus prononcé du site.

### Le réglage ne se règle pas sur trois phrases

En cherchant l'amorce qui corrigerait « Nkok », une découverte a tranché la question : **le modèle n'est pas déterministe**. Le même fichier, le même réglage, deux appels — et « à dix heures » devient « à disir ». Les écarts entre variantes d'amorce se sont révélés **du même ordre que le bruit du modèle lui-même**.

Sur-ajuster sur les trois phrases difficiles aurait donné un réglage pire en moyenne. Le réglage retenu est donc celui qui gagne sur les dix : **amorce métier complète, filtre de silence actif**.

### La correction de « Nkok » ne relève pas du réglage

Elle relève de l'application. De même qu'un dictionnaire de prononciation corrige ce que Piper dit mal, un **dictionnaire de correction après transcription** doit rattraper ce que Whisper entend mal sur le vocabulaire du site : « une coque » vers « Nkok », « détestateur » vers « datacenter ». C'est le miroir exact de ce qui existe déjà pour la synthèse.

## Ce qui reste à faire

1. **Convertir l'audio en WAV 16 kHz mono avant transcription.** Ce n'est pas une optimisation : sans cette conversion, le service répond `200` avec un texte vide, et un client naïf conclut que le visiteur n'a rien dit. Voir `ECHECS_SILENCIEUX.md`, point 5.
2. **Poser un dictionnaire de correction après transcription**, pour le vocabulaire du site. « Nkok » est la seule erreur qui résiste au réglage, et c'est le mot le plus prononcé.
3. **Traiter un texte vide comme une erreur**, jamais comme un silence du visiteur.
4. **Décider du déclenchement** : bouton maintenu pendant qu'on parle, ou détection de fin de phrase. Le facteur × 0,40 laisse le choix ouvert, contrairement à ce que laissait craindre la mesure synthétique.
5. **Mesurer en environnement bruyant**, qui n'est toujours pas représenté : les dix enregistrements ont été faits au calme.
