# neeldeshmukh.com — working context

Personal site for Neel Deshmukh. This file is the durable memory for the
redesign: the decisions, why they were made, and what is still open.

> This repo is public. Do not commit personal contact details, private
> analytics, or anything not already on the public site.

## Current state

Merged into `main` (fast-forward, `725d79d`). **The site is fully static.** Pages: home,
experience, about. No Functions, no chat, no capture form: those were built
(commit `0ebf7e5` has all of it, including the RAG chat guardrails and the
Access-verified capture endpoint) and then removed so the site can deploy to
any static host. Restore from that commit if either is wanted again.

`/resume` is a redirect rule to the PDF at the DNS/CDN layer, not in this repo,
so the web resume lives at `/experience`: a page at `/resume` would be
shadowed. It keeps Punch, past tense (Punch shut down; he no longer works
there).

`moments/` and `case-studies/` are no longer rendered as pages. They are kept
as the evidence store and published as `/corpus.json` for machines.

## Stack, and why

| Choice | Reason |
| --- | --- |
| Astro, `output: 'static'` | Site must stay static. No server runtime, so any static host works. |
| No client framework | Nothing on the page needs one. Keeps the payload near zero. |
| GitHub Pages | `.github/workflows/ci.yaml` builds, gates, and deploys on push to `main`. |

Scaffolding note: `npm create astro` does **not** work in the CCR sandbox —
template downloads come from raw GitHub, which is egress-blocked. The npm
registry itself is fine. The project was hand-scaffolded; do the same if
recreating.

## Core model: the moment

The central abstraction, borrowed from mygraph.id (see below). A **moment** is
one dated, evidenced unit of work. Everything else on the site is a
*projection* over that single store — nothing is hand-maintained twice.

- `src/content/moments/*.md` — the store
- `src/content/case-studies/*.md` — long-form write-ups; moments link to one
  via their `project` field

Derived from it:

- Homepage metric tiles (read from moments, so numbers can't drift from the
  evidence behind them)
- `/work` rollups by `kind`: built / solved / scaled / operated / learned
- Case-study "Evidence" sections
- `/corpus.json` — the machine-readable corpus (public entries only)

Schema lives in `src/content.config.ts`.

## The visibility guarantee

**This is the load-bearing design decision. Do not weaken it.**

Every entry is `public`, `unlisted`, or `private`, defaulting to **private** —
an unmarked entry fails closed and cannot ship by accident.

`src/lib/visibility.ts` is the *only* place the field is interpreted. It splits
two different questions:

- `isRenderable` — may this be built into a page (includes `unlisted`)
- `isInCorpus` — may this be published in `/corpus.json` (`public` only)

The claim the site makes is that non-public content is **absent from the
deployed artifact**, not hidden by it. A private moment is never written into
`dist/`, so no amount of prompting the chat can surface it. That is a stronger
and more defensible property than a server-side flag, and it is the main thing
this site does that a hosted profile product structurally cannot.

### Testing it

`scripts/check-visibility.mjs` runs after every build (wired into
`npm run build`), greps all of `dist/` for non-public content, and fails the
build on a leak.

**A test that cannot fail is worthless.** The first attempt at verifying this
was wrong: flipping the canary moment to `public` made the check pass, but only
because that removed it from the set being checked. The correct test is
*private in source, present in `dist/`*:

```sh
npm run build
echo "GOLDENCANARY-DO-NOT-SHIP" > dist/leak-test.html
node scripts/check-visibility.mjs   # must exit 1
rm dist/leak-test.html
```

`src/content/moments/EXAMPLE-private-moment.md` is the permanent canary. Keep
it private.

## Removed: RAG chat and capture

Both are gone from the tree (see `0ebf7e5`). The design that mattered survives
in the build gates: private content is **absent from `dist/`** rather than
hidden by a flag, which is what made the chat safe and still makes `/corpus.json`
safe to publish.

## PII enforcement

`src/lib/pii-patterns.mjs` is the **only** definition of what counts as PII,
used by the build gate (`scripts/check-pii.mjs`, scans `dist/`). Same one-gate
principle as `visibility.ts`: one definition, nothing else decides.

Literal strings (real email, real phone) live in `.pii-denylist`, which is
**gitignored** — committing it would defeat its own purpose.

`node scripts/check-pii.mjs --self-test` runs 10 canaries, one per pattern,
and is wired into `npm run build`. Same discipline as the visibility canary:
**a check that has never failed is not known to work.**

A real gap this caught: the first phone regex missed `+91 98765 43210`, the
most common written Indian format, because it required 10 consecutive digits.

## SEO and GEO

- `Base.astro` owns canonical (always trailing slash, matches the sitemap),
  Open Graph/Twitter tags, and a `jsonLd` prop.
