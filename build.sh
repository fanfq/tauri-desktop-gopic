#!/usr/bin/env bash
# Tauri 桌面打包：macOS 支持双架构和 Windows x64 交叉编译；Windows 使用 Git Bash。
set -euo pipefail

usage() {
  cat <<'EOF'
用法：bash build.sh [auto|macos|macos-arm|macos-intel|windows|windows64|all] [--debug]

  auto       打包当前操作系统（默认）
  macos      打包当前 Mac 架构，生成 .app 和 .dmg
  macos-arm  打包 Apple Silicon（aarch64）
  macos-intel 打包 Apple Intel（x86_64）
  windows    Windows 上打包当前架构；macOS 上交叉打包 Windows x64
  windows64  打包 Windows x64 NSIS 安装包（*-setup.exe）
  all        在 macOS 上依次打包 Apple ARM、Intel、Windows x64
  --debug    使用 Debug 构建；默认使用 Release

产物归档到 release/<版本>/<系统>-<架构>/（如 darwin-aarch64）。
同版本重复打包时，上一份产物保留在旁边的 .previous.* 目录。
需要 Node.js/npm、Rust；macOS 需要 Xcode 命令行工具，Windows 需要
Visual Studio C++ 构建工具、Windows SDK 和 MSVC Rust 工具链。
macOS 交叉打包 Windows 另需 cargo-xwin、LLVM、LLD 和 NSIS。
脚本会通过 rustup 安装缺少的 Rust target；首次交叉编译会下载 Windows SDK。
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
    auto|macos|macos-arm|macos-intel|windows|windows64|all)
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

for tool in node npm cargo rustc rustup; do
  command -v "$tool" >/dev/null 2>&1 || fail "未找到 ${tool}，请先安装并加入 PATH。"
done

# 模式只决定目标列表；按顺序构建，避免多个 Tauri 进程同时重建 dist/。
host_target="$(rustc -vV | sed -n 's/^host: //p' | tr -d '\r')"
case "$host_platform:$host_target" in
  macos:*-apple-darwin|windows:*-pc-windows-msvc) ;;
  *) fail "Rust host 与当前系统不匹配：$host_target（Windows 需要 MSVC）。" ;;
esac
case "$platform" in
  macos) targets=("$host_target") ;;
  macos-arm) targets=(aarch64-apple-darwin) ;;
  macos-intel) targets=(x86_64-apple-darwin) ;;
  windows)
    if [[ "$host_platform" == windows ]]; then
      targets=("$host_target")
    else
      targets=(x86_64-pc-windows-msvc)
    fi
    ;;
  windows64) targets=(x86_64-pc-windows-msvc) ;;
  all)
    [[ "$host_platform" == macos ]] || fail "all 模式需要在 macOS 上运行，以生成两个 Apple 架构的应用包。"
    targets=(aarch64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-msvc)
    ;;
esac

# 在安装 npm 依赖及开始任何构建之前检查整批目标所需的工具。
for target in "${targets[@]}"; do
  case "$target" in
    aarch64-apple-darwin|x86_64-apple-darwin)
      [[ "$host_platform" == macos ]] || fail "Apple 目标需要在 macOS 上打包。"
      command -v ditto >/dev/null 2>&1 || fail "未找到 macOS ditto。"
      ;;
    *-pc-windows-msvc)
      if [[ "$host_platform" == windows ]]; then
        command -v cygpath >/dev/null 2>&1 || fail "未找到 cygpath，请使用 Git Bash。"
      else
        # Homebrew 的 LLVM 默认不加入 PATH；仅在缺少工具时补入其安装目录。
        if ! command -v clang-cl >/dev/null 2>&1 || ! command -v llvm-rc >/dev/null 2>&1; then
          if command -v brew >/dev/null 2>&1; then
            llvm_prefix="$(brew --prefix llvm)"
            export PATH="$llvm_prefix/bin:$PATH"
          fi
        fi
        for tool in cargo-xwin clang-cl llvm-rc llvm-lib lld-link makensis; do
          command -v "$tool" >/dev/null 2>&1 || fail "Windows 交叉编译缺少 ${tool}。请安装 cargo-xwin 及 Homebrew llvm、lld、nsis，参见 README。"
        done
      fi
      ;;
    *) fail "不支持的目标：$target" ;;
  esac
