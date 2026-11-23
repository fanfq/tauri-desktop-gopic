import { providers, type Profile, type FileRecord } from "../domain/model.ts";
export * from "../domain/model.ts";
export const initialProfiles: Profile[] = providers.map((p) => ({
  id: p.id === "r2" ? "r2-main" : `${p.id}-main`,
  provider: p.id,
  name: p.id === "r2" ? "个人图床" : `${p.short} 默认配置`,
  enabled: p.id === "r2",
  account: "",
  access: "DEMO_ACCESS_KEY",
  secret: "demo-secret-not-a-real-key",
  bucket: "gopic-images",
  endpoint:
    p.id === "qiniu"
      ? "https://up-z0.qiniup.com"
      : p.id === "r2"
        ? "https://demo.r2.cloudflarestorage.com"
        : "https://s3.example.com",
  region: p.id === "r2" ? "auto" : "us-east-1",
  domain: "https://cdn.example.com",
  prefix: "images/",
  pathStyle: true,
}));
// 远程照片仅用于示例内容；图片不可用时展示明确的加载失败状态。
const photos = [
  "photo-1470770841072-f978cf4d019e",
  "photo-1464822759023-fed622ff2c3b",
  "photo-1441974231531-c6227db76b6e",
  "photo-1500534623283-312aade485b7",
  "photo-1472396961693-142e6e269027",
  "photo-1470252649378-9c29740c9fa8",
  "photo-1519681393784-d120267933ba",
  "photo-1469474968028-56623f02e42e",
];
const names = [
  "山间湖泊.jpg",
  "雪山与云.png",
  "林间光影.jpg",
  "旷野的风.webp",
  "森林来客.jpg",
  "日落时分.png",
  "星空之下.jpg",
  "远山.png",
];
export const initialFiles: FileRecord[] = [
  ...photos.map((p, i) => ({
    id: `photo-${i}`,
    profileId: i === 7 ? "s3-main" : "r2-main",
    name: names[i],
    size: `${(0.8 + i * 0.32).toFixed(2)} MB`,
    date: `2026-11-${21 - Math.floor(i / 3)} 14:${String(28 - i).padStart(2, "0")}`,
    src: `https://images.unsplash.com/${p}?auto=format&fit=crop&w=1000&q=85`,
    url: `https://cdn.example.com/images/${encodeURIComponent(names[i])}`,
  })),
  ...[
    { name: "产品说明.pdf", size: "2.40 MB" },
    { name: "素材备份.zip", size: "18.60 MB" },
    { name: "演示视频.mp4", size: "12.80 MB" },
    { name: "README", size: "1.20 KB" },
  ].map((file, i) => ({
    ...file,
    id: `file-${i}`,
    profileId: "r2-main",
    date: "2026-11-21 14:00",
    src: "",
    url: `https://cdn.example.com/files/${encodeURIComponent(file.name)}`,
  })),
];
