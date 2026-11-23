import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsWriter } from "../src/domain/settings-writer.ts";
test("serialized setting patches retain changes from overlapping writes", async () => {
  let current = {
    theme: "system",
    naming: "original",
    compression: { enabled: false },
  };
  const calls = [];
  const writer = createSettingsWriter(
    () => current,
    async (settings) => {
      calls.push(settings);
      current = settings;
      return settings;
    },
  );
  await Promise.all([writer({ theme: "dark" }), writer({ naming: "uuid" })]);
  assert.equal(current.theme, "dark");
  assert.equal(current.naming, "uuid");
  assert.equal(calls.length, 2);
});
test("failed write does not poison later settings changes", async () => {
  let current = { theme: "system", naming: "original" };
  let fail = true;
  const writer = createSettingsWriter(
    () => current,
    async (settings) => {
      if (fail) {
        fail = false;
        throw Error("disk full");
      }
      current = settings;
      return settings;
    },
  );
  await assert.rejects(writer({ theme: "dark" }));
  await writer({ naming: "uuid" });
  assert.equal(current.theme, "system");
  assert.equal(current.naming, "uuid");
});
