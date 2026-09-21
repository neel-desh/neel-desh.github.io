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

test('icon-only links keep their aria-label as link text', () => {
  const r = convertPage(
    page('<nav><a href="https://github.com/neel-desh" aria-label="GitHub"><svg></svg></a><a href="/x" aria-label="Ignored">Visible</a></nav>')
  );
  assert.match(r.body, /\[GitHub\]\(https:\/\/github\.com\/neel-desh\)/);
  assert.match(r.body, /\[Visible\]\(https:\/\/neeldeshmukh\.com\/x\)/);
});

test('adjacent tag spans are comma separated, not run together', () => {
  const r = convertPage(
    page('<p><strong>Languages:</strong> <span class="tag">Elixir</span><span class="tag">Go</span><span class="tag">Ruby</span></p><p><span class="tag">Solo</span></p>')
  );
  assert.match(r.body, /Languages:\*\* Elixir, Go, Ruby/);
  assert.match(r.body, /^Solo$/m);
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
