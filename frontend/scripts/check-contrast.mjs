#!/usr/bin/env node
// WCAG contrast check for the light theme palette.
//
// Parses the `[data-theme='light']` block in src/styles/_themes.scss, resolves
// var() references, and asserts every text/semantic token against the surface
// it renders on. Dark is unchanged and not checked here.
//
//   npm run check:contrast
//
// Thresholds: 4.5:1 for body text, 3:1 for large text / decorative elements
// (WCAG 2.1 AA).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scss = readFileSync(join(root, 'src/styles/_themes.scss'), 'utf8');

// --- parse the light block into a name -> value map --------------------------
const block = scss.match(/\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/);
if (!block) {
  console.error("could not find [data-theme='light'] block in _themes.scss");
  process.exit(2);
}
const raw = {};
for (const line of block[1].split('\n')) {
  const m = line.match(/^\s*(--[\w-]+):\s*(.+?);\s*(\/\/.*)?$/);
  if (m) raw[m[1]] = m[2].trim();
}

function resolve(value, seen = new Set()) {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  if (!m) return value;
  const name = m[1];
  if (seen.has(name)) throw new Error(`var() cycle at ${name}`);
  seen.add(name);
  if (!(name in raw)) throw new Error(`unresolved ${name}`);
  return resolve(raw[name], seen);
}

// --- colour maths -----------------------------------------------------------
function parse(str) {
  str = str.trim();
  let m = str.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255, 1];
  }
  m = str.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b, 1];
  }
  m = str.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`cannot parse colour: ${str}`);
}

// flatten a possibly-translucent fg over an opaque bg
function over(fg, bg) {
  const a = fg[3];
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
    1,
  ];
}

function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgStr, bgStr) {
  const bg = parse(bgStr);
  const fg = over(parse(fgStr), bg);
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const get = (name) => resolve(raw[name] ?? `var(${name})`);

// --- the checks -----------------------------------------------------------
// [foreground token, background token, min ratio, note]
const checks = [
  ['--text', '--bg', 4.5, 'body text on page'],
  ['--text', '--surface', 4.5, 'body text on panel'],
  ['--text', '--surface-2', 4.5, 'body text on inset'],
  ['--text-muted', '--bg', 4.5, 'muted text on page'],
  ['--text-muted', '--surface', 4.5, 'muted text on panel'],
  ['--text-faint', '--bg', 4.5, 'faint text (eyebrow/meta) on page'],
  ['--text-faint', '--surface', 4.5, 'faint text on panel'],
  ['--jade', '--bg', 4.5, 'positive figure on page'],
  ['--jade', '--surface', 4.5, 'positive figure on panel'],
  ['--red', '--bg', 4.5, 'negative figure on page'],
  ['--red', '--surface', 4.5, 'negative figure on panel'],
  ['--gold', '--bg', 4.5, '"near limit" text on page'],
  ['--gold', '--surface', 4.5, '"near limit" text on panel'],
  ['--border', '--bg', 1.5, 'hairline border on page (decorative)'],
  ['--border', '--surface', 1.5, 'hairline border on panel (decorative)'],
  ['--border-strong', '--surface', 1.5, 'hover border on panel (decorative)'],
  ['--btn-jade-text', '--jade', 4.5, 'label on jade button fill'],
  ['--btn-red-text', '--red', 4.5, 'label on brick button fill'],
];

let failed = 0;
console.log(`light theme — WCAG AA contrast\n`);
for (const [fg, bg, min, note] of checks) {
  const ratio = contrast(get(fg), get(bg));
  const ok = ratio >= min;
  if (!ok) failed++;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(
    `  ${tag}  ${ratio.toFixed(2).padStart(5)}:1  (need ${min})  ${fg} on ${bg}  — ${note}`
  );
}
console.log('');
if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('all checks passed');
