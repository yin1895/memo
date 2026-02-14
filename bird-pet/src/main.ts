/**
 * Bird Pet - 桌面宠物应用入口
 *
 * 此文件作为编排层：
 * 1. 初始化核心依赖与功能模块
 * 2. 绑定事件与菜单
 * 3. 管理生命周期与退出流程
 */
import './style.css';
import { emit, listen } from '@tauri-apps/api/event';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { exit } from '@tauri-apps/plugin-process';
import { bindBusinessEvents } from '@/app/business-events';
import { initLifecycle } from '@/app/lifecycle';
import { createMenuItems } from '@/app/menu-items';
import { restoreWindowPosition, startModules, syncAutoStart } from '@/app/runtime';
import { getAutoSaveIntervalMs, runDailyStartupFlow } from '@/app/startup-flow';
import type { CoreModules, FeatureModules } from '@/app/types';
import { AnimationEngine } from '@/core/animation';
import { BubbleManager } from '@/core/bubble-manager';
import { ClickThroughManager } from '@/core/click-through';
import { EffectsManager } from '@/core/effects';
import { setupInteraction } from '@/core/interaction';
import { MenuController } from '@/core/menu';
import { MemorySystem } from '@/core/memory';
import { StorageService } from '@/core/storage';
import { UpdateController } from '@/core/updater';
import { EventBus } from '@/events';
import { ContextAwareness } from '@/features/context-awareness';
import { DialogueEngine } from '@/features/dialogue-engine';
import { GreetingManager } from '@/features/greeting';
import { HourlyChime } from '@/features/hourly-chime';
import { IdleCareScheduler } from '@/features/idle-care';
import { MemoryCardManager } from '@/features/memory-card';
import { MemoryPanelManager } from '@/features/memory-panel';
import { DIALOGUE_ENTRIES } from '@/features/messages';
import { PomodoroTimer } from '@/features/pomodoro';
import { QuietModeManager } from '@/features/quiet-mode';
import { SpecialDateManager } from '@/features/special-dates';
import { SystemMonitor } from '@/features/system-monitor';
import type { AppEvents } from '@/types';
import { calcDaysSinceMet, initHint, showHint } from '@/utils';
import { hasDirtyShutdown } from '@/core/dirty-shutdown';

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
  const idleCare = new IdleCareScheduler(
    core.bus,
    core.bubble,
    core.dialogue,
    core.memory,
    core.quietMode,
  );
  const hourlyChime = new HourlyChime(core.bubble, core.dialogue, core.storage, core.quietMode);
  const pomodoro = new PomodoroTimer(
    core.bus,
    core.bubble,
    hourlyChime,
    core.dialogue,
    core.storage,
  );
  const systemMonitor = new SystemMonitor(core.bubble, core.storage);
  const contextAwareness = new ContextAwareness(
    core.bus,
    core.bubble,
    core.dialogue,
    core.storage,
    core.quietMode,
  );
  const specialDates = new SpecialDateManager(
    core.bubble,
    core.dialogue,
    core.effects,
    core.storage,
  );
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

async function main() {
  try {
    const core = await initCore();
    const features = initFeatures(core);
    bindBusinessEvents(core);

    if (hasDirtyShutdown()) {
      console.warn('检测到上次非正常退出');
      setTimeout(() => {
        core.bubble.say({
          text: '上次没来得及好好告别呢…这次我会好好守护数据的！',
          priority: 'low',
          duration: 5000,
        });
      }, 5000);
    }

    const lifecycle = initLifecycle(core, features);

    core.menu.setItems(createMenuItems(core, features, lifecycle.gracefulShutdown));
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

    lifecycle.setUnlistenAutostart(
      listen('tray:toggle-autostart', async () => {
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
      }),
    );

    lifecycle.setUnlistenMemories(
      listen('tray:open-memories', async () => {
        try {
          await features.memoryPanel.showPanel();
        } catch (e) {
          console.warn('打开回忆面板失败:', e);
        }
      }),
    );

    const autoSaveTimer = window.setInterval(async () => {
      try {
        await core.memory.save();
        await core.storage.save();
      } catch (e) {
        console.warn('自动保存失败:', e);
      }
    }, getAutoSaveIntervalMs());
    lifecycle.setAutoSaveTimer(autoSaveTimer);

    lifecycle.setUnlistenRequestQuit(
      listen('app:request-quit', async () => {
        await lifecycle.gracefulShutdown();
        try {
          await emit('app:shutdown-complete', {});
        } catch {
          // ignore
        }
        await exit(0);
      }),
    );

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
