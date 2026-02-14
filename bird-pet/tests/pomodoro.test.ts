import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroTimer } from '../src/features/pomodoro';
import { STORE_KEYS } from '../src/core/storage';
import { getLocalDateKey } from '../src/utils';
import type { EventBus } from '../src/events';
import type { AppEvents } from '../src/types';

function createPomodoro(storageGetImpl: (key: string, fallback: unknown) => Promise<unknown>) {
  const bus = {
    emit: vi.fn(),
  } as unknown as EventBus<AppEvents>;
  const bubble = {
    say: vi.fn(),
    sayText: vi.fn(),
  };
  const hourlyChime = {
    setEnabled: vi.fn(),
  };
  const dialogue = {
    getLine: vi.fn((scene: string) => scene),
  };
  const storage = {
    get: vi.fn(storageGetImpl),
    set: vi.fn(async () => {}),
  };

  const timer = new PomodoroTimer(
    bus,
    bubble as any,
    hourlyChime as any,
    dialogue as any,
    storage as any,
  );

  return { timer, storage, hourlyChime };
}

describe('PomodoroTimer persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('同一天应恢复已完成番茄计数', async () => {
    const today = getLocalDateKey();
    const { timer, storage, hourlyChime } = createPomodoro(async (key, fallback) => {
      if (key === STORE_KEYS.POMODORO_DATE) return today;
      if (key === STORE_KEYS.POMODORO_COUNT) return 3;
      return fallback;
    });

    await timer.start();

    expect(timer.completed).toBe(3);
    expect(hourlyChime.setEnabled).toHaveBeenCalledWith(false);
    expect(storage.get).toHaveBeenCalledWith(STORE_KEYS.POMODORO_DATE, '');
    expect(storage.get).toHaveBeenCalledWith(STORE_KEYS.POMODORO_COUNT, 0);

    await timer.stop();
  });

  it('跨天启动应将番茄计数重置为 0 并写回日期', async () => {
    const yesterday = getLocalDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const today = getLocalDateKey();
    const { timer, storage } = createPomodoro(async (key, fallback) => {
      if (key === STORE_KEYS.POMODORO_DATE) return yesterday;
      if (key === STORE_KEYS.POMODORO_COUNT) return 8;
      return fallback;
    });

    await timer.start();

    expect(timer.completed).toBe(0);
    expect(storage.set).toHaveBeenCalledWith(STORE_KEYS.POMODORO_DATE, today);
    expect(storage.set).toHaveBeenCalledWith(STORE_KEYS.POMODORO_COUNT, 0);

    await timer.stop();
  });

  it('专注结束后应递增并持久化番茄计数', async () => {
    const today = getLocalDateKey();
    const { timer, storage } = createPomodoro(async (key, fallback) => {
      if (key === STORE_KEYS.POMODORO_DATE) return today;
      if (key === STORE_KEYS.POMODORO_COUNT) return 0;
      return fallback;
    });

    await timer.start();
    await vi.advanceTimersByTimeAsync(25 * 60 * 1000);

    expect(timer.completed).toBe(1);
    await vi.waitFor(() => expect(storage.set).toHaveBeenCalledWith(STORE_KEYS.POMODORO_COUNT, 1));

    await timer.stop();
  });
});
