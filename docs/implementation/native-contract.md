# GoPic 原生功能接入约定

按已确认原布局实现，不重新设计，不自动 commit。前端负责展示与交互，Rust 负责持久化、文件、网络签名上传、压缩及桌面集成。浏览器保留隔离预览模式；桌面默认真实模式，禁止用模拟成功替代实际结果。

## 数据（camelCase serde）

Profile: {id,provider:r2|s3|qiniu|cos|oss,name,enabled,account,access,secret,bucket,endpoint,region,domain,prefix,pathStyle}，与 src/preview/model.ts 一致。
Settings: {profiles:Profile[],activeProfileId:string|null,compression:{enabled:boolean,threshold:number(MiB),quality:number},naming:string(沿用当前四种中文/模板标签),theme:light|dark|system}。
FileRecord: {id,profileId,name,size:string(展示),sizeBytes:number,date:string,contentType:string,url:string,cachePath:string|null,src:string(原生返回空，前端用 convertFileSrc(cachePath))}。
CacheSummary: {fileCount,totalBytes,directoryPath}。
Snapshot: {settings,files:FileRecord[],cache:CacheSummary,launchAtLogin:boolean,version:string}。

## 命令（invoke 参数 camelCase）

- get_snapshot -> Snapshot
- save_settings({settings}) -> Settings
- upload_files({paths:string[],profileId:string,batchId:string}) -> {records:FileRecord[],failed:number}。捕获该批次配置快照，每文件独立异步任务；窗口与托盘共用最多 4 文件并发，整批先注册 queued。事件负责实时状态，单文件失败不阻塞其他文件，结果和托盘批量复制链接维持输入顺序，失败不能写成功历史。
- delete_records({profileId,ids:string[]}) -> void，仅当前配置，本地记录及对应缓存，不删云端
- clear_history -> void，全历史，保留缓存
- clear_cache -> void，清缓存，保留历史，历史 cachePath 清空
- export_cache({profileId,ids,destination}) -> {exported,skipped,failed}，不覆盖用户已有文件
- open_cache_directory({recordId:string|null}) -> void，null 打开根缓存目录，非空定位此记录缓存文件，缺失返回明确错误
- export_configuration({path}) -> void，version=1 JSON，兼容 Flutter cloud 字段格式
- import_configuration({path}) -> {added:number}，验证后新增 ID，不覆盖现有，失败不修改数据
- set_launch_at_login({enabled}) -> void

文件选择/保存/目录选择由前端 tauri-plugin-dialog，剪贴板由 tauri-plugin-clipboard-manager；Rust 托盘可通过 arboard 写剪贴板。

## 事件

`upload-progress`: {taskId:string(批次ID:index),name:string,path:string,profileId:string,status:queued|uploading|done|error,progress:number(0..100),bytesPerSecond:number|null,error:string|null,thumbnail:string|null(最多96px的JPEG data URL),url:string|null,recordId:string|null}。
`library-changed`: 数据变化后通知前端重新加载快照。

## 原生边界

默认首次启动无真实密钥、无历史；每厂商可有一条空白禁用配置。落盘写入采用临时文件替换，失败不覆盖内存状态。缓存路径始终由内部 ID 派生，不信任导入路径。上传限内存，>10MiB 分片：S3 基准 5MiB 并按既有 10000 片约束增大，七牛 4MiB mkblk/mkfile 独立实现。每文件分片并发 <=4，使用 64KiB 范围流和滑动窗口补位，所有批次合计最多 4 文件（最多 16 分片请求）。进度聚合实际从快照读取并交给网络层的字节；合并及本地提交确认前最多显示 99.9%，不代表服务器已确认保存。上传失败停止补片，等待在途结束后 S3 abort。只保存最终上传成功的字节到缓存，缓存提交和托盘最近记录更新跨批次串行。

图片缩略图解码并发 <=2，解码预算 64MiB、最大边 12000px，输出最大 96px JPEG；失败仅回退类型图标，不影响原文件上传。队列缩略图不落盘、不上传、不放宽 assetProtocol 的路径范围。

命名规则维持原合同。保持原文件名时，清洗后同名文件仍对应同一个云端对象，覆盖结果取决于请求完成顺序；需保留多个版本时应选择现有 UUID 命名方案。

React 不读取凭证到日志，不输出签名请求、token 或带凭证 URL。Tauri opener 仅接缓存内部路径，不对任意 URL 开放文件读取权限。
