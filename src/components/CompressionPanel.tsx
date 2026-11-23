import { useEffect, useState } from "react";
import type { Compression } from "../domain/model";
import { Toggle } from "./UI";

/** 输入草稿与持久化值分离，输入过程中不写盘；失焦后统一校验与保存。 */
export function CompressionPanel({
  value,
  onSave,
  onError,
}: {
  value: Compression;
  onSave: (value: Compression) => Promise<unknown>;
  onError: (e: unknown) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (next: Compression) => {
    const valid = {
      ...next,
      threshold: Math.max(
        0.1,
        Number.isFinite(next.threshold) ? next.threshold : 1,
      ),
      quality: Math.max(1, Math.min(100, Math.round(next.quality) || 70)),
    };
    setDraft(valid);
    void onSave(valid).catch((e) => {
      setDraft(value);
      onError(e);
    });
  };
  return (
    <section className="panel compression flex items-center justify-between p-[16px_19px] gap-[15px] compact:flex-wrap small-window:p-3.5">
      <div className="ui-inline flex items-center gap-2.5">
        <Toggle
          label="启用图片压缩"
          checked={draft.enabled}
          onChange={(enabled) => commit({ ...draft, enabled })}
        />
        <div>
          <strong>图片压缩</strong>
          <small>
            {draft.enabled
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
              disabled={!draft.enabled}
              value={draft.threshold}
              onChange={(e) =>
                setDraft({ ...draft, threshold: Number(e.target.value) })
              }
              onBlur={() => commit(draft)}
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
              disabled={!draft.enabled}
              value={draft.quality}
              onChange={(e) =>
                setDraft({ ...draft, quality: Number(e.target.value) })
              }
              onBlur={() => commit(draft)}
            />
            <span>%</span>
          </span>
        </label>
      </div>
    </section>
  );
}
