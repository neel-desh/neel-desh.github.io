# Agent Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make neeldeshmukh.com pass the Cloudflare Agent Readiness checks that fit a static content site: markdown twins of every page, Content-Signal, an agent-skills index, and documented edge rules.

**Architecture:** A post-build script converts each built `index.html` into a sibling `index.md` with turndown, so twins are projections of the built HTML and the existing visibility and PII gates cover them. Static discovery files live in `public/` or are generated at build time. A new `check-agent` gate asserts the whole surface. Cloudflare edge rules (Accept-based rewrite, Link and Vary headers) are documented for the owner to apply by hand.

**Tech Stack:** Astro 5 (static), Node 20+ ESM scripts, `turndown` (new devDependency), `node:test` for unit tests, Cloudflare Transform Rules (manual).

**Spec:** `docs/superpowers/specs/2026-09-21-agent-readiness-design.md`

## Global Constraints

- The site is fully static and stays static. No Worker, Function or server runtime.
- Repo is public. No email, phone or other personal contact detail in any new file.
- Never use em dashes in any generated text. Use a comma or a hyphen.
- `robots.txt` Content-Signal value is exactly `search=yes, ai-input=yes, ai-train=no`.
- Markdown twin path is `<route>/index.md`, matching canonical URL plus `index.md` (canonical always ends in a slash).
- Skill index follows `$schema` `https://schemas.agentskills.io/discovery/0.2.0/schema.json`, entry type `skill-md`, relative `url`, digest format `sha256:<hex>`.
- PII definition lives only in `src/lib/pii-patterns.mjs`; `visibility` is interpreted only in `src/lib/visibility.ts`. Do not add a second definition of either.
- A check that has never failed is not known to work: every new gate gets a self-test or canary that must fail.
- Commit messages end with the line `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Work on branch `agent-readiness`.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/lib/html-to-markdown.mjs` | Pure function `convertPage(html)`: built page HTML in, twin markdown out. |
| `scripts/html-to-markdown.test.mjs` | `node:test` unit tests for the converter. |
| `scripts/build-markdown.mjs` | Post-build driver: walks `dist/`, writes twins, publishes skills. |
| `scripts/lib/agent-skills.mjs` | `sha256`, `parseSkill`, `buildIndex`, `buildAgentSkills`. |
| `scripts/agent-skills.test.mjs` | `node:test` unit tests for the skills module. |
| `scripts/lib/agent-checks.mjs` | Pure `runChecks(files)`: returns a list of failure strings. |
| `scripts/check-agent.mjs` | Gate: loads `dist/`, runs checks, has `--self-test`. |
| `src/agent-skills/neel-deshmukh-profile/SKILL.md` | The one published skill. |
| `docs/cloudflare-edge-rules.md` | Exact rules to paste into Cloudflare, plus verification curls. |

---

### Task 1: Markdown twins

**Files:**
- Create: `scripts/lib/html-to-markdown.mjs`, `scripts/html-to-markdown.test.mjs`, `scripts/build-markdown.mjs`
- Modify: `package.json`, `src/layouts/Base.astro:47`, `scripts/check-pii.mjs:34`

**Interfaces:**
- Produces: `convertPage(html: string) => { title: string, description: string, url: string, body: string, markdown: string }`. `markdown` is the full twin file text: frontmatter (`title`, `description`, `url`, each JSON-quoted) then body plus trailing newline. Throws `Error` on missing head fields, missing `<main>`, or empty body.
- Produces: `dist/**/index.md` next to every `dist/**/index.html`.
- Produces: `<link rel="alternate" type="text/markdown" href="{canonical}index.md">` in every page head.

- [ ] **Step 1: Install turndown and add the test script**

```bash
npm install --save-dev turndown
```

Edit `package.json` scripts, adding a `test` entry after `check`:

