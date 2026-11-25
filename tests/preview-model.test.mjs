import test from "node:test";
import assert from "node:assert/strict";
import {
  visibleFiles,
  removeFiles,
  initialFiles,
} from "../src/preview/model.ts";

test("gallery only shows current profile and selected extension", () => {
  assert.ok(visibleFiles(initialFiles, "r2-main", "").length > 0);
  assert.ok(
    visibleFiles(initialFiles, "r2-main", "png").every(
      (x) => x.profileId === "r2-main" && x.name.endsWith(".png"),
    ),
  );
  assert.equal(visibleFiles(initialFiles, "unknown", "").length, 0);
});
test("bulk deletion cannot remove another profile records", () => {
  const other = initialFiles.find((x) => x.profileId !== "r2-main");
  const own = initialFiles.find((x) => x.profileId === "r2-main");
  const result = removeFiles(initialFiles, "r2-main", [own.id, other.id]);
  assert.ok(result.some((x) => x.id === other.id));
  assert.ok(!result.some((x) => x.id === own.id));
  assert.equal(initialFiles.length - result.length, 1);
});
test("incomplete and disabled profiles cannot upload; Qiniu requires a public domain", async () => {
  const { isProfileConfigured, initialProfiles } =
    await import("../src/preview/model.ts");
  const r2 = initialProfiles[0];
  assert.equal(isProfileConfigured(r2), true);
  assert.equal(isProfileConfigured({ ...r2, access: "" }), false);
  assert.equal(isProfileConfigured({ ...r2, enabled: false }), false);
  assert.equal(
    isProfileConfigured({ ...r2, provider: "qiniu", domain: "" }),
    false,
  );
});

test("only supported image formats are eligible for compression", async () => {
  const { isImageFile, shouldCompressFile } =
    await import("../src/preview/model.ts");
  const config = { enabled: true, threshold: 1, quality: 70 };
  assert.equal(isImageFile({ name: "photo.PNG", contentType: "" }), true);
  for (const name of ["report.pdf", "backup.zip", "README", "movie.mp4"]) {
    assert.equal(isImageFile({ name }), false);
    assert.equal(shouldCompressFile({ name, size: 5000000 }, config), false);
  }
  assert.equal(
    shouldCompressFile({ name: "photo.png", size: 5000000 }, config),
    true,
  );
  assert.equal(
    shouldCompressFile({ name: "motion.gif", size: 5000000 }, config),
    false,
  );
  assert.equal(
    shouldCompressFile({ name: "photo.jpg", size: 100 }, config),
    false,
  );
  assert.equal(
    shouldCompressFile(
      { name: "photo.jpg", size: 5000000 },
      { ...config, enabled: false },
    ),
    false,
  );
});
test("non-image Markdown is a link, image Markdown remains an image", async () => {
  const { fileMarkdown } = await import("../src/preview/model.ts");
  assert.equal(
    fileMarkdown({ name: "report.pdf", url: "https://example.com/a" }),
    "[report.pdf](https://example.com/a)",
  );
  assert.equal(
    fileMarkdown({ name: "photo.png", url: "https://example.com/a" }),
    "![photo.png](https://example.com/a)",
  );
});

// 正式表单与预览共用厂商默认值，防止界面展示与实际新增配置参数不一致。
test("bitiful S4 is selectable and prefills the official connection settings", async () => {
  const { providers, initialProfiles, isProfileConfigured } =
    await import("../src/preview/model.ts");
  const provider = providers.find((p) => p.id === "bitiful");
  assert.ok(provider, "缤纷云应有独立入口");
  assert.equal(provider.name, "缤纷云 S4");
  assert.equal(provider.defaultEndpoint, "https://s3.bitiful.net");
  assert.equal(provider.defaultRegion, "cn-east-1");
  const profile = initialProfiles.find((p) => p.provider === "bitiful");
  assert.equal(profile.endpoint, provider.defaultEndpoint);
  assert.equal(profile.region, provider.defaultRegion);
  assert.equal(profile.enabled, false);
  assert.equal(isProfileConfigured({ ...profile, enabled: true }), true);
  assert.equal(
    isProfileConfigured({ ...profile, enabled: true, access: "" }),
    false,
  );
});

test("Kodo has a consistent full name and abbreviation", async () => {
  const { providers, initialProfiles } =
    await import("../src/preview/model.ts");
  assert.equal(providers.find((p) => p.id === "qiniu").name, "七牛云 Kodo");
  assert.equal(providers.find((p) => p.id === "qiniu").short, "Kodo");
  assert.equal(
    initialProfiles.find((p) => p.provider === "qiniu").name,
    "Kodo 默认配置",
  );
});

test("cloud provider counts are isolated and reflect enabling, adding and removing profiles", async () => {
  const model = await import("../src/domain/model.ts");
  const profiles = [
    { provider: "r2", enabled: true },
    { provider: "r2", enabled: false },
    { provider: "qiniu", enabled: true },
  ];
  assert.deepEqual(model.cloudProviderCounts?.(profiles, "r2"), {
    enabled: 1,
    total: 2,
  });
  assert.deepEqual(model.cloudProviderCounts(profiles, "s3"), {
    enabled: 0,
    total: 0,
  });
  assert.deepEqual(
    model.cloudProviderCounts(
      profiles.map((p) => ({ ...p, enabled: false })),
      "r2",
    ),
    { enabled: 0, total: 2 },
  );
  const added = [...profiles, { provider: "r2", enabled: true }];
  assert.deepEqual(model.cloudProviderCounts(added, "r2"), {
    enabled: 2,
    total: 3,
  });
  assert.deepEqual(
    model.cloudProviderCounts(
      added.filter((p) => p.provider !== "r2"),
      "r2",
    ),
    { enabled: 0, total: 0 },
  );
});

test("queue clear eligibility requires settled tasks and an idle batch", async () => {
  const model = await import("../src/domain/model.ts");
  const settled = [{ status: "done" }, { status: "error" }];
  assert.equal(model.canClearUploadQueue?.(settled, false), true);
  assert.equal(model.canClearUploadQueue([], false), false);
  assert.equal(model.canClearUploadQueue(settled, true), false);
  for (const status of ["queued", "uploading"]) {
    assert.equal(
      model.canClearUploadQueue([...settled, { status }], false),
      false,
    );
  }
});
