# Contrat du workflow n8n

## Architecture (mise à jour du 04/09/2026 — migration vers la tour auto-hébergée)

`REACT_APP_N8N_NOTIFICATION_WEBHOOK` pointe vers `http://100.71.79.97:5678/webhook/isaac-rdv` — le webhook du workflow **"Isaac - Rendez-vous"**, auto-hébergé sur la tour, routé en interne selon le champ `event` (`visitor_arrival_confirmed` pour cette notification). La recherche de l'hôte se fait dans `hosts.json` (fichier, pas de Data Table — voir `N8N_APPOINTMENTS_CONTRACT.md` pour la justification) ; si l'hôte n'y figure pas, la notification part vers l'adresse d'accueil générique en secours (le message de réponse au frontend le précise).

✅ **Statut au 04/09/2026 : testé de bout en bout avec un envoi réel confirmé (email reçu et vérifié par la stagiaire).** Canal SMTP = Gmail personnel + mot de passe d'application (voir ci-dessous), pas Outlook/Teams. Best-effort (`onError: continueRegularOutput`) : un échec d'envoi ne bloque jamais la réponse au frontend.

⚠️ **Deux dépendances Microsoft bloquées au 04/09/2026**, ni l'une ni l'autre résolue côté IT ST Digital :
1. Credentials Azure AD / Graph API (Outlook + Teams réels) — non fournies depuis le 24/08.
2. Authentification SMTP classique sur le tenant M365 — testée le 04/09, rejetée avec `SmtpClientAuthentication is disabled` (politique de sécurité du tenant, désactivée par défaut). Nécessite qu'un admin M365 l'active spécifiquement pour la boîte utilisée (Centre d'admin Exchange → cette boîte → Gérer les applications de messagerie → Authentification SMTP).

En attendant l'une ou l'autre, **Gmail + mot de passe d'application** sert de canal de démonstration réel pour valider le critère d'acceptation M0. Adresses de test actuelles (`hosts.json`) : toutes les entrées pointent vers l'adresse Gmail de la stagiaire (pas une vraie boîte ST Digital) — **à remplacer avant toute démonstration devant la tutrice** par de vraies adresses ou au moins une adresse ST Digital accessible. Bascule vers Outlook/Teams documentée comme évolution future dans le dossier d'architecture.

**Piège n8n à retenir si un envoi semble ignorer une modification** : une credential attachée ou un nœud modifié via l'éditeur n8n peut sembler ne pas s'appliquer même après un redémarrage complet du conteneur. Cause : n8n distingue une version *enregistrée* (`versionId`) d'une version *publiée/active* (`activeVersionId`) — seule la version active tourne réellement. Vérifier les deux champs via `n8n export:workflow`, et si différents, forcer `n8n publish:workflow --id=<id>` puis redémarrer.

Le frontend envoie une requete `POST` vers `REACT_APP_N8N_NOTIFICATION_WEBHOOK`.

## Exemple de payload

```json
{
  "event": "visitor_arrival_confirmed",
  "channels": ["outlook", "teams"],
  "visit": {
    "code": "STD-INV-2026-001",
    "visitor": "Jean Dupont",
    "company": "Entreprise Exemple",
    "host": "Responsable ST DIGITAL",
    "date": "20 août 2026",
    "time": "10:30",
    "purpose": "Rendez-vous professionnel"
  }
}
```

## Workflow n8n attendu

1. Webhook `POST` d'entree.
2. Validation des champs obligatoires et rejet des donnees invalides.
3. Recherche de l'adresse Outlook de l'hote dans la source autorisee.
4. Envoi d'un email Outlook recapitulant l'arrivee du visiteur.
5. Envoi d'un message Teams au canal ou a l'hote autorise.
6. Journalisation du resultat sans enregistrer plus de donnees personnelles que necessaire.
7. Reponse HTTP `200` si le traitement est accepte, code `4xx` si le payload est invalide et `5xx` si le workflow echoue.

## Configuration locale

Copier `.env.example` vers `.env.local`, puis renseigner `REACT_APP_N8N_NOTIFICATION_WEBHOOK=https://aistd.app.n8n.cloud/webhook/isaac` (même URL que les autres webhooks n8n du projet). Ne jamais versionner `.env.local` ni les identifiants Outlook/Teams.

Le frontend ne contient aucun secret Microsoft. Les credentials Outlook et Teams doivent rester dans les credentials n8n, avec le niveau de permission minimal.

---

## Événement `chat_escalate` — mise en relation, et relais commercial

Le frontend poste sur `REACT_APP_N8N_NOTIFICATION_WEBHOOK` (en production :
`/webhook/isaac-visitor`, servi par le workflow public minimal).

```json
{
  "event": "chat_escalate",
  "question": "Combien coûterait l'hébergement de notre site web ?",
  "surPlace": true,
  "service": "commercial",
  "mode": "vocal",
  "contact": "066176641",
  "sessionId": "…"
}
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `question` | oui | la demande **telle qu'elle a été posée**, jamais reformulée |
| `surPlace` | non | `false` quand la personne consulte le lien public : il n'y a personne à aller voir à l'accueil |
| `service` | non | destine la demande à un **service** de l'annuaire (`commercial`, …). Absent : comportement historique, l'accueil est prévenu |
| `mode` | non | `"vocal"` si la demande a été dite à voix haute, `"chat"` si elle a été écrite |
| `contact` | non | numéro ou adresse laissés par le visiteur, quand il en a donné un |

**Pourquoi un service et non une personne.** Un besoin de devis adressé à un
commercial nommé reste sans réponse si cette personne est absente. Le workflow
lit l'annuaire (`app_data.staff`), retient tous les membres du service, et
retombe sur l'adresse d'accueil si le service n'a encore personne — un silence
serait pire que le mauvais destinataire.

**Quand le frontend l'envoie seul.** Une question dont la réponse dépend de la
situation du client — un prix dimensionné sur un besoin, une cotation, une
offre — n'a pas de réponse dans une base documentaire et n'en aura jamais.
Isaac ne propose donc pas la mise en relation, il transmet, et il le dit. Le
détail de la reconnaissance est dans `src/services/relaisHumain.js`
(`relaisCommercial`), et couvert par vingt cas de référence.

Un seul envoi par conversation. Si le visiteur laisse ensuite un moyen de le
joindre, un second appel porte le même `question` et le `contact` : il complète
le signalement au lieu d'en ouvrir un autre.
