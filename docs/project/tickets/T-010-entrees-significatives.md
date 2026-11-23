---
id: T-010
title: Un seul clic pour lancer, des entrées seulement quand elles ont un sens
status: todo
model: sonnet
owner: 
depends: T-009
created: 2026-11-23
closed: 
commit: 
---

## But
Le joueur ne peut ni lancer un jeu deux fois, ni déclencher un son ou une action qui brouille l'exercice. Les commandes ne répondent que quand elles ont un sens, et l'écran montre clairement quand c'est le cas. Règles : [DESIGN.md](../DESIGN.md), section « Entrées du joueur ».

## Étapes
1. **Commun.** Dans `shell.js`, ajouter :
   - un démarrage protégé : le bouton « Commencer » ne réagit qu'une fois, et la frappe fantôme sur mobile ne touche pas ce qui apparaît dessous ;
   - un état de phase partagé, `game.phase(name)` : `listen` (la question se joue), `answer` (on attend la réponse), `feedback` (retour et transition), `free` (jeu libre). La phase est posée en classe CSS sur la scène.
   
   Dans `core.css`, les zones de réponse sont inactives et visiblement atténuées hors de la phase `answer`. `keyboard.js` et `midi.js` ignorent les touches quand le jeu le demande, sans jouer de son.
2. **Audit des 34 jeux.** Pour chaque jeu, lister les entrées qui peuvent arriver au mauvais moment. Par exemple :
   - répondre pendant que la question se joue ;
   - relancer l'écoute pendant qu'elle joue déjà ;
   - cliquer pendant la transition vers la question suivante ;
   - frapper un pad qui joue un son sans rapport ;
   - double-cliquer sur « Niveau suivant ».
   
   Corriger chaque cas avec l'état de phase commun, et pas au cas par cas.
3. **Exceptions voulues** : le jeu libre (compose, penta-jam en improvisation) et le droit de couper une écoute longue pour répondre, si un jeu l'offre volontairement. Les noter dans DESIGN.md.

## Critères de fin
- [ ] Un double tap sur « Commencer » lance une seule partie et ne produit aucune réponse ni aucun son parasite (test sur 3 jeux de types différents).
- [ ] Pour chaque jeu, un test essaie une réponse pendant la phase `listen` et pendant la phase `feedback`. Elle n'est ni enregistrée ni sonore, et l'écran ne change pas.
- [ ] La relance de l'écoute est ignorée pendant qu'elle joue (déjà fait dans high-low : généraliser).
- [ ] Les boutons inactifs sont distingués autrement que par la couleur seule (opacité et curseur, attribut `aria-disabled`).
- [ ] La liste des cas trouvés et corrigés figure dans le rapport (une ligne par jeu au plus).
- [ ] `npm run test:changed` : tout ok, et la suite rapide reste sous 300 s.

## Lire (liste fermée)
- `docs/AGENT.md`, `docs/project/DESIGN.md`, `docs/feedback-spec.md`
- `packages/core/shell.js`, `core.css`, `keyboard.js`, `midi.js`, `README.md`
- Le `main.js` de chaque jeu, avec son test

## Modifier (seulement)
- `packages/core/shell.js`, `core.css`, `keyboard.js`, `midi.js`, `README.md`
- `apps/*/main.js`, et `style.css` si besoin
- `tools/` : les tests des jeux, et un helper commun dans `tools/lib/` pour « répondre au mauvais moment »

## Contexte
Demande de l'utilisateur (2026-11-23). Un son ou une action hors de propos brouille la compréhension, surtout chez un enfant. Ce ticket dépend de T-009 seulement parce que les deux touchent les mêmes fichiers. Les jeux étant nombreux, découper en deux lots si besoin (écoute et chant, puis le reste), un agent à la fois.

## Rapport
