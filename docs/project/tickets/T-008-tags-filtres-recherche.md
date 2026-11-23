---
id: T-008
title: Tags, filtres et recherche des jeux sur l'accueil
status: todo
model: sonnet
owner: 
depends: T-009
created: 2026-11-23
closed: 
commit: 
---

## But
Sur l'accueil, on peut filtrer les jeux par tags et les chercher par mot. Un jeu lancé depuis le filtre « silencieux » démarre sans aucun son, pour cette partie seulement.

## Critères de fin
- [ ] La proposition [TAGS.md](../TAGS.md) est validée par l'utilisateur : liste, attribution, portée de l'effet.
- [x] Les points marqués « ? » dans TAGS.md sont vérifiés dans le code, et le tableau est corrigé (voir « Tags par jeu » et TAGS.md).
- [ ] `GAMES[].tags` et le dictionnaire `TAGS` (FR/EN) sont ajoutés dans `taxonomy.js`.
- [ ] Le tag `silencieux` est lu dans le champ `silent` de `GAMES`, établi par T-009, et pas recopié à la main.
- [ ] Sur l'accueil :
  - [ ] puces de filtre, combinées par ET ; les jeux qui ne répondent pas au filtre sont masqués, pas grisés ;
  - [ ] recherche sans accents, sur le titre, les tags, le domaine et les compétences, avec synonymes ;
  - [ ] filtre conservé dans l'URL.
- [ ] Le lien d'un jeu lancé depuis un filtre avec effet porte le paramètre : `?silent=1` (fait par T-009), `?input=keyboard`. `?input=` est appliqué par `shell.js` pour la partie seulement.
- [ ] Le test `catalog` est étendu : chaque tag est connu ; le tag `silencieux` concorde avec le champ `silent` (le test sans son est fait par T-009).
- [ ] Le test `platform` est étendu : filtre, recherche, URL partagée.
- [ ] `npm run test:changed` : tout ok.

## Lire (liste fermée)
- `docs/AGENT.md`, `docs/project/TAGS.md`
- `packages/core/taxonomy.js`, `packages/core/shell.js` (`applyUrlLevel`), `packages/core/feedback.js`, `apps/hub.js`, `apps/hub.css`
- `tools/catalog.test.mjs`, `tools/platform.test.mjs`, `tools/lib/shared-b.mjs` (enregistrement audio)
- Pour chaque jeu marqué « ? » : son `main.js`

## Modifier (seulement)
- `packages/core/taxonomy.js`, `packages/core/shell.js`, `packages/core/README.md`
- `apps/hub.js`, `apps/hub.css`
- `tools/catalog.test.mjs`, `tools/platform.test.mjs`, et les tests des jeux modifiés

## Contexte
Dépend de T-009, qui fait le mode silencieux dans les jeux et fournit le champ `silent`. Ce ticket ne modifie plus le son des jeux.

Demande de l'utilisateur (2026-11-23). Les tags avec effet (`silencieux`, `sans micro`, `casque conseillé`) appliquent leur réglage au lancement depuis le filtre.

## Tags par jeu

Établi en lisant le `main.js` de chacun des 34 jeux (niveaux, réglages, ce qui est joué, montré, demandé). Le vocabulaire est dans [TAGS.md](../TAGS.md) (57 tags).

Lecture du tableau :
- Un tag sans niveau vaut pour tous les niveaux du jeu. `(niv. a–b)` : seulement ces niveaux. `(option)` : un réglage du jeu.
- `sans micro` est donné à tout jeu qui n'exige jamais le micro. Il est absent de sing-match, second-voice et sight-sing (micro obligatoire), et présent avec `micro (option)` pour play-the-note et play-scales.
- `silencieux` : voir la définition dans TAGS.md. Les jeux marqués « option à ajouter » n'ont pas de réglage pour couper le son (liste plus bas).
- `clavier MIDI` : le jeu utilise `createKeyboard` ou `createPads` du cœur, qui branchent le MIDI.
- Colonne « Fils » : `cinq notes`, `tension-détente`, `jazz`.