```json
    "check": "astro check",
    "test": "node --test scripts/*.test.mjs"
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/html-to-markdown.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertPage } from './lib/html-to-markdown.mjs';

const page = (main, head = '') => `<!doctype html><html lang="en"><head>
<title>Experience · Neel Deshmukh</title>
<meta name="description" content="Roles &amp; outcomes.">
<link rel="canonical" href="https://neeldeshmukh.com/experience/">${head}
</head><body><header><nav><a href="/">home</a></nav></header><main>${main}</main><footer>footer text</footer></body></html>`;

test('reads head fields and converts only <main>', () => {
  const r = convertPage(page('<h1>Experience</h1><p>Hello <strong>world</strong>.</p>'));
  assert.equal(r.title, 'Experience · Neel Deshmukh');
  assert.equal(r.description, 'Roles & outcomes.');
  assert.equal(r.url, 'https://neeldeshmukh.com/experience/');
  assert.match(r.body, /^# Experience/);
  assert.match(r.body, /Hello \*\*world\*\*\./);
  assert.doesNotMatch(r.body, /home|footer text/);
});

test('frontmatter is JSON-quoted and precedes the body', () => {
  const r = convertPage(page('<h1>X</h1>'));
  assert.ok(
    r.markdown.startsWith(
      '---\ntitle: "Experience · Neel Deshmukh"\ndescription: "Roles & outcomes."\nurl: "https://neeldeshmukh.com/experience/"\n---\n\n# X\n'
    )
  );
});

test('site-relative links become absolute, external and protocol-relative are untouched', () => {
  const r = convertPage(
    page('<p><a href="/resume">cv</a> <a href="https://github.com/neel-desh">gh</a> <a href="//cdn.example/x">cdn</a></p>')
  );
  assert.match(r.body, /\[cv\]\(https:\/\/neeldeshmukh\.com\/resume\)/);
  assert.match(r.body, /\[gh\]\(https:\/\/github\.com\/neel-desh\)/);
  assert.match(r.body, /\[cdn\]\(\/\/cdn\.example\/x\)/);
});

test('svg and script content is dropped', () => {
  const r = convertPage(page('<p>a<svg><title>icon</title></svg><script>var leaked = 1;</script>b</p>'));
  assert.doesNotMatch(r.body, /icon|leaked/);
  assert.match(r.body, /ab/);
});

test('lists convert to markdown bullets', () => {
  const r = convertPage(page('<ul><li>One</li><li>Two</li></ul>'));
  assert.match(r.body, /^-\s+One$/m);
  assert.match(r.body, /^-\s+Two$/m);
});

test('throws when there is no <main>', () => {
  const html = page('x').replace(/<main>[\s\S]*<\/main>/, '');
  assert.throws(() => convertPage(html), /no <main>/);
});

test('throws when <main> converts to nothing', () => {
  assert.throws(() => convertPage(page('  <svg></svg>  ')), /empty body/);
});

test('throws when the canonical link is missing', () => {
  const html = page('<p>x</p>').replace(/<link rel="canonical"[^>]*>/, '');
  assert.throws(() => convertPage(html), /title, description or canonical/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module './lib/html-to-markdown.mjs'`.

- [ ] **Step 4: Write the converter**

Create `scripts/lib/html-to-markdown.mjs`:

