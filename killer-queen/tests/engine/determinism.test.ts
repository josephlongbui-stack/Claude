import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ENGINE_DIR = new URL('../../src/engine/', import.meta.url).pathname;
const FORBIDDEN = [/Date\.now\(/, /new Date\(/, /Math\.random\(/, /\bfetch\(/, /from 'node:(http|https|net|fs|child_process|worker_threads)'/, /performance\.now\(/, /setTimeout\(/, /setInterval\(/];

describe('engine determinism (static guard)', () => {
  it('src/engine has no clock, randomness, timers or I/O except the injected system clock', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.ts'))) {
      const lines = readFileSync(join(ENGINE_DIR, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const re of FORBIDDEN) {
          if (!re.test(line)) continue;
          // The one allowed clock read: the default Clock implementation that boot injects.
          if (file === 'venue.ts' && /systemClock/.test(line)) continue;
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(offenders, []);
  });

  it('engine files do not import from server, bots or web', () => {
    for (const file of readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(ENGINE_DIR, file), 'utf8');
      assert.doesNotMatch(src, /from '\.\.\/(server|bots|web)/, `${file} imports outside the engine`);
    }
  });
});
