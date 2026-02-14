import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { EventBus } from '../src/events';
import type { AppEvents } from '../src/types';
import { ContextAwareness } from '../src/features/context-awareness';
import type { BubbleManager } from '../src/core/bubble-manager';
import type { DialogueEngine } from '../src/features/dialogue-engine';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

function mockBubble(): BubbleManager {
  const say = vi.fn();
  return {
    say,
  } as unknown as BubbleManager;
}

function mockDialogue(): DialogueEngine {
  return {
    getContextLine: vi.fn().mockReturnValue('context line'),
  } as unknown as DialogueEngine;
}

describe('ContextAwareness', () => {
  let bus: EventBus<AppEvents>;

  beforeEach(() => {
    bus = new EventBus<AppEvents>();
    vi.mocked(invoke).mockReset();
  });

  afterEach(() => {
    bus.dispose();
  });

  it('should emit context change when switching from meeting to unknown', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ app_name: 'Zoom', title: 'Daily Sync' })
      .mockResolvedValueOnce({ app_name: 'NotMatchedApp', title: 'Some Window' });

    const bubble = mockBubble();
    const dialogue = mockDialogue();
    const awareness = new ContextAwareness(bus, bubble, dialogue);
    const events: AppEvents['context:changed'][] = [];
    bus.on('context:changed', (e) => events.push(e));

    await (awareness as any).poll();
    await (awareness as any).poll();

    expect(events).toEqual([
      { from: 'unknown', to: 'meeting' },
      { from: 'meeting', to: 'unknown' },
    ]);
    expect(awareness.currentContext).toBe('unknown');
    expect((bubble as any).say).toHaveBeenCalledTimes(1);
  });

  it('should not emit when context stays unknown', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      app_name: 'Unclassified',
      title: 'Random Window',
    });

    const bubble = mockBubble();
    const dialogue = mockDialogue();
    const awareness = new ContextAwareness(bus, bubble, dialogue);
    const handler = vi.fn();
    bus.on('context:changed', handler);

    await (awareness as any).poll();

    expect(handler).not.toHaveBeenCalled();
    expect(awareness.currentContext).toBe('unknown');
    expect((bubble as any).say).not.toHaveBeenCalled();
  });
});
