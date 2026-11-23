/** 在视口内定位菜单；上方空间更充足时翻转，保持与触发器的 6px 间隔。 */
export function selectLayout(
  rect: { left: number; top: number; bottom: number; width: number },
  viewportWidth: number,
  viewportHeight: number,
) {
  const width = Math.min(Math.max(rect.width, 200), viewportWidth - 20);
  const below = viewportHeight - rect.bottom - 16;
  const above = rect.top - 16;
  const upwards = below < 240 && above > below;
  return {
    width,
    left: Math.max(10, Math.min(rect.left, viewportWidth - width - 10)),
    top: upwards ? undefined : rect.bottom + 6,
    bottom: upwards ? viewportHeight - rect.top + 6 : undefined,
    maxHeight: Math.max(0, Math.min(280, upwards ? above : below)),
  };
}
