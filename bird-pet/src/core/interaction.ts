import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { exit } from '@tauri-apps/plugin-process';
import { CONFIG } from '../config';
import type { AppEvents } from '../types';
import type { EventBus } from '../events';
import type { AnimationEngine } from './animation';
import type { ClickThroughManager } from './click-through';
import type { MenuController } from './menu';
import type { QuietModeManager } from '../features/quiet-mode';

/** setupInteraction 所需依赖 */
export interface InteractionDeps {
  canvas: HTMLCanvasElement;
  app: HTMLDivElement;
  animation: AnimationEngine;
  clickThrough: ClickThroughManager;
  menu: MenuController;
  bus: EventBus<AppEvents>;
  quietMode?: QuietModeManager;
  /** 统一退出回调（包含 gracefulShutdown + exit） */
  onQuit?: () => Promise<void>;
}

/**
 * 设置用户交互
 *
 * 包括：拖动、点击触发动作、右键菜单唤起、ESC 关闭、
 * 全局快捷键、自动随机动作。
 *
 * @returns 清理函数（用于 beforeunload 等场景）
 */
export function setupInteraction(deps: InteractionDeps): () => void {
  const { canvas, app, animation, clickThrough, menu, bus, quietMode, onQuit } = deps;
  const win = getCurrentWindow();

  let timer: number | null = null;
  let dragged = false;
  let isDragging = false;

  const clearDrag = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
    isDragging = false;
  };

  // ─── 右键菜单 ───
  const onContextMenu = async (e: MouseEvent) => {
    if (clickThrough.enabled || menu.open) return;
    e.preventDefault();
    clearDrag();
    await menu.openMenu();
  };
  canvas.addEventListener('contextmenu', onContextMenu);

  // 点击空白处关闭菜单
  const onAppPointerDown = async (e: PointerEvent) => {
    if (!menu.open) return;
    if ((e.target as HTMLElement).closest('#menu')) return;
    await menu.closeMenu();
  };
  app.addEventListener('pointerdown', onAppPointerDown);

  // ESC 关闭菜单
  const onKeydown = async (e: KeyboardEvent) => {
    if (e.key === 'Escape') await menu.closeMenu();
  };
  window.addEventListener('keydown', onKeydown);

  // ─── 拖动 & 点击 ───
  const onPointerDown = () => {
    if (clickThrough.enabled || menu.open) return;
    dragged = false;
    isDragging = false;
    timer = window.setTimeout(async () => {
      isDragging = true;
      dragged = true;
      bus.emit('pet:dragged');
      await win.startDragging();
    }, CONFIG.DRAG_DELAY);
  };
  canvas.addEventListener('pointerdown', onPointerDown);

  const onPointerUp = () => {
    if (clickThrough.enabled || isDragging) return;
    clearDrag();
    if (!dragged && !animation.isLocked()) {
      animation.playRandomAction();
      bus.emit('pet:clicked');
    }
  };
  canvas.addEventListener('pointerup', onPointerUp);

  canvas.addEventListener('pointerleave', clearDrag);

  // ─── 自动随机动作 ───
  const autoPlayTimer = window.setInterval(() => {
    if (clickThrough.enabled) return;
    if (animation.getCurrentAnimation() !== 'idle') return;
    if (animation.isLocked()) return;
    // 低打扰模式：勿扰/会议时完全静默，深夜时完全停止自动动画
    if (quietMode?.isFullSilent()) return;
    if (quietMode?.isNightMode()) return;
    if (Math.random() < CONFIG.AUTO_ACTION_PROBABILITY) {
      animation.playRandomAction();
    }
  }, CONFIG.AUTO_ACTION_INTERVAL);

  // ─── 全局快捷键 ───
  const shortcutsReady = setupShortcuts(clickThrough, onQuit).catch((error) => {
    console.error('注册全局快捷键失败:', error);
  });

  // ─── 清理 ───
  return () => {
    window.clearInterval(autoPlayTimer);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointerleave', clearDrag);
    app.removeEventListener('pointerdown', onAppPointerDown);
    window.removeEventListener('keydown', onKeydown);
    void shortcutsReady.finally(() => {
      unregisterAll().catch((error) => {
        console.warn('清理全局快捷键失败:', error);
      });
    });
  };
}

async function setupShortcuts(
  clickThrough: ClickThroughManager,
  onQuit?: () => Promise<void>,
): Promise<void> {
  await register('CommandOrControl+Shift+P', () => clickThrough.toggle());
  try {
    await register('CommandOrControl+Shift+Q', async () => {
      if (onQuit) {
        await onQuit();
      } else {
        await unregisterAll();
        await exit(0);
      }
    });
  } catch (error) {
    try {
      await unregisterAll();
    } catch (cleanupError) {
      console.warn('快捷键注册回滚失败:', cleanupError);
    }
    throw error;
  }
}
