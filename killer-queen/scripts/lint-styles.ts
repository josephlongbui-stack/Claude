/**
 * Style lint (D4): outside src/web/styles/tokens.css nothing may carry a colour
 * literal, a px font size, a raw px spacing value or an inline style with a
 * literal size. `npm run lint:styles`; part of `npm test`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const webRoot = resolve(root, 'src/web');
const TOKENS = resolve(webRoot, 'styles/tokens.css');
const LEGACY = new Set<string>();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const problems: string[] = [];
const report = (file: string, line: number, msg: string) => problems.push(`${relative(root, file)}:${line}: ${msg}`);

for (const file of walk(webRoot)) {
  if (file === TOKENS) continue;
  const rel = relative(webRoot, file);
  if (LEGACY.has(rel)) continue;
  const text = readFileSync(file, 'utf8');
  const css = file.endsWith('.css');
  text.split('\n').forEach((line, i) => {
    const n = i + 1;
    const code = css ? line : line.replace(/\/\/.*$/, '');
    if (/#[0-9a-fA-F]{3,8}\b/.test(code) && !/#\//.test(code)) report(file, n, 'colour literal; use a token');
    if (/\b(rgba?|hsla?)\(/.test(code)) report(file, n, 'colour function; use a token');
    if (css) {
      if (/\b\d+(\.\d+)?px\b/.test(code) && !/^\s*@media/.test(code)) report(file, n, 'raw px value; use a spacing, size or type token');
      if (/font-size\s*:(?!\s*var\(--t-)/.test(code)) report(file, n, 'font-size must be a type token');
      if (/font-family\s*:(?!\s*(var\(--font-|inherit))/.test(code)) report(file, n, 'font-family must be a font token');
    } else {
      const styles = code.match(/style=\{\{[^}]*\}\}|style="[^"]*"/g) ?? [];
      for (const s of styles) if (/\d\s*px|#[0-9a-fA-F]{3}|rgb/.test(s)) report(file, n, `inline style with a literal size or colour: ${s}`);
      if (/fontSize|font-size/.test(code)) report(file, n, 'font size in TSX; use a type class');
    }
  });
}

if (problems.length) {
  console.error(`lint:styles found ${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('lint:styles: clean');
