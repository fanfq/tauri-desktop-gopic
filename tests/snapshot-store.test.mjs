import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotStore } from "../src/domain/snapshot-store.ts";
test("library refresh and setting writes cannot discard uploaded records", async () => {
  let disk = {
    settings: { theme: "system", profiles: [] },
    files: ["uploaded"],
  };
  const store = createSnapshotStore(
    async () => structuredClone(disk),
    async (settings) => {
      disk.settings = settings;
      return settings;
    },
    () => {},
  );
  await store.refresh();
  await Promise.all([store.refresh(), store.savePatch({ theme: "dark" })]);
  assert.deepEqual(store.get().files, ["uploaded"]);
  assert.equal(store.get().settings.theme, "dark");
});
test("import is serialized before later patches and preserves new profiles", async () => {
  let disk = {
    settings: { theme: "system", profiles: ["original"] },
    files: [],
  };
  const store = createSnapshotStore(
    async () => structuredClone(disk),
    async (settings) => {
      disk.settings = settings;
      return settings;
    },
    () => {},
  );
  await store.refresh();
  await Promise.all([
    store.mutate(async () => {
      disk.settings.profiles.push("imported");
    }),
    store.savePatch({ theme: "dark" }),
  ]);
  assert.deepEqual(disk.settings.profiles, ["original", "imported"]);
  assert.equal(disk.settings.theme, "dark");
});
test("failed mutation refreshes actual data and does not poison queue", async () => {
  let disk = { settings: { theme: "system" }, files: [] };
  const store = createSnapshotStore(
    async () => structuredClone(disk),
    async (settings) => {
      disk.settings = settings;
      return settings;
    },
    () => {},
  );
  await store.refresh();
  await assert.rejects(
    store.mutate(async () => {
      throw Error("read only");
    }),
  );
  await store.savePatch({ theme: "dark" });
  assert.equal(store.get().settings.theme, "dark");
});

test("a failed post-import refresh cannot allow a stale profile overwrite", async () => {
  let disk = {
    settings: { theme: "system", profiles: ["original"] },
    files: [],
  };
  let readFailures = 0;
  const store = createSnapshotStore(
    async () => {
      if (readFailures > 0) {
        --readFailures;
        throw Error("read failed");
      }
      return structuredClone(disk);
    },
    async (settings) => {
      disk.settings = settings;
      return settings;
    },
    () => {},
  );
  await store.refresh();
  await assert.rejects(
    store.mutate(async () => {
      disk.settings.profiles.push("imported");
      readFailures = 3;
    }),
  );
  await assert.rejects(store.savePatch({ theme: "dark" }));
  assert.deepEqual(disk.settings.profiles, ["original", "imported"]);
  await store.savePatch({ theme: "dark" });
  assert.deepEqual(disk.settings.profiles, ["original", "imported"]);
  assert.equal(disk.settings.theme, "dark");
});
