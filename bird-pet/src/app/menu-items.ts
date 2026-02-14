import { exit } from '@tauri-apps/plugin-process';
import type { MenuItem } from '@/core/menu';
import type { CoreModules, FeatureModules } from '@/app/types';

export function createMenuItems(
  core: CoreModules,
  features: FeatureModules,
  gracefulShutdown: () => Promise<void>,
): MenuItem[] {
  return [
    {
      type: 'action',
      id: 'idle',
      label: '▶ 待机（idle）',
      handler: () => {
        core.animation.play('idle');
        void core.menu.closeMenu();
      },
    },
    {
      type: 'action',
      id: 'look',
      label: '👀 左右张望（look）',
      handler: () => {
        core.animation.play('look');
        void core.menu.closeMenu();
      },
    },
    {
      type: 'action',
      id: 'tilt',
      label: '🙂 歪头（tilt）',
      handler: () => {
        core.animation.play('tilt');
        void core.menu.closeMenu();
      },
    },
    { type: 'separator', id: 'sep-anim' },
    {
      type: 'command',
      id: 'pomodoro',
      label: '🍅 番茄钟',
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
      type: 'command',
      id: 'check-update',
      label: '🔄 检查更新',
      handler: async () => {
        await core.menu.closeMenu();
        await core.updater.check(true);
      },
    },
    {
      type: 'command',
      id: 'toggle-through',
      label: '🖱 切换点击穿透',
      handler: async () => {
        await core.menu.closeMenu();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await core.clickThrough.toggle();
      },
    },
    {
      type: 'command',
      id: 'quit',
      label: '⛔ 退出',
      handler: async () => {
        await gracefulShutdown();
        await exit(0);
      },
    },
  ];
}
