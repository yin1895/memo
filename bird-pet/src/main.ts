/**
 * Bird Pet - 桌面宠物应用入口
 *
 * 此文件作为编排层：
 * 1. 初始化核心依赖与功能模块
 * 2. 绑定事件与菜单
 * 3. 管理生命周期与退出流程
 */
import './style.css';
import { unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { exit } from '@tauri-apps/plugin-process';
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, emit } from '@tauri-apps/api/event';
import { EventBus } from './events';
import type { AppEvents } from './types';
import { initHint, showHint, getLocalDateKey, calcDaysSinceMet } from './utils';
import { AnimationEngine } from './core/animation';
import { ClickThroughManager } from './core/click-through';
import { MenuController, type MenuItem } from './core/menu';
import { setupInteraction } from './core/interaction';
import { UpdateController } from './core/updater';
import { BubbleManager } from './core/bubble-manager';
import { StorageService, STORE_KEYS, type PetOwnerProfile } from './core/storage';
import { MemorySystem } from './core/memory';
import { EffectsManager } from './core/effects';
import { IdleCareScheduler } from './features/idle-care';
import { HourlyChime } from './features/hourly-chime';
import { PomodoroTimer } from './features/pomodoro';
import { SystemMonitor } from './features/system-monitor';
import { ContextAwareness } from './features/context-awareness';
import { DialogueEngine, type DialogueScene } from './features/dialogue-engine';
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

interface CoreModules {
  bus: EventBus<AppEvents>;
  app: HTMLDivElement;
  canvas: HTMLCanvasElement;
  animation: AnimationEngine;
  clickThrough: ClickThroughManager;
  menu: MenuController;
  bubble: BubbleManager;
  storage: StorageService;
  dialogue: DialogueEngine;
  effects: EffectsManager;
  memory: MemorySystem;
  quietMode: QuietModeManager;
  updater: UpdateController;
  petOwner: PetOwnerProfile;
}

interface FeatureModules {
  idleCare: IdleCareScheduler;
  hourlyChime: HourlyChime;
  pomodoro: PomodoroTimer;
  systemMonitor: SystemMonitor;
  contextAwareness: ContextAwareness;
  specialDates: SpecialDateManager;
  greeting: GreetingManager;
  memoryCard: MemoryCardManager;
  memoryPanel: MemoryPanelManager;
}

interface LifecycleController {
  gracefulShutdown: () => Promise<void>;
  setCleanupInteraction: (cleanup: () => void) => void;
  setUnlistenAutostart: (unlisten: Promise<() => void>) => void;
  setUnlistenMemories: (unlisten: Promise<() => void>) => void;
  setUnlistenRequestQuit: (unlisten: Promise<() => void>) => void;
  setAutoSaveTimer: (timer: number) => void;
}

function mustGetElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing required element: #${id}`);
  return el as T;
}

function createUpdaterController(): UpdateController {
  return new UpdateController({
    overlay: mustGetElement<HTMLDivElement>('update-overlay'),
    message: mustGetElement<HTMLDivElement>('update-message'),
    version: mustGetElement<HTMLDivElement>('update-version'),
    progressWrap: mustGetElement<HTMLDivElement>('update-progress-wrap'),
    progressBar: mustGetElement<HTMLDivElement>('update-progress-bar'),
    progressText: mustGetElement<HTMLDivElement>('update-progress-text'),
    btnNow: mustGetElement<HTMLButtonElement>('btn-update-now'),
    btnLater: mustGetElement<HTMLButtonElement>('btn-update-later'),
    btnSkip: mustGetElement<HTMLButtonElement>('btn-update-skip'),
  });
}

