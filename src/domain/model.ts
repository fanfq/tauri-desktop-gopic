import { classifyFile, fileExtension } from "./file-type.ts";
export { fileExtension } from "./file-type.ts";

/** 正式界面与预览共用厂商定义；真实配置和演示凭证分别保存。 */
export type ProviderId = "r2" | "s3" | "qiniu" | "cos" | "oss" | "bitiful";
export type Page = "upload" | "gallery" | "cloud" | "settings";
export type Scene = "normal" | "empty" | "unconfigured" | "error";
export const providers: {
  id: ProviderId;
  name: string;
  short: string;
  hint: string;
  /** 厂商固定的初始连接参数，仅用于新建配置，不覆盖用户编辑值。 */
  defaultEndpoint?: string;
  defaultRegion?: string;
}[] = [
  {
    id: "r2",
    name: "Cloudflare R2",
    short: "R2",
    hint: "Region 通常填写 auto，使用账户对应的 R2 Endpoint。",
  },
  {
    id: "s3",
    name: "Amazon S3",
    short: "S3",
    hint: "填写 Bucket 所在区域，也可使用其他 S3 兼容服务。",
  },
  {
    id: "qiniu",
    name: "七牛云 Kodo",
    short: "Kodo",
    hint: "上传域名应与空间区域一致，公网 URL 前缀为必填项。",
  },
  {
    id: "cos",
    name: "腾讯云 COS",
    short: "COS",
    hint: "使用 S3 兼容 Endpoint；真实云端兼容性将在功能接入阶段验证。",
  },
  {
    id: "oss",
    name: "阿里云 OSS",
    short: "OSS",
    hint: "使用 S3 兼容 Endpoint；真实云端兼容性将在功能接入阶段验证。",
  },
  {
    id: "bitiful",
    name: "缤纷云 S4",
    short: "S4",
    hint: "使用子账户 AccessKey / SecretKey，并先授权到目标 Bucket 或目录。默认 Region 为 cn-east-1，支持 S3 兼容上传。",
    defaultEndpoint: "https://s3.bitiful.net",
    defaultRegion: "cn-east-1",
  },
];
export interface Profile {
  id: string;
  provider: ProviderId;
  name: string;
  enabled: boolean;
  account: string;
  access: string;
  secret: string;
  bucket: string;
  endpoint: string;
  region: string;
  domain: string;
  prefix: string;
  pathStyle: boolean;
}
/** 按厂商统计启用数和总数；直接使用当前配置，新增/删除/切换后无需额外同步。 */
export function cloudProviderCounts(
  profiles: readonly Pick<Profile, "provider" | "enabled">[],
  provider: ProviderId,
): { enabled: number; total: number } {
  const own = profiles.filter((profile) => profile.provider === provider);
  return {
    enabled: own.filter((profile) => profile.enabled).length,
    total: own.length,
  };
}

export interface FileRecord {
  id: string;
  profileId: string;
  name: string;
  size: string;
  date: string;
  src: string;
  contentType?: string;
  cachePath?: string | null;
  sizeBytes?: number;
  url: string;
}
export function visibleFiles(
  images: FileRecord[],
  profileId: string,
  extension: string,
) {
  return images.filter(
    (x) =>
      x.profileId === profileId &&
      (!extension ||
        (extension === "__none"
          ? !fileExtension(x.name)
          : fileExtension(x.name) === extension)),
  );
}
/** 删除边界始终限制在当前配置，避免跨配置选择残留影响其他记录。 */
export function removeFiles(
  images: FileRecord[],
  profileId: string,
  ids: string[],
) {
  return images.filter((x) => x.profileId !== profileId || !ids.includes(x.id));
}
export const namingPatterns = [
  "保持原文件名",
  "{YYYYMMDD}/{HASH}_{FILENAME}",
  "{YYYYMMDD}/{UUID}.{EXT}",
  "{UUID}.{EXT}",
];

/** 与 Flutter 的上传前校验保持一致：可选中配置不等于配置完整。 */
export function isProfileConfigured(profile?: Profile): boolean {
  return (
    !!profile &&
    profile.enabled &&
    [profile.access, profile.secret, profile.bucket, profile.endpoint].every(
      (value) => value.trim().length > 0,
    ) &&
    (profile.provider !== "qiniu" || !!profile.domain.trim())
  );
}

/** 类型判定供任务图标、图片预览及压缩资格共用；非图片从不送入图片处理。 */
export function isImageFile(file: {
  name: string;
  contentType?: string;
}): boolean {
  return classifyFile(file) === "image";
}
export function shouldCompressFile(
  file: { name: string; size: number },
  config: { enabled: boolean; threshold: number },
): boolean {
  return (
    config.enabled &&
    file.size > config.threshold * 1024 * 1024 &&
    ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"].includes(
      fileExtension(file.name),
    )
  );
}
/** 普通文件使用链接语法，不能把 PDF、压缩包等输出成 Markdown 图片。 */
export function fileMarkdown(
  file: { name: string; url: string; contentType?: string },
  thumbnail = false,
): string {
  const name = file.name.replace(/[\\[\]]/g, "\\$&");
  return `${isImageFile(file) ? "!" : ""}[${name}](${file.url}${thumbnail && isImageFile(file) ? ` "${file.name}"` : ""})`;
}

export interface Compression {
  enabled: boolean;
  threshold: number;
  quality: number;
}
export type Theme = "light" | "dark" | "system";
export interface AppSettings {
  profiles: Profile[];
  activeProfileId: string | null;
  compression: Compression;
  naming: string;
  theme: Theme;
}
export interface CacheSummary {
  fileCount: number;
  totalBytes: number;
  directoryPath: string;
}
export interface Snapshot {
  settings: AppSettings;
  files: FileRecord[];
  cache: CacheSummary;
  launchAtLogin: boolean;
  version: string;
}
/** 仅空闲且所有任务已结束时允许清空，避免移除仍在接收进度的任务。 */
export function canClearUploadQueue(
  tasks: readonly { status: "queued" | "uploading" | "done" | "error" }[],
  uploading: boolean,
): boolean {
  return (
    tasks.length > 0 &&
    !uploading &&
    tasks.every((task) => task.status === "done" || task.status === "error")
  );
}

export interface UploadTask {
  taskId: string;
  name: string;
  path: string;
  profileId: string;
  status: "queued" | "uploading" | "done" | "error";
  /** 本机限尺寸缩略图；兼容旧版本未携带此字段的进度事件。 */
  thumbnail?: string | null;
  contentType?: string;
  progress: number;
  bytesPerSecond: number | null;
  error: string | null;
  url?: string;
  recordId?: string;
}
