/**
 * Build docs/design/compare.html: every screen's before (docs/design/before) next to its after (docs/design/after),
 * at both widths and themes, so the owner can see the change in one page.
 *   node scripts/design-compare.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'docs', 'design');
const list = (dir) => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.png')) : []);
const before = new Set(list('before'));
const after = new Set(list('after'));
const routes = [...new Set([...before, ...after].map((f) => f.replace(/-(1440|390)-(light|dark)\.png$/, '')))].sort();
const order = ['arena', 'signed-out-arena', 'empty-arena', 'task-open', 'task-closed', 'task-running', 'task-settled', 'task-skipped', 'task-rejected', 'task-pending', 'market-open', 'market-settled', 'market-unchosen', 'signed-out-market', 'portfolio', 'signed-out-portfolio', 'leaderboard', 'agents', 'submit', 'account', 'signin', 'error-market', 'not-found', 'kitchen-sink'];
routes.sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
const cell = (dir, f) => (fs.existsSync(path.join(root, dir, f)) ? `<a href="${dir}/${f}"><img loading="lazy" src="${dir}/${f}" alt="${dir} ${f}"></a>` : '<div class="none">not captured</div>');
let body = '';
for (const r of routes) {
  body += `<section id="${r}"><h2>${r.replace(/-/g, ' ')}</h2>`;
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const f = `${r}-${width}-${theme}.png`;
    if (!before.has(f) && !after.has(f)) continue;
    body += `<div class="pair w${width}"><div class="lbl">${width} px, ${theme}</div><div class="col"><div class="cap">Before</div>${cell('before', f)}</div><div class="col"><div class="cap">After</div>${cell('after', f)}</div></div>`;
  }
  body += '</section>';
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Killer Queen design: before and after</title>
<style>
body{margin:0;font:14px/1.5 system-ui,sans-serif;color:#15181E;background:#F1F3F6;padding:24px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px;text-transform:capitalize}
nav a{margin-right:12px;color:#4A5261}
.pair{display:grid;grid-template-columns:120px 1fr 1fr;gap:12px;align-items:start;margin:8px 0 16px}
.lbl{color:#4A5261;padding-top:22px}.cap{font-size:12px;color:#6B7385;margin-bottom:4px}
.col img{width:100%;height:auto;border:1px solid #C3C9D3;border-radius:4px;background:#fff;display:block}
.w390 .col{max-width:390px}.none{padding:24px;color:#6B7385;border:1px dashed #C3C9D3;border-radius:4px}
</style></head><body><h1>Killer Queen design: before and after</h1>
<p>Before: the app as audited in D1 (<code>docs/design/before</code>). After: the design overhaul through D9, after the design-critic rounds (<code>docs/design/after</code>). Full-page screenshots at 1440 and 390 px, light and dark; click an image for full size.</p>
<nav>${routes.map((r) => `<a href="#${r}">${r.replace(/-/g, ' ')}</a>`).join('')}</nav>${body}</body></html>`;
fs.writeFileSync(path.join(root, 'compare.html'), html);
console.log(`compare.html: ${routes.length} screens, ${before.size} before and ${after.size} after images`);
