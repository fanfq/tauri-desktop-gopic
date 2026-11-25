# Startup Splash Implementation Plan

**Goal:** 遮住冷启动未完成的布局，在首屏就绪后平滑显示应用。

**Architecture:** 静态 HTML 遮罩保证首帧覆盖；独立 TypeScript 生命周期函数等待字体、图标及双帧，在 NativeApp 配置就绪或失败时触发一次退场。浏览器预览共用入口。

**Tech Stack:** React 19、TypeScript、CSS、Node test runner、Vite。

## Execution

- [x] 在 `tests/startup-splash.test.mjs` 编写资源等待、双帧、取消、动画超时、减少动态效果测试，运行并确认缺少功能导致失败。
- [x] 在 `index.html` 加入内联启动样式、现有品牌图和遮罩；主 root 使用 inert 和 aria-busy 防止提前交互。
- [x] 创建 `src/startup-splash.ts`：等待字体/图片，双帧后与主界面主题对齐，250ms 淡出并清理，兼容 StrictMode 取消，使用定时器兜底移除。
- [x] 在 `src/app/NativeApp.tsx` 接入 `Boolean(snapshot || app.error)` 的 effect；在 `src/App.tsx` 为浏览器预览接入首次就绪。
- [x] 执行 `npm test`、`npm run build`、`npm run format:check` 和 `git diff --check`，检查浏览器启动过渡及减少动态效果。

当前 checkout 直接实施以保留用户现有版本号修改。不 commit、不 push。

## Verification results

- `npm test`: 50/50 passed, including five startup lifecycle tests.
- `npm run build`, `npm run format:check`, `git diff --check`: passed.
- Browser reload: observed startup status followed by the main screen; DOM confirmed splash removed, inert cleared, aria-busy=false.
- `npm run tauri -- build --debug --bundles app`: passed; macOS debug app cold-launched and page navigation worked.
- Read-only independent code review: no blocking findings.
- Reduced-motion behavior verified by lifecycle test and CSS inspection; native error/retry and tray restore remain untested manually.
