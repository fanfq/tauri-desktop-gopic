import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { initialProfiles } from "../src/preview/model.ts";

// 用项目自身的 Vite 转换 React 页面，直接验证实际队列输出，不复制渲染逻辑。
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
});
after(() => server.close());
const { NativeUpload } = await server.ssrLoadModule(
  "/src/pages/NativeUpload.tsx",
);
const tasks = [
  {
    taskId: "old",
    name: "old.txt",
    status: "done",
    url: "https://cdn.example.com/old.txt",
  },
  {
    taskId: "new",
    name: "new.txt",
    status: "done",
    url: "https://cdn.example.com/new.txt",
  },
].map((task) => ({
  ...task,
  path: task.name,
  profileId: "r2-main",
  progress: 100,
  bytesPerSecond: null,
  error: null,
}));
const props = {
  settings: { compression: { enabled: false, threshold: 1, quality: 70 } },
  profile: initialProfiles[0],
  dragging: false,
  uploading: false,
  onUpload: async () => {},
  onSave: async () => {},
  onConfigure: () => {},
  onClear: () => {},
  notify: () => {},
  onError: () => {},
};

test("native queue displays newest additions first without changing input order", () => {
  const html = renderToStaticMarkup(
    createElement(NativeUpload, { ...props, tasks }),
  );
  assert.ok(html.indexOf('title="new.txt"') < html.indexOf('title="old.txt"'));
  assert.deepEqual(
    tasks.map((task) => task.taskId),
    ["old", "new"],
  );
  const updated = tasks.map((task) => ({ ...task, progress: 90 }));
  const next = renderToStaticMarkup(
    createElement(NativeUpload, { ...props, tasks: updated }),
  );
  assert.ok(next.indexOf('title="new.txt"') < next.indexOf('title="old.txt"'));
});

test("completed uploads show links, full URL tooltips and existing copy actions", () => {
  const html = renderToStaticMarkup(
    createElement(NativeUpload, { ...props, tasks }),
  );
  assert.match(html, /<a[^>]*href="https:\/\/cdn.example.com\/new.txt"/);
  assert.match(html, /title="https:\/\/cdn.example.com\/new.txt"/);
  assert.match(html, />https:\/\/cdn.example.com\/new.txt<\/a>/);
  assert.match(html, /复制 new.txt 链接/);
});

test("unfinished tasks never expose their result URL", () => {
  const html = renderToStaticMarkup(
    createElement(NativeUpload, {
      ...props,
      tasks: tasks.map((task) => ({ ...task, status: "uploading" })),
    }),
  );
  assert.ok(!html.includes('href="https://cdn.example.com/'));
});

test("preview queue follows the same reverse order and clickable-link behavior", async () => {
  const { Upload } = await server.ssrLoadModule("/src/pages/Upload.tsx");
  const html = renderToStaticMarkup(
    createElement(Upload, {
      profile: initialProfiles[0],
      scene: "normal",
      compression: props.settings.compression,
      setCompression: () => {},
      notify: () => {},
      onConfigure: () => {},
      onUploaded: () => {},
    }),
  );
  assert.ok(html.indexOf("素材备份.zip") < html.indexOf("山间湖泊.jpg"));
  assert.match(
    html,
    /<a[^>]*href="https:\/\/cdn.example.com\/images\/lake.jpg"/,
  );
});

test("native result links use the system opener and report opening failures", async () => {
  const { UploadResultLink } = await server.ssrLoadModule(
    "/src/components/UploadResultLink.tsx",
  );
  const { native } = await server.ssrLoadModule("/src/services/native.ts");
  const originalOpen = native.openUrl;
  const opened = [];
  const errors = [];
  const findLink = (element) => {
    if (!element || typeof element !== "object") return;
    if (element.type === UploadResultLink) return element;
    const children = element.props?.children;
    for (const child of [children].flat(Infinity)) {
      const match = findLink(child);
      if (match) return match;
    }
  };
  try {
    native.openUrl = async (url) => {
      opened.push(url);
    };
    const link = findLink(
      NativeUpload({ ...props, tasks, onError: (e) => errors.push(e) }),
    );
    assert.ok(link);
    const anchor = UploadResultLink(link.props).props.children;
    let prevented = false;
    anchor.props.onClick({
      preventDefault: () => {
        prevented = true;
      },
    });
    await Promise.resolve();
    assert.equal(prevented, true);
    assert.deepEqual(opened, ["https://cdn.example.com/new.txt"]);
    const error = new Error("browser unavailable");
    native.openUrl = async () => {
      throw error;
    };
    anchor.props.onClick({ preventDefault() {} });
    await Promise.resolve();
    assert.deepEqual(errors, [error]);
    const preview = UploadResultLink({ url: tasks[0].url }).props.children;
    preview.props.onClick({
      preventDefault() {
        assert.fail("preview should follow its anchor");
      },
    });
    assert.equal(preview.props.target, "_blank");
  } finally {
    native.openUrl = originalOpen;
  }
});

test("native queue clear action is available only for a nonempty, settled queue", () => {
  const findClear = (element) => {
    if (!element || typeof element !== "object") return;
    if (
      element.type === "button" &&
      element.props["aria-label"] === "清空上传队列"
    )
      return element;
    for (const child of [element.props?.children].flat(Infinity)) {
      const match = findClear(child);
      if (match) return match;
    }
  };
  let cleared = 0;
  const render = (overrides = {}) =>
    findClear(
      NativeUpload({
        ...props,
        tasks,
        onClear: () => {
          cleared++;
        },
        ...overrides,
      }),
    );
  const button = render();
  assert.ok(button, "等待数量右侧应显示清空按钮");
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  assert.equal(cleared, 1);
  for (const overrides of [
    { tasks: [] },
    { uploading: true },
    { tasks: tasks.map((task) => ({ ...task, status: "queued" })) },
    { tasks: tasks.map((task) => ({ ...task, status: "uploading" })) },
  ]) {
    assert.equal(render(overrides).props.disabled, true);
    render(overrides).props.onClick();
    assert.equal(cleared, 1, "禁用时不得调用清空操作");
  }
  const html = renderToStaticMarkup(
    createElement(NativeUpload, { ...props, tasks, onClear: () => {} }),
  );
  assert.ok(html.indexOf("等待") < html.indexOf('aria-label="清空上传队列"'));
});
