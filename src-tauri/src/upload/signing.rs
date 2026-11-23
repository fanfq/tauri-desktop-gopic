//! Signing is pure and receives an explicit timestamp for reproducible protocol tests.
use super::naming::encode;
use crate::models::Profile;
use base64::{Engine, engine::general_purpose::URL_SAFE};
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use sha2::{Digest, Sha256};
use url::Url;

fn hmac256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC permits any key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn canonical_query(url: &Url) -> String {
    let mut entries: Vec<_> = url
        .query_pairs()
        .map(|(k, v)| (encode(&k), encode(&v)))
        .collect();
    entries.sort();
    entries
        .into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&")
}

pub fn s3_headers(
    profile: &Profile,
    method: &str,
    url: &Url,
    length: u64,
    content_type: &str,
    timestamp: &str,
) -> Result<HeaderMap, String> {
    let date = timestamp.get(..8).ok_or("签名时间格式无效")?;
    let host = match url.port() {
        Some(port) => format!("{}:{port}", url.host_str().unwrap_or_default()),
        None => url.host_str().unwrap_or_default().to_string(),
    };
    let mut fields = std::collections::BTreeMap::from([
        ("content-length", length.to_string()),
        ("host", host),
        ("x-amz-content-sha256", "UNSIGNED-PAYLOAD".to_string()),
        ("x-amz-date", timestamp.to_string()),
    ]);
    if !content_type.is_empty() {
        fields.insert("content-type", content_type.to_string());
    }
    let canonical_headers = fields
        .iter()
        .map(|(k, v)| format!("{k}:{}\n", v.trim()))
        .collect::<String>();
    let signed_headers = fields.keys().copied().collect::<Vec<_>>().join(";");
    let canonical = format!(
        "{method}\n{}\n{}\n{canonical_headers}\n{signed_headers}\nUNSIGNED-PAYLOAD",
        url.path(),
        canonical_query(url)
    );
    let region = if profile.region.trim().is_empty() {
        "auto"
    } else {
        profile.region.trim()
    };
    let scope = format!("{date}/{region}/s3/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{timestamp}\n{scope}\n{}",
        hex(&Sha256::digest(canonical.as_bytes()))
    );
    let date_key = hmac256(
        format!("AWS4{}", profile.secret.trim()).as_bytes(),
        date.as_bytes(),
    );
    let region_key = hmac256(&date_key, region.as_bytes());
    let service_key = hmac256(&region_key, b"s3");
    let signing_key = hmac256(&service_key, b"aws4_request");
    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={}",
        profile.access.trim(),
        hex(&hmac256(&signing_key, string_to_sign.as_bytes()))
    );
    let mut result = HeaderMap::new();
    for (k, v) in fields {
        result.insert(
            HeaderName::from_static(k),
            HeaderValue::from_str(&v).map_err(|_| "配置含有无效请求头字符".to_string())?,
        );
    }
    result.insert(
        "authorization",
        HeaderValue::from_str(&auth).map_err(|_| "访问密钥格式无效".to_string())?,
    );
    Ok(result)
}

pub fn qiniu_token(profile: &Profile, key: &str, deadline: i64) -> Result<String, String> {
    let policy = serde_json::to_vec(
        &serde_json::json!({"scope":format!("{}:{key}",profile.bucket.trim()),"deadline":deadline}),
    )
    .map_err(|_| "无法生成上传策略")?;
    let encoded = URL_SAFE.encode(policy);
    let mut mac = Hmac::<sha1::Sha1>::new_from_slice(profile.secret.trim().as_bytes())
        .map_err(|_| "无法初始化七牛签名")?;
    mac.update(encoded.as_bytes());
    Ok(format!(
        "{}:{}:{encoded}",
        profile.access.trim(),
        URL_SAFE.encode(mac.finalize().into_bytes())
    ))
}
