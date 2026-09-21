# Contrat du workflow n8n — Chat Isaac

Le frontend envoie une requete `POST` vers `REACT_APP_N8N_CHAT_WEBHOOK` a chaque question posee dans l'ecran Chat.

## Exemple de payload envoye

```json
{
  "event": "visitor_question",
  "message": "Quels sont vos horaires d'ouverture ?",
  "history": [
    { "sender": "isaac", "text": "Bonjour, je suis Isaac Ahmed..." },
    { "sender": "visitor", "text": "Bonjour" }
  ],
  "sessionId": "b1e2c3d4-..."
}
```

`sessionId` est généré une fois par visiteur (stocké dans `localStorage`) et envoyé à chaque question, afin que le workflow n8n conserve une mémoire de conversation propre à chaque visiteur au lieu d'une session partagée par défaut.

## Reponse attendue

```json
{ "answer": "Le data center est accessible du lundi au vendredi, 8h-18h, sur rendez-vous." }
```

## Workflow n8n attendu

1. Webhook `POST` d'entree, path dedie (ex. `/isaac-chat`).
2. Validation du champ obligatoire `message` (non vide) — rejet en `4xx` sinon.
3. Recherche dans la base de connaissance validee par ST DIGITAL (RAG) des extraits pertinents a la question.
4. Appel au fournisseur d'inference (LLM) avec : un prompt systeme fixe imposant le role d'accueil d'Isaac (ligne rouge de conception : aucune decision de securite physique, aucun contournement de son role, pas d'invention d'information hors base de connaissance), les extraits RAG recuperes, et l'historique de conversation transmis.
5. Reponse HTTP `200` avec `{ "answer": "..." }` si le traitement reussit, `4xx` si le payload est invalide, `5xx` si le workflow ou le LLM echoue.
6. Journalisation limitee (horodatage, statut) sans conserver plus de donnees personnelles que necessaire.

## Configuration locale

Renseigner `REACT_APP_N8N_CHAT_WEBHOOK` dans `.env.local` (jamais commite). Sans cette variable, `aiService.js` retombe sur des reponses locales generiques — pratique en developpement, mais ce n'est pas le comportement cible.
