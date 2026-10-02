# Installer Isaac sur une machine neuve

Ce dépôt contient tout ce qu'il faut pour remonter Isaac ailleurs : l'interface,
les six flux n8n, la configuration du serveur web, le serveur de synthèse vocale
et le schéma des bases. Rien n'est caché sur la machine d'origine, à une
exception près, et elle est explicite : **trois fichiers d'identifiants**, dont
le dépôt ne porte que la forme (`infra/n8n/*.exemple.json`).

Comptez une à deux heures, dont l'essentiel en téléchargement.

---

## Ce que vous montez

Sept services sur une seule machine. Tous écoutent sur la boucle locale ; seul
le serveur web est joignable de l'extérieur.

| Service | Port | Rôle |
|---|---|---|
| nginx (`isaac-app`) | 8080, 8443, 8444 | sert l'interface, relaie tout le reste |
| n8n | 5678 | les six flux : c'est là que vit la logique |
| PostgreSQL (`isaac-postgres`) | 5433 | données de l'application |
| PostgreSQL + pgvector (`isaac-pgvector`) | 5434 | base de connaissances vectorielle |
| Ollama | 11434 | le modèle de langue et les plongements |
| Whisper (`isaac-whisper`) | 9000 | transcription de la parole |
| Piper (`isaac-piper`) | 5002 | synthèse de la voix d'Isaac |

Le navigateur ne parle qu'à nginx. nginx relaie vers n8n, Whisper et Piper ;
n8n parle à Ollama et aux deux bases. Aucun de ces services n'a d'ouverture
propre vers l'extérieur, et c'est voulu : une transcription coûte plusieurs
secondes de processeur, un service de calcul gratuit se trouve vite.

---

## Prérequis

**Une machine Linux.** Les conteneurs tournent en `--network host`, qui n'existe
que là. Quatre cœurs et 16 Go suffisent ; la machine d'origine est une tour de
bureau sans carte graphique. Sans GPU, comptez une vingtaine de secondes pour
une réponse qui n'est pas déjà dans la table des réponses validées.

**Prévoyez 25 Go** : les modèles pèsent plus que tout le reste réuni.

À installer avant de commencer :

```bash
sudo apt update && sudo apt install -y docker.io git nodejs npm
curl -fsSL https://ollama.com/install.sh | sh
sudo usermod -aG docker "$USER"   # puis rouvrez votre session
```

Et le dépôt :

```bash
git clone https://github.com/Ambrefirst/Isaac-Ahmed.git isaac && cd isaac
```

Les chemins ci-dessous supposent `$HOME` comme racine des volumes, comme sur la
machine d'origine. Choisissez autre chose si vous préférez, à condition d'être
cohérent jusqu'au bout.

---

## 1. Les deux bases

Deux instances PostgreSQL distinctes, sur deux ports. Ce n'est pas une
complication gratuite : la seconde porte l'extension `vector` et se vide
entièrement à chaque réindexation de la base de connaissances. Les mêler aurait
mis les rendez-vous à la merci d'une réindexation.

Choisissez deux mots de passe solides et gardez-les sous la main — ils
reviennent à l'étape 5.

```bash
mkdir -p ~/isaac-postgres-data ~/isaac-pgvector-data

docker run -d --name isaac-postgres --network host --restart unless-stopped \
  -e POSTGRES_USER=isaac -e POSTGRES_DB=isaac -e PGPORT=5433 \
  -e POSTGRES_PASSWORD='<mot-de-passe-applicatif>' \
  -v ~/isaac-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine

docker run -d --name isaac-pgvector --network host --restart unless-stopped \
  -e POSTGRES_USER=isaac -e POSTGRES_DB=isaac_kb -e PGPORT=5434 \
  -e POSTGRES_PASSWORD='<mot-de-passe-vectoriel>' \
  -v ~/isaac-pgvector-data:/var/lib/postgresql/data \
  pgvector/pgvector:pg16
```

Puis le schéma. Le même fichier sert aux deux bases : chaque bloc est inoffensif
sur celle qu'il ne concerne pas.

```bash
docker exec -i isaac-postgres psql -U isaac -d isaac    -p 5433 < infra/sql/schema.sql
docker exec -i isaac-pgvector psql -U isaac -d isaac_kb -p 5434 < infra/sql/schema.sql
```

---

## 2. Le modèle

Deux modèles, pas un : l'un répond, l'autre transforme les phrases en vecteurs
pour la base de connaissances.

```bash
ollama pull qwen2.5:7b-instruct-q4_K_M
ollama pull nomic-embed-text
```

**Le 7B n'est pas un choix de confort.** Le 3B a été essayé : il répond deux
fois plus vite et se trompe sur les questions de l'entreprise, ce qui, pour une
borne d'accueil, ne s'échange pas contre des secondes.

