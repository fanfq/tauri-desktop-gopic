import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

// 这里依赖 POSIX /bin/bash 模拟各宿主；Windows 宿主跳过，原生打包另行验收。
const shellTest = (name, fn) =>
  test(name, { skip: process.platform === "win32" }, fn);

// 用隔离工具链验证命令编排和归档，不下载 SDK，也不启动真实构建。
function fixture(
  t,
  { host = "Darwin", rustHost = "aarch64-apple-darwin" } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "gopic-build-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src-tauri"));
  mkdirSync(join(root, "bin"));
  copyFileSync(new URL("../build.sh", import.meta.url), join(root, "build.sh"));
  writeFileSync(
    join(root, "src-tauri/tauri.conf.json"),
    JSON.stringify({ productName: "GoPic", version: "0.1.0" }),
  );
  writeFileSync(join(root, "package-lock.json"), "{}");
  const tool = (name, body) =>
    writeFileSync(join(root, "bin", name), `#!/bin/bash\nset -eu\n${body}\n`, {
      mode: 0o755,
    });
  tool("uname", `echo '${host}'`);
  tool("rustc", `echo 'host: ${rustHost}'`);
  tool("cargo", "exit 0");
  tool("cargo-xwin", "exit 0");
  tool(
    "rustup",
    'printf "%s\\n" aarch64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-msvc',
  );
  tool("cygpath", 'echo "$2"');
  tool("ditto", '[ "${FAIL_COPY:-0}" != 1 ]\ncp -R "$1" "$2"');
  for (const name of [
    "clang-cl",
    "lld-link",
    "llvm-rc",
    "llvm-lib",
    "makensis",
  ])
    tool(name, "exit 0");
  tool(
    "npm",
    `
echo "$*" >> "$PWD/calls"
[ "$1" != ci ] || exit 0
target=''; profile=release
while [ "$#" -gt 0 ]; do
  case "$1" in
    --target) target="$2"; shift ;;
    --debug) profile=debug ;;
  esac
  shift
done
[ "$target" != "\${FAIL_TARGET:-}" ] || exit 7
bundle="$PWD/src-tauri/target/$target/$profile/bundle"
case "$target" in
  *-apple-darwin)
    mkdir -p "$bundle/macos/GoPic.app" "$bundle/dmg"
    echo app > "$bundle/macos/GoPic.app/binary"
    echo dmg > "$bundle/dmg/GoPic_0.1.0_\${target%%-*}.dmg" ;;
  *-pc-windows-msvc)
    mkdir -p "$bundle/nsis"
    echo exe > "$bundle/nsis/GoPic_0.1.0_x64-setup.exe" ;;
  *) exit 8 ;;
esac`,
  );
  return {
    root,
    run(args, extra = {}) {
      return spawnSync("/bin/bash", [join(root, "build.sh"), ...args], {
        cwd: tmpdir(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(root, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`,
          ...extra,
        },
      });
    },
    calls: () => readFileSync(join(root, "calls"), "utf8").trim().split("\n"),
    archive: (name) => join(root, "release/0.1.0", name),
  };
}

shellTest(
  "all builds ARM, Intel and Windows x64 sequentially with one dependency install",
  (t) => {
    const f = fixture(t);
    const result = f.run(["all"]);
    assert.equal(result.status, 0, result.stderr);
    const calls = f.calls();
    assert.equal(calls.filter((call) => call.startsWith("ci ")).length, 1);
    assert.equal(calls.length, 4);
    assert.match(calls[1], /--target aarch64-apple-darwin/);
    assert.match(calls[2], /--target x86_64-apple-darwin/);
    assert.match(calls[3], /--target x86_64-pc-windows-msvc/);
    assert.match(calls[3], /--runner cargo-xwin/);
    assert.match(calls[3], /--bundles nsis/);
    assert.ok(existsSync(f.archive("darwin-aarch64/GoPic.app/binary")));
    assert.ok(existsSync(f.archive("darwin-x86_64/GoPic.app/binary")));
    assert.ok(
      existsSync(f.archive("windows-x86_64/GoPic_0.1.0_x64-setup.exe")),
    );
  },
);

shellTest(
  "Intel debug archive preserves the previous package and failed copies",
  (t) => {
    const f = fixture(t);
    const args = ["macos-intel", "--debug"];
    assert.equal(f.run(args).status, 0);
    const output = f.archive("darwin-x86_64-debug");
    writeFileSync(join(output, "marker"), "old");
    assert.notEqual(f.run(args, { FAIL_COPY: "1" }).status, 0);
    assert.equal(readFileSync(join(output, "marker"), "utf8"), "old");
    assert.equal(f.run(args).status, 0);
    assert.ok(!existsSync(join(output, "marker")));
    const backups = readdirSync(dirname(output)).filter((name) =>
      name.startsWith("darwin-x86_64-debug.previous."),
    );
    assert.equal(backups.length, 1);
    assert.equal(
      readFileSync(f.archive(`${backups[0]}/artifacts/marker`), "utf8"),
      "old",
    );
  },
);

shellTest("all stops on a failed target and keeps completed packages", (t) => {
  const f = fixture(t);
  assert.notEqual(
    f.run(["all"], { FAIL_TARGET: "x86_64-apple-darwin" }).status,
    0,
  );
  assert.ok(existsSync(f.archive("darwin-aarch64/GoPic.app")));
  assert.equal(f.calls().length, 3);
  assert.ok(!existsSync(f.archive("windows-x86_64")));
});

shellTest("Windows native x64 uses Cargo without the cross runner", (t) => {
  const f = fixture(t, {
    host: "MINGW64_NT",
    rustHost: "x86_64-pc-windows-msvc",
  });
  const result = f.run(["windows64"]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(f.calls()[1], /--runner/);
  assert.match(f.calls()[1], /--target x86_64-pc-windows-msvc/);
});

shellTest("all rejects a Windows host before installing dependencies", (t) => {
  const f = fixture(t, {
    host: "MINGW64_NT",
    rustHost: "x86_64-pc-windows-msvc",
  });
  const result = f.run(["all"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /all.*macOS/);
  assert.ok(!existsSync(join(f.root, "calls")));
});

shellTest("auto retains the native Mac architecture", (t) => {
  const f = fixture(t, { rustHost: "x86_64-apple-darwin" });
  const result = f.run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls()[1], /--target x86_64-apple-darwin/);
  assert.ok(existsSync(f.archive("darwin-x86_64/GoPic.app")));
});

shellTest("Apple ARM mode is independent of the Mac host architecture", (t) => {
  const f = fixture(t, { rustHost: "x86_64-apple-darwin" });
  const result = f.run(["macos-arm"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls()[1], /--target aarch64-apple-darwin/);
});

shellTest(
  "missing cross compiler stops all before any dependency installation",
  (t) => {
    const f = fixture(t);
    rmSync(join(f.root, "bin/cargo-xwin"));
    const result = f.run(["all"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cargo-xwin/);
    assert.ok(!existsSync(join(f.root, "calls")));
  },
);
