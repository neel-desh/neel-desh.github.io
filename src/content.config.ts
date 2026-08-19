import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Visibility is the one knob that decides what leaves this repo.
 *
 *   public   — rendered on the site AND embedded into the public chat corpus
 *   unlisted — rendered if linked directly, never embedded into the corpus
 *   private  — never rendered, never embedded, never leaves the build machine
 *
 * Enforcement lives in src/lib/visibility.ts. Nothing else may filter on this
 * field — one gate, so there is exactly one thing to audit.
 */
const visibility = z.enum(['public', 'unlisted', 'private']).default('private');

/** The atomic unit: one dated, evidenced thing that happened. */
const moments = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/moments' }),
  schema: z.object({
    title: z.string(),
    // How this moment counts. Drives the rollups on /work.
    kind: z.enum(['built', 'solved', 'scaled', 'operated', 'learned']),
    date: z.date(),
    org: z.string().optional(),
    summary: z.string(),
    // Evidence. Keep these copy-pasteable from a dashboard, not vibes.
    metrics: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .default([]),
    stack: z.array(z.string()).default([]),
    // Optional link to the long-form case study this moment belongs to.
    project: z.string().optional(),
    visibility,
  }),
});

/** Long-form project write-ups. Aggregate several moments. */
const caseStudies = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/case-studies' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.date(),
    org: z.string().optional(),
    role: z.string().optional(),
    stack: z.array(z.string()).default([]),
    problem: z.string(),
    outcome: z.string(),
    order: z.number().default(0),
    visibility,
  }),
});

export const collections = { moments, 'case-studies': caseStudies };
