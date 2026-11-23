import { Select } from "../components/Select";
import { useEffect, useRef, useState } from "react";
import {
  CloudArrowUp,
  Images,
  Cloud,
  GearSix,
  Info,
  CaretDown,
  CaretRight,
  SlidersHorizontal,
  ArrowCounterClockwise,
  CheckCircle,
  X,
  Tray,
  Copy,
  ArrowSquareOut,
  SignOut,
  WarningCircle,
} from "@phosphor-icons/react";
import { Modal, type Notify } from "../components/UI";
import { Upload, type Compression } from "../pages/Upload";
import { Gallery } from "../pages/Gallery";
import { CloudPage } from "../pages/Cloud";
import { Settings } from "../pages/Settings";
import {
  initialProfiles,
  initialFiles,
  providers,
  namingPatterns,
  type FileRecord,
  type Page,
  type ProviderId,
  type Scene,
} from "../preview/model";

const navigation = [
  { id: "upload" as const, label: "上传", icon: CloudArrowUp },
  { id: "gallery" as const, label: "图床", icon: Images },
  { id: "cloud" as const, label: "云服务", icon: Cloud },
  { id: "settings" as const, label: "配置", icon: GearSix },
];
const subtitles: Record<Page, string> = {
  upload: "轻松上传图片与文件",
  gallery: "管理图片与文件，随时取用",
  cloud: "管理云服务与多套存储配置",
  settings: "按你的习惯，设置 GoPic",
};
export default function PreviewApp() {
  const [page, setPage] = useState<Page>("upload");
  const [provider, setProvider] = useState<ProviderId>("r2");
  const [profiles, setProfiles] = useState(initialProfiles);
  const [activeId, setActiveId] = useState("r2-main");
  const [images, setImages] = useState(initialFiles);
  const [scene, setScene] = useState<Scene>("normal");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [previewPanel, setPreviewPanel] = useState(false);
  const [tray, setTray] = useState(false);
  const [trayStatus, setTrayStatus] = useState("idle");
  const [toast, setToast] = useState("");
  const [about, setAbout] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [compression, setCompression] = useState<Compression>({
    enabled: false,
    threshold: 1,
    quality: 70,
  });
  const [naming, setNaming] = useState(namingPatterns[0]);
  const objectUrls = useRef<string[]>([]);
  const mainRef = useRef<HTMLElement>(null);
  // 页面切换从顶部开始，保留侧栏与工具栏的位置。
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [page, provider]);
  const timer = useRef<number | undefined>(undefined);
  const notify: Notify = (message) => {
    setToast(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(""), 4200);
  };
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const enabled = profiles.filter((p) => p.enabled);
  const active = enabled.find((p) => p.id === activeId) ?? enabled[0];
  const reset = () => {
    setProfiles(initialProfiles);
    setImages(initialFiles);
    setActiveId("r2-main");
    setScene("normal");
    setCompression({ enabled: false, threshold: 1, quality: 70 });
    setNaming(namingPatterns[0]);
    setResetKey((k) => k + 1);
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
    notify("已恢复全部预览数据");
  };
  const uploaded = (file: File, src: string, profileId: string) => {
    objectUrls.current.push(src);
    const item: FileRecord = {
      id: crypto.randomUUID(),
      profileId,
      name: file.name,
      contentType: file.type,
      src,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      date: "2026-11-21 15:00",
      url: `https://cdn.example.com/images/${encodeURIComponent(file.name)}`,
    };
    setImages((all) => [item, ...all]);
  };
  return (
    <div
      className={`app flex h-[100dvh] min-h-[500px] bg-canvas text-ink theme-${theme}`}
    >
      <aside className="sidebar w-[220px] shrink-0 border-r border-solid border-r-line bg-sidebar flex flex-col p-[29px_12px_14px] narrow:w-[180px] narrow:pl-[9px] narrow:pr-[9px] small-window:w-[150px]">
        <div className="brand flex items-center gap-[11px] m-[0_10px_31px] narrow:ml-2 small-window:gap-2">
          <img src="/gopic.png" alt="GoPic" />
          <span>
            GoPic<small>图片，自由流动</small>
          </span>
        </div>
        <nav aria-label="主导航">
          {navigation.map((n) => (
            <div key={n.id}>
              <button
                className={`nav-item ${page === n.id ? "active" : ""}`}
                onClick={() => {
                  setPage(n.id);
                  setPreviewPanel(false);
                }}
              >
                <n.icon size={20} weight={page === n.id ? "fill" : "regular"} />
                <span>{n.label}</span>
                {n.id === "cloud" &&
                  (page === "cloud" ? (
                    <CaretDown size={13} />
                  ) : (
                    <CaretRight size={13} />
                  ))}
              </button>
              {n.id === "cloud" && page === "cloud" && (
                <div className="subnav grid gap-[3px] m-[6px_0_10px_21px] pl-[13px] border-l border-solid border-l-line small-window:ml-3 small-window:pl-1.5">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      className={provider === p.id ? "active" : ""}
                      onClick={() => setProvider(p.id)}
                    >
                      <span
                        className={`provider-bullet w-[5px] h-[5px] rounded-full bg-current provider-${p.id}`}
                      />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom mt-auto pt-5 pr-0.5 pb-0 pl-0.5">
          <div className="sidebar-footer flex justify-between items-center py-2 px-2.5 border-t border-solid border-t-line text-muted text-[12px] small-window:p-[8px_3px]">
            <span>
              GoPic <small>v0.1.0</small>
            </span>
            <button
              className="icon-button"
              aria-label="关于 GoPic"
              onClick={() => setAbout(true)}
            >
              <Info size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell min-w-0 flex-1 flex flex-col">
        <header className="page-header h-[87px] shrink-0 p-[0_30px] flex items-center justify-between gap-5 bg-surface border-b border-solid border-b-line compact:py-0 compact:px-6 narrow:h-20 narrow:py-0 narrow:px-5 small-window:py-0 small-window:px-3.5 small-window:gap-2">
          <div>
            <h1>
              {page === "cloud"
                ? providers.find((p) => p.id === provider)?.name
                : navigation.find((n) => n.id === page)?.label}
            </h1>
            <p>{subtitles[page]}</p>
          </div>
          <div className="header-actions flex items-center gap-4 narrow:gap-2">
            {(page === "upload" || page === "gallery") && (
              <Select
                label="默认云服务"
                variant="cloud"
                icon={<Cloud size={18} />}
                placeholder="未启用云服务"
                value={scene === "unconfigured" ? "" : (active?.id ?? "")}

                options={(scene === "unconfigured" ? [] : enabled).map((p) => ({
                  value: p.id,
                  label: `${providers.find((info) => info.id === p.provider)?.short ?? p.provider} · ${p.name}`,
                }))}
                onChange={setActiveId}
              />
            )}
            <button
              className={`icon-button ${previewPanel ? "pressed" : ""}`}
              title="预览控制"
              aria-label="打开预览控制"
              aria-expanded={previewPanel}
              onClick={() => setPreviewPanel(!previewPanel)}
            >
              <SlidersHorizontal size={20} />
            </button>
          </div>
        </header>
        <div className="preview-strip flex justify-between items-center p-[8px_30px] text-[10px] text-muted border-b border-solid border-b-line gap-2.5 compact:pl-6 compact:pr-6 narrow:pl-5 narrow:pr-5 small-window:py-2 small-window:px-3.5">
          <span>
            <i className="status-dot" />
            设计预览{" "}
            <span className="preview-strip-detail narrow:hidden">
              · 示例数据，未连接真实云服务
            </span>
          </span>
          <button
            onClick={() => {
              setTray(true);
              setPreviewPanel(false);
            }}
          >
            <Tray size={14} />
            状态栏预览
          </button>
        </div>
        <main
          ref={mainRef}
          className={`page-content flex-1 overflow-auto p-[26px_30px_18px] wide:pt-8 compact:p-[23px_24px] narrow:p-5 small-window:py-4 small-window:px-3.5 page-${page}`}
          key={resetKey}
        >
          {/* 保持任务组件挂载，切页不会中断预览任务。 */}
          <div hidden={page !== "upload"}>
            <Upload
              profile={active}
              scene={scene}
              compression={compression}
              setCompression={setCompression}
              notify={notify}
              onConfigure={() => setPage("cloud")}
              onUploaded={uploaded}
            />
          </div>
          {page === "gallery" && (
            <Gallery
              images={images}
              setImages={setImages}
              profile={active}
              scene={scene}
              notify={notify}
            />
          )}
          {page === "cloud" && (
            <CloudPage
              key={provider}
              provider={provider}
              profiles={profiles}
              setProfiles={setProfiles}
              notify={notify}
            />
          )}
          {page === "settings" && (
            <Settings
              theme={theme}
              setTheme={setTheme}
              scene={scene}
              naming={naming}
              setNaming={setNaming}
              notify={notify}
              clearHistory={() => setImages([])}
            />
          )}
        </main>
      </div>
      {previewPanel && (
        <>
          <button
            className="panel-dismiss z-[40]"
            aria-label="关闭预览控制"
            onClick={() => setPreviewPanel(false)}
          />
          <aside className="preview-controls fixed right-[22px] top-[72px] w-[290px] z-[41] p-[17px] bg-surface border border-solid border-line rounded-[10px] shadow-[0_12px_45px_#0003]">
            <div className="section-heading flex justify-between items-center gap-2.5">
              <h2>预览控制</h2>
              <button
                className="icon-button"
                aria-label="收起预览控制"
                onClick={() => setPreviewPanel(false)}
              >
                <X size={17} />
              </button>
            </div>
            <p>查看不同页面状态，无需真实上传。</p>
            <label>
              页面状态
              <Select
                label="页面演示状态"
                value={scene}
                onChange={(value) => setScene(value as Scene)}
                options={[
                  { value: "normal", label: "正常 · 示例内容" },
                  { value: "empty", label: "空状态 · 暂无记录" },
                  { value: "unconfigured", label: "未配置云服务" },
                  { value: "error", label: "异常 · 操作失败" },
                ]}
              />
            </label>
            <small>
              {page === "cloud"
                ? "云服务通过新增、启用、删除来演示配置状态。"
                : page === "settings"
                  ? "异常状态展示自启动不可用及配置传输失败。"
                  : "状态仅影响当前演示，真实数据不会被修改。"}
            </small>
            <button className="button full-width w-full" onClick={reset}>
              <ArrowCounterClockwise size={16} />
              恢复全部预览数据
            </button>
          </aside>
        </>
      )}
      {toast && (
        <div
          className="toast fixed z-[100] bottom-[27px] left-[calc(50%_+_90px)] [transform:translateX(-50%)] flex gap-[9px] items-center p-[13px_16px] bg-surface text-ink border border-solid border-line rounded-[9px] shadow-[0_5px_25px_#0002] text-[12px] max-w-[min(600px,_80vw)] w-[max-content] narrow:left-[calc(50%_+_60px)] small-window:left-[50%] small-window:max-w-[92vw]"
          role="status"
        >
          <CheckCircle size={19} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {about && (
        <Modal title="关于 GoPic" onClose={() => setAbout(false)}>
          <div className="about-content flex items-center flex-col gap-[13px] p-[35px]">
            <img src="/gopic.png" alt="" />
            <h2>GoPic</h2>
            <p>轻巧的桌面图床工具</p>
            <small>Tauri 设计预览 · v0.1.0</small>
            <a
              className="button"
              href="https://github.com/fanfq/tauri-desktop-gopic"
              target="_blank"
              rel="noreferrer"
            >
              <ArrowSquareOut size={16} />
              查看原项目
            </a>
          </div>
        </Modal>
      )}
      {tray && (
        <Modal title="macOS 状态栏预览" onClose={() => setTray(false)}>
          <div className="modal-body p-[22px] leading-[1.9]">
            <div className="tray-preview w-full max-w-[330px] m-[0_auto] border border-solid border-line rounded-[8px] overflow-hidden bg-soft">
              <div className="tray-menubar flex items-center gap-[9px] bg-line p-[10px_15px] text-[12px]">
                <CloudArrowUp size={20} weight="fill" />
                <span>GoPic</span>
                <small>状态栏示意</small>
              </div>
              <div className={`tray-drop ${trayStatus}`}>
                <CloudArrowUp size={32} />
                <strong>
                  {
                    (
                      {
                        idle: "拖拽文件到状态栏图标",
                        dragging: "松开以上传",
                        uploading: "正在上传 2 个文件…",
                        success: "上传成功，链接已复制",
                        error: "上传失败，请检查云配置",
                      } as Record<string, string>
                    )[trayStatus]
                  }
                </strong>
              </div>
              <div className="tray-menu bg-surface p-[5px] border-t border-solid border-t-line">
                <button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText("https://cdn.example.com/images/lake.jpg")
                      .then(
                        () => notify("最近上传的演示链接已复制"),
                        () => notify("剪贴板不可用"),
                      )
                  }
                >
                  <Copy size={16} />
                  最近上传：山间湖泊.jpg
                </button>
                <hr />
                <button
                  onClick={() => {
                    setTray(false);
                    setPage("upload");
                  }}
                >
                  <ArrowSquareOut size={16} />
                  打开 GoPic
                </button>
                <button
                  onClick={() => {
                    setTray(false);
                    notify("退出操作演示，预览仍保持运行");
                  }}
                >
                  <SignOut size={16} />
                  退出 GoPic
                </button>
              </div>
            </div>
            <div className="tray-states flex justify-center gap-[5px] m-[19px_0]">
              {[
                ["idle", "空闲"],
                ["dragging", "拖入"],
                ["uploading", "上传中"],
                ["success", "成功"],
                ["error", "失败"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={trayStatus === id ? "selected" : ""}
                  onClick={() => setTrayStatus(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="modal-note flex gap-2 items-center justify-center text-muted !text-[10px] !m-0">
              <WarningCircle size={16} />
              仅展示状态栏外观，原生拖拽将在迁移阶段接入。
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
