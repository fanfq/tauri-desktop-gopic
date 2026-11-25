import test from "node:test";
import assert from "node:assert/strict";
import { revealStartup } from "../src/startup-splash.ts";

/** 模拟浏览器时序，确定性覆盖慢资源与 StrictMode 的取消，不依赖真实计时。 */
function browser(t, reduced = false) {
  let resolveFonts;
  const frames = new Map();
  const timers = new Map();
  let id = 0;
  let removed = false;
  let inert = true;
  let fading = false;
  const listeners = new Map();
  const logo = { decode: () => Promise.resolve() };
  const splash = {
    querySelector: () => logo,
    style: { setProperty() {} },
    classList: {
      add: () => (fading = true),
      remove: () => (fading = false),
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    remove: () => (removed = true),
  };
  const root = {
    removeAttribute: () => (inert = false),
    setAttribute() {},
    querySelector: () => ({}),
  };
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    for (const [key, descriptor] of [
      ["document", originalDocument],
      ["window", originalWindow],
    ]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  globalThis.document = {
    fonts: { ready: new Promise((resolve) => (resolveFonts = resolve)) },
    getElementById: (name) =>
      name === "startup-splash" ? (removed ? null : splash) : root,
  };
  globalThis.window = {
    requestAnimationFrame: (fn) => (frames.set(++id, fn), id),
    cancelAnimationFrame: (key) => frames.delete(key),
    setTimeout: (fn) => (timers.set(++id, fn), id),
    clearTimeout: (key) => timers.delete(key),
    matchMedia: () => ({ matches: reduced }),
    getComputedStyle: () => ({ getPropertyValue: () => "#f8f9fb" }),
  };
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  return {
    logo,
    resolveFonts,
    flush,
    frame() {
      const batch = [...frames.values()];
      frames.clear();
      batch.forEach((fn) => fn());
    },
    finish() {
      listeners.get("transitionend")?.({
        target: splash,
        propertyName: "opacity",
      });
    },
    timeout() {
      [...timers.values()].forEach((fn) => fn());
    },
    get state() {
      return {
        removed,
        inert,
        fading,
        frames: frames.size,
        timers: timers.size,
      };
    },
  };
}

test("startup stays covered until resources and two layout frames are ready", async (t) => {
  const ui = browser(t);
  revealStartup();
  await ui.flush();
  assert.equal(ui.state.frames, 0);
  assert.equal(ui.state.inert, true);
  ui.resolveFonts();
  await ui.flush();
  ui.frame();
  assert.equal(ui.state.fading, false);
  ui.frame();
  assert.equal(ui.state.fading, true);
  assert.equal(ui.state.inert, true);
  ui.finish();
  assert.equal(ui.state.removed, true);
  assert.equal(ui.state.inert, false);
  assert.equal(ui.state.timers, 0);
  // 后续刷新、托盘恢复没有遮罩可重新播放。
  revealStartup();
  await ui.flush();
  assert.equal(ui.state.frames, 0);
});

test("StrictMode cleanup cancels an obsolete reveal while allowing the next mount", async (t) => {
  const ui = browser(t);
  const cancel = revealStartup();
  cancel();
  ui.resolveFonts();
  await ui.flush();
  assert.equal(ui.state.frames, 0);
  revealStartup();
  await ui.flush();
  ui.frame();
  ui.frame();
  ui.timeout();
  assert.equal(ui.state.removed, true);
  assert.equal(ui.state.inert, false);
});

test("reduced motion removes the splash without starting a fade", async (t) => {
  const ui = browser(t, true);
  revealStartup();
  ui.resolveFonts();
  await ui.flush();
  ui.frame();
  ui.frame();
  assert.equal(ui.state.removed, true);
  assert.equal(ui.state.fading, false);
  assert.equal(ui.state.timers, 0);
});

test("cleanup cancels pending layout frames", async (t) => {
  const ui = browser(t);
  const cancel = revealStartup();
  ui.resolveFonts();
  await ui.flush();
  assert.equal(ui.state.frames, 1);
  cancel();
  assert.equal(ui.state.frames, 0);
  assert.equal(ui.state.removed, false);
});

test("a broken brand image does not prevent revealing the application", async (t) => {
  const ui = browser(t);
  ui.logo.decode = () => Promise.reject(new Error("image decode failed"));
  revealStartup();
  ui.resolveFonts();
  await ui.flush();
  ui.frame();
  ui.frame();
  ui.finish();
  assert.equal(ui.state.removed, true);
  assert.equal(ui.state.inert, false);
});
