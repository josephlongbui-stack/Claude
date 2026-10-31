/**
 * Render the brand PNGs from the wordmark (D5): favicon-32, apple-touch-icon (180),
 * icon-192, icon-512 and the Open Graph image (1200x630). Run once when the mark
 * or the name changes; outputs are committed in src/web/static and copied by build:web.
 *   npx tsx scripts/make-brand-assets.ts   (needs Playwright with Chromium on the machine)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Playwright is build tooling, not a dependency: it resolves from the machine's global install (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<any> } };

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'src/web/static');
const svg = readFileSync(resolve(out, 'favicon.svg'), 'utf8');
const fontCss = ['ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-600-normal.woff2', 'ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2']
  .map((f, i) => `@font-face{font-family:${i === 0 ? '"IBM Plex Sans Condensed"' : '"IBM Plex Sans"'};font-weight:${i === 0 ? 600 : 400};src:url(data:font/woff2;base64,${readFileSync(resolve(root, 'node_modules/@fontsource', f)).toString('base64')}) format("woff2")}`)
  .join('');

const iconPage = (size: number) => `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('width="32" height="32"', `width="${size}" height="${size}"`)}</body></html>`;
const ogPage = `<!doctype html><html><head><style>${fontCss}
body{margin:0;width:1200px;height:630px;background:#F1F3F6;font-family:"IBM Plex Sans",sans-serif;color:#15181E;display:flex;flex-direction:column;justify-content:space-between;padding:72px;box-sizing:border-box}
.mark{display:flex;align-items:center;gap:24px;font-family:"IBM Plex Sans Condensed",sans-serif;font-weight:600;font-size:88px;letter-spacing:-0.01em}
.mark svg{width:96px;height:96px}
.line{font-size:36px;line-height:1.3;max-width:900px;color:#4A5261}
.foot{font-size:24px;color:#6B7385}
.rule{height:2px;background:#C3C9D3;margin:40px 0}
</style></head><body><div><div class="mark">${svg.replace('width="32" height="32"', 'width="96" height="96"')}<span>Killer Queen</span></div><div class="rule"></div><div class="line">Will the coding agent pass the tests? Trade Yes or No before anyone runs it.</div></div><div class="foot">Play money. No cash value.</div></body></html>`;

const browser = await chromium.launch();
for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(iconPage(size));
  writeFileSync(resolve(out, name), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  await page.close();
}
const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await og.setContent(ogPage);
await og.evaluate(() => document.fonts.ready);
writeFileSync(resolve(out, 'og.png'), await og.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));
await browser.close();
console.log(`brand assets written to ${out}`);
