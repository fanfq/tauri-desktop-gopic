import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  WarningCircle,
  File as FileIcon,
  CloudArrowUp,
  Plus,
  Clock,
} from "@phosphor-icons/react";
import { UploadFileIcon } from "../components/UploadFileIcon";
import { Notice, Toggle, type Notify } from "../components/UI";
import {
  isProfileConfigured,
  shouldCompressFile,
  type Profile,
  type Scene,
} from "../domain/model";

interface Task {
  id: string;
  name: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  thumbnail?: string;
  url: string;
  file?: File;
  profileId?: string;
  compressible?: boolean;
}
export interface Compression {
  enabled: boolean;
  threshold: number;
  quality: number;
}
export function Upload({
  profile,
  scene,
  compression,
  setCompression,
  notify,
  onConfigure,
  onUploaded,
}: {
  profile?: Profile;
  scene: Scene;
  compression: Compression;
  setCompression: (c: Compression) => void;
  notify: Notify;
  onConfigure: () => void;
  onUploaded: (file: File, src: string, profileId: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const configured = isProfileConfigured(profile) && scene !== "unconfigured";
  const recorded = useRef(new Set<string>());
  const activeBatch = useRef(false);
  const uploading = tasks.some(
    (task) => task.status === "queued" || task.status === "uploading",
  );
  // 成功后才写入演示图床，并保留开始上传时的配置归属。
  useEffect(() => {
    tasks.forEach((task) => {
      if (
        task.status === "done" &&
        task.file &&
        task.profileId &&
        !recorded.current.has(task.id)
      ) {
        recorded.current.add(task.id);
        onUploaded(task.file, URL.createObjectURL(task.file), task.profileId);
      }
    });
  }, [tasks, onUploaded]);
  useEffect(() => {
    const interval = window.setInterval(
      () =>
        setTasks((all) => {
          const advanced = all.map((task): Task =>
            task.status !== "uploading"
              ? task
              : {
                  ...task,
                  progress: Math.min(100, task.progress + 13),
                  status: task.progress + 13 >= 100 ? "done" : "uploading",
                },
          );
          // 预览模拟与原生相同的四任务上限，完成一个后立即补入等待任务。
          let slots =
            4 - advanced.filter((task) => task.status === "uploading").length;
          const next = advanced.map((task): Task =>
            task.status === "queued" && slots-- > 0
              ? { ...task, status: "uploading" }
              : task,
          );
          activeBatch.current = next.some(
            (task) => task.status === "queued" || task.status === "uploading",
          );
          return next;
        }),
      330,
    );
    return () => window.clearInterval(interval);
  }, []);
  const accept = (files: FileList | File[]) => {
    if (!configured) {
      notify("请先启用并完成云服务配置");
      return;
    }
    if (activeBatch.current) {
      notify("当前批次仍在上传，请稍后添加文件");
      return;
    }
    const accepted = Array.from(files);
    if (!accepted.length) return;
    activeBatch.current = scene !== "error";
    // 一次注册整批且维持输入顺序，缩略图 URL 由每个图标组件管理生命周期。
    const added: Task[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      file,
      compressible: shouldCompressFile(file, compression),
      profileId: profile!.id,
      progress: 0,
      status: scene === "error" ? "error" : "queued",
      url: `https://cdn.example.com/images/${encodeURIComponent(file.name)}`,
    }));
    setTasks((all) => [...all, ...added]);
  };
  const examples: Task[] =
    scene === "empty"
      ? []
      : [
          {
            id: "demo1",
            name: "山间湖泊.jpg",
            thumbnail: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path fill="#b9deeb" d="M0 0h96v96H0z"/><path fill="#81a8a2" d="M0 63 34 19 63 61 82 31 96 57v39H0z"/><path fill="#44869d" d="M0 65h96v31H0z"/><path fill="#e5f0e9" d="m34 19 13 19-14-6-11 4z"/></svg>')}`,
            progress: 100,
            status: "done",
            url: "https://cdn.example.com/images/lake.jpg",
          },
          {
            id: "demo2",
            name: scene === "error" ? "产品说明.pdf" : "素材备份.zip",
            progress: scene === "error" ? 42 : 68,
            status: scene === "error" ? "error" : "uploading",
            url: "",
          },
        ];
  const shown = tasks.length ? tasks : examples;
  return (
    <>
      {!configured && (
        <Notice error>
          {profile && scene !== "unconfigured"
            ? `${profile.name} 配置不完整，请检查凭证、Bucket 和访问地址。`
            : "尚未启用可用的云服务。"}
          <button className="text-button" onClick={onConfigure}>
            去配置云服务
          </button>
        </Notice>
      )}
      <section className="panel compression flex items-center justify-between p-[16px_19px] gap-[15px] compact:flex-wrap small-window:p-3.5">
        <div className="ui-inline flex items-center gap-2.5">
          <Toggle
            label="启用图片压缩"
            checked={compression.enabled}
            onChange={(enabled) => setCompression({ ...compression, enabled })}
          />
          <div>
            <strong>图片压缩</strong>
            <small>
              {compression.enabled
                ? "仅处理符合条件的图片，其他文件保持原样"
                : "关闭后所有文件均保持原样"}
            </small>
          </div>
        </div>
        <div className="compression-inputs flex gap-3.5 items-center compact:ml-auto small-window:ml-0">
          <label>
            阈值{" "}
            <span className="unit-input flex items-center border border-solid border-line rounded-[5px] overflow-hidden bg-soft">
              <input
                aria-label="压缩阈值 MB"
                type="number"
                min="0.1"
                step="0.1"
                disabled={!compression.enabled}
                value={compression.threshold}
                onChange={(e) =>
                  setCompression({
                    ...compression,
                    threshold: Math.max(0.1, Number(e.target.value)),
                  })
                }
              />
              <span>MB</span>
            </span>
          </label>
          <label>
            JPEG 质量{" "}
            <span className="unit-input flex items-center border border-solid border-line rounded-[5px] overflow-hidden bg-soft">
              <input
                aria-label="JPEG 质量"
                type="number"
                min="1"
                max="100"
                disabled={!compression.enabled}
                value={compression.quality}
                onChange={(e) =>
                  setCompression({
                    ...compression,
                    quality: Math.max(1, Math.min(100, Number(e.target.value))),
                  })
                }
              />
              <span>%</span>
            </span>
          </label>
        </div>
      </section>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          if (e.target.files) accept(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        className={`dropzone ${dragging ? "dragging" : ""}`}
        disabled={uploading}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files);
        }}
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
              {shown.length}
            </span>
          </h2>
          <span className="muted text-muted">
            上传中 {shown.filter((task) => task.status === "uploading").length}{" "}
            · 等待 {shown.filter((task) => task.status === "queued").length}
          </span>
        </div>
        {!shown.length ? (
          <div className="queue-empty flex justify-center items-center gap-2.5 min-h-[95px] text-muted text-[12px]">
            <FileIcon size={24} />
            <span>添加文件后，上传进度会显示在这里</span>
          </div>
        ) : (
          <div className="panel task-list mt-[13px]">
            {shown.map((t) => (
              <div
                className="task flex items-center gap-3 p-[15px_17px] min-h-[76px] narrow:p-[13px_12px] narrow:gap-[9px]"
                key={t.id}
              >
                <UploadFileIcon
                  name={t.name}
                  file={t.file}
                  contentType={t.file?.type}
                  thumbnail={t.thumbnail}
                  status={t.status}
                />
                <div className="task-info flex-1 min-w-0 small-window:min-w-[70px]">
                  <strong>{t.name}</strong>
                  {t.file && (
                    <small>
                      {t.compressible
                        ? "符合图片压缩条件（预览不执行压缩）"
                        : "原文件上传"}
                    </small>
                  )}
                  {t.status === "error" ? (
                    <small className="error-text !text-danger">
                      上传失败 · 无法连接到 Endpoint，请检查配置
                    </small>
                  ) : t.status === "done" ? (
                    <small>{t.url}</small>
                  ) : t.status === "queued" ? (
                    <small>等待上传</small>
                  ) : (
                    <>
                      <div className="progress h-[3px] bg-soft max-w-80 rounded-[3px] mt-2 overflow-hidden">
                        <span style={{ width: `${t.progress}%` }} />
                      </div>
                      <small>正在上传 · 2.4 MB / 3.6 MB</small>
                    </>
                  )}
                </div>
                <div className={`task-status ${t.status}`}>
                  {t.status === "done" ? (
                    <>
                      <Check size={15} />
                      已完成
                    </>
                  ) : t.status === "error" ? (
                    <>
                      <WarningCircle size={16} />
                      失败
                    </>
                  ) : t.status === "queued" ? (
                    <>
                      <Clock size={15} />
                      等待
                    </>
                  ) : (
                    <>
                      <ArrowUp size={14} />
                      1.2 MB/s <span>{t.progress}%</span>
                    </>
                  )}
                </div>
                {t.status === "done" && (
                  <button
                    className="icon-button"
                    aria-label={`复制 ${t.name} 链接`}
                    onClick={() =>
                      void navigator.clipboard.writeText(t.url).then(
                        () => notify("演示链接已复制"),
                        () => notify("剪贴板不可用"),
                      )
                    }
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
