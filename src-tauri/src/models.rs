//! IPC 与磁盘模型集中于此；serde 字段始终与 TypeScript camelCase 合同一致。
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub enabled: bool,
    pub account: String,
    pub access: String,
    pub secret: String,
    pub bucket: String,
    pub endpoint: String,
    pub region: String,
    pub domain: String,
    pub prefix: String,
    pub path_style: bool,
}
impl Profile {
    pub fn validate_upload(&self) -> Result<(), String> {
        if !self.enabled {
            return Err("当前云服务配置未启用".into());
        }
        if [&self.access, &self.secret, &self.bucket, &self.endpoint]
            .iter()
            .any(|v| v.trim().is_empty())
        {
            return Err("云配置不完整，请填写密钥、Bucket 和 Endpoint".into());
        }
        if self.provider == "qiniu" && self.domain.trim().is_empty() {
            return Err("Kodo 必须填写公网 URL 前缀".into());
        }
        for address in [&self.endpoint, &self.domain] {
            if address.is_empty() {
                continue;
            }
            let url = url::Url::parse(address).map_err(|_| "云服务地址无效".to_string())?;
            if !matches!(url.scheme(), "http" | "https")
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err("云服务地址必须是无凭证、查询参数和片段的 HTTP(S) 地址".into());
            }
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Compression {
    pub enabled: bool,
    pub threshold: f64,
    pub quality: u8,
}
impl Default for Compression {
    fn default() -> Self {
        Self {
            enabled: false,
            threshold: 1.0,
            quality: 70,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub profiles: Vec<Profile>,
    pub active_profile_id: Option<String>,
    pub compression: Compression,
    pub naming: String,
    pub theme: String,
}
impl Default for Settings {
    fn default() -> Self {
        let profiles = [
            ("r2", "R2 默认配置"),
            ("s3", "S3 默认配置"),
            ("qiniu", "Kodo 默认配置"),
            ("cos", "COS 默认配置"),
            ("oss", "OSS 默认配置"),
            ("bitiful", "S4 默认配置"),
        ]
        .into_iter()
        .map(|(provider, name)| Profile {
            id: uuid::Uuid::new_v4().to_string(),
            provider: provider.into(),
            name: name.into(),
            enabled: false,
            account: String::new(),
            access: String::new(),
            secret: String::new(),
            bucket: String::new(),
            // S4 的官方连接参数只在初始化时预填，读取已有配置时保留用户设置。
            endpoint: if provider == "bitiful" {
                "https://s3.bitiful.net".into()
            } else {
                String::new()
            },
            region: match provider {
                "r2" => "auto".into(),
                "bitiful" => "cn-east-1".into(),
                _ => String::new(),
            },
            domain: String::new(),
            prefix: String::new(),
            path_style: true,
        })
        .collect();
        Self {
            profiles,
            active_profile_id: None,
            compression: Compression::default(),
            naming: "保持原文件名".into(),
            theme: "system".into(),
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !self.compression.threshold.is_finite()
            || self.compression.threshold <= 0.0
            || self.compression.quality == 0
            || self.compression.quality > 100
        {
            return Err("图片压缩阈值或质量无效".into());
        }
        if !["light", "dark", "system"].contains(&self.theme.as_str()) {
            return Err("主题无效".into());
        }
        if ![
            "保持原文件名",
            "{YYYYMMDD}/{HASH}_{FILENAME}",
            "{YYYYMMDD}/{UUID}.{EXT}",
            "{UUID}.{EXT}",
        ]
        .contains(&self.naming.as_str())
        {
            return Err("上传命名规则无效".into());
        }
        let mut ids = HashSet::new();
        for profile in &self.profiles {
            if profile.id.is_empty()
                || !ids.insert(&profile.id)
                || profile.name.trim().is_empty()
                || !["r2", "s3", "qiniu", "cos", "oss", "bitiful"]
                    .contains(&profile.provider.as_str())
            {
                return Err("云配置 ID、名称或厂商无效".into());
            }
        }
        if self
            .active_profile_id
            .as_ref()
            .is_some_and(|id| !self.profiles.iter().any(|p| &p.id == id))
        {
            return Err("默认云配置不存在".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub size: String,
    pub size_bytes: u64,
    pub date: String,
    pub content_type: String,
    pub url: String,
    pub cache_path: Option<String>,
    pub src: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Persisted {
    pub version: u8,
    pub settings: Settings,
    pub files: Vec<FileRecord>,
}
impl Default for Persisted {
    fn default() -> Self {
        Self {
            version: 1,
            settings: Settings::default(),
            files: vec![],
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheSummary {
    pub file_count: u64,
    pub total_bytes: u64,
    pub directory_path: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub settings: Settings,
    pub files: Vec<FileRecord>,
    pub cache: CacheSummary,
    pub launch_at_login: bool,
    pub version: String,
}
#[derive(Default, Serialize)]
pub struct ExportResult {
    pub exported: u64,
    pub skipped: u64,
    pub failed: u64,
}
#[derive(Serialize)]
pub struct ImportResult {
    pub added: usize,
}
#[derive(Serialize)]
pub struct BatchResult {
    pub records: Vec<FileRecord>,
    pub failed: usize,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadProgress {
    pub task_id: String,
    pub name: String,
    pub path: String,
    pub profile_id: String,
    pub status: String,
    pub progress: f64,
    pub bytes_per_second: Option<f64>,
    pub error: Option<String>,
    pub url: Option<String>,
    pub record_id: Option<String>,
    /// 本机生成的小尺寸 JPEG，不包含任意文件读取 URL。
    pub thumbnail: Option<String>,
}
