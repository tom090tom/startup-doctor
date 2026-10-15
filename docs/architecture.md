# 架构与取舍

CLI 参数 → 有界读取输入 → 逐项检查 → 报告 → 退出码。目标项目作为数据，不通过 require/import 加载目标包或运行命令。

| 模块 | 职责 | 接口 |
| --- | --- | --- |
| src/input.js | 大小、路径、链接、JSON 与配置验证 | readProject(directory) 返回规范化输入；错误抛 InputError |
| src/doctor.js | semver、依赖元数据、变量与端口 | diagnose(directory, options) 返回 schemaVersion 1 报告 |
| src/report.js | 版本、控制字符过滤、文本与退出码 | formatText(report)、exitCode(report, strict) |
| bin/startup-doctor.js | 参数、帮助、JSON、安全错误 | stdout/stderr、退出码 0/1/2 |

Node 原生文件/TCP API 减少系统命令和转义差异；唯一依赖 semver 固定版本，避免自制不完整的版本语义。Windows 支持依据实际验证声明，其他平台不默默视为通过。

依赖不沿模块搜索路径向上找，避免把工具或全局包错当目标安装。外部链接、硬链接与非标准协议明确警告。依赖同名但范围冲突时需人工统一；optionalDependencies 覆盖同名普通依赖。

端口用实际绑定检查，不用连接失败推断空闲。只绑定 IPv4 回环，立即关闭；检查结果不保证下次启动时仍空闲。系统保留端口可能表现为权限拒绝。

模板只提取变量名，不解释完整 dotenv、多行值、插值或项目加载器；无效行警告。不读取真实 .env，拒绝模板符号链接与多硬链接；用户可显式用 Node --env-file 注入可信配置。

测试使用临时目录、真实 Node 子进程和 TCP 监听器；隐私测试为明显合成字符串，报告不是应用健康证明，也不是恶意文件系统沙箱。
