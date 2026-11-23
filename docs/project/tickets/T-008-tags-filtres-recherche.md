---
id: T-008
title: Tags, filtres et recherche des jeux sur l'accueil
status: todo
model: sonnet
owner: 
depends: 
created: 2026-11-23
closed: 
commit: 
---

## But
Sur l'accueil, on peut filtrer les jeux par tags et les chercher par mot. Un jeu lancé depuis le filtre « silencieux » démarre sans aucun son, pour cette partie seulement.

## Critères de fin
- [ ] La proposition [TAGS.md](../TAGS.md) est validée par l'utilisateur : liste, attribution, portée de l'effet.
- [ ] Les points marqués « ? » dans TAGS.md sont vérifiés dans le code, et le tableau est corrigé.
- [ ] `GAMES[].tags` et le dictionnaire `TAGS` (FR/EN) sont ajoutés dans `taxonomy.js`.
- [ ] Une option pour couper le son est ajoutée aux jeux marqués silencieux qui n'en ont pas.
- [ ] Sur l'accueil :
  - [ ] puces de filtre, combinées par ET ;
  - [ ] recherche sans accents, sur le titre, les tags, le domaine et les compétences, avec synonymes ;
  - [ ] filtre conservé dans l'URL.
- [ ] Les paramètres d'URL `?silent=1` et `?input=keyboard` sont appliqués par `shell.js` pour la partie seulement, sans être enregistrés.
- [ ] Le test `catalog` est étendu : chaque tag est connu, et chaque jeu silencieux ne produit aucun son avec `?silent=1`, vérifié par enregistrement audio.
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
- Le `main.js` des jeux silencieux sans option son (build-scales, build-chords, circle-of-fifths, harmony-lab, et d'autres si la vérification le demande)
- `tools/catalog.test.mjs`, `tools/platform.test.mjs`, et les tests des jeux modifiés

## Contexte
Demande de l'utilisateur (2026-11-23). Les tags avec effet (`silencieux`, `sans micro`, `casque conseillé`) appliquent leur réglage au lancement depuis le filtre.

## Rapport
