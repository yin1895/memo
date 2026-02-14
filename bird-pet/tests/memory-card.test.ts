/**
 * MemoryCardManager - 里程碑检测单元测试
 *
 * 验证修复后的降序遍历逻辑：高活跃用户应优先收到最高阶里程碑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryCardManager } from '../src/features/memory-card';
import type { EventBus } from '../src/events';
import type { AppEvents, MemorySnapshot, UserProfile } from '../src/types';
import type { MemorySystem } from '../src/core/memory';
import type { PetOwnerProfile, StorageService } from '../src/core/storage';

// Mock Tauri APIs（模块级别，避免导入时报错）
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: vi.fn(),
}));

const mockUnlisten = vi.fn();
let listenCallbacks: Record<string, (event: unknown) => void> = {};

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(async (event: string, cb: (event: unknown) => void) => {
    listenCallbacks[event] = cb;
    return mockUnlisten;
  }),
}));

/** 构建测试用 MemoryCardManager */
function createManager(opts: {
  streak?: number;
  totalInteractions?: number;
  daysSinceMet?: number;
  triggeredMilestones?: string[];
}) {
  const metDateFromDaysAgo = (days: number): string => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const bus = {
    emit: vi.fn(),
    on: vi.fn(),
  } as unknown as EventBus<AppEvents>;

  const snapshot: MemorySnapshot = {
    streak: opts.streak ?? 0,
    affinityLevel: 1,
  } as MemorySnapshot;

  const profile: Readonly<UserProfile> = {
    totalInteractions: opts.totalInteractions ?? 0,
    dailySummaries: [],
  } as unknown as UserProfile;

  const memory = {
    getSnapshot: vi.fn().mockReturnValue(snapshot),
    getProfile: vi.fn().mockReturnValue(profile),
  } as unknown as MemorySystem;

  const storage = {
    getTriggeredMilestones: vi.fn().mockResolvedValue(opts.triggeredMilestones ?? []),
    addTriggeredMilestone: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;

  const owner = { nicknames: ['小主人'] } as unknown as PetOwnerProfile;

  const manager = new MemoryCardManager(
    bus,
    memory,
    storage,
    owner,
    metDateFromDaysAgo(opts.daysSinceMet ?? 0),
  );

  return { manager, snapshot, profile, storage };
}

describe('MemoryCardManager - milestone detection', () => {
  it('should return highest streak milestone for high-streak user', async () => {
    const { manager, snapshot, profile } = createManager({ streak: 150 });
    const result = await (manager as any).detectMilestone(snapshot, profile);
    expect(result).not.toBeNull();
    expect(result.kind).toBe('streak');
    expect(result.value).toBe(100); // 最高阈值 <= 150
  });

  it('should return 365 streak milestone for yearly user', async () => {
    const { manager, snapshot, profile } = createManager({ streak: 400 });
    const result = await (manager as any).detectMilestone(snapshot, profile);
    expect(result).not.toBeNull();
    expect(result.kind).toBe('streak');
    expect(result.value).toBe(365);
  });

  it('should skip already triggered milestones and return next highest', async () => {
    const { manager, snapshot, profile } = createManager({
      streak: 150,
      triggeredMilestones: ['streak:100'],
    });
    const result = await (manager as any).detectMilestone(snapshot, profile);
    expect(result).not.toBeNull();
    expect(result.kind).toBe('streak');
    expect(result.value).toBe(50); // 100 已触发，下一个最高是 50
  });

  it('should return highest interaction milestone', async () => {
    const { manager, snapshot, profile } = createManager({
      totalInteractions: 3000,
    });
    const result = await (manager as any).detectMilestone(snapshot, profile);
    expect(result).not.toBeNull();
    expect(result.kind).toBe('interaction');
    expect(result.value).toBe(2000); // 最高阈值 <= 3000
  });

  it('should return highest met_days milestone', async () => {
    const { manager, snapshot, profile } = createManager({
      daysSinceMet: 250,
    });
    const result = await (manager as any).detectMilestone(snapshot, profile);
    expect(result).not.toBeNull();
    expect(result.kind).toBe('met_days');
    expect(result.value).toBe(200); // 最高阈值 <= 250
  });

  it('should return null when no new milestones available', async () => {
    const { manager, snapshot, profile } = createManager({
      streak: 5,
      totalInteractions: 50,
      daysSinceMet: 10,
    });
    const result = await (manager as any).detectMilestone(snapshot, profile);
    expect(result).toBeNull();
  });

  it('should return null when all milestones already triggered', async () => {
    const { manager, snapshot, profile } = createManager({
      streak: 400,
      triggeredMilestones: [
        'streak:7', 'streak:14', 'streak:30', 'streak:50',
        'streak:100', 'streak:200', 'streak:365',
      ],
    });
    const result = await (manager as any).detectMilestone(snapshot, profile);
    expect(result).toBeNull();
  });

  it('should persist the triggered milestone', async () => {
    const { manager, snapshot, profile, storage } = createManager({ streak: 50 });
    await (manager as any).detectMilestone(snapshot, profile);
    expect(storage.addTriggeredMilestone).toHaveBeenCalledWith('streak:50');
  });
});

describe('MemoryCardManager - dispose & listener cleanup', () => {
  beforeEach(() => {
    listenCallbacks = {};
    mockUnlisten.mockClear();
  });

  it('dispose 应释放 unlistenReady 并置空', () => {
    const { manager } = createManager({});
    // 模拟已注册过监听
    (manager as any).unlistenReady = mockUnlisten;

    manager.dispose();

    expect(mockUnlisten).toHaveBeenCalledOnce();
    expect((manager as any).unlistenReady).toBeNull();
  });

  it('多次 dispose 不应重复调用 unlisten', () => {
    const { manager } = createManager({});
    (manager as any).unlistenReady = mockUnlisten;

    manager.dispose();
    manager.dispose();

    expect(mockUnlisten).toHaveBeenCalledOnce();
  });
});
