# GoPic 页面预览实施计划

**Goal:** 在新 Tauri 工程提供全部 Flutter 页面可点击预览，使用隔离数据。
**Architecture:** React 页面共享预览模型；每个主页面独立文件，通用控件与样式共享。保留 Rust 模板，不接云端与系统操作。
**Tech Stack:** React、TypeScript、Vite、Tauri 2、Phosphor icons。

- [x] 数据：src/preview/model.ts 定义厂商、配置、图片记录、按配置筛选与本地记录删除；使用 Node 测试确认配置隔离。
- [x] 页面壳：src/App.tsx 统一导航、主题、演示场景、状态栏菜单与反馈；src/components/UI.tsx 提供对话框、开关和按钮。
- [x] 上传：src/pages/Upload.tsx 实现压缩、选择图片、拖入、模拟进度、成功/失败和复制。
- [x] 图床：src/pages/Gallery.tsx 实现当前配置筛选、多选、菜单、导出反馈、局部删除、大图缩放。
- [x] 云配置：src/pages/Cloud.tsx 实现五厂商、多套配置、字段编辑、密钥显隐、新增和删除。
- [x] 设置：src/pages/Settings.tsx 实现命名、自启动模拟、缓存统计、清理确认与导入导出结果演示。
- [x] 样式：src/App.css 复用源布局，补充响应式、深色、键盘焦点、减少动画偏好。
- [x] 验收：npm run build、数据边界测试；通过应用内浏览器检查四页面、弹窗、暗色、窄窗口；写 design-qa.md。

此为可逆 UI 预览，不对每个展示组件添加镜像测试。对配置隔离等行为编写有意义的测试。无 commit、无 push、无部署。
