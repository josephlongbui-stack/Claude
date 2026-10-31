/**
 * LLM trader adapters: Anthropic Messages API, OpenAI Chat Completions,
 * Gemini generateContent. Each builds one request from a task packet and
 * parses the reply into { probability, rationale }. Model ids come from
 * environment variables (ANTHROPIC_MODEL, OPENAI_MODEL, GEMINI_MODEL); a lab's
 * trader is off unless both its key and its model are set.
 */
import type { Packet } from '../../engine/index.js';
import type { Estimate, Estimator } from '../simTrader.js';

export type Lab = 'anthropic' | 'openai' | 'gemini';

export interface LlmRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface LlmAdapter {
  readonly lab: Lab;
  /** The org that makes this lab's coding agent; the trader's account org. */
  readonly org: string;
  readonly model: string;
  buildRequest(packet: Packet): LlmRequest;
  /** The model's text reply, or null when the response has no usable text. */
  extractText(response: unknown): string | null;
}

export const LAB_ORGS: Record<Lab, string> = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google' };

export const SYSTEM_PROMPT = [
  'You are a forecaster on Killer Queen, a play-money exchange where traders price whether a coding agent will pass a task\'s tests.',
  'You will be given a task packet: the prompt the agent receives, the repo and commit, the test command that defines success, and the agent\'s public track record.',
  'Estimate the probability (1-99, integer percent) that running this agent once on this task makes the test command exit 0.',
  'Consider: how specific the prompt is, how many files it likely touches, whether the tests are narrow or broad, the language and framework, and the agent\'s record.',
  'Reply with JSON only, no prose and no code fences: {"probability": <integer 1-99>, "rationale": "<one or two sentences>"}',
].join(' ');

export function userPrompt(packet: Packet): string {
  return `Task packet:\n${JSON.stringify(packet, null, 2)}\n\nReply with the JSON object only.`;
}

/** Parse `{ probability, rationale }` from a model reply; tolerant of fences and surrounding text. */
export function parseEstimate(text: string | null): Estimate | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c) as { probability?: unknown; rationale?: unknown };
      if (!obj || typeof obj !== 'object') continue;
      const raw = obj.probability;
      let p: number | null = null;
      if (typeof raw === 'number') p = raw;
      else if (typeof raw === 'string' && /^\d+(\.\d+)?%?$/.test(raw.trim())) p = Number(raw.trim().replace('%', ''));
      if (p === null || !Number.isFinite(p)) continue;
      if (p > 0 && p < 1) p = p * 100; // a model that answered with a fraction
      const probability = Math.min(99, Math.max(1, Math.round(p)));
      const rationale = typeof obj.rationale === 'string' && obj.rationale.trim() ? obj.rationale.trim().slice(0, 2000) : 'no rationale given';
      return { probability, rationale };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export class AnthropicAdapter implements LlmAdapter {
  readonly lab = 'anthropic' as const;
  readonly org = LAB_ORGS.anthropic;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}
  buildRequest(packet: Packet): LlmRequest {
    return {
      url: `${this.baseUrl}/v1/messages`,
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: { model: this.model, max_tokens: 400, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt(packet) }] },
    };
  }
  extractText(response: unknown): string | null {
    const r = response as { content?: { type?: string; text?: string }[] };
    const parts = Array.isArray(r?.content) ? r.content : [];
    const text = parts.filter((p) => p && p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n');
    return text || null;
  }
}

export class OpenAiAdapter implements LlmAdapter {
  readonly lab = 'openai' as const;
  readonly org = LAB_ORGS.openai;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = 'https://api.openai.com',
  ) {}
  buildRequest(packet: Packet): LlmRequest {
    return {
      url: `${this.baseUrl}/v1/chat/completions`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: {
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(packet) },
        ],
      },
    };
  }
  extractText(response: unknown): string | null {
    const r = response as { choices?: { message?: { content?: unknown } }[] };
    const c = r?.choices?.[0]?.message?.content;
    return typeof c === 'string' && c ? c : null;
  }
}

export class GeminiAdapter implements LlmAdapter {
  readonly lab = 'gemini' as const;
  readonly org = LAB_ORGS.gemini;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = 'https://generativelanguage.googleapis.com',
  ) {}
  buildRequest(packet: Packet): LlmRequest {
    return {
      url: `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt(packet) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      },
    };
  }
  extractText(response: unknown): string | null {
    const r = response as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] };
    const parts = r?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('\n');
    return text || null;
  }
}

export interface LlmEstimatorOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log?: (msg: string) => void;
}

/** Calls the adapter's API; any failure (network, status, bad JSON, missing probability) yields null, never a throw. */
export class LlmEstimator implements Estimator {
  constructor(
    readonly adapter: LlmAdapter,
    private readonly opts: LlmEstimatorOptions = {},
  ) {}

  async estimate(packet: Packet): Promise<Estimate | null> {
    const req = this.adapter.buildRequest(packet);
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
      });
      if (!res.ok) {
        this.opts.log?.(`${this.adapter.lab}: HTTP ${res.status}`);
        return null;
      }
      const json: unknown = await res.json();
      const estimate = parseEstimate(this.adapter.extractText(json));
      if (!estimate) this.opts.log?.(`${this.adapter.lab}: reply had no usable probability`);
      return estimate;
    } catch (e) {
      this.opts.log?.(`${this.adapter.lab}: ${(e as Error).message}`);
      return null;
    }
  }
}

export function adapterFor(lab: Lab, apiKey: string, model: string): LlmAdapter {
  switch (lab) {
    case 'anthropic':
      return new AnthropicAdapter(apiKey, model);
    case 'openai':
      return new OpenAiAdapter(apiKey, model);
    case 'gemini':
      return new GeminiAdapter(apiKey, model);
  }
}
