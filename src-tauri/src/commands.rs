//! IPC 命令只做边界校验和业务编排，上传协议与存储细节由独立模块承担。
use crate::{
    desktop,
    models::*,
    store::{Store, atomic_write},
};
use std::{path::PathBuf, sync::Arc};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

fn store(app: &AppHandle) -> Arc<Store> {
    app.state::<Arc<Store>>().inner().clone()
}
fn changed(app: &AppHandle) {
    let _ = app.emit("library-changed", ());
}
#[tauri::command]
pub fn get_snapshot(app: AppHandle) -> Result<Snapshot, String> {
    let store = store(&app);
    let data = store.data()?;
    Ok(Snapshot {
        settings: data.settings,
        files: data.files,
        cache: store.cache_summary()?,
        launch_at_login: app
            .autolaunch()
            .is_enabled()
            .map_err(|_| "无法读取系统自启动状态".to_string())?,
        version: app.package_info().version.to_string(),
    })
}
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let saved = store(&app).save_settings(settings)?;
    changed(&app);
    Ok(saved)
}
#[tauri::command]
pub async fn upload_files(
    app: AppHandle,
    paths: Vec<String>,
    profile_id: String,
    batch_id: String,
) -> Result<BatchResult, String> {
    run_upload_batch(app, paths, profile_id, batch_id, false).await
}

/// 托盘与窗口入口共享配置快照、错误语义和缓存提交顺序。
pub async fn run_upload_batch(
    app: AppHandle,
    paths: Vec<String>,
    profile_id: String,
    batch_id: String,
    from_tray: bool,
) -> Result<BatchResult, String> {
    let storage = store(&app);
    let data = storage.data()?;
    let profile = data
        .settings
        .profiles
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or("云服务配置不存在")?;
    profile.validate_upload()?;
    if paths.is_empty() {
        return Ok(BatchResult {
            records: vec![],
            failed: 0,
        });
    }
    desktop::upload_started(&app);
    let emitter = app.clone();
    let recorder = app.clone();
    let scheduler = app
        .state::<crate::upload::batch::UploadScheduler>()
        .inner()
        .clone();
    let result = crate::upload::batch::run(
        paths,
        crate::upload::batch::BatchConfig {
            profile,
            compression: data.settings.compression,
            naming: data.settings.naming,
            batch_id,
        },
        scheduler,
        move |event| {
            let finished = matches!(event.status.as_str(), "done" | "error");
            let _ = emitter.emit("upload-progress", event);
            if finished {
                changed(&emitter);
            }
        },
        move |uploaded| {
            // 上传器持有不可变快照，阻塞线程完成缓存事务后才释放临时文件。
            let _snapshot_guard = &uploaded.temporary;
            let record = storage.add_upload(
                &profile_id,
                &uploaded.name,
                &uploaded.content_type,
                &uploaded.url,
                &uploaded.source_path,
            )?;
            // 缓存必须对应上传快照的精确字节；对象名仅用于内部不变量检查，不写入日志。
            debug_assert_eq!(record.size_bytes, uploaded.size_bytes);
            debug_assert!(!uploaded.object_key.is_empty());
            desktop::set_latest(&recorder, &record.name, &record.url);
            Ok(record)
        },
    )
    .await;
    let BatchResult { records, failed } = result;
    let mut clipboard_failed = false;
    if from_tray && !records.is_empty() {
        let links = records
            .iter()
            .map(|r| r.url.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        if let Err(error) = desktop::copy_text(&links) {
            clipboard_failed = true;
            let _ = app.emit("desktop-error", error);
        }
    }
    desktop::upload_finished(
        &app,
        records.len(),
        failed,
        from_tray && !records.is_empty() && !clipboard_failed,
        clipboard_failed,
    );
    Ok(BatchResult { records, failed })
}
#[tauri::command]
pub fn delete_records(app: AppHandle, profile_id: String, ids: Vec<String>) -> Result<(), String> {
    let result = store(&app).delete_records(&profile_id, &ids);
    changed(&app);
    result
}
#[tauri::command]
pub fn clear_history(app: AppHandle) -> Result<(), String> {
    store(&app).clear_history()?;
    changed(&app);
    Ok(())
}
#[tauri::command]
pub fn clear_cache(app: AppHandle) -> Result<(), String> {
    let result = store(&app).clear_cache();
    changed(&app);
    result
}
#[tauri::command]
pub fn export_cache(
    app: AppHandle,
    profile_id: String,
    ids: Vec<String>,
    destination: String,
) -> Result<ExportResult, String> {
    store(&app).export_cache(&profile_id, &ids, &PathBuf::from(destination))
}
#[tauri::command]
pub fn open_cache_directory(app: AppHandle, record_id: Option<String>) -> Result<(), String> {
    let store = store(&app);
    match record_id {
        Some(id) => app
            .opener()
            .reveal_item_in_dir(store.cache_path(&id)?)
            .map_err(|_| "无法在文件管理器中定位缓存文件".into()),
        None => app
            .opener()
            .open_path(
                store.cache_dir().to_string_lossy().into_owned(),
                None::<&str>,
            )
            .map_err(|_| "无法打开缓存目录".into()),
    }
}
#[tauri::command]
pub fn export_configuration(app: AppHandle, path: String) -> Result<(), String> {
    let source = store(&app).export_document()?;
    atomic_write(&PathBuf::from(path), source.as_bytes())
}
#[tauri::command]
pub fn import_configuration(app: AppHandle, path: String) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    let meta = std::fs::metadata(&path).map_err(|_| "无法读取配置文件".to_string())?;
    if !meta.is_file() || meta.len() > 10 * 1024 * 1024 {
        return Err("配置文件无效或大于 10 MiB".into());
    }
    let source =
        std::fs::read_to_string(path).map_err(|_| "无法读取 UTF-8 配置文件".to_string())?;
    let result = store(&app).import_document(&source)?;
    changed(&app);
    Ok(result)
}
#[tauri::command]
pub fn set_launch_at_login(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|_| "系统自启动设置失败，请检查登录项权限".to_string())?;
    if manager
        .is_enabled()
        .map_err(|_| "无法核实系统自启动状态".to_string())?
        != enabled
    {
        return Err("系统未确认自启动设置，请稍后重试".into());
    }
    changed(&app);
    Ok(())
}
