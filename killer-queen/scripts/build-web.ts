/** Bundle the Preact web app into public/ with esbuild (one script). */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'public');
mkdirSync(out, { recursive: true });
const watch = process.argv.includes('--watch');

const result = await build({
  entryPoints: [resolve(root, 'src/web/main.tsx')],
  bundle: true,
  minify: !watch,
  sourcemap: true,
  format: 'esm',
  target: ['es2022'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  outfile: resolve(out, 'app.js'),
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'fonts/[name]',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
});
copyFileSync(resolve(root, 'src/web/index.html'), resolve(out, 'index.html'));
for (const f of readdirSync(resolve(root, 'src/web/static'))) copyFileSync(resolve(root, 'src/web/static', f), resolve(out, f));

// Dev-only design board (D3): static frames drawn from the tokens, with the self-hosted fonts.
if (!process.argv.includes('--no-board')) {
  const boardOut = resolve(out, 'design-board');
  mkdirSync(boardOut, { recursive: true });
  const board = await build({
    entryPoints: [resolve(root, 'src/web/design-board/board.css')],
    bundle: true,
    minify: !watch,
    outfile: resolve(boardOut, 'board.css'),
    loader: { '.woff2': 'file', '.woff': 'file' },
    assetNames: 'fonts/[name]',
    logLevel: 'info',
  });
  copyFileSync(resolve(root, 'src/web/design-board/index.html'), resolve(boardOut, 'index.html'));
  if (board.errors.length) process.exit(1);
}
if (result.errors.length) process.exit(1);
console.log(`web app built into ${out}`);
