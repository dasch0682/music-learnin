// Runs every tools/*.test.mjs against a dev server and prints one line per game.
// Usage: npx vite --port 5220 --strictPort &   then   PORT=5220 node tools/test-all.mjs
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const dir = new URL('.', import.meta.url).pathname;
let failed = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs')).sort()) {
  const t = Date.now();
  const r = spawnSync('node', [dir + f], { env: process.env, encoding: 'utf8', timeout: 900000 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${f.replace('.test.mjs', '')} (${Math.round((Date.now() - t) / 1000)} s)`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').filter((l) => /FAIL|Error|failure/.test(l)).slice(0, 8).join('\n'));
}
console.log(failed ? `${failed} game(s) failing` : 'all games pass');
process.exit(failed ? 1 : 0);
