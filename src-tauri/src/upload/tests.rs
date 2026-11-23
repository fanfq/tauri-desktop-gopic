use super::*;
use std::sync::{Arc, Mutex};

pub(super) fn profile(endpoint: &str, provider: &str) -> Profile {
    Profile {
        id: "test".into(),
        provider: provider.into(),
        name: "测试".into(),
        enabled: true,
        account: String::new(),
        access: "access".into(),
        secret: "secret".into(),
        bucket: "bucket".into(),
        endpoint: endpoint.into(),
        region: "auto".into(),
        domain: "https://cdn.example.com".into(),
        prefix: "files/".into(),
        path_style: true,
    }
}

#[test]
fn filenames_and_keys_keep_the_four_contract_patterns() {
    assert_eq!(
        naming::object_name("保持原文件名", "a photo.pdf", "20261121", "abc123", "uuid"),
        "a_photo.pdf"
    );
    assert_eq!(
        naming::object_name(
            "{YYYYMMDD}/{HASH}_{FILENAME}",
            "a.txt",
            "20261121",
            "abc123",
            "uuid"
        ),
        "20261121/abc123_a.txt"
    );
    assert_eq!(
        naming::object_name(
            "{YYYYMMDD}/{UUID}.{EXT}",
            "a.pdf",
            "20261121",
            "abc123",
            "uuid"
        ),
        "20261121/uuid.pdf"
    );
    assert_eq!(
        naming::object_name("{UUID}.{EXT}", "README", "20261121", "abc123", "uuid"),
        "uuid"
    );
}

#[test]
fn s3_urls_and_signatures_encode_once_and_sort_queries() {
    let p = profile("https://example.com/base", "r2");
    let url = naming::object_url(&p, "files/a space中文.png").unwrap();
    assert_eq!(
        url.as_str(),
        "https://example.com/base/bucket/files/a%20space%E4%B8%AD%E6%96%87.png"
    );
    let headers =
        signing::s3_headers(&p, "PUT", &url, 3, "text/plain", "20261121T000000Z").unwrap();
    assert_eq!(headers.get("x-amz-date").unwrap(), "20261121T000000Z");
    assert!(
        headers
            .get("authorization")
            .unwrap()
            .to_str()
            .unwrap()
            .contains("Credential=access/20261121/auto/s3/aws4_request")
    );
    assert_eq!(
        signing::canonical_query(
            &url::Url::parse("https://example.com/?z=hello+world&a=%2F").unwrap()
        ),
        "a=%2F&z=hello%20world"
    );
}

#[test]
fn qiniu_token_keeps_padding_and_scopes_object() {
    use base64::Engine;
    let p = profile("https://up.example.com", "qiniu");
    let token = signing::qiniu_token(&p, "files/a.txt", 123).unwrap();
    let parts: Vec<_> = token.split(':').collect();
    assert_eq!(parts[0], "access");
    let policy: serde_json::Value = serde_json::from_slice(
        &base64::engine::general_purpose::URL_SAFE
            .decode(parts[2])
            .unwrap(),
    )
    .unwrap();
    assert_eq!(policy["scope"], "bucket:files/a.txt");
    assert_eq!(policy["deadline"], 123);
}

