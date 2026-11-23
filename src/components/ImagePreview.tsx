import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowSquareOut,
  Copy,
  ImageBroken,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import type { FileRecord } from "../domain/model";
import { Modal } from "./UI";
import {
  constrainView,
  fitScale,
  zoomView,
  type ImageView,
  type Size,
} from "./image-preview-layout";

/** 原图尺寸与视口独立计量，避免 transform 放大后负方向内容无法滚动访问。 */
export function ImagePreview({
  file,
  onClose,
  onCopy,
  allowOpen = false,
}: {
  file: FileRecord;
  onClose: () => void;
  onCopy: () => void;
  allowOpen?: boolean;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<
    { id: number; x: number; y: number; view: ImageView } | undefined
  >(undefined);
  const [image, setImage] = useState<Size>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<ImageView>({ scale: 1, x: 0, y: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fit = fitScale(image, viewport);
  const ready = status === "ready" && !!file.src;
  const pannable =
    ready &&
    (image.width * view.scale > viewport.width ||
      image.height * view.scale > viewport.height);
  const reset = () => setView({ scale: fit, x: 0, y: 0 });
  const zoom = (scale: number) =>
    setView((current) =>
      zoomView(current, scale, { x: 0, y: 0 }, image, viewport),
    );

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 初次加载及窗口大小变化都重新完整展示，防止旧平移量把图片留在画布之外。
  useEffect(() => {
    setView({ scale: fit, x: 0, y: 0 });
    drag.current = undefined;
    setDragging(false);
  }, [fit, viewport.width, viewport.height, image.width, image.height]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !ready) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      // 滚轮与触控板均以指针为中心；显式非 passive 才能阻止弹窗跟随滚动。
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const factor = Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.01);
      setView((current) =>
        zoomView(
          current,
          current.scale * factor,
          {
            x: event.clientX - rect.left - rect.width / 2,
            y: event.clientY - rect.top - rect.height / 2,
          },
          image,
          viewport,
        ),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [ready, image, viewport]);

  return (
    <Modal title={file.name} wide className="image-preview" onClose={onClose}>
      <div className="image-preview-stage">
        <div
          ref={canvas}
          className={`image-preview-viewport ${pannable ? "pannable" : ""} ${dragging ? "dragging" : ""}`}
          aria-label="图片预览，滚轮缩放，放大后拖拽，双击适应窗口"
          onDoubleClick={() => {
            if (ready) reset();
          }}
          onPointerDown={(event) => {
            if (!pannable || event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              view,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId) return;
            setView(
              constrainView(
                {
                  ...start.view,
                  x: start.view.x + event.clientX - start.x,
                  y: start.view.y + event.clientY - start.y,
                },
                image,
                viewport,
              ),
            );
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = undefined;
            setDragging(false);
          }}
          onLostPointerCapture={() => {
            drag.current = undefined;
            setDragging(false);
          }}
        >
          {file.src && status !== "error" && (
            <img
              key={attempt}
              src={file.src}
              alt={file.name}
              draggable={false}
              className="image-preview-image"
              style={{
                width: image.width || undefined,
                height: image.height || undefined,
                visibility: ready ? "visible" : "hidden",
                transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }}
              onLoad={(event) => {
                setImage({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
                setStatus("ready");
              }}
              onError={() => setStatus("error")}
            />
          )}
          {file.src && status === "loading" && (
            <div className="image-preview-state" role="status">
              图片加载中…
            </div>
          )}
          {(!file.src || status === "error") && (
            <div className="image-preview-state" role="status">
              <ImageBroken size={32} />
              <span>{file.src ? "图片加载失败" : "本地缓存不可用"}</span>
              {file.src && (
                <button
                  className="button"
                  onClick={() => {
                    // 只重新加载当前缓存地址，不回退到公网，避免改变原有缓存语义。
                    setStatus("loading");
                    setAttempt((value) => value + 1);
                  }}
                >
                  <ArrowClockwise size={16} />
                  重新加载
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <footer className="preview-footer">
        <span className="image-preview-meta">
          {ready ? `${image.width} × ${image.height} · ` : ""}
          {file.size} · {file.date}
        </span>
        <div className="image-preview-tools">
          <button
            className="icon-button"
            aria-label="缩小图片"
            disabled={!ready || view.scale <= Math.min(0.1, fit)}
            onClick={() => zoom(view.scale / 1.25)}
          >
            <MagnifyingGlassMinus size={19} />
          </button>
          <span className="image-preview-scale" aria-live="polite">
            {ready ? `${Number((view.scale * 100).toFixed(1))}%` : "—"}
          </span>
          <button
            className="icon-button"
            aria-label="放大图片"
            disabled={!ready || view.scale >= 5}
            onClick={() => zoom(view.scale * 1.25)}
          >
            <MagnifyingGlassPlus size={19} />
          </button>
          <button
            className="text-button"
            disabled={!ready}
            title="按原图像素显示"
            onClick={() => zoom(1)}
          >
            100%
          </button>
          <button
            className="text-button"
            disabled={!ready}
            title="适应窗口（双击图片复位）"
            onClick={reset}
          >
            适应窗口
          </button>
          <button className="button" onClick={onCopy}>
            <Copy size={16} />
            复制链接
          </button>
          {allowOpen && file.src && (
            <a
              className="icon-button"
              aria-label="打开原图"
              href={file.src}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowSquareOut size={18} />
            </a>
          )}
        </div>
      </footer>
    </Modal>
  );
}