```js
/**
 * Turns a built page into its markdown twin.
 *
 * Pure: HTML string in, markdown string out, so it is unit-testable without a
 * build. Only <main> is converted. The header, nav, roles banner and footer
 * sit outside it in Base.astro and are chrome, not content.
 */
import TurndownService from 'turndown';

const SITE = 'https://neeldeshmukh.com';

const td = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});
td.remove(['script', 'style', 'svg']);

/** &amp; last, so an escaped entity is not decoded twice. */
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#38;/g, '&')
    .replace(/&amp;/g, '&');
}

export function convertPage(html) {
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1] ?? '';
  const title = head.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  const description = head.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const url = head.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!title || !description || !url) {
    throw new Error('page head is missing title, description or canonical');
  }

  const main = html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1];
  if (main === undefined) throw new Error('page has no <main>');

  // Site-relative links only. The negative lookahead leaves "//host" alone.
  const absolute = main.replace(/\b(href|src)="\/(?!\/)/g, `$1="${SITE}/`);
  const body = td.turndown(absolute).trim();
  if (!body) throw new Error('page <main> converted to an empty body');

  const cleanTitle = decodeEntities(title);
  const cleanDescription = decodeEntities(description);
  const frontmatter =
    `---\n` +
    `title: ${JSON.stringify(cleanTitle)}\n` +
    `description: ${JSON.stringify(cleanDescription)}\n` +
    `url: ${JSON.stringify(url)}\n` +
    `---\n\n`;

  return {
    title: cleanTitle,
    description: cleanDescription,
    url,
    body,
    markdown: `${frontmatter}${body}\n`,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the build driver**

Create `scripts/build-markdown.mjs`:

```js
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
```

- [ ] **Step 7: Emit the alternate link in Base.astro**

In `src/layouts/Base.astro`, after the canonical link (line 47), add:

```astro
    <link rel="canonical" href={canonical} />
    <link rel="alternate" type="text/markdown" href={`${canonical}index.md`} />
```

- [ ] **Step 8: Make check-pii scan markdown**

In `scripts/check-pii.mjs`, change the `TEXT_EXT` line to include `.md`:

```js
const TEXT_EXT = new Set(['.html', '.json', '.js', '.css', '.txt', '.xml', '.svg', '.md']);
```

Without this the twins are invisible to the PII gate.

- [ ] **Step 9: Wire into the build**

In `package.json`:

```json
    "build": "astro build && node scripts/build-markdown.mjs && npm run check:visibility && npm run check:pii",
```

- [ ] **Step 10: Build and read the output**

Run: `npm run build 2>&1 | tail -12`
Expected: `markdown twins ok - 3 pages`, visibility ok, `pii check ok ... clean across 14 text files` (11 before, plus 3 twins).

Then read every twin, since generated content must be checked against real data:

```bash
cat dist/index.md dist/about/index.md dist/experience/index.md
```

Expected: each starts with the `---` frontmatter, has real headings and text, no `data-astro-cid` fragments, no header or footer text, links absolute. If a page converts badly (mangled lists, missing text), fix the HTML structure in the `.astro` page, not the converter.

- [ ] **Step 11: Verify the link in built HTML**

Run: `grep -o '<link rel="alternate"[^>]*>' dist/index.html dist/experience/index.html`
Expected: `href="https://neeldeshmukh.com/index.md"` and `href="https://neeldeshmukh.com/experience/index.md"`.

- [ ] **Step 12: Confirm the PII gate now sees markdown**

```bash
echo "fake.person@example.com" >> dist/experience/index.md
node scripts/check-pii.mjs; echo "exit=$?"
npm run build >/dev/null 2>&1
```

Expected: first command prints `PII CHECK FAILED`, `exit=1`. The rebuild restores a clean `dist/`.

- [ ] **Step 13: Typecheck and commit**

Run: `npm run check 2>&1 | tail -5`
Expected: 0 errors.

```bash
git add package.json package-lock.json scripts src/layouts/Base.astro
git commit -m "Generate markdown twins of every page" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Static discovery files and agent skill

**Files:**
- Create: `scripts/lib/agent-skills.mjs`, `scripts/agent-skills.test.mjs`, `src/agent-skills/neel-deshmukh-profile/SKILL.md`
- Modify: `scripts/build-markdown.mjs`, `public/robots.txt`, `public/llms.txt`

**Interfaces:**
- Consumes: `scripts/build-markdown.mjs` from Task 1 (appends a call at the end).
- Produces: `sha256(buf: Buffer | string) => 'sha256:<hex>'`.
- Produces: `parseSkill(src: string) => { name: string, description: string }`, throws if frontmatter, `name` or `description` is missing.
- Produces: `buildIndex(skills: {name, description, digest}[]) => { $schema: string, skills: {name, type: 'skill-md', description, url, digest}[] }` where `url` is `/.well-known/agent-skills/<name>/SKILL.md`.
- Produces: `buildAgentSkills(srcDir: string, distDir: string) => Promise<number>` (count of skills published). Writes `<distDir>/.well-known/agent-skills/<name>/SKILL.md` and `<distDir>/.well-known/agent-skills/index.json`. Throws if a skill's `name` differs from its directory name.

- [ ] **Step 1: Write the failing tests**

Create `scripts/agent-skills.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, parseSkill, buildIndex, buildAgentSkills } from './lib/agent-skills.mjs';

const SKILL = `---
name: demo
description: A demo skill.
---

# Demo
`;

