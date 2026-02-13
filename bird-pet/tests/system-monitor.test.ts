/**
 * SystemMonitor 单元测试
 *
 * 覆盖 stop() 泄漏修复：验证 setTimeout 句柄被正确清理，
 * 以及防重入保护。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Tauri invoke ───

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => ({
    cpu_usage: 20,
    memory_used_gb: 4,
    memory_total_gb: 16,
    memory_usage_percent: 25,
  })),
}));

import { invoke } from '@tauri-apps/api/core';
import { SystemMonitor } from '../src/features/system-monitor';
import type { BubbleManager } from '../src/core/bubble-manager';
import type { StorageService, UserPreferences } from '../src/core/storage';

/** 创建 mock BubbleManager */
function mockBubble(): BubbleManager {
  return {
    say: vi.fn(),
    sayText: vi.fn(),
  } as unknown as BubbleManager;
}

/** 创建 mock StorageService */
function mockStorage(prefs: Partial<UserPreferences> = {}): StorageService {
  const defaults: UserPreferences = {
    hourlyChimeEnabled: true,
    systemMonitorEnabled: true,
    contextAwarenessEnabled: true,
    quietHoursStart: -1,
    quietHoursEnd: -1,
    nightModeEnabled: true,
    autoStartEnabled: true,
  };
  return {
    getPreferences: vi.fn().mockResolvedValue({ ...defaults, ...prefs }),
  } as unknown as StorageService;
}

describe('SystemMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Node.js 环境中 window 不存在，需要 stub
    vi.stubGlobal('window', globalThis);
    vi.mocked(invoke).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('启动后 15 秒内调用 stop() 应阻止 interval 创建', async () => {
    const monitor = new SystemMonitor(mockBubble(), mockStorage());
    await monitor.start();

    // 5 秒后 stop
    vi.advanceTimersByTime(5_000);
    monitor.stop();

    // 快进到 15 秒之后 — 不应有任何 poll
    vi.advanceTimersByTime(30_000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('正常流程：15 秒后首次 poll + 后续轮询', async () => {
    const monitor = new SystemMonitor(mockBubble(), mockStorage());
    await monitor.start();

    // 快进 15 秒 → 触发首次 poll
    vi.advanceTimersByTime(15_000);
    expect(invoke).toHaveBeenCalledTimes(1);

    // 再快进 30 秒 → 触发第二次 poll
    vi.advanceTimersByTime(30_000);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('stop() 应同时清除 delay timer 和 interval', async () => {
    const monitor = new SystemMonitor(mockBubble(), mockStorage());
    await monitor.start();

    // 快进 15 秒，让 interval 创建
    vi.advanceTimersByTime(15_000);
    expect(invoke).toHaveBeenCalledTimes(1);

    monitor.stop();

    // 之后不应再有 poll
    vi.advanceTimersByTime(60_000);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('重复调用 start() 不应创建多个 timer（防重入）', async () => {
    const monitor = new SystemMonitor(mockBubble(), mockStorage());
    await monitor.start();
    await monitor.start(); // 第二次调用

    // 快进 15 秒
    vi.advanceTimersByTime(15_000);
    // 应只有 1 次 poll（不是 2 次）
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('systemMonitorEnabled=false 时不启动', async () => {
    const monitor = new SystemMonitor(
      mockBubble(),
      mockStorage({ systemMonitorEnabled: false }),
    );
    await monitor.start();

    vi.advanceTimersByTime(60_000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('无 storage 时直接启动（向后兼容）', async () => {
    const monitor = new SystemMonitor(mockBubble());
    await monitor.start();

    vi.advanceTimersByTime(15_000);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
