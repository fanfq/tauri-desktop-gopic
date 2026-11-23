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
