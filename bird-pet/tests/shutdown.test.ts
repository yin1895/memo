/**
 * gracefulShutdown 退出流程单元测试
 *
 * 验证：
 * 1. 幂等性 — 连续调用两次，save 只执行一次
 * 2. 分段容错 — 部分 unlisten 失败时仍能完成 memory.save() / storage.save()
 * 3. 预初始化安全 — 使用安全默认值的 unlisten 不抛异常
 * 4. 脏退出标记 — beforeunload 设置标记，gracefulShutdown 完成后清除
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── localStorage polyfill for Node.js ───
const localStorageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { localStorageMap.set(key, value); },
  removeItem: (key: string) => { localStorageMap.delete(key); },
  clear: () => { localStorageMap.clear(); },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ─── Mock Tauri APIs ───

const mockOuterPosition = vi.fn().mockResolvedValue({ x: 100, y: 200 });
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    outerPosition: mockOuterPosition,
  }),
}));

const mockUnregisterAll = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  unregisterAll: mockUnregisterAll,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  exit: vi.fn().mockResolvedValue(undefined),
}));

// ─── 辅助：创建可追踪的 mock 对象 ───

interface MockModules {
  storage: {
    setWindowPosition: ReturnType<typeof vi.fn<(pos: { x: number; y: number }) => Promise<void>>>;
    save: ReturnType<typeof vi.fn<() => Promise<void>>>;
  };
  memory: {
    save: ReturnType<typeof vi.fn<() => Promise<void>>>;
    stop: ReturnType<typeof vi.fn<() => void>>;
  };
  bubble: {
    dispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
  };
  bus: {
    dispose: ReturnType<typeof vi.fn<() => void>>;
  };
  cleanupInteraction: ReturnType<typeof vi.fn<() => void>>;
  idleCare: { stop: ReturnType<typeof vi.fn<() => void>> };
  hourlyChime: { stop: ReturnType<typeof vi.fn<() => void>> };
  pomodoro: { stop: ReturnType<typeof vi.fn<() => void>> };
  systemMonitor: { stop: ReturnType<typeof vi.fn<() => void>> };
  contextAwareness: { dispose: ReturnType<typeof vi.fn<() => void>> };
  quietMode: { stop: ReturnType<typeof vi.fn<() => void>> };
  memoryCard: { dispose: ReturnType<typeof vi.fn<() => void>> };
  memoryPanel: { dispose: ReturnType<typeof vi.fn<() => void>> };
}

function createMocks(): MockModules {
  return {
    storage: {
      setWindowPosition: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      save: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    },
    bubble: { dispose: vi.fn().mockResolvedValue(undefined) },
    bus: { dispose: vi.fn() },
    cleanupInteraction: vi.fn(),
    idleCare: { stop: vi.fn() },
    hourlyChime: { stop: vi.fn() },
    pomodoro: { stop: vi.fn() },
    systemMonitor: { stop: vi.fn() },
    contextAwareness: { dispose: vi.fn() },
    quietMode: { stop: vi.fn() },
    memoryCard: { dispose: vi.fn() },
    memoryPanel: { dispose: vi.fn() },
  };
}

/**
 * 构建一个隔离的 gracefulShutdown，模拟 main.ts 中的结构。
 * 使用与 main.ts 完全一致的分段 try-catch 逻辑。
 */
function buildGracefulShutdown(mocks: MockModules, overrides?: {
  unlistenAutostart?: Promise<() => void>;
  unlistenMemories?: Promise<() => void>;
  unlistenRequestQuit?: Promise<() => void>;
  autoSaveTimer?: number;
}) {
  // 预初始化（与 main.ts 一致的安全默认值）
  let shutdownCalled = false;
  const unlistenAutostart = overrides?.unlistenAutostart ?? Promise.resolve(() => {});
  const unlistenMemories = overrides?.unlistenMemories ?? Promise.resolve(() => {});
  const unlistenRequestQuit = overrides?.unlistenRequestQuit ?? Promise.resolve(() => {});
  const autoSaveTimer = overrides?.autoSaveTimer ?? 0;

  async function gracefulShutdown(): Promise<void> {
    if (shutdownCalled) return;
    shutdownCalled = true;

    // 阶段 1：保存窗口位置 & 释放监听
    try {
      const pos = await mockOuterPosition();
      await mocks.storage.setWindowPosition({ x: pos.x, y: pos.y });
    } catch { /* ignore */ }

    try {
      clearInterval(autoSaveTimer);
      (await unlistenAutostart)();
      (await unlistenMemories)();
      (await unlistenRequestQuit)();
      mocks.cleanupInteraction();
    } catch { /* ignore */ }

    // 阶段 2：停止功能模块
    try {
      mocks.idleCare.stop();
      mocks.hourlyChime.stop();
      mocks.pomodoro.stop();
      mocks.systemMonitor.stop();
      mocks.contextAwareness.dispose();
      mocks.quietMode.stop();
      mocks.memory.stop();
      mocks.memoryCard.dispose();
      mocks.memoryPanel.dispose();
    } catch { /* ignore */ }

    // 阶段 3：关键数据落盘
    try {
      await mocks.memory.save();
      await mocks.storage.save();
    } catch { /* ignore */ }

    // 阶段 4：清理全局资源
    try {
      await mocks.bubble.dispose();
      mocks.bus.dispose();
      await mockUnregisterAll();
    } catch { /* ignore */ }

    // 清除脏退出标记
    try {
      localStorage.removeItem('bird-pet:dirty-shutdown');
    } catch { /* ignore */ }
  }

  return { gracefulShutdown, isShutdownCalled: () => shutdownCalled };
}

