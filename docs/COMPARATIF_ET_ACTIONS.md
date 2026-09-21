# Comparatif du projet Isaac Ahmed

Date de comparaison : 2026-08-20

## Sources

- `Fiche_de_stage_Isaac_Ahmed.docx`
- `Recueil_de_procedures_Isaac_Ahmed.docx`
- Code actuel de `accueil-app`

## Etat fonctionnel

| Exigence | Etat actuel | Ecart |
| --- | --- | --- |
| M0 rendez-vous | Partiel | Donnees locales, pas de base ni recherche reelle |
| Generation et scan QR | Scan natif avec saisie manuelle | Generation QR absente ; format officiel a valider |
| Base visiteurs | Donnees de demonstration | Backend et conservation a definir |
| Notification de l'hote | Preparee localement | Aucun envoi reel |
| Back-office minimal | Absent | A cadrer ou confirmer hors perimetre |
| M1 Isaac texte | Interface et fallback local | RAG valide par ST DIGITAL et jeu de 20 questions absents |
| Accueil tactile | Present | Test sur tablette/borne a realiser |
| Audio M2 | Absent | Prototype attendu seulement si le calendrier le permet |
| Video/avatar M3 | Absent | Etude d'architecture uniquement, GPU non disponible |
| Controle d'acces physique | Non implemente | Conforme au hors-perimetre |
| API cloud / inference interne | Interface de service locale uniquement | Architecture d'extension a documenter |

## Preuves de projet encore necessaires

- Note de cadrage validee.
- Specifications fonctionnelles, user stories et criteres d'acceptation.
- Dossier d'architecture et decisions techniques.
- Journal de bord quotidien.
- Backlog, sprints et comptes rendus hebdomadaires.
- Registre des risques et dependances.
- Dossier de recette, vingt questions de reference et registre des anomalies.
- Note de protection des donnees personnelles.
- Documentation de deploiement testee par un tiers.
- Note de reprise, memoire et support de soutenance.

## Actions de la stagiaire

1. Faire valider le perimetre M0/M1 et les hors-perimetre par la tutrice.
2. Obtenir le format officiel du QR, les donnees autorisees et la regle d'expiration d'une invitation.
3. Obtenir un backend ou une decision ecrite autorisant les mocks pour la demo.
4. Obtenir le canal et les droits de notification de l'hote.
5. Recuperer le corpus institutionnel valide pour la base de connaissance.
6. Ecrire et faire valider les vingt questions de recette.
7. Documenter l'architecture, les limites et le futur branchement API/RAG.
8. Tester les cas defavorables : QR illisible ou expire, hote absent, question hors sujet et tentative de detournement.
9. Tenir le journal de bord, les comptes rendus, le backlog et le registre des risques.
10. Faire tester le deploiement par un tiers sur une machine vierge.
11. Completer dans la fiche de stage l'etablissement, les dates, la duree definitive et le tuteur pedagogique.
12. Faire relire les livrables par la tutrice avant transmission ou soutenance.

## Validation technique actuelle

- `npm run build` : reussi.
- `npm test -- --watchAll=false --runInBand` : reussi.
- Les notifications et les rendez-vous restent explicitement locaux tant qu'aucun backend n'est branche.
