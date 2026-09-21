# À faire avant la mise en production réelle

**Créé le 21/09/2026.** Ces points sont **acceptés tels quels pendant la phase de stage et de démonstration**, parce que l'application ne contient aujourd'hui que des données de test. Ils doivent être traités avant toute exploitation avec de vraies données de visiteurs ou de collaborateurs.

## 1. Refermer la surface publique

Tailscale Funnel est actif sur `https://aminta-hp-elitedesk-800-g2-twr.tail51ab0e.ts.net` et relaie le port 8444 de la tour. Ce bloc nginx sert aujourd'hui, en plus de ce qui est nécessaire aux liens envoyés à l'équipe :

- `/admin/`, la page de connexion du back-office, servie par le `location /` générique ;
- `/webhook/isaac-rdv`, le routeur qui porte tous les événements `admin_*`.

Le seul contrôle d'accès est un mot de passe statique par pays. Correctif prévu, dans `/home/aminta/isaac-app-conf/default.conf`, bloc `server { listen 8444; }` :

- supprimer le bloc `location /webhook/isaac-rdv` ;
- ajouter `location /admin/ { return 404; }` avant le `location /` générique ;
- recharger avec `docker exec isaac-app nginx -s reload`.

Le back-office reste alors joignable sur le tailnet à `https://100.71.79.97:8443/admin/`. Les liens accepter ou refuser envoyés aux membres de l'équipe continuent de fonctionner, puisqu'ils n'utilisent que `/respond/` et `/webhook/isaac-respond`.

## 2. Nettoyer les mots de passe de repli

Les comptes admin sont stockés dans **PostgreSQL**, conteneur `isaac-postgres`, base et utilisateur `isaac`, table `app_data`, ligne de clé `admin_accounts`, colonne `value` de type `jsonb`. Le routeur interroge cette table à chaque appel.

> **Piège vérifié le 21/09/2026.** Les fichiers `/home/aminta/isaac-app-data/*.json` sont des **vestiges de l'ancienne architecture et ne sont plus lus par personne** depuis la migration vers PostgreSQL. Modifier `admin_accounts.json` n'a aucun effet, et ne produit aucune erreur : on croit avoir changé le mot de passe alors qu'il est inchangé. Ces fichiers devraient être archivés ou supprimés pour éviter que quelqu'un ne perde du temps dessus.

Le nœud Code du workflow `Isaac - Rendez-vous` contient par ailleurs une constante `DEFAULT_ADMIN_ACCOUNTS` avec trois mots de passe en dur, utilisée quand la lecture de la base échoue ou que la ligne est absente. Une rotation faite en base laisse donc ces valeurs actives en cas de perte de la ligne.

À faire : vider `DEFAULT_ADMIN_ACCOUNTS` et faire échouer l'authentification si la base est injoignable, plutôt que de retomber sur des valeurs en dur.

## 3. Passer à de vrais comptes utilisateurs

Un mot de passe partagé par pays ne permet ni de savoir qui a confirmé un rendez-vous, ni de retirer l'accès à une personne qui quitte l'équipe. La section « Utilisateurs » du back-office le signale déjà honnêtement. À remplacer par des comptes nominatifs avant exploitation, avec limitation des tentatives de connexion.

## 4. Adresses e-mail réelles

Les constantes d'expédition et le fichier `hosts.json` pointent vers une boîte Gmail personnelle utilisée pour les tests, pas vers les adresses ST Digital. À basculer avant toute démonstration à un client, et avant exploitation.

## 5. Persistance de la base vectorielle

La base de connaissances est indexée dans un magasin vectoriel **en mémoire**. Tout redémarrage du conteneur n8n la vide, et le chat se met alors à répondre sans contexte, donc à inventer, sans aucun message d'erreur. C'est exactement ce qui s'est produit le 21/09. À remplacer par un magasin persistant, ou à défaut à réindexer automatiquement au démarrage.

## 6. Canal de notification officiel

Les notifications passent aujourd'hui par un compte Gmail avec mot de passe d'application, choisi comme solution de contournement. Le canal cible reste Outlook et Teams via l'API Graph, bloqué par l'absence d'enregistrement d'application Azure AD côté ST Digital, et par la politique du locataire Microsoft qui désactive aussi l'authentification SMTP.

## 7. Rotation des secrets exposés

Les trois mots de passe admin ont été joignables depuis internet entre le 07/09 et la date de fermeture de la surface publique. Ils doivent être considérés comme compromis et remplacés, de même que le mot de passe d'application Gmail si le compte reste utilisé.
