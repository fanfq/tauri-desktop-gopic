import test from "node:test";
import assert from "node:assert/strict";
import { classifyFile, fileExtension } from "../src/domain/file-type.ts";

test("classifies all supported file families using case insensitive extensions", () => {
  const families = {
    image: ["photo.JPG", "scan.heic", "vector.svg"],
    pdf: ["report.PDF"],
    archive: ["backup.tar.gz", "files.7z"],
    audio: ["song.flac", "voice.m4a"],
    video: ["clip.mov", "film.mkv"],
    document: ["notes.md", "letter.docx", "book.epub"],
    spreadsheet: ["data.csv", "table.xlsx", "sheet.ods"],
    presentation: ["slides.pptx", "talk.odp"],
    code: ["app.tsx", "main.rs", "config.json", "script.py"],
    unknown: ["README", ".env", "payload.unrecognized"],
  };
  for (const [expected, names] of Object.entries(families))
    for (const name of names)
      assert.equal(classifyFile({ name }), expected, name);
});

test("specific MIME wins and generic MIME falls back to filename", () => {
  for (const [contentType, expected] of [
    ["image/png", "image"],
    ["APPLICATION/PDF; charset=binary", "pdf"],
    ["application/zip", "archive"],
    ["audio/ogg", "audio"],
    ["video/mp4", "video"],
    ["text/plain", "document"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "document",
    ],
    ["application/epub+zip", "document"],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "spreadsheet",
    ],
    ["application/vnd.oasis.opendocument.presentation", "presentation"],
    ["text/javascript", "code"],
  ])
    assert.equal(
      classifyFile({ name: "extensionless", contentType }),
      expected,
    );
  assert.equal(
    classifyFile({ name: "photo.bin", contentType: "image/jpeg" }),
    "image",
  );
  assert.equal(
    classifyFile({
      name: "data.xlsx",
      contentType: "application/octet-stream",
    }),
    "spreadsheet",
  );
  assert.equal(
    classifyFile({ name: "source.ts", contentType: "text/plain" }),
    "code",
  );
});

test("extension hints exclude directory dots, dotfiles and empty suffixes", () => {
  assert.equal(fileExtension("/folder.name/no-extension"), "");
  assert.equal(fileExtension("C:\\folder.name\\README"), "");
  assert.equal(fileExtension(".env"), "");
  assert.equal(fileExtension("name."), "");
  assert.equal(fileExtension("archive.TAR.GZ"), "gz");
});