---

## 3. La chaîne audio

### Transcription

```bash
mkdir -p ~/isaac-whisper-cache

docker run -d --name isaac-whisper --network host --restart unless-stopped \
  -e ASR_MODEL=medium -e ASR_ENGINE=faster_whisper \
  -e ASR_MODEL_PATH=/cache -e PORT=9000 \
  -v ~/isaac-whisper-cache:/cache \
  onerahmet/openai-whisper-asr-webservice:latest
```

Le modèle se télécharge au premier appel, dans le volume : **le premier essai
sera long, les suivants non**, et un redémarrage ne retélécharge rien.

`medium` plutôt que `small` : `small` confond les mots du métier — un
« datacenter » dicté revient en « data sainte ». Si votre machine peine, passez
à `small` en remplaçant `ASR_MODEL` ; l'interface corrige déjà les confusions
les plus fréquentes.

### Synthèse

Le serveur Piper est dans ce dépôt, il se construit sur place. Les voix sont
téléchargées **à la construction** : le conteneur doit pouvoir redémarrer sans
accès internet, et sans fenêtre pendant laquelle Isaac serait muet.

```bash
docker build -t isaac-piper:6 infra/piper
docker run -d --name isaac-piper --network host --restart unless-stopped isaac-piper:6
```

---

## 4. n8n et les six flux

```bash
mkdir -p ~/n8n-data ~/isaac-app-data ~/isaac-docs
cp docs/BASE_CONNAISSANCES_ST_DIGITAL.md ~/isaac-docs/

docker run -d --name n8n --network host --restart unless-stopped \
  -e N8N_SECURE_COOKIE=false \
  -e NODE_FUNCTION_ALLOW_BUILTIN=fs,crypto,path \
  -e NODE_FUNCTION_ALLOW_EXTERNAL=pg \
  -e GENERIC_TIMEZONE=Africa/Libreville -e TZ=Africa/Libreville \
  -v ~/n8n-data:/home/node/.n8n \
  -v ~/isaac-app-data:/home/node/.n8n-appdata \
  -v ~/isaac-docs:/home/node/.n8n-files:ro \
  n8nio/n8n
```

Les deux variables `NODE_FUNCTION_ALLOW_*` ne sont pas décoratives : sans elles,
les nœuds de code ne peuvent ni lire leurs identifiants (`fs`) ni parler à la
base (`pg`), et les flux échouent au premier appel.

Ouvrez `http://localhost:5678`, créez le compte propriétaire, puis importez :

```bash
docker cp infra/n8n/flux.json n8n:/tmp/flux.json
docker exec n8n n8n import:workflow --input=/tmp/flux.json
docker restart n8n
```

> **L'import désactive ce qu'il touche.** Le `active: true` du fichier n'est pas
> repris. Rouvrez les six flux dans l'interface et réactivez-les un par un, sinon
> les webhooks répondent 404 et rien ne marche — sans message d'erreur nulle part.

Trois identifiants restent à créer à la main dans n8n : l'export des flux n'en
porte jamais les secrets, et c'est une bonne chose.

| Nom exact | Type | Réglage |
|---|---|---|
| `Ollama Local` | Ollama | `http://127.0.0.1:11434` |
| `Isaac - Magasin vectoriel` | Postgres | hôte `127.0.0.1`, port **5434**, base `isaac_kb`, utilisateur `isaac` |
| `SMTP account` | SMTP | votre serveur d'envoi |

Les noms doivent correspondre au caractère près : les flux les désignent ainsi.

---

## 5. Les trois fichiers d'identifiants

Les nœuds de code lisent leurs secrets dans le volume de n8n, au chargement.
Ils ne sont donc ni dans ce dépôt, ni dans l'export des flux, ni dans son
historique — et les faire tourner ne demande que de réécrire un fichier, au
lieu de rouvrir cinq nœuds répartis sur quatre flux.

```bash
cp infra/n8n/isaac-pg.exemple.json      ~/n8n-data/isaac-pg.json
cp infra/n8n/isaac-comptes.exemple.json ~/n8n-data/isaac-comptes.json
cp infra/n8n/isaac-site.exemple.json    ~/n8n-data/isaac-site.json
chmod 600 ~/n8n-data/isaac-*.json
```

Puis remplacez chaque `A-REMPLACER` :

- **`isaac-pg.json`** — le mot de passe applicatif de l'étape 1 (port 5433).
- **`isaac-comptes.json`** — un mot de passe d'amorçage par pays, pour la
  première connexion au back-office. Ensuite le compte garde une empreinte en
  base et celui-ci ne sert plus. Trois valeurs distinctes, pas trois fois la même.
