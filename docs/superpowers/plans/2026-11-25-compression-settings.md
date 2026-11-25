# 压缩设置迁移 Implementation Plan

**Goal:** 提高数量标签可读性，将图片压缩设置集中在配置页。

**Architecture:** 共享数量标签使用 12px 和强调色；两套配置页复用已有 CompressionPanel，压缩参数仍由原来的共享状态保存。上传页继续读取压缩值执行处理。

**Tech Stack:** React / TypeScript、Vite SSR、Node test。

- [x] 新增 `tests/settings-compression.test.mjs`，先观察配置页缺少控件和上传页仍有控件的断言失败。
- [x] 修改 `src/components/CloudProviderCount.tsx`；迁移 `src/pages/{NativeUpload,Upload,NativeSettings,Settings}.tsx` 的控件及属性；修改两套应用壳传参，共用 domain Compression 类型。
- [x] 执行测试、前端构建、格式和差异检查；复核已有压缩设置仍由共享配置读取。

保留之前改动，不自动 commit。

验证结果：43 项前端测试通过，前端构建、Prettier、git diff 检查通过。配置页已验证保留已有阈值 2.5 MB 和质量 82，上传页不再渲染压缩编辑控件。未进行原生窗口视觉验证。
