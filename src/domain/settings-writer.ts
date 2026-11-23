/** 串行合并设置补丁，防止主题、命名等同时保存时用旧快照覆盖彼此；失败不阻塞后续保存。 */
export function createSettingsWriter<T extends object>(
  read: () => T,
  save: (settings: T) => Promise<T>,
) {
  let tail: Promise<unknown> = Promise.resolve();
  return (patch: Partial<T>): Promise<T> => {
    const next = tail
      .catch(() => undefined)
      .then(() => save({ ...read(), ...patch }));
    tail = next;
    return next;
  };
}
