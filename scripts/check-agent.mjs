#!/usr/bin/env node
/**
 * Asserts the agent-readiness surface of the built site.
 *
 * Sibling to check-visibility.mjs and check-pii.mjs. Checks that every page
 * has a markdown twin and a working alternate link, that robots.txt carries a
 * Content-Signal, that the agent-skills index is valid with matching digests,
 * and that llms.txt does not link to markdown that is not there.
 *
 * `--self-test` runs the checks against in-memory fixtures and requires each
 * broken one to fail. A check that has never failed is not known to work.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { runChecks } from './lib/agent-checks.mjs';
import { sha256 } from './lib/agent-skills.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const SITE = 'https://neeldeshmukh.com';

function goodFixture() {
  const skill = Buffer.from('---\nname: demo\ndescription: d\n---\n# demo\n');
  const files = new Map();
  const put = (path, text) => files.set(path, Buffer.isBuffer(text) ? text : Buffer.from(text));

  for (const dir of ['', 'about/']) {
    put(`${dir}index.html`, `<html><head><link rel="alternate" type="text/markdown" href="${SITE}/${dir}index.md"></head><body></body></html>`);
    put(`${dir}index.md`, `---\ntitle: "T"\ndescription: "D"\nurl: "${SITE}/${dir}"\n---\n\n# Body\n`);
  }
  put('robots.txt', 'User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n');
  put('llms.txt', `# x\n\n- [Home](${SITE}/index.md)\n- [Skill](${SITE}/.well-known/agent-skills/demo/SKILL.md)\n`);
  put('.well-known/agent-skills/demo/SKILL.md', skill);
  put(
    '.well-known/agent-skills/index.json',
    JSON.stringify({
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills: [
        {
          name: 'demo',
          type: 'skill-md',
          description: 'd',
          url: '/.well-known/agent-skills/demo/SKILL.md',
          digest: sha256(skill),
        },
      ],
    })
  );
  return files;
}

/** [label, mutate(files), substring the failure must contain] */
const BROKEN = [
  ['missing twin', (f) => f.delete('about/index.md'), 'missing markdown twin'],
  ['twin without frontmatter', (f) => f.set('index.md', Buffer.from('# Body\n')), 'missing frontmatter'],
  ['twin with empty body', (f) => f.set('index.md', Buffer.from('---\ntitle: "T"\ndescription: "D"\nurl: "u"\n---\n\n')), 'empty body'],
  ['no alternate link', (f) => f.set('index.html', Buffer.from('<html><head></head></html>')), 'no <link rel="alternate"'],
  ['alternate link to wrong file', (f) => f.set('index.html', Buffer.from(`<html><head><link rel="alternate" type="text/markdown" href="${SITE}/nope.md"></head></html>`)), 'does not point at'],
  ['no Content-Signal', (f) => f.set('robots.txt', Buffer.from('User-agent: *\nAllow: /\n')), 'no Content-Signal'],
  ['Content-Signal missing a key', (f) => f.set('robots.txt', Buffer.from('Content-Signal: search=yes, ai-input=yes\n')), 'missing ai-train'],
  ['skills index missing', (f) => f.delete('.well-known/agent-skills/index.json'), 'index.json missing'],
  ['skills digest mismatch', (f) => f.set('.well-known/agent-skills/demo/SKILL.md', Buffer.from('tampered')), 'digest does not match'],
  ['skill file missing', (f) => f.delete('.well-known/agent-skills/demo/SKILL.md'), 'not found in dist'],
  ['llms.txt links a missing md', (f) => f.set('llms.txt', Buffer.from(`- [Gone](${SITE}/gone/index.md)\n`)), 'llms.txt'],
];

if (process.argv.includes('--self-test')) {
  let failed = 0;

  const baseline = runChecks(goodFixture());
  if (baseline.length > 0) {
    failed++;
    console.log(`FAIL  good fixture should pass, got: ${baseline.join('; ')}`);
  } else {
    console.log('ok    good fixture passes');
  }

  for (const [label, mutate, expected] of BROKEN) {
    const files = goodFixture();
    mutate(files);
    const failures = runChecks(files);
    const ok = failures.some((m) => m.includes(expected));
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(32)} ${ok ? 'caught' : `NOT CAUGHT (got: ${failures.join('; ') || 'nothing'})`}`);
  }

  if (failed > 0) {
    console.error(`\n${failed} self-test case${failed === 1 ? '' : 's'} failed.`);
    process.exit(1);
  }
  console.log(`\nall ${BROKEN.length + 1} self-test cases behaved`);
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

const files = new Map();
for (const abs of await walk(DIST)) {
  files.set(relative(DIST, abs).split(sep).join('/'), await readFile(abs));
}

const failures = runChecks(files);
if (failures.length > 0) {
  console.error('\nAGENT CHECK FAILED:\n');
  for (const f of failures) console.error(`  ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`agent check ok - twins, alternate links, Content-Signal, skills and llms.txt consistent across ${files.size} files`);
