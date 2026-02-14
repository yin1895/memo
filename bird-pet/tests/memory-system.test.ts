import { describe, it, expect, vi, beforeAll } from 'vitest';
import { MemorySystem } from '../src/core/memory';
import { STORE_KEYS } from '../src/core/storage';
import { getLocalDateKey } from '../src/utils';
import type { EventBus } from '../src/events';
import type { AppEvents, MemoryEvent, UserProfile } from '../src/types';

function getDateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return getLocalDateKey(d);
}

function toTimestamp(dateKey: string, hour: number): number {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function createBusMock(): EventBus<AppEvents> {
  return {
    on: vi.fn(() => () => {}),
    emit: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    dispose: vi.fn(),
  } as unknown as EventBus<AppEvents>;
}

function createStorageMock(events: MemoryEvent[], profile: UserProfile) {
  return {
    get: vi.fn(async (key: string, fallback: unknown) => {
      if (key === STORE_KEYS.MEMORY_EVENTS) return events;
      if (key === STORE_KEYS.USER_PROFILE) return profile;
      return fallback;
    }),
    set: vi.fn(async () => {}),
  };
}

describe('MemorySystem summarizeDay', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { setTimeout },
      configurable: true,
    });
  });

  it('跨多天启动时应汇总 lastActiveDate 到昨天的所有活跃日', async () => {
    const lastActiveDate = getDateKeyDaysAgo(3);
    const day2 = getDateKeyDaysAgo(2);
    const day1 = getDateKeyDaysAgo(1);
    const today = getDateKeyDaysAgo(0);

    const events: MemoryEvent[] = [
      { type: 'interaction', timestamp: toTimestamp(lastActiveDate, 10) },
      { type: 'context_switch', timestamp: toTimestamp(day2, 11), data: { to: 'coding' } },
      { type: 'interaction', timestamp: toTimestamp(day1, 12) },
    ];

    const profile: UserProfile = {
      totalInteractions: 10,
      streakDays: 5,
      lastActiveDate,
      dailySummaries: [],
    };

    const memory = new MemorySystem(createBusMock(), createStorageMock(events, profile) as any);
    await memory.start();

    const nextProfile = memory.getProfile();
    expect(nextProfile.dailySummaries.map((s) => s.date)).toEqual([lastActiveDate, day2, day1]);
    expect(nextProfile.streakDays).toBe(1);
    expect(nextProfile.lastActiveDate).toBe(today);
  });

  it('仅跨一天时应在原 streak 基础上 +1', async () => {
    const yesterday = getDateKeyDaysAgo(1);
    const today = getDateKeyDaysAgo(0);
    const events: MemoryEvent[] = [{ type: 'interaction', timestamp: toTimestamp(yesterday, 9) }];

    const profile: UserProfile = {
      totalInteractions: 3,
      streakDays: 4,
      lastActiveDate: yesterday,
      dailySummaries: [],
    };

    const memory = new MemorySystem(createBusMock(), createStorageMock(events, profile) as any);
    await memory.start();

    const nextProfile = memory.getProfile();
    expect(nextProfile.dailySummaries.map((s) => s.date)).toEqual([yesterday]);
    expect(nextProfile.streakDays).toBe(5);
    expect(nextProfile.lastActiveDate).toBe(today);
  });
});