| Jeu | Conditions | Réponse | Public et prérequis | Clés | Notions | Activités | Fils |
|---|---|---|---|---|---|---|---|
| high-low | sans micro | | premiers pas, sans nom de notes | | aigu-grave (niv. 1–4), mélodie (niv. 5–6) | | |
| echo-penta | sans micro | clavier MIDI | premiers pas, sans nom de notes | | mélodie, mineur (niv. 5), blues (niv. 6), tonalités (niv. 5–6) | mémoire | cinq notes |
| ear-intervals | sans micro | clavier MIDI (réponse « jouer ») | sans nom de notes | | intervalles | oreille relative | |
| ear-chords | sans micro | | premiers pas (niv. 1), sans nom de notes | | accords, mineur (niv. 2–3) | | |
| ear-cadences | sans micro | | premiers pas (niv. 1), sans nom de notes | | cadences, mineur (niv. 5), modes (niv. 6) | oreille relative | tension-détente, jazz (niv. 6) |
| ear-scales | sans micro | | premiers pas (niv. 1), sans nom de notes | | gammes, mineur (niv. 2–3), modes (niv. 4–6), blues (niv. 6) | oreille relative | cinq notes (niv. 2) |
| ear-progressions | sans micro | | premiers pas (niv. 1–2), nom des notes (niv. 3–6) | | enchaînements d'accords, accords, mineur (niv. 5) | dictée, oreille relative | jazz (niv. 6) |
| melody-dictation | sans micro | clavier MIDI | sans nom de notes | clé de sol, clé de fa (niv. 6) | mélodie, armures (niv. 4–6), tonalités (niv. 4–6), mineur (niv. 5), altérations (niv. 6) | dictée | cinq notes (niv. 1) |
| ear-jazz | sans micro | | sans nom de notes | | accords | | jazz |
| music-words | silencieux (niv. 4), sans micro | | premiers pas (niv. 1–2), sans nom de notes | | nuances et termes | | |
| form | sans micro | | premiers pas (niv. 1–2), sans nom de notes | | forme, question-réponse (niv. 2) | | |
| two-voices | sans micro | clavier MIDI | sans nom de notes | clé de sol, clé de fa | deux voix, basse, intervalles (niv. 3), cadences (niv. 5–6), mineur (niv. 6) | dictée | tension-détente (niv. 5–6) |
| sing-match | | micro | premiers pas, sans nom de notes | | notes (niv. 1–2), mélodie (niv. 3), intervalles (niv. 4), gammes (niv. 5) | justesse, mémoire (niv. 2–3), oreille relative (niv. 4–5) | cinq notes (niv. 3) |
| second-voice | casque conseillé | micro | premiers pas (niv. 1), nom des notes (niv. 6–11) | | deux voix, intervalles (niv. 5), accords (niv. 6–11), enchaînements d'accords (niv. 6–11), cadences (niv. 7) | justesse, improvisation (niv. 11), oreille relative | tension-détente, jazz (niv. 8–11) |
| sight-sing | | micro | sans nom de notes | clé de sol, clé de fa (voix grave) | mélodie, armures (niv. 5–6), tonalités (niv. 5–6), mineur (niv. 6), altérations (niv. 6) | déchiffrage, lecture de notes, justesse | cinq notes (niv. 2) |
| penta-jam | sans micro | libre (niv. 1), en rythme | premiers pas (niv. 1), noms en option, sans nom de notes | | enchaînements d'accords (niv. 3–9), question-réponse (niv. 2), mineur (niv. 4), tonalités (niv. 4), blues (niv. 6), modes (niv. 7) | improvisation | cinq notes, tension-détente (niv. 5), jazz (niv. 8–9) |
| play-the-note | silencieux, sans micro | micro (option), clavier MIDI | noms en option, sans nom de notes, instrument transpositeur | clé de sol (niv. 1–4), clé de fa (niv. 5–6) | notes, altérations (niv. 4, 6) | lecture de notes | |
| known-tunes | sans micro | clavier MIDI | premiers pas, sans nom de notes | | mélodie, tonalités (niv. 4–6) | mémoire, transposition (niv. 4–6) | |
| compose | sans micro | libre | premiers pas, sans nom de notes | | mélodie, gammes, mineur (option), blues (option), accords (option) | composition | cinq notes (gamme de départ) |
| play-scales | silencieux (option à ajouter), sans micro | micro (option), clavier MIDI | nom des notes, noms en option, instrument transpositeur | | gammes, tonalités (niv. 3–6), mineur (niv. 5), modes (niv. 6), blues (niv. 6) | | cinq notes (niv. 6) |
| play-chords | silencieux (niv. 2–7, option à ajouter), sans micro | clavier MIDI | nom des notes (niv. 2–7), noms en option | | accords, renversements (niv. 4), mineur (niv. 2–5), cadences (niv. 6), enchaînements d'accords (niv. 6–7) | | tension-détente (niv. 6–7), jazz (niv. 7) |
| tap-rhythm | silencieux (niv. 3–9, option à ajouter), sans micro | en rythme | premiers pas (niv. 1–2), sans nom de notes | | rythme, pulsation (niv. 1), soupirs (niv. 4), notes pointées (niv. 6), syncopes (niv. 6), triolets (niv. 7), mesures composées (niv. 8), mesures irrégulières (niv. 9) | lecture rythmique (niv. 3–9), mémoire (niv. 2) | |
| rhythm-dictation | sans micro | | sans nom de notes | | rythme, soupirs (niv. 2), notes pointées (niv. 4), syncopes (niv. 4), triolets (niv. 5), mesures composées (niv. 6) | dictée | |
| two-hands | silencieux (option à ajouter), sans micro | en rythme | premiers pas (niv. 1), sans nom de notes | | rythme, pulsation (niv. 1–3), polyrythmie (niv. 4–6) | | |
| find-a-note | silencieux, sans micro | | nom des notes | clé de sol (niv. 1–2, 5–6), clé de fa (niv. 3–6), clés d'ut (niv. 7) | notes, altérations (niv. 5) | lecture de notes | |
| read-melody | silencieux (option à ajouter), sans micro | clavier MIDI, en rythme | noms en option, sans nom de notes | clé de sol (niv. 1–5), clé de fa (niv. 6) | mélodie, rythme, soupirs (niv. 3), notes pointées (niv. 4), mesures composées (niv. 5), armures (niv. 4–6), tonalités (niv. 4–6), mineur (niv. 6) | déchiffrage, lecture de notes, lecture rythmique | |
| key-signatures | silencieux, sans micro | clavier MIDI (niv. 1–2) | sans nom de notes (niv. 1–2), nom des notes (niv. 3–6) | clé de sol, clé de fa et clés d'ut (niv. 6) | armures, altérations (niv. 1–2), tonalités (niv. 3–6), mineur (niv. 5–6) | lecture de notes (niv. 1–2) | |
| read-intervals | silencieux, sans micro | | sans nom de notes | clé de sol, clé de fa (niv. 3–6), clés d'ut (niv. 6) | intervalles, altérations (niv. 4–6), armures (niv. 6) | lecture de notes | |
| read-chords | silencieux, sans micro | | nom des notes | clé de sol, clé de fa (niv. 6) | accords, renversements (niv. 4, 6), altérations (niv. 3–6), mineur (niv. 2–6), armures (niv. 6) | lecture de notes | |
| score-reading | silencieux, sans micro | clavier MIDI (niv. 1–2, 4–6) | sans nom de notes, instrument transpositeur (niv. 1–3, 6) | clé de sol, clé de fa et clés d'ut (niv. 4) | intervalles (niv. 5), armures (niv. 6) | lecture de notes, transposition (niv. 1–3, 5–6) | |
| build-scales | silencieux (niv. 3–6, option à ajouter), sans micro | clavier MIDI | sans nom de notes (niv. 1–2), nom des notes (niv. 3–6), noms en option | | gammes, tonalités (niv. 2–4), mineur (niv. 4), modes (niv. 5–6), blues (niv. 6) | | cinq notes (niv. 6) |
| build-chords | silencieux (niv. 4–6, option à ajouter), sans micro | clavier MIDI | sans nom de notes (niv. 1–3), nom des notes (niv. 4–6), noms en option | | intervalles (niv. 1–3), accords (niv. 4–6), renversements (niv. 5), mineur (niv. 4) | | |
| circle-of-fifths | silencieux (option à ajouter), sans micro | | nom des notes (niv. 2–6) | clé de sol (niv. 4) | tonalités, armures (niv. 4), mineur (niv. 5), enchaînements d'accords (niv. 6) | | |
| harmony-lab | silencieux (option à ajouter), sans micro | | nom des notes (niv. 6–8) | clé de sol (niv. 3) | accords, enchaînements d'accords, cadences (niv. 1–3), mélodie (niv. 3), mineur (niv. 5), gammes (niv. 7) | | tension-détente, jazz (niv. 6–8) |

