import test from "node:test";
import assert from "node:assert/strict";
import { selectLayout } from "../src/components/select-layout.ts";

test("menu opens above a trigger near the viewport bottom", () => {
  const box = selectLayout(
    { left: 100, top: 550, bottom: 584, width: 200 },
    800,
    600,
  );
  assert.equal(box.bottom, 56);
  assert.equal(box.top, undefined);
  assert.ok(box.maxHeight <= 534);
});
test("menu stays inside the right edge and narrow viewports", () => {
  const box = selectLayout(
    { left: 290, top: 40, bottom: 74, width: 150 },
    360,
    600,
  );
  assert.equal(box.left + box.width, 350);
  const narrow = selectLayout(
    { left: 5, top: 40, bottom: 74, width: 200 },
    180,
    600,
  );
  assert.equal(narrow.width, 160);
  assert.equal(narrow.left, 10);
});