done

product_name="$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/tauri.conf.json", "utf8")).productName')"
version="$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/tauri.conf.json", "utf8")).version')"
[[ -n "$product_name" && "$product_name" != undefined && "$product_name" != */* && "$product_name" != *\\* ]] || fail "无效的 productName。"
[[ "$version" =~ ^[0-9][0-9A-Za-z.+-]*$ ]] || fail "Tauri 配置中的 version 无效。"

# 目标标准库按需安装；任一失败即停止，避免用不完整的工具链继续打包。
installed_targets="$(rustup target list --installed)"
for target in "${targets[@]}"; do
  if ! printf '%s\n' "$installed_targets" | tr -d '\r' | grep -Fxq "$target"; then
    rustup target add "$target"
  fi
done

# 一批任务只安装一次前端依赖；Tauri 的 beforeBuildCommand 负责前端构建。
npm ci --no-audit --no-fund
cargo_target_dir="$project_dir/src-tauri/target"
if [[ "$host_platform" == windows ]]; then
  cargo_target_dir="$(cygpath -m "$cargo_target_dir")"
fi

# 子 shell 将归档清理 trap 限定到单个目标；失败不会删除其他已完成的包。
build_target() (
  target="$1"
  architecture="${target%%-*}"
  case "$target" in
    *-apple-darwin) archive_platform=darwin; bundles=app,dmg ;;
    *-pc-windows-msvc)
      archive_platform=windows
      bundles=nsis
      ;;
  esac
  archive_name="${archive_platform}-${architecture}"
  [[ "$profile" != debug ]] || archive_name="${archive_name}-debug"

  printf '正在打包 %s %s（%s，%s）\n' "$product_name" "$version" "$target" "$profile"
  build_args=(build --ci --target "$target" --bundles "$bundles")
  if [[ "$archive_platform" == windows && "$host_platform" == macos ]]; then
    build_args+=(--runner cargo-xwin)
  fi
  [[ "$profile" != debug ]] || build_args+=(--debug)
  # SDK 缓存放入 target/，可沿用调用者指定的共享 XWIN_CACHE_DIR。
  CARGO_TARGET_DIR="$cargo_target_dir" \
    XWIN_CACHE_DIR="${XWIN_CACHE_DIR:-$project_dir/src-tauri/target/xwin}" \
    npm run tauri -- "${build_args[@]}" -- --locked

  bundle_dir="$project_dir/src-tauri/target/$target/$profile/bundle"
  shopt -s nullglob
  if [[ "$archive_platform" == darwin ]]; then
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

  # 先完整复制再替换归档；复制失败只清理临时文件，保留上一份包。
  archive_parent="$project_dir/release/$version"
  mkdir -p -- "$archive_parent"
  output_dir="$archive_parent/$archive_name"
  staging_dir="$(mktemp -d "$archive_parent/.${archive_name}.XXXXXX")"
  cleanup() {
    local status=$?
    if [[ $status -ne 0 ]]; then
      rm -rf -- "$staging_dir"
    fi
  }
  trap cleanup EXIT
  if [[ "$archive_platform" == darwin ]]; then
    # 保留 .app 内部框架的符号链接、权限及 macOS 元数据。
    ditto "$app_path" "$staging_dir/$product_name.app"
  fi
  for installer in "${installers[@]}"; do
    cp -p -- "$installer" "$staging_dir/"
  done
  if [[ -e "$output_dir" ]]; then
    previous_dir="$(mktemp -d "$archive_parent/${archive_name}.previous.XXXXXX")"
    mv -- "$output_dir" "$previous_dir/artifacts"
  fi
  mv -- "$staging_dir" "$output_dir"
  printf '\n打包完成，产物目录：%s\n' "$output_dir"
  printf '  %s\n' "$output_dir"/*
)

for target in "${targets[@]}"; do
  build_target "$target"
done
printf '\n全部 %s 个目标打包完成。\n' "${#targets[@]}"
