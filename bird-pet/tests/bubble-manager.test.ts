/**
 * BubbleManager 单元测试
 *
 * 覆盖启动竞态修复：验证 listen('bubble:ready') 在窗口创建之前注册，
 * 以及超时保护机制。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Tauri APIs ───

// 记录调用顺序以验证竞态修复
const callOrder: string[] = [];

// listen 的回调存储，测试中手动触发
let listenCallbacks: Record<string, (event: unknown) => void> = {};
const mockUnlisten = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, cb: (event: unknown) => void) => {
    callOrder.push(`listen:${event}`);
    listenCallbacks[event] = cb;
    return mockUnlisten;
  }),
  emitTo: vi.fn(),
}));

// WebviewWindow mock：once 立即触发 tauri://created
let windowCreatedCb: (() => void) | null = null;
let windowErrorCb: ((e: unknown) => void) | null = null;

vi.mock('@tauri-apps/api/webviewWindow', () => {
  class MockWebviewWindow {
    constructor() {
      callOrder.push('new WebviewWindow');
    }
    once(event: string, cb: (...args: unknown[]) => void) {
      if (event === 'tauri://created') windowCreatedCb = cb;
      if (event === 'tauri://error') windowErrorCb = cb;
    }
    show = vi.fn();
    hide = vi.fn();
    close = vi.fn();
    setPosition = vi.fn();
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
    callOrder.length = 0;
    listenCallbacks = {};
    windowCreatedCb = null;
    windowErrorCb = null;
    mockUnlisten.mockClear();
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
    listenCallbacks['bubble:ready']?.({});

    await initPromise;

    // 验证调用顺序：listen 必须在 new WebviewWindow 之前
    const listenIdx = callOrder.indexOf('listen:bubble:ready');
    const windowIdx = callOrder.indexOf('new WebviewWindow');
    expect(listenIdx).toBeGreaterThanOrEqual(0);
    expect(windowIdx).toBeGreaterThanOrEqual(0);
    expect(listenIdx).toBeLessThan(windowIdx);
  });

  it('bubble:ready 就绪后应调用 unlisten 释放监听器', async () => {
    const manager = new BubbleManager();
    const initPromise = manager.init();

    windowCreatedCb?.();
    listenCallbacks['bubble:ready']?.({});

    await initPromise;

    // unlisten 应被调用
    expect(mockUnlisten).toHaveBeenCalled();
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
    expect(mockUnlisten).toHaveBeenCalled();
  }, 15_000);

  it('窗口创建失败应 reject', async () => {
    const manager = new BubbleManager();
    const initPromise = manager.init();

    // 模拟窗口创建失败
    windowErrorCb?.(new Error('window creation failed'));

    await expect(initPromise).rejects.toThrow('window creation failed');
  });
});
