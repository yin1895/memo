/**
 * EventBus 单元测试
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events';

type TestEvents = {
  'test:void': void;
  'test:data': { value: number };
  'test:string': string;
};

describe('EventBus', () => {
  it('should subscribe and receive events', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('test:data', handler);
    bus.emit('test:data', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('should handle void events without payload', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('test:void', handler);
    bus.emit('test:void');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should support multiple listeners on same event', () => {
    const bus = new EventBus<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test:data', h1);
    bus.on('test:data', h2);
    bus.emit('test:data', { value: 1 });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should unsubscribe via returned function', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const unsub = bus.on('test:data', handler);
    unsub();
    bus.emit('test:data', { value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support once (auto-unsub after first call)', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.once('test:data', handler);
    bus.emit('test:data', { value: 1 });
    bus.emit('test:data', { value: 2 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ value: 1 });
  });

  it('should dispose all listeners', () => {
    const bus = new EventBus<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test:void', h1);
    bus.on('test:data', h2);
    bus.dispose();
    bus.emit('test:void');
    bus.emit('test:data', { value: 1 });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('should not throw when emitting event with no listeners', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit('test:void')).not.toThrow();
  });
});
