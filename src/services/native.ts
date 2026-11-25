import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  AppSettings,
  FileRecord,
  Snapshot,
  UploadTask,
} from "../domain/model";

/** 所有 IPC 由此封装，页面不拼命令字符串、不读取磁盘，也不处理签名凭证。 */
export const native = {
  async snapshot(): Promise<Snapshot> {
    const snapshot = await invoke<Snapshot>("get_snapshot");
    return { ...snapshot, files: snapshot.files.map(localRecord) };
  },
  saveSettings: (settings: AppSettings) =>
    invoke<AppSettings>("save_settings", { settings }),
  upload: (paths: string[], profileId: string, batchId: string) =>
    invoke<{ records: FileRecord[]; failed: number }>("upload_files", {
      paths,
      profileId,
      batchId,
    }),
  deleteRecords: (profileId: string, ids: string[]) =>
    invoke<void>("delete_records", { profileId, ids }),
  clearHistory: () => invoke<void>("clear_history"),
  clearCache: () => invoke<void>("clear_cache"),
  openCache: (recordId: string | null = null) =>
    invoke<void>("open_cache_directory", { recordId }),
  setStartup: (enabled: boolean) =>
    invoke<void>("set_launch_at_login", { enabled }),
  copy: writeText,
  /** 使用系统默认浏览器打开上传结果，不在应用 WebView 内导航。 */
  openUrl,
  about: () => openUrl("https://github.com/fanfq/tauri-desktop-gopic"),
  async pickFiles() {
    return (
      (await open({
        multiple: true,
        directory: false,
        title: "选择要上传的文件",
      })) ?? []
    );
  },
  async exportCache(profileId: string, ids: string[]) {
    const destination = await open({
      directory: true,
      multiple: false,
      title: "导出缓存文件到目录",
    });
    return destination
      ? invoke<{ exported: number; skipped: number; failed: number }>(
          "export_cache",
          { profileId, ids, destination },
        )
      : null;
  },
  async exportConfiguration() {
    const path = await save({
      defaultPath: `gopic-config-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON 配置", extensions: ["json"] }],
    });
    if (!path) return false;
    await invoke("export_configuration", { path });
    return true;
  },
  async importConfiguration() {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON 配置", extensions: ["json"] }],
    });
    return path
      ? invoke<{ added: number }>("import_configuration", { path })
      : null;
  },
  onProgress: (callback: (task: UploadTask) => void) =>
    listen<UploadTask>("upload-progress", (event) => callback(event.payload)),
  onDesktopError: (callback: (message: string) => void) =>
    listen<string>("desktop-error", (event) => callback(event.payload)),
  onLibraryChanged: (callback: () => void) =>
    listen("library-changed", callback),
  onDrop: (
    callback: (paths: string[]) => void,
    onHover: (hover: boolean) => void,
  ) =>
    getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        onHover(false);
        callback(event.payload.paths);
      } else
        onHover(
          event.payload.type === "enter" || event.payload.type === "over",
        );
    }),
};
function localRecord(record: FileRecord): FileRecord {
  // 图床预览只读取应用缓存，缓存已清理时不偷偷请求公网图片。
  return {
    ...record,
    src: record.cachePath ? convertFileSrc(record.cachePath) : "",
  };
}
/** 异步注册可能在组件卸载后才返回，届时立即取消，避免 StrictMode 重复监听。 */
export function subscribeSafely(
  register: () => Promise<UnlistenFn>,
  onError: (error: unknown) => void,
) {
  let disposed = false;
  let unlisten: UnlistenFn | undefined;
  void register()
    .then((value) => {
      if (disposed) value();
      else unlisten = value;
    })
    .catch((error) => {
      if (!disposed) onError(error);
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}
