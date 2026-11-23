//! Local HTTP regression coverage for sliding multipart windows and streamed ranges.
use super::tests::{profile, response};
use super::*;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// The first block waits for block five: a batch barrier cannot satisfy this gate.
async fn sliding_upload(provider: &str, part_size: usize) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let fifth = Arc::new(tokio::sync::Notify::new());
    let slid = Arc::new(AtomicBool::new(false));
    let merged = Arc::new(Mutex::new(String::new()));
    let is_s3 = provider == "s3";
    let slid_server = slid.clone();
    let merged_server = merged.clone();
    let service = tokio::spawn(async move {
        let mut tasks = Vec::new();
        for _ in 0..if is_s3 { 7 } else { 6 } {
            let (mut socket, _) = listener.accept().await.unwrap();
            let fifth = fifth.clone();
            let slid = slid_server.clone();
            let merged = merged_server.clone();
            tasks.push(tokio::spawn(async move {
                let mut bytes = Vec::new();
                let mut buf = [0u8; 65536];
                let (end, length) = loop {
                    let n = socket.read(&mut buf).await.unwrap();
                    assert!(n > 0);
                    bytes.extend_from_slice(&buf[..n]);
                    if let Some(end) = bytes.windows(4).position(|s| s == b"\r\n\r\n") {
                        let head = String::from_utf8_lossy(&bytes[..end]);
                        let length = head.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|s| s.trim().parse::<usize>().unwrap())).unwrap_or(0);
                        break (end + 4, length);
                    }
                };
                while bytes.len() < end + length {
                    let n = socket.read(&mut buf).await.unwrap();
                    assert!(n > 0);
                    bytes.extend_from_slice(&buf[..n]);
                }
                let head = String::from_utf8_lossy(&bytes[..end]);
                let body = &bytes[end..];
                let reply = if head.contains("uploads=") {
                    response("200 OK", "<InitiateMultipartUploadResult><UploadId>test</UploadId></InitiateMultipartUploadResult>", "")
                } else if head.starts_with("PUT ") || head.contains("/mkblk/") {
                    let number = body[0] as usize;
                    assert!((1..=5).contains(&number));
                    let expected_length = if number == 5 { 123 } else { part_size };
                    assert_eq!(length, expected_length);
                    assert_eq!(body.len(), expected_length);
                    assert!(body.iter().all(|b| *b == number as u8), "stream crossed its file range");
                    if number == 5 { fifth.notify_one(); }
                    if number == 1 {
                        slid.store(tokio::time::timeout(std::time::Duration::from_millis(800), fifth.notified()).await.is_ok(), Ordering::SeqCst);
                    }
                    if is_s3 { response("200 OK", "", &format!("ETag: tag-{number}\r\n")) }
                    else { response("200 OK", &format!("{{\"ctx\":\"ctx-{number}\"}}"), "") }
                } else {
                    *merged.lock().unwrap() = String::from_utf8(body.to_vec()).unwrap();
                    if is_s3 { response("200 OK", "<CompleteMultipartUploadResult/>", "") }
                    else { response("200 OK", "{}", "") }
                };
                socket.write_all(reply.as_bytes()).await.unwrap();
            }));
        }
        for task in tasks {
            task.await.unwrap();
        }
    });
    let file = tempfile::NamedTempFile::new().unwrap();
    let mut contents = Vec::new();
    for number in 1..=5 {
        contents.extend(std::iter::repeat_n(
            number as u8,
            if number == 5 { 123 } else { part_size },
        ));
    }
    std::fs::write(file.path(), &contents).unwrap();
    let values = Arc::new(Mutex::new(Vec::new()));
    let sink = values.clone();
    upload_file(
        &profile(&endpoint, provider),
        &Compression {
            enabled: false,
            threshold: 1.0,
            quality: 70,
        },
        "保持原文件名",
        file.path(),
        move |n, total| sink.lock().unwrap().push((n, total)),
    )
    .await
    .unwrap();
    service.await.unwrap();
    assert!(
        slid.load(Ordering::SeqCst),
        "part five must start before the slow first part completes"
    );
    let values = values.lock().unwrap();
    assert!(
        values.len() > 20,
        "progress must report streamed bytes before part responses"
    );
    assert!(values.windows(2).all(|w| w[0].0 <= w[1].0));
    assert!(
        values
            .iter()
            .all(|(n, total)| *total == contents.len() as u64 && n <= total)
    );
    assert_eq!(
        values.last(),
        Some(&(contents.len() as u64, contents.len() as u64))
    );
    let merged = merged.lock().unwrap();
    if is_s3 {
        for n in 1..5 {
            assert!(
                merged.find(&format!("tag-{n}")).unwrap()
                    < merged.find(&format!("tag-{}", n + 1)).unwrap()
            );
        }
    } else {
        assert_eq!(*merged, "ctx-1,ctx-2,ctx-3,ctx-4,ctx-5");
    }
}

