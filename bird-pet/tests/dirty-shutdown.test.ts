import { describe, it, expect } from 'vitest';
import {
  DIRTY_SHUTDOWN_KEY,
  clearDirtyShutdown,
  hasDirtyShutdown,
  markDirtyOnBeforeUnload,
  markDirtyShutdown,
  type StorageLike,
} from '../src/core/dirty-shutdown';

function createStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('dirty-shutdown', () => {
  it('should be clean by default', () => {
    const storage = createStorage();
    expect(hasDirtyShutdown(storage)).toBe(false);
  });

  it('should set dirty flag', () => {
    const storage = createStorage();
    markDirtyShutdown(storage);
    expect(storage.getItem(DIRTY_SHUTDOWN_KEY)).toBe('true');
    expect(hasDirtyShutdown(storage)).toBe(true);
  });

  it('should clear dirty flag', () => {
    const storage = createStorage();
    markDirtyShutdown(storage);
    clearDirtyShutdown(storage);
    expect(storage.getItem(DIRTY_SHUTDOWN_KEY)).toBeNull();
    expect(hasDirtyShutdown(storage)).toBe(false);
  });

  it('should mark dirty on beforeunload when graceful shutdown has not started', () => {
    const storage = createStorage();
    markDirtyOnBeforeUnload(false, storage);
    expect(storage.getItem(DIRTY_SHUTDOWN_KEY)).toBe('true');
  });

  it('should not mark dirty on beforeunload when graceful shutdown has started', () => {
    const storage = createStorage();
    markDirtyOnBeforeUnload(true, storage);
    expect(storage.getItem(DIRTY_SHUTDOWN_KEY)).toBeNull();
  });
});
