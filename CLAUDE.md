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

## The RAG chat — built

Lives in `functions/api/chat.ts` as a Cloudflare Pages Function, in the same
repo and same deploy as the site. **Not** a separate Worker: Pages Functions
mean one thing to deploy and version, which serves the "few moving parts"
constraint better than the original plan did.

### There is no vector search, on purpose

The earlier plan (build-time embeddings, `corpus-embedded.json`, browser-side
cosine similarity) was **dropped**. Two reasons:

1. It does not survive the switch to Gemini. Embedding the *query* needs an API
   call with a key, so the browser cannot retrieve without either shipping the
   key or loading ~20MB of transformers.js.
2. At 16 chunks (~8K tokens) the whole corpus fits in one prompt. An index
   would add an embedding model, stored vectors, and a drift problem between
   the index and the content, in exchange for nothing at this size.

So every call sends the entire public corpus. Revisit past **~100 chunks**,
where the prompt starts costing more than an index would.

The side benefit matters more than the cost saving: the whole prompt is
auditable. There is no retrieval step that might quietly pull the wrong thing,
and "only public content is reachable" is enforced by what the build wrote to
disk rather than by a similarity threshold.

### Model

`gemini-3.5-flash-lite` (cheapest GA tier), called over the REST API with
`x-goog-api-key`.

> **`gemini-embedding-001` was shut down 2026-07-14.** If embeddings are ever
> reintroduced, the replacement is `gemini-embedding-2`. Note the models page
> still listed the dead model as GA in Aug 2026, so re-verify rather than
> trusting the docs page.

### Guardrails, in the order they run

| Layer | What | Where |
| --- | --- | --- |
| L0 | Private content absent from `dist/`, so it cannot be retrieved at all | `check-visibility.mjs` |
| L1 | Input guard: method, content-type, size, injection patterns, rate limit | `chat.ts` |
| L2 | Structured output — model must return JSON matching a schema | `responseSchema` |
| L3 | Citation validation — a cited id not in the corpus voids the answer | `chat.ts` |
| L4 | Output PII scan, same patterns as the build gate | `pii-patterns.mjs` |

**L0 does most of the work. L3 is the one people skip** — a fabricated citation
is the signature of a fabricated answer, and catching it is deterministic.

L1's injection list is a speed bump, not a wall. It exists to avoid paying for
obvious garbage; L0 is what actually makes the endpoint safe.

### UX (settled)

- **Floating dock**, fixed to the bottom of the viewport, rounded, on every
  page except `/capture`. It is the front door, so it does not scroll away.
- The answer stacks **above the input inside the same block**, so question,
  answer, and sources stay one object.
- **Cites every source** as a pill linking to the case study.
- Starters are deliberately specific. "Ask me anything" gets vague questions,
  and vague questions get vague answers.
- Out of corpus → says so plainly rather than guessing.
- The dock is `position: fixed`, so a `ResizeObserver` reserves matching
  bottom padding on `body`. Without it the dock covers the end of every page.

## PII enforcement

`src/lib/pii-patterns.mjs` is the **only** definition of what counts as PII,
imported by both the build gate (`scripts/check-pii.mjs`, scans `dist/`) and
the chat function (scans the model's answer). Same one-gate principle as
`visibility.ts`: the two ends cannot drift apart.

Literal strings (real email, real phone) live in `.pii-denylist`, which is
**gitignored** — committing it would defeat its own purpose.

`node scripts/check-pii.mjs --self-test` runs 10 canaries, one per pattern,
and is wired into `npm run build`. Same discipline as the visibility canary:
**a check that has never failed is not known to work.**

A real gap this caught: the first phone regex missed `+91 98765 43210`, the
most common written Indian format, because it required 10 consecutive digits.

## Capture — deployed, behind Cloudflare Access

`/capture` is a form; `functions/api/capture.ts` **commits a `.md` to the repo**
via the GitHub contents API.

**Why git and not a database:** a database would make two sources of truth and
would put content live without passing the build gates. Committing a file means
a new moment clears `check-visibility` and `check-pii` on the next build like
anything written by hand. There is no path from the form to the live site that
skips them.

Auth is Cloudflare Access, but **the JWT is verified in the function as well**.
Access is configured in a dashboard; a removed or misconfigured policy would
otherwise silently open a write path to the repository. The edge check and the
function check fail independently.

Verified rejected: no token, garbage, `alg=none`, HS256 algorithm confusion,
wrong issuer, wrong audience, expired. The signature-verify path itself can
only be tested against a real Access tenant.

Visibility on capture **fails closed**: an unrecognised value becomes `private`,
matching the schema default.

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
npm run dev              # local dev (site only, no Functions)
npm run build            # build + visibility check + pii check
npm run check            # astro check (typecheck)
npm run check:visibility # leak check alone (needs an existing dist/)
npm run check:pii        # pii self-test + scan (needs an existing dist/)

# Functions run only under wrangler, not `astro dev`:
npx wrangler pages dev dist --binding GEMINI_API_KEY=...
npx tsc -p functions/tsconfig.json --noEmit   # functions typecheck
```

`functions/` is excluded from the root tsconfig and carries its own — the
Workers globals conflict with the DOM lib.

## Deploy: Cloudflare Pages

Moved off GitHub Pages. Build `npm run build`, output `dist`, Functions picked
up from `functions/` automatically.

Secrets (dashboard, or `npx wrangler pages secret put <NAME>`) — never in
`wrangler.toml`, which is committed:

| Name | For |
| --- | --- |
| `GEMINI_API_KEY` | chat generation |
| `GITHUB_TOKEN` | fine-grained PAT, **Contents: write**, this repo only |
| `GITHUB_REPO` | `owner/repo` |
| `GITHUB_BRANCH` | optional, defaults to `main` |
| `ACCESS_TEAM_DOMAIN` | `<team>` from `<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | the Access application's AUD tag |

Then add a Cloudflare Access application covering `/capture` **and**
`/api/capture` — protecting only the page would leave the write endpoint open
to anyone who knows the path. The in-function JWT check is the backstop, not
the primary control.

## Conventions

- Adding a moment: drop a `.md` in `src/content/moments/`, set `visibility`
  explicitly, attach `metrics` you could point at a dashboard for. Link it to a
  case study with `project: <case-study-id>`.
- Metrics are evidence, not vibes — keep them copy-pasteable from something
  real.
- Never filter on `visibility` outside `src/lib/visibility.ts`. One gate means
  one thing to audit.
