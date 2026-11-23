import { useEffect, useState } from "react";
import { classifyFile, fileExtension } from "../domain/file-type";
import { FileType, fileCategoryLabels } from "./FileType";

/** 原生只消费受限缩略图，浏览器用所选 File 的临时 URL；从不请求任意本地路径。 */
export function UploadFileIcon({
  name,
  contentType,
  thumbnail,
  file,
  status,
}: {
  name: string;
  contentType?: string;
  thumbnail?: string | null;
  file?: File;
  status: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string>();
  const [failedSource, setFailedSource] = useState<string>();
  // 本机成功解码后生成的缩略图可识别无扩展名图片；只接纳 data:image，
  // 不把任意 URL/本地路径视为图片凭据，也保留解码失败时的类型图标。
  const localImageThumbnail = !file && thumbnail?.startsWith("data:image/");
  const iconContentType = localImageThumbnail
    ? "image/jpeg"
    : contentType || file?.type;
  const category = classifyFile({ name, contentType: iconContentType });
  const extension = fileExtension(name).toUpperCase();
  useEffect(() => {
    if (!file || category !== "image") return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    // 更换文件或卸载队列图标时释放；预览切页会保留队列，直到重置或关闭。
    return () => URL.revokeObjectURL(url);
  }, [file, category]);
  const source = file ? objectUrl : thumbnail;
  const showImage = category === "image" && source && source !== failedSource;
  const label = `${fileCategoryLabels[category]}${extension ? ` · ${extension}` : ""}`;
  return (
    <span className={`file-icon ${status} overflow-hidden`} title={label}>
      {showImage ? (
        <img
          src={source}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <span className="flex min-w-0 flex-col items-center justify-center gap-0.5">
          <FileType name={name} contentType={iconContentType} size={22} />
          {extension && (
            <span className="max-w-[34px] truncate text-[8px] leading-none text-muted">
              {extension}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
