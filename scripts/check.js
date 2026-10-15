import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { VERSION } from '../src/report.js';

const root = fileURLToPath(new URL('../', import.meta.url));
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', path], { windowsHide: true, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${entry.name}`);
    }
  }
}
for (const folder of ['bin', 'src', 'tests', 'scripts']) await check(join(root, folder));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (pkg.version !== VERSION) throw new Error('CLI and package version differ');
console.log('JavaScript syntax and release version checks passed');
