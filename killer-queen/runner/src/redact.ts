/** Remove injected secrets and anything that looks like a provider key from a log (D3). */
const KEY_SHAPES = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-proj-[A-Za-z0-9_-]{10,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /ghp_[A-Za-z0-9]{30,}/g,
  /kq_[0-9a-f]{40,}/g,
  /(?:Bearer\s+)[A-Za-z0-9._-]{16,}/g,
];

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 6) continue;
    out = out.split(s).join('[REDACTED]');
  }
  for (const re of KEY_SHAPES) out = out.replace(re, (m) => (m.startsWith('Bearer') ? 'Bearer [REDACTED]' : '[REDACTED]'));
  return out;
}
