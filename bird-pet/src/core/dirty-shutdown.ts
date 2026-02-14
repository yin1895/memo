/** 脏退出标记 key */
export const DIRTY_SHUTDOWN_KEY = 'bird-pet:dirty-shutdown';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 检查是否存在脏退出标记 */
export function hasDirtyShutdown(storage: StorageLike = localStorage): boolean {
  try {
    return storage.getItem(DIRTY_SHUTDOWN_KEY) === 'true';
  } catch {
    return false;
  }
}

/** 写入脏退出标记 */
export function markDirtyShutdown(storage: StorageLike = localStorage): void {
  try {
    storage.setItem(DIRTY_SHUTDOWN_KEY, 'true');
  } catch {
    // ignore
  }
}

/** 清除脏退出标记 */
export function clearDirtyShutdown(storage: StorageLike = localStorage): void {
  try {
    storage.removeItem(DIRTY_SHUTDOWN_KEY);
  } catch {
    // ignore
  }
}

/**
 * beforeunload 场景下按需写入脏退出标记：
 * 仅当尚未进入 graceful 退出流程时写入。
 */
export function markDirtyOnBeforeUnload(
  gracefulShutdownStarted: boolean,
  storage: StorageLike = localStorage,
): void {
  if (!gracefulShutdownStarted) {
    markDirtyShutdown(storage);
  }
}
