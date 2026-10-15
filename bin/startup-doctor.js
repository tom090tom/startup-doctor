#!/usr/bin/env node
import { diagnose } from '../src/doctor.js';
import { InputError } from '../src/input.js';
import { VERSION, formatText, exitCode } from '../src/report.js';

const args = process.argv.slice(2);
const separator = args.indexOf('--');
const jsonMode = args.slice(0, separator < 0 ? args.length : separator).includes('--json');

function parse() {
  let literal = false, strict = false, help = false, version = false;
  const paths = [];
  for (const arg of args) {
    if (!literal && arg === '--') { literal = true; continue; }
    if (!literal && arg.startsWith('-')) {
      if (arg === '--json') continue;
      if (arg === '--strict') strict = true;
      else if (arg === '--help' || arg === '-h') help = true;
      else if (arg === '--version' || arg === '-v') version = true;
      else throw new InputError('未知参数。运行 --help 查看用法。');
    } else paths.push(arg);
  }
  if (paths.length > 1) throw new InputError('一次只能检查一个项目目录。');
  return { directory: paths[0] ?? process.cwd(), strict, help, version };
}

try {
  const options = parse();
  if (Number(process.versions.node.split('.')[0]) < 22) throw new InputError('运行 Startup Doctor 需要 Node.js 22 或以上。');
  if (options.help) {
    process.stdout.write(`Startup Doctor v${VERSION}\n\n用法：node bin/startup-doctor.js [项目目录] [--json] [--strict]\n\n  --json     输出结构化 JSON，不打印变量值\n  --strict   将警告也视为退出码 1\n  --help     查看帮助\n  --version  查看版本\n  --         后续内容作为目录名\n\n默认检查当前目录。退出码：0 无失败；1 有失败（strict 包括警告）；2 参数或输入错误。\n只读检查：Node、项目内直接依赖、当前进程变量与 IPv4 回环端口；不会执行目标脚本或读取 .env。\n`);
  } else if (options.version) process.stdout.write(`${VERSION}\n`);
  else {
    const report = await diagnose(options.directory);
    process.stdout.write(jsonMode ? `${JSON.stringify(report, null, 2)}\n` : formatText(report));
    process.exitCode = exitCode(report, options.strict);
  }
} catch (error) {
  const known = error instanceof InputError;
  const message = known ? error.message : '诊断未能完成；请检查项目访问权限后重试，或用不含敏感数据的最小样例报告问题。';
  if (jsonMode) process.stdout.write(`${JSON.stringify({ schemaVersion: 1, toolVersion: VERSION, error: { code: known ? 'INPUT_INVALID' : 'DIAGNOSTIC_ERROR', message } }, null, 2)}\n`);
  else process.stderr.write(`Startup Doctor：${message}\n`);
  process.exitCode = 2;
}
