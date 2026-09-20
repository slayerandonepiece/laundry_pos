#!/usr/bin/env node
/**
 * check-css-orphans.mjs — list CSS class selectors that no TSX/TS file consumes.
 *
 * Part of the CSS/theme refactor (.agents/css-refactor/). Every phase records
 * the count before and after; it must strictly decrease.
 *
 * Matching is deliberately CONSERVATIVE on the consumer side: a class counts as
 * used if its name appears anywhere in the TS/TSX corpus as a whole token. That
 * covers every form the codebase actually uses —
 *
 *   className="stat-tile"
 *   className={`stat-tile ${active ? 'active' : ''}`}   <- backtick template
 *   clsx('stat-tile', x && 'active')
 *   const cls = { ok: 'badge good' }[k]
 *
 * Getting the template-literal case wrong produced a false "0 references"
 * reading for the whole Owner Workspace 2.0 system during the audit, so it is
 * covered explicitly by the self-check below (`--self-check`), which asserts
 * that `.pill` — used only via a backtick literal in ui/Pill.tsx — is NOT
 * reported as orphaned.
 *
 * Classes assembled dynamically (`className={`row-${kind}`}`) are also treated
 * as used when a template-literal prefix fragment matches, so the script never
 * invents an orphan that is actually live. Over-reporting "used" is safe;
 * over-reporting "orphan" would licence a wrong deletion.
 *
 * Usage:
 *   node scripts/check-css-orphans.mjs              # grouped list + count
 *   node scripts/check-css-orphans.mjs --count      # just the number
 *   node scripts/check-css-orphans.mjs --self-check # verify the matcher itself
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Selector text only — declaration blocks are dropped so property values
 *  (`background:url(a.b)`) can never be mistaken for a class. */
function selectorText(css) {
  let out = '';
  let depth = 0;
  for (const ch of stripComments(css)) {
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

const CLASS_RE = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;

function cssClasses() {
  const byClass = new Map(); // class -> Set<file>
  for (const file of walk(SRC, ['.css'])) {
    const rel = relative(ROOT, file);
    for (const [, name] of selectorText(readFileSync(file, 'utf8')).matchAll(CLASS_RE)) {
      if (!byClass.has(name)) byClass.set(name, new Set());
      byClass.get(name).add(rel);
    }
  }
  return byClass;
}

function consumerCorpus() {
  return walk(SRC, ['.ts', '.tsx'])
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
}

/** Prefixes appearing immediately before a `${...}` hole in a template literal,
 *  e.g. `row-${kind}` yields "row-". A class starting with one of these may be
 *  produced at runtime, so it is never called an orphan. */
function dynamicPrefixes(corpus) {
  const prefixes = new Set();
  for (const [, frag] of corpus.matchAll(/([A-Za-z_][A-Za-z0-9_-]*-)\$\{/g)) prefixes.add(frag);
  return [...prefixes];
}

function findOrphans() {
  const corpus = consumerCorpus();
  const prefixes = dynamicPrefixes(corpus);
  const orphans = new Map();
  for (const [name, files] of cssClasses()) {
    const token = new RegExp(`(?<![A-Za-z0-9_-])${name.replace(/[-]/g, '\\-')}(?![A-Za-z0-9_-])`);
    if (token.test(corpus)) continue;
    if (prefixes.some((p) => name.startsWith(p))) continue;
    orphans.set(name, files);
  }
  return orphans;
}

const args = process.argv.slice(2);

if (args.includes('--self-check')) {
  const orphans = findOrphans();
  const failures = [];
  // .pill is referenced only from a backtick template literal in ui/Pill.tsx.
  if (orphans.has('pill')) failures.push('.pill reported as orphaned — template-literal matching is broken');
  if (!cssClasses().has('pill')) failures.push('.pill not found in any CSS file — fixture moved, update this check');
  if (failures.length) {
    for (const f of failures) console.error(`FAIL: ${f}`);
    process.exit(1);
  }
  console.log('self-check ok: backtick template literals are matched (.pill is live, not orphaned)');
  process.exit(0);
}

const orphans = findOrphans();

if (args.includes('--count')) {
  console.log(orphans.size);
  process.exit(0);
}

const byFile = new Map();
for (const [name, files] of orphans) {
  for (const file of files) {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(name);
  }
}

for (const file of [...byFile.keys()].sort()) {
  const names = byFile.get(file).sort();
  console.log(`\n${file}  (${names.length})`);
  for (const name of names) console.log(`  .${name}`);
}

console.log(`\nOrphaned selectors: ${orphans.size}`);
