import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { project, put } from './helpers.js';

const cli = fileURLToPath(new URL('../bin/startup-doctor.js', import.meta.url));
function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { windowsHide: true, ...options });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('help and version work without a target project', async () => {
  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /--json/);
  assert.match(help.stdout, /--strict/);
  const version = await run(['--version']);
  assert.equal(version.code, 0);
  assert.equal(version.stdout.trim(), '0.1.0');
});

test('JSON mode handles paths with spaces and defaults to cwd', async t => {
  const root = await project(t);
  await put(root, 'startup-doctor.json', '{"env":[],"ports":[]}');
  for (const result of [await run([root, '--json']), await run(['--json'], { cwd: root })]) {
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).summary.fail, 0);
  }
});

test('unknown flags, multiple paths and missing targets exit 2 without echoing arguments', async t => {
  const root = await project(t);
  for (const args of [['--PRIVATE_TOKEN', '--json'], [root, root, '--json'], [`${root}/absent`, '--json']]) {
    const result = await run(args);
    assert.equal(result.code, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.error.code, 'INPUT_INVALID');
    assert.ok(!result.stdout.includes('PRIVATE_TOKEN'));
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes(' at '));
  }
});

test('double dash permits a directory name beginning with a dash', async t => {
  const root = await project(t);
  await put(root, '-target/package.json', '{"engines":{"node":">=22"}}');
  const result = await run(['--json', '--', '-target'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).summary.fail, 0);
});

test('strict mode makes unverified checks fail CI without hiding their warn status', async t => {
  const root = await project(t);
  const normal = await run([root, '--json']);
  const strict = await run([root, '--json', '--strict']);
  assert.equal(normal.code, 0);
  assert.equal(strict.code, 1);
  assert.ok(JSON.parse(strict.stdout).summary.warn >= 1);
});

test('target lifecycle scripts and package entry points never run; target files stay unchanged', async t => {
  const root = await project(t, {
    engines: { node: '>=22' },
    scripts: { preinstall: 'node trap.cjs', start: 'node trap.cjs' },
    dependencies: { trap: '*' }
  });
  await put(root, 'trap.cjs', 'require("node:fs").writeFileSync("EXECUTED", "bad")');
  await put(root, 'node_modules/trap/package.json', '{"version":"1.0.0","main":"../../trap.cjs"}');
  await put(root, 'startup-doctor.json', '{"env":["SD_DEMO_SECRET"],"ports":[]}');
  await put(root, '.env', 'OTHER_SECRET=DO_NOT_READ');
  const before = await readFile(`${root}/package.json`, 'utf8');
  const files = await readdir(root);
  const result = await run([root, '--json'], { env: { ...process.env, SD_DEMO_SECRET: 'NEVER_LEAK_THIS_KEY' } });
  assert.equal(result.code, 0);
  assert.ok(!result.stdout.includes('NEVER_LEAK_THIS_KEY'));
  assert.ok(!result.stdout.includes('DO_NOT_READ'));
  assert.equal(await readFile(`${root}/package.json`, 'utf8'), before);
  assert.deepEqual(await readdir(root), files);
});

test('invalid config is a safe JSON error and cannot request arbitrary commands', async t => {
  const root = await project(t);
  await put(root, 'startup-doctor.json', '{"command":"PRIVATE_COMMAND"}');
  const result = await run([root, '--json']);
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'INPUT_INVALID');
  assert.ok(!result.stdout.includes('PRIVATE_COMMAND'));
});
