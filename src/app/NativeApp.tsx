import { Select } from "../components/Select";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CloudArrowUp,
  Images,
  Cloud,
  GearSix,
  Info,
  CaretDown,
  CaretRight,
  X,
  CheckCircle,
} from "@phosphor-icons/react";
import { Modal, type Notify } from "../components/UI";
import { Gallery } from "../pages/Gallery";
import { CloudPage } from "../pages/Cloud";
import { NativeSettings } from "../pages/NativeSettings";
import { NativeUpload } from "../pages/NativeUpload";
import { providers, type Page, type ProviderId } from "../domain/model";
import { useNativeApp } from "../hooks/useNativeApp";
import { native } from "../services/native";

const navigation = [
  { id: "upload", label: "上传", icon: CloudArrowUp },
  { id: "gallery", label: "图床", icon: Images },
  { id: "cloud", label: "云服务", icon: Cloud },
  { id: "settings", label: "配置", icon: GearSix },
] as const;
const subtitles: Record<Page, string> = {
  upload: "轻松上传图片与文件",
  gallery: "管理图片与文件，随时取用",
  cloud: "管理云服务与多套存储配置",
  settings: "按你的习惯，设置 GoPic",
};

/** 应用壳只组合页面；真实数据、任务与生命周期由 useNativeApp 管理。 */
export default function NativeApp() {
  const [page, setPage] = useState<Page>("upload");
  const [provider, setProvider] = useState<ProviderId>("r2");
  const [toast, setToast] = useState("");
  const [about, setAbout] = useState(false);
  const timeout = useRef<number | undefined>(undefined);
  const main = useRef<HTMLElement>(null);
  const notify: Notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setToast(""), 5000);
  }, []);
  useEffect(() => () => window.clearTimeout(timeout.current), []);
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [page, provider]);
  const app = useNativeApp(notify);
  const snapshot = app.snapshot;
  if (!snapshot)
    return (
      <div className="app flex h-[100dvh] min-h-[100dvh] bg-canvas text-ink theme-system native-loading items-center justify-center p-8">
        <div className="panel">
          <h1>GoPic</h1>
          <p>{app.error || "正在读取本地配置…"}</p>
          {app.error && (
            <button
              className="button"
              onClick={() => void app.refresh().catch(app.report)}
            >
              重试
            </button>
          )}
        </div>
      </div>
    );
  const { settings, files } = snapshot;
  const enabled = settings.profiles.filter((p) => p.enabled);
  const active =
    enabled.find((p) => p.id === settings.activeProfileId) ?? enabled[0];
  const remove = async (profileId: string, ids: string[]) => {
    await native.deleteRecords(profileId, ids);
    await app.refresh();
  };
  const exportFiles = async (profileId: string, ids: string[]) => {
    const result = await native.exportCache(profileId, ids);
    if (result)
      notify(
        `导出完成：成功 ${result.exported} 项，跳过 ${result.skipped} 项，失败 ${result.failed} 项`,
      );
  };
  return (
    <div
      className={`app flex h-[100dvh] min-h-[500px] bg-canvas text-ink theme-${settings.theme}`}
    >
      <aside className="sidebar w-[220px] shrink-0 border-r border-solid border-r-line bg-sidebar flex flex-col p-[29px_12px_14px] narrow:w-[180px] narrow:pl-[9px] narrow:pr-[9px] small-window:w-[150px]">
        <div className="brand flex items-center gap-[11px] m-[0_10px_31px] narrow:ml-2 small-window:gap-2">
          <img src="/gopic.png" alt="GoPic" />
          <span>
            GoPic<small>图片，自由流动</small>
          </span>
        </div>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <div key={item.id}>
              <button
                className={`nav-item ${page === item.id ? "active" : ""}`}
                disabled={app.mutating}
                onClick={() => setPage(item.id)}
              >
                <item.icon
                  size={20}
                  weight={page === item.id ? "fill" : "regular"}
                />
                <span>{item.label}</span>
                {item.id === "cloud" &&
                  (page === "cloud" ? (
                    <CaretDown size={13} />
                  ) : (
                    <CaretRight size={13} />
                  ))}
              </button>
              {item.id === "cloud" && page === "cloud" && (
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
              GoPic <small>v{snapshot.version}</small>
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
                : navigation.find((p) => p.id === page)?.label}
            </h1>
            <p>{subtitles[page]}</p>
          </div>
          {(page === "upload" || page === "gallery") && (
            <div className="header-actions flex items-center gap-4 narrow:gap-2">
              <Select
                label="默认云服务"
                variant="cloud"
                icon={<Cloud size={18} />}
                placeholder="未启用云服务"
                value={active?.id ?? ""}
                disabled={app.mutating}
                options={enabled.map((p) => ({
                  value: p.id,
                  label: `${providers.find((info) => info.id === p.provider)?.short ?? p.provider} · ${p.name}`,
                }))}
                onChange={(value) =>
                  void app
                    .savePatch({ activeProfileId: value })
                    .catch(app.report)
                }
              />
            </div>
          )}
        </header>
        <main
          ref={main}
          className={`page-content flex-1 overflow-auto p-[26px_30px_18px] wide:pt-8 compact:p-[23px_24px] narrow:p-5 small-window:py-4 small-window:px-3.5 page-${page}`}
        >
          {page === "upload" && (
            <NativeUpload
              settings={settings}
              profile={active}
              tasks={app.tasks}
              dragging={app.dragging}
              uploading={app.uploading}
              onUpload={app.upload}
              onSave={app.savePatch}
              onConfigure={() => setPage("cloud")}
              notify={notify}
              onError={app.report}
            />
          )}
          {page === "gallery" && (
            <Gallery
              images={files}
              profile={active}
              scene="normal"
              notify={notify}
              actions={{
                copy: native.copy,
                openCache: native.openCache,
                remove,
                export: exportFiles,
              }}
            />
          )}
          {page === "cloud" && (
            <CloudPage
              key={provider}
              provider={provider}
              profiles={settings.profiles}
              nativeMode
              setProfiles={async (profiles) => {
                const activeProfileId = profiles.some(
                  (p) => p.id === settings.activeProfileId && p.enabled,
                )
                  ? settings.activeProfileId
                  : (profiles.find((p) => p.enabled)?.id ?? null);
                await app.savePatch({ profiles, activeProfileId });
              }}
              notify={notify}
            />
          )}
          {page === "settings" && (
            <NativeSettings
              snapshot={snapshot}
              onSave={app.savePatch}
              onMutation={app.mutate}
              notify={notify}
              onError={app.report}
            />
          )}
        </main>
      </div>
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
            <small>版本 {snapshot.version}</small>
            <button
              className="button"
              onClick={() => void native.about().catch(app.report)}
            >
              查看项目
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
