/**
 * D8 accessibility sweep: axe-core on every route in light and dark, a reflow check at 320 and 720 px
 * (200% zoom stand-ins), and a keyboard walk through the order ticket.
 *   BASE=http://localhost:3777 node scripts/a11y-sweep.cjs [--json out.json]
 * Needs Playwright with Chromium on the machine (not a dependency); @axe-core/playwright is a dev dependency.
 */
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('node:fs');

const base = process.env.BASE || 'http://localhost:3000';
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const api = async (path, opts = {}) => {
  const r = await fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(j)}`);
  return j;
};

(async () => {
  const tasks = (await api('/api/tasks')).tasks;
  const open = tasks.find((t) => t.task.status === 'open');
  const done = tasks.find((t) => t.task.status === 'resolved');
  const closed = tasks.find((t) => t.task.status === 'closed');
  const trader = await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name: 'Axe Trader', role: 'trader', kind: 'human', org: '' }) });
  if (open) await api('/api/orders', { method: 'POST', headers: { authorization: `Bearer ${trader.apiKey}` }, body: JSON.stringify({ marketId: open.markets[0].marketId, side: 'yes', action: 'buy', type: 'market', quantity: 5 }) });
  const routes = [
    ['arena', '#/'],
    ['task-open', open ? `#/task/${open.task.id}` : null],
    ['task-settled', done ? `#/task/${done.task.id}` : null],
    ['task-closed', closed ? `#/task/${closed.task.id}` : null],
    ['market-open', open ? `#/market/${encodeURIComponent(open.markets[0].marketId)}` : null],
    ['market-settled', done ? `#/market/${encodeURIComponent((done.markets.find((m) => m.outcome === 'passed' || m.outcome === 'failed') || done.markets[0]).marketId)}` : null],
    ['portfolio', '#/portfolio'],
    ['leaderboard', '#/leaderboard'],
    ['agents', '#/agents'],
    ['submit', '#/submit'],
    ['account', '#/account'],
    ['terms', '#/terms'],
    ['contact', '#/contact'],
    ['not-found', '#/nothing-here'],
    ['kitchen-sink', '#/kitchen-sink'],
  ].filter(([, h]) => h);
  const signedOut = [['signed-out-arena', '#/'], ['signin', '#/signin'], ['signed-out-market', routes.find(([n]) => n === 'market-open')?.[1]]].filter(([, h]) => h);
  const browser = await chromium.launch();
  const results = { violations: [], reflow: [], keyboard: [] };
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    const page = await ctx.newPage();
    await page.goto(`${base}/#/account`);
    await page.evaluate(([k, t]) => { localStorage.setItem('kq.apiKey', k); localStorage.setItem('kq.theme', t); }, [trader.apiKey, theme]);
    await page.reload();
    const run = async (name, hash) => {
      await page.goto(`${base}/${hash}`);
      await page.waitForTimeout(1200);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      for (const v of r.violations) results.violations.push({ route: name, theme, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n').slice(0, 3).join(' ') })), count: v.nodes.length });
    };
    for (const [n, h] of routes) await run(n, h);
    await page.evaluate(() => localStorage.removeItem('kq.apiKey'));
    await page.reload();
    for (const [n, h] of signedOut) await run(n, h);
    await ctx.close();
  }
  // Reflow: 320 px (WCAG 1.4.10) and 720 px (1440 at 200%), signed in, light.
  for (const width of [320, 720]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(`${base}/#/account`);
    await page.evaluate((k) => localStorage.setItem('kq.apiKey', k), trader.apiKey);
    await page.reload();
    for (const [n, h] of routes) {
      await page.goto(`${base}/${h}`);
      await page.waitForTimeout(900);
      const [sw, cw, wide] = await page.evaluate(() => {
        const w = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(e).position !== 'fixed');
        return [document.documentElement.scrollWidth, document.documentElement.clientWidth, w.slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`)];
      });
      if (sw > cw + 1) results.reflow.push({ route: n, width, scrollWidth: sw, clientWidth: cw, wide });
    }
    await ctx.close();
  }
  // Keyboard: the order ticket from the Yes button to the submit, with Space and Enter.
  if (open) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/#/account`);
    await page.evaluate((k) => localStorage.setItem('kq.apiKey', k), trader.apiKey);
    await page.goto(`${base}/${routes.find(([n]) => n === 'market-open')[1]}`);
    await page.reload();
    await page.getByTestId('ticket').waitFor();
    await page.getByTestId('tab-buy').focus();
    const order = [];
    for (let i = 0; i < 12; i++) {
      order.push(await page.evaluate(() => { const a = document.activeElement; return `${a.tagName.toLowerCase()}${a.dataset.testid ? '#' + a.dataset.testid : a.id ? '#' + a.id : ''}`; }));
      await page.keyboard.press('Tab');
    }
    results.keyboard.push({ step: 'tab order from Buy tab', order });
    await page.getByTestId('side-no').focus();
    await page.keyboard.press('Space');
    results.keyboard.push({ step: 'Space on No picks No', pressed: await page.getByTestId('side-no').getAttribute('aria-pressed') });
    await page.getByTestId('type-market').focus();
    await page.keyboard.press('Space');
    results.keyboard.push({ step: 'Space on the market checkbox', checked: await page.getByTestId('type-market').isChecked() });
    await page.getByTestId('quantity').fill('3');
    await page.getByTestId('quantity').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const toast = await page.getByTestId('toast').last().innerText().catch(() => 'no toast');
    results.keyboard.push({ step: 'Enter in Contracts submits', toast });
    await ctx.close();
  }
  await browser.close();
  // The harness account closes itself (D35) so it never shows on the leaderboard.
  await api('/api/me/delete', { method: 'POST', headers: { authorization: `Bearer ${trader.apiKey}` } }).catch(() => undefined);
  const byRule = {};
  for (const v of results.violations) (byRule[v.id] ??= []).push(`${v.route}/${v.theme} ×${v.count}`);
  console.log(`axe violations: ${results.violations.length} (${Object.keys(byRule).length} rules)`);
  for (const [id, where] of Object.entries(byRule)) console.log(`  ${id}: ${where.join(', ')}`);
  console.log(`reflow problems: ${results.reflow.length}`);
  for (const r of results.reflow) console.log(`  ${r.route} @${r.width}: ${r.scrollWidth}>${r.clientWidth} ${r.wide.join(', ')}`);
  for (const k of results.keyboard) console.log('  keyboard:', JSON.stringify(k));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
})().catch((e) => { console.error('SWEEP FAILED', e); process.exit(1); });
