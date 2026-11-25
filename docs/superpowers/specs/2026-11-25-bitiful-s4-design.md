# 缤纷云 S4 接入设计

用户已确认独立厂商入口、复用 S3 上传的方案。

- 内部厂商 ID 为 `bitiful`，显示为「缤纷云 S4」。
- 新建配置默认 Endpoint 为 `https://s3.bitiful.net`、Region 为 `cn-east-1`，继续使用可切换的 Path-style 和现有域名、路径前缀字段。
- 前端正式界面与预览、Rust 初始配置和校验同步支持新厂商；已有配置保持原值，无需数据迁移。
- 配置导出使用 `bitifulS4`，导入接受 `bitifulS4` 与内部 ID `bitiful`，保留现有厂商映射。
- 沿用 Signature V4、普通 PUT、分片上传和失败清理，不新建传输协议。
- 测试覆盖默认参数、持久化/导入导出、URL 与签名、普通及分片上传；执行前后端测试、构建和格式检查。
- 不自动 commit，不修改 Flutter 工程。没有实际云账号时只声明本地协议验证。

依据：https://docs.bitiful.com/developer/sdk/intro