test('sha256 is prefixed and stable', () => {
  assert.equal(
    sha256('abc'),
    'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('parseSkill reads name and description', () => {
  assert.deepEqual(parseSkill(SKILL), { name: 'demo', description: 'A demo skill.' });
});

test('parseSkill throws without frontmatter or fields', () => {
  assert.throws(() => parseSkill('# no frontmatter'), /no frontmatter/);
  assert.throws(() => parseSkill('---\nname: x\n---\n'), /name and description/);
});

test('buildIndex shapes entries per the discovery schema', () => {
  const index = buildIndex([{ name: 'demo', description: 'A demo skill.', digest: 'sha256:00' }]);
  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.deepEqual(index.skills, [
    {
      name: 'demo',
      type: 'skill-md',
      description: 'A demo skill.',
      url: '/.well-known/agent-skills/demo/SKILL.md',
      digest: 'sha256:00',
    },
  ]);
});

test('buildAgentSkills publishes files and an index whose digest matches the bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skills-'));
  const src = join(root, 'src');
  const dist = join(root, 'dist');
  await mkdir(join(src, 'demo'), { recursive: true });
  await writeFile(join(src, 'demo', 'SKILL.md'), SKILL);
  await mkdir(dist);

  assert.equal(await buildAgentSkills(src, dist), 1);

  const published = await readFile(join(dist, '.well-known/agent-skills/demo/SKILL.md'));
  const index = JSON.parse(await readFile(join(dist, '.well-known/agent-skills/index.json'), 'utf8'));
  assert.equal(index.skills[0].digest, sha256(published));
});

