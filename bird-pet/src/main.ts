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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysSinceMet = Math.max(0, Math.floor((today.getTime() - metDateObj.getTime()) / (1000 * 60 * 60 * 24)));
    dialogue.setGlobalVars({
      name: petOwner.name,
      nickname: petOwner.nicknames[0],
      nicknames: petOwner.nicknames,
      metDate: petOwner.metDate,
      daysSinceMet,
    });

    // ─── v0.4.0: 记忆系统 ───
    const memory = new MemorySystem(bus, storage);

    // ─── 功能模块 ───
    const idleCare = new IdleCareScheduler(bus, bubble, dialogue, memory);
    const hourlyChime = new HourlyChime(bubble, dialogue, storage);
    const pomodoro = new PomodoroTimer(bus, bubble, hourlyChime, dialogue);
    const systemMonitor = new SystemMonitor(bubble, storage);
    const contextAwareness = new ContextAwareness(bus, bubble, dialogue, storage);

    // ─── v0.5.0: 特殊日期 + 时段问候 ───
    const specialDates = new SpecialDateManager(bubble, dialogue, effects, storage);
    const greeting = new GreetingManager(bubble, dialogue, effects);

    // ─── v1.0.0: 回忆卡片管理器 ───
    const memoryCard = new MemoryCardManager(bus, memory, petOwner, daysSinceMet);

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
        handler: async () => { await unregisterAll(); await exit(0); },
      },
    ];
    menu.setItems(menuItems);

    // 菜单打开时刷新番茄钟状态
    bus.on('menu:opened', updatePomodoroLabel);

    // ─── 交互初始化 ───
    const cleanupInteraction = setupInteraction({
      canvas, app, animation, clickThrough, menu, bus,
    });

    // ─── 启动动画 & 功能模块 ───
    animation.start();
    await memory.start(); // 记忆系统需优先启动（加载历史数据）
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

    // ─── 生命周期 ───
    window.addEventListener('beforeunload', async () => {
      cleanupInteraction();
      idleCare.stop();
      hourlyChime.stop();
      pomodoro.stop();
      systemMonitor.stop();
      contextAwareness.destroy();
      memory.stop();
      memoryCard.dispose();
      await memory.save();
      await storage.save();
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
