# music-learnin

Small serious games to learn music by ear, voice, hands and eyes. English and French. Works offline.

Practice comes first: the player hears, sings and plays before anything gets a name.
The five-note (pentatonic) scale runs through every level, from the first free play to jazz improvisation.

## Structure

```
apps/                 one folder per game, each a standalone page deployed at /<slug>/
apps/index.html       home page (hub.js)
apps/mastery-map/     map of what has been mastered, across all games
packages/core/        shared module: see packages/core/README.md
public/               manifest and icon
tools/shot.mjs        screenshot helper for testing
```

All games live on the same origin, so they share one IndexedDB database in the browser.
The only stored data is an append-only log of attempts. Mastery is always recomputed from it.
Settings and results can be exported and imported as JSON files, per game or for all games.
Importing results merges them (union by id), so two devices or two players can be combined.

## Commands

```
npm install
npm run dev       # development server
npm run build     # static site in dist/ (includes the offline service worker)
npm run preview   # serve dist/
```

Deploy the content of `dist/` at the root of the site. Paths are relative, so a sub-folder works too.

## Adding a game

1. Copy `apps/find-a-note/` to `apps/<slug>/`.
2. Add the game to `GAMES` and link its skills in `packages/core/taxonomy.js`.
3. Follow the rules in `packages/core/README.md`.

## Threads

Two ideas come back at every level, first by ear and by voice, later with their names:

- the five-note (pentatonic) scale: `echo-penta`, `penta-jam`, `sing-match` (skills flagged `penta`);
- tension and release, from one held note to cadences and jazz guide tones: `second-voice`, `ear-cadences` (skills flagged `voice`).
