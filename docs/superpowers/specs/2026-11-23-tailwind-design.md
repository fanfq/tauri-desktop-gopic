# Tailwind 样式迁移

目标：将 Tauri React 前端迁移到 Tailwind，保持已确认的布局、主题与业务交互，包括云配置启用开关立即保存。

采用 Tailwind 3.4 + PostCSS，避免 v4 引入新的 Safari 16.4 最低要求。关闭 Preflight，以免默认字体行高、表单和 dialog 重置改变现有视觉；现有基础样式显式保留。

页面独有的布局、间距与响应式规则使用 JSX 静态工具类；重复组件（按钮、表单、面板、开关、弹窗）用 components 层的 @apply 复用。主题 CSS 变量映射到 Tailwind 颜色，支持 light/dark/system。保留 700/900/1100/1500px 断点与 reduced-motion。

样式按基础与主题、共享组件、页面子元素、预览拆分，由单一入口导入。宽度、进度、缩放等运行时数值继续使用 inline style，不拼接动态 Tailwind 类名。

验证：迁移前后相同页面、主题与窗口尺寸截图和元素计算样式对比；现有测试、TypeScript/Vite 构建、格式检查。浏览器预览验证不代表云端上传、系统自启动或原生托盘已实测。不自动 commit。
