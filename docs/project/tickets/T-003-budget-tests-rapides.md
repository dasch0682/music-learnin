---
id: T-003
title: Ramener known-tunes, platform et form sous 30 s en mode rapide
status: todo
model: haiku
owner: 
depends: 
created: 2026-11-18
closed: 
commit: 
---

## But
Ces trois tests prennent 31 à 34 s en mode rapide (avertissement du lanceur).

## Critères de fin
- [ ] `npm run test:fast` sans avertissement `WARN slow fast test`.
- [ ] Mode complet inchangé (`npm test -- --only known-tunes,platform,form` ok).

## Contexte
Fichiers : `tools/known-tunes.test.mjs`, `tools/platform.test.mjs`, `tools/form.test.mjs`, `tools/README.md` (règles du budget).

## Rapport
