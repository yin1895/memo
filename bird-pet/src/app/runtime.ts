import { getCurrentWindow } from '@tauri-apps/api/window';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import type { StorageService } from '@/core/storage';
import type { CoreModules, FeatureModules } from '@/app/types';

export async function restoreWindowPosition(storage: StorageService): Promise<void> {
  const savedPos = await storage.getWindowPosition();
  if (!savedPos) return;

  try {
    const mainWindow = getCurrentWindow();
    const { PhysicalPosition } = await import('@tauri-apps/api/dpi');
    const { availableMonitors } = await import('@tauri-apps/api/window');
    const monitors = await availableMonitors();
    const isVisible = monitors.some((monitor) => {
      const mx = monitor.position.x;
      const my = monitor.position.y;
      const mw = monitor.size.width;
      const mh = monitor.size.height;
      return (
        savedPos.x >= mx - 100 &&
        savedPos.x < mx + mw &&
        savedPos.y >= my - 100 &&
        savedPos.y < my + mh
      );
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

export async function syncAutoStart(storage: StorageService): Promise<void> {
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

export async function startModules(core: CoreModules, features: FeatureModules): Promise<void> {
  core.animation.start();
  await core.memory.start();
  await core.quietMode.start();
  features.idleCare.start();
  await features.hourlyChime.start();
  await features.systemMonitor.start();
  await features.contextAwareness.start();
}
