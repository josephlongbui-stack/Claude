/** Structured logging (prompt 3.6): text for terminals, JSON lines for production (LOG_FORMAT=json). */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  (msg: string, fields?: Record<string, unknown>): void;
  level: LogLevel;
  child(fields: Record<string, unknown>): Logger;
  error(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(opts: { format?: 'text' | 'json'; level?: LogLevel | 'silent'; base?: Record<string, unknown>; write?: (line: string) => void } = {}): Logger {
  const format = opts.format ?? (process.env.LOG_FORMAT === 'json' ? 'json' : 'text');
  const level = opts.level ?? 'info';
  const write = opts.write ?? ((line: string) => process.stdout.write(line + '\n'));
  const base = opts.base ?? {};
  const emit = (lvl: LogLevel, msg: string, fields: Record<string, unknown> = {}) => {
    if (level === 'silent' || ORDER[lvl] < ORDER[level]) return;
    if (format === 'json') write(JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg, ...base, ...fields }));
    else {
      const extra = Object.keys({ ...base, ...fields }).length ? ' ' + JSON.stringify({ ...base, ...fields }) : '';
      write(`[kq] ${lvl === 'info' ? '' : lvl + ': '}${msg}${extra}`);
    }
  };
  const logger = ((msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields)) as Logger;
  logger.level = level === 'silent' ? 'error' : level;
  logger.child = (fields) => createLogger({ format, level, base: { ...base, ...fields }, write });
  logger.error = (msg, err, fields = {}) => {
    const e = err instanceof Error ? { error: err.message, stack: err.stack } : err !== undefined ? { error: String(err) } : {};
    emit('error', msg, { ...fields, ...e });
    void reportError(msg, err, { ...base, ...fields });
  };
  return logger;
}

/** Optional error webhook (ERROR_REPORT_URL): one place to plug Sentry's SDK or any collector. */
export async function reportError(msg: string, err: unknown, fields: Record<string, unknown>): Promise<void> {
  const url = process.env.ERROR_REPORT_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg, error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err), ...fields, ts: Date.now() }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* never let reporting fail the server */
  }
}
