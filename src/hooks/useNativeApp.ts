import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, Snapshot, UploadTask } from "../domain/model";
import { isProfileConfigured } from "../domain/model";
import { createSnapshotStore } from "../domain/snapshot-store";
import { native, subscribeSafely } from "../services/native";
import type { Notify } from "../components/UI";

export function useNativeApp(notify: Notify) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const mounted = useRef(true);
  const activeBatch = useRef(false);
  const pendingMutations = useRef(0);
  const store = useRef(
    createSnapshotStore(native.snapshot, native.saveSettings, (next) => {
      if (mounted.current) {
        setSnapshot(next);
        setError("");
      }
    }),
  );
  const refresh = useCallback(async () => {
    await store.current.refresh();
  }, []);
  const report = useCallback(
    (failure: unknown) =>
      notify(
        typeof failure === "string"
          ? failure
          : failure instanceof Error
            ? failure.message
            : "操作失败，请重试",
      ),
    [notify],
  );
  const upload = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      if (activeBatch.current) {
        notify("当前批次仍在上传，请稍后添加文件");
        return;
      }
      activeBatch.current = true;
      setUploading(true);
      try {
        // 等待尚未落盘的压缩/命名编辑，确保这批上传采用用户刚保存的设置。
        await store.current.flush();
        const settings = store.current.get()?.settings;
        const profile =
          settings?.profiles.find((p) => p.id === settings.activeProfileId) ??
          settings?.profiles.find((p) => p.enabled);
        if (!isProfileConfigured(profile)) {
          notify("请先启用并完成云服务配置");
          return;
        }
        const result = await native.upload(
          paths,
          profile!.id,
          crypto.randomUUID(),
        );
        await refresh();
        notify(
          result.failed
            ? `上传完成：成功 ${result.records.length} 项，失败 ${result.failed} 项`
            : `已上传 ${result.records.length} 个文件`,
        );
      } catch (failure) {
        report(failure);
      } finally {
        activeBatch.current = false;
        if (mounted.current) setUploading(false);
      }
    },
    [notify, refresh, report],
  );
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => {
    mounted.current = true;
    void refresh().catch((e) => {
      if (mounted.current) setError(String(e));
    });
    const stopProgress = subscribeSafely(
      () =>
        // 首次 queued 事件按输入顺序追加；旧事件缺省缩略图时保留已有预览。
        native.onProgress((task) =>
          setTasks((all) =>
            all.some((t) => t.taskId === task.taskId)
              ? all.map((t) =>
                  t.taskId === task.taskId ? { ...t, ...task } : t,
                )
              : [...all, task],
          ),
        ),
      (e) => reportRef.current(e),
    );
    const stopLibrary = subscribeSafely(
      () =>
        native.onLibraryChanged(() => {
          void refresh().catch((e) => reportRef.current(e));
        }),
      (e) => reportRef.current(e),
    );
    const stopDrop = subscribeSafely(
      () =>
        native.onDrop((paths) => {
          void uploadRef.current(paths);
        }, setDragging),
      (e) => reportRef.current(e),
    );
    const stopDesktopError = subscribeSafely(
      () => native.onDesktopError((message) => reportRef.current(message)),
      (e) => reportRef.current(e),
    );
    return () => {
      mounted.current = false;
      stopProgress();
      stopLibrary();
      stopDrop();
      stopDesktopError();
    };
  }, [refresh]);
  const savePatch = useCallback(
    (patch: Partial<AppSettings>) => store.current.savePatch(patch),
    [],
  );
  const mutate = useCallback(async (action: () => Promise<unknown>) => {
    ++pendingMutations.current;
    setMutating(true);
    try {
      return await store.current.mutate(action);
    } finally {
      if (--pendingMutations.current === 0 && mounted.current)
        setMutating(false);
    }
  }, []);
  return {
    snapshot,
    error,
    tasks,
    dragging,
    uploading,
    mutating,
    refresh,
    savePatch,
    upload,
    report,
    mutate,
  };
}
