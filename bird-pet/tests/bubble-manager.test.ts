/**
 * BubbleManager 单元测试
 *
 * 覆盖启动竞态修复：验证 listen('bubble:ready') 在窗口创建之前注册，
 * 以及超时保护机制。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Tauri APIs ───

const hoisted = vi.hoisted(() => ({
  // 记录调用顺序以验证竞态修复
  callOrder: [] as string[],
  // listen 的回调存储，测试中手动触发
  listenCallbacks: {} as Record<string, (event: unknown) => void>,
  mockUnlisten: vi.fn(),
  mockEmitTo: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, cb: (event: unknown) => void) => {
    hoisted.callOrder.push(`listen:${event}`);
    hoisted.listenCallbacks[event] = cb;
    return hoisted.mockUnlisten;
  }),
  emitTo: hoisted.mockEmitTo,
}));

// WebviewWindow mock：once 立即触发 tauri://created
let windowCreatedCb: (() => void) | null = null;
let windowErrorCb: ((e: unknown) => void) | null = null;

vi.mock('@tauri-apps/api/webviewWindow', () => {
  class MockWebviewWindow {
    constructor() {
      hoisted.callOrder.push('new WebviewWindow');
    }
    once(event: string, cb: (...args: unknown[]) => void) {
      if (event === 'tauri://created') windowCreatedCb = cb;
      if (event === 'tauri://error') windowErrorCb = cb;
    }
    show = vi.fn(async () => {});
    hide = vi.fn(async () => {});
    close = vi.fn(async () => {});
    setPosition = vi.fn(async () => {});
  }
  return { WebviewWindow: MockWebviewWindow };
});

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onMoved: vi.fn(async () => vi.fn()),
    outerPosition: vi.fn(async () => ({ x: 0, y: 0 })),
    outerSize: vi.fn(async () => ({ width: 100, height: 100 })),
    scaleFactor: vi.fn(async () => 1),
  })),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  PhysicalPosition: vi.fn(),
}));

import { BubbleManager } from '../src/core/bubble-manager';

describe('BubbleManager', () => {
  beforeEach(() => {
    hoisted.callOrder.length = 0;
    hoisted.listenCallbacks = {};
    windowCreatedCb = null;
    windowErrorCb = null;
    hoisted.mockUnlisten.mockClear();
    hoisted.mockEmitTo.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('应在创建 WebviewWindow 之前注册 bubble:ready 监听器（竞态修复）', async () => {
    const manager = new BubbleManager();

    const initPromise = manager.init();

    // 模拟窗口创建成功
    windowCreatedCb?.();
    // 模拟脚本就绪
    hoisted.listenCallbacks['bubble:ready']?.({});

    await initPromise;

    // 验证调用顺序：listen 必须在 new WebviewWindow 之前
    const listenIdx = hoisted.callOrder.indexOf('listen:bubble:ready');
    const windowIdx = hoisted.callOrder.indexOf('new WebviewWindow');
    expect(listenIdx).toBeGreaterThanOrEqual(0);
    expect(windowIdx).toBeGreaterThanOrEqual(0);
    expect(listenIdx).toBeLessThan(windowIdx);
  });

  it('bubble:ready 就绪后应调用 unlisten 释放监听器', async () => {
    const manager = new BubbleManager();
    const initPromise = manager.init();

    windowCreatedCb?.();
    hoisted.listenCallbacks['bubble:ready']?.({});

    await initPromise;

    // unlisten 应被调用
    expect(hoisted.mockUnlisten).toHaveBeenCalled();
  });

  it('气泡就绪超时应 reject 而非永久挂起，且 unlisten 仍会被释放', async () => {
    const manager = new BubbleManager();
    const initPromise = manager.init();

    // 提前附加 rejection 处理器，避免 unhandled rejection 警告
    const expectation = expect(initPromise).rejects.toThrow('bubble:ready timeout');

    // 模拟窗口创建成功，但不触发 bubble:ready
    windowCreatedCb?.();

    // 快进超过超时时间（使用 fake timer 推进 setTimeout）
    await vi.advanceTimersByTimeAsync(BubbleManager.READY_TIMEOUT + 100);

    await expectation;

    // 即使超时，unlisten 也应被 finally 块调用释放
    expect(hoisted.mockUnlisten).toHaveBeenCalled();
  }, 15_000);

  it('窗口创建失败应 reject', async () => {
    const manager = new BubbleManager();
    const initPromise = manager.init();

    // 模拟窗口创建失败
    windowErrorCb?.(new Error('window creation failed'));

    await expect(initPromise).rejects.toThrow('window creation failed');
  });

  it('过期 dismiss（messageId 不匹配）应被丢弃，队列不会推进', async () => {
    const manager = new BubbleManager();
    const initPromise = manager.init();
    windowCreatedCb?.();
    hoisted.listenCallbacks['bubble:ready']?.({});
    await initPromise;

    manager.say({ text: 'first', duration: 500 });
    await vi.waitFor(() => expect(hoisted.mockEmitTo).toHaveBeenCalledTimes(1));
    const firstPayload = hoisted.mockEmitTo.mock.calls[0][2] as { messageId: string };

    manager.say({ text: 'second', duration: 500 });

    // 旧消息的 dismiss 到达（messageId 不匹配）应被忽略
    hoisted.listenCallbacks['bubble:dismissed']?.({
      payload: { messageId: `${firstPayload.messageId}-stale` },
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(hoisted.mockEmitTo).toHaveBeenCalledTimes(1);
  });

  it('高优先级抢占后，旧消息 dismiss 不会双重推进队列', async () => {
    const manager = new BubbleManager();
    const initPromise = manager.init();
    windowCreatedCb?.();
    hoisted.listenCallbacks['bubble:ready']?.({});
    await initPromise;

    manager.say({ text: 'normal-1', priority: 'normal', duration: 500 });
    await vi.waitFor(() => expect(hoisted.mockEmitTo).toHaveBeenCalledTimes(1));

    manager.say({ text: 'normal-2', priority: 'normal', duration: 500 });
    manager.say({ text: 'urgent', priority: 'high', duration: 500 });
    await vi.waitFor(() => expect(hoisted.mockEmitTo).toHaveBeenCalledTimes(2));

    const firstPayload = hoisted.mockEmitTo.mock.calls[0][2] as { messageId: string };
    const urgentPayload = hoisted.mockEmitTo.mock.calls[1][2] as { messageId: string };

    // 旧消息 dismiss 到达：应被忽略，不推进到 normal-2
    hoisted.listenCallbacks['bubble:dismissed']?.({
      payload: { messageId: firstPayload.messageId },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(hoisted.mockEmitTo).toHaveBeenCalledTimes(2);

    // 当前 urgent dismiss：推进一次，播放 normal-2
    hoisted.listenCallbacks['bubble:dismissed']?.({
      payload: { messageId: urgentPayload.messageId },
    });
    await vi.waitFor(() => expect(hoisted.mockEmitTo).toHaveBeenCalledTimes(3));
    expect((hoisted.mockEmitTo.mock.calls[2][2] as { text: string }).text).toBe('normal-2');
  });
});
