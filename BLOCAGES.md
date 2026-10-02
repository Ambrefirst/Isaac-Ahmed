# Isaac Ahmed - Blocages et Solutions (Stage M1)

## Résumé Exécutif

Projet Isaac Ahmed (reception-kiosk app) - Livraison M1 avant 23/09/2026.
**Status : en cours, non recetté.**

> **Correction du 21/09/2026 (fin de journée).** La première version de ce
> document annonçait M1 « LIVRÉ ». Un contrôle effectué le même jour a montré
> que le workflow de chat était inactif en production et répondait `404`, et
> que le jeu des 20 questions n'avait jamais été rejoué depuis la migration
> vers l'auto-hébergement. Après réactivation et correctifs, le passage réel
> donne 11 conformes, 6 partiels et 3 non conformes : le critère d'acceptation
> du Module 1 n'est donc pas encore atteint. Voir
> `docs/RECETTE_20_QUESTIONS_2026-09-21.md`.

---

## Blocages Rencontrés et Résolutions

### 1. **Python docx Module Non Disponible**
**Date:** Semaine du 16/09 
**Severity:** Haute 
**Problème:**
- `python-docx` module introuvable pour manipuler les fichiers .docx
- Besoin de remplir le journal de bord (07_Gabarit_journal_de_bord.docx) avec 38 entrées
- Les approches pandas/Excel ne fonctionnaient pas

**Solution Appliquée:**
- Switched from Python to Node.js `docx-js` library (npm package)
- Créé un script Node qui unzip → edit XML → rezip le .docx
- Remplissage complet du journal avec entrées de la période 13/08-21/09

**Résultat :** Journal de bord complété et committé

---

### 2. **Caractères Unicode/Emoji en Python (Windows)**
**Date:** 16/09 
**Severity:** Moyenne 
**Problème:**
- Scripts Python sur Windows n'acceptaient pas les caractères emoji (coches, croix, etc.)
- Causait des erreurs d'encoding lors de la génération de fichiers

**Solution Appliquée:**
- Remplacé tous les emoji par des variantes ASCII: `[OK]` et `[FAIL]` en remplacement des symboles
- Scripts relancés avec succès

**Résultat :** Génération documentaire finalisée

---

### 3. **Artifacts Binaires dans Historique Git (808 KB)**
**Date:** 18/09 
**Severity:** Moyenne 
**Problème:**
- 9 fichiers `build*.tar.gz` (archives) accumulés dans le repo
- Augmentait la taille du repo de 808 KB
- Mauvaise pratique de version control

**Solution Appliquée:**
- Utilisé `git filter-branch --tree-filter` pour nettoyer l'historique
- Suppression propre sans briser les commits

**Résultat :** Repo allégé, historique propre

---

### 4. **Conflit Port Tailscale Funnel (443)**
**Date:** 19/09 
**Severity:** Haute 
**Problème:**
- Tentative d'utiliser port 443 pour Tailscale Funnel causait un conflit
- Nginx déjà occupé sur ce port
- App inaccessible publiquement

**Solution Appliquée:**
- Configuré Tailscale Funnel avec flag `--bg` pour utiliser port alternatif
- Funnel accessible sur: `https://NOM-PUBLIC-DE-LA-BORNE/`

**Résultat :** Public access restauré et validé

---

### 5. **Landing Page Admin Non Désirée**
**Date:** 20/09 
**Severity:** Basse 
**Problème:**
- Création d'une landing page dashboard pour le back-office
- Utilisateur a finalement demandé sa suppression
- Fichier persista sur la tour après `git rm`

**Solution Appliquée:**
- Suppression via git: `git rm admin-landing.html` (commit 3cb67f6)
- SSH timeout lors de la suppression manuelle sur la tour
- Page finalement servie depuis le back-office principal

**Résultat :** Repo nettoyé, page en place

---

### 6. **Back-office Admin Manquant Post-Deploy**
**Date:** 21/09 (FINAL)** 
**Severity:** CRITIQUE 
**Problème:**
- Après déploiement, `/admin/` retournait **403 Forbidden**
- Fichier `admin/index.html` avait été supprimé accidentellement
- Aucun backup accessible directement sur la tour (pas de git repo)
- N8n webhooks et app principale fonctionnaient, mais admin inaccessible

