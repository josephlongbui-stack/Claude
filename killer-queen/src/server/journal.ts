/**
 * Append-only command journal in SQLite (node:sqlite). The journal is the
 * source of truth: boot replays it into a fresh engine. Rows are never
 * updated or deleted (D21; AGENTS.md rule 5).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Engine, Venue, type Clock, type Command, type JournalSink } from '../engine/index.js';

export interface JournalRow {
  seq: number;
  type: string;
  json: string;
  ts: number;
}

export class Journal implements JournalSink {
  readonly db: DatabaseSync;
  private readonly insert;
  private lastSeq = 0;

  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = FULL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS commands (
      seq  INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      json TEXT NOT NULL,
      ts   INTEGER NOT NULL
    )`);
    this.insert = this.db.prepare('INSERT INTO commands (seq, type, json, ts) VALUES (?, ?, ?, ?)');
    const row = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM commands').get() as { seq: number };
    this.lastSeq = Number(row.seq);
  }

  get length(): number {
    return this.lastSeq;
  }

  /** Insert one row and commit (autocommit + synchronous=FULL) before returning. */
  append(seq: number, command: Command): void {
    if (seq !== this.lastSeq + 1) {
      throw new Error(`journal sequence gap: expected ${this.lastSeq + 1}, got ${seq}`);
    }
    this.insert.run(seq, command.type, JSON.stringify(command), command.at);
    this.lastSeq = seq;
  }

  /** Every command in order. */
  readAll(): Command[] {
    const rows = this.db.prepare('SELECT seq, type, json, ts FROM commands ORDER BY seq').all() as unknown as JournalRow[];
    let expected = 1;
    const out: Command[] = [];
    for (const r of rows) {
      if (Number(r.seq) !== expected) throw new Error(`journal corrupt: seq ${r.seq} where ${expected} expected`);
      let parsed: Command;
      try {
        parsed = JSON.parse(r.json) as Command;
      } catch {
        throw new Error(`journal corrupt: row ${r.seq} is not valid JSON`);
      }
      if (parsed.type !== r.type) throw new Error(`journal corrupt: row ${r.seq} type mismatch`);
      out.push(parsed);
      expected += 1;
    }
    return out;
  }

  close(): void {
    this.db.close();
  }
}

/** Open (or create) a journal, replay it into a fresh engine, and return a Venue bound to it. */
export function openVenue(path: string, clock?: Clock): { venue: Venue; journal: Journal; replayed: number } {
  const journal = new Journal(path);
  const engine = new Engine();
  const commands = journal.readAll();
  const replayer = new Venue({ engine, clock, journal: null });
  for (const c of commands) replayer.replay(c);
  const venue = new Venue({ engine, clock, journal });
  return { venue, journal, replayed: commands.length };
}
