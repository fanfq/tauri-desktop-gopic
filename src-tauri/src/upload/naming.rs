//! Object naming and URL construction are kept independent of upload transports.
use crate::models::Profile;
use url::Url;

pub fn object_name(pattern: &str, filename: &str, date: &str, hash: &str, uuid: &str) -> String {
    let mut safe = String::new();
    let mut last_replaced = false;
    for c in filename.chars() {
        let accepted = c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-');
        if accepted {
            safe.push(c);
            last_replaced = false;
        } else if !last_replaced {
            safe.push('_');
            last_replaced = true;
        }
    }
    let extension = safe
        .rsplit_once('.')
        .filter(|(base, _)| !base.is_empty())
        .map(|(_, ext)| format!(".{ext}"))
        .unwrap_or_default();
    match pattern {
        "{YYYYMMDD}/{HASH}_{FILENAME}" | "datedHashFileName" => format!("{date}/{hash}_{safe}"),
        "{YYYYMMDD}/{UUID}.{EXT}" | "datedUuid" => format!("{date}/{uuid}{extension}"),
        "{UUID}.{EXT}" | "uuid" => format!("{uuid}{extension}"),
        _ => safe,
    }
}

/// Endpoints cannot carry userinfo or signed queries: credentials live only in headers.
pub fn endpoint(value: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim()).map_err(|_| "访问地址格式无效".to_string())?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("访问地址必须是无认证信息、查询参数和片段的 HTTP(S) 地址".into());
    }
    Ok(url)
}

pub fn object_key(prefix: &str, filename: &str) -> Result<String, String> {
    let prefix = prefix.trim().trim_matches('/');
    if prefix.split('/').any(|s| matches!(s, "." | "..")) || prefix.contains('\\') {
        return Err("路径前缀不能包含相对目录".into());
    }
    Ok(if prefix.is_empty() {
        filename.into()
    } else {
        format!("{prefix}/{filename}")
    })
}

fn append(url: &mut Url, path: &str) -> Result<(), String> {
    let mut segments = url
        .path_segments_mut()
        .map_err(|_| "访问地址不支持路径".to_string())?;
    segments.pop_if_empty();
    for segment in path.split('/') {
        segments.push(segment);
    }
    Ok(())
}

pub fn object_url(profile: &Profile, key: &str) -> Result<Url, String> {
    let mut url = endpoint(&profile.endpoint)?;
    if profile.path_style {
        append(&mut url, profile.bucket.trim())?;
    } else {
        let host = format!(
            "{}.{}",
            profile.bucket.trim(),
            url.host_str().unwrap_or_default()
        );
        url.set_host(Some(&host))
            .map_err(|_| "Bucket 不适用于虚拟主机地址".to_string())?;
    }
    append(&mut url, key)?;
    Ok(url)
}

pub fn public_url(profile: &Profile, key: &str, fallback: Option<&Url>) -> Result<String, String> {
    if !profile.domain.trim().is_empty() {
        let mut url = endpoint(&profile.domain)?;
        append(&mut url, key)?;
        return Ok(url.to_string());
    }
    fallback
        .map(ToString::to_string)
        .ok_or_else(|| "七牛云必须填写公网 URL 前缀".into())
}

/// AWS percent-encoding (RFC 3986), without the form-urlencoded '+' shorthand.
pub fn encode(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char)
        } else {
            use std::fmt::Write;
            let _ = write!(out, "%{b:02X}");
        }
    }
    out
}
