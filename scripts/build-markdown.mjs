#!/usr/bin/env node
/**
 * Writes a markdown twin (index.md) next to every built index.html.
 *
 * There is deliberately no route list: it walks dist/, so a page added later,
 * a blog post included, gets a twin with no change here. The twins are made
 * from the built HTML, so they cannot drift from it, and because they land in
 * dist/ the visibility and PII gates scan them like everything else.
 *
 * Runs after `astro build` and before the gates.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { convertPage } from './lib/html-to-markdown.mjs';
import { buildAgentSkills } from './lib/agent-skills.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const pages = (await walk(DIST)).filter((f) => basename(f) === 'index.html');
if (pages.length === 0) {
  console.error('build-markdown: no index.html found in dist/ - did astro build run?');
  process.exit(1);
}

for (const page of pages) {
  try {
    const { markdown } = convertPage(await readFile(page, 'utf8'));
    await writeFile(join(dirname(page), 'index.md'), markdown);
  } catch (err) {
    console.error(`build-markdown: ${page}: ${err.message}`);
    process.exit(1);
  }
}

console.log(`markdown twins ok - ${pages.length} page${pages.length === 1 ? '' : 's'}`);

const skillCount = await buildAgentSkills(join(ROOT, 'src/agent-skills'), DIST);
console.log(`agent skills ok - ${skillCount} published`);
