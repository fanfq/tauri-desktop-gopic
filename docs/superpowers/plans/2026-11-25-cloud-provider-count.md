# 云服务配置数量 Implementation Plan

**Goal:** 侧栏统一展示各厂商启用数和配置总数。

**Architecture:** 共享领域统计函数与标签组件，正式壳传入 settings.profiles，预览壳传入 profiles。0 配置隐藏，状态随 props 自动更新。

**Tech Stack:** React / TypeScript、Node test、Vite SSR。

- [x] `tests/preview-model.test.mjs` 先加入统计隔离、开关、新增删除测试，确认缺少统计结果时失败。
- [x] `src/domain/model.ts` 增加统计函数；`src/components/CloudProviderCount.tsx` 共用标签；`src/app/{NativeApp,PreviewApp}.tsx` 接入。
- [x] 验证有配置显示统计、无配置隐藏标签；执行前端测试、构建、格式及差异检查。

不自动 commit，保留已完成的缤纷云、Kodo 和上传队列改动。

验证结果：39 项前端测试通过，`npm run build`、`npm run format:check` 和 `git diff --check` 通过。标签已覆盖 1/2、0/2、无配置隐藏和配置变化场景；未进行原生窗口视觉验证。
