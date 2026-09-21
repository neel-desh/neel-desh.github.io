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
