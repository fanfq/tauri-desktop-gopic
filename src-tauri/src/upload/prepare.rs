//! Snapshot inputs before networking so cached bytes always match the uploaded object.
use crate::models::Compression;
use std::path::{Path, PathBuf};
use tempfile::TempPath;

pub struct Prepared {
    pub name: String,
    pub content_type: String,
    pub source_path: PathBuf,
    pub temporary: Option<TempPath>,
    pub size_bytes: u64,
}

pub async fn prepare(path: &Path, config: &Compression) -> Result<Prepared, String> {
    let path = path.to_owned();
    let config = config.clone();
    tokio::task::spawn_blocking(move || prepare_blocking(&path, &config))
        .await
        .map_err(|_| "文件准备任务失败".to_string())?
}

fn prepare_blocking(path: &Path, config: &Compression) -> Result<Prepared, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|_| "无法读取待上传文件，请确认文件仍存在且有读取权限".to_string())?;
    if !metadata.is_file() {
        return Err("只能上传普通文件，不能上传目录".into());
    }
    let name = path
        .file_name()
        .and_then(|v| v.to_str())
        .filter(|n| !n.is_empty())
        .ok_or("文件名不是有效 UTF-8")?
        .to_string();
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mut snapshot = tempfile::NamedTempFile::new().map_err(|_| "无法创建上传临时文件")?;
    // io::copy uses a bounded buffer even for multi-gigabyte arbitrary files.
    let size_bytes = std::io::copy(
        &mut std::fs::File::open(path).map_err(|_| "无法打开待上传文件")?,
        snapshot.as_file_mut(),
    )
    .map_err(|_| "无法创建文件快照，请检查临时目录空间")?;
    let snapshot = snapshot.into_temp_path();
    let mut result = Prepared {
        name,
        content_type: mime_guess::from_path(path)
            .first_or_octet_stream()
            .to_string(),
        source_path: snapshot.to_path_buf(),
        temporary: Some(snapshot),
        size_bytes,
    };
    if !config.enabled
        || size_bytes as f64 <= config.threshold.max(0.0) * 1024.0 * 1024.0
        || !["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"].contains(&ext.as_str())
    {
        return Ok(result);
    }
    // Decoding untrusted image files is bounded independently of upload file size.
    let mut reader =
        match image::ImageReader::open(&result.source_path).and_then(|r| r.with_guessed_format()) {
            Ok(r) => r,
            Err(_) => return Ok(result),
        };
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(256 * 1024 * 1024);
    limits.max_image_width = Some(20_000);
    limits.max_image_height = Some(20_000);
    reader.limits(limits);
    let decoded = match reader.decode() {
        Ok(image) => image,
        Err(_) => return Ok(result),
    };
    let mut output = match tempfile::Builder::new().suffix(".jpg").tempfile() {
        Ok(f) => f,
        Err(_) => return Ok(result),
    };
    // JPEG has no alpha: composite transparent pixels onto white rather than black.
    let mut rgb = image::RgbImage::new(decoded.width(), decoded.height());
    for (x, y, p) in decoded.to_rgba8().enumerate_pixels() {
        let a = u16::from(p[3]);
        let blend = |v: u8| ((u16::from(v) * a + 255 * (255 - a)) / 255) as u8;
        rgb.put_pixel(x, y, image::Rgb([blend(p[0]), blend(p[1]), blend(p[2])]));
    }
    if image::codecs::jpeg::JpegEncoder::new_with_quality(
        output.as_file_mut(),
        config.quality.clamp(1, 100),
    )
    .encode_image(&rgb)
    .is_err()
    {
        return Ok(result);
    }
    let length = match output.as_file().metadata() {
        Ok(m) => m.len(),
        Err(_) => return Ok(result),
    };
    if length >= size_bytes {
        return Ok(result);
    }
    let output = output.into_temp_path();
    result.name = Path::new(&result.name)
        .with_extension("jpg")
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    result.content_type = "image/jpeg".into();
    result.size_bytes = length;
    result.source_path = output.to_path_buf();
    result.temporary = Some(output);
    Ok(result)
}
