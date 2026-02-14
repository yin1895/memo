import { getCurrentWindow } from '@tauri-apps/api/window';
import { unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { clearDirtyShutdown, markDirtyOnBeforeUnload } from '@/core/dirty-shutdown';
import type { CoreModules, FeatureModules, LifecycleController } from '@/app/types';

export function initLifecycle(core: CoreModules, features: FeatureModules): LifecycleController {
  let gracefulShutdownStarted = false;
  let cleanupInteraction: () => void = () => {};
  let unlistenAutostart: Promise<() => void> = Promise.resolve(() => {});
  let unlistenMemories: Promise<() => void> = Promise.resolve(() => {});
  let unlistenRequestQuit: Promise<() => void> = Promise.resolve(() => {});
  let autoSaveTimer = 0;

  const gracefulShutdown = async (): Promise<void> => {
    if (gracefulShutdownStarted) return;
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
      features.contextAwareness.dispose();
      core.quietMode.stop();
      core.memory.stop();
      core.animation.stop();
      features.memoryCard.dispose();
      await features.memoryPanel.dispose();
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
