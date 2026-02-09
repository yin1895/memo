import { CONFIG, MODIFIER_KEY } from '../config';
import type { AppEvents } from '../types';
import type { EventBus } from '../events';
import type { ClickThroughManager } from './click-through';
import { showHint } from '../utils';

/**
 * 菜单项定义
 *
 * 通过 `setItems()` / `addItemBefore()` 动态管理菜单项，
 * 后续功能模块可以注入自己的菜单项（如番茄钟开关）。
 */
export interface MenuItem {
  type: 'action' | 'command' | 'separator';
  /** 唯一标识 */
  id: string;
  /** 显示文本（含 emoji） */
  label?: string;
  /** 点击处理函数 */
  handler?: () => Promise<void> | void;
}

/**
 * 右键菜单控制器
 *
 * 支持动态菜单项管理，方便后续功能扩展。
 */
export class MenuController {
  private menu: HTMLDivElement;
  private bus: EventBus<AppEvents>;
  private clickThrough: ClickThroughManager;

  private items: MenuItem[] = [];
  private _open = false;
  private clickThroughBeforeMenu = false;

  /** 菜单是否处于打开状态 */
  get open(): boolean {
    return this._open;
  }

  constructor(
    menu: HTMLDivElement,
    bus: EventBus<AppEvents>,
    clickThrough: ClickThroughManager,
  ) {
    this.menu = menu;
    this.bus = bus;
    this.clickThrough = clickThrough;
    this.setupMenuClick();
  }

  /** 设置完整的菜单项列表 */
  setItems(items: MenuItem[]): void {
    this.items = items;
    this.render();
  }

  /** 在指定 id 的菜单项之前插入新项 */
  addItemBefore(item: MenuItem, beforeId: string): void {
    const idx = this.items.findIndex(i => i.id === beforeId);
    if (idx >= 0) {
      this.items.splice(idx, 0, item);
    } else {
      this.items.push(item);
    }
    this.render();
  }

  /** 打开右键菜单 */
  async openMenu(): Promise<void> {
    try {
      // 菜单打开前暂停穿透
      this.clickThroughBeforeMenu = this.clickThrough.enabled;
      if (this.clickThrough.enabled) {
        await this.clickThrough.setEnabled(false);
      }

      this.updateToggleText();
      this.menu.classList.remove('menu-hidden');
      this._open = true;

      // 等待浏览器重排
      await new Promise(resolve => requestAnimationFrame(resolve));
      this.menu.style.left = `${CONFIG.MENU_PADDING}px`;
      this.menu.style.top = `${CONFIG.MENU_PADDING}px`;

      this.bus.emit('menu:opened');
    } catch (error) {
      console.error('打开菜单失败:', error);
      this._open = false;
      this.menu.classList.add('menu-hidden');
    }
  }

  /** 关闭右键菜单 */
  async closeMenu(): Promise<void> {
    if (!this._open) return;
    this._open = false;
    this.menu.classList.add('menu-hidden');

    // 恢复之前的穿透状态
    if (this.clickThroughBeforeMenu) {
      try {
        await this.clickThrough.setEnabled(true);
        showHint(`穿透：开（${MODIFIER_KEY}+Shift+P 关闭）`);
      } catch (error) {
        console.error('恢复穿透模式失败:', error);
        await this.clickThrough.setEnabled(false);
        showHint('恢复穿透模式失败', 2000);
      }
      this.clickThroughBeforeMenu = false;
    }

    this.bus.emit('menu:closed');
  }

  // ─── 内部方法 ───

  private render(): void {
    this.menu.innerHTML = this.items
      .map(item => {
        if (item.type === 'separator') {
          return '<div class="menu-sep"></div>';
        }
        return `<div class="menu-item" data-id="${item.id}">${item.label ?? ''}</div>`;
      })
      .join('');
  }

  private updateToggleText(): void {
    const el = this.menu.querySelector('[data-id="toggle-through"]');
    if (!el) return;
    const icon = this.clickThrough.enabled ? '✓' : '🖱';
    const text = this.clickThrough.enabled ? '关闭点击穿透' : '开启点击穿透';
    el.textContent = `${icon} ${text}`;
  }

  private setupMenuClick(): void {
    this.menu.addEventListener('click', async (e) => {
      const el = (e.target as HTMLElement).closest('.menu-item') as HTMLElement | null;
      if (!el || el.classList.contains('disabled')) return;

      const id = el.dataset.id;
      const item = this.items.find(i => i.id === id);
      if (!item?.handler) return;

      // 禁用所有菜单项防止重复点击
      const allItems = this.menu.querySelectorAll('.menu-item');
      allItems.forEach(i => i.classList.add('disabled'));

      try {
        await item.handler();
      } catch (error) {
        console.error('菜单操作失败:', error);
        showHint('操作失败', 2000);
      } finally {
        allItems.forEach(i => i.classList.remove('disabled'));
      }
    });
  }
}
