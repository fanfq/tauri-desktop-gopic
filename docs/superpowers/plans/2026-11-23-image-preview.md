# Image Preview Implementation Plan

**Goal:** 修复放大裁切，提供可拖拽、可复位、可重试的图片预览。
**Architecture:** Gallery 只管理预览记录，ImagePreview 管理加载和指针事件，image-preview-layout.ts 管理纯几何计算。
**Tech Stack:** React、TypeScript、Tailwind、Node test。

- [x] 添加 tests/image-preview-layout.test.mjs：覆盖 2000×1000 图片在 800×600 视口的 40% 适应、细长图片、小图不放大、拖拽到四边、缩回后居中、以鼠标为锚缩放和零尺寸。
- [x] 运行 `node --experimental-strip-types --test tests/image-preview-layout.test.mjs`，确认缺少几何模块导致失败。
- [x] 实现 src/components/image-preview-layout.ts：fitScale、constrainView、zoomView，独立于 DOM。
- [x] 创建 src/components/ImagePreview.tsx：ResizeObserver、原始尺寸加载、失败重试、pointer capture 拖拽、wheel 缩放、适应/100% 控件与双击复位。
- [x] 修改 src/components/UI.tsx 的 Modal 支持专用 className；Gallery 使用独立组件，切配置关闭预览；src/styles/image-preview.css 约束弹窗高度并适配窄窗口。
- [x] 运行 `npm test`、`npm run build`、`npm run format:check`，检查浏览器预览与桌面构建。

按用户要求不初始化仓库、不自动 commit。本轮在当前会话内实施。
