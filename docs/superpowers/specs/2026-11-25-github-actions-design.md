# GitHub Actions 桌面打包设计

用户已确认：手动打包下载产物，推送版本标签时生成 Release 草稿。

- 复用 `build.sh`，分别构建 macOS ARM64、macOS Intel、Windows x64；产物为两个 DMG 和一个 NSIS EXE。
- 手动 `workflow_dispatch` 只上传 Actions artifacts，保留 30 天；普通分支 push 不触发。
- `v*` 标签 push 先校验标签与 `src-tauri/tauri.conf.json` 的版本一致，再开始三个构建任务。
- 使用 Node.js 24、Rust stable 和依赖缓存；沿用 npm 与 Cargo 锁文件。
- 三个平台均成功后，独立任务收集安装包并创建 Release 草稿。重跑可更新草稿附件，已发布的 Release 拒绝修改。
- 构建任务只有读取源码的权限，仅 Release 任务使用 `contents: write`；不需要个人访问令牌。
- 首版不配置开发者证书签名、公证或自动更新。保留原有本地打包流程。
- 本地验证涵盖版本校验、已有测试、工作流静态检查；真实 GitHub runner 构建须上传代码后验证。
- 遵守用户要求：补充注释，不自动 commit、push 或创建标签。
