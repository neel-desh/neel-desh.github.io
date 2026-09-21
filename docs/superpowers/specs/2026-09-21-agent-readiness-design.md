# Agent readiness design

Date: 2026-09-21. Status: draft, awaiting review.

## Goal

Make neeldeshmukh.com pass the checks in Cloudflare's Agent Readiness score
(isitagentready.com) that make sense for a static content site, without
adding a server runtime. The site is static now and will stay static, blog
content included. Everything below is build-time output plus a small set of
Cloudflare edge rules that the owner applies by hand.

## Scope

In:

| Check | How |
| --- | --- |
| robots.txt, sitemap.xml | Already present. robots.txt extended (below). |
| llms.txt | Already present. Extended to link markdown twins. |
| Markdown content negotiation | Build-time `index.md` per page, edge rule serves it on `Accept: text/markdown`. |
| Link headers (RFC 8288) | Edge response-header rule. |
| Content Signals | `Content-Signal` line in robots.txt. |
| AI bot rules | Explicit `User-agent` blocks for known AI crawlers in robots.txt. |
| Agent Skills | `/.well-known/agent-skills/index.json` plus one `SKILL.md`. |

Out, and why:

- MCP server card, API catalog (RFC 9727), OAuth discovery (RFC 9728),
  WebMCP: all describe a live server or API. The site has none and must not
  fake one.
- Web Bot Auth: lets bots prove identity to sites they crawl. Not relevant to
  a site that only serves.
- Commerce (x402, UCP, ACP): not scored, not applicable.
- Cloudflare's built-in "Markdown for Agents" toggle: output is not under our
  build gates.
- Any Worker or Function. Static only, permanently.

## Design

### 1. Markdown twins

`scripts/build-markdown.mjs`, run after `astro build` and before the gates.

- Walks `dist/` for every `index.html`. It does not use a hard-coded route
  list, so future blog pages get twins with no change.
- For each page, reads `<title>`, meta description and canonical from
  `<head>`, and takes the inner HTML of `<main>` (the header, nav, roles
  banner and footer live outside `<main>` in `Base.astro`, so they are dropped).
- Converts to markdown with `turndown` (new devDependency). Rules: drop
  `script`, `style` and `svg`; rewrite relative links to absolute
  `https://neeldeshmukh.com/...` so the file is portable.
- Writes `<dir>/index.md` with frontmatter (`title`, `description`, `url`)
  followed by the body.
- Fails the build if a page has no `<main>` or converts to an empty body.

`Base.astro` gets `<link rel="alternate" type="text/markdown" href="{canonical}index.md">`.
Canonical always ends in a slash, so the href is `${canonical}index.md`.

Because the twins are generated from built HTML and land in `dist/`, the
existing `check-visibility` and `check-pii` gates scan them with no change.
That is the point of generating rather than hand-writing: one source, no
drift, and the visibility guarantee extends to the new surface.

`package.json`:

```
"build": "astro build && node scripts/build-markdown.mjs && npm run check:visibility && npm run check:pii && npm run check:agent"
```

### 2. Static discovery files (all in `public/`)

`robots.txt`:

```
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

Decision: `ai-train=no`. The site stays quotable and citable by answer
engines (search, ai-input) without opting into model training. Change the
value to `yes` here and nowhere else if that stops being the intent. The
comment block at the top of the current file, which says nothing is blocked,
is reworded to match.

`/.well-known/agent-skills/index.json`, following the Agent Skills Discovery
schema:

```json
{
  "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  "skills": [
    {
      "name": "neel-deshmukh-profile",
      "type": "skill-md",
      "description": "How to read Neel Deshmukh's site: pages, markdown twins, and the public corpus.",
      "url": "/.well-known/agent-skills/neel-deshmukh-profile/SKILL.md",
      "digest": "sha256:<generated>"
    }
  ]
}
```

The digest is computed at build time by `build-markdown.mjs` from the
`SKILL.md` source, so it cannot go stale. The `SKILL.md` source lives at
`src/agent-skills/neel-deshmukh-profile/SKILL.md` and is copied into `dist/`
by the same script. Content: what the site is, the page list, that every
page has an `index.md` twin, that `/corpus.json` is the full public record,
that the resume PDF is at `/resume`, and that non-public material is absent
by construction. No contact details (public repo).

`llms.txt`: add the three `index.md` twins under a "Markdown" heading.

### 3. Edge rules (applied by hand in Cloudflare)

Documented in `docs/cloudflare-edge-rules.md` as exact expressions to paste.
No script, no API token. Three rules, all free-plan features:

1. **URL Rewrite (Transform Rules).**
   When `http.request.headers["accept"][0]` contains `text/markdown` and
   `http.request.uri.path` ends with `/`: rewrite path to
   `concat(http.request.uri.path, "index.md")`.
2. **Response Header Transform, all HTML responses.** Add
   `Link: </llms.txt>; rel="describedby"`, `</.well-known/agent-skills/index.json>; rel="describedby"`,
   `</sitemap.xml>; rel="sitemap"`, and `Vary: Accept`.
3. **Response Header Transform, `*.md`.** Only if verification shows GitHub
   Pages does not serve `.md` as `text/markdown`: set the content type.

Rule 1 rewrites before the cache lookup, so the cache key is the rewritten
URL and HTML and markdown do not collide.

The doc also lists the exact curl commands used to verify each rule and says
what a passing result looks like.

### 4. Verification

`scripts/check-agent.mjs`, wired into `npm run build`, asserts against `dist/`:

- every `index.html` has a sibling `index.md` with frontmatter and a
  non-empty body;
- every `rel="alternate" type="text/markdown"` link resolves to a file;
- robots.txt contains a `Content-Signal` line with all three keys;
- the agent-skills index parses, each `url` exists in `dist/`, and each
  digest matches the file bytes;
- no `index.md` contains an email address or phone number (delegated to
  `pii-patterns.mjs`, the single definition of PII).

`--self-test` runs the check against in-memory broken fixtures (missing twin,
bad digest, no Content-Signal) and must fail each, per the project rule that
a check that has never failed is not known to work.

Canary test, run once by hand and recorded in the plan: put the private
canary string into a `dist/**/index.md` and confirm `check-visibility` exits
1.

Post-deploy, by hand: the edge-rule curl checks in the doc, then a scan at
isitagentready.com. Open question the scan answers: whether GitHub Pages
serves `.md` as `text/markdown` (rule 3 above exists only as a fallback).

## Files touched

- new: `scripts/build-markdown.mjs`, `scripts/check-agent.mjs`,
  `src/agent-skills/neel-deshmukh-profile/SKILL.md`,
  `docs/cloudflare-edge-rules.md`
- changed: `src/layouts/Base.astro`, `public/robots.txt`, `public/llms.txt`,
  `package.json` (build script, `turndown` devDependency), `CLAUDE.md`
  (agent-readiness section, new commands, the "static forever" decision)

## Risks

- Turndown output quality on the hand-written `experience` page. Mitigation:
  read the generated markdown for each page during implementation and fix
  the HTML structure if it converts badly, rather than post-processing.
- The `TerminalIntro` component renders inside `<body>` but outside `<main>`,
  so it is excluded. Confirm during implementation.
- `Vary: Accept` on HTML reduces cache sharing slightly. Acceptable for a
  small static site.
