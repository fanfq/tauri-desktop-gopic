# GoPic Desktop

基于 Tauri 2、React 和 Rust 的桌面文件上传工具，界面沿用 Flutter GoPic 的布局。浏览器运行使用独立演示数据，Tauri 桌面运行接入真实上传与本地存储。

```bash
npm install
npm run tauri dev
# 仅查看浏览器页面预览
npm run dev
# 构建 macOS 调试应用
npm run tauri -- build --debug --bundles app
```

默认窗口 1180×800，最小 700×600。

- 上传：任意文件、多文件选择与拖拽，每文件独立任务、全局最多 4 文件并发；大于 10MiB 自动分片，每文件最多 4 分片滑动并发，流式读取与实时进度；图片队列显示本地缩略图，其他文件按格式显示图标。仅支持的图片参与压缩，压缩无收益或失败时保留原文件。
- 图床：本地缓存图片预览，其他文件显示类型图标；按配置与格式筛选、批量删除记录、导出缓存、定位缓存文件。
- 云服务：Cloudflare R2、Amazon S3、七牛云 Kodo、腾讯云 COS、阿里云 OSS、缤纷云 S4；多套配置、启用切换与配置导入导出。
- 配置：主题、命名规则、图片压缩、缓存统计和清理、系统自启动。
- macOS 托盘：18px 彩色品牌图标，上传/成功/失败反馈；左右键打开菜单，可复制最近上传链接、打开主窗口或退出。拖入文件显示 280×132 原生圆角浮层，上传后自动复制链接。关闭主窗口保留后台托盘，托盘菜单退出才结束进程。

## 桌面打包

在工程根目录运行：

```bash
./build.sh          # 自动识别当前系统，默认 Release
./build.sh macos    # 当前 Mac 架构的 GoPic.app 和 DMG
./build.sh macos-arm    # Apple Silicon / ARM64
./build.sh macos-intel  # Apple Intel / x86_64
./build.sh windows64    # Windows x64 NSIS 安装包（也可在 macOS 上交叉编译）
./build.sh all          # macOS 上依次生成 Apple ARM、Intel、Windows x64 三份包
bash build.sh windows  # Windows Git Bash 下保留当前架构打包；macOS 下等同 windows64
./build.sh macos --debug  # 需要调试包时使用
```

脚本自动执行 `npm ci`、前端构建、Rust 编译及 Tauri 打包，按 Tauri 配置中的版本号归档。
产物保存在 `release/<版本>/<系统>-<架构>/`，例如 `release/0.1.0/darwin-aarch64/`，Windows x64 为 `release/0.1.0/windows-x86_64/`。
同版本重复打包时，上一份产物移入旁边的 `.previous.*` 目录；调试包使用 `<系统>-<架构>-debug/`，与 Release 分开。
`dist/` 仍用于 Vite 前端构建，不用于存放发行包。

需要 Node.js/npm 和 Rust。macOS 需要 Xcode 命令行工具；Windows 需要 Visual Studio 的 C++ 桌面开发工具、Windows SDK、MSVC Rust 工具链及 Git Bash。
`all` 需要在 macOS 上运行；Apple 两个架构分别生成独立的 App 和 DMG，Windows 生成 `*-setup.exe`。归档目录分别为 `darwin-aarch64/`、`darwin-x86_64/`、`windows-x86_64/`。任一目标失败即停止，已完成的目标保留。

macOS 交叉打包 Windows 按 [Tauri 官方方案](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos) 使用 cargo-xwin、LLVM、LLD 和 NSIS。首次使用先安装：

```bash
brew install llvm lld nsis
cargo install --locked cargo-xwin
```

脚本在缺少 LLVM 命令时自动查找 Homebrew LLVM 路径；也可自行将 LLVM 的 `bin` 加入 `PATH`。缺少的 Rust 目标标准库会自动通过 `rustup target add` 安装，首次 Windows 交叉编译还会下载 Windows SDK，需要网络。SDK 默认缓存于 `src-tauri/target/xwin/`，可用 `XWIN_CACHE_DIR` 指定共享缓存。

脚本只运行一次 `npm ci`，三个目标串行构建。沿用 Tauri 配置及环境变量中的签名、公证设置；正式签名需要自行配置相应凭据，交叉编译 Windows 签名需使用外部签名工具。Windows 安装与运行仍需在 Windows 实机验收。
查看完整用法：`bash build.sh --help`。

## GitHub Actions 打包与发布

