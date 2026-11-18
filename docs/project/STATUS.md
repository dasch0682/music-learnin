# État du projet

Site : https://dasch0682.github.io/music-learnin/ · Repo : https://github.com/dasch0682/music-learnin · Méthode : [WORKFLOW.md](WORKFLOW.md)

<!-- auto:start -->
_Bloc généré par `node tools/status.mjs` le 2026-11-18 06:56 UTC._

- Commit : `dbc18f2` (main) — Merge tests-solid: stronger test suite in fast and full modes, app fixes found by the audit
- Contenu : 34 jeux, 79 compétences, 38 fichiers de test
- Tests rapides (dernier passage complet local) : pas de passage complet enregistré sur cette machine
- Tests complets (dernier passage local) : pas de passage complet enregistré sur cette machine
- CI (main, dernier passage) : completed success — Merge tests-solid: stronger test suite in fast and full modes, app fi… — 2026-11-18T02:33:14Z
- Tickets : 0 en cours, 0 à vérifier, 0 bloqué, 7 à faire, 0 faits — voir [BOARD.md](BOARD.md)
<!-- auto:end -->

## Phase

La suite est complète : 34 jeux sur 6 domaines, du premier pas au jazz. Elle est solide techniquement : les tests rapides et complets passent, et la publication est automatique. La phase suivante est la **validation humaine** : écoute sur téléphone, puis essai avec l'enfant.

## Avancement par domaine

| Domaine | Jeux | État |
|---|---|---|
| Écoute | 12 | fait, testé ; pas encore écouté depuis les dernières vagues |
| Chant | 3 | fait, testé avec des hauteurs simulées ; jamais essayé avec une vraie voix |
| Jeu | 6 | fait, testé ; MIDI testé en simulation seulement |
| Rythme | 3 | fait, testé en temps réel simulé |
| Lecture | 6 | fait, testé |
| Théorie | 4 | fait, testé |
| Plateforme | — | profils, import/export, « Aujourd'hui », carte, retours par profil, hors ligne : fait, testé |

## État des connaissances (au 2026-11-18)

**Vérifié** (tests ou CI)
- Chaque jeu se charge en deux thèmes et deux langues, sans erreur ni débordement à 390 px.
- Chaque niveau est jouable, et les réponses sont enregistrées avec la bonne compétence.
- Les questions générées sont musicalement justes : tonalité, orthographe des altérations, registre, rythme, conduite des voix.
- Les réglages sont conservés, la bonne réponse s'affiche après deux erreurs, et la montée de niveau fonctionne.
- Le jeu fonctionne hors ligne, et la publication sur Pages est automatique.

**Supposé** (écrit, mais jamais vérifié par un humain)
- Les 5 airs ajoutés, le timbre piano, les sons de retour et le mode encourageant : [T-004](tickets/T-004-ecoute-telephone.md).
- La détection de hauteur avec une vraie voix ou un vrai instrument, et un vrai clavier MIDI.
- La difficulté et la clarté pour un enfant : [T-005](tickets/T-005-essai-enfant.md).
- Le site en ligne n'a pas pu être ouvert depuis la session : le proxy bloque github.io.

**Limites connues**
- Dans 18 jeux, une seule compétence couvre tous les niveaux : le parcours guidé est grossier ([T-006](tickets/T-006-competences-par-niveau.md)).
- Quand un jeu a 4 questions possibles ou moins, une question peut revenir deux fois de suite. C'est voulu.
- La marque « cinq notes » des airs connus n'est pas utilisée ([T-007](tickets/T-007-penta-known-tunes.md)).
- Trois tests rapides dépassent un peu leur budget de 30 s ([T-003](tickets/T-003-budget-tests-rapides.md)).
- Non fait, par choix : la reconnaissance des timbres, la synchronisation entre appareils, et le serveur qui rassemblerait la carte des connaissances de tous les jeux.

**Décisions en attente (utilisateur)**
- Le choix de la licence : [T-001](tickets/T-001-choisir-licence.md).
- Le nettoyage de l'historique git : [T-002](tickets/T-002-historique-git.md).

## Prochaines étapes

1. T-004 : écouter sur téléphone. T-005 suivra : essayer avec l'enfant.
2. Transformer chaque remarque en ticket, puis la corriger, avec le modèle adapté.
3. T-006 : faire concevoir par Fable des compétences par niveau, pour un parcours guidé plus fin.
