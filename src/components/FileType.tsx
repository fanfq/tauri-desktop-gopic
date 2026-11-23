import {
  File,
  FileImage,
  FilePdf,
  FileZip,
  FileVideo,
  FileAudio,
  FileText,
  FileXls,
  FilePpt,
  FileCode,
} from "@phosphor-icons/react";
import { classifyFile, type FileCategory } from "../domain/file-type";

const icons = {
  image: FileImage,
  pdf: FilePdf,
  archive: FileZip,
  audio: FileAudio,
  video: FileVideo,
  document: FileText,
  spreadsheet: FileXls,
  presentation: FilePpt,
  code: FileCode,
  unknown: File,
};
const colors: Record<FileCategory, string> = {
  image: "text-sky-500",
  pdf: "text-red-500",
  archive: "text-amber-600",
  audio: "text-purple-500",
  video: "text-violet-500",
  document: "text-blue-500",
  spreadsheet: "text-emerald-600",
  presentation: "text-orange-500",
  code: "text-cyan-600",
  unknown: "text-muted",
};
export const fileCategoryLabels: Record<FileCategory, string> = {
  image: "图片",
  pdf: "PDF",
  archive: "压缩包",
  audio: "音频",
  video: "视频",
  document: "文档",
  spreadsheet: "表格",
  presentation: "演示",
  code: "代码",
  unknown: "文件",
};

/** 队列和图库共享分类及配色；非图片不会进入图片解码流程。 */
export function FileType({
  name,
  contentType,
  size = 44,
}: {
  name: string;
  contentType?: string;
  size?: number;
}) {
  const category = classifyFile({ name, contentType });
  const Icon = icons[category];
  return (
    <Icon
      className={colors[category]}
      size={size}
      weight="duotone"
      aria-label={fileCategoryLabels[category]}
    />
  );
}
