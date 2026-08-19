import type { APIRoute } from 'astro';
import { getListedMoments, getListedCaseStudies } from '../lib/visibility';

/**
 * The chat corpus, emitted as a static asset at build time.
 *
 * Only entries that pass `isInCorpus` (visibility === 'public') are included.
 * Private and unlisted content is not filtered at request time or hidden
 * behind a flag — it is never written into this file, so it does not exist
 * anywhere in the deployed artifact.
 *
 * Embeddings are attached in a later step (scripts/embed.ts) which reads this
 * file, calls the embedding model, and writes corpus-embedded.json. Keeping
 * the two separate means the expensive call only reruns when content changes.
 */

export interface CorpusChunk {
  id: string;
  type: 'moment' | 'case-study';
  title: string;
  url: string | null;
  date: string;
  stack: string[];
  /** Plain text the embedding model sees, and the chat quotes from. */
  text: string;
}

export const GET: APIRoute = async () => {
  const [moments, caseStudies] = await Promise.all([
    getListedMoments(),
    getListedCaseStudies(),
  ]);

  const chunks: CorpusChunk[] = [];

  for (const m of moments) {
    const metrics = m.data.metrics.map((x) => `${x.label}: ${x.value}`).join('. ');
    chunks.push({
      id: `moment:${m.id}`,
      type: 'moment',
      title: m.data.title,
      url: m.data.project ? `/case-studies/${m.data.project}` : null,
      date: m.data.date.toISOString().slice(0, 10),
      stack: m.data.stack,
      text: [
        m.data.title,
        m.data.org ? `At ${m.data.org}.` : '',
        m.data.summary,
        metrics,
        m.body?.trim() ?? '',
        m.data.stack.length ? `Technologies: ${m.data.stack.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  for (const cs of caseStudies) {
    chunks.push({
      id: `case-study:${cs.id}`,
      type: 'case-study',
      title: cs.data.title,
      url: `/case-studies/${cs.id}`,
      date: cs.data.date.toISOString().slice(0, 10),
      stack: cs.data.stack,
      text: [
        cs.data.title,
        cs.data.org ? `At ${cs.data.org}.` : '',
        cs.data.summary,
        `Problem: ${cs.data.problem}`,
        `Outcome: ${cs.data.outcome}`,
        cs.body?.trim() ?? '',
        cs.data.stack.length ? `Technologies: ${cs.data.stack.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  return new Response(JSON.stringify({ chunks }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
