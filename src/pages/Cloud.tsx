import { useEffect, useState } from "react";
import {
  Plus,
  Trash,
  Eye,
  EyeSlash,
  FloppyDisk,
  CheckCircle,
  Cloud,
} from "@phosphor-icons/react";
import { Confirm, Notice, Toggle, type Notify } from "../components/UI";
import { providers, type Profile, type ProviderId } from "../domain/model";

export function CloudPage({
  provider,
  profiles,
  setProfiles,
  notify,
  nativeMode = false,
}: {
  provider: ProviderId;
  profiles: Profile[];
  setProfiles: (p: Profile[]) => void | Promise<void>;
  nativeMode?: boolean;
  notify: Notify;
}) {
  const [pending, setPending] = useState(false);
  const available = profiles.filter((x) => x.provider === provider);
  const [selected, setSelected] = useState<string | undefined>(
    available[0]?.id,
  );
  const [draft, setDraft] = useState<Profile | undefined>(available[0]);
  const [showSecret, setShowSecret] = useState(false);
  const [deleting, setDeleting] = useState<Profile>();
  const info = providers.find((p) => p.id === provider)!;
  useEffect(() => {
    const first = profiles.find((x) => x.provider === provider);
    setSelected(first?.id);
    setDraft(first);
    setShowSecret(false);
  }, [provider]); // 切换厂商时重置草稿，避免表单跨厂商串值。
  const update = (key: keyof Profile, value: string | boolean) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setEnabled = async (enabled: boolean) => {
    if (pending || !draft) return;
    const id = draft.id;
    const saved = profiles.find((p) => p.id === id);
    if (!saved) return;
    setPending(true);
    setDraft((d) => (d?.id === id ? { ...d, enabled } : d));
    try {
      // 开关独立生效：仅更新已保存配置的启用状态，不提交表单中的其他草稿。
      await setProfiles(
        profiles.map((p) => (p.id === id ? { ...p, enabled } : p)),
      );
    } catch (e) {
      // 写入失败时恢复开关，保留其他字段的未保存编辑。
      setDraft((d) => (d?.id === id ? { ...d, enabled: saved.enabled } : d));
      notify(String(e));
    } finally {
      setPending(false);
    }
  };
  const add = async () => {
    if (pending) return;
    const p: Profile = {
      id: crypto.randomUUID(),
      provider,
      name: `${info.short} 配置 ${available.length + 1}`,
      enabled: false,
      account: "",
      access: "",
      secret: "",
      bucket: "",
      endpoint: info.defaultEndpoint ?? "",
      region: info.defaultRegion ?? (provider === "r2" ? "auto" : ""),
      domain: "",
      prefix: "",
      pathStyle: true,
    };
    setPending(true);
    try {
      await setProfiles([...profiles, p]);
      setSelected(p.id);
      setDraft(p);
    } catch (e) {
      notify(String(e));
    } finally {
      setPending(false);
    }
  };
  const field = (
    key: keyof Profile,
    label: string,
    placeholder: string,
    optional = false,
  ) => (
    <label className="form-row">
      <span>
        {label}
        {optional && <small>可选</small>}
      </span>
      <input
        value={String(draft?.[key] ?? "")}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  return (
    <fieldset
      className="cloud-layout grid grid-cols-[210px_minmax(0,_1fr)] gap-5 [align-items:start] compact:grid-cols-[180px_minmax(0,_1fr)] compact:gap-[15px] narrow:grid-cols-[155px_minmax(0,_1fr)] narrow:gap-3 small-window:grid-cols-[1fr] cloud-fieldset"
      disabled={pending}
    >
      <aside className="panel profile-list p-[11px_8px] small-window:flex small-window:flex-wrap small-window:gap-[5px] small-window:items-center">
        <div className="section-heading flex justify-between items-center gap-2.5">
          <h2>
            配置项{" "}
            <span className="count inline-block text-[10px] text-muted font-normal bg-soft py-0.5 px-1.5 rounded-[4px] ml-1.5 align-middle">
              {available.length}
            </span>
          </h2>
          <button className="icon-button" aria-label="新增配置" onClick={add}>
            <Plus size={19} />
          </button>
        </div>
        {available.map((p) => (
          <div
            className={`profile-item ${selected === p.id ? "selected" : ""}`}
            key={p.id}
          >
            <button
              className="profile-select flex items-start gap-[9px] min-w-0 flex-1 text-left bg-transparent p-[12px_9px] narrow:gap-1.5 narrow:pl-1.5"
              onClick={() => {
                setSelected(p.id);
                setDraft(p);
              }}
            >
              <Cloud size={18} />
              <span>
                <strong>{p.name}</strong>
                <small>
                  <i className={`status-dot ${p.enabled ? "green" : ""}`} />
                  {p.enabled ? "已启用" : "未启用"}
                </small>
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={`删除配置 ${p.name}`}
              onClick={() => setDeleting(p)}
            >
              <Trash size={16} />
            </button>
          </div>
        ))}
        <button
          className="add-profile flex items-center justify-center gap-1.5 w-full p-[12px_5px] border-t border-solid border-t-line mt-[9px] bg-transparent text-muted text-[11px] small-window:w-auto small-window:border-0 small-window:m-0 small-window:p-2"
          onClick={add}
        >
          <Plus size={16} />
          新增配置
        </button>
      </aside>
      <div className="cloud-editor min-w-0">
        {draft ? (
          <>
            <section className="panel">
              <div className="editor-heading p-[19px_22px] flex justify-between items-center border-b border-solid border-b-line gap-2.5 narrow:p-[17px_15px]">
                <div>
                  <h2>{draft.name || "未命名配置"}</h2>
                  <p>配置仅在本机保存</p>
                </div>
                <div className="ui-inline flex items-center gap-2.5">
                  <span className="muted text-muted">启用</span>
                  <Toggle
                    label="启用当前云配置"
                    checked={draft.enabled}
                    onChange={setEnabled}
                  />
                </div>
              </div>
              <div className="form-fields p-[23px_22px] grid gap-[15px] compact:p-[18px_16px] narrow:gap-[13px]">
                {field("name", "配置名称", "例如：个人图床")}
                {/* 各厂商统一保留可选账号备注，Kodo 也可记录 Account / App ID。 */}
                {field("account", "Account / App ID", "用于记录账号信息", true)}
                <div className="form-divider text-[10px] text-muted pt-[9px] pb-[3px] border-t border-solid border-t-line mt-1.5">
                  访问凭证
                </div>
                {field(
                  "access",
                  provider === "qiniu" ? "AccessKey" : "Access Key ID",
                  "请输入访问密钥 ID",
                )}
                <label className="form-row">
                  <span>Secret Access Key</span>
                  <div className="password-input relative min-w-0">
                    <input
                      aria-label="Secret Access Key"
                      type={showSecret ? "text" : "password"}
                      value={draft.secret}
                      placeholder="请输入访问密钥"
                      autoComplete="off"
                      onChange={(e) => update("secret", e.target.value)}
                    />
                    <button
                      className="icon-button"
                      aria-label={showSecret ? "隐藏密钥" : "显示密钥"}
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                <div className="form-divider text-[10px] text-muted pt-[9px] pb-[3px] border-t border-solid border-t-line mt-1.5">
                  存储与访问
                </div>
                {field("bucket", "Bucket 名称", "例如：gopic-images")}
                {field(
                  "endpoint",
                  provider === "qiniu" ? "上传域名" : "Endpoint",
                  provider === "qiniu"
                    ? "https://up-z0.qiniup.com"
                    : (info.defaultEndpoint ?? "https://example.endpoint.com"),
                )}
                {provider !== "qiniu" &&
                  field(
                    "region",
                    "Region",
                    info.defaultRegion ??
                      (provider === "r2" ? "auto" : "us-east-1"),
                  )}
                {field(
                  "domain",
                  "公网 URL 前缀",
                  "https://cdn.example.com",
                  provider !== "qiniu",
                )}
                {field("prefix", "路径前缀", "images/", true)}
                {provider !== "qiniu" && (
                  <div className="form-row">
                    <span>Path-style URL</span>
                    <div className="ui-inline flex items-center gap-2.5">
                      <Toggle
                        label="Path-style URL"
                        checked={draft.pathStyle}
                        onChange={(v) => update("pathStyle", v)}
                      />
                      <small className="muted text-muted">
                        多数 S3 兼容服务可保持启用
                      </small>
                    </div>
                  </div>
                )}
              </div>
              <div className="editor-footer flex items-center justify-between gap-2.5 p-[15px_20px] border-t border-solid border-t-line narrow:p-3 narrow:flex-wrap">
                <span>
                  <CheckCircle size={15} />
                  {nativeMode
                    ? "凭证仅保存在本机，用于签名上传"
                    : "示例凭证，不会发送到云端"}
                </span>
                <button
                  className="button primary"
                  onClick={async () => {
                    if (!draft.name.trim()) {
                      notify("请填写配置名称");
                      return;
                    }
                    setPending(true);
                    try {
                      await setProfiles(
                        profiles.map((p) => (p.id === draft.id ? draft : p)),
                      );
                      notify(
                        draft.access &&
                          draft.secret &&
                          draft.bucket &&
                          draft.endpoint &&
                          (provider !== "qiniu" || draft.domain)
                          ? nativeMode
                            ? "配置已保存"
                            : "演示配置已保存"
                          : nativeMode
                            ? "配置已保存，参数尚不完整"
                            : "演示配置已保存，参数尚不完整",
                      );
                    } catch (e) {
                      notify(String(e));
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  <FloppyDisk size={16} />
                  保存配置
                </button>
              </div>
            </section>
            <Notice>{info.hint}</Notice>
          </>
        ) : (
          <div className="panel empty-state min-h-[380px] flex items-center justify-center flex-col gap-[15px] text-muted">
            <Cloud size={36} />
            <h2>添加第一套配置</h2>
            <p>可为 {info.name} 保存多套参数。</p>
            <button className="button primary" onClick={add}>
              <Plus size={16} />
              新增配置
            </button>
          </div>
        )}
      </div>
      {deleting && (
        <Confirm
          title="删除配置项"
          description={`确定删除「${deleting.name}」吗？不会删除云端文件。${nativeMode ? "" : "此处仅修改预览数据。"}`}
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            const next = profiles.filter((p) => p.id !== deleting.id);
            setPending(true);
            try {
              await setProfiles(next);
              if (selected === deleting.id) {
                const p = next.find((p) => p.provider === provider);
                setSelected(p?.id);
                setDraft(p);
              }
              setDeleting(undefined);
              notify(nativeMode ? "配置已删除" : "演示配置已删除");
            } catch (e) {
              notify(String(e));
            } finally {
              setPending(false);
            }
          }}
        />
      )}
    </fieldset>
  );
}
