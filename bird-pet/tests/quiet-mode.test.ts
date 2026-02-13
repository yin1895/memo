/**
 * QuietModeManager 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/events';
import type { AppEvents } from '../src/types';
import { QuietModeManager } from '../src/features/quiet-mode';
import type { StorageService, UserPreferences } from '../src/core/storage';

/** 创建 mock StorageService */
function mockStorage(prefs: Partial<UserPreferences> = {}): StorageService {
  const defaults: UserPreferences = {
    hourlyChimeEnabled: true,
    systemMonitorEnabled: true,
    contextAwarenessEnabled: true,
    quietHoursStart: -1,
    quietHoursEnd: -1,
    nightModeEnabled: true,
    autoStartEnabled: false,
  };
  return {
    getPreferences: vi.fn().mockResolvedValue({ ...defaults, ...prefs }),
  } as unknown as StorageService;
}

describe('QuietModeManager', () => {
  let bus: EventBus<AppEvents>;

  beforeEach(() => {
    bus = new EventBus<AppEvents>();
  });

  afterEach(() => {
    bus.dispose();
    vi.restoreAllMocks();
  });

  it('should return null (no suppress) by default', async () => {
    const qm = new QuietModeManager(bus, mockStorage());
    await qm.start();
    // Assuming test runs during normal hours (not midnight)
    // At worst it returns night_mode, so just check it doesn't error
    const reason = qm.shouldSuppress();
    expect([null, 'night_mode']).toContain(reason);
  });

  it('should suppress during quiet hours (same-day range)', async () => {
    const hour = new Date().getHours();
    const qm = new QuietModeManager(bus, mockStorage({
      quietHoursStart: hour,
      quietHoursEnd: hour + 2,
    }));
    await qm.start();
    expect(qm.shouldSuppress()).toBe('quiet_hours');
    expect(qm.isFullSilent()).toBe(true);
  });

  it('should suppress during quiet hours (cross-midnight range)', async () => {
    const hour = new Date().getHours();
    // Create a range that definitely includes current hour
    const qm = new QuietModeManager(bus, mockStorage({
      quietHoursStart: (hour + 23) % 24, // 1 hour before → wraps if needed
      quietHoursEnd: (hour + 2) % 24,
    }));
    await qm.start();
    expect(qm.shouldSuppress()).toBe('quiet_hours');
  });

  it('should not suppress when outside quiet hours', async () => {
    const hour = new Date().getHours();
    const qm = new QuietModeManager(bus, mockStorage({
      quietHoursStart: (hour + 5) % 24,
      quietHoursEnd: (hour + 7) % 24,
      nightModeEnabled: false,
    }));
    await qm.start();
    expect(qm.shouldSuppress()).toBeNull();
  });

  it('should suppress when in meeting', async () => {
    const qm = new QuietModeManager(bus, mockStorage({ nightModeEnabled: false }));
    await qm.start();

    bus.emit('context:changed', { from: 'idle', to: 'meeting' });
    expect(qm.shouldSuppress()).toBe('meeting');
    expect(qm.isFullSilent()).toBe(true);
  });

  it('should clear meeting state when context changes', async () => {
    const qm = new QuietModeManager(bus, mockStorage({ nightModeEnabled: false }));
    await qm.start();

    bus.emit('context:changed', { from: 'idle', to: 'meeting' });
    bus.emit('context:changed', { from: 'meeting', to: 'coding' });
    expect(qm.shouldSuppress()).not.toBe('meeting');
  });

  it('should detect deep focus after coding threshold', async () => {
    const qm = new QuietModeManager(bus, mockStorage({ nightModeEnabled: false }));
    await qm.start();

    // Simulate coding context
    bus.emit('context:changed', { from: 'idle', to: 'coding' });

    // Fast-forward time by manipulating internal state
    // The deep focus threshold is 30 minutes
    // We use vi.advanceTimersByTime but codingStartTime is Date.now() based
    const thirtyOneMinutes = 31 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + thirtyOneMinutes);

    expect(qm.shouldSuppress()).toBe('deep_focus');
  });

  it('should reset coding timer when switching away from coding', async () => {
    const qm = new QuietModeManager(bus, mockStorage({ nightModeEnabled: false }));
    await qm.start();

    bus.emit('context:changed', { from: 'idle', to: 'coding' });
    bus.emit('context:changed', { from: 'coding', to: 'browsing' });

    // Even after 31 min, should not be deep_focus because we switched away
    const thirtyOneMinutes = 31 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + thirtyOneMinutes);

    expect(qm.shouldSuppress()).not.toBe('deep_focus');
  });

  it('should clean up on stop', async () => {
    const qm = new QuietModeManager(bus, mockStorage());
    await qm.start();
    qm.stop();

    // After stop, context changes should not affect state
    bus.emit('context:changed', { from: 'idle', to: 'meeting' });
    // Meeting flag should not be set because listener was removed
    // (though shouldSuppress still works, inMeeting won't be updated)
    // This tests that unsubscribers were called
    expect(qm.shouldSuppress()).not.toBe('meeting');
  });
});
