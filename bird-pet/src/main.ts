/**
 * Bird Pet - 桌面宠物应用入口
 *
 * 此文件是精简的编排层，负责：
 * 1. 初始化各模块
 * 2. 通过 EventBus 连接模块
 * 3. 配置菜单项
 * 4. 启动应用
 *
 * 具体逻辑分散在 core/ 下各模块中。
 */
import './style.css';
import { unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { exit } from '@tauri-apps/plugin-process';
import { EventBus } from './events';
import type { AppEvents } from './types';
import { initHint, showHint } from './utils';
import { AnimationEngine } from './core/animation';
import { ClickThroughManager } from './core/click-through';
import { MenuController, type MenuItem } from './core/menu';
import { setupInteraction } from './core/interaction';
import { UpdateController } from './core/updater';
import { BubbleManager } from './core/bubble-manager';

async function main() {
  try {
    // ─── 事件总线 ───
    const bus = new EventBus<AppEvents>();

    // ─── DOM 引用 ───
    const app = document.querySelector<HTMLDivElement>('#app')!;
    const canvas = document.getElementById('pet') as HTMLCanvasElement;
    initHint(document.getElementById('hint') as HTMLDivElement);

    // ─── 核心模块初始化 ───
    const animation = new AnimationEngine(canvas, bus);
    await animation.load();

    const clickThrough = new ClickThroughManager(app, bus);

    const menu = new MenuController(
      document.getElementById('menu') as HTMLDivElement,
      bus,
      clickThrough,
    );

    // ─── 气泡系统 ───
    const bubble = new BubbleManager();
    await bubble.init();

    const updater = new UpdateController({
      overlay: document.getElementById('update-overlay') as HTMLDivElement,
      message: document.getElementById('update-message') as HTMLDivElement,
      version: document.getElementById('update-version') as HTMLDivElement,
      progressWrap: document.getElementById('update-progress-wrap') as HTMLDivElement,
      progressBar: document.getElementById('update-progress-bar') as HTMLDivElement,
      progressText: document.getElementById('update-progress-text') as HTMLDivElement,
      btnNow: document.getElementById('btn-update-now') as HTMLButtonElement,
      btnLater: document.getElementById('btn-update-later') as HTMLButtonElement,
      btnSkip: document.getElementById('btn-update-skip') as HTMLButtonElement,
    });

    // ─── 菜单项配置 ───
    const menuItems: MenuItem[] = [
      {
        type: 'action', id: 'idle', label: '▶ 待机（idle）',
        handler: () => { animation.play('idle'); menu.closeMenu(); },
      },
      {
        type: 'action', id: 'look', label: '👀 左右张望（look）',
        handler: () => { animation.play('look'); menu.closeMenu(); },
      },
      {
        type: 'action', id: 'tilt', label: '🙂 歪头（tilt）',
        handler: () => { animation.play('tilt'); menu.closeMenu(); },
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'command', id: 'test-say', label: '💬 测试说话',
        handler: async () => {
          await menu.closeMenu();
          bubble.sayText('嘿嘿！今天也要加油鸭！💪');
        },
      },
      {
        type: 'command', id: 'check-update', label: '🔄 检查更新',
        handler: async () => { await menu.closeMenu(); await updater.check(true); },
      },
      {
        type: 'command', id: 'toggle-through', label: '🖱 切换点击穿透',
        handler: async () => {
          await menu.closeMenu();
          await new Promise(r => setTimeout(r, 100));
          await clickThrough.toggle();
        },
      },
      {
        type: 'command', id: 'quit', label: '⛔ 退出',
        handler: async () => { await unregisterAll(); await exit(0); },
      },
    ];
    menu.setItems(menuItems);

    // ─── 交互初始化 ───
    const cleanupInteraction = setupInteraction({
      canvas, app, animation, clickThrough, menu, bus,
    });

    // ─── 启动动画 ───
    animation.start();

    // ─── 生命周期 ───
    window.addEventListener('beforeunload', async () => {
      cleanupInteraction();
      await bubble.dispose();
      bus.dispose();
      await unregisterAll();
    });

    // 静默检查更新（2 秒后，不阻塞主流程）
    setTimeout(() => updater.check(false), 2000);
  } catch (e) {
    console.error('启动失败:', e);
    showHint('启动失败：打开控制台查看详情', 3000);
  }
}

main();
