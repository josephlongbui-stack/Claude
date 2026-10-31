/**
 * Screenshots of every route at 1440x900 and 390x844, light and dark, into OUT as <route>-<width>-<theme>.png,
 * plus signed-out views and an empty exchange; reports horizontal scroll and page errors.
 *   BASE=http://localhost:3777 EMPTY_BASE=http://localhost:3779 OUT=docs/design/after node scripts/design-shots.cjs
 * Needs Playwright with Chromium on the machine (not a dependency).
 */
const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE, emptyBase = process.env.EMPTY_BASE, out = process.env.OUT;
  const api = async (path, opts = {}) => {
    const r = await fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
    const j = await r.json();
    if (!r.ok) throw new Error(`${path}: ${JSON.stringify(j)}`);
    return j;
  };
  const tasks = (await api('/api/tasks')).tasks;
  const open = tasks.find((t) => t.task.status === 'open');
  const done = tasks.find((t) => t.task.status === 'resolved' && t.markets.some((m) => m.outcome === 'passed' || m.outcome === 'failed'));
  const trader = await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name: 'Ada Shotwell', role: 'trader', kind: 'human', org: 'Indie' }) });
  if (open) {
    await api('/api/orders', { method: 'POST', headers: { authorization: `Bearer ${trader.apiKey}` }, body: JSON.stringify({ marketId: open.markets[0].marketId, side: 'yes', action: 'buy', type: 'market', quantity: 12 }) });
    const other = open.markets[1] || open.markets[0];
    await api('/api/orders', { method: 'POST', headers: { authorization: `Bearer ${trader.apiKey}` }, body: JSON.stringify({ marketId: other.marketId, side: 'no', action: 'buy', type: 'limit', price: 20, quantity: 10 }) }).catch(() => undefined);
  }
  const openM = open ? open.markets[0].marketId : null;
  const doneM = done ? (done.markets.find((m) => m.outcome === 'passed' || m.outcome === 'failed') || done.markets[0]).marketId : null;
  const shots = [
    ['arena', '#/'], open && ['task-open', `#/task/${open.task.id}`], done && ['task-settled', `#/task/${done.task.id}`],
    openM && ['market-open', `#/market/${encodeURIComponent(openM)}`], doneM && ['market-settled', `#/market/${encodeURIComponent(doneM)}`],
    ['portfolio', '#/portfolio'], ['leaderboard', '#/leaderboard'], ['agents', '#/agents'], ['submit', '#/submit'],
    ['account', '#/account'], ['kitchen-sink', '#/kitchen-sink'], ['error-market', '#/market/does-not-exist'],
  ].filter(Boolean);
  const signedOut = [['signed-out-arena', '#/'], openM && ['signed-out-market', `#/market/${encodeURIComponent(openM)}`], ['signed-out-portfolio', '#/portfolio'], ['signin', '#/signin']].filter(Boolean);
  const browser = await chromium.launch();
  const problems = [];
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${theme}/${width}: page error ${e.message}`));
    const shoot = async (name, url) => {
      await page.goto(url);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${out}/${name}-${width}-${theme}.png`, fullPage: true });
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw > cw + 1) problems.push(`${name} ${width}/${theme}: horizontal scroll ${sw}>${cw}`);
    };
    await page.goto(`${base}/#/account`);
    await page.evaluate(([t, k]) => { localStorage.setItem('kq.theme', t); localStorage.setItem('kq.apiKey', k); }, [theme, trader.apiKey]);
    await page.reload();
    for (const [n, h] of shots) await shoot(n, `${base}/${h}`);
    await page.evaluate(() => localStorage.removeItem('kq.apiKey'));
    await page.reload();
    for (const [n, h] of signedOut) await shoot(n, `${base}/${h}`);
    if (emptyBase) {
      await page.goto(`${emptyBase}/#/`);
      await page.evaluate((t) => localStorage.setItem('kq.theme', t), theme);
      await page.reload();
      await shoot('empty-arena', `${emptyBase}/#/`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(problems.length ? problems.join('\n') : 'no layout problems or page errors');
})().catch((e) => { console.error('SHOTS FAILED', e); process.exit(1); });
