//! 本地配置/历史事务与缓存生命周期。所有缓存访问必须经过内部目录约束。
use crate::models::*;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub struct Store {
    root: PathBuf,
    state: Mutex<Persisted>,
    cache_lock: Mutex<()>,
}
impl Store {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("cache")).map_err(|_| "无法创建应用数据目录".to_string())?;
        let root = root
            .canonicalize()
            .map_err(|_| "无法读取应用数据目录".to_string())?;
        let file = root.join("state.json");
        let mut state = if file.exists() {
            serde_json::from_slice::<Persisted>(
                &fs::read(file).map_err(|_| "无法读取本地数据".to_string())?,
            )
            .map_err(|_| "本地数据格式损坏，已保留原文件，请备份后处理".to_string())?
        } else {
            Persisted::default()
        };
        if state.version != 1 {
            return Err("不支持的本地数据版本".into());
        }
        state.settings.validate()?;
        // 历史路径只允许指向当前缓存根，跨安装路径或手工篡改不会扩大文件访问范围。
        for record in &mut state.files {
            if record
                .cache_path
                .as_ref()
                .is_some_and(|p| !valid_cache_path(&root.join("cache"), Path::new(p)))
            {
                record.cache_path = None;
            }
            record.src.clear();
        }
        Ok(Self {
            root,
            state: Mutex::new(state),
            cache_lock: Mutex::new(()),
        })
    }
    pub fn data(&self) -> Result<Persisted, String> {
        Ok(self
            .state
            .lock()
            .map_err(|_| "本地数据锁异常".to_string())?
            .clone())
    }
    /// 先落盘，再替换内存；磁盘空间不足时保留上一份完整数据。
    fn transaction<T>(
        &self,
        apply: impl FnOnce(&mut Persisted) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .state
            .lock()
            .map_err(|_| "本地数据锁异常".to_string())?;
        let mut staged = guard.clone();
        let result = apply(&mut staged)?;
        let bytes =
            serde_json::to_vec_pretty(&staged).map_err(|_| "无法序列化本地数据".to_string())?;
        atomic_write(&self.root.join("state.json"), &bytes)?;
        *guard = staged;
        Ok(result)
    }
    pub fn save_settings(&self, settings: Settings) -> Result<Settings, String> {
        settings.validate()?;
        self.transaction(|data| {
            data.settings = settings.clone();
            Ok(settings)
        })
    }
    pub fn cache_dir(&self) -> PathBuf {
        self.root.join("cache")
    }
    pub fn cache_summary(&self) -> Result<CacheSummary, String> {
        let mut summary = CacheSummary {
            file_count: 0,
            total_bytes: 0,
            directory_path: self.cache_dir().to_string_lossy().into_owned(),
        };
        for entry in fs::read_dir(self.cache_dir()).map_err(|_| "无法统计缓存".to_string())? {
            let entry = entry.map_err(|_| "无法统计缓存".to_string())?;
            let meta = entry
                .path()
                .symlink_metadata()
                .map_err(|_| "无法统计缓存".to_string())?;
            if meta.is_file() && !entry.file_name().to_string_lossy().starts_with('.') {
                summary.file_count += 1;
                summary.total_bytes += meta.len();
            }
        }
        Ok(summary)
    }
    pub fn add_upload(
        &self,
        profile_id: &str,
        name: &str,
        content_type: &str,
        url: &str,
        source: &Path,
    ) -> Result<FileRecord, String> {
        // 到此调用方已确认云端成功；本地提交失败不能让用户误以为需要重传。
        self.add_upload_inner(profile_id, name, content_type, url, source)
            .map_err(|error| format!("云端上传已成功，但本地保存失败：{error}"))
    }
    fn add_upload_inner(
        &self,
        profile_id: &str,
        name: &str,
        content_type: &str,
        url: &str,
        source: &Path,
    ) -> Result<FileRecord, String> {
        let _cache_guard = self
            .cache_lock
            .lock()
            .map_err(|_| "缓存操作锁异常".to_string())?;
        let id = uuid::Uuid::new_v4().to_string();
        let extension = Path::new(name)
            .extension()
            .and_then(|x| x.to_str())
            .filter(|x| x.len() <= 12 && x.chars().all(|c| c.is_ascii_alphanumeric()));
        let cache = self.cache_dir().join(match extension {
            Some(ext) => format!("{id}.{ext}"),
            None => id.clone(),
        });
        let pending = self.cache_dir().join(".pending");
        fs::create_dir_all(&pending).map_err(|_| "无法创建缓存临时目录".to_string())?;
        let temp = pending.join(format!("{id}.tmp"));
        if fs::copy(source, &temp).is_err() {
            let _ = fs::remove_file(&temp);
            return Err("复制本地缓存失败".into());
        }
        let size_bytes = match fs::metadata(&temp) {
            Ok(metadata) => metadata.len(),
            Err(_) => {
                let _ = fs::remove_file(&temp);
                return Err("无法读取缓存大小".into());
            }
        };
        if let Err(_) = fs::rename(&temp, &cache) {
            let _ = fs::remove_file(temp);
            return Err("保存本地缓存失败".into());
        }
        let item = FileRecord {
            id,
            profile_id: profile_id.into(),
            name: name.into(),
            size: format_bytes(size_bytes),
            size_bytes,
            date: chrono::Local::now().format("%Y-%m-%d %H:%M").to_string(),
            content_type: content_type.into(),
            url: url.into(),
            cache_path: Some(cache.to_string_lossy().into_owned()),
            src: String::new(),
        };
        let result = self.transaction(|data| {
            data.files.insert(0, item.clone());
            Ok(item)
        });
        if result.is_err() {
            let _ = fs::remove_file(cache);
        }
        result
    }
    pub fn cache_path(&self, record_id: &str) -> Result<PathBuf, String> {
        let record = self
            .data()?
            .files
            .into_iter()
            .find(|x| x.id == record_id)
            .ok_or("文件记录不存在")?;
        let path = PathBuf::from(record.cache_path.ok_or("此文件没有本地缓存")?);
        if !valid_cache_path(&self.cache_dir(), &path) || !path.is_file() {
            return Err("本地缓存文件不存在，请重新上传".into());
        }
        Ok(path)
    }
    pub fn delete_records(&self, profile_id: &str, ids: &[String]) -> Result<(), String> {
        let _cache_guard = self
            .cache_lock
            .lock()
            .map_err(|_| "缓存操作锁异常".to_string())?;
        let ids: HashSet<_> = ids.iter().collect();
        let paths = self.transaction(|data| {
            let paths: Vec<_> = data
                .files
                .iter()
                .filter(|f| f.profile_id == profile_id && ids.contains(&f.id))
                .filter_map(|f| f.cache_path.clone())
                .collect();
            data.files
                .retain(|f| f.profile_id != profile_id || !ids.contains(&f.id));
            Ok(paths)
        })?;
        for path in paths {
            if valid_cache_path(&self.cache_dir(), Path::new(&path)) {
                match fs::remove_file(path) {
                    Ok(_) => (),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                    Err(_) => {
                        return Err("记录已删除，但部分缓存清理失败，可在配置中清理缓存".into());
                    }
                }
            }
        }
        Ok(())
    }
    pub fn clear_history(&self) -> Result<(), String> {
        self.transaction(|data| {
            data.files.clear();
            Ok(())
        })
    }
    pub fn clear_cache(&self) -> Result<(), String> {
        let _cache_guard = self
            .cache_lock
            .lock()
            .map_err(|_| "缓存操作锁异常".to_string())?;
        self.transaction(|data| {
            for f in &mut data.files {
                f.cache_path = None;
            }
            Ok(())
        })?;
        for entry in fs::read_dir(self.cache_dir()).map_err(|_| "无法读取缓存目录".to_string())?
        {
            let path = entry.map_err(|_| "无法读取缓存目录".to_string())?.path();
            // 仅删除根目录直接文件和符号链接，不递归跟随外部路径。
            if !path.is_dir() || path.is_symlink() {
                fs::remove_file(path).map_err(|_| "部分本地缓存无法删除".to_string())?;
            }
        }
        Ok(())
    }
    pub fn export_cache(
        &self,
        profile_id: &str,
        ids: &[String],
        destination: &Path,
    ) -> Result<ExportResult, String> {
        let _cache_guard = self
            .cache_lock
            .lock()
            .map_err(|_| "缓存操作锁异常".to_string())?;
        if !destination.is_dir() {
            return Err("请选择有效的导出目录".into());
        }
        let ids: HashSet<_> = ids.iter().collect();
        let mut result = ExportResult::default();
        for record in self
            .data()?
            .files
            .iter()
            .filter(|x| x.profile_id == profile_id && ids.contains(&x.id))
        {
            let source = match self.cache_path(&record.id) {
                Ok(p) => p,
                Err(_) => {
                    result.skipped += 1;
                    continue;
                }
            };
            let name = Path::new(&record.name)
                .file_name()
                .filter(|n| !n.is_empty())
                .ok_or("文件名称无效")?;
            let target = destination.join(name);
            let mut output = match OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
            {
                Ok(f) => f,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    result.skipped += 1;
                    continue;
                }
                Err(_) => {
                    result.failed += 1;
                    continue;
                }
            };
            match File::open(source).and_then(|mut input| std::io::copy(&mut input, &mut output)) {
                Ok(_) => result.exported += 1,
                Err(_) => {
                    result.failed += 1;
                    let _ = fs::remove_file(target);
                }
            }
        }
        Ok(result)
    }
    pub fn export_document(&self) -> Result<String, String> {
        let settings = self.data()?.settings;
        let profiles: Vec<Value> = settings.profiles.iter().map(|p| json!({"id":p.id,"provider": match p.provider.as_str() {"r2"=>"cloudflareR2","s3"=>"awsS3","qiniu"=>"qiniu","cos"=>"tencentCos",_=>"aliyunOss"},"name":p.name,"isEnabled":p.enabled,"accountId":p.account,"accessKeyId":p.access,"secretAccessKey":p.secret,"bucket":p.bucket,"endpoint":p.endpoint,"region":p.region,"publicDomain":p.domain,"pathPrefix":p.prefix,"usePathStyle":p.path_style})).collect();
        let pattern = match settings.naming.as_str() {
            "保持原文件名" => "originalFileName",
            "{YYYYMMDD}/{HASH}_{FILENAME}" => "datedHashFileName",
            "{YYYYMMDD}/{UUID}.{EXT}" => "datedUuid",
            _ => "uuid",
        };
        serde_json::to_string_pretty(&json!({"version":1,"exportedAt":chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true),"cloud":{"profiles":profiles,"activeProfileId":settings.active_profile_id,"compression":{"enabled":settings.compression.enabled,"thresholdBytes":(settings.compression.threshold*1048576.0) as u64,"quality":settings.compression.quality},"uploadNamingPattern":pattern}})).map_err(|_| "配置导出失败".into())
    }
    pub fn import_document(&self, source: &str) -> Result<ImportResult, String> {
        let value: Value =
            serde_json::from_str(source).map_err(|_| "配置 JSON 无效".to_string())?;
        if value.get("version").and_then(Value::as_u64) != Some(1) {
            return Err("不支持的配置版本".into());
        }
        let timestamp = value
            .get("exportedAt")
            .and_then(Value::as_str)
            .ok_or("配置缺少导出时间")?;
        if !timestamp.ends_with('Z') || chrono::DateTime::parse_from_rfc3339(timestamp).is_err() {
            return Err("配置导出时间格式无效".into());
        }
        let cloud = value.get("cloud").ok_or("配置缺少 cloud 字段")?;
        let profiles = cloud
            .get("profiles")
            .and_then(Value::as_array)
            .ok_or("云配置列表无效")?;
        let compression = cloud.get("compression").ok_or("缺少压缩配置")?;
        if compression
            .get("enabled")
            .and_then(Value::as_bool)
            .is_none()
            || compression
                .get("thresholdBytes")
                .and_then(Value::as_f64)
                .is_none()
            || compression.get("quality").and_then(Value::as_u64).is_none()
        {
            return Err("压缩配置无效".into());
        }
        let threshold = compression
            .get("thresholdBytes")
            .and_then(Value::as_f64)
            .unwrap_or_default();
        let quality = compression
            .get("quality")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        if threshold <= 0.0 || !threshold.is_finite() || !(1..=100).contains(&quality) {
            return Err("压缩配置数值无效".into());
        }
        if cloud
            .get("activeProfileId")
            .is_some_and(|id| !id.is_null() && !id.is_string())
        {
            return Err("默认云配置 ID 类型无效".into());
        }
        let mut originals = HashSet::new();
        let mut imported = Vec::new();
        for raw in profiles {
            let text = |key: &str, default: &str| -> Result<String, String> {
                match raw.get(key) {
                    Some(Value::String(v)) => Ok(v.clone()),
                    None => Ok(default.into()),
                    _ => Err(format!("配置字段 {key} 类型无效")),
                }
            };
            let boolean = |key: &str, default: bool| -> Result<bool, String> {
                match raw.get(key) {
                    Some(Value::Bool(v)) => Ok(*v),
                    None => Ok(default),
                    _ => Err(format!("配置字段 {key} 类型无效")),
                }
            };
            let id = text("id", "")?;
            if id.is_empty() || !originals.insert(id) {
                return Err("导入配置 ID 为空或重复".into());
            }
            let provider = match text("provider", "")?.as_str() {
                "cloudflareR2" | "r2" => "r2",
                "awsS3" | "s3" => "s3",
                "qiniu" => "qiniu",
                "tencentCos" | "cos" => "cos",
                "aliyunOss" | "oss" => "oss",
                _ => return Err("未知云服务厂商".into()),
            };
            imported.push(Profile {
                id: uuid::Uuid::new_v4().to_string(),
                provider: provider.into(),
                name: text("name", "导入配置")?,
                enabled: boolean("isEnabled", false)?,
                account: text("accountId", "")?,
                access: text("accessKeyId", "")?,
                secret: text("secretAccessKey", "")?,
                bucket: text("bucket", "")?,
                endpoint: text("endpoint", "")?,
                region: text("region", "auto")?,
                domain: text("publicDomain", "")?,
                prefix: text("pathPrefix", "")?,
                path_style: boolean("usePathStyle", true)?,
            });
        }
        if let Some(active) = cloud.get("activeProfileId").and_then(Value::as_str) {
            if !originals.contains(active) {
                return Err("默认云配置引用无效".into());
            }
        }
        // Flutter mergeFromMap 仅追加配置；本机压缩、命名和默认选择保持不变。
        self.transaction(|data| {
            let added = imported.len();
            data.settings.profiles.extend(imported);
            data.settings.validate()?;
            Ok(ImportResult { added })
        })
    }
}
fn valid_cache_path(root: &Path, path: &Path) -> bool {
    path.parent() == Some(root) && !path.is_symlink() && path.file_name().is_some()
}
/// 同目录临时文件 + fsync + 原子替换，权限不继承系统宽松默认值。
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("文件路径无效")?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建临时数据文件".to_string())?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|_| "保存数据失败，请检查磁盘空间与目录权限".to_string())?;
    temporary
        .persist(path)
        .map_err(|_| "替换数据文件失败".to_string())?;
    Ok(())
}
fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1048576 {
        format!("{:.2} KB", bytes as f64 / 1024.0)
    } else if bytes < 1073741824 {
        format!("{:.2} MB", bytes as f64 / 1048576.0)
    } else {
        format!("{:.2} GB", bytes as f64 / 1073741824.0)
    }
}
