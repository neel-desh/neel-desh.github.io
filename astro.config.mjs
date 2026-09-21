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

// Static output, deployed to Cloudflare Pages (edge-cached by default).
// The chat and capture endpoints are Pages Functions in ./functions, so they
// ship in the same deploy as the site rather than as a separate Worker.
export default defineConfig({
  site: 'https://neeldeshmukh.com',
  output: 'static',
  compressHTML: true,
  integrations: [
    sitemap({
      // The authoring surface is not part of the public site.
      filter: (page) => !page.includes('/capture'),
    }),
    sitemapAlias,
  ],
});