### Constats du code

- **Réponses aux « ? » de TAGS.md**
  - music-words : seul le niveau 4 est muet. Niv. 1–3 : écoute. Niv. 5 : « tempo à reconnaître » (son) ou « range les termes » (muet). Niv. 6 : « terme à entendre » (son) ou « signe à lire » (muet).
  - build-scales, build-chords, circle-of-fifths, harmony-lab : aucun réglage de son. Plages muettes : build-scales niv. 3–6, build-chords niv. 4–6 (niv. 1–3 : des questions à l'oreille), circle-of-fifths et harmony-lab tous niveaux (le but de chaque question est écrit).
  - two-hands : muet possible sur les 6 niveaux (curseur, barres des coups attendus, décompte chiffré). Pas d'option son.
  - penta-jam : pas de MIDI (pads propres, `pointerdown` seulement). Idem compose.
- **Jeux sans réglage pour couper le son, mais muets en pratique** : tap-rhythm (niv. 3–9), two-hands, read-melody, play-scales, play-chords (niv. 2–7), build-scales (niv. 3–6), build-chords (niv. 4–6), circle-of-fifths, harmony-lab. Les touches du clavier et les clics de pulsation sonnent toujours. Ces jeux demandent l'option à ajouter : les quatre du ticket, plus cinq (tap-rhythm, two-hands, read-melody, play-scales, play-chords).
- **Jeux avec réglage son déjà présent** : find-a-note, key-signatures, read-intervals, read-chords (`sound`) ; play-the-note, score-reading (`hear`).
- **Jeux qui exigent le son** (aucun tag silencieux) : high-low, echo-penta, ear-*, melody-dictation, form, two-voices, rhythm-dictation, penta-jam, known-tunes, compose, sing-match, second-voice, sight-sing (le micro et le son de référence).
- **MIDI** : oui pour echo-penta, ear-intervals (réponse « jouer »), melody-dictation, two-voices, known-tunes, play-the-note, play-scales, play-chords, read-melody, key-signatures (niv. 1–2), score-reading (niv. 1–2, 4–6), build-scales, build-chords. Non pour penta-jam et compose.
- **Clés** : score-reading niv. 4 tire deux clés parmi sol, fa, alto, ténor. sight-sing passe en clé de fa si la voix choisie est grave.
- **Doutes** : (a) `premiers pas` d'ear-progressions niv. 1–2 repose sur la mention « par couleur » (pads colorés) ; (b) `oreille relative` est une étiquette de lecture pédagogique, pas lue dans le code ; (c) form niv. 6 « modulation » pourrait recevoir `tonalités` ; (d) circle-of-fifths niv. 1 : noms de tonalités sur le cercle non vérifiés, d'où `nom des notes (niv. 2–6)`.

## Rapport
