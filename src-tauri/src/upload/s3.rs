//! S3-compatible PUT and multipart lifecycle. Failed multipart sessions are aborted.
use super::{
    MULTIPART_THRESHOLD, Progress, checked, multipart_progress, naming, network_error,
    prepare::Prepared, response_text, signing, streaming_body, streaming_range_body,
};
use crate::models::Profile;
use futures_util::{StreamExt, stream::FuturesUnordered};
use reqwest::{Client, Method, Response};
use url::Url;

const PART_SIZE: u64 = 5 * 1024 * 1024;
const CONCURRENCY: usize = 4;

pub(super) async fn upload(
    client: &Client,
    profile: &Profile,
    file: &Prepared,
    key: &str,
    progress: Progress,
) -> Result<String, String> {
    let url = naming::object_url(profile, key)?;
    if file.size_bytes > MULTIPART_THRESHOLD {
        multipart(client, profile, file, &url, progress).await?;
    } else {
        let body = streaming_body(&file.source_path, file.size_bytes, progress).await?;
        let headers = headers(profile, "PUT", &url, file.size_bytes, &file.content_type)?;
        let response = client
            .put(url.clone())
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(network_error)?;
        checked(response, "S3 上传").await?;
    }
    naming::public_url(profile, key, Some(&url))
}

fn headers(
    profile: &Profile,
    method: &str,
    url: &Url,
    length: u64,
    content_type: &str,
) -> Result<reqwest::header::HeaderMap, String> {
    signing::s3_headers(
        profile,
        method,
        url,
        length,
        content_type,
        &chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string(),
    )
}
async fn request(
    client: &Client,
    profile: &Profile,
    method: Method,
    url: Url,
    bytes: Vec<u8>,
    content_type: &str,
) -> Result<Response, String> {
    let headers = headers(
        profile,
        method.as_str(),
        &url,
        bytes.len() as u64,
        content_type,
    )?;
    client
        .request(method, url)
        .headers(headers)
        .body(bytes)
        .send()
        .await
        .map_err(network_error)
}

async fn multipart(
    client: &Client,
    profile: &Profile,
    file: &Prepared,
    url: &Url,
    progress: Progress,
) -> Result<(), String> {
    // S3 permits at most 10,000 parts. Grow part size for large arbitrary files,
    // while keeping only four small streaming buffers resident at once.
    let part_size =
        PART_SIZE.max(file.size_bytes.div_ceil(10_000).div_ceil(1024 * 1024) * 1024 * 1024);
    if part_size > 64 * 1024 * 1024 {
        return Err("文件过大：当前支持最大 625 GiB 的 S3 文件".into());
    }
    let mut create_url = url.clone();
    create_url.query_pairs_mut().append_pair("uploads", "");
    let response = request(
        client,
        profile,
        Method::POST,
        create_url,
        Vec::new(),
        &file.content_type,
    )
    .await?;
    let body = response_text(checked(response, "S3 创建分片上传").await?).await?;
    #[derive(serde::Deserialize)]
    struct Initiated {
        #[serde(rename = "UploadId")]
        upload_id: String,
    }
    let created: Initiated =
        quick_xml::de::from_str(&body).map_err(|_| "S3 分片响应缺少有效 UploadId".to_string())?;
    if created.upload_id.trim().is_empty() {
        return Err("S3 分片响应缺少 UploadId".into());
    }
    let upload_id = created.upload_id;
    let result = transfer_parts(client, profile, file, url, &upload_id, part_size, progress).await;
    if result.is_err() {
        let mut abort = url.clone();
        abort.query_pairs_mut().append_pair("uploadId", &upload_id);
        // Wait for in-flight requests before aborting so no late part recreates storage.
        let _ = request(client, profile, Method::DELETE, abort, Vec::new(), "").await;
    }
    result
}

async fn transfer_parts(
    client: &Client,
    profile: &Profile,
    file: &Prepared,
    url: &Url,
    upload_id: &str,
    part_size: u64,
    progress: Progress,
) -> Result<(), String> {
    let progress = multipart_progress(file.size_bytes, progress);
    let mut in_flight = FuturesUnordered::new();
    let mut offset = 0u64;
    let mut number = 1u64;
    let mut parts = Vec::new();
    let mut error = None;
    loop {
        // Refill immediately after any completion; a slow first part never blocks
        // unrelated ranges. After failure, drain existing requests before abort.
        while error.is_none() && in_flight.len() < CONCURRENCY && offset < file.size_bytes {
            let length = part_size.min(file.size_bytes - offset);
            let mut part_url = url.clone();
            part_url
                .query_pairs_mut()
                .append_pair("partNumber", &number.to_string())
                .append_pair("uploadId", upload_id);
            let part_number = number;
            let start = offset;
            let progress = progress.clone();
            in_flight.push(async move {
                let body = streaming_range_body(&file.source_path, start, length, progress).await?;
                let headers = headers(profile, "PUT", &part_url, length, &file.content_type)?;
                let response = client
                    .put(part_url)
                    .headers(headers)
                    .body(body)
                    .send()
                    .await
                    .map_err(network_error)?;
                let response = checked(response, "S3 上传分片").await?;
                let etag = response
                    .headers()
                    .get("etag")
                    .and_then(|v| v.to_str().ok())
                    .filter(|s| !s.is_empty())
                    .ok_or("S3 分片响应缺少 ETag")?
                    .to_string();
                Ok::<_, String>((part_number, etag))
            });
            offset += length;
            number += 1;
        }
        match in_flight.next().await {
            Some(Ok(part)) => parts.push(part),
            Some(Err(e)) => {
                if error.is_none() {
                    error = Some(e);
                }
            }
            None => break,
        }
    }
    if let Some(error) = error {
        return Err(error);
    }
    parts.sort_by_key(|(number, _)| *number);
    let xml = format!(
        "<CompleteMultipartUpload>{}</CompleteMultipartUpload>",
        parts
            .iter()
            .map(|(n, tag)| format!(
                "<Part><PartNumber>{n}</PartNumber><ETag>{}</ETag></Part>",
                quick_xml::escape::escape(tag)
            ))
            .collect::<String>()
    );
    let mut complete = url.clone();
    complete
        .query_pairs_mut()
        .append_pair("uploadId", upload_id);
    let response = request(
        client,
        profile,
        Method::POST,
        complete,
        xml.into_bytes(),
        "application/xml",
    )
    .await?;
    let body = response_text(checked(response, "S3 合并分片").await?).await?;
    // CompleteMultipartUpload may return an embedded error after a 200 response.
    let mut reader = quick_xml::Reader::from_str(&body);
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Start(e)) | Ok(quick_xml::events::Event::Empty(e)) => {
                return if e.local_name().as_ref() == b"CompleteMultipartUploadResult" {
                    Ok(())
                } else {
                    Err("S3 分片合并未确认成功".into())
                };
            }
            Ok(quick_xml::events::Event::Eof) | Err(_) => return Err("S3 分片合并响应无效".into()),
            _ => {}
        }
    }
}
