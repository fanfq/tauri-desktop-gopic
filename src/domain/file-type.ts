/** 本地文件类型只用于展示，不根据分类赋予文件执行权限。 */
export type FileCategory =
  | "image"
  | "pdf"
  | "archive"
  | "audio"
  | "video"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "code"
  | "unknown";

const extensions: Record<
  Exclude<FileCategory, "unknown">,
  readonly string[]
> = {
  image: [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "svg",
    "tif",
    "tiff",
    "ico",
    "avif",
    "heic",
    "heif",
  ],
  pdf: ["pdf"],
  archive: ["zip", "rar", "7z", "gz", "tar", "bz2", "xz", "tgz", "zst"],
  audio: ["mp3", "wav", "flac", "m4a", "ogg", "aac", "aiff", "opus"],
  video: ["mp4", "mov", "mkv", "webm", "avi", "m4v", "wmv", "mpeg"],
  document: ["txt", "md", "rtf", "doc", "docx", "odt", "epub", "pages"],
  spreadsheet: ["csv", "tsv", "xls", "xlsx", "ods", "numbers"],
  presentation: ["ppt", "pptx", "odp", "key"],
  code: [
    "js",
    "jsx",
    "ts",
    "tsx",
    "json",
    "html",
    "css",
    "scss",
    "xml",
    "yaml",
    "yml",
    "py",
    "rs",
    "go",
    "java",
    "kt",
    "swift",
    "dart",
    "c",
    "h",
    "cpp",
    "cs",
    "rb",
    "php",
    "sh",
    "sql",
    "vue",
    "toml",
  ],
};

/** 只检查最后一级文件名，目录中的点号和隐藏文件不构成扩展名。 */
export function fileExtension(name: string): string {
  const basename = name.split(/[\\/]/).pop() ?? "";
  const dot = basename.lastIndexOf(".");
  return dot > 0 && dot < basename.length - 1
    ? basename.slice(dot + 1).toLowerCase()
    : "";
}

/** 优先识别明确 MIME；通用二进制和 text/plain 回退扩展名，保留代码/表格区分。 */
export function classifyFile(file: {
  name: string;
  contentType?: string;
}): FileCategory {
  const mime = file.contentType?.split(";")[0].trim().toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  // EPUB 的 +zip、Office 的 openxmlformats 是容器格式，须先识别其文档语义。
  if (/wordprocessing|msword|opendocument.text|rtf|epub/.test(mime))
    return "document";
  if (/zip|compressed|x-tar|gzip|x-7z|x-rar|zstd/.test(mime)) return "archive";
  if (
    /spreadsheet|excel|opendocument.spreadsheet/.test(mime) ||
    mime === "text/csv" ||
    mime === "text/tab-separated-values"
  )
    return "spreadsheet";
  if (/presentation|powerpoint/.test(mime)) return "presentation";
  if (
    /javascript|typescript|json|xml|x-python|x-shellscript|x-sh|x-rust|x-java|text\/html|text\/css/.test(
      mime,
    )
  )
    return "code";
  const extension = fileExtension(file.name);
  for (const [category, suffixes] of Object.entries(extensions)) {
    if (suffixes.includes(extension)) return category as FileCategory;
  }
  return mime.startsWith("text/") ? "document" : "unknown";
}
