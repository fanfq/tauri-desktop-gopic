import {
  ArrowUp,
  Check,
  Copy,
  WarningCircle,
  CloudArrowUp,
  Plus,
  File,
  Clock,
} from "@phosphor-icons/react";
import type { AppSettings, UploadTask, Profile } from "../domain/model";
import { isProfileConfigured } from "../domain/model";
import { CompressionPanel } from "../components/CompressionPanel";
import { UploadFileIcon } from "../components/UploadFileIcon";
import { Notice, type Notify } from "../components/UI";
import { native } from "../services/native";

export function NativeUpload({
  settings,
  profile,
  tasks,
  dragging,
  uploading,
  onUpload,
  onSave,
  onConfigure,
  notify,
  onError,
}: {
  settings: AppSettings;
  profile?: Profile;
  tasks: UploadTask[];
  dragging: boolean;
  uploading: boolean;
  onUpload: (paths: string[]) => Promise<void>;
  onSave: (patch: Partial<AppSettings>) => Promise<unknown>;
  onConfigure: () => void;
  notify: Notify;
  onError: (error: unknown) => void;
}) {
  const pick = () => {
    void native.pickFiles().then(onUpload).catch(onError);
  };
  return (
    <>
      {!isProfileConfigured(profile) && (
        <Notice error>
          {profile
            ? "当前云服务配置不完整，请检查凭证、Bucket 和访问地址。"
            : "尚未启用云服务配置。"}
          <button className="text-button" onClick={onConfigure}>
            去配置云服务
          </button>
        </Notice>
      )}
      <CompressionPanel
        value={settings.compression}
        onSave={(compression) => onSave({ compression })}
        onError={onError}
      />
      <button
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onClick={pick}
        disabled={uploading}
      >
        <span className="upload-symbol grid place-items-center w-[66px] h-[66px] bg-tint text-accent rounded-[16px] mb-5">
          <CloudArrowUp size={34} weight="duotone" />
        </span>
        <h2>{dragging ? "松开鼠标，开始上传" : "拖拽文件到这里"}</h2>
        <p>或点击选择文件，支持多文件上传</p>
        <span className="button primary">
          <Plus size={16} />
          选择文件
        </span>
        <small>
          {uploading
            ? "当前批次上传中，请稍候"
            : "支持任意文件格式，仅图片可压缩"}
        </small>
      </button>
      <section className="queue mt-[27px]">
        <div className="section-heading flex justify-between items-center gap-2.5">
          <h2>
            上传队列{" "}
            <span className="count inline-block text-[10px] text-muted font-normal bg-soft py-0.5 px-1.5 rounded-[4px] ml-1.5 align-middle">
              {tasks.length}
            </span>
          </h2>
          <span className="muted text-muted">
            上传中 {tasks.filter((t) => t.status === "uploading").length} · 等待{" "}
            {tasks.filter((t) => t.status === "queued").length}
          </span>
        </div>
        {!tasks.length ? (
          <div className="queue-empty flex justify-center items-center gap-2.5 min-h-[95px] text-muted text-[12px]">
            <File size={24} />
            <span>添加文件后，上传进度会显示在这里</span>
          </div>
        ) : (
          <div className="panel task-list mt-[13px]">
            {tasks.map((task) => (
              <div
                className="task flex items-center gap-3 p-[15px_17px] min-h-[76px] narrow:p-[13px_12px] narrow:gap-[9px]"
                key={task.taskId}
              >
                <UploadFileIcon
                  name={task.name}
                  contentType={task.contentType}
                  thumbnail={task.thumbnail}
                  status={task.status}
                />
                <div className="task-info flex-1 min-w-0 small-window:min-w-[70px]">
                  <strong title={task.name}>{task.name}</strong>
                  {task.status === "error" ? (
                    <small className="error-text !text-danger">
                      {task.error || "上传失败"}
                    </small>
                  ) : task.status === "done" ? (
                    <small>上传完成，已保存本地缓存</small>
                  ) : task.status === "queued" ? (
                    <small>等待上传</small>
                  ) : (
                    <div className="progress h-[3px] bg-soft max-w-80 rounded-[3px] mt-2 overflow-hidden">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, task.progress))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className={`task-status ${task.status}`}>
                  {task.status === "done" ? (
                    <>
                      <Check size={15} />
                      已完成
                    </>
                  ) : task.status === "error" ? (
                    <>
                      <WarningCircle size={16} />
                      失败
                    </>
                  ) : task.status === "queued" ? (
                    <>
                      <Clock size={15} />
                      等待
                    </>
                  ) : (
                    <>
                      <ArrowUp size={14} />
                      {task.bytesPerSecond
                        ? formatSpeed(task.bytesPerSecond)
                        : "计算速率…"}
                      <span>{Math.round(task.progress)}%</span>
                    </>
                  )}
                </div>
                {task.status === "done" && (
                  <button
                    className="icon-button"
                    aria-label={`复制 ${task.name} 链接`}
                    onClick={() => {
                      void (
                        task.url
                          ? native.copy(task.url)
                          : Promise.reject(Error("上传结果链接不可用"))
                      )
                        .then(() => notify("链接已复制"))
                        .catch(onError);
                    }}
                  >
                    <Copy size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="page-footnote text-muted text-center text-[10px] mt-6 mb-2 leading-[1.8]">
        文件也可以拖到 macOS 状态栏图标，快速上传。
      </div>
    </>
  );
}
function formatSpeed(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB/s`
    : `${(bytes / 1024).toFixed(0)} KB/s`;
}
