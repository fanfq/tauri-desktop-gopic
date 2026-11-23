# GoPic Desktop

基于 Tauri 2、React 和 Rust 的桌面文件上传工具，界面沿用 Flutter GoPic 的布局。浏览器运行使用独立演示数据，Tauri 桌面运行接入真实上传与本地存储。

```bash
npm install
npm run tauri dev
# 仅查看浏览器页面预览
npm run dev
# 构建 macOS 调试应用
npm run tauri -- build --debug --bundles app
```

默认窗口 1180×800，最小 700×600。

- 上传：任意文件、多文件选择与拖拽，每文件独立任务、全局最多 4 文件并发；大于 10MiB 自动分片，每文件最多 4 分片滑动并发，流式读取与实时进度；图片队列显示本地缩略图，其他文件按格式显示图标。仅支持的图片参与压缩，压缩无收益或失败时保留原文件。
- 图床：本地缓存图片预览，其他文件显示类型图标；按配置与格式筛选、批量删除记录、导出缓存、定位缓存文件。
- 云服务：R2、S3、七牛、COS、OSS；多套配置、启用切换与配置导入导出。
- 配置：主题、命名规则、图片压缩、缓存统计和清理、系统自启动。
- macOS 托盘：18px 彩色品牌图标，上传/成功/失败反馈；左右键打开菜单，可复制最近上传链接、打开主窗口或退出。拖入文件显示 280×132 原生圆角浮层，上传后自动复制链接。关闭主窗口保留后台托盘，托盘菜单退出才结束进程。

## 代码结构

`src/domain` 定义共享模型与串行快照更新；`src/services/native.ts` 封装 IPC；`src/hooks/useNativeApp.ts` 管理桌面状态。`src/app/NativeApp.tsx` 与 `PreviewApp.tsx` 分别承载真实运行和预览。

`src-tauri/src` 按 models、store、upload、commands、desktop 分层。Cocoa 状态栏拖拽与原生绘制位于 `src-tauri/native/status_drop.m`，反馈状态机独立于原生视图，可单元测试。配置与缓存存放于应用数据目录，不自动导入 Flutter 历史。

## UI 样式

前端使用 Tailwind CSS 3.4，通过 PostCSS 编译；保留当前桌面布局、主题和交互。采用 3.4 以避免 Tailwind 4 的 Safari 16.4 最低要求，但旧版 macOS WebView 仍需目标设备验证。

- `tailwind.config.js`：扫描 TS/TSX 静态类名；集中定义主题颜色、间距与窗口断点。根字号维持 13px，间距刻度使用 px，因此 `p-5` 为 20px、`gap-2` 为 8px。
- `src/styles/index.css`：唯一样式入口。`base.css` 管理基础排版和 light/dark/system 变量；`components.css` 用 `@apply` 组合公共控件；`pages.css` 管理页面子元素与关联状态；`preview.css` 管理预览专用控件。
- 页面布局、间距和响应式样式直接使用 JSX 工具类；复用控件使用 components 层。`wide` ≥1500px，`compact` ≤1100px，`narrow` ≤900px，`small-window` ≤700px。
- 关闭 Preflight，显式维持现有表单和 dialog 基线。新增样式使用完整静态类名；运行时进度宽度、图片缩放继续使用 inline style，避免动态拼接无法被扫描的工具类。

## 验证

```bash
npm test
npm run build
npm run format:check
cd src-tauri
cargo test --lib
cargo check
```

已使用本地 HTTP 测试上传协议及失败路径，并在隔离桌面应用中验证普通文件上传、图片压缩、缓存预览、定位及导出。真实云厂商账号、登录后自启动及原生托盘拖放手势仍需现场验收；本地测试不代表这些外部环境已验证。

接口见 [Native contract](docs/implementation/native-contract.md)，功能盘点见 [Flutter 功能清单](docs/flutter-feature-inventory.md)，预览验收见 [design-qa.md](design-qa.md)。
