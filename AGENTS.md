# Startup Doctor

- Node.js 22+, ESM. Windows is the supported v0.1 platform. Read README, SECURITY and CONTRIBUTING.
- Read-only diagnostics: never run target scripts, import target packages, spawn commands from configuration, read .env, or show environment values.
- Keep input limits, path containment, control-character filtering and safe errors. semver is the sole runtime dependency, pinned in package-lock.json.
- src/input.js parses bounded inputs; src/doctor.js diagnoses; src/report.js formats; bin/startup-doctor.js handles CLI. Tests use actual temporary projects and loopback sockets.
- Behavior changes need a failing regression test first. Run npm test, npm run check, git diff --check. Update CHANGELOG and documented boundaries.
- Independent Git: no private account positioning, topic lists, internal plans, real credentials or user data. Use codex/ branches, Conventional Commits, SemVer and PR review; AI review is not a GitHub approval or CI run.
