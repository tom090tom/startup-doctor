import test from 'node:test';
import assert from 'node:assert/strict';
import { symlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { readProject } from '../src/input.js';
import { project, put } from './helpers.js';

test('reads assignment names from template without returning any values', async t => {
  const root = await project(t);
  await put(root, '.env.example', '# config\nexport API_KEY=NEVER_SHOW_THIS\nDATABASE_URL="private"\nAPI_KEY=again\n');
  const input = await readProject(root);
  assert.deepEqual(input.config, { env: ['API_KEY', 'DATABASE_URL'], ports: [] });
  assert.ok(!JSON.stringify(input).includes('NEVER_SHOW_THIS'));
  assert.ok(!JSON.stringify(input).includes('private'));
});

test('explicit config env replaces template and an empty list disables inference', async t => {
  const root = await project(t);
  await put(root, '.env.example', 'API_KEY=placeholder');
  await put(root, 'startup-doctor.json', '{"env":[],"ports":[3000,3000,8080]}');
  const input = await readProject(root);
  assert.deepEqual(input.config, { env: [], ports: [3000, 8080] });
});

for (const [name, config] of [
  ['unknown executable option', { command: 'npm install' }],
  ['invalid env name', { env: ['X\nSECRET'] }],
  ['wrong env type', { env: 'SECRET' }],
  ['too many variables', { env: Array.from({ length: 101 }, (_, i) => `V${i}`) }],
  ['invalid port zero', { ports: [0] }],
  ['invalid fractional port', { ports: [3000.5] }],
  ['invalid port string', { ports: ['3000'] }],
  ['port out of range', { ports: [65536] }],
  ['too many ports', { ports: Array.from({ length: 17 }, (_, i) => i + 1) }],
  ['array instead of object', []],
  ['prototype-looking option', JSON.parse('{"__proto__":{}}')]
]) {
  test(`rejects ${name}`, async t => {
    const root = await project(t);
    await put(root, 'startup-doctor.json', JSON.stringify(config));
    await assert.rejects(readProject(root), { code: 'INPUT_INVALID' });
  });
}

test('malformed JSON error does not echo source or parser messages', async t => {
  const root = await project(t);
  await put(root, 'package.json', '{"secret":"DO_NOT_LEAK", broken');
  await assert.rejects(readProject(root), error => error.code === 'INPUT_INVALID' && !error.message.includes('DO_NOT_LEAK'));
});

test('rejects overlarge package metadata before parsing', async t => {
  const root = await project(t);
  await put(root, 'package.json', JSON.stringify({ description: 'x'.repeat(256 * 1024) }));
  await assert.rejects(readProject(root), { code: 'INPUT_INVALID' });
});

test('rejects dependency path traversal before any installed package access', async t => {
  const root = await project(t, { dependencies: { '../outside': '*' } });
  await assert.rejects(readProject(root), { code: 'INPUT_INVALID' });
});

test('rejects invalid manifest structure and excessive direct dependencies', async t => {
  const root = await project(t, { dependencies: Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`pkg${i}`, '*'])) });
  await assert.rejects(readProject(root), { code: 'INPUT_INVALID' });
  await put(root, 'package.json', '{"engines":{"node":12}}');
  await assert.rejects(readProject(root), { code: 'INPUT_INVALID' });
});

test('unsupported template syntax is visible as a warning without quoting the line', async t => {
  const root = await project(t);
  await put(root, '.env.example', 'A=placeholder\nmalformed SECRET_SHOULD_NOT_APPEAR\n');
  const input = await readProject(root);
  assert.deepEqual(input.config.env, ['A']);
  assert.equal(input.warnings.length, 1);
  assert.ok(!JSON.stringify(input).includes('SECRET_SHOULD_NOT_APPEAR'));
});

test('rejects config reached through an external directory junction', async t => {
  const root = await project(t);
  const outside = await project(t);
  await put(outside, 'nested/startup-doctor.json', '{}');
  await symlink(join(outside, 'nested'), join(root, 'linked'), 'junction');
  const { readJsonInside } = await import('../src/input.js');
  await assert.rejects(readJsonInside(root, 'linked/startup-doctor.json', 65536), { code: 'INPUT_INVALID' });
});

test('does not read actual .env files', async t => {
  const root = await project(t);
  await put(root, '.env', 'ACTUAL_SECRET=KEEP_PRIVATE');
  const input = await readProject(root);
  assert.deepEqual(input.config.env, []);
  assert.equal(input.warnings.length, 1);
  assert.ok(!JSON.stringify(input).includes('KEEP_PRIVATE'));
});

test('rejects an env template symlink even when its target stays inside the project', async t => {
  const root = await project(t);
  await put(root, '.env', 'REAL_KEY=PRIVATE_VALUE');
  try { await symlink(join(root, '.env'), join(root, '.env.example'), 'file'); }
  catch (error) {
    if (error.code === 'EPERM') return t.skip('Windows requires symlink privilege; hardlink rejection is verified separately.');
    throw error;
  }
  await assert.rejects(readProject(root), { code: 'INPUT_INVALID' });
});

test('rejects hardlinked env templates before reading shared credential content', async t => {
  const root = await project(t);
  await put(root, '.env', 'REAL_KEY=PRIVATE_VALUE');
  await link(join(root, '.env'), join(root, '.env.example'));
  await assert.rejects(readProject(root), { code: 'INPUT_INVALID' });
});
