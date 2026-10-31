/**
 * The Venue is the one door into the engine: it stamps time from an
 * injected clock, applies the command, and journals it atomically (D21).
 * HTTP handlers, bots and boot code call the Venue; nobody calls
 * Engine.apply directly outside tests.
 */
import { Engine } from './engine.js';
import type { Command, CommandInput, CommandType, EngineResult } from './types.js';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class FakeClock implements Clock {
  constructor(private t: number = 1_700_000_000_000) {}
  now(): number {
    return this.t;
  }
  set(t: number): void {
    this.t = t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

/** Where applied commands go. Append must commit before it returns. */
export interface JournalSink {
  append(seq: number, command: Command): void;
}

export type VenueListener = (command: Command, result: EngineResult) => void;

export class Venue {
  readonly engine: Engine;
  readonly clock: Clock;
  private readonly journal: JournalSink | null;
  private readonly listeners: VenueListener[] = [];
  private halted: string | null = null;

  constructor(opts: { engine?: Engine; clock?: Clock; journal?: JournalSink | null } = {}) {
    this.engine = opts.engine ?? new Engine();
    this.clock = opts.clock ?? systemClock;
    this.journal = opts.journal ?? null;
  }

  get isHalted(): string | null {
    return this.halted;
  }

  onApplied(listener: VenueListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** Stamp, apply, journal. Rejections are returned, never journaled. */
  apply<T extends CommandType>(input: Extract<CommandInput, { type: T }>): EngineResult<T> {
    if (this.halted) return { ok: false, code: 'venue_halted', error: this.halted };
    const command = { ...input, at: input.at ?? this.clock.now() } as Extract<Command, { type: T }>;
    const result = this.engine.apply(command);
    if (!result.ok) return result;
    if (this.journal) {
      try {
        this.journal.append(result.seq, command);
      } catch (e) {
        // Memory now holds a command the journal does not. Refuse everything further (D21).
        this.halted = `journal append failed: ${(e as Error).message}`;
        throw e;
      }
    }
    for (const l of this.listeners) l(command, result);
    return result;
  }

  /** Replay a journaled command verbatim (its `at` is authoritative). */
  replay(command: Command): EngineResult {
    const result = this.engine.apply(command);
    if (!result.ok) throw new Error(`journal replay rejected ${command.type}: ${result.code} ${result.error}`);
    return result;
  }
}