async function initCore(): Promise<CoreModules> {
  const bus = new EventBus<AppEvents>();

  const app = mustGetElement<HTMLDivElement>('app');
  const canvas = mustGetElement<HTMLCanvasElement>('pet');
  initHint(mustGetElement<HTMLDivElement>('hint'));

  const animation = new AnimationEngine(canvas, bus);
  await animation.load();

  const clickThrough = new ClickThroughManager(app, bus);
  const menu = new MenuController(mustGetElement<HTMLDivElement>('menu'), bus, clickThrough);

  const bubble = new BubbleManager();
  await bubble.init();

  const storage = new StorageService();
  const dialogue = new DialogueEngine(DIALOGUE_ENTRIES);
  const effects = new EffectsManager();

  const petOwner = await storage.getPetOwner();
  const daysSinceMet = calcDaysSinceMet(petOwner.metDate);
  dialogue.setGlobalVars({
    name: petOwner.name,
    nickname: petOwner.nicknames[0],
    nicknames: petOwner.nicknames,
    metDate: petOwner.metDate,
    daysSinceMet,
  });

  const memory = new MemorySystem(bus, storage);
  const quietMode = new QuietModeManager(bus, storage);
  const updater = createUpdaterController();

  return {
    bus,
    app,
    canvas,
    animation,
    clickThrough,
    menu,
    bubble,
    storage,
    dialogue,
    effects,
    memory,
    quietMode,
    updater,
    petOwner,
  };
}

function initFeatures(core: CoreModules): FeatureModules {
  const idleCare = new IdleCareScheduler(core.bus, core.bubble, core.dialogue, core.memory, core.quietMode);
  const hourlyChime = new HourlyChime(core.bubble, core.dialogue, core.storage, core.quietMode);
  const pomodoro = new PomodoroTimer(core.bus, core.bubble, hourlyChime, core.dialogue, core.storage);
  const systemMonitor = new SystemMonitor(core.bubble, core.storage);
  const contextAwareness = new ContextAwareness(
    core.bus,
    core.bubble,
    core.dialogue,
    core.storage,
    core.quietMode,
  );
  const specialDates = new SpecialDateManager(core.bubble, core.dialogue, core.effects, core.storage);
  const greeting = new GreetingManager(core.bubble, core.dialogue, core.effects);
  const memoryCard = new MemoryCardManager(
    core.bus,
    core.memory,
    core.storage,
    core.petOwner,
    core.petOwner.metDate,
  );
  const memoryPanel = new MemoryPanelManager(core.memory, core.petOwner.metDate);

  return {
    idleCare,
    hourlyChime,
    pomodoro,
    systemMonitor,
    contextAwareness,
    specialDates,
    greeting,
    memoryCard,
    memoryPanel,
  };
}

function bindBusinessEvents(core: CoreModules): void {
  core.bus.on('pet:clicked', () => {
    core.bubble.say({ text: core.dialogue.getLine('click'), priority: 'normal' });
    if (Math.random() > 0.5) {
      core.effects.playHearts();
    } else {
      core.effects.playSparks();
    }
    void core.storage.incrementInteraction();
  });

  core.bus.on('context:changed', ({ to }) => {
    core.effects.playForContext(to);
  });

  core.bus.on('pomodoro:focus', () => {
    core.effects.playBounce();
  });

  core.bus.on('memory:insight', ({ type }) => {
    const scene = `reflective_${type}` as DialogueScene;
    const snapshot = core.memory.getSnapshot();
    const line = core.dialogue.getLine(scene, { hour: new Date().getHours(), ...snapshot });
    if (line !== '啾啾！') {
      core.bubble.say({ text: line, priority: 'high', duration: 6000 });
    }
  });

  core.bus.on('memory:milestone', ({ message }) => {
    core.bubble.say({ text: `🏆 ${message}`, priority: 'high', duration: 6000 });
    core.effects.playConfetti();
  });
}

