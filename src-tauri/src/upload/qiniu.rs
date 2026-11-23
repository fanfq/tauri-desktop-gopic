//! Qiniu v1 block upload is deliberately independent of S3 multipart semantics.
use super::{
    MULTIPART_THRESHOLD, Progress, checked, multipart_progress, naming, network_error,
    prepare::Prepared, response_text, signing, streaming_body, streaming_range_body,
};
use crate::models::Profile;
use base64::{Engine, engine::general_purpose::URL_SAFE};
use futures_util::{StreamExt, stream::FuturesUnordered};
use reqwest::{
    Client,
    multipart::{Form, Part},
};

const BLOCK_SIZE: u64 = 4 * 1024 * 1024;
const CONCURRENCY: usize = 4;

pub(super) async fn upload(
    client: &Client,
    profile: &Profile,
    file: &Prepared,
    key: &str,
    progress: Progress,
) -> Result<String, String> {
    let endpoint = naming::endpoint(&profile.endpoint)?;
    let token = signing::qiniu_token(profile, key, chrono::Utc::now().timestamp() + 3600)?;
    if file.size_bytes > MULTIPART_THRESHOLD {
        let progress = multipart_progress(file.size_bytes, progress);
        let mut in_flight = FuturesUnordered::new();
        let mut offset = 0u64;
        let mut contexts = Vec::new();
        let mut error = None;
        loop {
            // Keep four range streams active, replacing whichever finishes first.
            // Failed uploads drain the remaining requests but never start new ones.
            while error.is_none() && in_flight.len() < CONCURRENCY && offset < file.size_bytes {
                let length = BLOCK_SIZE.min(file.size_bytes - offset);
                let start = offset;
                let mut block = endpoint.clone();
                block.set_path(&format!(
                    "{}/mkblk/{length}",
                    endpoint.path().trim_end_matches('/')
                ));
                let token = &token;
                let progress = progress.clone();
                in_flight.push(async move {
                    let body =
                        streaming_range_body(&file.source_path, start, length, progress).await?;
                    let response = client
                        .post(block)
                        .header("Authorization", format!("UpToken {token}"))
                        .header("Content-Type", "application/octet-stream")
                        .header("Content-Length", length)
                        .body(body)
                        .send()
                        .await
                        .map_err(network_error)?;
                    let body = response_text(checked(response, "七牛分块上传").await?).await?;
                    let json: serde_json::Value =
                        serde_json::from_str(&body).map_err(|_| "七牛分块响应格式无效")?;
                    let ctx = json
                        .get("ctx")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(str::to_string)
                        .ok_or_else(|| "七牛分块响应缺少 ctx".to_string())?;
                    Ok::<_, String>((start, ctx))
                });
                offset += length;
            }
            match in_flight.next().await {
                Some(Ok(ctx)) => contexts.push(ctx),
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
        // Qiniu requires ctx entries in original file order, not completion order.
        contexts.sort_by_key(|(offset, _)| *offset);
        let mut finalize = endpoint.clone();
        finalize.set_path(&format!(
            "{}/mkfile/{}/key/{}",
            endpoint.path().trim_end_matches('/'),
            file.size_bytes,
            URL_SAFE.encode(key.as_bytes())
        ));
        let response = client
            .post(finalize)
            .header("Authorization", format!("UpToken {token}"))
            .header("Content-Type", "text/plain")
            .body(
                contexts
                    .into_iter()
                    .map(|(_, ctx)| ctx)
                    .collect::<Vec<_>>()
                    .join(","),
            )
            .send()
            .await
            .map_err(network_error)?;
        let body = response_text(checked(response, "七牛合并分块").await?).await?;
        let json: serde_json::Value =
            serde_json::from_str(&body).map_err(|_| "七牛合并响应格式无效")?;
        if !json.is_object() || json.get("error").is_some() {
            return Err("七牛合并分块失败".into());
        }
    } else {
        let body = streaming_body(&file.source_path, file.size_bytes, progress).await?;
        let part = Part::stream_with_length(body, file.size_bytes)
            .file_name(file.name.clone())
            .mime_str(&file.content_type)
            .map_err(|_| "文件媒体类型无效")?;
        let form = Form::new()
            .text("key", key.to_string())
            .text("token", token)
            .part("file", part);
        let response = client
            .post(endpoint)
            .multipart(form)
            .send()
            .await
            .map_err(network_error)?;
        let body = response_text(checked(response, "七牛上传").await?).await?;
        let json: serde_json::Value =
            serde_json::from_str(&body).map_err(|_| "七牛上传响应格式无效")?;
        if !json.is_object() || json.get("error").is_some() {
            return Err("七牛上传失败".into());
        }
    }
    naming::public_url(profile, key, None)
}