- Person + WebSite JSON-LD on `/`, ProfilePage on `/about` and `/experience`.
  Person carries `alternateName: neeldeshmukh` so the one-word query resolves.
  `jobTitle` is "Software Engineer" (resume), not "Senior": do not claim a title
  not held.
- `public/llms.txt`, `public/og.png`, explicit AI-crawler welcome in `robots.txt`.
- `/experience` is the web resume, hand-written from `resume/src/resume.html`
  (separate repo): keep the two in step. It has **no email or phone on
  purpose**: the PDF does, and this repo is public. `/resume` is the PDF via a
  Cloudflare redirect.
- `/sitemap.xml` is a build-time copy of `sitemap-0.xml` (see `astro.config.mjs`).
- The "open to roles" banner (`RolesBanner.astro`) links `/resume`.
- Known conflict: Myracle video processing. Graph export said cost -77%; resume
  says time -77% and cost -50%. The moment still uses the export's figure.

## Reference: mygraph.id structure

Neel has a profile at `mygraph.id/<slug>`. The site is **egress-blocked from
this sandbox** — it cannot be fetched. This section preserves what was learned
from saved HTML exports (those uploads are gone with the container).

Three surfaces:

- **Capture** — action hub: Trust Signals (verify by connecting GitHub/Kaggle,
  "so what you say can be checked against what you've actually built"), Career
  Studio (resumes, interview prep), Communicate Studio (standups, perf reviews,
  posts), Community.
- **Context / Edit Graph** — data entry (identity, headline with "Rewrite with
  AI", experience, projects, stack, education) plus private analytics.
- **My graph** — the public profile.

The public page is entirely projections over captured moments: signals grouped
Built / Learned / Solved / Scaled / Operated, a growth-trajectory timeline, a
stack cloud ("pulled from the tags attached to captured moments"), case
studies, and an activity heatmap.

**Decision: steal the moment primitive, don't clone the page.** Rebuilding
their UI on a personal domain means shipping a worse copy of a product Neel is
already a user of, with no distribution advantage. What this site does instead:
own the store (git — versioned, diffable, portable), make the chat the front
door rather than a section, and enforce visibility at build time.

Neel chose: *moment store + case studies + chat*, rendering case studies and a
compact record — skipping the heatmap and other product-y widgets.

## Factual record (for content work)

From the graph export. Use these rather than inventing numbers.

**Punch** (2022 until the company shut down, no longer employed there), Software Engineer. Do not describe him as currently at Punch anywhere on the site; past-tense moments are fine.

- Market-data capture & replay engine — Go, NATS JetStream, 20K+ ticks/sec,
  microsecond-precision replay timing
- Kill-switch risk control — Elixir/OTP, atomic cancel + square-off across
  Equity & F&O, fail-open guard so cache outages never block live trading
- Aegis SSO library — adopted across 8 microservices, Google OAuth,
  near-instant session revocation, later extended to gate VPN access
- Candles API — 4–5M requests/day, multi-layer caching
- TimescaleDB migration for candle generation — CPU down 70%+
- In-house Go search engine replacing a third-party API — p99 150–250ms → ~90ms
- UPI / net-banking collection — 99.99% success
- Replication-lag incident — resolved solo in ~2 hours, zero data loss

**Myracle.io** (2021–2022), Early Engineer / SDE2

- Exam-video processing cost cut 77%

**Other**: built a Claude agent harness on top of Claude Code. Studying system
design, DS&A, agentic AI.

**Education**: Jai Hind College, Bachelor of Software Development, 2018–2021.

**Stack**: Elixir, Go, Ruby, Phoenix, Ecto, OTP, NATS, REST, WebSockets, Redis,
PostgreSQL, TimescaleDB, Docker, Prometheus, Git, Linux, Claude Code, MCP,
prompt engineering. Editor: Neovim.

## Commands

```sh
npm install
npm run dev              # local dev server
npm run build            # build + visibility check + pii check
npm run check            # astro check (typecheck)
npm run check:visibility # leak check alone (needs an existing dist/)
npm run check:pii        # pii self-test + scan (needs an existing dist/)
```

## Deploy: GitHub Pages

`.github/workflows/ci.yaml`: every push and PR builds and runs the gates; a push
to `main` also deploys `dist/`. Repo Settings > Pages > Source must be "GitHub
Actions", and the custom domain `neeldeshmukh.com` is set there.

## Conventions

- Adding a moment: drop a `.md` in `src/content/moments/`, set `visibility`
  explicitly, attach `metrics` you could point at a dashboard for. Link it to a
  case study with `project: <case-study-id>`.
- Metrics are evidence, not vibes — keep them copy-pasteable from something
  real.
- Never filter on `visibility` outside `src/lib/visibility.ts`. One gate means
  one thing to audit.
