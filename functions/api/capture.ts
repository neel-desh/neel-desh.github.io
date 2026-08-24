/**
 * The capture endpoint: turns a submitted form into a committed moment.
 *
 * ## Why this commits to git instead of writing to a database
 *
 * The store stays git. A database would make two sources of truth and would
 * put content live without passing the build gates, which is exactly the
 * property this site is built to guarantee. Committing a .md file means a new
 * moment goes through check-visibility and check-pii on the next build like
 * everything else. Nothing reaches the deployed artifact by a side door.
 *
 * ## Auth
 *
 * The route sits behind Cloudflare Access, which blocks unauthenticated
 * requests at the edge. That is not treated as sufficient here: Access is
 * configured in a dashboard, and a misconfigured or removed policy would
 * silently open a write path to the repository. So the Access JWT is verified
 * in this function as well - signature, audience, issuer, expiry.
 *
 * Defence in depth is the whole point. The edge check and this check fail
 * independently.
 */
import { findPii } from '../../src/lib/pii-patterns.mjs';

interface Env {
  /** Fine-grained PAT, Contents: write, scoped to this repo only. */
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
  /** e.g. "yourteam" for yourteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string;
  /** The Access application's AUD tag. */
  ACCESS_AUD: string;
}

const KINDS = ['built', 'solved', 'scaled', 'operated', 'learned'] as const;
const VISIBILITIES = ['public', 'unlisted', 'private'] as const;

type Kind = (typeof KINDS)[number];
type Visibility = (typeof VISIBILITIES)[number];

interface CapturePayload {
  title?: unknown;
  kind?: unknown;
  date?: unknown;
  org?: unknown;
  summary?: unknown;
  body?: unknown;
  project?: unknown;
  stack?: unknown;
  metrics?: unknown;
  visibility?: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ---------------------------------------------------------------------------
// Cloudflare Access JWT verification
// ---------------------------------------------------------------------------

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
}

/**
 * Verifies an Access JWT. Returns the caller's email, or null.
 *
 * Deliberately returns null rather than throwing on every failure path, so a
 * malformed token and an expired one are indistinguishable to the caller.
 */
async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; email?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    return null;
  }

  // Only RS256. Refusing "none" and HMAC algorithms explicitly, because
  // accepting whatever the token asks for is the classic JWT vulnerability.
  if (header.alg !== 'RS256' || !header.kid) return null;

  const issuer = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload.iss !== issuer) return null;

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;

  const certsRes = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!certsRes.ok) return null;
  const { keys } = (await certsRes.json()) as { keys: Jwk[] };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!ok) return null;

  return payload.email ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Moment construction
// ---------------------------------------------------------------------------

