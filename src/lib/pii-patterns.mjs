/**
 * What counts as PII. The only definition of it in this repo.
 *
 * Imported by both scripts/check-pii.mjs (build gate, scans dist/) and
 * functions/api/chat.ts (runtime gate, scans the model's answer). Same
 * principle as src/lib/visibility.ts: one gate, so there is exactly one
 * thing to audit and the two ends cannot drift apart.
 *
 * Plain .mjs so the Node build script and the Worker bundle can both read it.
 *
 * Every pattern here has a canary in scripts/check-pii.mjs's test block.
 * A rule with no proof it can fire is not a rule.
 */

/**
 * Public on purpose. Substring-matched both ways against a hit, so a match
 * that sits inside one of these is not a finding.
 */
export const ALLOW = [
  'github.com/neel-desh',
  'github.com/punchhq',
  'linkedin.com/in/neeldeshmukh',
  'neeldeshmukh.com',
  '@astrojs',
  '@type',
  '@media',
  '@import',
  '@font-face',
  '@keyframes',
  '@charset',
  '@supports',
];

export const PATTERNS = [
  {
    // Not matching bare @handles - too many false hits in CSS and JS.
    name: 'email address',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    // Bare 10-digit, and the 5+5 grouping people actually write by hand.
    name: 'Indian phone number',
    re: /\b[6-9]\d{9}\b|\b[6-9]\d{4}[\s-]\d{5}\b/g,
  },
  {
    // Country code then 10-12 digits. Separators allowed between digits but
    // capped at two chars, so the match cannot run across a sentence break.
    name: 'international phone number',
    re: /\+\d{1,3}(?:[\s.()-]{0,2}\d){9,12}\b/g,
  },
  {
    name: 'PAN number',
    re: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  },
  {
    // Not followed by more digits, so a 16-digit card is not mislabelled here.
    name: 'Aadhaar number',
    re: /\b\d{4}\s?\d{4}\s?\d{4}\b(?![\s-]?\d)/g,
  },
  {
    name: 'payment card number',
    re: /\b(?:\d[ -]?){13,19}\b/g,
  },
];

export function isAllowed(hit) {
  return ALLOW.some((a) => hit.includes(a) || a.includes(hit));
}

/** Every non-allowlisted PII match in `text`. Empty array means clean. */
export function findPii(text) {
  const out = [];
  for (const { name, re } of PATTERNS) {
    // Fresh regex per call: /g lastIndex is stateful and these are module-level.
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      if (isAllowed(m[0])) continue;
      out.push({ rule: name, hit: m[0] });
    }
  }
  return out;
}
