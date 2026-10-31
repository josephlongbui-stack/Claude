import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentTrader, AnthropicAdapter, GeminiAdapter, InProcessClient, LlmEstimator, OpenAiAdapter, enabledBots, parseEstimate } from '../../src/bots/index.js';
import { loadConfig } from '../../src/server/config.js';
import { packet } from '../../src/engine/index.js';
import { seedExchange } from '../helpers/fixtures.js';

function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }): typeof fetch & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init: init ?? {} });
    const r = handler(u, init ?? {});
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

describe('LLM adapters', () => {
  it('Anthropic: builds a Messages API request and parses the text reply', async () => {
    const f = seedExchange();
    const p = packet(f.venue.engine, f.markets[1]!);
    const adapter = new AnthropicAdapter('sk-ant-test', 'claude-test-model');
    const req = adapter.buildRequest(p);
    assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(req.headers['x-api-key'], 'sk-ant-test');
    assert.equal(req.headers['anthropic-version'], '2023-06-01');
    const body = req.body as { model: string; max_tokens: number; system: string; messages: { role: string; content: string }[] };
    assert.equal(body.model, 'claude-test-model');
    assert.ok(body.max_tokens > 0);
    assert.match(body.system, /JSON only/);
    assert.equal(body.messages[0]!.role, 'user');
    assert.match(body.messages[0]!.content, /"testCommand": "pytest tests\/api\/test_cart.py"/);
    const fetchImpl = fakeFetch(() => ({ status: 200, body: { content: [{ type: 'text', text: '{"probability": 63, "rationale": "Narrow pytest file."}' }] } }));
    const est = await new LlmEstimator(adapter, { fetchImpl }).estimate(p);
    assert.deepEqual(est, { probability: 63, rationale: 'Narrow pytest file.' });
    assert.equal(fetchImpl.calls[0]!.init.method, 'POST');
    assert.equal(JSON.parse(fetchImpl.calls[0]!.init.body as string).model, 'claude-test-model');
  });

  it('OpenAI: chat completions with json_object format; parses choices[0].message.content', async () => {
    const f = seedExchange();
    const p = packet(f.venue.engine, f.markets[0]!);
    const adapter = new OpenAiAdapter('sk-test', 'gpt-test-model');
    const req = adapter.buildRequest(p);
    assert.equal(req.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer sk-test');
    const body = req.body as { model: string; response_format: { type: string }; messages: { role: string }[] };
    assert.equal(body.model, 'gpt-test-model');
    assert.equal(body.response_format.type, 'json_object');
    assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
    const fetchImpl = fakeFetch(() => ({ status: 200, body: { choices: [{ message: { content: '```json\n{"probability": "72%", "rationale": "Easy."}\n```' } }] } }));
    const est = await new LlmEstimator(adapter, { fetchImpl }).estimate(p);
    assert.deepEqual(est, { probability: 72, rationale: 'Easy.' });
  });

  it('Gemini: generateContent with JSON mime type; parses candidates[0].content.parts', async () => {
    const f = seedExchange();
    const p = packet(f.venue.engine, f.markets[0]!);
    const adapter = new GeminiAdapter('g-test', 'gemini-test-model');
    const req = adapter.buildRequest(p);
    assert.equal(req.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
    assert.equal(req.headers['x-goog-api-key'], 'g-test');
    const body = req.body as { contents: { parts: { text: string }[] }[]; generationConfig: { responseMimeType: string } };
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.match(body.contents[0]!.parts[0]!.text, /Task packet/);
    const fetchImpl = fakeFetch(() => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'Sure: {"probability": 0.41, "rationale": "Hmm"} ok' }] } }] } }));
    const est = await new LlmEstimator(adapter, { fetchImpl }).estimate(p);
    assert.deepEqual(est, { probability: 41, rationale: 'Hmm' });
  });

  it('invalid JSON, missing probability, HTTP errors and network failures yield null and never throw', async () => {
    const f = seedExchange();
    const p = packet(f.venue.engine, f.markets[0]!);
    const adapter = new OpenAiAdapter('k', 'm');
    assert.equal(parseEstimate('not json'), null);
    assert.equal(parseEstimate('{"rationale": "no number"}'), null);
    assert.equal(parseEstimate('{"probability": "high"}'), null);
    assert.equal(parseEstimate(null), null);
    assert.deepEqual(parseEstimate('{"probability": 150, "rationale": ""}'), { probability: 99, rationale: 'no rationale given' });
    assert.deepEqual(parseEstimate('{"probability": 0}'), { probability: 1, rationale: 'no rationale given' });
    const bad = fakeFetch(() => ({ status: 200, body: { choices: [{ message: { content: 'I think about 60%.' } }] } }));
    assert.equal(await new LlmEstimator(adapter, { fetchImpl: bad }).estimate(p), null);
    const http = fakeFetch(() => ({ status: 429, body: { error: 'rate limited' } }));
    assert.equal(await new LlmEstimator(adapter, { fetchImpl: http }).estimate(p), null);
    const boom = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    assert.equal(await new LlmEstimator(adapter, { fetchImpl: boom }).estimate(p), null);
    // and a trader built on it skips the market without crashing
    const t = new AgentTrader('botty', new InProcessClient(f.venue, 'botty'), new LlmEstimator(adapter, { fetchImpl: bad }));
    await t.tick();
    assert.equal(f.venue.engine.state.orders.size, 0);
  });

  it('an Anthropic-org trader cannot order on a Claude Code market, but trades Codex', async () => {
    const f = seedExchange();
    const fetchImpl = fakeFetch(() => ({ status: 200, body: { content: [{ type: 'text', text: '{"probability": 90, "rationale": "Confident."}' }] } }));
    const est = new LlmEstimator(new AnthropicAdapter('k', 'm'), { fetchImpl });
    // the staffer account has org Anthropic, like the llm-anthropic account boot creates
    const t = new AgentTrader('llm-anthropic', new InProcessClient(f.venue, 'anthropic-staffer'), est);
    const { MarketMaker } = await import('../../src/bots/index.js');
    await new MarketMaker(new InProcessClient(f.venue, 'mm')).tick();
    await t.tick();
    const claude = f.markets[0]!;
    const codex = f.markets[1]!;
    assert.equal(fetchImpl.calls.length, 1, 'the packet for the blocked market is never sent to the model');
    assert.equal([...f.venue.engine.state.orders.values()].some((o) => o.account === 'anthropic-staffer' && o.market === claude), false);
    assert.ok(f.venue.engine.position(codex, 'anthropic-staffer')!.yes > 0);
  });

  it('a lab trader is on only when both its key and its model are set', () => {
    assert.deepEqual(enabledBots(loadConfig({ HOUSE_BOTS: 'mm,sim,llm' })), ['mm', 'sim']);
    assert.deepEqual(enabledBots(loadConfig({ HOUSE_BOTS: 'llm', ANTHROPIC_API_KEY: 'k' })), []);
    assert.deepEqual(enabledBots(loadConfig({ HOUSE_BOTS: 'llm', ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'm', GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gm' })), ['llm:anthropic', 'llm:gemini']);
    assert.deepEqual(enabledBots(loadConfig({ HOUSE_BOTS: 'mm,sim', OPENAI_API_KEY: 'k', OPENAI_MODEL: 'm' })), ['mm', 'sim']);
  });
});
