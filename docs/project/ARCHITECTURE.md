# Architecture

Référence détaillée de l'API commune : [packages/core/README.md](../../packages/core/README.md). Liste des compétences : `packages/core/taxonomy.js`.

## Dépôt

```mermaid
flowchart TB
  subgraph apps["apps/ — 34 jeux + accueil + carte"]
    hub["index.html · hub.js<br/>accueil, « Aujourd'hui »"]
    map["mastery-map/<br/>carte de maîtrise"]
    game["&lt;slug&gt;/<br/>index.html · main.js · style.css"]
  end
  subgraph core["packages/core/ — module commun (@core)"]
    shell["shell.js<br/>barre, réglages, retours, attempt()"]
    page["page.js<br/>pages accueil et carte"]
    tax["taxonomy.js<br/>compétences, jeux, niveaux"]
    store["storage.js · profiles.js<br/>IndexedDB + localStorage"]
    mast["mastery.js · path.js<br/>score, choix des questions, parcours"]
    sound["audio.js · pitch.js · midi.js<br/>synthèse, micro, MIDI"]
    draw["staff.js · keyboard.js<br/>portée SVG, clavier"]
    misc["music.js · i18n.js · transfer.js<br/>feedback.js · rewards.js · update.js"]
  end
  subgraph tools["tools/ — tests et outils"]
    t["&lt;slug&gt;.test.mjs (38)"]
    lib["lib/harness.mjs · shared-a/b.mjs"]
    run["test-all.mjs · smoke.mjs · status.mjs"]
  end
  game --> shell
  hub --> page
  map --> page
  shell --> store & mast & sound & draw & misc
  page --> tax & store & mast
  t --> lib
  run --> t
```

## Flux des données

```mermaid
flowchart LR
  Q[Question<br/>pickWeak] --> P[Joueur<br/>touche, micro, MIDI, frappe]
  P --> A["game.attempt()<br/>skill, correct, ms, level, item"]
  A --> F[Retour<br/>feedback.js, mode du profil]
  A --> DB[(IndexedDB<br/>journal attempts, par profil)]
  DB --> M[mastery.js<br/>moyenne pondérée × oubli]
  M --> Q
  M --> C[Carte de maîtrise]
  M --> T[« Aujourd'hui »<br/>path.js + levels des jeux]
  DB <--> X[Export / import JSON<br/>keep · new · merge]
```

Le journal est la seule source de vérité : il ne fait que grandir, et la maîtrise est toujours recalculée à partir de lui. Les réglages sont rangés par profil, sous les clés `ml:psettings:<id>:<jeu>`. Le mode de retour suit la même règle, avec le pseudo-jeu `_feedback`.

## Compétences

6 domaines et 79 compétences, sur 8 niveaux. Chaque compétence appartient à un jeu. Deux fils traversent les domaines :

| Domaine | Compétences | Jeux |
|---|---|---|
| Écoute | 21 | high-low, echo-penta, ear-intervals, ear-chords, ear-cadences, ear-scales, ear-progressions, melody-dictation, ear-jazz, music-words, form, two-voices |
| Chant | 14 | sing-match, second-voice, sight-sing |
| Jeu | 13 | penta-jam, play-the-note, known-tunes, compose, play-scales, play-chords |
| Rythme | 11 | tap-rhythm, rhythm-dictation, two-hands |
| Lecture | 13 | find-a-note, read-melody, key-signatures, read-intervals, read-chords, score-reading |
| Théorie | 7 | build-scales, build-chords, circle-of-fifths, harmony-lab |

- **Fil cinq notes** (10 compétences) : de l'écho à l'impro jazz, sans nommer la pentatonique au début.
- **Fil tension-détente** (17 compétences) : de la note tenue aux notes-guides du jazz, en passant par les cadences.

## Tests et publication

```mermaid
flowchart LR
  dev[Branche de travail] -->|push| ci1[CI : build, fumée 36 pages,<br/>suite rapide ~4 min]
  main[main] -->|push| ci2[CI : idem + déploiement<br/>GitHub Pages]
  cron[Chaque lundi] --> ci3[Suite complète<br/>4 en parallèle, 1 relance]
```

Le mode rapide joue le premier, le milieu et le dernier niveau, avec un seul thème et une seule langue. Les minuteries y vont 5 fois plus vite, sauf dans les jeux de rythme et de micro. Le mode complet joue tous les niveaux, dans les deux thèmes et les deux langues. Détails : [tools/README.md](../../tools/README.md).
