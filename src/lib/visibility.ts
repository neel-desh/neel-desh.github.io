import { getCollection, type CollectionEntry } from 'astro:content';

export type Visibility = 'public' | 'unlisted' | 'private';

type Entry = CollectionEntry<'moments'> | CollectionEntry<'case-studies'>;

/**
 * The only place visibility is interpreted.
 *
 * Two audiences, deliberately different:
 *
 *   renderable — what may be built into a page. Includes `unlisted`, which is
 *                reachable by direct link but never indexed or listed.
 *   corpus     — what may be embedded and shipped to the browser as part of
 *                the chat corpus. `public` only.
 *
 * The corpus rule is the load-bearing one. A private moment is never embedded,
 * so it is not merely hidden behind a check — it is absent from the published
 * artifact entirely, and no amount of prompting at the chat can surface it.
 */
export function isRenderable(entry: Entry): boolean {
  return entry.data.visibility !== 'private';
}

export function isInCorpus(entry: Entry): boolean {
  return entry.data.visibility === 'public';
}

/** Moments that may be rendered, newest first. */
export async function getRenderableMoments() {
  const all = await getCollection('moments', isRenderable);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Moments that may be listed in indexes (excludes `unlisted`), newest first. */
export async function getListedMoments() {
  const all = await getCollection('moments', isInCorpus);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Case studies that may be rendered, by explicit order. */
export async function getRenderableCaseStudies() {
  const all = await getCollection('case-studies', isRenderable);
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** Case studies that may be listed in indexes, by explicit order. */
export async function getListedCaseStudies() {
  const all = await getCollection('case-studies', isInCorpus);
  return all.sort((a, b) => a.data.order - b.data.order);
}
