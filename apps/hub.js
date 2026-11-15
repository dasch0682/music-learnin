// Home page: the list of games, grouped by domain, with progress.
import { createPage } from '@core/page.js';
import { h } from '@core/shell.js';
import { tr } from '@core/i18n.js';
import { DOMAINS, GAMES, SKILLS } from '@core/taxonomy.js';
import { loadMastery } from '@core/mastery.js';
import './hub.css';

const L = (en, fr) => ({ en, fr });

async function render(main) {
  const mastery = await loadMastery();
  const progress = (gameId) => {
    const skills = SKILLS.filter((s) => s.game === gameId);
    return skills.reduce((sum, s) => sum + (mastery.get(s.id)?.score ?? 0), 0) / (skills.length || 1);
  };
  const sections = DOMAINS.map((d) => {
    const games = GAMES.filter((g) => g.domain === d.id);
    if (!games.length) return null;
    return h('section', {},
      h('h2', { textContent: tr(d) }),
      h('div', { className: 'hub-grid' }, ...games.map((g) => {
        const bar = h('span', { className: 'hub-bar' }, h('i', {}));
        bar.firstChild.style.width = Math.round(progress(g.id) * 100) + '%';
        return h('a', { className: 'hub-tile', href: `./${g.id}/` },
          h('span', { className: 'hub-icon', textContent: g.icon }),
          h('span', { className: 'hub-name', textContent: tr(g) }),
          bar);
      })));
  });
  main.replaceChildren(
    ...sections.filter(Boolean),
    h('a', { className: 'ml-btn hub-map', href: './mastery-map/', textContent: tr(L('Mastery map', 'Carte de maîtrise')) }),
  );
}

createPage({ home: './', title: 'Music Learnin', render });
