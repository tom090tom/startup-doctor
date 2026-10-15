import { createServer } from 'node:net';
import semver from 'semver';
import { readProject, readJsonInside } from './input.js';
import { VERSION, safeText } from './report.js';

async function probePort(port) {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') resolve({ status: 'fail', message: `端口 ${port} 在 127.0.0.1 上已被占用。`, fix: '确认占用程序后自行关闭它，或为项目选择其他端口；本工具不会结束进程。' });
      else if (error.code === 'EACCES' || error.code === 'EPERM') resolve({ status: 'fail', message: `当前用户无法绑定端口 ${port}。`, fix: '检查系统端口保留与权限，或选择其他端口；不要直接提权运行未知项目。' });
      else resolve({ status: 'warn', message: `端口 ${port} 检查未完成。`, fix: '检查本机网络配置后重试；不能据此认定端口空闲。' });
    });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(error => resolve(error
        ? { status: 'warn', message: `端口 ${port} 探测结束时出现异常。`, fix: '重新检查端口。' }
        : { status: 'pass', message: `端口 ${port} 当前可绑定（127.0.0.1）。`, fix: '' }));
    });
  });
}

function dependencies(pkg) {
  const result = new Map();
  for (const group of ['devDependencies', 'dependencies']) {
    for (const [name, range] of Object.entries(pkg[group] ?? {})) {
      const old = result.get(name);
      result.set(name, { name, range, optional: false, conflict: old && old.range !== range });
    }
  }
  for (const [name, range] of Object.entries(pkg.optionalDependencies ?? {})) result.set(name, { name, range, optional: true });
  return [...result.values()];
}

async function inspectDependency(root, entry) {
  const { name, range, optional, conflict } = entry;
  const id = `dependency:${name}`;
  const fix = '使用项目指定的包管理器和锁文件重新安装依赖；先审查安装脚本，本工具不会代为安装。';
  if (conflict) return { id, status: 'warn', message: `${name} 在 dependencies 与 devDependencies 中声明了不同版本。`, fix: '先统一重复声明的版本范围，再检查。' };
  let installed;
  try { installed = await readJsonInside(root, `node_modules/${name}/package.json`, 256 * 1024, true); }
  catch { return { id, status: 'warn', message: `${name} 的本地元数据无法安全读取（可能是外部链接、权限或格式问题）。`, fix: '确认包位于项目内，且 package.json 为有效普通文件。' }; }
  if (installed === null) return { id, status: optional ? 'warn' : 'fail', message: `${name} ${optional ? '是可选依赖，当前未安装' : '在项目 node_modules 中缺失'}。`, fix };
  if (!semver.validRange(range)) return { id, status: 'warn', message: `${name} 使用非标准版本范围；只确认元数据存在，未验证协议或来源。`, fix: '人工核对 workspace、file、Git、npm alias 或其他非标准依赖来源与版本。' };
  if (typeof installed.version !== 'string' || installed.version.length > 200 || !semver.valid(installed.version)) return { id, status: 'warn', message: `${name} 的已安装版本无法解释。`, fix };
  if (!semver.satisfies(installed.version, range)) return { id, status: optional ? 'warn' : 'fail', message: `${name} 的已安装版本不符合声明范围。`, fix };
  return { id, status: 'pass', message: `${name} 已安装，版本符合声明范围。`, fix: '' };
}

export async function diagnose(directory, { env = process.env, nodeVersion = process.versions.node, platform = process.platform } = {}) {
  const { root, pkg, config, portsConfigured, warnings } = await readProject(directory);
  const checks = [];
  checks.push(platform === 'win32'
    ? { id: 'platform', status: 'pass', message: '当前为 Windows，属于首版支持平台。', fix: '' }
    : { id: 'platform', status: 'warn', message: '当前不是 Windows；此平台尚未纳入首版验收。', fix: '可参考报告，但需在目标平台自行验证。' });
  const range = pkg.engines?.node;
  if (range === undefined || !semver.validRange(range)) checks.push({ id: 'runtime:node', status: 'warn', message: '未声明有效 engines.node；无法判断项目需要的 Node 版本。', fix: '在 package.json 的 engines.node 中声明标准版本范围。' });
  else {
    const matches = Boolean(semver.valid(nodeVersion) && semver.satisfies(nodeVersion, range));
    checks.push({ id: 'runtime:node', status: matches ? 'pass' : 'fail', message: `当前 Node ${nodeVersion} ${matches ? '符合' : '不符合'}项目范围 ${range}。`, fix: matches ? '' : '用版本管理工具切换到 engines.node 声明的 Node 版本，再重新安装依赖。' });
  }
  const entries = dependencies(pkg);
  if (!entries.length) checks.push({ id: 'dependencies:none', status: 'pass', message: '项目未声明需要检查的直接依赖。', fix: '' });
  for (const entry of entries) checks.push(await inspectDependency(root, entry));
  checks.push(...warnings.map(item => ({ ...item, status: 'warn' })));
  for (const name of config.env) {
    const value = Object.hasOwn(env, name) ? env[name] : undefined;
    const present = typeof value === 'string' && value.trim().length > 0;
    checks.push({ id: `env:${name}`, status: present ? 'pass' : 'fail', message: `${name} ${present ? '已设置（值不显示）' : '未在当前进程环境中设置非空值'}。`, fix: present ? '' : '在启动此工具的终端设置变量，或显式使用 Node --env-file 加载可信 .env 后重跑；本工具不读取 .env。' });
  }
  if (!portsConfigured) checks.push({ id: 'ports:source', status: 'warn', message: '未配置端口；未执行端口检查。', fix: '在 startup-doctor.json 的 ports 数组列出项目需要的本地端口；空数组表示跳过。' });
  for (const port of config.ports) checks.push({ id: `port:${port}`, ...await probePort(port) });
  const cleanChecks = checks.map(item => ({ ...item, message: safeText(item.message), fix: safeText(item.fix) }));
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const item of cleanChecks) summary[item.status]++;
  return { schemaVersion: 1, toolVersion: VERSION, platform: safeText(platform), checks: cleanChecks, summary };
}