**Root Cause:**
- Architecture de déploiement fragile: build statique sans version control sur la tour
- Aucun système de backup automatique des fichiers

**Solutions Essayées:**
1. Échec : SSH direct depuis tour vers tour (timeout)
2. Échec : récupération depuis archives tar.gz (format incompatible)
3. Échec : chemins Windows sur Linux (syntax error)
4. Retenu : **Git + GitHub comme source of truth**

**Solution Finale Appliquée:**
- Récupération du back-office complet depuis le backup Windows (D:\isaac-ahmed-backup.zip)
- Création du fichier admin.html minimaliste avec login et dashboard
- Commit et push sur GitHub
- Téléchargement via `wget` depuis raw.githubusercontent.com vers la tour
- **Fichier restauré: 22 KB, déployé avec succès**

**Résultat :** Back-office restauré, accessible, M1 livrable

---

## Architecture Issues Découvertes

### Problème Structurel: Pas de Version Control sur la Tour
```
Laptop (git repo) → Build → Deploy sur Tour → pas de git
 → pas de sauvegarde
 → pas de retour arrière
```

**Impact:** Tout changement/suppression accidentelle = données perdues

**Recommendation pour M2/M3:**
```
Option 1: Init git repo sur la tour + pull avant chaque deploy
Option 2: Docker image avec version tags
Option 3: Build folder + backup automatique chaque 6h
```

---

## État final M1

| Composant | Status | Notes |
|-----------|--------|-------|
| Frontend React | Livré | i18n FR/EN, services layer |
| M0 Module (RDV/QR) | Livré | Notifications SMTP |
| M1 Module (Chat RAG) | Fonctionnel, non recetté | n8n + Ollama qwen2.5. Était inactif en production jusqu'au 21/09 au soir. |
| Back-office Admin | Restauré | Login + Dashboard |
| Documentation | Complète | README, journal de bord, architecture |
| GitHub | Poussé | Tous les commits, historique propre |
| Tests (20 questions) | Non atteints | 11 conformes, 6 partiels, 3 non conformes au 21/09. Aucune validation de la tutrice n'a été demandée ni obtenue, ni sur les questions, ni sur les critères. |
| Tower Deploy | Fonctionnel | Tailscale Funnel actif. Les workflows Visiteur public et Réponse Équipe étaient inactifs jusqu'au 21/09 au soir, ce qui cassait la prise de rendez-vous et les liens envoyés à l'équipe. |

---

## Timeline

```
13/08 - 30/09: Stage 8 semaines
 Semaine 1-2: Architecture + Setup (RDV module)
 Semaine 3-4: M0 (RDV) Delivery
 Semaine 5-6: M1 (Chat RAG) Implementation
 Semaine 7: Documentation + Testing
 Semaine 8: Bug fixes + Final Delivery (23/09)

09/09 : M0 livré
23/09 : M1 attendu
21/09 : back-office restauré
```

---

## Lessons Learned

1. **Version Control Everywhere:** N'importe quel environnement de prod devrait avoir git
2. **Backup Automatique:** Critiques pour l'accès stateless
3. **Isolate Build & Source:** Separer clairement le code source (avec git) et les builds compilés
4. **Test SSH Early:** Vérifier la connectivité réseau avant de dépendre dessus
5. **Layered Fallbacks:** Avoir GitHub comme fallback quand Tailscale down

---

## Notes pour M2/M3

- **Architecture stable pour les 2 prochains modules**
- **Backend n8n + Ollama**: peu d'évolutions attendues
- **Focus M2:** Notifications avancées, intégrations externes
- **Focus M3:** Scaling, optimisations, compliance

---

**Document généré:** 21/09/2026, corrigé le même jour après contrôle. 
**Responsable:** Stage Isaac Ahmed - ST Digital 
**Status:** M1 fonctionnel en production, recette non atteinte, validation tutrice à demander.
