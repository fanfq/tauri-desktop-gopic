mod commands;
mod desktop;
mod models;
mod store;
#[cfg(test)]
mod store_tests;
mod upload;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 双开时聚焦已有窗口，避免两个进程同时改写配置与历史。
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop::show_main(app)
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(Arc::new(store::Store::open(root)?));
            // 窗口与托盘共用文件并发额度，避免两个入口叠加占满内存和连接。
            app.manage(upload::batch::UploadScheduler::default());
            desktop::setup(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    desktop::hide_main(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::save_settings,
            commands::upload_files,
            commands::delete_records,
            commands::clear_history,
            commands::clear_cache,
            commands::export_cache,
            commands::open_cache_directory,
            commands::export_configuration,
            commands::import_configuration,
            commands::set_launch_at_login,
        ])
        .build(tauri::generate_context!())
        .expect("GoPic 启动失败")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } => {
                api.prevent_exit();
                desktop::hide_main(app);
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => desktop::show_main(app),
            _ => {}
        });
}
