# GoPic Native Implementation Plan

**Goal:** 将已验收预览接入真实 Tauri 功能，保留任意文件上传、仅图片压缩与缓存目录入口。
**Architecture:** React 领域模型与页面独立，Native service 作为 IPC 边界，Rust models/store/upload/cloud/desktop/commands 分层。所有网络与磁盘操作在 Rust，任务通过事件同步。
**Tech Stack:** Tauri 2、React、TypeScript、Rust、reqwest、serde、image。

唯一接口依据 docs/implementation/native-contract.md。当前目录无 Git 元数据，不新建仓库，不 commit。

- [x] Rust 数据模型与存储：测试先覆盖原子保存、配置隔离删除、缓存与历史清除差异、配置导入新 ID 与无效数据回滚；实现 JSON 存储及缓存路径约束。
- [x] Rust 上传：测试签名、命名、URL 编码、图片压缩回退；S3 单文件与 multipart、七牛表单与分块；采用本地 HTTP 服务验证请求与失败路径。
- [x] Rust 桌面：注册命令、托盘/最近上传/自动复制、状态栏拖拽、自启动、缓存目录定位；权限限应用所需。
- [x] 前端原生服务：类型化 invoke、事件订阅清理、文件选择/拖拽、缓存 convertFileSrc；浏览器预览与真实模式明确隔离。
- [x] 上传与图床接入：真实进度和错误、本地图片预览、普通文件图标、复制、删除、全选导出、打开缓存目录。
- [x] 配置页接入：持久化主题/命名/压缩/云配置、真实自启动/缓存统计/清理/导入导出，所有失败保留原状态并提示。
- [ ] 质量检查：Rust 单元/本地 HTTP 测试、cargo check/test、TS tests/build/format；启动真实桌面检查持久化/缓存/目录/原生入口；记录未具备真实云密钥的外部验证边界。

验收不包含自动迁移 Flutter 历史；JSON 导入作为明确的用户操作。禁止虚报真实云端验证或签名发布。

## 当前验证记录（2026-11-21）

Rust 29 项测试与 cargo check、前端 11 项测试及 build/format 通过。隔离桌面中已验证普通文件上传、实际图片压缩、本地缓存图片预览、Finder 定位和批量导出；远端本地测试目录、缓存和导出文件哈希一致。托盘按 Flutter 参考重建，反馈状态机含并发与过期恢复测试，详见 docs/implementation/tray-verification.md。

质量检查保留未勾选：真实云厂商、登录自启动、状态栏左右键/拖放、重启后的完整桌面流程仍需现场验证。单元测试中的持久化重开验证不替代桌面重启验收。
