# neeldeshmukh.com — working context

Personal site for Neel Deshmukh. This file is the durable memory for the
redesign: the decisions, why they were made, and what is still open.

> This repo is public. Do not commit personal contact details, private
> analytics, or anything not already on the public site.

## Current state

Branch `redesign` (off `main`). Two commits so far:

1. **Rebuild on Astro, replacing Hugo** — static Astro/TypeScript site, new
   design, terminal-boot intro, Hugo config/theme/`public/` output removed.
2. **Moment store with build-time visibility enforcement** — the data layer
   described below, seeded with real work.

`main` is still the old Hugo site. Nothing has been merged yet.

## Stack, and why

| Choice | Reason |
| --- | --- |
| Astro, `output: 'static'` | Site must stay static and edge-cached. No server runtime in the site itself. |
| No client framework | Nothing on the page needs one. Keeps the payload near zero. |
| Cloudflare Pages | Build `npm run build`, output `dist`. Custom domain configured in the Pages dashboard. |
| Chat as a separate Worker | Keeps the "few moving parts" constraint — the site stays a plain static deploy. |

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
- `/corpus.json` — the chat's retrieval set

Schema lives in `src/content.config.ts`.

## The visibility guarantee

**This is the load-bearing design decision. Do not weaken it.**

Every entry is `public`, `unlisted`, or `private`, defaulting to **private** —
an unmarked entry fails closed and cannot ship by accident.

`src/lib/visibility.ts` is the *only* place the field is interpreted. It splits
two different questions:

- `isRenderable` — may this be built into a page (includes `unlisted`)
- `isInCorpus` — may this be embedded into the chat corpus (`public` only)

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

## Next: the RAG chat

Design settled, **UX not yet specified — waiting on Neel's ideas.**

Architecture decided:

- Corpus is small (~16 chunks today, maybe 50–100 eventually). **No vector DB.**
  Vectorize is overkill at this size.
- Embed at build time → ship `corpus-embedded.json` as a static asset
  (~100 chunks × 384 dims ≈ 150KB, less if quantized).
- **Cosine similarity in the browser.** Retrieval is instant, offline, free.
- The Worker does **generation only** — stateless, tiny, no bindings, no
  ingestion pipeline. One moving part instead of four.
- Cloudflare Workers AI free tier (bge embeddings + a Llama for generation).
  If quality disappoints, swapping the Worker's upstream is a ~10-line change;
  Claude Haiku 4.5 is $1/$5 per MTok, pennies a month at this traffic. Not
  needed to start.

Open questions for Neel:

- Dedicated page, or inline on the homepage?
- Does it cite sources back to case studies?
- Framing — "ask about my work", or something more opinionated?
- Behaviour when asked something outside the corpus?

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

**Punch** (2022–present), Software Engineer

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
npm run dev              # local dev
npm run build            # build + visibility check
npm run check            # astro check (typecheck)
npm run check:visibility # leak check alone (needs an existing dist/)
```

## Conventions

- Adding a moment: drop a `.md` in `src/content/moments/`, set `visibility`
  explicitly, attach `metrics` you could point at a dashboard for. Link it to a
  case study with `project: <case-study-id>`.
- Metrics are evidence, not vibes — keep them copy-pasteable from something
  real.
- Never filter on `visibility` outside `src/lib/visibility.ts`. One gate means
  one thing to audit.
