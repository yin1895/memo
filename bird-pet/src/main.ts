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
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, emit } from '@tauri-apps/api/event';
import { EventBus } from './events';
import type { AppEvents } from './types';
import { initHint, showHint, getLocalDateKey } from './utils';
import { AnimationEngine } from './core/animation';
import { ClickThroughManager } from './core/click-through';
import { MenuController, type MenuItem } from './core/menu';
import { setupInteraction } from './core/interaction';
import { UpdateController } from './core/updater';
import { BubbleManager } from './core/bubble-manager';
import { StorageService, STORE_KEYS } from './core/storage';
import { MemorySystem } from './core/memory';
import { EffectsManager } from './core/effects';
import { IdleCareScheduler } from './features/idle-care';
import { HourlyChime } from './features/hourly-chime';
import { PomodoroTimer } from './features/pomodoro';
import { SystemMonitor } from './features/system-monitor';
import { ContextAwareness } from './features/context-awareness';
import { DialogueEngine } from './features/dialogue-engine';
import { DIALOGUE_ENTRIES } from './features/messages';
import { SpecialDateManager } from './features/special-dates';
import { GreetingManager } from './features/greeting';
import { MemoryCardManager } from './features/memory-card';
import { MemoryPanelManager } from './features/memory-panel';
import { QuietModeManager } from './features/quiet-mode';
import {
  clearDirtyShutdown,
  hasDirtyShutdown,
  markDirtyOnBeforeUnload,
} from './core/dirty-shutdown';

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

    // ─── v0.3.0: 新增核心模块 ───
    const storage = new StorageService();
    const dialogue = new DialogueEngine(DIALOGUE_ENTRIES);
    const effects = new EffectsManager();

    // ─── v1.0.0: 加载主人信息并注入对话引擎 ───
    const petOwner = await storage.getPetOwner();
    const metDateObj = new Date(petOwner.metDate + 'T00:00:00');
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const daysSinceMet = Math.max(0, Math.floor((todayDate.getTime() - metDateObj.getTime()) / (1000 * 60 * 60 * 24)));
    dialogue.setGlobalVars({
      name: petOwner.name,
      nickname: petOwner.nicknames[0],
      nicknames: petOwner.nicknames,
      metDate: petOwner.metDate,
      daysSinceMet,
    });

    // ─── v0.4.0: 记忆系统 ───
    const memory = new MemorySystem(bus, storage);

    // ─── v1.0.0: 低打扰智能模式 ───
    const quietMode = new QuietModeManager(bus, storage);

    // ─── 功能模块 ───
    const idleCare = new IdleCareScheduler(bus, bubble, dialogue, memory, quietMode);
    const hourlyChime = new HourlyChime(bubble, dialogue, storage, quietMode);
    const pomodoro = new PomodoroTimer(bus, bubble, hourlyChime, dialogue);
    const systemMonitor = new SystemMonitor(bubble, storage);
    const contextAwareness = new ContextAwareness(bus, bubble, dialogue, storage, quietMode);

    // ─── v0.5.0: 特殊日期 + 时段问候 ───
    const specialDates = new SpecialDateManager(bubble, dialogue, effects, storage);
    const greeting = new GreetingManager(bubble, dialogue, effects);

    // ─── v1.0.0: 回忆卡片管理器 ───
    const memoryCard = new MemoryCardManager(bus, memory, storage, petOwner, daysSinceMet);

    // ─── v1.0.0: 回忆面板管理器 ───
    const memoryPanel = new MemoryPanelManager(memory, petOwner, daysSinceMet);

    // 点击宠物 → 对话引擎选取台词 + 粒子特效
    bus.on('pet:clicked', () => {
      bubble.say({ text: dialogue.getLine('click'), priority: 'normal' });
      // 随机播放心形或星星特效
      if (Math.random() > 0.5) {
        effects.playHearts();
      } else {
        effects.playSparks();
      }
      // 记录交互
      storage.incrementInteraction();
    });

    // 行为上下文变更 → 播放对应特效
    bus.on('context:changed', ({ to }) => {
      effects.playForContext(to);
    });

    // 番茄钟开始 → 弹跳特效
    bus.on('pomodoro:focus', () => {
      effects.playBounce();
    });

    // 记忆系统洞察 → 反思性对话（v0.4.0）
    bus.on('memory:insight', ({ type }) => {
      const scene = `reflective_${type}` as import('./features/dialogue-engine').DialogueScene;
      const snapshot = memory.getSnapshot();
      const line = dialogue.getLine(scene, { hour: new Date().getHours(), ...snapshot });
      if (line !== '啾啾！') {
        bubble.say({ text: line, priority: 'high', duration: 6000 });
      }
    });

    // 记忆系统里程碑 → 专属台词 + 特效（v1.0.0）
    bus.on('memory:milestone', ({ message }) => {
      bubble.say({ text: `🏆 ${message}`, priority: 'high', duration: 6000 });
      effects.playConfetti();
    });

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

    // ─── 退出相关变量预声明（避免 gracefulShutdown 在启动期被调用时命中 TDZ） ───
    let shutdownCalled = false;
    let gracefulShutdownStarted = false;
    let unlistenAutostart: Promise<() => void> = Promise.resolve(() => {});
    let unlistenMemories: Promise<() => void> = Promise.resolve(() => {});
    let unlistenRequestQuit: Promise<() => void> = Promise.resolve(() => {});
    let autoSaveTimer: number = 0;

    // ─── 统一清理函数（所有退出路径共用） ───
    async function gracefulShutdown(): Promise<void> {
      if (shutdownCalled) return;
      shutdownCalled = true;
      gracefulShutdownStarted = true;

      // 阶段 1：保存窗口位置 & 释放监听（可失败，不阻断后续保存）
      try {
        const mainWindow = getCurrentWindow();
        const pos = await mainWindow.outerPosition();
        await storage.setWindowPosition({ x: pos.x, y: pos.y });
      } catch (e) {
        console.warn('gracefulShutdown: 保存窗口位置失败:', e);
      }

      try {
        clearInterval(autoSaveTimer);
        (await unlistenAutostart)();
        (await unlistenMemories)();
        (await unlistenRequestQuit)();
        cleanupInteraction();
      } catch (e) {
        console.warn('gracefulShutdown: 释放监听/清理交互失败:', e);
      }

      // 阶段 2：停止功能模块（可失败，不阻断数据保存）
      try {
        idleCare.stop();
        hourlyChime.stop();
        pomodoro.stop();
        systemMonitor.stop();
        contextAwareness.destroy();
        quietMode.stop();
        memory.stop();
        memoryCard.dispose();
        memoryPanel.dispose();
      } catch (e) {
        console.warn('gracefulShutdown: 停止功能模块失败:', e);
      }

      // 阶段 3：关键数据落盘（必须执行）
      try {
        await memory.save();
        await storage.save();
      } catch (e) {
        console.error('gracefulShutdown: 数据保存失败:', e);
      }

      // 阶段 4：清理全局资源（可失败）
      try {
        await bubble.dispose();
        bus.dispose();
        await unregisterAll();
      } catch (e) {
        console.warn('gracefulShutdown: 清理全局资源失败:', e);
      }

      // 清除脏退出标记
      clearDirtyShutdown();
    }

    // ─── 脏退出检测（上次未正常退出时提示） ───
    if (hasDirtyShutdown()) {
      console.warn('检测到上次非正常退出');
      // 延迟提示，等气泡系统就绪
      setTimeout(() => {
        bubble.say({ text: '上次没来得及好好告别呢…这次我会好好守护数据的！', priority: 'low', duration: 5000 });
      }, 5000);
    }

    // ─── 菜单项配置 ───
    /** 动态更新番茄钟菜单项文字 */
    const updatePomodoroLabel = () => {
      const el = document.querySelector('[data-id="pomodoro"]');
      if (el) el.textContent = pomodoro.getStatusLabel();
    };

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
      { type: 'separator', id: 'sep-anim' },
      {
        type: 'command', id: 'pomodoro', label: '🍅 番茄钟',
        handler: async () => {
          await menu.closeMenu();
          if (pomodoro.state === 'idle') {
            pomodoro.start();
          } else {
            pomodoro.stop();
          }
        },
      },
      { type: 'separator', id: 'sep-tools' },
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
        handler: async () => { await gracefulShutdown(); await exit(0); },
      },
    ];
    menu.setItems(menuItems);

    // 菜单打开时刷新番茄钟状态
    bus.on('menu:opened', updatePomodoroLabel);

    // ─── 交互初始化 ───
    const cleanupInteraction = setupInteraction({
      canvas, app, animation, clickThrough, menu, bus, quietMode,
      onQuit: async () => { await gracefulShutdown(); await exit(0); },
    });

    // ─── v1.0.0: 窗口位置恢复（物理坐标系） ───
    const savedPos = await storage.getWindowPosition();
    if (savedPos) {
      try {
        const mainWindow = getCurrentWindow();
        const { PhysicalPosition } = await import('@tauri-apps/api/dpi');
        const { availableMonitors } = await import('@tauri-apps/api/window');
        // 边界检查：确保坐标在某个可见显示器范围内
        const monitors = await availableMonitors();
        const isVisible = monitors.some((m) => {
          const mx = m.position.x;
          const my = m.position.y;
          const mw = m.size.width;
          const mh = m.size.height;
          return savedPos.x >= mx - 100 && savedPos.x < mx + mw
            && savedPos.y >= my - 100 && savedPos.y < my + mh;
        });
        if (isVisible) {
          await mainWindow.setPosition(new PhysicalPosition(savedPos.x, savedPos.y));
        } else {
          console.warn('保存的窗口位置超出可见区域，跳过恢复');
        }
      } catch (e) {
        console.warn('恢复窗口位置失败:', e);
      }
    }

    // ─── v1.0.0: 开机自启动初始化 ───
    const prefs = await storage.getPreferences();
    try {
      const autoStartEnabled = await isEnabled();
      if (prefs.autoStartEnabled && !autoStartEnabled) {
        await enable();
      } else if (!prefs.autoStartEnabled && autoStartEnabled) {
        await disable();
      }
    } catch (e) {
      console.warn('自启动设置失败:', e);
    }

    // 监听托盘菜单事件（保存 unlisten 函数，在 gracefulShutdown 中释放）
    unlistenAutostart = listen('tray:toggle-autostart', async () => {
      try {
        const enabled = await isEnabled();
        if (enabled) {
          await disable();
          await storage.setPreferences({ autoStartEnabled: false });
        } else {
          await enable();
          await storage.setPreferences({ autoStartEnabled: true });
        }
      } catch (e) {
        console.warn('切换自启动失败:', e);
      }
    });

    // 监听托盘菜单"查看回忆"
    unlistenMemories = listen('tray:open-memories', async () => {
      try {
        await memoryPanel.showPanel();
      } catch (e) {
        console.warn('打开回忆面板失败:', e);
      }
    });

    // ─── v1.0.0: 定时自动保存（每 2 分钟，减少非受控退出的数据丢失窗口） ───
    const AUTO_SAVE_INTERVAL = 2 * 60 * 1000;
    autoSaveTimer = window.setInterval(async () => {
      try {
        await memory.save();
        await storage.save();
      } catch (e) {
        console.warn('自动保存失败:', e);
      }
    }, AUTO_SAVE_INTERVAL);

    // ─── 监听 Rust 端托盘退出请求 ───
    unlistenRequestQuit = listen('app:request-quit', async () => {
      await gracefulShutdown();
      // 通知 Rust 端清理完成，取消强制退出超时
      try { await emit('app:shutdown-complete', {}); } catch { /* ignore */ }
      await exit(0);
    });

    // ─── 启动动画 & 功能模块 ───
    animation.start();
    await memory.start(); // 记忆系统需优先启动（加载历史数据）
    await quietMode.start(); // 低打扰模式需在功能模块之前启动
    idleCare.start();
    await hourlyChime.start();
    await systemMonitor.start();
    await contextAwareness.start();

    // ─── v0.5.0: 首次启动检测 + 特殊日期 + 时段问候 ───
    const lastActiveDate = await storage.get<string>(STORE_KEYS.LAST_ACTIVE_DATE, '');
    const today = getLocalDateKey();
    const isFirstLaunchToday = lastActiveDate !== today;

    // 记录今日活跃（放在检测之后，确保比较的是昨天的值）
    storage.recordActivity();

    // 延迟 3 秒启动特殊日期检查（等气泡系统完全就绪）
    setTimeout(async () => {
      await specialDates.checkToday();
      // 问候在特殊日期之后 2 秒触发（避免重叠）
      setTimeout(() => greeting.checkGreeting(isFirstLaunchToday), 2000);
      // v1.0.0: 首次启动展示回忆卡片（再延迟 3 秒，避免与问候/特殊日期重叠）
      if (isFirstLaunchToday) {
        setTimeout(() => memoryCard.showDailyCard(), 3000);
      }
    }, 3000);

    // ─── 生命周期（兜底：窗口被直接关闭时尝试清理） ───
    window.addEventListener('beforeunload', () => {
      // 仅在未进入 graceful 退出路径时标记脏退出，避免正常退出被误判
      markDirtyOnBeforeUnload(gracefulShutdownStarted);
      // beforeunload 是同步的，无法 await 异步操作
      // 核心保存已由 gracefulShutdown() 在各退出路径中完成
      // 此处仅做同步清理兜底
      gracefulShutdown();
    });

    // 静默检查更新（2 秒后，不阻塞主流程）
    setTimeout(() => updater.check(false), 2000);
  } catch (e) {
    console.error('启动失败:', e);
    showHint('启动失败：打开控制台查看详情', 3000);
  }
}

main();
