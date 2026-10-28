/** Simulated session clock. The demo day starts at a fixed, fictional instant. */
export const SESSION_EPOCH = Date.UTC(2026, 9, 28, 10, 0, 0); // 2026-10-28T10:00:00Z

export function simIso(sessionMs: number): string {
  return new Date(SESSION_EPOCH + sessionMs).toISOString();
}

export function simClock(sessionMs: number): string {
  const d = new Date(SESSION_EPOCH + sessionMs);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function simDate(sessionMs: number): string {
  const d = new Date(SESSION_EPOCH + sessionMs);
  return d.toISOString().slice(0, 10);
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtSeconds(sec: number, digits = 0): string {
  return `${sec.toFixed(digits)}s`;
}
