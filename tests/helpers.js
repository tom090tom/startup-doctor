import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function project(t, pkg = { engines: { node: '>=22' } }) {
  const root = await mkdtemp(join(tmpdir(), 'startup doctor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await put(root, 'package.json', JSON.stringify(pkg));
  return root;
}

export async function put(root, file, text) {
  const path = join(root, file);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, text);
}
