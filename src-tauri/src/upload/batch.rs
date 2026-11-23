//! 窗口与托盘共享的文件调度；协议上传、缩略图、缓存提交彼此独立。
use super::{UploadedFile, thumbnail, upload_file};
use crate::models::{BatchResult, Compression, FileRecord, Profile, UploadProgress};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};
use tokio::sync::Semaphore;

pub const FILE_CONCURRENCY: usize = 4;

/// 进程级许可限制所有批次合计占用，防止窗口与托盘各自再启动四份文件准备任务。
#[derive(Clone)]
pub struct UploadScheduler {
    files: Arc<Semaphore>,
    thumbnails: Arc<Semaphore>,
    commits: Arc<Mutex<()>>,
}
impl Default for UploadScheduler {
    fn default() -> Self {
        Self {
            files: Arc::new(Semaphore::new(FILE_CONCURRENCY)),
            thumbnails: Arc::new(Semaphore::new(2)),
            commits: Arc::new(Mutex::new(())),
        }
    }
}
pub struct BatchConfig {
    pub profile: Profile,
    pub compression: Compression,
    pub naming: String,
    pub batch_id: String,
}
type Emit = Arc<dyn Fn(UploadProgress) + Send + Sync>;
type Commit = Arc<dyn Fn(UploadedFile) -> Result<FileRecord, String> + Send + Sync>;

pub async fn run(
    paths: Vec<String>,
    config: BatchConfig,
    scheduler: UploadScheduler,
    emit: impl Fn(UploadProgress) + Send + Sync + 'static,
    commit: impl Fn(UploadedFile) -> Result<FileRecord, String> + Send + Sync + 'static,
) -> BatchResult {
    let emit: Emit = Arc::new(emit);
    let commit: Commit = Arc::new(commit);
    let config = Arc::new(config);
    // 同步注册整批队列，保证前端在第一个文件完成前就能显示全部任务。
    let queued: Vec<_> = paths
        .into_iter()
        .enumerate()
        .map(|(index, path)| {
            let base = UploadProgress {
                task_id: format!("{}:{index}", config.batch_id),
                name: PathBuf::from(&path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("未命名文件")
                    .to_string(),
                path,
                profile_id: config.profile.id.clone(),
                status: "queued".into(),
                progress: 0.0,
                bytes_per_second: None,
                error: None,
                url: None,
                record_id: None,
                thumbnail: None,
            };
            emit(base.clone());
            base
        })
        .collect();
    // 每个文件拥有独立异步任务；共享许可限制真实并发，并避免某个慢文件阻塞其他文件的完成事件。
    let jobs = queued.into_iter().map(|base| {
        let config = config.clone();
        let scheduler = scheduler.clone();
        let emit = emit.clone();
        let commit = commit.clone();
        let mut panic_event = base.clone();
        let handle = tokio::spawn(run_one(base, config, scheduler, emit.clone(), commit));
        async move {
            match handle.await {
                Ok(result) => result,
                Err(_) => {
                    panic_event.status = "error".into();
                    panic_event.error = Some("文件上传任务异常结束".into());
                    emit(panic_event);
                    Err("文件上传任务异常结束".into())
                }
            }
        }
    });
    // join_all 按输入顺序收集结果；每个任务已自行即时发出完成事件。
    let completed = futures_util::future::join_all(jobs).await;
    let mut records = Vec::new();
    let mut failed = 0;
    for result in completed {
        match result {
            Ok(record) => records.push(record),
            Err(_) => failed += 1,
        }
    }
    BatchResult { records, failed }
}

async fn run_one(
    mut event: UploadProgress,
    config: Arc<BatchConfig>,
    scheduler: UploadScheduler,
    emit: Emit,
    commit: Commit,
) -> Result<FileRecord, String> {
    let path = PathBuf::from(&event.path);
    let result = async {
        {
            let _permit = scheduler
                .thumbnails
                .acquire()
                .await
                .map_err(|_| "缩略图队列已关闭")?;
            event.thumbnail = thumbnail::create(&path).await;
        }
        if event.thumbnail.is_some() {
            emit(event.clone());
        }
        let _permit = scheduler
            .files
            .acquire()
            .await
            .map_err(|_| "上传队列已关闭")?;
        event.status = "uploading".into();
        emit(event.clone());
        let started = Instant::now();
        let last = Arc::new(Mutex::new(Instant::now()));
        let base = event.clone();
        let progress_emit = emit.clone();
        let uploaded = upload_file(
            &config.profile,
            &config.compression,
            &config.naming,
            &path,
            move |sent, total| {
                if let Ok(mut previous) = last.lock() {
                    if previous.elapsed().as_millis() < 250 && sent != total {
                        return;
                    }
                    *previous = Instant::now();
                    let mut progress = base.clone();
                    progress.progress = if total > 0 {
                        (sent as f64 / total as f64 * 100.0).min(99.9)
                    } else {
                        0.0
                    };
                    let elapsed = started.elapsed().as_secs_f64();
                    progress.bytes_per_second = (elapsed >= 0.25).then_some(sent as f64 / elapsed);
                    progress_emit(progress);
                }
            },
        )
        .await?;
        // 文件快照随 UploadedFile 移入阻塞线程，直到缓存复制与记录事务结束才释放。
        let commits = scheduler.commits.clone();
        tokio::task::spawn_blocking(move || {
            // 全批次共用此锁，缓存事务和托盘最近记录发布必须保持同一顺序。
            let _guard = commits
                .lock()
                .map_err(|_| "上传记录提交锁异常".to_string())?;
            commit(uploaded)
        })
        .await
        .map_err(|_| "本地缓存提交任务失败".to_string())?
    }
    .await;
    match &result {
        Ok(record) => {
            event.status = "done".into();
            event.progress = 100.0;
            event.url = Some(record.url.clone());
            event.record_id = Some(record.id.clone());
        }
        Err(error) => {
            event.status = "error".into();
            event.error = Some(error.clone());
        }
    }
    emit(event);
    result
}
#[cfg(test)]
mod tests;
