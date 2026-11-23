use crate::{models::Settings, store::Store};

#[test]
fn fresh_store_has_no_credentials_or_history() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().to_path_buf()).unwrap();
    let state = store.data().unwrap();
    assert!(state.files.is_empty());
    assert!(
        state
            .settings
            .profiles
            .iter()
            .all(|p| !p.enabled && p.secret.is_empty())
    );
}

#[test]
fn settings_survive_restart_and_invalid_save_does_not_replace() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().to_path_buf()).unwrap();
    let mut settings = Settings::default();
    settings.theme = "dark".into();
    store.save_settings(settings.clone()).unwrap();
    let mut invalid = settings.clone();
    invalid.compression.quality = 0;
    assert!(store.save_settings(invalid).is_err());
    drop(store);
    let reopened = Store::open(dir.path().to_path_buf()).unwrap();
    assert_eq!(reopened.data().unwrap().settings.theme, "dark");
    assert_eq!(reopened.data().unwrap().settings.compression.quality, 70);
}

#[test]
fn cache_and_history_have_independent_lifetimes_and_profile_boundaries() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.txt");
    std::fs::write(&source, "hello").unwrap();
    let store = Store::open(dir.path().join("store")).unwrap();
    let a = store
        .add_upload("p1", "a.txt", "text/plain", "https://cdn/a", &source)
        .unwrap();
    let b = store
        .add_upload("p2", "b.txt", "text/plain", "https://cdn/b", &source)
        .unwrap();
    store.delete_records("p1", &[b.id.clone()]).unwrap();
    assert_eq!(store.data().unwrap().files.len(), 2);
    store.delete_records("p1", &[a.id.clone()]).unwrap();
    assert!(!std::path::Path::new(a.cache_path.as_ref().unwrap()).exists());
    assert!(std::path::Path::new(b.cache_path.as_ref().unwrap()).exists());
    store.clear_history().unwrap();
    assert!(store.data().unwrap().files.is_empty());
    assert_eq!(store.cache_summary().unwrap().file_count, 1);
    store.clear_cache().unwrap();
    assert_eq!(store.cache_summary().unwrap().file_count, 0);
}

#[test]
fn clear_cache_keeps_history_and_export_does_not_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source");
    std::fs::write(&source, "hello").unwrap();
    let store = Store::open(dir.path().join("store")).unwrap();
    let item = store
        .add_upload("p1", "../a.txt", "text/plain", "https://cdn/a", &source)
        .unwrap();
    let output = dir.path().join("output");
    std::fs::create_dir(&output).unwrap();
    std::fs::write(output.join("a.txt"), "keep").unwrap();
    let result = store
        .export_cache("p1", &[item.id.clone()], &output)
        .unwrap();
    assert_eq!(result.skipped, 1);
    assert_eq!(
        std::fs::read_to_string(output.join("a.txt")).unwrap(),
        "keep"
    );
    store.clear_cache().unwrap();
    let data = store.data().unwrap();
    assert_eq!(data.files.len(), 1);
    assert!(data.files[0].cache_path.is_none());
}

#[test]
fn import_uses_new_ids_and_invalid_document_changes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().to_path_buf()).unwrap();
    let original = store.data().unwrap().settings.profiles[0].id.clone();
    let export = store.export_document().unwrap();
    let added = store.import_document(&export).unwrap();
    assert_eq!(added.added, 5);
    let data = store.data().unwrap();
    assert_eq!(data.settings.profiles.len(), 10);
    assert_eq!(
        data.settings
            .profiles
            .iter()
            .filter(|p| p.id == original)
            .count(),
        1
    );
    assert!(
        store
            .import_document(r#"{"version":999,"cloud":{}}"#)
            .is_err()
    );
    assert_eq!(store.data().unwrap().settings.profiles.len(), 10);
}

#[test]
fn disk_write_failure_preserves_in_memory_settings() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().to_path_buf()).unwrap();
    std::fs::create_dir(dir.path().join("state.json")).unwrap();
    let mut next = store.data().unwrap().settings;
    next.theme = "dark".into();
    assert!(store.save_settings(next).is_err());
    assert_eq!(store.data().unwrap().settings.theme, "system");
}

#[test]
fn malformed_import_compression_or_active_reference_is_atomic() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().to_path_buf()).unwrap();
    for (field, value) in [
        (
            "compression",
            serde_json::json!({"enabled":true,"thresholdBytes":0,"quality":101}),
        ),
        ("activeProfileId", serde_json::json!(123)),
        ("activeProfileId", serde_json::json!("missing-id")),
    ] {
        let mut export: serde_json::Value =
            serde_json::from_str(&store.export_document().unwrap()).unwrap();
        export["cloud"][field] = value;
        assert!(store.import_document(&export.to_string()).is_err());
        assert_eq!(store.data().unwrap().settings.profiles.len(), 5);
    }
}

#[test]
fn clear_cache_does_not_touch_in_flight_pending_files() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().to_path_buf()).unwrap();
    let pending = store.cache_dir().join(".pending");
    std::fs::create_dir_all(&pending).unwrap();
    std::fs::write(pending.join("active.tmp"), "active").unwrap();
    store.clear_cache().unwrap();
    assert!(pending.join("active.tmp").exists());
}

#[cfg(unix)]
#[test]
fn cache_cannot_reveal_or_export_a_symlink_target() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("private.txt");
    std::fs::write(&source, "private").unwrap();
    let store = Store::open(dir.path().join("store")).unwrap();
    let item = store
        .add_upload("p", "a.txt", "text/plain", "https://cdn/a", &source)
        .unwrap();
    let cache = std::path::PathBuf::from(item.cache_path.unwrap());
    std::fs::remove_file(&cache).unwrap();
    std::os::unix::fs::symlink(&source, &cache).unwrap();
    assert!(store.cache_path(&item.id).is_err());
    store.clear_cache().unwrap();
    assert_eq!(std::fs::read_to_string(source).unwrap(), "private");
}

#[test]
fn local_commit_failure_reports_cloud_success_and_removes_pending_files() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().join("store")).unwrap();
    let error = store
        .add_upload(
            "p",
            "a.txt",
            "text/plain",
            "https://cdn/a",
            &dir.path().join("missing"),
        )
        .err()
        .unwrap();
    assert!(error.contains("云端上传已成功"));
    assert_eq!(
        std::fs::read_dir(store.cache_dir().join(".pending"))
            .unwrap()
            .count(),
        0
    );
    let source = dir.path().join("source");
    std::fs::write(&source, "ok").unwrap();
    std::fs::create_dir(dir.path().join("store/state.json")).unwrap();
    let error = store
        .add_upload("p", "a.txt", "text/plain", "https://cdn/a", &source)
        .err()
        .unwrap();
    assert!(error.contains("云端上传已成功"));
    assert!(store.data().unwrap().files.is_empty());
    assert_eq!(store.cache_summary().unwrap().file_count, 0);
}