/** Kebab-case slug, ASCII only, capped. Also the filename, so it must be safe. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** YAML string escape. Everything user-supplied is quoted and escaped. */
function yamlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildMarkdown(m: {
  title: string;
  kind: Kind;
  date: string;
  org?: string;
  summary: string;
  metrics: { label: string; value: string }[];
  stack: string[];
  project?: string;
  visibility: Visibility;
  body: string;
}): string {
  const lines = ['---'];
  lines.push(`title: ${yamlString(m.title)}`);
  lines.push(`kind: ${m.kind}`);
  lines.push(`date: ${m.date}`);
  if (m.org) lines.push(`org: ${yamlString(m.org)}`);
  lines.push(`summary: ${yamlString(m.summary)}`);
  if (m.metrics.length > 0) {
    lines.push('metrics:');
    for (const x of m.metrics) {
      lines.push(`  - label: ${yamlString(x.label)}`);
      lines.push(`    value: ${yamlString(x.value)}`);
    }
  } else {
    lines.push('metrics: []');
  }
  lines.push(`stack: [${m.stack.map(yamlString).join(', ')}]`);
  if (m.project) lines.push(`project: ${yamlString(m.project)}`);
  lines.push(`visibility: ${m.visibility}`);
  lines.push('---');
  lines.push('');
  if (m.body.trim()) {
    lines.push(m.body.trim());
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * UTF-8 safe base64, which is what the GitHub contents API wants.
 * Chunked rather than spread into fromCharCode: a spread of a long byte array
 * blows the argument limit, and this content is user-supplied.
 */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function asStringArray(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, cap);
}

// ---------------------------------------------------------------------------

const handlePost: PagesFunction<Env> = async ({ request, env }) => {
  for (const required of ['GITHUB_TOKEN', 'GITHUB_REPO', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD'] as const) {
    if (!env[required]) return json({ error: 'capture is not configured' }, 503);
  }

  // ---- auth ---------------------------------------------------------------
  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ??
    (request.headers.get('Cookie') ?? '').match(/CF_Authorization=([^;]+)/)?.[1];

  if (!token) return json({ error: 'unauthorized' }, 401);

  const email = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  if (!email) return json({ error: 'unauthorized' }, 401);

  // ---- parse and validate -------------------------------------------------
  let body: CapturePayload;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'malformed json' }, 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  if (!title || title.length > 140) return json({ error: 'title is required, max 140 chars' }, 400);
  if (!summary || summary.length > 500) return json({ error: 'summary is required, max 500 chars' }, 400);

  const kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : null;
  if (!kind) return json({ error: `kind must be one of: ${KINDS.join(', ')}` }, 400);

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : null;
  if (!date) return json({ error: 'date must be YYYY-MM-DD' }, 400);

  // Fails closed, exactly like the schema default. An unrecognised value is
  // not an error here, it is simply private - the safe reading of ambiguity.
  const visibility: Visibility = VISIBILITIES.includes(body.visibility as Visibility)
    ? (body.visibility as Visibility)
    : 'private';

  const org = typeof body.org === 'string' ? body.org.trim().slice(0, 80) : undefined;
  const project = typeof body.project === 'string' ? body.project.trim().slice(0, 80) : undefined;
  const momentBody = typeof body.body === 'string' ? body.body.slice(0, 4000) : '';
  const stack = asStringArray(body.stack, 12);

  const metrics = Array.isArray(body.metrics)
    ? body.metrics
        .filter(
          (x): x is { label: string; value: string } =>
            !!x && typeof x === 'object' &&
            typeof (x as any).label === 'string' &&
            typeof (x as any).value === 'string'
        )
        .map((x) => ({ label: x.label.trim().slice(0, 60), value: x.value.trim().slice(0, 60) }))
        .filter((x) => x.label && x.value)
        .slice(0, 6)
    : [];

  // ---- PII gate, before anything is written -------------------------------
  // The build gate scans dist/, which is too late to be the only check: a
  // committed moment containing a phone number would break the build and sit
  // in git history forever. Same shared patterns, applied at the front door.
  const scanned = [title, summary, org ?? '', momentBody, ...stack,
    ...metrics.flatMap((m) => [m.label, m.value])].join('\n');
  const piiHits = findPii(scanned);
  if (piiHits.length > 0) {
    return json(
      {
        error: 'that contains something that looks like personal data',
        detail: piiHits.map((h) => h.rule),
      },
      422
    );
  }

  // ---- commit -------------------------------------------------------------
  const slug = slugify(title);
  if (!slug) return json({ error: 'title produced an empty slug' }, 400);

  const path = `src/content/moments/${slug}.md`;
  const markdown = buildMarkdown({
    title, kind, date, org, summary, metrics, stack, project, visibility, body: momentBody,
  });

  const branch = env.GITHUB_BRANCH ?? 'main';
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const ghHeaders = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'neeldeshmukh-capture',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // An existing file needs its blob sha to update. Absent means create.
  const existing = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
    headers: ghHeaders,
  });
  const sha = existing.ok ? ((await existing.json()) as { sha: string }).sha : undefined;

  const commit = await fetch(apiBase, {
    method: 'PUT',
    headers: ghHeaders,
    body: JSON.stringify({
      message: `${sha ? 'Update' : 'Add'} moment: ${title}`,
      content: base64(markdown),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!commit.ok) {
    const detail = await commit.text();
    return json({ error: 'could not write to the repository', detail: detail.slice(0, 200) }, 502);
  }

  const { content } = (await commit.json()) as { content: { html_url: string } };
  return json({
    ok: true,
    path,
    visibility,
    updated: Boolean(sha),
    url: content?.html_url ?? null,
    capturedBy: email,
  });
};

/** Explicit method contract, same reasoning as functions/api/chat.ts. */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'POST') return handlePost(ctx);
  return new Response(JSON.stringify({ error: 'POST a moment to this endpoint' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  });
};
