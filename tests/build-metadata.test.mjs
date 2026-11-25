import test from "node:test";
import assert from "node:assert/strict";
import { buildMetadata } from "../.github/scripts/build-metadata.mjs";

const tagPush = {
  eventName: "push",
  refType: "tag",
  refName: "v1.0.3",
};

test("manual builds read the Tauri version without creating a release", () => {
  assert.deepEqual(
    buildMetadata({ version: "1.0.3" }, { eventName: "workflow_dispatch" }),
    { version: "1.0.3", release: false },
  );
});

test("a matching tag push enables release creation", () => {
  assert.deepEqual(buildMetadata({ version: "1.0.3" }, tagPush), {
    version: "1.0.3",
    release: true,
  });
});

test("manual builds from a tag still do not create a release", () => {
  assert.equal(
    buildMetadata(
      { version: "1.0.3" },
      { ...tagPush, eventName: "workflow_dispatch" },
    ).release,
    false,
  );
});

test("a mismatched release tag fails before building", () => {
  assert.throws(() => buildMetadata({ version: "1.0.4" }, tagPush), /v1\.0\.4/);
});

test("branch pushes cannot enable release creation", () => {
  assert.equal(
    buildMetadata({ version: "1.0.3" }, { ...tagPush, refType: "branch" })
      .release,
    false,
  );
});

test("invalid versions cannot enter output files or artifact paths", () => {
  for (const version of [
    undefined,
    "",
    "../1.0.3",
    "1.0.3\n",
    "1.0.3\nrelease=true",
  ]) {
    assert.throws(() => buildMetadata({ version }, tagPush), /version/);
  }
});

test("prerelease tags must also match exactly", () => {
  assert.equal(
    buildMetadata(
      { version: "1.1.0-beta.1" },
      { ...tagPush, refName: "v1.1.0-beta.1" },
    ).release,
    true,
  );
});
