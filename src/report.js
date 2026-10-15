export const VERSION = '0.1.0';

export function safeText(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ');
}

export function exitCode(report, strict = false) {
  return report.summary.fail || (strict && report.summary.warn) ? 1 : 0;
}

export function formatText(report) {
  const labels = { pass: '通过', warn: '警告', fail: '失败' };
  const lines = [`Startup Doctor v${safeText(report.toolVersion)} · 本地只读诊断`, ''];
  for (const item of report.checks) {
    lines.push(`[${labels[item.status]}] ${safeText(item.message)}`);
    if (item.fix) lines.push(`       建议：${safeText(item.fix)}`);
  }
  lines.push('', `结果：${report.summary.pass} 通过，${report.summary.warn} 警告，${report.summary.fail} 失败。`, '范围：当前 Node、项目内直接依赖、当前进程环境变量、127.0.0.1 端口。通过不保证项目启动成功。');
  return `${lines.join('\n')}\n`;
}
