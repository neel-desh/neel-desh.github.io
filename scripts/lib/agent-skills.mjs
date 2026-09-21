/**
 * Publishes agent skills at /.well-known/agent-skills/ per the Agent Skills
 * Discovery schema. Digests are computed from the bytes being published, so
 * the index cannot go stale.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const BASE = '/.well-known/agent-skills';

export function sha256(buf) {
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
}

/** Reads `name` and `description` from SKILL.md frontmatter (single-line values). */
export function parseSkill(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('SKILL.md has no frontmatter');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  if (!fm.name || !fm.description) {
    throw new Error('SKILL.md frontmatter needs name and description');
  }
  return { name: fm.name, description: fm.description };
}

export function buildIndex(skills) {
  return {
    $schema: SCHEMA,
    skills: skills.map(({ name, description, digest }) => ({
      name,
      type: 'skill-md',
      description,
      url: `${BASE}/${name}/SKILL.md`,
      digest,
    })),
  };
}

/** Copies every <srcDir>/<name>/SKILL.md into dist and writes the index. */
export async function buildAgentSkills(srcDir, distDir) {
  const entries = (await readdir(srcDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const skills = [];
  for (const entry of entries) {
    const bytes = await readFile(join(srcDir, entry.name, 'SKILL.md'));
    const { name, description } = parseSkill(bytes.toString('utf8'));
    if (name !== entry.name) {
      throw new Error(`skill name "${name}" does not match directory "${entry.name}"`);
    }
    const outDir = join(distDir, BASE, name);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'SKILL.md'), bytes);
    skills.push({ name, description, digest: sha256(bytes) });
  }

  await mkdir(join(distDir, BASE), { recursive: true });
  await writeFile(join(distDir, BASE, 'index.json'), JSON.stringify(buildIndex(skills), null, 2) + '\n');
  return skills.length;
}
