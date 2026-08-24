#!/usr/bin/env node
/**
 * Asserts that no personal contact detail reached the built output.
 *
 * Sibling to check-visibility.mjs, and the same shape of claim: the chat can
 * only ever repeat what is in dist/, so the place to stop PII is the build,
 * not the model. A prompt-level rule is advisory. This is not.
 *
 * Two kinds of rule:
 *
 *   patterns  — shape-based, from src/lib/pii-patterns.mjs, shared with the
 *               chat function so the build gate and the runtime gate cannot
 *               drift apart.
 *   denylist  — literal strings (your real email, your phone number). These
 *               must never be committed, so they are read from `.pii-denylist`
 *               which is gitignored. Absent file just means no literals.
 *
 * Run `node scripts/check-pii.mjs --self-test` to prove the patterns fire.
 * A check that has never failed is not known to work.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { PATTERNS, findPii } from '../src/lib/pii-patterns.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const DENYLIST_FILE = join(ROOT, '.pii-denylist');

/** Scanned as text. Anything else in dist/ is a binary asset. */
const TEXT_EXT = new Set(['.html', '.json', '.js', '.css', '.txt', '.xml', '.svg']);

/** One canary per pattern. If any stops firing, the pattern rotted. */
const CANARIES = [
  ['fake.person@example.com', 'email address'],
  ['9876543210', 'Indian phone number'],
  ['98765 43210', 'Indian phone number'],
  ['+91 98765 43210', 'Indian phone number'],
  ['+919876543210', 'international phone number'],
  ['+1 (415) 555-0123', 'international phone number'],
  ['+44 20 7946 0958', 'international phone number'],
  ['ABCDE1234F', 'PAN number'],
  ['1234 5678 9012', 'Aadhaar number'],
  ['4111 1111 1111 1111', 'Aadhaar number'],
];

if (process.argv.includes('--self-test')) {
  let failed = 0;
  for (const [sample, expected] of CANARIES) {
    const hits = findPii(sample);
    const ok = hits.some((h) => h.rule === expected);
    if (!ok) failed++;
    const got = hits.map((h) => h.rule).join(', ') || 'NOT CAUGHT';
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${sample.padEnd(22)} ${got}`);
  }
  if (failed > 0) {
    console.error(`\n${failed} canar${failed === 1 ? 'y' : 'ies'} did not fire.`);
    process.exit(1);
  }
  console.log(`\nall ${CANARIES.length} canaries fired across ${PATTERNS.length} patterns`);
  process.exit(0);
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function loadDenylist() {
  const raw = await readFile(DENYLIST_FILE, 'utf8').catch(() => null);
  if (raw === null) return { entries: [], present: false };
  const entries = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return { entries, present: true };
}

const { entries: denylist, present: denylistPresent } = await loadDenylist();

const files = (await walk(DIST)).filter((f) => TEXT_EXT.has(extname(f)));
const findings = [];

for (const file of files) {
  const text = await readFile(file, 'utf8').catch(() => '');
  if (!text) continue;

  for (const hit of findPii(text)) {
    findings.push({ file, rule: hit.rule, hit: hit.hit });
  }

  for (const literal of denylist) {
    if (text.includes(literal)) {
      // Never print the literal itself - this output can land in CI logs.
      findings.push({ file, rule: 'denylist entry', hit: '<redacted literal>' });
    }
  }
}

if (findings.length > 0) {
  console.error('\nPII CHECK FAILED - personal data reached dist/:\n');
  for (const f of findings) {
    console.error(`  ${f.file}\n    ${f.rule}: ${f.hit}`);
  }
  console.error('');
  process.exit(1);
}

const denyNote = denylistPresent
  ? `${denylist.length} denylist literal${denylist.length === 1 ? '' : 's'}`
  : 'no .pii-denylist file (patterns only)';
console.log(
  `pii check ok - ${PATTERNS.length} patterns + ${denyNote}, clean across ${files.length} text files`
);
