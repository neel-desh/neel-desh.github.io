# neeldeshmukh.com

Personal site. Astro (static output), TypeScript, no client framework runtime.
Fully static: no server functions, so it deploys to any static host.

## Develop

```
npm install
npm run dev
```

## Build and gates

```
npm run build    # astro build, then the visibility and PII gates
npm run check    # typecheck
```

The build fails if non-public content or anything PII-shaped reaches `dist/`.

## Content

- `src/pages/index.astro`, `about.astro`, `experience.astro` - the pages
- `src/content/moments/*.md`, `src/content/case-studies/*.md` - the evidence
  store. Not rendered as pages; published as `/corpus.json`. Every entry has a
  `visibility` that defaults to `private`.

## Deploy

GitHub Pages, via `.github/workflows/ci.yaml`: every push builds and gates,
a push to `main` also deploys. Set repo Settings > Pages > Source to
"GitHub Actions" and the custom domain to `neeldeshmukh.com`.

`/resume` is a redirect to the PDF, configured at the DNS/CDN layer, not in
this repo. The PDF holds an email and phone number, so it is not committed.
