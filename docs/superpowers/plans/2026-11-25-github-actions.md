# GitHub Actions Implementation Plan

**Goal:** 为 GoPic 提供三平台手动打包及标签触发的 Release 草稿。

**Architecture:** 先在 Ubuntu 校验版本，再通过矩阵复用 `build.sh` 构建。独立 Release 任务只在标签 push 且全部构建成功后运行。

**Tech Stack:** GitHub Actions、Node.js 24、Rust stable、Bash、GitHub CLI。

## 实施步骤

- [x] 新建 `tests/build-metadata.test.mjs`，测试手动运行、正确标签、错误标签和不安全版本值；先运行 `node --test tests/build-metadata.test.mjs` 确认缺少实现。
- [x] 新建 `.github/scripts/build-metadata.mjs`，读取 Tauri 版本并输出 `version`、`release`；用测试验证只有标签 push 可以进入 Release。
- [x] 新建 `.github/workflows/build.yml`：配置手动和 `v*` 标签触发、版本检查、macOS 双目标和 Windows 原生构建、缓存及 artifacts；全部成功后创建或更新草稿，拒绝修改已发布版本。
- [x] 在 README 补充手动下载、版本标签发布、权限及未签名说明。
- [x] 运行元数据测试、`npm test`、`actionlint`、修改文件的 Prettier 检查及 `git diff --check`，检查没有改动 `build.sh`、版本号和锁文件。
- [x] 汇报本地验证结果与需要在 GitHub 首次执行的边界；不 commit、不 push。
