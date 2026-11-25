import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { initialFiles, initialProfiles } from "../src/preview/model.ts";

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
});
after(() => server.close());
const { Gallery } = await server.ssrLoadModule("/src/pages/Gallery.tsx");

test("gallery keeps its toolbar outside the independently scrollable file list", () => {
  const html = renderToStaticMarkup(
    createElement(Gallery, {
      images: initialFiles,
      profile: initialProfiles[0],
      scene: "normal",
      notify: () => {},
    }),
  );
  assert.match(html, /class="gallery-layout[^\"]*min-h-0/);
  assert.match(html, /class="gallery-scroll[^\"]*overflow-y-auto/);
  assert.ok(html.indexOf("所有文件") < html.indexOf('class="gallery-scroll'));
  assert.ok(
    html.indexOf('class="gallery-scroll') < html.indexOf('class="gallery-grid'),
  );
  assert.ok(
    !html.includes('class="batch-bar'),
    "no bottom action bar without a selection",
  );
});

test("empty gallery retains the same scroll frame and top controls", () => {
  const html = renderToStaticMarkup(
    createElement(Gallery, {
      images: [],
      profile: initialProfiles[0],
      scene: "empty",
      notify: () => {},
    }),
  );
  assert.ok(html.includes("所有文件"));
  assert.match(html, /class="gallery-scroll[^\"]*overflow-y-auto/);
  assert.ok(html.includes("这里还没有文件"));
});
