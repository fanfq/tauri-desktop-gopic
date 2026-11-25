import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { revealStartup } from "./startup-splash";
import PreviewApp from "./app/PreviewApp";
import NativeApp from "./app/NativeApp";
import "./styles/index.css";

/** 桌面真实运行与浏览器设计预览隔离，真实模式绝不加载演示凭证或模拟任务。 */
export default function App() {
  const native = isTauri();
  useEffect(() => {
    // 浏览器预览无本地配置 IPC，首次挂载后即可等待绘制并退场。
    if (!native) return revealStartup();
  }, [native]);
  return native ? <NativeApp /> : <PreviewApp />;
}