test('buildAgentSkills rejects a name that differs from its directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skills-'));
  const src = join(root, 'src');
  await mkdir(join(src, 'other'), { recursive: true });
  await writeFile(join(src, 'other', 'SKILL.md'), SKILL);
  await mkdir(join(root, 'dist'));
  await assert.rejects(buildAgentSkills(src, join(root, 'dist')), /does not match directory/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module './lib/agent-skills.mjs'`. The Task 1 tests still pass.

- [ ] **Step 3: Write the skills module**

Create `scripts/lib/agent-skills.mjs`:

```js
/**
 * Publishes agent skills at /.well-known/agent-skills/ per the Agent Skills
 * Discovery schema. Digests are computed from the bytes being published, so
 * the index cannot go stale.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const BASE = '/.well-known/agent-skills';

export function sha256(buf) {
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
}

/** Reads `name` and `description` from SKILL.md frontmatter (single-line values). */
export function parseSkill(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('SKILL.md has no frontmatter');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  if (!fm.name || !fm.description) {
    throw new Error('SKILL.md frontmatter needs name and description');
  }
  return { name: fm.name, description: fm.description };
}

export function buildIndex(skills) {
  return {
    $schema: SCHEMA,
    skills: skills.map(({ name, description, digest }) => ({
      name,
      type: 'skill-md',
      description,
      url: `${BASE}/${name}/SKILL.md`,
      digest,
    })),
  };
}

/** Copies every <srcDir>/<name>/SKILL.md into dist and writes the index. */
export async function buildAgentSkills(srcDir, distDir) {
  const entries = (await readdir(srcDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const skills = [];
  for (const entry of entries) {
    const bytes = await readFile(join(srcDir, entry.name, 'SKILL.md'));
    const { name, description } = parseSkill(bytes.toString('utf8'));
    if (name !== entry.name) {
      throw new Error(`skill name "${name}" does not match directory "${entry.name}"`);
    }
    const outDir = join(distDir, BASE, name);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'SKILL.md'), bytes);
    skills.push({ name, description, digest: sha256(bytes) });
  }

  await mkdir(join(distDir, BASE), { recursive: true });
  await writeFile(join(distDir, BASE, 'index.json'), JSON.stringify(buildIndex(skills), null, 2) + '\n');
  return skills.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 14 tests total.

- [ ] **Step 5: Write the skill**

Create `src/agent-skills/neel-deshmukh-profile/SKILL.md`. No contact details, no pronouns, no em dashes:

```markdown
---
name: neel-deshmukh-profile
description: How to read Neel Deshmukh's personal site, neeldeshmukh.com: the pages, their markdown versions, and the machine-readable corpus of dated, evidenced work.
---

# Neel Deshmukh profile

neeldeshmukh.com is the personal site of Neel Deshmukh (also written neeldeshmukh), a backend engineer working in Go and Elixir. Every claim on it is backed by a dated entry.

## Where to read

- Every page has a markdown version at `<page>/index.md`, or request the page itself with `Accept: text/markdown`.
- `/` is the home page, `/about/` covers tools and how Neel works, and `/experience/` is the web resume: roles, measured outcomes, skills and education.
- `/corpus.json` is every public entry the site is built from, machine readable. Prefer it for structured questions.
- `/llms.txt` indexes all of the above.
- `/resume` is the resume as a PDF.

## What to rely on

- Non-public material is absent from the site by construction, not hidden. If a fact is not in the pages or the corpus, the site does not publish it, so do not infer it.
- The site lists no email address or phone number. Direct people to the LinkedIn and GitHub links on the pages.
- Punch, a previous employer, shut down. Describe that role in the past tense.
```

- [ ] **Step 6: Publish skills from the build driver**

In `scripts/build-markdown.mjs`, add the import and call. Import:

```js
import { buildAgentSkills } from './lib/agent-skills.mjs';
```

Replace the final `console.log` with:

```js
console.log(`markdown twins ok - ${pages.length} page${pages.length === 1 ? '' : 's'}`);

const skillCount = await buildAgentSkills(join(ROOT, 'src/agent-skills'), DIST);
console.log(`agent skills ok - ${skillCount} published`);
```

- [ ] **Step 7: Update robots.txt**

Replace `public/robots.txt` entirely:

```
# Search and AI crawlers are welcome and named explicitly, so answer engines
# can quote and cite this site. The Content-Signal line separates uses:
# search and ai-input (quoting in answers) are allowed, ai-train (model
# training) is not. Change ai-train here and nowhere else.
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /

User-agent: GPTBot
User-agent: ClaudeBot
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: CCBot
Allow: /

Sitemap: https://neeldeshmukh.com/sitemap.xml
```

- [ ] **Step 8: Link the twins from llms.txt**

In `public/llms.txt`, insert a new section between "Key pages" and "Data":

```markdown
## Markdown

Each page is also served as markdown, or request it with `Accept: text/markdown`.

- [Home](https://neeldeshmukh.com/index.md)
- [About](https://neeldeshmukh.com/about/index.md)
- [Experience](https://neeldeshmukh.com/experience/index.md)
- [Agent skill](https://neeldeshmukh.com/.well-known/agent-skills/neel-deshmukh-profile/SKILL.md)

```

- [ ] **Step 9: Build and inspect**

Run: `npm run build 2>&1 | tail -8`
Expected: `agent skills ok - 1 published`, all gates pass.

```bash
cat dist/.well-known/agent-skills/index.json
shasum -a 256 dist/.well-known/agent-skills/neel-deshmukh-profile/SKILL.md
```

Expected: the index digest equals the printed hash, `url` is `/.well-known/agent-skills/neel-deshmukh-profile/SKILL.md`.

- [ ] **Step 10: Commit**

```bash
git add scripts src/agent-skills public
git commit -m "Add agent skill, Content-Signal and markdown links in llms.txt" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: check-agent gate with self-test

**Files:**
- Create: `scripts/lib/agent-checks.mjs`, `scripts/check-agent.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `sha256` from `scripts/lib/agent-skills.mjs` (Task 2); the `dist/` layout produced by Tasks 1 and 2.
- Produces: `runChecks(files: Map<string, Buffer>) => string[]`. Keys are posix paths relative to `dist/` (`index.html`, `experience/index.md`, `robots.txt`). Returns failure messages, empty array means pass.
- Produces: `npm run check:agent` (self-test then real check), wired into `npm run build`.

- [ ] **Step 1: Write the gate with its self-test and no implementation**

The self-test is the failing test here, matching how `check-pii.mjs` proves itself. Create `scripts/check-agent.mjs`:

```js
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
```

- [ ] **Step 2: Run the self-test to verify it fails**

Run: `node scripts/check-agent.mjs --self-test`
Expected: FAIL, `Cannot find module './lib/agent-checks.mjs'`.

- [ ] **Step 3: Write the checks**

Create `scripts/lib/agent-checks.mjs`:

```js
/**
 * The agent-readiness assertions, as a pure function over the built files so
 * the self-test in check-agent.mjs can feed it broken fixtures.
 */
import { sha256 } from './agent-skills.mjs';

const SITE = 'https://neeldeshmukh.com';

const text = (files, path) => files.get(path)?.toString('utf8');

/** `files` maps a posix path relative to dist/ to its bytes. Returns failures. */
export function runChecks(files) {
  const failures = [];
  const fail = (msg) => failures.push(msg);

  // 1. Every page has a well-formed twin and an alternate link pointing at it.
  const pages = [...files.keys()].filter((p) => p === 'index.html' || p.endsWith('/index.html'));
  if (pages.length === 0) fail('no index.html pages found in dist/');

  for (const page of pages) {
    const dir = page.slice(0, -'index.html'.length);
    const twinPath = `${dir}index.md`;
    const twin = text(files, twinPath);

    if (twin === undefined) {
      fail(`${page}: missing markdown twin ${twinPath}`);
    } else {
      const m = twin.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!m) {
        fail(`${twinPath}: missing frontmatter`);
      } else {
        for (const key of ['title', 'description', 'url']) {
          if (!new RegExp(`^${key}: `, 'm').test(m[1])) fail(`${twinPath}: frontmatter missing ${key}`);
        }
        if (!m[2].trim()) fail(`${twinPath}: empty body`);
      }
    }

    const tag = text(files, page).match(/<link[^>]*type="text\/markdown"[^>]*>/)?.[0];
    const href = tag?.match(/href="([^"]+)"/)?.[1];
    if (!href) {
      fail(`${page}: no <link rel="alternate" type="text/markdown">`);
    } else if (href !== `${SITE}/${twinPath}`) {
      fail(`${page}: alternate link ${href} does not point at ${SITE}/${twinPath}`);
    }
  }

  // 2. robots.txt declares what AI use is allowed.
  const robots = text(files, 'robots.txt');
  if (robots === undefined) {
    fail('robots.txt missing');
  } else {
    const line = robots.split('\n').find((l) => /^content-signal:/i.test(l.trim()));
    if (!line) {
      fail('robots.txt: no Content-Signal line');
    } else {
      for (const key of ['search', 'ai-input', 'ai-train']) {
        if (!new RegExp(`\\b${key}=(yes|no)\\b`).test(line)) {
          fail(`robots.txt: Content-Signal missing ${key}=yes|no`);
        }
      }
    }
  }

  // 3. The skills index is valid and every digest matches the bytes served.
  const raw = text(files, '.well-known/agent-skills/index.json');
  if (raw === undefined) {
    fail('.well-known/agent-skills/index.json missing');
  } else {
    let index;
    try {
      index = JSON.parse(raw);
    } catch {
      fail('agent-skills index.json is not valid JSON');
    }
    if (index) {
      if (!index.$schema) fail('agent-skills index.json has no $schema');
      if (!Array.isArray(index.skills) || index.skills.length === 0) {
        fail('agent-skills index.json lists no skills');
      } else {
        for (const s of index.skills) {
          for (const key of ['name', 'type', 'description', 'url', 'digest']) {
            if (!s[key]) fail(`skill ${s.name ?? '?'}: missing ${key}`);
          }
          if (s.type && s.type !== 'skill-md') fail(`skill ${s.name}: type must be skill-md`);
          if (s.url) {
            const file = files.get(s.url.replace(/^\//, ''));
            if (!file) fail(`skill ${s.name}: ${s.url} not found in dist/`);
            else if (sha256(file) !== s.digest) fail(`skill ${s.name}: digest does not match ${s.url}`);
          }
        }
      }
    }
  }

  // 4. llms.txt does not advertise markdown that is not there.
  const llms = text(files, 'llms.txt');
  if (llms === undefined) {
    fail('llms.txt missing');
  } else {
    for (const m of llms.matchAll(/\((https:\/\/neeldeshmukh\.com\/[^)\s]*\.md)\)/g)) {
      if (!files.has(m[1].slice(SITE.length + 1))) fail(`llms.txt: ${m[1]} not found in dist/`);
    }
  }

  return failures;
}
```

- [ ] **Step 4: Run the self-test to verify it passes**

Run: `node scripts/check-agent.mjs --self-test`
Expected: every line `ok`, ending `all 12 self-test cases behaved`.

- [ ] **Step 5: Run the real check against the build**

```bash
npm run build 2>&1 | tail -4
node scripts/check-agent.mjs
```

Expected: `agent check ok - ... across N files`. If it fails, the failure message names the file. Fix the source of the problem, not the check.

- [ ] **Step 6: Wire into the build**

In `package.json`:

```json
    "build": "astro build && node scripts/build-markdown.mjs && npm run check:visibility && npm run check:pii && npm run check:agent",
    "check:agent": "node scripts/check-agent.mjs --self-test && node scripts/check-agent.mjs",
```

- [ ] **Step 7: Full build and commit**

Run: `npm run build 2>&1 | tail -6`
Expected: the last line is `agent check ok`.

```bash
git add scripts package.json
git commit -m "Add agent-readiness build gate with self-test" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Cloudflare edge rules doc

**Files:**
- Create: `docs/cloudflare-edge-rules.md`

**Interfaces:**
- Consumes: twin path convention `<route>/index.md` from Task 1; `/llms.txt`, `/sitemap.xml`, `/.well-known/agent-skills/index.json` from Task 2.
- Produces: the exact rules the owner pastes into Cloudflare. Nothing in code depends on this file.

- [ ] **Step 1: Write the doc**

Create `docs/cloudflare-edge-rules.md`:

````markdown
# Cloudflare edge rules

GitHub Pages cannot negotiate content or set custom headers, and this site is
static forever, so two agent-readiness checks live at the Cloudflare layer.
These rules are applied by hand in the dashboard and are **not** deployed by
this repo. Re-apply them if the zone is ever rebuilt.

Apply after the branch is deployed to `main`, since the markdown twins must
exist on the origin first. Rules are in the dashboard under **Rules**. All
three are available on the free plan.

## Rule 1: serve markdown when asked

Rules > Transform Rules > **Rewrite URL** > Create rule.

- Name: `agents: markdown by Accept header`
- When incoming requests match, **Edit expression**:

  ```
  (any(http.request.headers["accept"][*] contains "text/markdown") and ends_with(http.request.uri.path, "/"))
  ```

- Then: Path > **Rewrite to...** > Dynamic:

  ```
  concat(http.request.uri.path, "index.md")
  ```

- Query: Preserve.

The rewrite happens before the cache lookup, so the cache key is the rewritten
URL and the HTML and markdown variants never collide.

## Rule 2: discovery Link header on pages

Rules > Transform Rules > **Modify Response Header** > Create rule.

- Name: `agents: Link header on HTML`
- Expression:

  ```
  (http.response.content_type.media_type eq "text/html")
  ```

- Then: **Set static**, header `Link`, value:

  ```
  </llms.txt>; rel="describedby"; type="text/plain", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </sitemap.xml>; rel="sitemap"; type="application/xml"
  ```

## Rule 3: Vary on both variants

Rules > Transform Rules > **Modify Response Header** > Create rule.

- Name: `agents: Vary Accept`
- Expression:

  ```
  (http.response.content_type.media_type in {"text/html" "text/markdown"})
  ```

- Then: **Add**, header `Vary`, value `Accept`.

## Fallback rule: only if markdown has the wrong content type

Check first (see below). If `index.md` is not served as `text/markdown`, add a
Modify Response Header rule with expression
`(ends_with(http.request.uri.path, ".md"))` that sets `Content-Type` to
`text/markdown; charset=utf-8`. If it is already correct, skip this rule.

## Verify

Purge the cache for the site after saving the rules, then:

```bash
# Twin is reachable directly, as markdown
curl -sI https://neeldeshmukh.com/experience/index.md | grep -i '^content-type'
#   expect: content-type: text/markdown...

# Accept negotiation returns markdown at the page URL
curl -s -H 'Accept: text/markdown' https://neeldeshmukh.com/experience/ | head -6
#   expect: starts with "---" then title: ...
curl -sI -H 'Accept: text/markdown' https://neeldeshmukh.com/experience/ | grep -i '^content-type'
#   expect: content-type: text/markdown...

# Browsers are unaffected
curl -sI https://neeldeshmukh.com/experience/ | grep -i '^content-type'
#   expect: content-type: text/html...

# Discovery headers on pages
curl -sI https://neeldeshmukh.com/ | grep -i '^link\|^vary'
#   expect: a link: header naming llms.txt, agent-skills and sitemap, and vary: including Accept
```

Then scan the site at https://isitagentready.com. Expected to pass: robots.txt,
sitemap, Link headers, markdown negotiation, llms.txt, Content Signals, AI bot
rules, Agent Skills. Expected not applicable: API catalog, MCP server card,
OAuth, WebMCP, Web Bot Auth, commerce (a static site has no server to describe).
````

- [ ] **Step 2: Check the doc for banned characters**

Run: `grep -nP '\x{2014}' docs/cloudflare-edge-rules.md; echo "grep exit=$?"`
Expected: no matches, `grep exit=1`.

- [ ] **Step 3: Commit**

```bash
git add docs/cloudflare-edge-rules.md
git commit -m "Document Cloudflare edge rules for agent readiness" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Project memory, canary proof, end-to-end verification

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 1 to 4.
- Produces: nothing later tasks use. This is the closing task.

- [ ] **Step 1: Prove the visibility gate covers markdown twins**

```bash
npm run build >/dev/null 2>&1
echo "GOLDENCANARY-DO-NOT-SHIP" > dist/experience/index.md
node scripts/check-visibility.mjs; echo "exit=$?"
npm run build >/dev/null 2>&1
```

Expected: `VISIBILITY CHECK FAILED`, `exit=1`. The rebuild restores a clean `dist/`. If this exits 0, the canary moment was changed from private, stop and investigate.

- [ ] **Step 2: Prove check-agent fails on a real broken build**

```bash
rm dist/about/index.md
node scripts/check-agent.mjs; echo "exit=$?"
npm run build >/dev/null 2>&1
```

Expected: `AGENT CHECK FAILED` naming `about/index.html: missing markdown twin`, `exit=1`.

- [ ] **Step 3: Serve the build and fetch the twins over HTTP**

```bash
npm run preview -- --port 4399 >/dev/null 2>&1 &
PREVIEW_PID=$!
sleep 3
curl -s http://localhost:4399/experience/index.md | head -12
curl -sI http://localhost:4399/experience/index.md | grep -i content-type
curl -s http://localhost:4399/.well-known/agent-skills/index.json
curl -s http://localhost:4399/robots.txt
kill $PREVIEW_PID
```

Expected: markdown with frontmatter, a content type (local preview may say `text/markdown` or `application/octet-stream`, only record it), the index JSON, and the Content-Signal line. Note the local content type in the final report, since it hints at what GitHub Pages will do but does not prove it.

- [ ] **Step 4: Update CLAUDE.md**

Add this section after "## SEO and GEO" in `CLAUDE.md`:

```markdown
## Agent readiness

Modeled on Cloudflare's Agent Readiness score (isitagentready.com). Spec:
`docs/superpowers/specs/2026-09-21-agent-readiness-design.md`.

**The site is static forever, blog content included.** No Worker, Function or
server runtime, ever. That rules out the MCP server card, API catalog, OAuth
discovery, WebMCP and commerce checks: they describe a live server and would
be fake here. Web Bot Auth is out too, it is for bots proving identity while
crawling.

- `scripts/build-markdown.mjs` walks `dist/` for every `index.html` and writes
  an `index.md` twin (turndown over `<main>`). There is no route list, so new
  pages and blog posts get twins automatically. It also publishes
  `src/agent-skills/*/SKILL.md` to `/.well-known/agent-skills/` with a
  generated index and sha256 digests.
- `Base.astro` emits `<link rel="alternate" type="text/markdown">` to the twin.
- `public/robots.txt` carries `Content-Signal: search=yes, ai-input=yes,
  ai-train=no` and explicit AI-bot groups. Change `ai-train` there and nowhere
  else.
- `scripts/check-agent.mjs` gates twins, alternate links, Content-Signal, skill
  digests and llms.txt markdown links. `--self-test` proves it can fail.
- `check-pii.mjs` scans `.md` (it did not before, so twins were invisible to
  it). If you add a new output extension to `dist/`, add it to `TEXT_EXT`.
- **Edge rules are not deployed by this repo.** They are applied by hand in
  Cloudflare and listed in `docs/cloudflare-edge-rules.md`: Accept-based
  rewrite to `index.md`, `Link` and `Vary` headers. If
  `curl -H 'Accept: text/markdown' https://neeldeshmukh.com/experience/`
  returns HTML, the rules were lost or misconfigured.
```

Add to the `## Commands` block:

```sh
npm test                 # node:test unit tests for the build scripts
npm run check:agent      # agent-readiness self-test + check (needs an existing dist/)
```

Update the `npm run build` comment to `# build + markdown twins + visibility + pii + agent checks`.

- [ ] **Step 5: Final full run**

```bash
npm test 2>&1 | tail -8
npm run check 2>&1 | tail -3
npm run build 2>&1 | tail -8
git status --short
```

Expected: all tests pass, 0 typecheck errors, build ends `agent check ok`, and `git status` shows only `CLAUDE.md` modified.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-09-21-agent-readiness.md docs/superpowers/specs/2026-09-21-agent-readiness-design.md
git commit -m "Record agent-readiness decisions in CLAUDE.md" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Hand off the manual steps**

Report to the owner, in this order: branch `agent-readiness` is ready to merge, CI must go green, then after deploy apply the three rules from `docs/cloudflare-edge-rules.md`, run the verify curls, and run the isitagentready.com scan. Include the local content type observed in Step 3.
