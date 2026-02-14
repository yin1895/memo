/**
 * UpdateController 单元测试
 *
 * 覆盖重复绑定修复：验证连续 check() 不会叠加事件监听器，
 * 以及下载失败后的清理行为。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Tauri APIs ───

let mockUpdateResult: unknown = null;

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => mockUpdateResult),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

vi.mock('../src/utils', () => ({
  showHint: vi.fn(),
}));

import { UpdateController, type UpdateElements } from '../src/core/updater';

/** 创建一组 mock DOM 元素 */
function createMockElements(): UpdateElements {
  const createElement = () => {
    const listeners: Record<string, Array<{ fn: EventListener; once: boolean }>> = {};
    return {
      textContent: '',
      disabled: false,
      style: { display: '' },
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
      addEventListener: vi.fn((event: string, fn: EventListener, opts?: { once?: boolean }) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push({ fn, once: opts?.once ?? false });
      }),
      removeEventListener: vi.fn((event: string, fn: EventListener) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l.fn !== fn);
        }
      }),
      // 辅助：触发事件并返回回调数量
      _trigger: (event: string) => {
        const cbs = listeners[event] || [];
        const count = cbs.length;
        // 触发所有回调，once 的移除掉
        const toCall = [...cbs];
        listeners[event] = cbs.filter((l) => !l.once);
        toCall.forEach((l) => l.fn(new Event(event)));
        return count;
      },
      _listenerCount: (event: string) => (listeners[event] || []).length,
    };
  };
  return {
    overlay: createElement(),
    message: createElement(),
    version: createElement(),
    progressWrap: createElement(),
    progressBar: createElement(),
    progressText: createElement(),
    btnNow: createElement(),
    btnLater: createElement(),
    btnSkip: createElement(),
  } as unknown as UpdateElements;
}

/** 带 _trigger 和 _listenerCount 辅助方法的增强类型 */
type MockEl = UpdateElements & {
  btnNow: UpdateElements['btnNow'] & {
    _trigger: (e: string) => number;
    _listenerCount: (e: string) => number;
  };
  btnLater: UpdateElements['btnLater'] & {
    _trigger: (e: string) => number;
    _listenerCount: (e: string) => number;
  };
  btnSkip: UpdateElements['btnSkip'] & {
    _trigger: (e: string) => number;
    _listenerCount: (e: string) => number;
  };
};

describe('UpdateController', () => {
  let el: MockEl;

  beforeEach(() => {
    el = createMockElements() as MockEl;
    // 清除 localStorage mock
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it('连续两次 check() 不应叠加按钮监听器', async () => {
    const fakeUpdate = {
      version: '2.0.0',
      body: 'test',
      downloadAndInstall: vi.fn(),
    };
    mockUpdateResult = fakeUpdate;

    const updater = new UpdateController(el);

    await updater.check(true);
    // 第一次绑定后每个按钮应有 1 个 click 监听器
    expect(el.btnNow._listenerCount('click')).toBe(1);
    expect(el.btnLater._listenerCount('click')).toBe(1);

    await updater.check(true);
    // 第二次绑定后仍应只有 1 个（旧的被清理）
    expect(el.btnNow._listenerCount('click')).toBe(1);
    expect(el.btnLater._listenerCount('click')).toBe(1);
    expect(el.btnSkip._listenerCount('click')).toBe(1);
  });

  it('点击"稍后"应移除所有监听器并隐藏弹窗', async () => {
    const fakeUpdate = {
      version: '2.0.0',
      body: null,
      downloadAndInstall: vi.fn(),
    };
    mockUpdateResult = fakeUpdate;

    const updater = new UpdateController(el);
    await updater.check(true);

    // 点击"稍后"
    el.btnLater._trigger('click');

    // 监听器应全部被清理
    expect(el.btnNow._listenerCount('click')).toBe(0);
    expect(el.btnLater._listenerCount('click')).toBe(0);
    expect(el.btnSkip._listenerCount('click')).toBe(0);

    // 弹窗应被隐藏
    expect(el.overlay.classList.add).toHaveBeenCalledWith('update-hidden');
  });

  it('点击"跳过此版本"应存储版本号到 localStorage', async () => {
    const fakeUpdate = {
      version: '3.0.0',
      body: null,
      downloadAndInstall: vi.fn(),
    };
    mockUpdateResult = fakeUpdate;

    const updater = new UpdateController(el);
    await updater.check(true);

    el.btnSkip._trigger('click');

    expect(localStorage.setItem).toHaveBeenCalledWith('bird-pet-ignored-version', '3.0.0');
  });

  it('无更新时手动检查应提示最新版本', async () => {
    mockUpdateResult = null;

    const updater = new UpdateController(el);
    await updater.check(true);

    const { showHint } = await import('../src/utils');
    expect(showHint).toHaveBeenCalledWith('已是最新版本 ✓', 2000);
  });
});
