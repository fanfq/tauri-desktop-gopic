import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { initialProfiles } from "../src/preview/model.ts";

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
});
after(() => server.close());
const compression = { enabled: true, threshold: 2.5, quality: 82 };
const snapshot = {
  settings: { compression, naming: "保持原文件名", theme: "light" },
  cache: { totalBytes: 0, fileCount: 0, directoryPath: "/tmp/gopic-test" },
  launchAtLogin: false,
};

test("both settings pages place saved compression controls between naming and cache", async () => {
  const { NativeSettings } = await server.ssrLoadModule(
    "/src/pages/NativeSettings.tsx",
  );
  const { Settings } = await server.ssrLoadModule("/src/pages/Settings.tsx");
  for (const [Component, props] of [
    [
      NativeSettings,
      {
        snapshot,
        onSave: async () => {},
        onMutation: async () => {},
        notify: () => {},
        onError: () => {},
      },
    ],
    [
      Settings,
      {
        compression,
        setCompression: () => {},
        naming: snapshot.settings.naming,
        setNaming: () => {},
        theme: "light",
        setTheme: () => {},
        scene: "normal",
        notify: () => {},
        clearHistory: () => {},
      },
    ],
  ]) {
    const html = renderToStaticMarkup(createElement(Component, props));
    assert.ok(html.includes('aria-label="启用图片压缩"'), Component.name);
    assert.match(html, /aria-label="压缩阈值 MB"[^>]*value="2.5"/);
    assert.match(html, /aria-label="JPEG 质量"[^>]*value="82"/);
    assert.ok(
      html.indexOf("上传文件命名") < html.indexOf('aria-label="启用图片压缩"'),
    );
    assert.ok(
      html.indexOf('aria-label="启用图片压缩"') < html.indexOf("图床缓存"),
    );
  }
});

test("upload pages retain the queue while no longer rendering compression settings", async () => {
  const { NativeUpload } = await server.ssrLoadModule(
    "/src/pages/NativeUpload.tsx",
  );
  const { Upload } = await server.ssrLoadModule("/src/pages/Upload.tsx");
  const common = {
    profile: initialProfiles[0],
    notify: () => {},
    onConfigure: () => {},
  };
  for (const [Component, props] of [
    [
      NativeUpload,
      {
        ...common,
        settings: snapshot.settings,
        tasks: [],
        dragging: false,
        uploading: false,
        onUpload: async () => {},
        onSave: async () => {},
        onClear: () => {},
        onError: () => {},
      },
    ],
    [
      Upload,
      {
        ...common,
        scene: "empty",
        compression,
        setCompression: () => {},
        onUploaded: () => {},
      },
    ],
  ]) {
    const html = renderToStaticMarkup(createElement(Component, props));
    assert.ok(!html.includes('aria-label="启用图片压缩"'), Component.name);
    assert.ok(html.includes("上传队列"));
    assert.ok(html.includes("清空"));
  }
});
