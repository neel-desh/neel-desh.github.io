import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// @astrojs/sitemap writes sitemap-index.xml and sitemap-0.xml. Search Console
// and most people try /sitemap.xml first, so publish the same urlset there.
// Copied at build time rather than hand-listed, so it cannot drift.
const sitemapAlias = {
  name: 'sitemap-alias',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const out = fileURLToPath(dir);
      await copyFile(`${out}sitemap-0.xml`, `${out}sitemap.xml`);
    },
  },
};

// Fully static output. No server runtime, so it deploys to any static host
// (GitHub Pages via .github/workflows/ci.yaml).
export default defineConfig({
  site: 'https://neeldeshmukh.com',
  output: 'static',
  compressHTML: true,
  integrations: [
    sitemap(),
    sitemapAlias,
  ],
});
