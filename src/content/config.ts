import { defineCollection, z } from 'astro:content';

const caseStudies = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.date(),
    stack: z.array(z.string()).default([]),
    role: z.string().optional(),
    problem: z.string(),
    outcome: z.string(),
    draft: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

export const collections = {
  'case-studies': caseStudies,
};
