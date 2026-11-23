import { useEffect, useRef, type ReactNode } from "react";
import { X, Info, ImageBroken } from "@phosphor-icons/react";
import { useState } from "react";

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
/** 原生 dialog 提供焦点约束和 Escape；关闭后浏览器将焦点交还触发控件。 */
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${wide ? "modal wide" : "modal"} ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  description,
  onClose,
  onConfirm,
  label = "确认删除",
}: {
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="modal-body p-[22px] leading-[1.9]">
        <p>{description}</p>
      </div>
      <footer>
        <button className="button" disabled={pending} onClick={onClose}>
          取消
        </button>
        <button
          className="button danger"
          disabled={pending}
          onClick={() => void confirm()}
        >
          {pending ? "处理中…" : label}
        </button>
      </footer>
    </Modal>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div className={`notice ${error ? "error" : ""}`}>
      <Info size={18} />
      <span>{children}</span>
    </div>
  );
}
export function Photo({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const broken = !src || failedSrc === src; // 更换图片源时自动恢复，异常场景可切回正常。
  return broken ? (
    <div
      className={`broken-photo w-full h-full bg-soft text-muted flex flex-col items-center justify-center gap-2.5 text-[11px] ${className}`}
    >
      <ImageBroken size={30} />
      <span>{src ? "图片加载失败" : "本地缓存不可用"}</span>
    </div>
  ) : (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={() => setFailedSrc(src)}
    />
  );
}
export type Notify = (message: string) => void;
