import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'startup-doctor-demo-'));
const server = createServer();
function run(directory) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.STARTUP_DOCTOR_DEMO_TOKEN;
    const child = spawn(process.execPath, [join(root, 'bin/startup-doctor.js'), directory], { env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', resolve);
  });
}
try {
  console.log('示例 1：健康项目（期望退出码 0）');
  const healthy = await run(join(root, 'examples/healthy'));
  await cp(join(root, 'examples/broken'), temp, { recursive: true });
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
  await once(server, 'listening');
  await writeFile(join(temp, 'startup-doctor.json'), JSON.stringify({ env: ['STARTUP_DOCTOR_DEMO_TOKEN'], ports: [server.address().port] }));
  console.log('\n示例 2：版本不匹配、依赖缺失、缺变量、端口占用（期望退出码 1）');
  const broken = await run(temp);
  if (healthy !== 0 || broken !== 1) process.exitCode = 1;
  else console.log('\nDemo 验证完成：两种退出码均符合预期；临时占用端口将释放。');
} finally {
  if (server.listening) await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
