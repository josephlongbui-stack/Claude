// Builds the demo as one self-contained HTML fragment (CSS and JS inlined, in-memory routing).
// Usage: node scripts/build-single-file.mjs [outFile]
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'dist-single/rideops-ai.html';
const tmp = 'dist-single/build';
execSync(`npx vite build --base ./ --outDir ${tmp} --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, VITE_ROUTER: 'memory' } });

const assets = path.join(tmp, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
if (js.length !== 1 || css.length !== 1) throw new Error(`expected one JS and one CSS bundle, got ${files.join(', ')}`);

const style = readFileSync(path.join(assets, css[0]), 'utf8').replace(/<\/style/gi, '<\\/style');
// Escape sequences the HTML parser would treat as the end of (or a nested) script element.
const script = readFileSync(path.join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const html = `<title>RideOps AI</title>
<style>${style}</style>
<div id="root"></div>
<script type="module">${script}</script>
`;
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
