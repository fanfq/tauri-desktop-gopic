//! Upload orchestration. Transports know nothing about history or application state.
pub mod batch;
mod naming;
mod prepare;
mod qiniu;
mod s3;
mod signing;
mod thumbnail;

use crate::models::{Compression, Profile};
use reqwest::{Body, Client, Response};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tempfile::TempPath;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

pub struct UploadedFile {
    pub name: String,
    pub content_type: String,
    pub object_key: String,
    pub url: String,
    /// Points at an immutable upload snapshot, never at a changing user file.
    pub source_path: PathBuf,
    /// Keeps the snapshot alive until history/cache recording has completed.
    pub temporary: Option<TempPath>,
    pub size_bytes: u64,
}

type Progress = Arc<dyn Fn(u64, u64) + Send + Sync>;
const MULTIPART_THRESHOLD: u64 = 10 * 1024 * 1024;

pub async fn upload_file(
    profile: &Profile,
    compression: &Compression,
    pattern: &str,
    path: &Path,
    progress: impl Fn(u64, u64) + Send + Sync + 'static,
) -> Result<UploadedFile, String> {
    validate(profile)?;
    let prepared = prepare::prepare(path, compression).await?;
    let uuid = uuid::Uuid::new_v4().simple().to_string();
    let name = naming::object_name(
        pattern,
        &prepared.name,
        &chrono::Local::now().format("%Y%m%d").to_string(),
        &uuid[..6],
        &uuid,
    );
    let key = naming::object_key(&profile.prefix, &name)?;
    let progress: Progress = Arc::new(progress);
    progress(0, prepared.size_bytes);
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(30 * 60))
        .build()
        .map_err(|_| "无法初始化网络客户端".to_string())?;
    let url = if profile.provider == "qiniu" {
        qiniu::upload(&client, profile, &prepared, &key, progress.clone()).await?
    } else {
        s3::upload(&client, profile, &prepared, &key, progress.clone()).await?
    };
    progress(prepared.size_bytes, prepared.size_bytes);
    Ok(UploadedFile {
        name: prepared.name,
        content_type: prepared.content_type,
        object_key: key,
        url,
        source_path: prepared.source_path,
        temporary: prepared.temporary,
        size_bytes: prepared.size_bytes,
    })
}

fn validate(profile: &Profile) -> Result<(), String> {
    if !profile.enabled {
        return Err("云服务配置未启用".into());
    }
    if !["r2", "s3", "qiniu", "cos", "oss"].contains(&profile.provider.as_str()) {
        return Err("不支持的云服务类型".into());
    }
    if [
        &profile.access,
        &profile.secret,
        &profile.bucket,
        &profile.endpoint,
    ]
    .iter()
    .any(|v| v.trim().is_empty())
    {
        return Err("云服务配置不完整，请检查凭证、Bucket 和访问地址".into());
    }
    naming::endpoint(&profile.endpoint)?;
    if profile.provider == "qiniu" && profile.domain.trim().is_empty() {
        return Err("七牛云需要填写公网 URL 前缀".into());
    }
    if !profile.domain.trim().is_empty() {
        naming::endpoint(&profile.domain)?;
    }
    Ok(())
}

/// Read the snapshot in bounded chunks; the callback never contains secrets or paths.
async fn streaming_body(path: &Path, total: u64, progress: Progress) -> Result<Body, String> {
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|_| "无法读取上传快照".to_string())?;
    let stream = futures_util::stream::try_unfold((file, 0u64), move |(mut file, sent)| {
        let progress = progress.clone();
        async move {
            let mut bytes = vec![0u8; 64 * 1024];
            let count = file.read(&mut bytes).await?;
            if count == 0 {
                return Ok::<_, std::io::Error>(None);
            }
            bytes.truncate(count);
            let sent = sent + count as u64;
            progress(sent, total);
            Ok(Some((bytes, (file, sent))))
        }
    });
    Ok(Body::wrap_stream(stream))
}

/// Aggregate byte deltas while holding the callback lock so concurrent parts cannot
/// publish progress out of order. Each range contributes at most its own length.
fn multipart_progress(total: u64, progress: Progress) -> Progress {
    let sent = Mutex::new(0u64);
    Arc::new(move |delta, _| {
        let mut sent = sent.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        *sent = sent.saturating_add(delta).min(total);
        progress(*sent, total);
    })
}

/// Stream only the selected immutable snapshot range in 64 KiB chunks. Unlike a
/// full-part buffer, memory use stays bounded even when S3 increases part size.
/// The callback receives byte deltas for the shared multipart progress counter.
async fn streaming_range_body(
    path: &Path,
    offset: u64,
    length: u64,
    progress: Progress,
) -> Result<Body, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|_| "无法读取上传快照".to_string())?;
    file.seek(std::io::SeekFrom::Start(offset))
        .await
        .map_err(|_| "无法定位上传分片".to_string())?;
    let stream = futures_util::stream::try_unfold((file, length), move |(mut file, remaining)| {
        let progress = progress.clone();
        async move {
            if remaining == 0 {
                return Ok::<_, std::io::Error>(None);
            }
            let mut bytes = vec![0u8; remaining.min(64 * 1024) as usize];
            let count = file.read(&mut bytes).await?;
            if count == 0 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "上传快照长度不足",
                ));
            }
            bytes.truncate(count);
            progress(count as u64, length);
            Ok(Some((bytes, (file, remaining - count as u64))))
        }
    });
    Ok(Body::wrap_stream(stream))
}

/// Error bodies may contain credentials/object names, so only return status and stage.
async fn checked(response: Response, stage: &str) -> Result<Response, String> {
    if !response.status().is_success() {
        return Err(format!("{stage}失败 (HTTP {})", response.status().as_u16()));
    }
    Ok(response)
}
async fn response_text(mut response: Response) -> Result<String, String> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "无法读取云服务响应".to_string())?
    {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err("云服务响应过大".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "云服务响应编码无效".into())
}
fn network_error(_: reqwest::Error) -> String {
    "网络请求失败，请检查连接和云服务地址".into()
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod multipart_tests;
