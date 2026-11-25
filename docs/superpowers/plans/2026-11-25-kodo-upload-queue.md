# Kodo 与上传队列 Implementation Plan

**Goal:** 统一产品名称，倒序展示上传任务并支持浏览器打开结果。

**Architecture:** 修改共享厂商元数据和 Rust 提示；正式/预览页面只倒序渲染队列，共享完成链接组件；通过 native 服务封装已有 opener。

**Tech Stack:** React、TypeScript、Tauri/Rust、Node test、Vite SSR。

用户已确认执行，在当前工作区保留之前缤纷云改动，不自动提交。

- [x] 新增 `tests/upload-queue.test.mjs` 实际页面 SSR 测试，验证顺序、输入数组不变、进度更新位置、完成链接和未完成项隐藏链接；补充 Kodo 元数据和 Rust 默认名测试，先运行确认失败。
- [x] 修改 `src/domain/model.ts`、`src-tauri/src/models.rs`、`src-tauri/src/upload/{mod,naming,qiniu,signing}.rs` 和 README 中的显示名称与提示。
- [x] 新增 `src/components/UploadResultLink.tsx`；修改 `src/services/native.ts` 与 `src/pages/{NativeUpload,Upload}.tsx`，完成共享链接和倒序显示。
- [x] 运行 `npm test`、`npm run build`、`npm run format:check`、`cargo test --manifest-path src-tauri/Cargo.toml --lib`、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 和 `git diff --check`，审阅差异。

## 验证记录

- 测试先观察到旧名称、队列正序与缺少完成链接的断言失败，修改后通过。
- 前端全量测试覆盖正式页面与预览、倒序不改原数组、进度刷新位置、完成链接/title/复制、未完成任务隐藏链接、系统 opener 调用及失败反馈。
- Rust 全量测试与前端构建、Prettier、Rust 格式和 diff 检查通过。
- 本次没有操作实际系统浏览器，没有原生 WebView 或真实云服务验证；既有自定义配置名称未改动。