#[tokio::test]
async fn arbitrary_files_use_a_snapshot_and_are_never_compressed() {
    let f = tempfile::Builder::new().suffix(".pdf").tempfile().unwrap();
    std::fs::write(f.path(), b"arbitrary non-image bytes").unwrap();
    let prepared = prepare::prepare(
        f.path(),
        &Compression {
            enabled: true,
            threshold: 0.0,
            quality: 70,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        std::fs::read(&prepared.source_path).unwrap(),
        b"arbitrary non-image bytes"
    );
    assert!(prepared.temporary.is_some());
    std::fs::write(f.path(), b"changed original").unwrap();
    assert_eq!(
        std::fs::read(&prepared.source_path).unwrap(),
        b"arbitrary non-image bytes"
    );
}

#[tokio::test]
async fn decode_failure_keeps_original_and_small_images_do_not_grow() {
    let f = tempfile::Builder::new().suffix(".png").tempfile().unwrap();
    std::fs::write(f.path(), b"not an image").unwrap();
    let result = prepare::prepare(
        f.path(),
        &Compression {
            enabled: true,
            threshold: 0.0,
            quality: 70,
        },
    )
    .await
    .unwrap();
    assert_eq!(result.size_bytes, 12);
    assert!(result.name.ends_with(".png"));
}

/// A minimal local service checks real HTTP requests without credentials or external clouds.
async fn server<S: AsRef<str> + Send + 'static>(
    statuses: Vec<S>,
) -> (String, Arc<Mutex<Vec<String>>>, tokio::task::JoinHandle<()>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    let handle = tokio::spawn(async move {
        for response in statuses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buf = [0u8; 8192];
            let (head_end, len) = loop {
                let n = socket.read(&mut buf).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
                if let Some(end) = bytes.windows(4).position(|x| x == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&bytes[..end]);
                    let len = head
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|s| s.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    break (end + 4, len);
                }
            };
            while bytes.len() < head_end + len {
                let n = socket.read(&mut buf).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
            }
            log.lock()
                .unwrap()
                .push(String::from_utf8_lossy(&bytes).into_owned());
            let response: &str = response.as_ref();
            socket.write_all(response.as_bytes()).await.unwrap();
        }
    });
    (format!("http://{addr}"), seen, handle)
}

#[tokio::test]
async fn small_s3_put_streams_any_file_and_emits_progress() {
    let (endpoint, seen, server) = server(vec![
        "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    ])
    .await;
    let file = tempfile::Builder::new()
        .prefix("document")
        .suffix(".pdf")
        .tempfile()
        .unwrap();
    std::fs::write(file.path(), b"pdf-content").unwrap();
    let progress = Arc::new(Mutex::new(Vec::new()));
    let sink = progress.clone();
    let result = upload_file(
        &profile(&endpoint, "s3"),
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
    server.await.unwrap();
    assert_eq!(result.size_bytes, 11);
    assert_eq!(progress.lock().unwrap().last(), Some(&(11, 11)));
    let requests = seen.lock().unwrap();
    assert!(requests[0].starts_with("PUT /bucket/files/"));
    assert!(requests[0].ends_with("pdf-content"));
    assert!(
        requests[0]
            .to_lowercase()
            .contains("authorization: aws4-hmac-sha256")
    );
}

#[tokio::test]
async fn qiniu_small_form_includes_key_token_and_file() {
    let (endpoint, seen, server) = server(vec![
        "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
    ])
    .await;
    let file = tempfile::Builder::new().suffix(".txt").tempfile().unwrap();
    std::fs::write(file.path(), b"hello").unwrap();
    upload_file(
        &profile(&endpoint, "qiniu"),
        &Compression {
            enabled: false,
            threshold: 1.0,
            quality: 70,
        },
        "保持原文件名",
        file.path(),
        |_, _| {},
    )
    .await
    .unwrap();
    server.await.unwrap();
    let requests = seen.lock().unwrap();
    assert!(requests[0].contains("name=\"token\""));
    assert!(requests[0].contains("name=\"key\""));
    assert!(requests[0].contains("name=\"file\""));
    assert!(requests[0].contains("hello"));
}

#[tokio::test]
async fn redirects_and_cloud_errors_are_not_followed_or_exposed() {
    let (endpoint,_,server)=server(vec!["HTTP/1.1 302 Found\r\nLocation: https://secret.example.com/token\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"]).await;
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), b"data").unwrap();
    let result = upload_file(
        &profile(&endpoint, "s3"),
        &Compression {
            enabled: false,
            threshold: 1.0,
            quality: 70,
        },
        "保持原文件名",
        file.path(),
        |_, _| {},
    )
    .await
    .err()
    .unwrap();
    server.await.unwrap();
    assert!(result.contains("302"));
    assert!(!result.contains("secret.example"));
}

pub(super) fn response(status: &str, body: &str, headers: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}",
        body.len()
    )
}