- **`isaac-site.json`** — `respondBase` est l'adresse publique de la page de
  réponse de l'équipe, `from` l'expéditeur des courriels. Mettez une **adresse
  de fonction** : un courriel d'accueil n'est pas envoyé par quelqu'un, il est
  envoyé par l'accueil.

Si un fichier manque, le nœud échoue bruyamment au premier appel. C'est voulu :
un identifiant introuvable doit se voir, pas se deviner.

---

## 6. L'interface et le serveur web

```bash
npm install
npm run build
mkdir -p ~/isaac-app-build ~/isaac-app-conf ~/isaac-app-certs
cp -r build/. ~/isaac-app-build/
cp infra/nginx/default.conf ~/isaac-app-conf/default.conf
```

`npm run build` prend `.env.production`, qui n'utilise que des chemins relatifs :
le navigateur appelle nginx, nginx relaie. Rien à changer pour une autre machine.

Un certificat auto-signé, pour que le micro fonctionne — les navigateurs ne
donnent l'accès au micro qu'en HTTPS :

```bash
cp infra/nginx/isaac-san.exemple.cnf ~/isaac-app-certs/isaac-san.cnf
# ouvrez-le et mettez-y vos noms et adresses
openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout ~/isaac-app-certs/isaac.key -out ~/isaac-app-certs/isaac.crt \
  -config ~/isaac-app-certs/isaac-san.cnf
chmod 600 ~/isaac-app-certs/isaac.key
```

```bash
docker run -d --name isaac-app --network host --restart unless-stopped \
  -v ~/isaac-app-build:/usr/share/nginx/html:ro \
  -v ~/isaac-app-conf/default.conf:/etc/nginx/conf.d/default.conf:ro \
  -v ~/isaac-app-certs:/etc/nginx/certs:ro \
  nginx:alpine
```

Deux surfaces, et la distinction compte :

- **8443** — surface interne : l'interface, la chaîne audio, le back-office.
- **8444** — surface publique : l'interface et la page de réponse de l'équipe.
  Le back-office et le routeur des rendez-vous y répondent 404, et tout webhook
  non déclaré aussi.

---

## 7. Vérifier

```bash
curl -s  http://127.0.0.1:11434/api/tags | head -c 200          # le modèle
curl -s  http://127.0.0.1:9000/docs -o /dev/null -w '%{http_code}\n'   # Whisper
curl -s  http://127.0.0.1:5002/sante                            # Piper
curl -sk https://127.0.0.1:8443/ -o /dev/null -w '%{http_code}\n'      # nginx
curl -sk https://127.0.0.1:8443/webhook/isaac \
     -H 'Content-Type: application/json' \
     -d '{"event":"visitor_question","question":"Quels sont vos horaires ?"}'
```

La dernière commande est celle qui compte : elle traverse toute la chaîne. Une
question de la table des réponses validées revient en quelques dixièmes de
seconde. Si elle met vingt secondes, la réponse vient du modèle — ce qui marche
aussi, mais signale que les flux ne sont pas tous actifs.

Reste l'indexation de la base de connaissances, une fois :

```bash
curl -s -X POST http://127.0.0.1:5678/webhook/isaac-index-kb
```

Et la borne est à `https://<la-machine>:8443/`.

---

## Exposer la borne

La machine d'origine passe par Tailscale Funnel, qui donne un nom public et un
certificat valide sans ouvrir de port sur la box :

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale funnel --bg 8444
```

Le relais le plus proche impose sa latence — comptez une centaine de
millisecondes depuis l'Afrique centrale. Un reverse proxy classique avec un
certificat Let's Encrypt convient tout autant ; seul le port **8444** doit sortir.

---

## Avant une vraie mise en production

Ces points sont connus, documentés, et non traités. Ils ne gênent pas une
démonstration ; ils gênent une exploitation réelle.

- **Le back-office est sur la surface interne et protégé par des mots de passe
  partagés**, un par pays, sans limite de tentatives ni second facteur. Ouvert
  publiquement pendant la phase d'expérimentation, il a été refermé le
  21/09/2026. Avant un usage réel : des comptes nommés, et une limite de
  tentatives.
- **Le certificat est auto-signé.** Les navigateurs avertiront.
- **Aucune sauvegarde n'est programmée.** `~/isaac-postgres-data` et
  `~/n8n-data` sont ce qui ne se reconstruit pas.
- **Les données d'une démonstration restent en base** : conversations,
  rendez-vous, codes à usage unique. Prévoyez une purge avant toute donnée
  réelle, et une durée de conservation.

`docs/A_FAIRE_AVANT_MISE_EN_PRODUCTION.md` et
`docs/REVUE_SECURITE_2026-09-28.md` entrent dans le détail.
