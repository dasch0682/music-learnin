// Mastery map: read-only view of the shared attempts log, organised by the skill taxonomy.
import { createPage } from '@core/page.js';
import { h } from '@core/shell.js';
import { tr } from '@core/i18n.js';
import { DOMAINS, LEVELS, SKILLS, GAMES } from '@core/taxonomy.js';
import { loadMastery } from '@core/mastery.js';
import './style.css';

const T = {
  title: { en: 'Mastery map', fr: 'Carte de maîtrise' },
  soon: { en: 'soon', fr: 'bientôt' },
  level: { en: 'Level', fr: 'Niveau' },
  thread: { en: 'Five-note thread', fr: 'Fil des cinq notes' },
  voice: { en: 'Tension-and-release thread', fr: 'Fil tension et détente' },
  empty: { en: 'Play a game: your progress will appear here.', fr: 'Joue à un jeu : ta progression apparaîtra ici.' },
};

async function render(main) {
  const mastery = await loadMastery();
  const score = (id) => mastery.get(id)?.score ?? 0;
  const status = (id) => mastery.get(id)?.status ?? 'new';

  // Overview grid: one row per domain, one column per level.
  const grid = h('div', { className: 'map-grid' },
    h('span', {}), ...LEVELS.map((l) => h('span', { className: 'map-head', textContent: l.id, title: tr(l) })),
    ...DOMAINS.flatMap((d) => [
      h('span', { className: 'map-row', textContent: tr(d) }),
      ...LEVELS.map((l) => {
        const skills = SKILLS.filter((s) => s.domain === d.id && s.level === l.id);
        const cell = h('span', { className: 'map-cell' });
        if (!skills.length) cell.classList.add('map-none');
        else if (skills.every((s) => !s.game)) cell.classList.add('map-soon');
        else {
          const built = skills.filter((s) => s.game);
          const avg = built.reduce((a, s) => a + score(s.id), 0) / built.length;
          cell.style.setProperty('--v', avg.toFixed(2));
          cell.title = `${tr(d)} · ${tr(l)} · ${Math.round(avg * 100)}%`;
        }
        return cell;
      }),
    ]));

  const sections = DOMAINS.map((d) => h('section', {},
    h('h2', { textContent: tr(d) }),
    ...SKILLS.filter((s) => s.domain === d.id).sort((a, b) => a.level - b.level).map((s) => {
      const game = GAMES.find((g) => g.id === s.game);
      const bar = h('span', { className: 'map-bar' }, h('i', {}));
      bar.firstChild.style.width = Math.round(score(s.id) * 100) + '%';
      const row = h(game ? 'a' : 'div', { className: `map-skill map-${status(s.id)}${game ? '' : ' map-planned'}` },
        h('span', { className: 'map-level', textContent: s.level, title: `${tr(T.level)} ${s.level} · ${tr(LEVELS[s.level - 1])}` }),
        h('span', { className: 'map-name' }, tr(s), s.penta ? h('span', { className: 'map-penta', textContent: ' ✦', title: tr(T.thread) }) : null,
          s.voice ? h('span', { className: 'map-penta', textContent: ' ◆', title: tr(T.voice) }) : null),
        game ? bar : h('span', { className: 'map-tag', textContent: tr(T.soon) }));
      if (game) row.href = `../${game.id}/`;
      return row;
    })));

  main.replaceChildren(
    grid,
    mastery.size ? null : h('p', { className: 'ml-hint', textContent: tr(T.empty) }),
    h('p', { className: 'map-legend', textContent: `✦ ${tr(T.thread)}   ◆ ${tr(T.voice)}` }),
    ...sections,
  );
}

createPage({ home: '../', showHome: true, title: () => tr(T.title), render });
