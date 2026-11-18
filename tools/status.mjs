// Project status without spending tokens on numbers.
// Rewrites, from the repo itself:
//   - docs/project/BOARD.md: tickets table (from the front matter of docs/project/tickets/T-*.md) + Mermaid dependency graph;
//   - the block between <!-- auto:start --> and <!-- auto:end --> in docs/project/STATUS.md (commit, counts, tests, CI, tickets).
// Usage: node tools/status.mjs [--ci]   (--ci also asks GitHub for the last CI run, needs `gh`)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => resolve(root, p);
const sh = (cmd) => { try { return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

// ---- tickets ----------------------------------------------------------------
const STATES = ['doing', 'review', 'blocked', 'todo', 'done'];
const LABEL = { todo: 'à faire', doing: 'en cours', review: 'à vérifier', blocked: 'bloqué', done: 'fait' };
function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  return Object.fromEntries(m[1].split('\n').map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.trim()]));
}
const tdir = P('docs/project/tickets');
const tickets = existsSync(tdir) ? readdirSync(tdir).filter((f) => /^T-\d+.*\.md$/.test(f)).sort().map((f) => ({ file: f, ...frontMatter(readFileSync(resolve(tdir, f), 'utf8')) })) : [];
for (const t of tickets) if (!STATES.includes(t.status)) t.status = 'todo';
const byState = Object.fromEntries(STATES.map((s) => [s, tickets.filter((t) => t.status === s)]));

const row = (t) => `| [${t.id}](tickets/${t.file}) | ${t.title || ''} | ${LABEL[t.status]} | ${t.model || ''} | ${t.depends || ''} | ${t.status === 'done' ? (t.closed || '') + (t.commit ? ' · `' + t.commit + '`' : '') : t.created || ''} |`;
const open = tickets.filter((t) => t.status !== 'done');
const mermaid = () => {
  const lines = ['flowchart LR'];
  for (const t of tickets.filter((x) => x.status !== 'done' || tickets.some((y) => y.status !== 'done' && (y.depends || '').includes(x.id)))) {
    lines.push(`  ${t.id.replace('-', '')}["${t.id} ${String(t.title || '').replace(/"/g, "'").slice(0, 40)}<br/>${LABEL[t.status]} · ${t.model || '?'}"]:::${t.status}`);
    for (const d of (t.depends || '').split(/[,\s]+/).filter(Boolean)) lines.push(`  ${d.replace('-', '')} --> ${t.id.replace('-', '')}`);
  }
  lines.push('  classDef done fill:#d8f0d8,stroke:#4a4', '  classDef doing fill:#fff2cc,stroke:#c90', '  classDef review fill:#dde8ff,stroke:#46c',
    '  classDef blocked fill:#ffd9d9,stroke:#c44', '  classDef todo fill:#eee,stroke:#888');
  return lines.join('\n');
};
const board = `# Tableau des tâches

<!-- Généré par \`node tools/status.mjs\` depuis docs/project/tickets/T-*.md : ne pas modifier à la main. -->

En cours ou à faire : ${open.length} · faits : ${byState.done.length}

| Ticket | Titre | État | Modèle | Dépend de | Date · commit |
|---|---|---|---|---|---|
${[...STATES.filter((s) => s !== 'done').flatMap((s) => byState[s]), ...byState.done.slice().reverse()].map(row).join('\n') || '| – | aucun ticket | | | | |'}

${open.length ? '```mermaid\n' + mermaid() + '\n```\n' : ''}
Historique d'avant les tickets : voir [HISTORY.md](HISTORY.md).
`;
writeFileSync(P('docs/project/BOARD.md'), board);

// ---- status block -------------------------------------------------------------
const tax = await import(P('packages/core/taxonomy.js'));
const tests = readdirSync(P('tools')).filter((f) => f.endsWith('.test.mjs')).length;
const last = (label) => { try { const j = JSON.parse(readFileSync(P(`tools/.logs/last-${label}.json`), 'utf8')); return `${j.summary} — ${j.at.slice(0, 16).replace('T', ' ')} UTC${j.fail.length ? ' — échecs : ' + j.fail.join(', ') : ''}${j.flaky.length ? ' — instables : ' + j.flaky.join(', ') : ''}`; } catch { return 'pas de passage complet enregistré sur cette machine'; } };
let ci = '';
if (process.argv.includes('--ci')) {
  const r = sh("gh run list -L 1 -b main --json conclusion,status,displayTitle,createdAt --jq '.[0] | \"\\(.status) \\(.conclusion) — \\(.displayTitle) — \\(.createdAt)\"'");
  ci = r ? `- CI (main, dernier passage) : ${r}\n` : '- CI : non disponible depuis cette machine\n';
}
const block = `<!-- auto:start -->
_Bloc généré par \`node tools/status.mjs\` le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC._

- Commit : \`${sh('git rev-parse --short HEAD')}\` (${sh('git branch --show-current') || 'détaché'}) — ${sh('git log -1 --format=%s')}
- Contenu : ${tax.GAMES.length} jeux, ${tax.SKILLS.length} compétences, ${tests} fichiers de test
- Tests rapides (dernier passage complet local) : ${last('fast')}
- Tests complets (dernier passage local) : ${last('full')}
${ci}- Tickets : ${STATES.filter((s) => s !== 'done').map((s) => `${byState[s].length} ${LABEL[s]}`).join(', ')}, ${byState.done.length} faits — voir [BOARD.md](BOARD.md)
<!-- auto:end -->`;
const sp = P('docs/project/STATUS.md');
const status = readFileSync(sp, 'utf8');
writeFileSync(sp, status.replace(/<!-- auto:start -->[\s\S]*?<!-- auto:end -->/, block));
console.log(`status: ${open.length} open ticket(s), ${byState.done.length} done; BOARD.md and STATUS.md updated`);
