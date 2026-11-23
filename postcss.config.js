export default {
  plugins: {
    // 先合并所有 @layer，再由 Tailwind 按 base/components/utilities 排序。
    "postcss-import": {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
