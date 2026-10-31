/**
 * Production-shaped boot: config → journal replay → house accounts → bots →
 * runner → scheduler → HTTP. Everything here is also used by the tests with a
 * fake clock and listen(0).
 */
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { systemClock, taskView, type Clock, type Venue } from '../engine/index.js';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import { Journal, openVenue } from './journal.js';
import { SimulatedRunner } from './runners/simulated.js';
import { ensureExecutors } from './seed.js';
import { EventHub } from './events.js';
import { createLogger } from './log.js';

export const HOUSE_ACCOUNT_ID = 'house';
export const MM_ACCOUNT_ID = 'mm';

export interface BootOptions {
  config?: Config;
  env?: NodeJS.ProcessEnv;
  clock?: Clock;
  /** Listen on this port (0 = ephemeral); false = do not listen. */
  listen?: number | false;
  /** Start setInterval loops (bots, scheduler, runner timers). Tests drive tick() by hand. */
  timers?: boolean;
  publicDir?: string;
  log?: (msg: string) => void;
  /** Bot factories registered by src/bots; boot calls them after accounts exist. */
  bots?: BotFactory[];
  /** Sandbox: register the default executors when none exist (default true). */
  seedExecutors?: boolean;
}

export interface BotHandle {
  name: string;
  tick(): Promise<void> | void;
  stop?(): void;
}
export type BotFactory = (ctx: { venue: Venue; config: Config; clock: Clock; log: (msg: string) => void }) => BotHandle | null;

export interface Booted {
  config: Config;
  venue: Venue;
  journal: Journal;
  clock: Clock;
  app: ReturnType<typeof createApp>;
  server: Server | null;
  url: string | null;
  runner: SimulatedRunner | null;
  bots: BotHandle[];
  events: EventHub;
  /** Auto-close due tasks, auto-decide, then let every bot act once (in order). */
  tick(): Promise<{ closed: string[]; decided: string[] }>;
  stop(): Promise<void>;
}

export async function boot(opts: BootOptions = {}): Promise<Booted> {
  const config = opts.config ?? loadConfig(opts.env ?? process.env);
  if (config.mode === 'live' && config.runner === 'simulated') {
    throw new ConfigError('KQ_MODE=live refuses to start with RUNNER=simulated');
  }
  const clock = opts.clock ?? systemClock;
  const logger = createLogger({ level: config.logLevel === 'silent' ? 'silent' : config.logLevel });
  const log = opts.log ?? ((msg: string) => logger(msg));
  const { venue, journal, replayed } = openVenue(config.dbPath, clock);
  log(`journal ${config.dbPath}: replayed ${replayed} commands`);

  ensureHouseAccounts(venue, config);
  if (config.mode === 'sandbox' && opts.seedExecutors !== false) {
    const n = ensureExecutors(venue);
    if (n) log(`seeded ${n} default executors`);
  }

  const bots: BotHandle[] = [];
  for (const factory of opts.bots ?? []) {
    const handle = factory({ venue, config, clock, log });
    if (handle) bots.push(handle);
  }
  if (bots.length) log(`house bots: ${bots.map((b) => b.name).join(', ')}`);

  let runner: SimulatedRunner | null = null;
  if (config.runner === 'simulated') {
    runner = new SimulatedRunner(venue, clock, {
      delayMs: config.simulatedRunnerDelayMs,
      log,
      ...(opts.timers === false ? { schedule: () => undefined } : {}),
    });
    runner.start();
  }

  const tick = async (): Promise<{ closed: string[]; decided: string[] }> => {
    const closed: string[] = [];
    const decided: string[] = [];
    const now = clock.now();
    for (const t of [...venue.engine.state.tasks.values()]) {
      if (t.status === 'open' && t.closesAt <= now) {
        const r = venue.apply({ type: 'closeTask', taskId: t.id, by: null });
        if (r.ok) closed.push(t.id);
      }
      if (t.status === 'closed' && t.autoDecide) {
        const view = taskView(venue.engine, t.id);
        const rec = view.recommendation;
        const executorId = rec && rec.chance >= t.minimumChance ? rec.executorId : null;
        const r = venue.apply({ type: 'decide', taskId: t.id, executorId, by: null });
        if (r.ok) decided.push(t.id);
      }
    }
    for (const b of bots) {
      try {
        await b.tick();
      } catch (e) {
        log(`bot ${b.name} failed: ${(e as Error).message}`);
      }
    }
    return { closed, decided };
  };

  const timers: NodeJS.Timeout[] = [];
  if (opts.timers !== false) {
    let busy = false;
    timers.push(
      setInterval(() => {
        if (busy) return; // never overlap ticks
        busy = true;
        tick()
          .catch((e) => log(`tick failed: ${(e as Error).message}`))
          .finally(() => {
            busy = false;
          });
      }, config.botTickMs),
    );
  }

  const events = new EventHub(venue, config.eventsBufferSize);
  events.start();
  const app = createApp({ venue, config, clock, events, publicDir: opts.publicDir ?? resolve(process.cwd(), 'public') });
  let server: Server | null = null;
  let url: string | null = null;
  if (opts.listen !== false) {
    const port = opts.listen ?? config.port;
    server = await new Promise<Server>((resolveServer) => {
      const s = app.listen(port, () => resolveServer(s));
    });
    const addr = server.address();
    url = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : null;
    log(`listening on ${url} (${config.mode}, runner ${config.runner})`);
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    for (const t of timers) clearInterval(t);
    runner?.stop();
    for (const b of bots) b.stop?.();
    events.stop();
    if (server) {
      await new Promise<void>((r) => {
        server!.close(() => r());
        server!.closeAllConnections();
      });
    }
    journal.close();
  };

  return { config, venue, journal, clock, app, server, url, runner, bots, events, tick, stop };
}

/** House fee account and the market maker exist on every boot (idempotent). */
export function ensureHouseAccounts(venue: Venue, config: Config): void {
  const e = venue.engine;
  if (!e.account(HOUSE_ACCOUNT_ID)) {
    const r = venue.apply({ type: 'createAccount', id: HOUSE_ACCOUNT_ID, name: 'House', kind: 'system', role: 'house', org: 'Killer Queen', keyHash: null, startingCash: 0 });
    if (!r.ok) throw new Error(`cannot create house account: ${r.error}`);
  }
  if (config.houseBots.has('mm') && !e.account(MM_ACCOUNT_ID)) {
    const r = venue.apply({ type: 'createAccount', id: MM_ACCOUNT_ID, name: 'House market maker', kind: 'system', role: 'market_maker', org: 'Killer Queen', keyHash: null, startingCash: config.mmCashCents });
    if (!r.ok) throw new Error(`cannot create market maker account: ${r.error}`);
  }
}