工作流位于 [`.github/workflows/build.yml`](.github/workflows/build.yml)，复用现有 `build.sh`，分别生成 macOS Apple Silicon、macOS Intel 的 DMG 和 Windows x64 的 NSIS EXE。使用 Node.js 24、Rust stable，安装依赖时沿用 npm/Cargo 锁文件，并缓存 npm 和 Rust 构建数据。

### 手动打包

将工作流提交并推送到 GitHub 默认分支后，进入仓库 **Actions → Build desktop installers → Run workflow**，选择要构建的分支并运行。
三个平台全部构建；完成后在本次运行页面的 **Artifacts** 下载对应平台的 ZIP，解压即可得到安装包。Artifacts 保留 30 天。手动运行只构建和上传产物，即使选择标签也不会创建 Release；普通分支 push 不触发打包。

### 标签发布

1. 修改 `src-tauri/tauri.conf.json` 的 `version`，例如 `1.0.3`。安装包版本以此文件为准，`package.json` 和 `Cargo.toml` 的版本不会覆盖它。
2. 自行提交并推送源代码后，在对应提交创建并推送同名版本标签：

   ```bash
   git tag v1.0.3
   git push origin v1.0.3
   ```

3. 工作流先检查标签是否严格等于 `v<version>`，并运行 `npm test`；检查失败不会开始桌面构建。
4. 三个平台都成功后，自动创建 **GoPic v1.0.3** Release 草稿，附上两个 DMG 和一个 EXE。进入仓库 **Releases** 检查安装包、填写更新说明并手动发布。含 `-beta.1` 等后缀的版本会标记为预发布。

重跑同一个标签会复用已有草稿并替换同名附件；如果该版本已经正式发布，工作流会拒绝覆盖附件。某个平台失败时，其他平台继续构建并上传成功的产物，但不会创建 Release 草稿。

无需额外配置个人访问令牌或 Secrets，工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`。只有 Release 任务申请 `contents: write`；若仓库或组织策略禁用了 Actions 或限制写权限，需要在相应 Settings 中允许此工作流及创建 Release。

当前工作流未配置开发者证书签名、Apple 公证或自动更新。安装时可能遇到 macOS Gatekeeper / Windows SmartScreen 提示；正式签名需另行接入证书和凭据。GitHub runner 上编译成功不代表已完成各平台实机安装与运行验收。

## 代码结构

`src/domain` 定义共享模型与串行快照更新；`src/services/native.ts` 封装 IPC；`src/hooks/useNativeApp.ts` 管理桌面状态。`src/app/NativeApp.tsx` 与 `PreviewApp.tsx` 分别承载真实运行和预览。

`src-tauri/src` 按 models、store、upload、commands、desktop 分层。Cocoa 状态栏拖拽与原生绘制位于 `src-tauri/native/status_drop.m`，反馈状态机独立于原生视图，可单元测试。配置与缓存存放于应用数据目录，不自动导入 Flutter 历史。

## UI 样式

前端使用 Tailwind CSS 3.4，通过 PostCSS 编译；保留当前桌面布局、主题和交互。采用 3.4 以避免 Tailwind 4 的 Safari 16.4 最低要求，但旧版 macOS WebView 仍需目标设备验证。

- `tailwind.config.js`：扫描 TS/TSX 静态类名；集中定义主题颜色、间距与窗口断点。根字号维持 13px，间距刻度使用 px，因此 `p-5` 为 20px、`gap-2` 为 8px。
- `src/styles/index.css`：唯一样式入口。`base.css` 管理基础排版和 light/dark/system 变量；`components.css` 用 `@apply` 组合公共控件；`pages.css` 管理页面子元素与关联状态；`preview.css` 管理预览专用控件。
- 页面布局、间距和响应式样式直接使用 JSX 工具类；复用控件使用 components 层。`wide` ≥1500px，`compact` ≤1100px，`narrow` ≤900px，`small-window` ≤700px。
- 关闭 Preflight，显式维持现有表单和 dialog 基线。新增样式使用完整静态类名；运行时进度宽度、图片缩放继续使用 inline style，避免动态拼接无法被扫描的工具类。

## 验证

```bash
npm test
npm run build
npm run format:check
cd src-tauri
cargo test --lib
cargo check
```

已使用本地 HTTP 测试上传协议及失败路径，并在隔离桌面应用中验证普通文件上传、图片压缩、缓存预览、定位及导出。真实云厂商账号、登录后自启动及原生托盘拖放手势仍需现场验收；本地测试不代表这些外部环境已验证。

接口见 [Native contract](docs/implementation/native-contract.md)，功能盘点见 [Flutter 功能清单](docs/flutter-feature-inventory.md)，预览验收见 [design-qa.md](design-qa.md)。
