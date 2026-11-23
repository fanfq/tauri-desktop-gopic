import test from "node:test";
import assert from "node:assert/strict";
import {
  fitScale,
  constrainView,
  zoomView,
} from "../src/components/image-preview-layout.ts";

const image = { width: 2000, height: 1000 };
const viewport = { width: 800, height: 600 };

test("fits wide and tall images while keeping small images at native size", () => {
  assert.equal(fitScale(image, viewport), 0.4);
  assert.equal(fitScale({ width: 100, height: 3000 }, viewport), 0.2);
  assert.equal(fitScale({ width: 40, height: 30 }, viewport), 1);
  assert.equal(fitScale(image, { width: 0, height: 0 }), 1);
});

test("every edge of an enlarged image is reachable without panning it out of view", () => {
  assert.deepEqual(
    constrainView({ scale: 1, x: 900, y: -900 }, image, viewport),
    { scale: 1, x: 600, y: -200 },
  );
  assert.deepEqual(
    constrainView({ scale: 1, x: -900, y: 900 }, image, viewport),
    { scale: 1, x: -600, y: 200 },
  );
});

test("zooming back to fit recenters both axes and clamps zoom limits", () => {
  assert.deepEqual(
    zoomView(
      { scale: 1, x: 600, y: 200 },
      0.4,
      { x: 0, y: 0 },
      image,
      viewport,
    ),
    { scale: 0.4, x: 0, y: 0 },
  );
  assert.equal(
    zoomView({ scale: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }, image, viewport)
      .scale,
    5,
  );
  assert.equal(
    zoomView({ scale: 1, x: 0, y: 0 }, 0, { x: 0, y: 0 }, image, viewport)
      .scale,
    0.1,
  );
});

test("wheel zoom keeps the image pixel under the pointer stationary", () => {
  const view = zoomView(
    { scale: 1, x: 20, y: 30 },
    2,
    { x: 100, y: 80 },
    image,
    viewport,
  );
  assert.deepEqual(view, { scale: 2, x: -60, y: -20 });
  assert.equal((100 - view.x) / view.scale, 80);
  assert.equal((80 - view.y) / view.scale, 50);
});

test("very tall images can return to fit below the usual minimum zoom", () => {
  const tall = { width: 100, height: 20000 };
  assert.equal(
    zoomView({ scale: 1, x: 0, y: 0 }, 0, { x: 0, y: 0 }, tall, viewport).scale,
    0.03,
  );
});
