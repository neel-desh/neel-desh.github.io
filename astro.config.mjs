import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
  ],
});
