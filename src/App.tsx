import { isTauri } from "@tauri-apps/api/core";
import PreviewApp from "./app/PreviewApp";
import NativeApp from "./app/NativeApp";
import "./styles/index.css";

/** 桌面真实运行与浏览器设计预览隔离，真实模式绝不加载演示凭证或模拟任务。 */
export default function App() {
  return isTauri() ? <NativeApp /> : <PreviewApp />;
}
