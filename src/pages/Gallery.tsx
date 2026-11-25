import { ImagePreview } from "../components/ImagePreview";
import { Select } from "../components/Select";
import { useEffect, useState } from "react";
import {
  CheckSquare,
  Square,
  DotsThree,
  Copy,
  Trash,
  DownloadSimple,
  FolderOpen,
  Images,
  Check,
} from "@phosphor-icons/react";
import { FileType } from "../components/FileType";
import { Confirm, Photo, type Notify } from "../components/UI";
import {
  removeFiles,
  isImageFile,
  fileExtension,
  fileMarkdown,
  visibleFiles,
  type FileRecord,
  type Profile,
  type Scene,
} from "../domain/model";

export function Gallery({
  images,
  setImages,
  profile,
  scene,
  notify,
  actions,
}: {
  images: FileRecord[];
  setImages?: (images: FileRecord[]) => void;
  actions?: {
    copy: (text: string) => Promise<void>;
    openCache: (id: string) => Promise<void>;
    remove: (profileId: string, ids: string[]) => Promise<void>;
    export: (profileId: string, ids: string[]) => Promise<void>;
  };
  profile?: Profile;
  scene: Scene;
  notify: Notify;
}) {
  const [extension, setExtension] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [menu, setMenu] = useState<string>();
  const [preview, setPreview] = useState<FileRecord>();
  const [deleting, setDeleting] = useState<string[] | null>(null);
  useEffect(() => {
    setSelected([]);
    setExtension("");
    setMenu(undefined);
    setPreview(undefined);
  }, [profile?.id, scene]);
  const items =
    scene === "empty" || scene === "unconfigured"
      ? []
      : visibleFiles(images, profile?.id ?? "", extension);
  const extensions = [
    ...new Set(
      visibleFiles(images, profile?.id ?? "", "").map(
        (item) => fileExtension(item.name) || "__none",
      ),
    ),
  ].sort();
  const allSelected =
    items.length > 0 && items.every((i) => selected.includes(i.id));
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  const copy = (value: string) =>
    void (
      actions ? actions.copy(value) : navigator.clipboard.writeText(value)
    ).then(
      () => {
        notify(actions ? "已复制到剪贴板" : "已复制演示内容");
        setMenu(undefined);
      },
      () => notify("剪贴板不可用"),
    );
  return (
    <>
      {/* 工具栏与批量操作栏留在滚动区外，只有文件列表滚动。 */}
      <div className="gallery-layout flex min-h-0 flex-1 w-full flex-col">
        <div className="gallery-toolbar flex shrink-0 justify-between gap-3 items-center mb-[21px] small-window:gap-[5px] small-window:flex-wrap">
          <div className="ui-inline flex items-center gap-2.5">
            <h2>
              所有文件{" "}
              <span className="count inline-block text-[10px] text-muted font-normal bg-soft py-0.5 px-1.5 rounded-[4px] ml-1.5 align-middle">
                {items.length}
              </span>
            </h2>
            <span className="divider h-4 w-px bg-line m-[0_5px]" />
            <Select
              label="文件格式筛选"
              variant="compact"
              value={extension}
              onChange={(value) => {
                setExtension(value);
                setSelected([]);
              }}
              options={[
                { value: "", label: "全部格式" },
                ...extensions.map((x) => ({
                  value: x,
                  label: x === "__none" ? "无扩展名" : x.toUpperCase(),
                })),
              ]}
            />
          </div>
          <div className="ui-inline flex items-center gap-2.5">
            <button
              className="button"
              disabled={!items.length}
              onClick={() =>
                setSelected(allSelected ? [] : items.map((x) => x.id))
              }
            >
              {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              {allSelected ? "取消全选" : "全选"}
            </button>
            <button
              className="icon-button"
              aria-label="清空当前配置历史"
              disabled={!items.length}
              onClick={() =>
                setDeleting(
                  visibleFiles(images, profile?.id ?? "", "").map((x) => x.id),
                )
              }
            >
              <Trash size={19} />
            </button>
          </div>
        </div>
        <div
          className="gallery-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-0.5"
          role="region"
          aria-label="文件列表"
          tabIndex={0}
        >
          {!items.length ? (
            <div className="empty-state min-h-[380px] flex items-center justify-center flex-col gap-[15px] text-muted">
              <span className="empty-icon w-[78px] h-[78px] rounded-[18px] bg-soft grid place-items-center text-accent">
                <Images size={38} weight="duotone" />
              </span>
              <h2>
                {scene === "unconfigured" || !profile
                  ? "还没有选择云服务"
                  : "这里还没有文件"}
              </h2>
              <p>
                {extension
                  ? "当前格式下暂无记录，试试切换文件格式。"
                  : "上传后的文件会显示在这里，图片支持预览。"}
              </p>
            </div>
          ) : (
            <div className="gallery-grid grid grid-cols-[repeat(auto-fill,_minmax(175px,_1fr))] gap-[17px] wide:grid-cols-[repeat(auto-fill,_minmax(200px,_1fr))] compact:gap-[13px] compact:grid-cols-[repeat(auto-fill,_minmax(160px,_1fr))] small-window:grid-cols-[repeat(auto-fill,_minmax(140px,_1fr))]">
              {items.map((item) => (
                <article
                  className={`image-card ${selected.includes(item.id) ? "selected" : ""}`}
                  key={item.id}
                >
                  <div className="image-cover relative h-[166px] overflow-hidden rounded-[7px_7px_0_0] wide:h-[190px] compact:h-[150px]">
                    {isImageFile(item) ? (
                      <button
                        className="image-open w-full h-full p-0 block bg-soft"
                        aria-label={`预览 ${item.name}`}
                        onClick={() => {
                          setPreview(item);
                        }}
                      >
                        <Photo
                          src={
                            scene === "error"
                              ? "/preview-missing-image.jpg"
                              : item.src
                          }
                          alt={item.name}
                        />
                      </button>
                    ) : (
                      <div
                        className="file-cover w-full h-full flex flex-col items-center justify-center gap-3 bg-soft text-accent"
                        aria-label={`${item.name} 文件，不支持图片预览`}
                      >
                        <FileType
                          name={item.name}
                          contentType={item.contentType}
                        />
                        <span>
                          {fileExtension(item.name).toUpperCase() || "文件"}
                        </span>
                      </div>
                    )}
                    <button
                      className="select-image absolute top-2.5 left-2.5 grid place-items-center bg-[#ffffffeb] text-[#8c98a7] rounded-[4px] p-0"
                      aria-label={`选择 ${item.name}`}
                      aria-pressed={selected.includes(item.id)}
                      onClick={() => toggle(item.id)}
                    >
                      {selected.includes(item.id) ? (
                        <CheckSquare size={22} weight="fill" />
                      ) : (
                        <Square size={22} />
                      )}
                    </button>
                    <span className="image-format absolute right-[9px] bottom-[9px] bg-[#17233677] text-white rounded-[3px] text-[9px] p-[3px_5px] pointer-events-none">
                      {fileExtension(item.name).toUpperCase() || "文件"}
                    </span>
                  </div>
                  <div className="image-meta relative p-[13px_35px_13px_12px]">
                    <strong title={item.name}>{item.name}</strong>
                    <small>
                      {item.size} <span>·</span> {item.date.slice(5, 10)}
                    </small>
                    <button
                      className="icon-button image-menu absolute right-[3px] top-[17px] w-[27px] h-[27px]"
                      aria-label={`${item.name} 更多操作`}
                      aria-expanded={menu === item.id}
                      onClick={() =>
                        setMenu(menu === item.id ? undefined : item.id)
                      }
                    >
                      <DotsThree size={22} weight="bold" />
                    </button>
                    {menu === item.id && (
                      <>
                        <button
                          className="menu-dismiss"
                          aria-label="关闭文件菜单"
                          onClick={() => setMenu(undefined)}
                        />
                        <div className="dropdown absolute z-[31] top-12 right-[7px] min-w-[170px] bg-surface p-[5px] border border-solid border-line rounded-[7px] shadow-[0_8px_30px_#0002]">
                          <button onClick={() => copy(item.url)}>
                            <Copy size={16} />
                            复制链接
                          </button>
                          <button onClick={() => copy(fileMarkdown(item))}>
                            复制 Markdown
                          </button>
                          {isImageFile(item) && (
                            <button
                              onClick={() => copy(fileMarkdown(item, true))}
                            >
                              复制缩略 Markdown
                            </button>
                          )}
                          <hr />
                          <button
                            onClick={() => {
                              setMenu(undefined);
                              if (actions) {
                                void actions
                                  .openCache(item.id)
                                  .catch((e) => notify(String(e)));
                                return;
                              }
                              // 浏览器预览没有磁盘路径；桌面模式调用真实缓存目录。
                              notify(
                                `打开缓存目录演示：「${item.name}」所在目录，系统文件管理器待接入`,
                              );
                            }}
                          >
                            <FolderOpen size={16} />
                            打开缓存目录
                          </button>
                          <hr />
                          <button
                            className="error-text !text-danger"
                            onClick={() => {
                              setDeleting([item.id]);
                              setMenu(undefined);
                            }}
                          >
                            <Trash size={16} />
                            删除本地记录
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="page-footnote text-muted text-center text-[10px] mt-6 mb-2 leading-[1.8]">
            仅显示当前配置的本地上传历史，删除记录不会删除云端文件。
          </div>
        </div>
        {selected.length > 0 && (
          <div className="batch-bar flex justify-between items-center gap-2.5 shrink-0 mt-[14px] bg-tint border border-solid border-[color-mix(in_srgb,_var(--primary)_20%,_var(--line))] rounded-[7px] p-[10px_13px] text-accent text-[11px] compact:flex-wrap">
            <span>
              <Check size={16} />
              已选择 {selected.length} 个文件
            </span>
            <div className="ui-inline flex items-center gap-2.5">
              <button
                className="text-button"
                onClick={() => {
                  if (actions) {
                    void actions
                      .export(profile?.id ?? "", selected)
                      .catch((e) => notify(String(e)));
                  } else
                    notify(
                      `导出演示：${selected.length} 个缓存文件已选择；实际目录导出待接入`,
                    );
                }}
              >
                <DownloadSimple size={16} />
                导出到目录
              </button>
              <button
                className="text-button error-text !text-danger"
                onClick={() => setDeleting(selected)}
              >
                <Trash size={16} />
                删除本地记录
              </button>
              <button className="text-button" onClick={() => setSelected([])}>
                取消选择
              </button>
            </div>
          </div>
        )}
      </div>
      {preview && (
        <ImagePreview
          key={`${preview.id}:${preview.src}`}
          file={preview}
          onClose={() => setPreview(undefined)}
          onCopy={() => copy(preview.url)}
          allowOpen={!actions}
        />
      )}
      {deleting && (
        <Confirm
          title={deleting.length > 1 ? "删除本地记录" : "删除这个文件的记录？"}
          description={`将删除 ${deleting.length} 项本地历史和缓存，云端文件不会被删除。${actions ? "" : "此处仅修改预览数据。"}`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              if (actions) await actions.remove(profile?.id ?? "", deleting);
              else
                setImages?.(removeFiles(images, profile?.id ?? "", deleting));
              setSelected([]);
              setDeleting(null);
              notify(actions ? "本地记录已删除" : "预览中的本地记录已删除");
            } catch (e) {
              notify(String(e));
            }
          }}
        />
      )}
    </>
  );
}
