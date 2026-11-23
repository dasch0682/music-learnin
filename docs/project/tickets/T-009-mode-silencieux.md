---
id: T-009
title: Mode silencieux dans le plus grand nombre de jeux possible
status: todo
model: sonnet
owner: 
depends: 
created: 2026-11-23
closed: 
commit: 
---

## But
Chaque jeu, ou chaque niveau, qui peut se jouer sans entendre se joue entièrement en silence quand on le demande. Les jeux qui ne s'y prêtent qu'en partie reçoivent une alternative visuelle quand elle a du sens. Le résultat est une donnée fiable, « silencieux, et à quels niveaux », que T-008 utilisera pour le tag.

## Principe
- **Un seul interrupteur commun.** Un réglage « Son du jeu : oui/non » dans `shell.js`, pour tous les jeux, rangé par profil comme le mode de retour. Quand il est sur « non », `audio.js` ne produit plus aucun son : notes, accords, clics, retours. Le jeu se branche sur cet interrupteur au lieu d'avoir chacun sa propre option. Les options `sound` actuelles (find-a-note, key-signatures, read-intervals, read-chords) sont reprises par le réglage commun, sans perdre les réglages déjà enregistrés.
- **Paramètre d'URL `?silent=1`.** Il active l'interrupteur pour la partie seulement, sans rien enregistrer, comme `?level=`. Il met aussi le mode de retour en « silencieux ».
- **Déclaration par jeu.** Le champ `silent` de `GAMES` (`taxonomy.js`) vaut `true` (tous les niveaux), une liste de niveaux, ou `false`. Un jeu silencieux sur une partie des niveaux, lancé avec `?silent=1`, s'ouvre au premier niveau silencieux s'il était sur un autre.
- **Alternatives visuelles**, seulement quand le son ne sert qu'à donner le temps ou à montrer un modèle :
  - **pulsation et métronome** : un repère visuel (tap-rhythm, two-hands, read-melody, rhythm-dictation si pertinent) ;
  - **modèle joué** : il est montré au lieu d'être entendu (play-scales, play-chords, echo-penta s'il reste jouable par la mémoire visuelle — à juger).
  - Pas d'alternative pour les jeux où entendre est le but : écoute d'intervalles, d'accords, de cadences, dictées, chant.
- **Micro.** Les jeux au micro peuvent rester silencieux côté machine : le joueur chante ou joue, et l'écran répond. On déclare `silent` si aucun son de la machine n'est indispensable pour répondre.

## Critères de fin
- [ ] Le réglage commun « Son du jeu » existe dans la boîte de réglages de chaque jeu. Il est rangé par profil, exporté et importé avec les réglages.
- [ ] `?silent=1` coupe tout pour la partie, sans rien enregistrer.
- [ ] Chaque jeu est audité, et le champ `silent` est renseigné dans `taxonomy.js`, avec les niveaux. Le point de départ est la section « Tags par jeu » de T-008. Le but est le plus grand nombre de jeux possible.
- [ ] Les alternatives visuelles retenues sont faites. Les jeux écartés le sont avec une raison d'une ligne dans le rapport.
- [ ] Test commun, dans `catalog` ou un nouveau `silent.test.mjs` : pour chaque jeu et niveau déclaré silencieux, une partie avec `?silent=1` ne produit **aucun** son (enregistrement audio de `tools/lib/shared-b.mjs`), et une bonne réponse reste possible.
- [ ] `npm run test:changed` : tout ok.

## Lire (liste fermée)
- `docs/AGENT.md`, `docs/project/DESIGN.md`, la section « Tags par jeu » de T-008, `docs/feedback-spec.md`
- `packages/core/audio.js`, `shell.js`, `feedback.js`, `taxonomy.js`, `README.md`
- `tools/lib/shared-b.mjs`, `tools/catalog.test.mjs`
- Le `main.js` de chaque jeu audité

## Modifier (seulement)
- `packages/core/audio.js`, `shell.js`, `taxonomy.js`, `README.md`
- `apps/<jeu>/` pour les jeux qui reçoivent une alternative visuelle ou qui perdent leur option `sound` propre
- `tools/` : le test commun et les tests des jeux modifiés

## Contexte
Demande de l'utilisateur (2026-11-23) : le mode silencieux doit s'appliquer au plus grand nombre de jeux possible. Ce ticket précède T-008 (tags), qui lira le champ `silent` au lieu de l'établir. Ne pas lancer en même temps que T-010 : les deux touchent les mêmes `main.js`.

Si le choix des alternatives visuelles pose une question pédagogique (une mémoire visuelle remplace-t-elle l'oreille dans echo-penta ?), la noter dans « Décisions à prendre » du rapport au lieu de trancher.

## Rapport
