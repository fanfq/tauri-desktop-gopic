# 图床固定栏 Implementation Plan

**Goal:** 图床顶部工具栏和底部选择操作栏始终可见，只有文件列表滚动。

**Architecture:** Gallery 内部分为顶部、中间滚动内容、条件底栏；两套应用壳按页面切换滚动容器，避免内外双滚动。

**Tech Stack:** React、Tailwind、Vite SSR、浏览器布局验证。

- [x] 添加 `tests/gallery-layout.test.mjs`，确认当前页面没有独立滚动框架。
- [x] 调整 `src/pages/Gallery.tsx` 的结构与样式，修改 `src/app/{NativeApp,PreviewApp}.tsx` 的图床滚动约束。
- [x] 执行测试、构建、格式和差异检查；浏览器检查选择后滚动时顶部及底部位置。

保留此前改动，不自动 commit。

## 验证结果

- 45 项前端测试通过；前端构建、Prettier 和 git diff 检查通过。
- 浏览器预览 1280×720 全选 11 个文件后，列表 scrollTop 从 0 变为 332；顶部工具栏 top=144，底部选择栏 top=656/bottom=702 均未变化，main scrollTop=0。
- 680×600 窄窗口中，顶部和底部可见，无横向溢出；取消选择后操作栏隐藏，列表高度从 343 增至 403，并保留 scrollTop=332。
- 浏览器测试后已恢复视口。尚未进行原生 WebView 实机验证。不自动 commit。

后续调整：图床滚动容器延伸至内容区右边缘，卡片和固定栏保留响应式留白。浏览器验证 680px、1280px 和 1600px 宽度下滚动容器右边界分别等于 680、1280 和 1600；宽屏卡片区域仍限制为 1180px。构建、格式和 diff 检查通过。
