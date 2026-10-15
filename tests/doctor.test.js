import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { diagnose } from '../src/doctor.js';
import { formatText, exitCode } from '../src/report.js';
import { project, put } from './helpers.js';

const options = { env: {}, nodeVersion: '24.1.0', platform: 'win32' };
const check = (report, id) => report.checks.find(item => item.id === id);
async function listen(t, port = 0) {
  const server = createServer();
  server.listen({ host: '127.0.0.1', port, exclusive: true });
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server.address().port;
}
async function configured(t, pkg) {
  const root = await project(t, pkg);
  await put(root, 'startup-doctor.json', '{"env":[],"ports":[]}');
  return root;
}

test('healthy project produces stable JSON with no failures or warnings on Windows', async t => {
  const root = await configured(t, { engines: { node: '>=22 <25' }, dependencies: { lib: '^1.2.0' } });
  await put(root, 'node_modules/lib/package.json', '{"version":"1.5.0"}');
  const report = await diagnose(root, options);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.toolVersion, '0.1.0');
  assert.equal(check(report, 'runtime:node').status, 'pass');
  assert.equal(check(report, 'dependency:lib').status, 'pass');
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.warn, 0);
  assert.equal(exitCode(report, true), 0);
});

test('reports mismatched Node version with a repair suggestion', async t => {
  const root = await configured(t, { engines: { node: '^20.0.0' } });
  const report = await diagnose(root, options);
  assert.equal(check(report, 'runtime:node').status, 'fail');
  assert.match(check(report, 'runtime:node').fix, /Node/);
  assert.equal(exitCode(report), 1);
});

test('missing or uninterpretable engines are warnings instead of false passes', async t => {
  const root = await configured(t, {});
  assert.equal(check(await diagnose(root, options), 'runtime:node').status, 'warn');
  await put(root, 'package.json', '{"engines":{"node":"SECRET_INVALID_RANGE"}}');
  const report = await diagnose(root, options);
  assert.equal(check(report, 'runtime:node').status, 'warn');
  assert.ok(!JSON.stringify(report).includes('SECRET_INVALID_RANGE'));
});

test('missing required dependencies fail while missing optional dependencies warn', async t => {
  const root = await configured(t, { engines: { node: '>=22' }, dependencies: { required: '*' }, optionalDependencies: { optional: '*' } });
  const report = await diagnose(root, options);
  assert.equal(check(report, 'dependency:required').status, 'fail');
  assert.equal(check(report, 'dependency:optional').status, 'warn');
});

test('checks dev and scoped package versions without executing their entry points', async t => {
  const root = await configured(t, { engines: { node: '>=22' }, devDependencies: { '@scope/lib': '^2.0.0' } });
  await put(root, 'node_modules/@scope/lib/package.json', '{"version":"1.0.0","main":"throws.js"}');
  await put(root, 'node_modules/@scope/lib/throws.js', 'throw new Error("MUST_NOT_EXECUTE")');
  const report = await diagnose(root, options);
  assert.equal(check(report, 'dependency:@scope/lib').status, 'fail');
});

test('non-semver dependency protocols warn without printing their credentials', async t => {
  const root = await configured(t, { engines: { node: '>=22' }, dependencies: { lib: 'git+https://token:PRIVATE_TOKEN@example.com/lib' } });
  await put(root, 'node_modules/lib/package.json', '{"version":"1.0.0"}');
  const report = await diagnose(root, options);
  assert.equal(check(report, 'dependency:lib').status, 'warn');
  assert.ok(!JSON.stringify(report).includes('PRIVATE_TOKEN'));
});

test('unreadable or invalid installed metadata cannot pass', async t => {
  const root = await configured(t, { engines: { node: '>=22' }, dependencies: { lib: '*' } });
  await put(root, 'node_modules/lib/package.json', '{"version":"UNTRUSTED_SECRET"}');
  const report = await diagnose(root, options);
  assert.equal(check(report, 'dependency:lib').status, 'warn');
  assert.ok(!JSON.stringify(report).includes('UNTRUSTED_SECRET'));
});

test('external linked dependencies warn instead of reading external metadata', async t => {
  const root = await configured(t, { engines: { node: '>=22' }, dependencies: { lib: '*' } });
  const outside = await project(t, { version: '1.0.0' });
  await put(root, 'node_modules/.keep', '');
  await symlink(outside, join(root, 'node_modules/lib'), 'junction');
  assert.equal(check(await diagnose(root, options), 'dependency:lib').status, 'warn');
});

test('checks variable presence, treats whitespace as missing, never includes values', async t => {
  const root = await configured(t, { engines: { node: '>=22' } });
  await put(root, 'startup-doctor.json', '{"env":["SET","MISSING","BLANK"],"ports":[]}');
  const report = await diagnose(root, { ...options, env: { SET: 'TOP_SECRET_VALUE', BLANK: '  ' } });
  assert.equal(check(report, 'env:SET').status, 'pass');
  assert.equal(check(report, 'env:MISSING').status, 'fail');
  assert.equal(check(report, 'env:BLANK').status, 'fail');
  assert.ok(!JSON.stringify(report).includes('TOP_SECRET_VALUE'));
  assert.ok(!formatText(report).includes('TOP_SECRET_VALUE'));
});

test('port occupied by a real server fails; a free port is released after checking', async t => {
  const root = await configured(t, { engines: { node: '>=22' } });
  const occupied = await listen(t);
  const temporary = createServer();
  temporary.listen({ host: '127.0.0.1', port: 0 });
  await once(temporary, 'listening');
  const free = temporary.address().port;
  await new Promise(resolve => temporary.close(resolve));
  await put(root, 'startup-doctor.json', JSON.stringify({ env: [], ports: [occupied, free] }));
  const report = await diagnose(root, options);
  assert.equal(check(report, `port:${occupied}`).status, 'fail');
  assert.equal(check(report, `port:${free}`).status, 'pass');
  assert.equal(await listen(t, free), free);
});

test('non-Windows platforms are explicitly unverified', async t => {
  const root = await configured(t, { engines: { node: '>=22' } });
  const report = await diagnose(root, { ...options, platform: 'linux' });
  assert.equal(check(report, 'platform').status, 'warn');
  assert.equal(exitCode(report), 0);
  assert.equal(exitCode(report, true), 1);
});

test('unconfigured ports are reported as not checked, not passed', async t => {
  const root = await project(t);
  const report = await diagnose(root, options);
  assert.equal(check(report, 'ports:source').status, 'warn');
});

test('terminal formatting strips escape, newline, bidi and control injections', () => {
  const text = formatText({ toolVersion: '0.1.0', checks: [{ id: 'x', status: 'warn', message: 'unsafe\u001b[31m\nPASS\u202e', fix: 'fix\rvalue' }], summary: { pass: 0, warn: 1, fail: 0 } });
  assert.ok(!text.includes('\u001b'));
  assert.ok(!text.includes('\u202e'));
  assert.ok(!text.includes('\nPASS'));
});
