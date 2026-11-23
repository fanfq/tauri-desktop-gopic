# Tailwind 迁移验证（2026-11-23）

本次仅迁移 Tauri React 前端的样式与构建配置。原 `src/App.css` 已拆为 `src/styles` 分层文件，79 个独立布局类迁入 JSX 工具类，共享控件通过 `@apply` 组合。保留启用开关立即保存逻辑。

## 已验证

- `npm test`：11 项通过。
- `npm run build`：TypeScript 与 Vite 生产构建通过。
- `npm run format:check`：包含 Tailwind/PostCSS 配置，全部通过。
- 13 个 TSX 文件经 TypeScript AST 比较：去除 className、CSS import 并规范化 JSX 空白后，与迁移前一致。
- Chromium 浏览器截图：上传、图床、云服务、配置，在 700/1180/1600px 宽度、800px 高度及 light/dark 下共 24 组，迁移前后 pixelmatch threshold=0.1 比较均为 0 差异像素。图片网络请求统一拦截为失败，避免远端图片影响比较。
- 额外 9 组状态截图：关于、托盘空闲/失败示意、预览控制、上传错误、图床全选、删除确认、图片预览、图床空状态，均为 0 差异像素。
- 模拟 IPC 的 NativeApp 浏览器交互：独立启用/禁用写入、其他字段草稿不随开关提交、写入失败恢复开关、默认上传服务更新、主题保存、700×600 窄窗口均通过，无页面 JavaScript 异常。

截图和临时比对脚本保存在本次本机 QA 目录 `/tmp/gopic-tailwind-qa`；迁移前源码快照保存在 `/tmp/gopic-tailwind-before`，均不参与产品构建。

## 验证边界

本次未重新打包原生应用，未在目标 macOS WebView 上验收，也未调用真实云端上传、托盘拖放或系统自启动。浏览器与模拟 IPC 结果仅证明本次前端样式和交互回归；不能代表外部服务与系统功能验证。未自动 commit。