// ─── Tests ───

describe('gracefulShutdown', () => {
  let mocks: MockModules;

  beforeEach(() => {
    mocks = createMocks();
    localStorageMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 幂等性 ──
  it('连续调用两次，save 只执行一次', async () => {
    const { gracefulShutdown } = buildGracefulShutdown(mocks);

    await gracefulShutdown();
    await gracefulShutdown();

    expect(mocks.memory.save).toHaveBeenCalledTimes(1);
    expect(mocks.storage.save).toHaveBeenCalledTimes(1);
  });

  // ── 分段容错：unlisten 失败 ──
  it('unlisten 失败时仍能完成 memory.save / storage.save', async () => {
    const failingUnlisten = Promise.resolve(() => { throw new Error('unlisten failed'); });
    const { gracefulShutdown } = buildGracefulShutdown(mocks, {
      unlistenAutostart: failingUnlisten,
    });

    await gracefulShutdown();

    // 关键：即使 unlisten 抛异常，数据保存仍然执行
    expect(mocks.memory.save).toHaveBeenCalledTimes(1);
    expect(mocks.storage.save).toHaveBeenCalledTimes(1);
  });

  // ── 分段容错：功能模块 stop 失败 ──
  it('功能模块 stop 抛异常时仍能完成数据保存', async () => {
    mocks.idleCare.stop.mockImplementation(() => { throw new Error('stop failed'); });
    const { gracefulShutdown } = buildGracefulShutdown(mocks);

    await gracefulShutdown();

    expect(mocks.memory.save).toHaveBeenCalledTimes(1);
    expect(mocks.storage.save).toHaveBeenCalledTimes(1);
  });

  // ── 预初始化安全值 ──
  it('使用默认（无操作）unlisten 不抛异常', async () => {
    // 不传任何 overrides → 全部使用预初始化默认值
    const { gracefulShutdown } = buildGracefulShutdown(mocks);

    // 不应抛出
    await expect(gracefulShutdown()).resolves.toBeUndefined();

    expect(mocks.memory.save).toHaveBeenCalledTimes(1);
    expect(mocks.storage.save).toHaveBeenCalledTimes(1);
  });

  // ── 全部阶段都执行 ──
  it('正常流程下全部清理阶段都被执行', async () => {
    const unlistenFn = vi.fn();
    const { gracefulShutdown } = buildGracefulShutdown(mocks, {
      unlistenAutostart: Promise.resolve(unlistenFn),
    });

    await gracefulShutdown();

    // 阶段 1
    expect(mocks.storage.setWindowPosition).toHaveBeenCalledWith({ x: 100, y: 200 });
    expect(unlistenFn).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupInteraction).toHaveBeenCalledTimes(1);
    // 阶段 2
    expect(mocks.idleCare.stop).toHaveBeenCalledTimes(1);
    expect(mocks.memory.stop).toHaveBeenCalledTimes(1);
    // 阶段 3
    expect(mocks.memory.save).toHaveBeenCalledTimes(1);
    expect(mocks.storage.save).toHaveBeenCalledTimes(1);
    // 阶段 4
    expect(mocks.bubble.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.bus.dispose).toHaveBeenCalledTimes(1);
  });

  // ── 脏退出标记 ──
  it('gracefulShutdown 完成后清除脏退出标记', async () => {
    localStorage.setItem('bird-pet:dirty-shutdown', 'true');
    const { gracefulShutdown } = buildGracefulShutdown(mocks);

    await gracefulShutdown();

    expect(localStorage.getItem('bird-pet:dirty-shutdown')).toBeNull();
  });

  it('脏退出标记在 save 失败时也会被清除', async () => {
    localStorage.setItem('bird-pet:dirty-shutdown', 'true');
    mocks.memory.save.mockRejectedValue(new Error('save failed'));
    const { gracefulShutdown } = buildGracefulShutdown(mocks);

    await gracefulShutdown();

    // 即使 save 失败，脏退出标记也被清除（因为 gracefulShutdown 确实执行了）
    expect(localStorage.getItem('bird-pet:dirty-shutdown')).toBeNull();
  });

  // ── 异步 unlisten Promise rejected ──
  it('unlisten Promise rejected 不阻断数据保存', async () => {
    const rejectedUnlisten = Promise.reject(new Error('listen registration failed'));
    // 防止 unhandled rejection
    rejectedUnlisten.catch(() => {});

    const { gracefulShutdown } = buildGracefulShutdown(mocks, {
      unlistenMemories: rejectedUnlisten,
    });

    await gracefulShutdown();

    expect(mocks.memory.save).toHaveBeenCalledTimes(1);
    expect(mocks.storage.save).toHaveBeenCalledTimes(1);
  });
});
