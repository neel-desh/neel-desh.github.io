import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, parseSkill, buildIndex, buildAgentSkills } from './lib/agent-skills.mjs';

const SKILL = `---
name: demo
description: A demo skill.
---

# Demo
`;

test('sha256 is prefixed and stable', () => {
  assert.equal(
    sha256('abc'),
    'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('parseSkill reads name and description', () => {
  assert.deepEqual(parseSkill(SKILL), { name: 'demo', description: 'A demo skill.' });
});

test('parseSkill throws without frontmatter or fields', () => {
  assert.throws(() => parseSkill('# no frontmatter'), /no frontmatter/);
  assert.throws(() => parseSkill('---\nname: x\n---\n'), /name and description/);
});

test('buildIndex shapes entries per the discovery schema', () => {
  const index = buildIndex([{ name: 'demo', description: 'A demo skill.', digest: 'sha256:00' }]);
  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.deepEqual(index.skills, [
    {
      name: 'demo',
      type: 'skill-md',
      description: 'A demo skill.',
      url: '/.well-known/agent-skills/demo/SKILL.md',
      digest: 'sha256:00',
    },
  ]);
});

test('buildAgentSkills publishes files and an index whose digest matches the bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skills-'));
  const src = join(root, 'src');
  const dist = join(root, 'dist');
  await mkdir(join(src, 'demo'), { recursive: true });
  await writeFile(join(src, 'demo', 'SKILL.md'), SKILL);
  await mkdir(dist);

  assert.equal(await buildAgentSkills(src, dist), 1);

  const published = await readFile(join(dist, '.well-known/agent-skills/demo/SKILL.md'));
  const index = JSON.parse(await readFile(join(dist, '.well-known/agent-skills/index.json'), 'utf8'));
  assert.equal(index.skills[0].digest, sha256(published));
});

test('buildAgentSkills rejects a name that differs from its directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skills-'));
  const src = join(root, 'src');
  await mkdir(join(src, 'other'), { recursive: true });
  await writeFile(join(src, 'other', 'SKILL.md'), SKILL);
  await mkdir(join(root, 'dist'));
  await assert.rejects(buildAgentSkills(src, join(root, 'dist')), /does not match directory/);
});
