# Startup Doctor

**一条命令，查清 Node.js 项目为什么还跑不起来。** Windows 优先、本机只读、中文报告，支持 JSON 与 CI 退出码。

先查 Node 版本、缺失依赖、环境变量和端口，再决定怎么修。不运行目标项目脚本或包入口，不修改项目、安装依赖、结束进程或上传数据。

## 30 秒体验

需要 Node.js 22+。首版已在 Windows / Node.js 24 验证，其他系统明确给出未验证警告。

```powershell
git clone https://github.com/tom090tom/startup-doctor.git
cd startup-doctor
npm ci --ignore-scripts
npm run demo
```

Demo 使用合成项目和临时端口，结束后释放端口、清理临时目录。健康样例退出 0；故障样例同时显示：

```text
[失败] 当前 Node 24.x 不符合项目范围 <1。
[失败] startup-doctor-demo-missing 在项目 node_modules 中缺失。
[失败] STARTUP_DOCTOR_DEMO_TOKEN 未在当前进程环境中设置非空值。
[失败] 端口 … 在 127.0.0.1 上已被占用。
```

## 检查自己的项目

在 Startup Doctor 目录运行，路径指向目标项目（有空格时加引号）：

```powershell
node bin/startup-doctor.js "F:\code\my app"
node bin/startup-doctor.js "F:\code\my app" --json
node bin/startup-doctor.js "F:\code\my app" --json --strict
```

省略路径检查当前工作目录；`--help` 查看帮助，`--version` 查看版本，`--` 后按目录名解析。尚未发布到 npm；`private: true` 防止误发包，不影响 GitHub 开源。

## 项目检查清单

在**目标项目根目录**添加 `startup-doctor.json`，只接受两个字段：

```json
{ "env": ["DATABASE_URL", "API_KEY"], "ports": [3000, 8080] }
```

- `env`：必需变量名，检查当前进程是否有非空值，不显示值。省略时从 `.env.example` 提取单行 `NAME=…` 或 `export NAME=…` 的名字；不支持的行会警告。显式 `[]` 表示跳过。
- `ports`：检查当时能否独占绑定 `127.0.0.1` 的端口，马上释放。省略会警告未检查，`[]` 表示主动跳过；不从脚本猜端口。

工具不读取 `.env`。项目即使会自行加载 `.env`，当前终端没有加载时仍可能报告缺变量。可先在 PowerShell 设置变量，或明确让 Node 加载自己信任的文件：

```powershell
node --env-file="F:\code\my app\.env" bin/startup-doctor.js "F:\code\my app"
```

变量值不进报告，但变量名、依赖名、版本范围、平台和端口可能有内部信息，分享前仍需审阅。

## 检查范围与限制

| 检查 | 判定 | 边界 |
| --- | --- | --- |
| Node | 当前解释器是否满足 engines.node 标准 semver 范围 | 缺失/无效范围警告；不安装或切换版本 |
| 直接依赖 | 项目内 node_modules 包元数据的版本 | 包括开发依赖；必需包缺失/不符失败；可选包缺失/不符警告 |
| 非标准依赖 | Git/file/workspace/npm alias/标签 | 元数据存在也仅警告未验证；不联网或打印协议字符串 |
| 环境变量 | 当前进程中非空字符串 | 不判断凭据有效性，不检测模板之外的遗漏 |
| 端口 | 本地 IPv4 独占绑定结果 | 不探测 IPv6、远端、容器或 WSL；检查与启动间有竞争窗口 |

不验证传递依赖、peerDependencies、锁文件一致性、原生模块 ABI、数据库和应用逻辑。工作区链接、外部 pnpm store 或硬链接元数据会提示需人工确认。每次只检查一个项目，不递归扫描 monorepo。

上限：300 个直接依赖、100 个变量、16 个端口；package 元数据 256 KiB、配置 64 KiB、模板 128 KiB。输入须为项目内非链接普通文件，不读取外部链接或多硬链接文件。不要在攻击者可并发修改的目录上依赖它作为隔离边界；见 [SECURITY.md](SECURITY.md) 与 [DISCLAIMER.md](DISCLAIMER.md)。

## JSON 与退出码

诊断返回 `schemaVersion: 1`、`toolVersion`、`platform`、`checks` 和 `summary`。每项有 `id`、`status`（pass/warn/fail）、`message`、`fix`。ID 包括 `runtime:node`、`dependency:<名称>`、`env:<名称>`、`port:<数字>`。

输入错误返回 `{ "schemaVersion": 1, "toolVersion": "0.1.0", "error": { "code": "INPUT_INVALID", "message": "…" } }`；未知内部错误 code 为 `DIAGNOSTIC_ERROR`。不输出堆栈或原始 JSON 源文。

| 退出码 | 含义 |
| --- | --- |
| 0 | 没有失败；默认允许警告 |
| 1 | 有失败；strict 下警告也返回 1 |
| 2 | 参数、配置或输入访问异常，未能完成诊断 |

此仓库**尚未启用 GitHub Actions**；[CI 模板](docs/ci.example.yml) 可经维护者审阅后启用。本地检查与 CI 分开记录，不能把“没有失败”当成应用可启动证明。

## 验证与贡献

```powershell
npm test
npm run check
npm audit --omit=dev
```

测试使用实际临时目录、Node 子进程和回环端口，覆盖配置、冲突、变量保密、目标脚本不执行与文件未改动。Windows 没有符号链接权限时会明确跳过文件 symlink 用例，真实硬链接拒绝与外部目录 junction 拒绝仍执行。唯一运行依赖 semver 固定版本，见 [package-lock.json](package-lock.json)。

采用 SemVer、Conventional Commits、短期 codex/ 分支和 PR 评审。见 [贡献指南](CONTRIBUTING.md)、[变更记录](CHANGELOG.md)、[架构与取舍](docs/architecture.md)。MIT 授权，不承诺能诊断所有启动问题或消除安全风险。
