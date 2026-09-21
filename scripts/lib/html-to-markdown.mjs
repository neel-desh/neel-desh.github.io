/**
 * Turns a built page into its markdown twin.
 *
 * Pure: HTML string in, markdown string out, so it is unit-testable without a
 * build. Only <main> is converted. The header, nav, roles banner and footer
 * sit outside it in Base.astro and are chrome, not content.
 */
import TurndownService from 'turndown';

const SITE = 'https://neeldeshmukh.com';

const td = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});
td.remove(['script', 'style', 'svg']);

// Icon-only links (the GitHub and LinkedIn marks) have their svg removed above
// and would become "[](url)". Their aria-label is the accessible name, so use
// it. Links that already have visible text keep it.
td.addRule('labelled-link', {
  filter: (node) => node.nodeName === 'A' && node.getAttribute('href') && node.getAttribute('aria-label'),
  replacement: (content, node) =>
    `[${content.trim() || node.getAttribute('aria-label')}](${node.getAttribute('href')})`,
});

// Tag chips are separate spans with no whitespace between them, spaced by CSS
// only. As text they run together ("ElixirGoRuby"), so join them with commas.
td.addRule('tag-chip', {
  filter: (node) => node.nodeName === 'SPAN' && node.classList.contains('tag'),
  replacement: (content, node) =>
    node.nextElementSibling?.classList.contains('tag') ? `${content}, ` : content,
});

/** &amp; last, so an escaped entity is not decoded twice. */
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#38;/g, '&')
    .replace(/&amp;/g, '&');
}

export function convertPage(html) {
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1] ?? '';
  const title = head.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  const description = head.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const url = head.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!title || !description || !url) {
    throw new Error('page head is missing title, description or canonical');
  }

  const main = html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1];
  if (main === undefined) throw new Error('page has no <main>');

  // Site-relative links only. The negative lookahead leaves "//host" alone.
  const absolute = main.replace(/\b(href|src)="\/(?!\/)/g, `$1="${SITE}/`);
  const body = td.turndown(absolute).trim();
  if (!body) throw new Error('page <main> converted to an empty body');

  const cleanTitle = decodeEntities(title);
  const cleanDescription = decodeEntities(description);
  const frontmatter =
    `---\n` +
    `title: ${JSON.stringify(cleanTitle)}\n` +
    `description: ${JSON.stringify(cleanDescription)}\n` +
    `url: ${JSON.stringify(url)}\n` +
    `---\n\n`;

  return {
    title: cleanTitle,
    description: cleanDescription,
    url,
    body,
    markdown: `${frontmatter}${body}\n`,
  };
}