#[tokio::test]
async fn s3_multipart_orders_parts_and_confirms_the_merge_body() {
    let created = "<InitiateMultipartUploadResult><UploadId>id=&amp;test</UploadId></InitiateMultipartUploadResult>";
    let (endpoint, seen, service) = server(vec![
        response("200 OK", created, ""),
        response("200 OK", "", "ETag: \"part-a\"\r\n"),
        response("200 OK", "", "ETag: \"part-b\"\r\n"),
        response("200 OK", "", "ETag: \"part-c\"\r\n"),
        response(
            "200 OK",
            "<CompleteMultipartUploadResult><Key>test</Key></CompleteMultipartUploadResult>",
            "",
        ),
    ])
    .await;
    let file = tempfile::Builder::new().suffix(".zip").tempfile().unwrap();
    file.as_file().set_len(10 * 1024 * 1024 + 1).unwrap();
    let result = upload_file(
        &profile(&endpoint, "s3"),
        &Compression {
            enabled: false,
            threshold: 1.0,
            quality: 70,
        },
        "保持原文件名",
        file.path(),
        |_, _| {},
    )
    .await;
    service.await.unwrap();
    assert!(result.is_ok());
    let requests = seen.lock().unwrap();
    assert!(requests[0].starts_with("POST /bucket/files/"));
    assert!(requests[0].contains("?uploads="));
    assert!(requests[4].contains("?uploadId=id%3D%26test"));
    let complete = &requests[4];
    assert!(complete.contains("<PartNumber>1</PartNumber>"));
    assert!(complete.find("<PartNumber>1").unwrap() < complete.find("<PartNumber>3").unwrap());
}

#[tokio::test]
async fn s3_multipart_aborts_when_a_part_fails_and_waits_for_all_inflight_parts() {
    let created = "<InitiateMultipartUploadResult><UploadId>abort-me</UploadId></InitiateMultipartUploadResult>";
    let (endpoint, seen, service) = server(vec![
        response("200 OK", created, ""),
        response("403 Forbidden", "secret token leaked upstream", ""),
        response("200 OK", "", "ETag: part-b\r\n"),
        response("200 OK", "", "ETag: part-c\r\n"),
        response("204 No Content", "", ""),
    ])
    .await;
    let file = tempfile::NamedTempFile::new().unwrap();
    file.as_file().set_len(10 * 1024 * 1024 + 1).unwrap();
    let result = upload_file(
        &profile(&endpoint, "r2"),
        &Compression {
            enabled: false,
            threshold: 1.0,
            quality: 70,
        },
        "保持原文件名",
        file.path(),
        |_, _| {},
    )
    .await
    .err()
    .unwrap();
    service.await.unwrap();
    let requests = seen.lock().unwrap();
    assert!(result.contains("403"));
    assert!(!result.contains("secret"));
    assert!(requests[4].starts_with("DELETE "));
    assert!(requests[4].contains("uploadId=abort-me"));
}

#[tokio::test]
async fn s3_multipart_does_not_treat_http_200_error_as_success() {
    let created = "<InitiateMultipartUploadResult><UploadId>bad-merge</UploadId></InitiateMultipartUploadResult>";
    let (endpoint, seen, service) = server(vec![
        response("200 OK", created, ""),
        response("200 OK", "", "ETag: a\r\n"),
        response("200 OK", "", "ETag: b\r\n"),
        response("200 OK", "", "ETag: c\r\n"),
        response("200 OK", "<Error><Code>InternalError</Code></Error>", ""),
        response("204 No Content", "", ""),
    ])
    .await;
    let file = tempfile::NamedTempFile::new().unwrap();
    file.as_file().set_len(10 * 1024 * 1024 + 1).unwrap();
    let result = upload_file(
        &profile(&endpoint, "oss"),
        &Compression {
            enabled: false,
            threshold: 1.0,
            quality: 70,
        },
        "保持原文件名",
        file.path(),
        |_, _| {},
    )
    .await;
    service.await.unwrap();
    assert!(result.is_err());
    assert!(seen.lock().unwrap()[5].starts_with("DELETE "));
}

