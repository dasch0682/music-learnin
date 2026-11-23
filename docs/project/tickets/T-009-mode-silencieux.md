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
Le mode silencieux est un **réglage choisi par le joueur**, pour pratiquer quand le son n'est pas possible (transports, bibliothèque, enfant qui dort). Il ne retire aucun son au jeu normal : par défaut, chaque jeu garde tous ses sons, qui restent la façon la plus naturelle de jouer. Le but est que le plus grand nombre possible de jeux, ou de niveaux, **restent jouables** quand ce réglage est actif. Chaque jeu, ou chaque niveau, qui peut se jouer sans entendre se joue alors entièrement en silence. Les jeux qui ne s'y prêtent qu'en partie reçoivent une alternative visuelle quand elle a du sens. Le résultat est une donnée fiable, « silencieux, et à quels niveaux », que T-008 utilisera pour le tag.

## Principe
- **Un seul interrupteur commun, actif seulement sur demande.** Un réglage « Mode silencieux : non/oui », **non par défaut**, dans `shell.js`, pour tous les jeux, rangé par profil comme le mode de retour. Quand il est sur « oui », `audio.js` ne produit plus aucun son : notes, accords, clics, retours. Le jeu se branche sur cet interrupteur au lieu d'avoir chacun sa propre option. Les options `sound` actuelles (find-a-note, key-signatures, read-intervals, read-chords) sont reprises par le réglage commun, sans perdre les réglages déjà enregistrés.
- **Paramètre d'URL `?silent=1`.** Il active l'interrupteur pour la partie seulement, sans rien enregistrer, comme `?level=`. Il met aussi le mode de retour en « silencieux ».
- **Déclaration par jeu.** Le champ `silent` de `GAMES` (`taxonomy.js`) vaut `true` (tous les niveaux), une liste de niveaux, ou `false`. Un jeu silencieux sur une partie des niveaux, lancé avec `?silent=1`, s'ouvre au premier niveau silencieux s'il était sur un autre.
- **Alternatives visuelles ou vibrations, en mode silencieux seulement.** Elles ne s'affichent pas en jeu normal, sauf si elles aident aussi avec le son (à juger, à signaler). On les prévoit seulement quand le son ne sert qu'à donner le temps ou à montrer un modèle :
  - **pulsation et métronome** : un repère visuel (tap-rhythm, two-hands, read-melody, rhythm-dictation si pertinent) ;
  - **modèle joué** : il est montré au lieu d'être entendu (play-scales, play-chords, echo-penta s'il reste jouable par la mémoire visuelle — à juger).
  - Pas d'alternative pour les jeux où entendre est le but : écoute d'intervalles, d'accords, de cadences, dictées, chant. En mode silencieux, ces jeux affichent au démarrage un court message, « Ce jeu a besoin du son », avec un bouton pour désactiver le mode silencieux. Un jeu silencieux à certains niveaux seulement affiche le même message sur ses niveaux sonores, et propose aussi d'aller au premier niveau silencieux. Le filtre de l'accueil (T-008) masque ces jeux, il ne les grise pas.
- **Vibreur.** En mode silencieux, le vibreur du téléphone peut remplacer un son quand c'est pertinent : la pulsation des jeux de rythme, ou le retour de réussite et d'erreur (motifs courts et distincts). Il est désactivable, il ne sert que si l'appareil le permet (`navigator.vibrate`), et il est sans effet ailleurs. Il ne sert jamais pendant que le micro écoute.
- **Micro.** Les jeux au micro peuvent rester silencieux côté machine : le joueur chante ou joue, et l'écran répond. On déclare `silent` si aucun son de la machine n'est indispensable pour répondre.

## Critères de fin
- [ ] Le réglage commun « Mode silencieux » existe dans la boîte de réglages de chaque jeu, désactivé par défaut. Il est rangé par profil, exporté et importé avec les réglages.
- [ ] Mode silencieux désactivé : chaque jeu sonne exactement comme avant (les tests existants passent sans changement de leurs attentes sonores).
- [ ] `?silent=1` coupe tout pour la partie, sans rien enregistrer.
- [ ] Chaque jeu est audité, et le champ `silent` est renseigné dans `taxonomy.js`, avec les niveaux. Le point de départ est la section « Tags par jeu » de T-008. Le but est le plus grand nombre de jeux possible.
- [ ] En mode silencieux, un jeu ou un niveau non silencieux affiche le message « Ce jeu a besoin du son » avec le bouton pour désactiver le mode, et, s'il existe, le bouton vers le premier niveau silencieux ; test sur un jeu d'écoute et sur music-words.
- [ ] Les alternatives visuelles et vibrations retenues sont faites, en mode silencieux seulement ; le vibreur peut être coupé, et un test vérifie qu'il est appelé (pulsation, retour) quand le mode est actif. Les jeux écartés le sont avec une raison d'une ligne dans le rapport.
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
