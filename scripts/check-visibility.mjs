#!/usr/bin/env node
/**
 * Asserts the privacy guarantee against the built output.
 *
 * The claim this site makes is that non-public content is absent from the
 * deployed artifact, not merely hidden by it. That is only true if something
 * checks, so this runs after every build and fails it on violation.
 *
 * It reads the source moments/case-studies, collects every non-public entry,
 * and greps the entire dist/ tree for that entry's distinctive strings.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const SOURCES = [
  join(ROOT, 'src/content/moments'),
  join(ROOT, 'src/content/case-studies'),
];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** Minimal frontmatter read - enough for `visibility` and `title`. */
function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*["']?(.*?)["']?\s*$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

const nonPublic = [];
for (const dir of SOURCES) {
  for (const file of await walk(dir)) {
    if (extname(file) !== '.md') continue;
    const src = await readFile(file, 'utf8');
    const fm = frontmatter(src);
    // Default is `private` - absence of the field means non-public.
    if (fm.visibility !== 'public') nonPublic.push({ file, fm, src });
  }
}

const distFiles = await walk(DIST);
const haystack = await Promise.all(
  distFiles.map(async (f) => ({ f, text: await readFile(f, 'utf8').catch(() => '') }))
);

const violations = [];
for (const entry of nonPublic) {
  // Distinctive strings: the title, plus any long body lines.
  const needles = [entry.fm.title].filter((s) => s && s.length > 12);
  const body = entry.src.replace(/^---\n[\s\S]*?\n---/, '');
  for (const word of body.split(/\s+/)) {
    if (word.length > 14 && /[A-Z-]/.test(word)) needles.push(word);
  }
  for (const needle of needles) {
    for (const { f, text } of haystack) {
      if (text.includes(needle)) {
        violations.push(`${entry.file} -> leaked "${needle}" into ${f}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\nVISIBILITY CHECK FAILED - non-public content reached dist/:\n');
  for (const v of violations) console.error('  ' + v);
  console.error('');
  process.exit(1);
}

console.log(
  `visibility check ok - ${nonPublic.length} non-public entr${nonPublic.length === 1 ? 'y' : 'ies'} absent from ${distFiles.length} built files`
);
