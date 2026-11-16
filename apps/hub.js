// Home page: the list of games, grouped by domain, with progress.
import { createPage } from '@core/page.js';
import { h } from '@core/shell.js';
import { tr } from '@core/i18n.js';
import { DOMAINS, GAMES, SKILLS } from '@core/taxonomy.js';
import { loadMastery } from '@core/mastery.js';
import { getAttempts } from '@core/storage.js';
import { nextSteps } from '@core/path.js';
import { dayStreak, gameStars, starText } from '@core/rewards.js';
import './hub.css';

const L = (en, fr) => ({ en, fr });

const T = {
  today: L('Today', 'Aujourd’hui'),
  new: L('new', 'nouveau'),
  weak: L('to strengthen', 'à renforcer'),
  review: L('review', 'à revoir'),
  level: L('level', 'niveau'),
  days: L('days in a row', 'jours de suite'),
  all: L('All games', 'Tous les jeux'),
};

const stars = (n) => (n ? h('span', { className: 'hub-stars', textContent: starText(n), 'aria-hidden': 'true' }) : null);

async function render(main) {
  const attempts = await getAttempts();
  const mastery = await loadMastery();
  const streak = dayStreak(attempts);
  const steps = nextSteps(attempts, { count: 4 });
  const today = h('section', { className: 'hub-today' },
    h('h2', {},
      h('span', { textContent: tr(T.today) }),
      h('span', { className: 'hub-streak', title: `${streak.streak} ${tr(T.days)}` },
        ...streak.week.map((on, i) => h('i', { className: on ? 'on' : '' })),
        h('b', { textContent: streak.streak }))),
    h('div', { className: 'hub-grid hub-big' }, ...steps.map((st) => {
      const g = GAMES.find((x) => x.id === st.game);
      return h('a', { className: `hub-tile hub-step hub-${st.reason}`, href: `./${st.game}/${st.level ? '?level=' + st.level : ''}` },
        h('span', { className: 'hub-icon', textContent: g.icon }),
        h('span', { className: 'hub-name', textContent: tr(g) }),
        h('span', { className: 'hub-why', textContent: `${tr(T[st.reason])}${st.level ? ' · ' + tr(T.level) + ' ' + st.level : ''}` }));
    })));
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
          stars(gameStars(SKILLS.filter((k) => k.game === g.id).map((k) => k.id), mastery)),
          bar);
      })));
  });
  main.replaceChildren(...[
    steps.length ? today : null,
    steps.length ? h('h2', { textContent: tr(T.all) }) : null,
    ...sections.filter(Boolean),
    h('a', { className: 'ml-btn hub-map', href: './mastery-map/', textContent: tr(L('Mastery map', 'Carte de maîtrise')) }),
  ].filter(Boolean));
}

createPage({ home: './', title: 'Music Learnin', render });
