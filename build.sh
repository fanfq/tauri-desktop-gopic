#!/usr/bin/env bash
# Tauri 桌面打包：macOS 使用系统 Bash，Windows 使用 Git Bash。
set -euo pipefail

usage() {
  cat <<'EOF'
用法：bash build.sh [auto|macos|windows] [--debug]

  auto       打包当前操作系统（默认）
  macos      在 macOS 上生成 .app 和 .dmg
  windows    在 Windows Git Bash 中生成 NSIS 安装包（*-setup.exe）
  --debug    使用 Debug 构建；默认使用 Release

产物归档到 release/<平台>/ 下的独立目录，不覆盖历史包。
需要 Node.js/npm、Rust；macOS 需要 Xcode 命令行工具，Windows 需要
Visual Studio C++ 构建工具、Windows SDK 和 MSVC Rust 工具链。
EOF
}

fail() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

platform=auto
profile=release
platform_set=false
for argument in "$@"; do
  case "$argument" in
    -h|--help) usage; exit 0 ;;
    --debug) profile=debug ;;
    auto|macos|windows)
      [[ "$platform_set" == false ]] || fail "只能指定一个平台。"
      platform="$argument"
      platform_set=true
      ;;
    *) usage >&2; fail "不支持的参数：$argument" ;;
  esac
done

# 从任何工作目录调用时，始终构建脚本所属的 Tauri 工程。
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$project_dir"
[[ -f src-tauri/tauri.conf.json && -f package-lock.json ]] || fail "缺少 Tauri 配置或 package-lock.json。"

case "$(uname -s)" in
  Darwin) host_platform=macos ;;
  MINGW*|MSYS*) host_platform=windows ;;
  *) fail "请在 macOS 或 Windows Git Bash 中运行，不支持 Linux/WSL。" ;;
esac
[[ "$platform" != auto ]] || platform="$host_platform"
[[ "$platform" == "$host_platform" ]] || fail "请在 $platform 系统上打包 $platform 应用，当前系统是 $host_platform。"

for tool in node npm cargo rustc; do
  command -v "$tool" >/dev/null 2>&1 || fail "未找到 $tool，请先安装并加入 PATH。"
done

# 显式使用当前 Rust 工具链的目标，避免环境中的其他 target 配置导致产物定位错误。
target="$(rustc -vV | sed -n 's/^host: //p' | tr -d '\r')"
case "$platform:$target" in
  macos:*-apple-darwin)
    bundles=app,dmg
    command -v ditto >/dev/null 2>&1 || fail "未找到 macOS ditto。"
    ;;
  windows:*-pc-windows-msvc)
    bundles=nsis
    command -v cygpath >/dev/null 2>&1 || fail "未找到 cygpath，请使用 Git Bash。"
    ;;
  *) fail "当前 Rust 工具链不适用于 $platform：$target（Windows 必须使用 MSVC 工具链）。" ;;
esac

product_name="$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/tauri.conf.json", "utf8")).productName')"
version="$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/tauri.conf.json", "utf8")).version')"
[[ -n "$product_name" && "$product_name" != undefined && "$product_name" != */* && "$product_name" != *\\* ]] || fail "无效的 productName。"
[[ "$version" =~ ^[0-9][0-9A-Za-z.+-]*$ ]] || fail "Tauri 配置中的 version 无效。"

printf '正在打包 %s %s（%s，%s，%s）\n' "$product_name" "$version" "$platform" "$target" "$profile"
# 按锁文件安装依赖；Tauri 的 beforeBuildCommand 会自动构建前端，无需重复执行。
npm ci --no-audit --no-fund
build_args=(build --ci --target "$target" --bundles "$bundles")
[[ "$profile" != debug ]] || build_args+=(--debug)
# 固定 Cargo 输出根目录；使用 --locked 防止打包时改写 Rust 依赖锁文件。
cargo_target_dir="$project_dir/src-tauri/target"
if [[ "$platform" == windows ]]; then
  # Cargo 是 Windows 原生程序，显式转换 Git Bash 路径，支持空格和非系统盘。
  cargo_target_dir="$(cygpath -m "$cargo_target_dir")"
fi
CARGO_TARGET_DIR="$cargo_target_dir" \
  npm run tauri -- "${build_args[@]}" -- --locked

bundle_dir="$project_dir/src-tauri/target/$target/$profile/bundle"
shopt -s nullglob
if [[ "$platform" == macos ]]; then
  app_path="$bundle_dir/macos/$product_name.app"
  [[ -d "$app_path" ]] || fail "未找到应用包：$app_path"
  installers=("$bundle_dir/dmg/${product_name}_${version}_"*.dmg)
else
  installers=("$bundle_dir/nsis/${product_name}_${version}_"*-setup.exe)
fi
[[ ${#installers[@]} -gt 0 ]] || fail "构建完成但没有找到安装包：$bundle_dir"
for installer in "${installers[@]}"; do
  [[ -s "$installer" ]] || fail "安装包为空：$installer"
done

# Vite 会清空 dist/，因此发行产物使用单独的 release/ 目录。
# 每次创建独立目录；复制失败只移除本次不完整归档，保留历史包。
mkdir -p -- "$project_dir/release/$platform"
output_dir="$(mktemp -d "$project_dir/release/$platform/GoPic-${version}-${target}-${profile}.XXXXXX")"
cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    rm -rf -- "$output_dir"
  fi
}
trap cleanup EXIT
if [[ "$platform" == macos ]]; then
  # 保留 .app 内部框架的符号链接、权限及 macOS 元数据。
  ditto "$app_path" "$output_dir/$product_name.app"
fi
for installer in "${installers[@]}"; do
  cp -p -- "$installer" "$output_dir/"
done
printf '\n打包完成，产物目录：%s\n' "$output_dir"
printf '  %s\n' "$output_dir"/*
