import { CompressionPanel } from "../components/CompressionPanel";
import { Select } from "../components/Select";
import { useState } from "react";
import {
  Power,
  Sun,
  Moon,
  Monitor,
  TextAa,
  Image,
  HardDrives,
  ArrowSquareOut,
  DownloadSimple,
  UploadSimple,
  Trash,
  ClockCounterClockwise,
  FolderSimple,
} from "@phosphor-icons/react";
import { Confirm, Toggle, type Notify } from "../components/UI";
import {
  namingPatterns,
  type AppSettings,
  type Snapshot,
} from "../domain/model";
import { native } from "../services/native";

export function NativeSettings({
  snapshot,
  onSave,
  onMutation,
  notify,
  onError,
}: {
  snapshot: Snapshot;
  onSave: (patch: Partial<AppSettings>) => Promise<unknown>;
  onMutation: (action: () => Promise<unknown>) => Promise<unknown>;
  notify: Notify;
  onError: (error: unknown) => void;
}) {
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"cache" | "history" | "export">();
  const { settings, cache } = snapshot;
  const operation = async (
    action: () => Promise<unknown>,
    message?: string,
  ) => {
    setPending(true);
    try {
      const result = await onMutation(action);
      if (message) notify(message);
      return result;
    } catch (e) {
      onError(e);
      throw e;
    } finally {
      setPending(false);
    }
  };
  const confirmAction = async () => {
    try {
      if (confirm === "cache")
        await operation(native.clearCache, "本地缓存已清除");
      else if (confirm === "history")
        await operation(native.clearHistory, "上传历史已清除");
      else {
        const saved = await operation(native.exportConfiguration);
        if (saved) notify("配置已导出");
      }
      setConfirm(undefined);
    } catch {
      /* 保留确认窗口，允许用户在失败后重试。 */
    }
  };
  return (
    <fieldset
      className="settings-layout max-w-[850px] settings-fieldset"
      disabled={pending}
    >
      <section>
        <h2 className="settings-section-title flex gap-2 items-center text-[12px] m-[0_0_11px_2px]">
          <Monitor size={17} />
          外观
        </h2>
        <div className="panel settings-row">
          <div>
            <strong>主题</strong>
            <p>选择浅色、深色或跟随系统</p>
          </div>
          <div className="theme-control" role="group" aria-label="外观设置">
            {(
              [
                { id: "light", label: "浅色", icon: Sun },
                { id: "dark", label: "深色", icon: Moon },
                { id: "system", label: "跟随系统", icon: Monitor },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                aria-label={t.label}
                aria-pressed={settings.theme === t.id}
                className={settings.theme === t.id ? "selected" : ""}
                onClick={() => void onSave({ theme: t.id }).catch(onError)}
              >
                <t.icon size={17} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section>
        <h2 className="settings-section-title flex gap-2 items-center text-[12px] m-[0_0_11px_2px]">
          <Power size={17} />
          开机自启动
        </h2>
        <div className="panel settings-row">
          <div>
            <strong>登录后自动启动 GoPic</strong>
            <p>电脑重启并登录当前账户后，自动启动 GoPic</p>
          </div>
          <Toggle
            label="登录后自动启动 GoPic"
            checked={snapshot.launchAtLogin}
            disabled={pending}
            onChange={(enabled) =>
              void operation(
                () => native.setStartup(enabled),
                enabled ? "已开启开机自启动" : "已关闭开机自启动",
              ).catch(() => undefined)
            }
          />
        </div>
      </section>
      <section>
        <h2 className="settings-section-title flex gap-2 items-center text-[12px] m-[0_0_11px_2px]">
          <TextAa size={17} />
          上传文件命名
        </h2>
        <div className="panel settings-card p-5 narrow:p-[17px]">
          <div className="settings-row no-padding">
            <div>
              <strong>重命名方案</strong>
              <p>后续上传的文件将使用此规则</p>
            </div>
            <Select
              label="重命名方案"
              value={settings.naming}
              onChange={(value) =>
                void onSave({ naming: value }).catch(onError)
              }
              options={namingPatterns.map((pattern) => ({
                value: pattern,
                label: pattern,
              }))}
            />
          </div>
          <div className="naming-example flex items-center gap-[17px] mt-[18px] bg-soft rounded-[5px] p-[11px_13px] text-[10px] small-window:gap-2 small-window:flex-wrap">
            <span>示例路径</span>
            <code>
              {settings.naming === namingPatterns[0]
                ? "images/photo.jpg"
                : settings.naming === namingPatterns[1]
                  ? "images/YYYYMMDD/a8f2k9_photo.jpg"
                  : settings.naming === namingPatterns[2]
                    ? "images/YYYYMMDD/8f2a9b3c…e91.jpg"
                    : "images/8f2a9b3c…e91.jpg"}
            </code>
          </div>
          {settings.naming === namingPatterns[0] && (
            <p className="settings-hint text-[10px] text-muted mt-[11px]">
              保持原文件名时，同一路径下的同名云端文件会被覆盖。
            </p>
          )}
        </div>
      </section>
      {/* 编辑全局上传压缩设置；上传页与托盘继续读取同一份已保存配置。 */}
      <section>
        <h2 className="settings-section-title flex gap-2 items-center text-[12px] m-[0_0_11px_2px]">
          <Image size={17} />
          图片压缩
        </h2>
        <CompressionPanel
          value={settings.compression}
          onSave={(compression) => onSave({ compression })}
          onError={onError}
        />
      </section>
      <section>
        <h2 className="settings-section-title flex gap-2 items-center text-[12px] m-[0_0_11px_2px]">
          <HardDrives size={17} />
          图床缓存
        </h2>
        <div className="panel settings-card p-5 narrow:p-[17px]">
          <div className="cache-stats flex justify-between items-center gap-3">
            <div>
              <strong>
                {(cache.totalBytes / 1024 / 1024).toFixed(2)} <span>MB</span>
              </strong>
              <p>{cache.fileCount} 个缓存文件 · 本地占用</p>
            </div>
            <span className="cache-label flex gap-1.5 items-center text-[10px] text-muted">
              <i className="status-dot green" />
              仅保存在本机
            </span>
          </div>
          <div className="cache-path flex items-center gap-2 bg-soft rounded-[5px] p-[5px_10px] m-[18px_0_16px] text-muted text-[10px]">
            <FolderSimple size={16} />
            <span>{cache.directoryPath}</span>
            <button
              className="icon-button"
              aria-label="打开缓存目录"
              onClick={() => void native.openCache().catch(onError)}
            >
              <ArrowSquareOut size={16} />
            </button>
          </div>
          <div className="ui-inline flex items-center gap-2.5 wrap flex-wrap">
            <button
              className="button"
              disabled={pending}
              onClick={() => setConfirm("cache")}
            >
              <Trash size={16} />
              清除本地缓存
            </button>
            <button
              className="button"
              disabled={pending}
              onClick={() => setConfirm("history")}
            >
              <ClockCounterClockwise size={16} />
              清除上传历史
            </button>
          </div>
        </div>
      </section>
      <section>
        <h2 className="settings-section-title flex gap-2 items-center text-[12px] m-[0_0_11px_2px]">
          <DownloadSimple size={17} />
          配置备份与迁移
        </h2>
        <div className="panel transfer-panel">
          <div className="settings-row">
            <div>
              <strong>导出配置</strong>
              <p>将所有云服务配置导出为 JSON，便于备份和迁移</p>
              <small className="warning-text text-[#b3843f]">
                文件包含明文密钥，请妥善保管
              </small>
            </div>
            <button
              className="button"
              disabled={pending}
              onClick={() => setConfirm("export")}
            >
              <DownloadSimple size={16} />
              导出配置
            </button>
          </div>
          <div className="settings-row">
            <div>
              <strong>导入配置</strong>
              <p>以新增方式导入，不覆盖本机已有配置</p>
            </div>
            <button
              className="button"
              disabled={pending}
              onClick={() =>
                void operation(native.importConfiguration)
                  .then((result) => {
                    if (result)
                      notify(
                        `配置已导入：新增 ${(result as { added: number }).added} 项`,
                      );
                  })
                  .catch(() => undefined)
              }
            >
              <UploadSimple size={16} />
              导入配置
            </button>
          </div>
        </div>
      </section>
      {confirm && (
        <Confirm
          title={
            confirm === "cache"
              ? "清除本地缓存"
              : confirm === "history"
                ? "清除上传历史"
                : "导出配置"
          }
          description={
            confirm === "cache"
              ? `将清除本机 ${cache.fileCount} 个缓存文件，保留上传历史和云端文件。`
              : confirm === "history"
                ? "将清除所有配置的本地上传历史，保留本地缓存和云端文件。"
                : "导出的 JSON 文件包含所有云服务明文密钥，请保存到可信位置。"
          }
          label={confirm === "export" ? "选择保存位置" : "确认清除"}
          onClose={() => setConfirm(undefined)}
          onConfirm={confirmAction}
        />
      )}
    </fieldset>
  );
}
