fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("native/status_drop.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("gopic_status_drop");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rerun-if-changed=native/status_drop.m");
    }
    tauri_build::build()
}
