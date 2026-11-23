import defaultTheme from "tailwindcss/defaultTheme.js";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // 保留原有控件、dialog 与字体基线；基础排版由 styles/base.css 显式定义。
  corePlugins: { preflight: false },
  theme: {
    // 原界面根字号为 13px；间距采用像素刻度，使 p-5/gap-2 等保持 20px/8px。
    spacing: Object.fromEntries(
      Object.entries(defaultTheme.spacing).map(([key, value]) => [
        key,
        value.endsWith("rem") ? `${parseFloat(value) * 16}px` : value,
      ]),
    ),
    // 精确保留原 UI 的窗口断点，避免默认 rem 断点改变桌面布局。
    screens: {
      wide: { min: "1500px" },
      compact: { max: "1100px" },
      narrow: { max: "900px" },
      "small-window": { max: "700px" },
    },
    extend: {
      // 同一套工具类跟随 app 的 light/dark/system CSS 变量切换。
      colors: {
        brand: "#4576d6",
        "brand-hover": "#3567c7",
        canvas: "var(--bg)",
        surface: "var(--panel)",
        sidebar: "var(--sidebar)",
        ink: "var(--text)",
        muted: "var(--muted)",
        line: "var(--line)",
        accent: "var(--primary)",
        tint: "var(--tint)",
        soft: "var(--soft)",
        danger: "var(--error)",
      },
    },
  },
  plugins: [],
};
