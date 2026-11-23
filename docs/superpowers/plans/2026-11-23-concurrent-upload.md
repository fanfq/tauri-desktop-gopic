# Concurrent Upload Implementation Plan

**Goal:** 多文件独立并发上传、滑动窗口分片与队列缩略图。

**Architecture:** Rust 上传调度器在窗口/托盘间共享 4 个文件上传许可。分片流式读取且保持每文件 4 并发。前端只接事件并按类型或本地缩略图渲染。

**Tech Stack:** Tokio, reqwest, image, Tauri, React, Tailwind。

- [x] 任务 A（主代理）：抽出 upload/batch.rs 与 thumbnail.rs，先补并发/失败隔离/缩略图测试，改造 commands.rs 与 lib.rs 接入共享调度器；扩展 UploadProgress queued/thumbnail。
- [x] 任务 B（独立代理）：在 upload/mod.rs、s3.rs、qiniu.rs 与 upload/tests.rs 实现流式范围读取、滑动分片窗口和本地 HTTP 测试，不修改 batch 或 UI 文件。
- [x] 任务 C（独立代理）：增强文件类型分类和上传队列缩略图，queued 视觉、输入顺序与状态计数，更新预览队列，测试分类与浏览器渲染，不修改 Rust。
- [x] 复核整合：更新 native-contract 和 README；核对事件、错误、缓存生命周期与并发资源上限；独立审查。
- [x] 验证：npm test、npm run build、npm run format:check，cargo test --lib、cargo check 与本地 UI。禁止 commit。