#[tokio::test]
async fn qiniu_large_upload_uses_text_contexts_and_padded_base64_key() {
    let (endpoint, seen, service) = server(vec![
        response("200 OK", "{\"ctx\":\"one\"}", ""),
        response("200 OK", "{\"ctx\":\"two\"}", ""),
        response("200 OK", "{\"ctx\":\"three\"}", ""),
        response("200 OK", "{}", ""),
    ])
    .await;
    let file = tempfile::Builder::new().suffix(".zip").tempfile().unwrap();
    file.as_file().set_len(10 * 1024 * 1024 + 1).unwrap();
    let result = upload_file(
        &profile(&endpoint, "qiniu"),
        &Compression {
            enabled: false,
            threshold: 1.0,
            quality: 70,
        },
        "保持原文件名",
        file.path(),
        |_, _| {},
    )
    .await
    .unwrap();
    service.await.unwrap();
    let requests = seen.lock().unwrap();
    for req in &requests[..3] {
        assert!(req.starts_with("POST /mkblk/"));
        assert!(
            req.to_lowercase()
                .contains("authorization: uptoken access:")
        );
    }
    let finalize = &requests[3];
    use base64::Engine;
    assert!(finalize.contains(&format!(
        "/mkfile/{}/key/{}",
        10 * 1024 * 1024 + 1,
        base64::engine::general_purpose::URL_SAFE.encode(result.object_key)
    )));
    assert!(finalize.to_lowercase().contains("content-type: text/plain"));
    // This sequential test service assigns contexts by TCP arrival order, which
    // does not identify file offsets. The range-marked concurrent service in
    // multipart_tests separately verifies exact original-file context ordering.
    let mut contexts: Vec<_> = finalize
        .split("\r\n\r\n")
        .nth(1)
        .unwrap()
        .split(',')
        .collect();
    contexts.sort_unstable();
    assert_eq!(contexts, ["one", "three", "two"]);
}

#[tokio::test]
async fn compresses_only_when_jpeg_is_smaller_and_caches_final_jpeg_bytes() {
    let file = tempfile::Builder::new().suffix(".bmp").tempfile().unwrap();
    let image = image::RgbImage::from_pixel(256, 256, image::Rgb([100, 140, 210]));
    image
        .save_with_format(file.path(), image::ImageFormat::Bmp)
        .unwrap();
    let original = std::fs::metadata(file.path()).unwrap().len();
    let result = prepare::prepare(
        file.path(),
        &Compression {
            enabled: true,
            threshold: 0.0,
            quality: 70,
        },
    )
    .await
    .unwrap();
    assert!(result.size_bytes < original);
    assert!(result.name.ends_with(".jpg"));
    assert_eq!(result.content_type, "image/jpeg");
    assert!(
        std::fs::read(&result.source_path)
            .unwrap()
            .starts_with(&[0xff, 0xd8])
    );
    let small = tempfile::Builder::new().suffix(".png").tempfile().unwrap();
    image::RgbImage::from_pixel(1, 1, image::Rgb([255, 0, 0]))
        .save_with_format(small.path(), image::ImageFormat::Png)
        .unwrap();
    let prepared = prepare::prepare(
        small.path(),
        &Compression {
            enabled: true,
            threshold: 0.0,
            quality: 70,
        },
    )
    .await
    .unwrap();
    assert!(prepared.name.ends_with(".png"));
    assert_eq!(
        std::fs::read(prepared.source_path).unwrap(),
        std::fs::read(small.path()).unwrap()
    );
}
