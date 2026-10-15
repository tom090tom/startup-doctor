# Changelog

采用 [Semantic Versioning](https://semver.org/)，变更通过 PR 追溯。

## [Unreleased]

## [0.1.0] - 2026-10-15

### Added
- Windows 优先 CLI：Node 版本、直接依赖、当前进程变量和 IPv4 端口诊断。
- 中文建议、JSON schemaVersion 1、strict 退出码、固定输入限制及路径/链接检查。
- 正常/故障样例、四类故障 Demo、真实文件/端口/CLI 回归测试。
- MIT、安全免责、贡献规范、Issue/PR 模板与手动 CI 示例。

### Known limits
- 不读取 .env，不检查传递依赖/锁文件/原生 ABI，不执行应用代码；通过不保证启动成功。
- Windows 本地验证；其他平台、链接依赖与非标准协议需人工确认；GitHub Actions 尚未启用。

[Unreleased]: https://github.com/tom090tom/startup-doctor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tom090tom/startup-doctor/releases/tag/v0.1.0
