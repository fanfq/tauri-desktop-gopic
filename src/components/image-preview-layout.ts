export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type ImageView = Point & { scale: number };

/** 小图保留原始像素，大图完整放入画布；布局尚未测量时避免除零。 */
export function fitScale(image: Size, viewport: Size): number {
  if (Math.min(image.width, image.height, viewport.width, viewport.height) <= 0)
    return 1;
  return Math.min(
    1,
    viewport.width / image.width,
    viewport.height / image.height,
  );
}

/** 以画布中心为原点约束平移，让四条图片边缘都能拖到且不会移出画布。 */
export function constrainView(
  view: ImageView,
  image: Size,
  viewport: Size,
): ImageView {
  const limitX = Math.max(0, (image.width * view.scale - viewport.width) / 2);
  const limitY = Math.max(0, (image.height * view.scale - viewport.height) / 2);
  return {
    scale: view.scale,
    x: Math.max(-limitX, Math.min(limitX, view.x)) || 0,
    y: Math.max(-limitY, Math.min(limitY, view.y)) || 0,
  };
}

/** 缩放时保持鼠标下的原图像素不变，再约束边界；超长图仍允许缩回适应比例。 */
export function zoomView(
  view: ImageView,
  scale: number,
  anchor: Point,
  image: Size,
  viewport: Size,
): ImageView {
  const nextScale = Math.max(
    Math.min(0.1, fitScale(image, viewport)),
    Math.min(5, scale),
  );
  const ratio = nextScale / view.scale;
  return constrainView(
    {
      scale: nextScale,
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
    },
    image,
    viewport,
  );
}
