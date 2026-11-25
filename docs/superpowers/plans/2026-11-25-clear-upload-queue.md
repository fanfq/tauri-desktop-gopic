# 清空上传队列 Implementation Plan

**Goal:** 队列标题等待数量右侧提供清空操作。

**Architecture:** 共用可清空条件；原生 hook 执行列表清理并忽略已清空任务的迟到事件；预览通过本地状态隐藏初始示例。

**Tech Stack:** React、TypeScript、Node test、Vite SSR。

- [x] 为按钮位置、清空回调、空/忙/等待/上传禁用和资格判定增加测试，先观察缺少按钮/判定时失败。
- [x] 修改 `src/domain/model.ts`、`src/hooks/useNativeApp.ts`、`src/app/NativeApp.tsx`、`src/pages/{NativeUpload,Upload}.tsx`。
- [x] 执行前端测试、构建、格式和 diff 检查并复核不会删除图床或缓存。

不自动 commit。

验证结果：41 项前端测试、前端构建、Prettier 和 git diff 检查通过。清空只更新队列状态，不调用删除图床记录、缓存或云端文件的接口；未进行原生窗口手工验证。
