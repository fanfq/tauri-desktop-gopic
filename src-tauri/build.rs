fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let mut native = cc::Build::new();
        native
            .file("native/status_drop.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("gopic_status_drop");

        // @available 会调用 compiler-rt 的版本检测函数；Rust 使用 -nodefaultlibs
        // 链接，不会像 Clang 驱动那样自动加入该库。跟随实际 C 编译器查找，
        // 避免硬编码 Xcode 安装路径，并同时支持 Intel 与 Apple Silicon。
        let runtime = native
            .get_compiler()
            .to_command()
            .arg("--print-file-name=libclang_rt.osx.a")
            .output()
            .expect("无法查询 Clang macOS 运行时路径");
        assert!(runtime.status.success(), "Clang macOS 运行时查询失败");
        let runtime_path =
            String::from_utf8(runtime.stdout).expect("Clang macOS 运行时路径不是 UTF-8");
        let runtime_path = std::path::Path::new(runtime_path.trim());
        assert!(
            runtime_path.is_file(),
            "找不到 Clang macOS 运行时：{}",
            runtime_path.display()
        );
        println!(
            "cargo:rustc-link-search=native={}",
            runtime_path.parent().unwrap().display()
        );
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rerun-if-changed=native/status_drop.m");
    }
    tauri_build::build()
}
