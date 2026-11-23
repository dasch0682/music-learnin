# Décisions

Une entrée par décision : date, décision, raison. Les plus récentes en haut. Ne pas réécrire une décision : en ajouter une qui la remplace.

## Méthode
- 2026-11-18 — Suivi du projet dans `docs/project/` (STATUS, BOARD généré, tickets, DECISIONS, ARCHITECTURE). Raison : reprise rapide d'une session à l'autre, prompts d'agents réduits à un renvoi au ticket.
- 2026-11-18 — Agents en worktree git, une branche par ticket. Raison : le rappel de commit de la plateforme ne vérifie que le dossier principal ; il n'est pas modifiable.
- 2026-11-18 — Modèle selon la tâche : Haiku routine, Sonnet multi-fichiers et tests, Opus justesse musicale, Fable conception. Raison : coût adapté au risque.
- 2026-11-18 — Au plus 2 agents qui lancent des tests en même temps. Raison : 2 CPU ; au-delà, faux échecs et enquêtes inutiles.

## Tests
- 2026-11-18 — Suite rapide ≤ 300 s sur 2 CPU, ≤ 30 s par test (avertissement du lanceur sinon). Suite complète chaque semaine dans le CI, 4 tests en parallèle.
- 2026-11-17 — Deux modes : rapide (premier, milieu, dernier niveau, minuteries ×5 sauf jeux de rythme et de micro) et complet. Raison : temps et tokens.

## Pédagogie et musique
- 2026-11-23 — Mode silencieux dans le plus grand nombre de jeux possible : interrupteur commun « Son du jeu », champ `silent` par jeu et par niveau, alternatives visuelles quand le son ne donne que le temps ou un modèle (T-009, avant les tags T-008).
- 2026-11-23 — Un seul tap lance une partie ; une entrée n'est acceptée que quand elle a un sens (phases listen, answer, feedback, free), sinon sans son ni effet (T-010).
- 2026-11-23 — Principes de design rassemblés dans `docs/project/DESIGN.md`.
- 2026-11-17 — Après deux erreurs sur une question, la bonne réponse est montrée ; seule la première réponse est enregistrée.
- 2026-11-17 — Retours : 4 modes par profil, normal par défaut ; sons sans hauteur fixe, ~4× moins forts que l'exercice ; jamais de buzzer ; on félicite l'effort et les séries, jamais la vitesse.
- 2026-11-17 — second-voice : basse jamais sous do 2 (36), toujours sous la note chantée ; tonalités écartées pour la voix grave si la résolution n'a pas de basse.
- 2026-11-17 — melody-dictation : aucun intervalle mélodique augmenté ou diminué (sauf notes de passage chromatiques du niveau 6) ; la sensible monte à la tonique.
- 2026-11-17 — Questions possibles ≤ 4 : une répétition immédiate reste permise (poids 0,6). Raison : l'interdire rendrait la réponse devinable.
- 2026-11-16 — Deux fils : cinq notes (pentatonique, sans le nommer au début) et tension-détente (deuxième voix, cadences), jusqu'au jazz.
- 2026-11-15 — La pratique avant la théorie ; défis de quelques secondes.

## Technique
- 2026-11-16 — Publication par GitHub Actions sur GitHub Pages ; repo public (exigé pour Pages en compte gratuit).
- 2026-11-15 — JS, HTML et CSS simples, Vite pour le build ; tout hors ligne (service worker généré) ; journal des réponses dans IndexedDB, maîtrise recalculée depuis le journal ; réglages dans localStorage ; synthèse Web Audio, sans échantillons.
