import { defineConfig } from 'astro/config';

// Static output, deployed to Cloudflare Pages (edge-cached by default).
// The RAG chat endpoint lives in a separate Cloudflare Worker (see /worker),
// so the site itself stays a plain static build with no server runtime.
export default defineConfig({
  site: 'https://neeldeshmukh.com',
  output: 'static',
  compressHTML: true,
});
