import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// 在分配 macOS/Windows runner 前校验版本，避免错误标签触发耗时打包。
export function buildMetadata(config, { eventName, refType, refName }) {
  const { version } = config;
  // 版本同时用于输出文件及安装包路径，禁止换行和路径分隔符。
  if (
    typeof version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
  ) {
    throw new Error("src-tauri/tauri.conf.json 的 version 无效");
  }
  const release = eventName === "push" && refType === "tag";
  if (release && refName !== `v${version}`) {
    throw new Error(`标签 ${refName} 与 Tauri 版本不一致，应为 v${version}`);
  }
  return { version, release };
}

// 导入时只提供纯函数；直接执行时才读取工作区与 GitHub Actions 环境。
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const metadata = buildMetadata(config, {
    eventName: process.env.GITHUB_EVENT_NAME,
    refType: process.env.GITHUB_REF_TYPE,
    refName: process.env.GITHUB_REF_NAME,
  });
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${metadata.version}\nrelease=${metadata.release}\n`,
    );
  }
  console.log(JSON.stringify(metadata));
}
