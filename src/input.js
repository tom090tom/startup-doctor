import { open, realpath, lstat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.code = 'INPUT_INVALID';
  }
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const namePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const envPattern = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

export async function readTextInside(root, file, maxBytes, optional = false) {
  const candidate = resolve(root, file);
  const inside = path => {
    const rel = relative(root, path);
    return rel !== '..' && !rel.startsWith(`..\\`) && !rel.startsWith('../') && !isAbsolute(rel);
  };
  if (!inside(candidate)) throw new InputError('文件路径越出项目目录。');
  let handle;
  try {
    const entry = await lstat(candidate);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink > 1) throw new InputError('输入必须是普通、非链接文件。');
    const resolved = await realpath(candidate);
    if (!inside(resolved)) throw new InputError('文件链接越出项目目录；请使用项目内的普通文件。');
    handle = await open(resolved, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink > 1 || stat.size > maxBytes) throw new InputError('输入不是单链接普通文件，或超过规定大小。');
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maxBytes) throw new InputError('输入超过规定大小。');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (optional && error.code === 'ENOENT') return null;
    throw new InputError('无法安全读取输入文件；请检查路径、权限、编码和文件类型。');
  } finally {
    await handle?.close();
  }
}

export async function readJsonInside(root, file, maxBytes, optional = false) {
  const text = await readTextInside(root, file, maxBytes, optional);
  if (text === null) return null;
  let value;
  try { value = JSON.parse(text); } catch { throw new InputError('JSON 格式无效；请检查逗号、引号和括号。'); }
  if (!object(value)) throw new InputError('JSON 顶层必须是对象。');
  return value;
}

export async function readProject(directory) {
  let root;
  try { root = await realpath(resolve(directory)); } catch { throw new InputError('项目目录不存在或无法访问。'); }
  const pkg = await readJsonInside(root, 'package.json', 256 * 1024);
  if (pkg.engines !== undefined && (!object(pkg.engines) || (pkg.engines.node !== undefined && (typeof pkg.engines.node !== 'string' || pkg.engines.node.length > 200)))) {
    throw new InputError('engines.node 必须是长度不超过 200 的版本范围字符串。');
  }
  const names = new Set();
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (pkg[group] === undefined) continue;
    if (!object(pkg[group])) throw new InputError('依赖声明必须是对象。');
    for (const [name, range] of Object.entries(pkg[group])) {
      if (name.length > 214 || !namePattern.test(name) || typeof range !== 'string' || range.length > 200) {
        throw new InputError('依赖名称或版本声明无效。');
      }
      names.add(name);
    }
  }
  if (names.size > 300) throw new InputError('最多检查 300 个直接依赖。');
  const raw = await readJsonInside(root, 'startup-doctor.json', 64 * 1024, true) ?? {};
  if (Object.keys(raw).some(key => !['env', 'ports'].includes(key))) throw new InputError('配置只允许 env 与 ports 字段。');
  if (raw.env !== undefined && (!Array.isArray(raw.env) || raw.env.length > 100 || raw.env.some(name => typeof name !== 'string' || !envPattern.test(name)))) {
    throw new InputError('env 必须是最多 100 个合法环境变量名组成的数组。');
  }
  if (raw.ports !== undefined && (!Array.isArray(raw.ports) || raw.ports.length > 16 || raw.ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535))) {
    throw new InputError('ports 必须是最多 16 个 1–65535 整数端口组成的数组。');
  }
  const warnings = [];
  let env = raw.env;
  if (env === undefined) {
    const template = await readTextInside(root, '.env.example', 128 * 1024, true);
    env = [];
    if (template === null) warnings.push({ id: 'env:source', message: '未配置 env，也没有 .env.example；未检查环境变量。', fix: '在 startup-doctor.json 中列出必需变量名。' });
    else {
      let unsupported = 0;
      for (const line of template.split(/\r?\n/)) {
        if (!line.trim() || /^\s*#/.test(line)) continue;
        const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]{0,127})\s*=/.exec(line);
        if (match) env.push(match[1]);
        else unsupported++;
      }
      if (unsupported) warnings.push({ id: 'env:template', message: `模板中 ${unsupported} 行不是支持的单行赋值语法；可能未提取全部变量名。`, fix: '将必需变量名显式列入 startup-doctor.json 的 env 数组。' });
    }
  }
  env = [...new Set(env)];
  if (env.length > 100) throw new InputError('最多检查 100 个环境变量。');
  return { root, pkg, config: { env, ports: [...new Set(raw.ports ?? [])] }, portsConfigured: raw.ports !== undefined, warnings };
}