function initLifecycle(core: CoreModules, features: FeatureModules): LifecycleController {
  let shutdownCalled = false;
  let gracefulShutdownStarted = false;
  let cleanupInteraction: () => void = () => {};
  let unlistenAutostart: Promise<() => void> = Promise.resolve(() => {});
  let unlistenMemories: Promise<() => void> = Promise.resolve(() => {});
  let unlistenRequestQuit: Promise<() => void> = Promise.resolve(() => {});
  let autoSaveTimer = 0;

  const gracefulShutdown = async (): Promise<void> => {
    if (shutdownCalled) return;
    shutdownCalled = true;
    gracefulShutdownStarted = true;

    try {
      const mainWindow = getCurrentWindow();
      const pos = await mainWindow.outerPosition();
      await core.storage.setWindowPosition({ x: pos.x, y: pos.y });
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

    try {
      features.idleCare.stop();
      features.hourlyChime.stop();
      await features.pomodoro.stop();
      features.systemMonitor.stop();
      features.contextAwareness.destroy();
      core.quietMode.stop();
      core.memory.stop();
      core.animation.stop();
      features.memoryCard.dispose();
      features.memoryPanel.dispose();
    } catch (e) {
      console.warn('gracefulShutdown: 停止功能模块失败:', e);
    }

    try {
      await core.memory.save();
      await core.storage.save();
    } catch (e) {
      console.error('gracefulShutdown: 数据保存失败:', e);
    }

    try {
      await core.bubble.dispose();
      core.bus.dispose();
      await unregisterAll();
    } catch (e) {
      console.warn('gracefulShutdown: 清理全局资源失败:', e);
    }

    clearDirtyShutdown();
  };

  window.addEventListener('beforeunload', () => {
    markDirtyOnBeforeUnload(gracefulShutdownStarted);
  });

  return {
    gracefulShutdown,
    setCleanupInteraction: (cleanup) => {
      cleanupInteraction = cleanup;
    },
    setUnlistenAutostart: (unlisten) => {
      unlistenAutostart = unlisten;
    },
    setUnlistenMemories: (unlisten) => {
      unlistenMemories = unlisten;
    },
    setUnlistenRequestQuit: (unlisten) => {
      unlistenRequestQuit = unlisten;
    },
    setAutoSaveTimer: (timer) => {
      autoSaveTimer = timer;
    },
  };
}

function createMenuItems(
  core: CoreModules,
  features: FeatureModules,
  gracefulShutdown: () => Promise<void>,
): MenuItem[] {
  return [
    {
      type: 'action', id: 'idle', label: '▶ 待机（idle）',
      handler: () => {
        core.animation.play('idle');
        void core.menu.closeMenu();
      },
    },
    {
      type: 'action', id: 'look', label: '👀 左右张望（look）',
      handler: () => {
        core.animation.play('look');
        void core.menu.closeMenu();
      },
    },
    {
      type: 'action', id: 'tilt', label: '🙂 歪头（tilt）',
      handler: () => {
        core.animation.play('tilt');
        void core.menu.closeMenu();
      },
    },
    { type: 'separator', id: 'sep-anim' },
    {
      type: 'command', id: 'pomodoro', label: '🍅 番茄钟',
      handler: async () => {
        await core.menu.closeMenu();
        if (features.pomodoro.state === 'idle') {
          await features.pomodoro.start();
        } else {
          await features.pomodoro.stop();
        }
      },
    },
    { type: 'separator', id: 'sep-tools' },
    {
      type: 'command', id: 'check-update', label: '🔄 检查更新',
      handler: async () => {
        await core.menu.closeMenu();
        await core.updater.check(true);
      },
    },
    {
      type: 'command', id: 'toggle-through', label: '🖱 切换点击穿透',
      handler: async () => {
        await core.menu.closeMenu();
        await new Promise((r) => setTimeout(r, 100));
        await core.clickThrough.toggle();
      },
    },
    {
      type: 'command', id: 'quit', label: '⛔ 退出',
      handler: async () => {
        await gracefulShutdown();
        await exit(0);
      },
    },
  ];
}

async function restoreWindowPosition(storage: StorageService): Promise<void> {
  const savedPos = await storage.getWindowPosition();
  if (!savedPos) return;

  try {
    const mainWindow = getCurrentWindow();
    const { PhysicalPosition } = await import('@tauri-apps/api/dpi');
    const { availableMonitors } = await import('@tauri-apps/api/window');
    const monitors = await availableMonitors();
    const isVisible = monitors.some((m) => {
      const mx = m.position.x;
      const my = m.position.y;
      const mw = m.size.width;
      const mh = m.size.height;
      return savedPos.x >= mx - 100
        && savedPos.x < mx + mw
        && savedPos.y >= my - 100
        && savedPos.y < my + mh;
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

async function syncAutoStart(storage: StorageService): Promise<void> {
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
}

async function startModules(core: CoreModules, features: FeatureModules): Promise<void> {
  core.animation.start();
  await core.memory.start();
  await core.quietMode.start();
  features.idleCare.start();
  await features.hourlyChime.start();
  await features.systemMonitor.start();
  await features.contextAwareness.start();
}

async function runDailyStartupFlow(core: CoreModules, features: FeatureModules): Promise<void> {
  const lastActiveDate = await core.storage.get<string>(STORE_KEYS.LAST_ACTIVE_DATE, '');
  const today = getLocalDateKey();
  const isFirstLaunchToday = lastActiveDate !== today;

  await core.storage.recordActivity();

  setTimeout(async () => {
    await features.specialDates.checkToday();
    setTimeout(() => features.greeting.checkGreeting(isFirstLaunchToday), 2000);
    if (isFirstLaunchToday) {
      setTimeout(() => features.memoryCard.showDailyCard(), 3000);
    }
  }, 3000);
}

async function main() {
  try {
    const core = await initCore();
    const features = initFeatures(core);
    bindBusinessEvents(core);

    if (hasDirtyShutdown()) {
      console.warn('检测到上次非正常退出');
      setTimeout(() => {
        core.bubble.say({ text: '上次没来得及好好告别呢…这次我会好好守护数据的！', priority: 'low', duration: 5000 });
      }, 5000);
    }

    const lifecycle = initLifecycle(core, features);

    const menuItems = createMenuItems(core, features, lifecycle.gracefulShutdown);
    core.menu.setItems(menuItems);
    core.bus.on('menu:opened', () => {
      const el = document.querySelector('[data-id="pomodoro"]');
      if (el) el.textContent = features.pomodoro.getStatusLabel();
    });

    const cleanupInteraction = setupInteraction({
      canvas: core.canvas,
      app: core.app,
      animation: core.animation,
      clickThrough: core.clickThrough,
      menu: core.menu,
      bus: core.bus,
      quietMode: core.quietMode,
      onQuit: async () => {
        await lifecycle.gracefulShutdown();
        await exit(0);
      },
    });
    lifecycle.setCleanupInteraction(cleanupInteraction);

    await restoreWindowPosition(core.storage);
    await syncAutoStart(core.storage);

    lifecycle.setUnlistenAutostart(listen('tray:toggle-autostart', async () => {
      try {
        const enabled = await isEnabled();
        if (enabled) {
          await disable();
          await core.storage.setPreferences({ autoStartEnabled: false });
        } else {
          await enable();
          await core.storage.setPreferences({ autoStartEnabled: true });
        }
      } catch (e) {
        console.warn('切换自启动失败:', e);
      }
    }));

    lifecycle.setUnlistenMemories(listen('tray:open-memories', async () => {
      try {
        await features.memoryPanel.showPanel();
      } catch (e) {
        console.warn('打开回忆面板失败:', e);
      }
    }));

    const autoSaveTimer = window.setInterval(async () => {
      try {
        await core.memory.save();
        await core.storage.save();
      } catch (e) {
        console.warn('自动保存失败:', e);
      }
    }, 2 * 60 * 1000);
    lifecycle.setAutoSaveTimer(autoSaveTimer);

    lifecycle.setUnlistenRequestQuit(listen('app:request-quit', async () => {
      await lifecycle.gracefulShutdown();
      try {
        await emit('app:shutdown-complete', {});
      } catch {
        // ignore
      }
      await exit(0);
    }));

    await startModules(core, features);
    await runDailyStartupFlow(core, features);

    setTimeout(() => {
      void core.updater.check(false);
    }, 2000);
  } catch (e) {
    console.error('启动失败:', e);
    showHint('启动失败：打开控制台查看详情', 3000);
  }
}

main();
