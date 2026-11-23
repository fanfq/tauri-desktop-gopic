use super::*;
use crate::store::Store;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinSet,
    time::{Duration, timeout},
};

fn config(endpoint: &str, id: &str) -> BatchConfig {
    BatchConfig {
        profile: Profile {
            id: "p".into(),
            provider: "s3".into(),
            name: "test".into(),
            enabled: true,
            account: "".into(),
            access: "test".into(),
            secret: "test".into(),
            bucket: "bucket".into(),
            endpoint: endpoint.into(),
            region: "auto".into(),
            domain: "https://cdn.example.com".into(),
            prefix: "".into(),
            path_style: true,
        },
        compression: Compression::default(),
        naming: "保持原文件名".into(),
        batch_id: id.into(),
    }
}

/// 服务端在首四个请求全部到达前不返回；串行文件上传会确定性超时。
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_batches_share_four_slots_isolate_errors_and_keep_input_order() {
    let dir = tempfile::tempdir().unwrap();
    let storage = Arc::new(Store::open(dir.path().join("store")).unwrap());
    let events = Arc::new(Mutex::new(Vec::<UploadProgress>::new()));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let active = Arc::new(AtomicUsize::new(0));
    let peak = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(tokio::sync::Barrier::new(4));
    let server_peak = peak.clone();
    let service = tokio::spawn(async move {
        let mut jobs = JoinSet::new();
        for index in 0..9 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let active = active.clone();
            let peak = server_peak.clone();
            let gate = gate.clone();
            jobs.spawn(async move {
                let mut bytes = Vec::new();
                let mut buffer = [0u8; 4096];
                let (header_end, length) = loop {
                    let n = socket.read(&mut buffer).await.unwrap();
                    assert!(n > 0);
                    bytes.extend_from_slice(&buffer[..n]);
                    if let Some(end) = bytes.windows(4).position(|x| x == b"\r\n\r\n") {
                        let head = String::from_utf8_lossy(&bytes[..end]);
                        let length = head
                            .lines()
                            .find_map(|l| {
                                l.to_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|v| v.trim().parse::<usize>().unwrap())
                            })
                            .unwrap();
                        break (end + 4, length);
                    }
                };
                while bytes.len() < header_end + length {
                    let n = socket.read(&mut buffer).await.unwrap();
                    assert!(n > 0);
                    bytes.extend_from_slice(&buffer[..n]);
                }
                let head = String::from_utf8_lossy(&bytes[..header_end]);
                peak.fetch_max(active.fetch_add(1, Ordering::SeqCst) + 1, Ordering::SeqCst);
                if index < 4 {
                    gate.wait().await;
                }
                tokio::time::sleep(Duration::from_millis(if head.contains("0.txt") {
                    90
                } else {
                    10
                }))
                .await;
                let status = if head.contains("bad.txt") {
                    "403 Forbidden"
                } else {
                    "200 OK"
                };
                active.fetch_sub(1, Ordering::SeqCst);
                socket
                    .write_all(
                        format!(
                            "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        )
                        .as_bytes(),
                    )
                    .await
                    .unwrap();
            });
        }
        while let Some(result) = jobs.join_next().await {
            result.unwrap();
        }
    });
    let make_paths = |names: &[&str]| {
        names
            .iter()
            .map(|name| {
                let path = dir.path().join(name);
                std::fs::write(&path, name.as_bytes()).unwrap();
                path.to_string_lossy().into_owned()
            })
            .collect::<Vec<_>>()
    };
    let a = make_paths(&["0.txt", "bad.txt", "2.txt", "3.txt", "4.txt"]);
    let mut b = make_paths(&["5.txt", "6.txt", "7.txt", "8.txt"]);
    b.push(
        dir.path()
            .join("missing.txt")
            .to_string_lossy()
            .into_owned(),
    );
    let committing = Arc::new(AtomicUsize::new(0));
    let overlapping_commit = Arc::new(AtomicBool::new(false));
    let scheduler = UploadScheduler::default();
    let start = |paths, id: &str| {
        let events = events.clone();
        let storage = storage.clone();
        let committing = committing.clone();
        let overlapping_commit = overlapping_commit.clone();
        run(
            paths,
            config(&endpoint, id),
            scheduler.clone(),
            move |event| events.lock().unwrap().push(event),
            move |uploaded| {
                if committing.fetch_add(1, Ordering::SeqCst) != 0 {
                    overlapping_commit.store(true, Ordering::SeqCst);
                }
                // 模拟“缓存提交 + 托盘最近记录发布”两阶段，整个回调必须跨批次串行。
                std::thread::sleep(Duration::from_millis(10));
                let result = storage.add_upload(
                    "p",
                    &uploaded.name,
                    &uploaded.content_type,
                    &uploaded.url,
                    &uploaded.source_path,
                );
                std::thread::sleep(Duration::from_millis(10));
                committing.fetch_sub(1, Ordering::SeqCst);
                result
            },
        )
    };
    let result = timeout(Duration::from_secs(3), async {
        tokio::join!(start(a, "a"), start(b, "b"))
    })
    .await;
    if result.is_err() {
        service.abort();
    }
    let (a, b) = result.expect("four file requests must overlap rather than deadlock serially");
    service.await.unwrap();
    assert_eq!(
        peak.load(Ordering::SeqCst),
        4,
        "shared scheduler must bound all batches to four requests"
    );
    assert_eq!(a.failed, 1);
    assert_eq!(b.failed, 1);
    assert_eq!(
        a.records
            .iter()
            .map(|r| r.name.as_str())
            .collect::<Vec<_>>(),
        ["0.txt", "2.txt", "3.txt", "4.txt"]
    );
    assert_eq!(
        b.records
            .iter()
            .map(|r| r.name.as_str())
            .collect::<Vec<_>>(),
        ["5.txt", "6.txt", "7.txt", "8.txt"]
    );
    assert!(
        !overlapping_commit.load(Ordering::SeqCst),
        "cache commit and latest-record publication must be atomic across files"
    );
    let data = storage.data().unwrap();
    assert_eq!(data.files.len(), 8);
    for record in &data.files {
        assert_eq!(
            std::fs::read(record.cache_path.as_ref().unwrap()).unwrap(),
            record.name.as_bytes()
        );
    }
    let events = events.lock().unwrap();
    assert_eq!(events.iter().filter(|e| e.status == "done").count(), 8);
    assert_eq!(events.iter().filter(|e| e.status == "error").count(), 2);
    for batch in ["a", "b"] {
        let own = events
            .iter()
            .filter(|e| e.task_id.starts_with(batch))
            .collect::<Vec<_>>();
        assert!(own[..5].iter().all(|e| e.status == "queued"));
    }
}
