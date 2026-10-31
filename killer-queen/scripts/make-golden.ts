/**
 * Regenerate tests/golden/journal.json. Run only when the engine's state
 * shape changes on purpose, and explain the new hash in docs/BUILD_LOG.md.
 */
import { writeFileSync } from 'node:fs';
import { Engine, FakeClock, Venue, stateHash, type Command } from '../src/engine/index.js';

const commands: Command[] = [];
const venue = new Venue({ engine: new Engine(), clock: new FakeClock(1_700_000_000_000), journal: { append: (_s, c) => commands.push(structuredClone(c)) } });
const ok = (r: { ok: boolean; code?: string; error?: string }) => {
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
};
ok(venue.apply({ type: 'createAccount', id: 'house', name: 'House', kind: 'system', role: 'house', org: 'Killer Queen', keyHash: null, startingCash: 0 }));
ok(venue.apply({ type: 'createAccount', id: 'mm', name: 'MM', kind: 'system', role: 'market_maker', org: 'Killer Queen', keyHash: null, startingCash: 10_000_000 }));
ok(venue.apply({ type: 'createAccount', id: 'cust', name: 'Customer', kind: 'human', role: 'customer', org: 'Example', keyHash: null, startingCash: 0 }));
ok(venue.apply({ type: 'createAccount', id: 'alice', name: 'Alice', kind: 'human', role: 'trader', org: '', keyHash: null, startingCash: 100_000 }));
ok(venue.apply({ type: 'createAccount', id: 'botty', name: 'Botty', kind: 'agent', role: 'trader', org: 'Indie', keyHash: null, startingCash: 100_000 }));
ok(venue.apply({ type: 'deposit', account: 'alice', amount: 100_000, reason: 'faucet' }));
ok(venue.apply({ type: 'upsertExecutor', id: 'codex', name: 'Codex', org: 'OpenAI', version: '0.48.0' }));
ok(venue.apply({ type: 'upsertExecutor', id: 'claude-code', name: 'Claude Code', org: 'Anthropic', version: '2.1.0' }));
ok(venue.apply({ type: 'createTask', id: 'tsk_g', customer: 'cust', title: 'Golden', prompt: 'p', repo: 'r', commit: 'c', testCommand: 'npm test', candidateAgents: ['codex', 'claude-code'], tradingWindowMs: 60_000 }));
ok(venue.apply({ type: 'placeOrder', account: 'mm', market: 'tsk_g:codex', side: 'yes', action: 'buy', orderType: 'limit', price: 46, quantity: 30 }));
ok(venue.apply({ type: 'placeOrder', account: 'mm', market: 'tsk_g:codex', side: 'no', action: 'buy', orderType: 'limit', price: 46, quantity: 30 }));
ok(venue.apply({ type: 'placeOrder', account: 'alice', market: 'tsk_g:codex', side: 'yes', action: 'buy', orderType: 'limit', price: 60, quantity: 10 }));
ok(venue.apply({ type: 'placeOrder', account: 'botty', market: 'tsk_g:codex', side: 'no', action: 'buy', orderType: 'limit', price: 60, quantity: 5 }));
ok(venue.apply({ type: 'placeOrder', account: 'alice', market: 'tsk_g:codex', side: 'yes', action: 'sell', orderType: 'limit', price: 50, quantity: 4 }));
ok(venue.apply({ type: 'placeOrder', account: 'botty', market: 'tsk_g:claude-code', side: 'yes', action: 'buy', orderType: 'market', quantity: 7 }));
ok(venue.apply({ type: 'placeOrder', account: 'alice', market: 'tsk_g:claude-code', side: 'no', action: 'buy', orderType: 'limit', price: 70, quantity: 7, tif: 'ioc' }));
ok(venue.apply({ type: 'comment', account: 'botty', market: 'tsk_g:codex', text: 'Easy task.', probability: 61 }));
const o = venue.apply({ type: 'placeOrder', account: 'alice', market: 'tsk_g:claude-code', side: 'yes', action: 'buy', orderType: 'limit', price: 33, quantity: 3 });
ok(o);
ok(venue.apply({ type: 'cancelOrder', account: 'alice', orderId: (o as { data: { order: { id: string } } }).data.order.id }));
ok(venue.apply({ type: 'closeTask', taskId: 'tsk_g' }));
ok(venue.apply({ type: 'decide', taskId: 'tsk_g', executorId: 'codex', by: 'cust' }));
ok(venue.apply({ type: 'settle', taskId: 'tsk_g', outcome: 'passed', log: 'ok', runId: 'golden-run' }));
const hash = stateHash(venue.engine.state);
writeFileSync(new URL('../tests/golden/journal.json', import.meta.url), JSON.stringify({ hash, commands }, null, 2) + '\n');
console.log('golden hash', hash, 'commands', commands.length);
