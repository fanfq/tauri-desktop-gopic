//! 桌面集成仅桥接原生行为；上传仍复用命令层的相同管线。
mod feedback;
use std::sync::{Mutex, OnceLock};
use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

pub struct TrayState {
    latest: Mutex<Option<(String, String)>>,
    menu_item: MenuItem<tauri::Wry>,
    feedback: Mutex<feedback::Feedback>,
}
static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn setup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let latest = app
        .state::<std::sync::Arc<crate::store::Store>>()
        .data()?
        .files
        .first()
        .map(|f| (f.name.clone(), f.url.clone()));
    let item = MenuItem::with_id(
        app,
        "latest",
        latest
            .as_ref()
            .map(|(name, _)| format!("最近上传：{name}"))
            .unwrap_or("最近上传：暂无上传记录".into()),
        latest.is_some(),
        None::<&str>,
    )?;
    let open = MenuItem::with_id(app, "open", "打开 GoPic", true, Some("CmdOrCtrl+O"))?;
    let quit = MenuItem::with_id(app, "quit", "退出 GoPic", true, Some("CmdOrCtrl+Q"))?;
    let separator = PredefinedMenuItem::separator(app)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&item, &separator, &open, &separator2, &quit])?;
    app.manage(TrayState {
        latest: Mutex::new(latest),
        menu_item: item,
        feedback: Mutex::new(feedback::Feedback::default()),
    });
    let builder = TrayIconBuilder::with_id("gopic")
        .menu(&menu)
        .tooltip("GoPic：拖入文件上传")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            "latest" => {
                let url = app
                    .state::<TrayState>()
                    .latest
                    .lock()
                    .ok()
                    .and_then(|value| value.as_ref().map(|(_, url)| url.clone()));
                if let Some(url) = url {
                    match copy_text(&url) {
                        Ok(()) => flash(app, false, "最近上传链接已复制", 2),
                        Err(error) => {
                            flash(app, true, &error, 3);
                            let _ = app.emit("desktop-error", error);
                        }
                    }
                }
            }
            _ => (),
        });
    // 复用 Flutter 的彩色品牌图标，按状态栏 18px 绘制，不能用系统云图标替换。
    let icon = image::load_from_memory(include_bytes!("../../../public/gopic.png"))?.to_rgba8();
    let (width, height) = icon.dimensions();
    let icon = tauri::image::Image::new_owned(icon.into_raw(), width, height);
    let builder = builder.icon(icon).icon_as_template(false);
    let tray = builder.build(app)?;
    let _ = APP.set(app.clone());
    #[cfg(target_os = "macos")]
    tray.with_inner_tray_icon(|inner| {
        if let Some(item) = inner.ns_status_item() {
            let ptr: *const _ = &*item;
            // 指针仅在 Tauri 的主线程闭包内借用，Cocoa 覆盖视图由状态栏项持有。
            unsafe {
                gopic_install_status_drop(ptr.cast_mut().cast(), receive_drop, receive_menu_action);
            }
        }
    })?;
    #[cfg(not(target_os = "macos"))]
    let _ = tray;
    let latest = app
        .state::<TrayState>()
        .latest
        .lock()
        .ok()
        .and_then(|v| v.clone());
    if let Some((name, url)) = latest {
        set_latest(app, &name, &url);
    }
    Ok(())
}
pub fn show_main(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
pub fn copy_text(text: &str) -> Result<(), String> {
    arboard::Clipboard::new()
        .and_then(|mut c| c.set_text(text))
        .map_err(|_| "无法写入剪贴板".into())
}
pub fn set_latest(app: &AppHandle, name: &str, url: &str) {
    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(mut latest) = state.latest.lock() {
            *latest = Some((name.into(), url.into()));
        }
        let _ = state.menu_item.set_text(format!("最近上传：{name}"));
        let _ = state.menu_item.set_enabled(true);
        #[cfg(target_os = "macos")]
        if let (Some(tray), Ok(name), Ok(url)) = (
            app.tray_by_id("gopic"),
            std::ffi::CString::new(name),
            std::ffi::CString::new(url),
        ) {
            let _ = tray.with_inner_tray_icon(move |inner| {
                if let Some(item) = inner.ns_status_item() {
                    let ptr: *const _ = &*item;
                    unsafe {
                        gopic_set_latest(ptr.cast_mut().cast(), name.as_ptr(), url.as_ptr());
                    }
                }
            });
        }
    }
}
/// 关闭/普通退出只隐藏窗口，托盘菜单的显式退出才结束进程。
pub fn hide_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}
pub fn upload_started(app: &AppHandle) {
    let visual = app
        .try_state::<TrayState>()
        .and_then(|state| state.feedback.lock().ok().map(|mut f| f.start()));
    if let Some(visual) = visual {
        publish(app, visual, "GoPic 正在上传", 3);
    }
}
pub fn upload_finished(
    app: &AppHandle,
    succeeded: usize,
    failed: usize,
    copied: bool,
    clipboard_failed: bool,
) {
    let result = app.try_state::<TrayState>().and_then(|state| {
        state.feedback.lock().ok().map(|mut f| {
            let visual = f.finish(succeeded, failed, clipboard_failed);
            (visual, f.counts())
        })
    });
    if let Some((visual, (succeeded, failed, clipboard_failed))) = result {
        let tooltip = if visual.status == feedback::Status::Uploading {
            "GoPic 正在上传".into()
        } else if clipboard_failed {
            format!("已上传 {succeeded} 个文件，但链接复制失败")
        } else if succeeded > 0 {
            format!(
                "已上传 {succeeded} 个文件{}{}",
                if copied { "，链接已复制" } else { "" },
                if failed > 0 {
                    format!("（{failed} 个失败）")
                } else {
                    String::new()
                }
            )
        } else {
            format!("上传失败（{failed} 个文件）")
        };
        publish(app, visual, &tooltip, 3);
    }
}
fn flash(app: &AppHandle, failed: bool, tooltip: &str, seconds: u64) {
    let visual = app
        .try_state::<TrayState>()
        .and_then(|state| state.feedback.lock().ok().map(|mut f| f.flash(failed)));
    if let Some(visual) = visual {
        publish(app, visual, tooltip, seconds);
    }
}
fn publish(app: &AppHandle, visual: feedback::Visual, tooltip: &str, seconds: u64) {
    render(app, visual, tooltip);
    if !visual.transient {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(seconds)).await;
        let reset = app.try_state::<TrayState>().and_then(|state| {
            state
                .feedback
                .lock()
                .ok()
                .and_then(|mut f| f.reset(visual.revision))
        });
        if let Some(reset) = reset {
            render(&app, reset, "GoPic：拖入文件上传");
        }
    });
}
/// 所有绘制在主线程内校验版本；旧的反馈或恢复计时不得覆盖新上传。
fn render(app: &AppHandle, visual: feedback::Visual, tooltip: &str) {
    let handle = app.clone();
    let tooltip = tooltip.to_owned();
    let _ = app.run_on_main_thread(move || {
        let Some(state) = handle.try_state::<TrayState>() else {
            return;
        };
        let Ok(feedback) = state.feedback.lock() else {
            return;
        };
        if !feedback.is_current(visual.revision) {
            return;
        }
        if let Some(tray) = handle.tray_by_id("gopic") {
            let _ = tray.set_tooltip(Some(&tooltip));
            #[cfg(target_os = "macos")]
            if let (Ok(status), Ok(tooltip)) = (
                std::ffi::CString::new(visual.status.name()),
                std::ffi::CString::new(tooltip),
            ) {
                let _ = tray.with_inner_tray_icon(move |inner| {
                    if let Some(item) = inner.ns_status_item() {
                        let ptr: *const _ = &*item;
                        unsafe {
                            gopic_set_status_state(
                                ptr.cast_mut().cast(),
                                status.as_ptr(),
                                tooltip.as_ptr(),
                            );
                        }
                    }
                });
            }
        }
    });
}
#[cfg(target_os = "macos")]
extern "C" fn receive_menu_action(action: i32) {
    if let Some(app) = APP.get() {
        match action {
            0 => {
                let url = app
                    .state::<TrayState>()
                    .latest
                    .lock()
                    .ok()
                    .and_then(|v| v.as_ref().map(|(_, url)| url.clone()));
                if let Some(url) = url {
                    match copy_text(&url) {
                        Ok(()) => flash(app, false, "最近上传链接已复制", 2),
                        Err(error) => {
                            flash(app, true, &error, 3);
                            let _ = app.emit("desktop-error", error);
                        }
                    }
                }
            }
            1 => show_main(app),
            2 => app.exit(0),
            _ => (),
        }
    }
}
#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn gopic_install_status_drop(
        status_item: *mut std::ffi::c_void,
        callback: extern "C" fn(*const std::ffi::c_char),
        menu: extern "C" fn(i32),
    );
    fn gopic_set_latest(
        status_item: *mut std::ffi::c_void,
        name: *const std::ffi::c_char,
        url: *const std::ffi::c_char,
    );
    fn gopic_set_status_state(
        status_item: *mut std::ffi::c_void,
        state: *const std::ffi::c_char,
        tooltip: *const std::ffi::c_char,
    );
}
#[cfg(target_os = "macos")]
extern "C" fn receive_drop(json: *const std::ffi::c_char) {
    if json.is_null() {
        return;
    }
    // 回调字符串由 Cocoa 临时持有，必须先复制再进入异步任务。
    let source = unsafe { std::ffi::CStr::from_ptr(json) }
        .to_string_lossy()
        .into_owned();
    let Ok(paths) = serde_json::from_str::<Vec<String>>(&source) else {
        return;
    };
    let Some(app) = APP.get().cloned() else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let profile_id = app
            .state::<std::sync::Arc<crate::store::Store>>()
            .data()
            .ok()
            .and_then(|d| {
                d.settings.active_profile_id.or_else(|| {
                    d.settings
                        .profiles
                        .iter()
                        .find(|p| p.enabled)
                        .map(|p| p.id.clone())
                })
            });
        if let Some(profile_id) = profile_id {
            if let Err(error) = crate::commands::run_upload_batch(
                app.clone(),
                paths,
                profile_id,
                uuid::Uuid::new_v4().to_string(),
                true,
            )
            .await
            {
                flash(&app, true, "上传失败，请检查云服务配置", 3);
                let _ = app.emit("desktop-error", error);
                show_main(&app);
            }
        } else {
            flash(&app, true, "上传失败，请检查云服务配置", 3);
            let _ = app.emit("desktop-error", "尚未启用可用的云服务配置");
            show_main(&app);
        }
    });
}