#[tokio::test]
async fn s3_sliding_window_streams_ranges_and_orders_merge() {
    sliding_upload("s3", 5 * 1024 * 1024).await;
}
#[tokio::test]
async fn qiniu_sliding_window_streams_ranges_and_orders_contexts() {
    sliding_upload("qiniu", 4 * 1024 * 1024).await;
}

#[tokio::test]
async fn s3_failure_drains_four_inflight_ranges_before_abort_and_never_starts_fifth() {
    use std::sync::atomic::AtomicUsize;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let completed = Arc::new(AtomicUsize::new(0));
    let requests = Arc::new(AtomicUsize::new(0));
    let completed_server = completed.clone();
    let requests_server = requests.clone();
    let service = tokio::spawn(async move {
        let started = Arc::new(tokio::sync::Barrier::new(4));
        let mut tasks = Vec::new();
        loop {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buf = [0u8; 65536];
            let (end, length) = loop {
                let n = socket.read(&mut buf).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
                if let Some(end) = bytes.windows(4).position(|s| s == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&bytes[..end]);
                    let length = head
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|s| s.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    break (end + 4, length);
                }
            };
            while bytes.len() < end + length {
                let n = socket.read(&mut buf).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
            }
            let head = String::from_utf8_lossy(&bytes[..end]);
            if head.contains("uploads=") {
                socket.write_all(response("200 OK", "<InitiateMultipartUploadResult><UploadId>drain</UploadId></InitiateMultipartUploadResult>", "").as_bytes()).await.unwrap();
            } else if head.starts_with("DELETE ") {
                assert_eq!(
                    completed_server.load(Ordering::SeqCst),
                    3,
                    "abort must wait for successful in-flight responses"
                );
                socket
                    .write_all(response("204 No Content", "", "").as_bytes())
                    .await
                    .unwrap();
                break;
            } else {
                let number = requests_server.fetch_add(1, Ordering::SeqCst) + 1;
                assert!(
                    number <= 4,
                    "a failure must prevent starting the fifth range"
                );
                let completed = completed_server.clone();
                let started = started.clone();
                tasks.push(tokio::spawn(async move {
                    // Ensure all four initial requests exist before allowing the
                    // failure, then leave the other three responses in flight.
                    started.wait().await;
                    let reply = if number == 1 {
                        response("403 Forbidden", "private details", "")
                    } else {
                        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        completed.fetch_add(1, Ordering::SeqCst);
                        response("200 OK", "", "ETag: ok\r\n")
                    };
                    socket.write_all(reply.as_bytes()).await.unwrap();
                }));
            }
        }
        for task in tasks {
            task.await.unwrap();
        }
    });
    let file = tempfile::NamedTempFile::new().unwrap();
    file.as_file().set_len(21 * 1024 * 1024).unwrap();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        upload_file(
            &profile(&endpoint, "s3"),
            &Compression {
                enabled: false,
                threshold: 1.0,
                quality: 70,
            },
            "保持原文件名",
            file.path(),
            |_, _| {},
        ),
    )
    .await
    .unwrap()
    .err()
    .unwrap();
    service.await.unwrap();
    assert!(result.contains("403"));
    assert!(!result.contains("private"));
    assert_eq!(requests.load(Ordering::SeqCst), 4);
}
