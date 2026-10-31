/** Runner service entry point. Env: KQ_URL, RUNNER_SECRET, RUNNER_DRIVER=docker|fake, RUNNER_POLL_MS, provider keys. */
import { readFileSync } from 'node:fs';
import { DockerDriver } from './dockerDriver.js';
import { ExchangeClient } from './exchange.js';
import { FakeDriver } from './fakeDriver.js';
import { Runner } from './runner.js';
import type { AgentTemplate } from './types.js';

const url = process.env.KQ_URL ?? 'http://localhost:3000';
const secret = process.env.RUNNER_SECRET ?? '';
if (!secret) {
  console.error('RUNNER_SECRET is required');
  process.exit(2);
}
const agents = JSON.parse(readFileSync(new URL('../agents.json', import.meta.url), 'utf8')) as Record<string, AgentTemplate | string>;
delete agents['_comment'];
const driver =
  (process.env.RUNNER_DRIVER ?? 'docker') === 'fake'
    ? new FakeDriver(() => ({ testExitCodes: [1, 1, 1, 0] }))
    : new DockerDriver({
        image: process.env.RUNNER_IMAGE ?? 'kq-runner:latest',
        proxyImage: process.env.RUNNER_PROXY_IMAGE ?? 'kq-egress-proxy:latest',
        registries: (process.env.RUNNER_REGISTRIES ?? 'github.com,registry.npmjs.org,pypi.org,files.pythonhosted.org,proxy.golang.org,sum.golang.org,crates.io,static.crates.io').split(','),
        log: (m) => console.log(`[docker] ${m}`),
      });
const providerKeys: Record<string, string> = {};
for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) if (process.env[k]) providerKeys[k] = process.env[k]!;
const runner = new Runner(new ExchangeClient(url, secret), driver, {
  agents: agents as Record<string, AgentTemplate>,
  providerKeys,
  limits: {
    wallClockMs: Number(process.env.RUN_WALL_CLOCK_MS ?? 30 * 60_000),
    testTimeoutMs: Number(process.env.TEST_TIMEOUT_MS ?? 10 * 60_000),
    prepareTimeoutMs: Number(process.env.PREPARE_TIMEOUT_MS ?? 5 * 60_000),
    infraRetries: Number(process.env.INFRA_RETRIES ?? 2),
    tokenBudget: Number(process.env.RUN_TOKEN_BUDGET ?? 2_000_000),
  },
  log: (m) => console.log(`[runner] ${m}`),
});
const pollMs = Number(process.env.RUNNER_POLL_MS ?? 5_000);
console.log(`[runner] ${driver.name} driver, polling ${url} every ${pollMs} ms`);
let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));
while (!stopping) {
  try {
    const done = await runner.poll();
    for (const r of done) console.log(`[runner] ${r.job.kind} ${r.job.taskId}: ${r.outcome ?? r.results?.join(',')} → ${r.posted?.status ?? 'not posted'}`);
  } catch (e) {
    console.error(`[runner] poll failed: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, pollMs));
}
