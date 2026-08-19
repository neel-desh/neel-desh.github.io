# neeldeshmukh.com

Personal site. Astro (static output), TypeScript, no client framework runtime.

## Develop

```
npm install
npm run dev
```

## Content

- `src/pages/about.astro` — about page copy
- `src/content/case-studies/*.md` — project deep-dives (frontmatter schema in `src/content/config.ts`); set `draft: true` to keep a case study out of the listing while it's in progress

## Deploy

Static build (`npm run build` → `dist/`), deployed on Cloudflare Pages
connected directly to this repo (build command `npm run build`, output
directory `dist`) — no GitHub Actions deploy step needed. Custom domain
(`neeldeshmukh.com`) is configured in the Cloudflare Pages dashboard.

The AI chat feature (in progress) will be a separate Cloudflare Worker, kept
out of this build so the site itself stays a plain static, edge-cached
deploy.
