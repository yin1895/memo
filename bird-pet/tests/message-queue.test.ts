/**
 * MessageQueue 单元测试
 */
import { describe, it, expect, vi } from 'vitest';
import { MessageQueue } from '../src/core/message-queue';

describe('MessageQueue', () => {
  it('should play a normal message', async () => {
    const queue = new MessageQueue();
    const handler = vi.fn().mockResolvedValue(undefined);
    queue.onPlay(handler);

    queue.push({ text: 'hello', priority: 'normal' });

    // playHandler is called asynchronously
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    expect(handler.mock.calls[0][0]).toMatchObject({
      text: 'hello',
      priority: 'normal',
      duration: 3000,
    });
  });

  it('should default priority to normal and duration to 3000', async () => {
    const queue = new MessageQueue();
    const handler = vi.fn().mockResolvedValue(undefined);
    queue.onPlay(handler);

    queue.push({ text: 'test' });

    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    expect(handler.mock.calls[0][0].priority).toBe('normal');
    expect(handler.mock.calls[0][0].duration).toBe(3000);
  });

  it('should drop low priority when queue is full', () => {
    const queue = new MessageQueue();
    // Don't set a play handler so messages accumulate
    const handler = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    queue.onPlay(handler);

    // First push starts playing (1 active + 0 in queue)
    queue.push({ text: '1', priority: 'normal' });
    // Fill up queue (max 5 in queue)
    queue.push({ text: '2', priority: 'normal' });
    queue.push({ text: '3', priority: 'normal' });
    queue.push({ text: '4', priority: 'normal' });
    queue.push({ text: '5', priority: 'normal' });
    queue.push({ text: '6', priority: 'normal' });

    // Low priority should be dropped
    queue.push({ text: 'dropped', priority: 'low' });

    // Queue should not grow beyond MAX_QUEUE_SIZE
    // (handler was called once for '1', the rest are queued)
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should prioritize high priority messages', async () => {
    const queue = new MessageQueue();
    const played: string[] = [];
    const handler = vi.fn().mockImplementation(async (msg) => {
      played.push(msg.text);
    });
    queue.onPlay(handler);

    queue.push({ text: 'normal1' });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    // While playing, push messages
    queue.push({ text: 'normal2', priority: 'normal' });
    queue.push({ text: 'urgent', priority: 'high' });
    queue.done(); // finish current normal1

    // After done(), queue processes remaining: high first, then normal
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(3));
    // High priority should be played before normal2
    expect(played[1]).toBe('urgent');
    expect(played[2]).toBe('normal2');
  });

  it('should clear queue', async () => {
    const queue = new MessageQueue();
    const handler = vi.fn().mockImplementation(() => new Promise(() => {}));
    queue.onPlay(handler);

    queue.push({ text: '1' });
    queue.push({ text: '2' });
    queue.clear();

    expect(queue.playing).toBe(false);
  });
});
