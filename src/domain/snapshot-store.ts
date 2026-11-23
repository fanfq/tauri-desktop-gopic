/** 所有磁盘读取、设置保存和配置导入共享串行队列。
 * 导入完成并刷新后，下一个设置补丁才读取最新值；库刷新也不会被主题保存丢弃。
 * 这里不依赖 React/Tauri，便于用确定性交错测试检查数据丢失问题。
 */
export function createSnapshotStore<S extends { settings: object }>(
  load: () => Promise<S>,
  save: (settings: S["settings"]) => Promise<S["settings"]>,
  onChange: (snapshot: S) => void,
) {
  let current: S | undefined;
  let requiresReload = false;
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const result = tail.catch(() => undefined).then(action);
    tail = result;
    return result;
  };
  const apply = (snapshot: S) => {
    current = snapshot;
    onChange(snapshot);
    return snapshot;
  };
  const reload = async () => {
    const snapshot = await load();
    requiresReload = false;
    return apply(snapshot);
  };
  return {
    get: () => current,
    flush: () => enqueue(async () => undefined),
    refresh: () => enqueue(reload),
    savePatch: (patch: Partial<S["settings"]>) =>
      enqueue(async () => {
        // 原生操作可能已成功落盘但读取失败，禁止用旧 profiles 覆盖导入结果。
        if (requiresReload) await reload();
        if (!current) throw Error("配置尚未加载");
        const settings = await save({ ...current.settings, ...patch });
        apply({ ...current, settings });
        await reload();
        return settings;
      }),
    mutate: <T>(action: () => Promise<T>) =>
      enqueue(async () => {
        requiresReload = true;
        try {
          const result = await action();
          await reload();
          return result;
        } catch (error) {
          await reload().catch(() => undefined);
          throw error;
        }
      }),
  };
}
