/** 完成链接共用单行省略和完整地址提示；原生端通过 opener 打开系统浏览器。 */
export function UploadResultLink({
  url,
  onOpen,
}: {
  url: string;
  onOpen?: (url: string) => void;
}) {
  return (
    <small>
      <a
        className="block truncate text-accent hover:underline"
        href={url}
        title={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          if (!onOpen) return;
          // 拦截 WebView 默认跳转，交给系统浏览器；预览页保留标准链接行为。
          event.preventDefault();
          onOpen(url);
        }}
      >
        {url}
      </a>
    </small>
  );
}
