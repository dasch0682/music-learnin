import { defineConfig } from 'vite';
import { resolve, relative } from 'node:path';
import { readdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const appsDir = resolve(__dirname, 'apps');
const input = { index: resolve(appsDir, 'index.html') };
for (const d of readdirSync(appsDir, { withFileTypes: true })) {
  const html = resolve(appsDir, d.name, 'index.html');
  if (d.isDirectory() && existsSync(html)) input[d.name] = html;
}

// Writes sw.js with the full list of built files, so every game works offline.
function serviceWorker() {
  let outDir;
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = resolve(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  return {
    name: 'ml-service-worker',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const files = walk(outDir).filter((p) => !p.endsWith('sw.js'));
      const hash = createHash('sha1');
      for (const p of files) hash.update(readFileSync(p));
      const list = files.map((p) => './' + relative(outDir, p).split('\\').join('/'));
      const tpl = readFileSync(resolve(__dirname, 'packages/core/sw.template.js'), 'utf8');
      writeFileSync(resolve(outDir, 'sw.js'), tpl
        .replace('__VERSION__', 'ml-' + hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(list)));
    },
  };
}

export default defineConfig({
  root: appsDir,
  base: './',
  publicDir: resolve(__dirname, 'public'),
  resolve: { alias: { '@core': resolve(__dirname, 'packages/core') } },
  build: { outDir: resolve(__dirname, 'dist'), emptyOutDir: true, rollupOptions: { input } },
  plugins: [serviceWorker()],
});
