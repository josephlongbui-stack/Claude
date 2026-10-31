/**
 * Live updates (prompt 3.1): every journaled command becomes zero or more
 * events (book, trade, task, thesis, trading). Ids are `<command seq>-<n>`,
 * so a client that reconnects with Last-Event-ID gets exactly the events it
 * missed, in order, from a bounded ring buffer; a client too far behind gets
 * a `reset` and refetches.
 */
import type { Response } from 'express';
import { bookLevels, quote, type Command, type EngineResult, type Venue } from '../engine/index.js';

export type StreamEventType = 'book' | 'trade' | 'task' | 'thesis' | 'trading' | 'reset';

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  seq: number;
  data: Record<string, unknown>;
  /** The SSE frame, serialized once per event and shared by every subscriber (load test 6.1). */
  frame?: string;
}

export function frameOf(e: StreamEvent): string {
  return (e.frame ??= `id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
}

export interface EventFilter {
  markets?: Set<string>;
  tasks?: Set<string>;
  /** 5.4: events of tasks the viewer may not see are never sent. */
  canSeeTask?: (taskId: string) => boolean;
}

export function parseEventId(id: string | undefined | null): number | null {
  if (!id) return null;
  const m = /^(\d+)-(\d+)$/.exec(id.trim());
  return m ? Number(m[1]) * 1000 + Number(m[2]) : null;
}

export class EventHub {
  private readonly buffer: StreamEvent[] = [];
  private readonly subscribers = new Set<(e: StreamEvent) => void>();
  private readonly streams = new Set<Response>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly venue: Venue,
    private readonly bufferSize = 5000,
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.venue.onApplied((cmd, result) => {
      for (const e of this.derive(cmd, result)) this.publish(e);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const res of this.streams) res.end();
    this.streams.clear();
    this.subscribers.clear();
  }

  get size(): number {
    return this.buffer.length;
  }

  /** Events after `lastId`; `reset` when the buffer no longer reaches back that far. */
  since(lastId: string | null | undefined): { events: StreamEvent[]; reset: boolean } {
    const key = parseEventId(lastId);
    if (key === null) return { events: [], reset: false };
    const oldest = this.buffer[0];
    if (!oldest) return { events: [], reset: false };
    const oldestKey = oldest.seq * 1000;
    // The client's id must be at or after the oldest buffered command (or exactly the one before it).
    if (key < oldestKey - 1 && key < oldestKey) {
      const prevSeqComplete = Math.floor(key / 1000) === oldest.seq - 1;
      if (!prevSeqComplete) return { events: [], reset: true };
    }
    return { events: this.buffer.filter((e) => parseEventId(e.id)! > key), reset: false };
  }

  subscribe(fn: (e: StreamEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /** Attach an SSE response: catch-up, then live. */
  attach(res: Response, lastId: string | null, filter: EventFilter, opts: { heartbeatMs?: number } = {}): void {
    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    const matches = (e: StreamEvent): boolean => {
      if (e.type === 'reset' || e.type === 'trading') return true;
      const m = e.data.marketId as string | undefined;
      const t = e.data.taskId as string | undefined;
      if (t && filter.canSeeTask && !filter.canSeeTask(t)) return false;
      if (filter.markets && m && !filter.markets.has(m)) return false;
      if (filter.tasks && t && !filter.tasks.has(t)) return false;
      if (filter.markets && !m && filter.tasks === undefined) return false;
      return true;
    };
    const send = (e: StreamEvent) => {
      if (!matches(e)) return;
      res.write(frameOf(e));
    };
    const catchUp = this.since(lastId);
    if (catchUp.reset) res.write(`event: reset\ndata: ${JSON.stringify({ reason: 'last event id is older than the buffer; refetch' })}\n\n`);
    for (const e of catchUp.events) send(e);
    const unsub = this.subscribe(send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), opts.heartbeatMs ?? 15_000);
    this.streams.add(res);
    const cleanup = () => {
      clearInterval(heartbeat);
      unsub();
      this.streams.delete(res);
    };
    res.on('close', cleanup);
    res.on('error', cleanup);
  }

  private publish(e: StreamEvent): void {
    this.buffer.push(e);
    while (this.buffer.length > this.bufferSize) this.buffer.shift();
    for (const fn of this.subscribers) {
      try {
        fn(e);
      } catch {
        /* a dead subscriber must not break the others */
      }
    }
  }

  private bookEvent(marketId: string, seq: number, n: number): StreamEvent {
    const m = this.venue.engine.market(marketId)!;
    return { id: `${seq}-${n}`, type: 'book', seq, data: { marketId, taskId: m.taskId, status: m.status, quote: quote(this.venue.engine, marketId), book: bookLevels(this.venue.engine, marketId) } };
  }

  private taskEvent(taskId: string, seq: number, n: number): StreamEvent {
    const t = this.venue.engine.task(taskId)!;
    return {
      id: `${seq}-${n}`,
      type: 'task',
      seq,
      data: {
        taskId,
        status: t.status,
        chosenAgent: t.chosenAgent,
        passed: t.passed,
        rejectedReason: t.rejectedReason,
        closesAt: t.closesAt,
        markets: t.candidateAgents.map((e) => {
          const m = this.venue.engine.market(`${taskId}:${e}`)!;
          return { marketId: m.id, status: m.status, closingPrice: m.closingPrice, settlementPrice: m.settlementPrice, outcome: m.outcome };
        }),
      },
    };
  }

  private derive(cmd: Command, result: EngineResult): StreamEvent[] {
    if (!result.ok) return [];
    const seq = result.seq;
    const out: StreamEvent[] = [];
    let n = 0;
    const next = () => n++;
    switch (cmd.type) {
      case 'placeOrder': {
        const d = result.data as unknown as { order: { market: string }; fills: Record<string, unknown>[] };
        for (const f of d.fills) out.push({ id: `${seq}-${next()}`, type: 'trade', seq, data: { marketId: d.order.market, taskId: this.venue.engine.market(d.order.market)!.taskId, fill: f } });
        out.push(this.bookEvent(d.order.market, seq, next()));
        break;
      }
      case 'cancelOrder': {
        const d = result.data as unknown as { order: { market: string } };
        out.push(this.bookEvent(d.order.market, seq, next()));
        break;
      }
      case 'createTask':
      case 'baseline':
      case 'closeTask':
      case 'decide':
      case 'settle': {
        const taskId = cmd.type === 'createTask' ? (result.data as { task: { id: string } }).task.id : cmd.taskId;
        out.push(this.taskEvent(taskId, seq, next()));
        const t = this.venue.engine.task(taskId)!;
        if (cmd.type !== 'baseline' || t.status === 'open') for (const e of t.candidateAgents) out.push(this.bookEvent(`${taskId}:${e}`, seq, next()));
        break;
      }
      case 'comment': {
        const d = result.data as unknown as { comment: { market: string } & Record<string, unknown> };
        out.push({ id: `${seq}-${next()}`, type: 'thesis', seq, data: { marketId: d.comment.market, taskId: this.venue.engine.market(d.comment.market)!.taskId, comment: d.comment } });
        break;
      }
      case 'pauseTrading':
        out.push({ id: `${seq}-${next()}`, type: 'trading', seq, data: { ...this.venue.engine.state.trading } });
        break;
      default:
        break;
    }
    return out;
  }
}
