import { Select } from "../components/Select";
import { useState } from "react";
import {
  Power,
  Sun,
  Moon,
  Monitor,
  TextAa,
  HardDrives,
  ArrowSquareOut,
  DownloadSimple,
  UploadSimple,
  Trash,
  ClockCounterClockwise,
  FolderSimple,
} from "@phosphor-icons/react";
import { Confirm, Modal, Notice, Toggle, type Notify } from "../components/UI";
import { namingPatterns, type Scene } from "../domain/model";

export function Settings({
  notify,
  scene,
  naming,
  setNaming,
  clearHistory,
  theme,
  setTheme,
}: {
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  notify: Notify;
  scene: Scene;
  naming: string;
  setNaming: (s: string) => void;
  clearHistory: () => void;
}) {
  const [startup, setStartup] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [confirm, setConfirm] = useState<"cache" | "history">();
  const [transfer, setTransfer] = useState<"export" | "import">();
  const [fileName, setFileName] = useState("");
  return (
    <div className="settings-layout max-w-[850px]">
      {/* 主题状态仍由应用统一管理，切换页面后继续生效。 */}
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
                type="button"
                aria-label={t.label}
                aria-pressed={theme === t.id}
                className={theme === t.id ? "selected" : ""}
                onClick={() => setTheme(t.id)}
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
            <p>
              {scene === "error"
                ? "当前环境无法设置开机自启动"
                : "电脑重启并登录当前账户后，自动启动 GoPic"}
            </p>
          </div>
          <Toggle
            label="登录后自动启动 GoPic"
            checked={startup}
            disabled={scene === "error"}
            onChange={(v) => {
              setStartup(v);
              notify(v ? "演示：已开启自启动" : "演示：已关闭自启动");
            }}
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
              value={naming}
              onChange={setNaming}
              options={namingPatterns.map((pattern) => ({
                value: pattern,
                label: pattern,
              }))}
            />
          </div>
          <div className="naming-example flex items-center gap-[17px] mt-[18px] bg-soft rounded-[5px] p-[11px_13px] text-[10px] small-window:gap-2 small-window:flex-wrap">
            <span>示例路径</span>
            <code>
              {naming === namingPatterns[0]
                ? "images/photo.jpg"
                : naming === namingPatterns[1]
                  ? "images/20261121/a8f2k9_photo.jpg"
                  : naming === namingPatterns[2]
                    ? "images/20261121/8f2a9b3c…e91.jpg"
                    : "images/8f2a9b3c…e91.jpg"}
            </code>
          </div>
          {naming === namingPatterns[0] && (
            <p className="settings-hint text-[10px] text-muted mt-[11px]">
              保持原文件名时，同一路径下的同名云端文件会被覆盖。
            </p>
          )}
        </div>
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
                {cacheCleared || scene === "empty" ? "0" : "24.8"}{" "}
                <span>MB</span>
              </strong>
              <p>
                {cacheCleared || scene === "empty"
                  ? "0 个缓存文件"
                  : "7 个缓存文件"}{" "}
                · 本地占用
              </p>
            </div>
            <span className="cache-label flex gap-1.5 items-center text-[10px] text-muted">
              <i className="status-dot green" />
              仅保存在本机
            </span>
          </div>
          <div className="cache-path flex items-center gap-2 bg-soft rounded-[5px] p-[5px_10px] m-[18px_0_16px] text-muted text-[10px]">
            <FolderSimple size={16} />
            <span>~/Library/Application Support/GoPic/cache</span>
            <button
              className="icon-button"
              aria-label="打开缓存目录"
              onClick={() =>
                notify("目录打开演示：系统文件管理器将在功能接入后可用")
              }
            >
              <ArrowSquareOut size={16} />
            </button>
          </div>
          <div className="ui-inline flex items-center gap-2.5 wrap flex-wrap">
            <button className="button" onClick={() => setConfirm("cache")}>
              <Trash size={16} />
              清除本地缓存
            </button>
            <button className="button" onClick={() => setConfirm("history")}>
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
            <button className="button" onClick={() => setTransfer("export")}>
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
              onClick={() => {
                setTransfer("import");
                setFileName("");
              }}
            >
              <UploadSimple size={16} />
              导入配置
            </button>
          </div>
        </div>
      </section>
      <div className="page-footnote text-muted text-center text-[10px] mt-6 mb-2 leading-[1.8]">
        以上为交互预览，系统设置、目录操作与配置传输将在功能迁移阶段接入。
      </div>
      {confirm && (
        <Confirm
          title={confirm === "cache" ? "清除本地缓存" : "清除上传历史"}
          description={
            confirm === "cache"
              ? "将清除本机缓存文件，保留上传历史和云端文件。此次仅清除预览缓存统计。"
              : "将清除所有配置的本地上传历史，保留本地缓存和云端文件。此次仅清除预览记录。"
          }
          label="确认清除"
          onClose={() => setConfirm(undefined)}
          onConfirm={() => {
            if (confirm === "cache") setCacheCleared(true);
            else clearHistory();
            setConfirm(undefined);
            notify("预览数据已清除");
          }}
        />
      )}
      {transfer && (
        <Modal
          title={transfer === "export" ? "导出配置" : "导入配置"}
          onClose={() => setTransfer(undefined)}
        >
          <div className="modal-body p-[22px] leading-[1.9]">
            <Notice>这是操作预览，不会导出真实密钥或导入真实配置。</Notice>
            {transfer === "export" ? (
              <>
                <p>导出文件</p>
                <div className="file-choice block p-3.5 border border-dashed border-line bg-soft rounded-[6px] mb-[15px] text-[12px] [overflow-wrap:anywhere]">
                  gopic-config-2026-11-21.json
                </div>
                <p className="muted text-muted">
                  包含云服务参数、压缩设置与命名规则，不包含上传历史及图片缓存。
                </p>
              </>
            ) : (
              <>
                <p>选择 JSON 配置文件，确认后演示导入结果。</p>
                <label className="file-choice block p-3.5 border border-dashed border-line bg-soft rounded-[6px] mb-[15px] text-[12px] [overflow-wrap:anywhere]">
                  {fileName || "选择配置文件"}
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) =>
                      setFileName(e.target.files?.[0]?.name ?? "")
                    }
                  />
                </label>
                <p className="muted text-muted">
                  导入后创建新的配置 ID，不覆盖现有配置。
                </p>
              </>
            )}
          </div>
          <footer>
            <button className="button" onClick={() => setTransfer(undefined)}>
              取消
            </button>
            <button
              className="button primary"
              disabled={transfer === "import" && !fileName}
              onClick={() => {
                notify(
                  scene === "error"
                    ? "演示：配置操作失败，请检查文件格式与权限"
                    : transfer === "export"
                      ? "演示：配置导出成功（未写入文件）"
                      : "演示：配置导入成功（未写入配置）",
                );
                setTransfer(undefined);
              }}
            >
              {transfer === "export" ? "演示导出" : "演示导入"}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
