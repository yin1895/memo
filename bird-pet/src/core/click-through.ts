import { getCurrentWindow } from '@tauri-apps/api/window';
import { CONFIG, MODIFIER_KEY } from '../config';
import type { AppEvents } from '../types';
import type { EventBus } from '../events';
import { showHint } from '../utils';

/**
 * 点击穿透管理器
 *
 * 控制窗口的鼠标事件穿透状态，
 * 状态变更通过 EventBus 广播。
 */
export class ClickThroughManager {
  private win = getCurrentWindow();
  private bus: EventBus<AppEvents>;
  private app: HTMLDivElement;

  private _enabled = false;
  private lastToggleAt = 0;
  private isToggling = false;

  /** 当前是否处于穿透状态 */
  get enabled(): boolean {
    return this._enabled;
  }

  constructor(app: HTMLDivElement, bus: EventBus<AppEvents>) {
    this.app = app;
    this.bus = bus;
  }

  /** 切换穿透状态（带防抖） */
  async toggle(): Promise<void> {
    const now = Date.now();
    if (now - this.lastToggleAt < CONFIG.TOGGLE_DEBOUNCE || this.isToggling) return;

    this.isToggling = true;
    this.lastToggleAt = now;

    try {
      await this.setEnabled(!this._enabled);

      const hint = this._enabled
        ? `穿透：开（${MODIFIER_KEY}+Shift+P 关闭）`
        : `穿透：关（可拖动/可点击）`;
      showHint(hint);
    } catch (error) {
      console.error('切换穿透模式失败:', error);
      showHint('切换穿透模式失败', 2000);
    } finally {
      this.isToggling = false;
    }
  }

  /** 强制设置穿透状态（菜单系统内部使用） */
  async setEnabled(value: boolean): Promise<void> {
    if (this._enabled === value) return;
    await this.win.setIgnoreCursorEvents(value);
    this._enabled = value;
    this.updateVisual();
    this.bus.emit('clickthrough:changed', { enabled: this._enabled });
  }

  private updateVisual(): void {
    this.app.classList.toggle('click-through', this._enabled);
  }
}
