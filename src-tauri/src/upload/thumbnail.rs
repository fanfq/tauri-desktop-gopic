//! 队列只接收小尺寸本地缩略图，不向 WebView 暴露用户文件的任意读取权限。
use std::path::Path;

pub(super) async fn create(path: &Path) -> Option<String> {
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || encode(&path))
        .await
        .ok()
        .flatten()
}
fn encode(path: &Path) -> Option<String> {
    use base64::{Engine, engine::general_purpose::STANDARD};
    if !path.metadata().ok()?.is_file() {
        return None;
    }
    let mut reader = image::ImageReader::open(path)
        .ok()?
        .with_guessed_format()
        .ok()?;
    let mut limits = image::Limits::default();
    // 缩略图是可选展示，超出解码预算时直接回退类型图标，不影响原文件上传。
    limits.max_alloc = Some(64 * 1024 * 1024);
    limits.max_image_width = Some(12_000);
    limits.max_image_height = Some(12_000);
    reader.limits(limits);
    let pixels = reader.decode().ok()?.thumbnail(96, 96).to_rgba8();
    let mut rgb = image::RgbImage::new(pixels.width(), pixels.height());
    // 透明图片使用白底，避免 JPEG 缩略图出现黑色透明区域。
    for (x, y, pixel) in pixels.enumerate_pixels() {
        let alpha = u16::from(pixel[3]);
        let blend = |v: u8| ((u16::from(v) * alpha + 255 * (255 - alpha)) / 255) as u8;
        rgb.put_pixel(
            x,
            y,
            image::Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]),
        );
    }
    let mut bytes = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 75)
        .encode_image(&rgb)
        .ok()?;
    Some(format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::STANDARD};
    #[tokio::test]
    async fn thumbnail_is_a_small_jpeg_data_url_and_keeps_aspect_ratio() {
        let file = tempfile::Builder::new().suffix(".png").tempfile().unwrap();
        image::RgbaImage::from_pixel(800, 400, image::Rgba([20, 120, 210, 128]))
            .save_with_format(file.path(), image::ImageFormat::Png)
            .unwrap();
        let encoded = create(file.path()).await.expect("image thumbnail");
        let bytes = STANDARD
            .decode(encoded.strip_prefix("data:image/jpeg;base64,").unwrap())
            .unwrap();
        let result = image::load_from_memory(&bytes).unwrap();
        assert_eq!((result.width(), result.height()), (96, 48));
        assert!(bytes.len() < 32 * 1024);
    }
    #[tokio::test]
    async fn extensionless_images_are_detected_and_oversized_dimensions_fall_back() {
        let file = tempfile::NamedTempFile::new().unwrap();
        image::RgbImage::from_pixel(128, 64, image::Rgb([40, 90, 140]))
            .save_with_format(file.path(), image::ImageFormat::Png)
            .unwrap();
        assert!(
            create(file.path()).await.is_some(),
            "magic bytes rather than extension identify images"
        );
        image::RgbImage::from_pixel(12_001, 1, image::Rgb([0, 0, 0]))
            .save_with_format(file.path(), image::ImageFormat::Png)
            .unwrap();
        assert!(
            create(file.path()).await.is_none(),
            "optional preview must respect dimension limits"
        );
    }
    #[tokio::test]
    async fn unsupported_corrupt_and_missing_files_fall_back_without_failing_upload() {
        let file = tempfile::Builder::new().suffix(".png").tempfile().unwrap();
        std::fs::write(file.path(), b"not an image").unwrap();
        assert!(create(file.path()).await.is_none());
        let document = tempfile::Builder::new().suffix(".txt").tempfile().unwrap();
        std::fs::write(document.path(), b"text").unwrap();
        assert!(create(document.path()).await.is_none());
        assert!(create(Path::new("/nonexistent/gopic-file")).await.is_none());
    }
}
