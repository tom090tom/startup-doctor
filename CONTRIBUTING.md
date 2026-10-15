# 贡献指南

先用合成项目复现，说明系统、Node 和工具版本、命令、退出码和期待行为。安全问题走 [私密报告](SECURITY.md)，不要公开真实配置。

1. 从最新 main 创建短期 codex/<topic> 分支，一个 PR 一个问题；禁止直接推 main、强推或移动发布标签。
2. 行为变更先补失败回归测试，用真实临时文件和本机端口，不执行目标代码；遵守输入和数据边界。
3. 执行 `npm ci --ignore-scripts`、`npm test`、`npm run check`、`npm audit --omit=dev`、`git diff --check`；更新文档与 CHANGELOG。
4. Conventional Commits：feat/fix/docs/test/chore；破坏性变化用 `!` 和 `BREAKING CHANGE:`。0.x 的破坏性变化升次版本，兼容修复升补丁；1.x 后按 SemVer major/minor/patch。
5. PR 说明问题、最终行为、验证证据和限制；一位独立写权限审查者批准，解决讨论后 Squash merge。AI 审查不是 GitHub Approve，本地验证不是 CI。

初始发布 PR 在启用保护前由维护者合并；之后管理员也受保护，不能批准自己的 PR，没有独立审查者时保留 PR 等待，不绕过保护。

发布前在 PR 内同步 CHANGELOG、package 与 CLI 版本，完成审查和验证再合并；对合并提交创建不可移动的注解 vX.Y.Z 标签和 GitHub Release。新增依赖需解释必要性与许可证；示例须自制合成，贡献须有权按 MIT 授权。
