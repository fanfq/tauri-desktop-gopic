/** 返回清理函数，供 React effect 在卸载或 StrictMode 重挂载时取消退场。 */
export function revealStartup(): () => void {
  const splash = document.getElementById("startup-splash");
  const root = document.getElementById("root");
  // 遮罩只存在于入口 HTML；配置刷新或托盘恢复不会重新创建它。
  if (!splash || !root) return () => {};

  let cancelled = false;
  let frame = 0;
  let timer = 0;
  const finish = () => {
    if (cancelled) return;
    window.clearTimeout(timer);
    splash.removeEventListener("transitionend", onTransitionEnd);
    splash.remove();
    root.removeAttribute("inert");
    root.setAttribute("aria-busy", "false");
  };
  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target === splash && event.propertyName === "opacity") finish();
  };
  const fade = () => {
    if (cancelled) return;
    const app = root.querySelector(".app");
    if (app) {
      // 配置可能指定不同于系统的主题，退场前与实际首屏背景对齐。
      const theme = window.getComputedStyle(app);
      splash.style.setProperty("--splash-bg", theme.getPropertyValue("--bg"));
      splash.style.setProperty(
        "--splash-ink",
        theme.getPropertyValue("--text"),
      );
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    splash.addEventListener("transitionend", onTransitionEnd);
    splash.classList.add("startup-splash-exit");
    // WebView 在后台可能不派发 transitionend，避免透明遮罩阻断交互。
    timer = window.setTimeout(finish, 350);
  };
  const logo = splash.querySelector("img");
  // 图片损坏或字体加载失败不应锁住应用；资源结束后等待首屏完成布局和绘制。
  void Promise.allSettled([
    document.fonts.ready,
    logo?.decode().catch(() => undefined),
  ]).then(() => {
    if (cancelled) return;
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(fade);
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    splash.removeEventListener("transitionend", onTransitionEnd);
    splash.classList.remove("startup-splash-exit");
  };
}
