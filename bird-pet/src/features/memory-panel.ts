/**
 * 回忆面板管理器
 *
 * v1.0.0 新增。
 * 从托盘菜单"查看回忆"打开一个 WebviewWindow，
 * 展示亲密度进度、统计数字、7 天活动热力图和洞察列表。
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import type { MemorySystem } from '../core/memory';
import { AFFINITY_NAMES, AFFINITY_THRESHOLDS } from '../constants';
import { calcDaysSinceMet } from '../utils';

/** 面板窗口尺寸 */
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 520;

export class MemoryPanelManager {
  private memory: MemorySystem;
  private metDate: string;
  private panelWin: WebviewWindow | null = null;
  private creatingPromise: Promise<void> | null = null;

  constructor(memory: MemorySystem, metDate: string) {
    this.memory = memory;
    this.metDate = metDate;
  }

  /** 打开或聚焦回忆面板 */
  async showPanel(): Promise<void> {
    if (this.creatingPromise) {
      await this.creatingPromise;
      return;
    }

    // 如果窗口已存在，聚焦并刷新数据
    const existing = await WebviewWindow.getByLabel('memory-panel');
    if (existing) {
      try {
        await existing.show();
        await existing.setFocus();
        await this.sendPanelData();
        return;
      } catch {
        // 窗口可能已关闭，重新创建
        this.panelWin = null;
      }
    }

    this.creatingPromise = this.createPanelWindow();
    try {
      await this.creatingPromise;
    } finally {
      this.creatingPromise = null;
    }
  }

  private async createPanelWindow(): Promise<void> {
    // 先注册 ready 监听，再创建窗口，消除事件竞态
    let readyResolve: (() => void) | null = null;
    const readyPromise = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    const readyUnlistenPromise = listen('memory-panel:ready', () => {
      readyResolve?.();
    });

    // 创建新面板窗口
    this.panelWin = new WebviewWindow('memory-panel', {
      url: '/memory-panel.html',
      title: '我们的回忆',
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      center: true,
      resizable: false,
      decorations: true,
      transparent: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      focus: true,
    });

    // 等待窗口创建完成后发送数据
    await new Promise<void>((resolve, reject) => {
      this.panelWin!.once('tauri://created', () => resolve());
      this.panelWin!.once('tauri://error', (e) => reject(e));
    });

    try {
      await Promise.race([
        readyPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('memory-panel:ready timeout')), 3000),
        ),
      ]);
    } catch (e) {
      console.warn('回忆面板就绪超时，继续尝试发送数据:', e);
    } finally {
      const readyUnlisten = await readyUnlistenPromise;
      readyUnlisten();
    }

    await this.sendPanelData();
  }

  /** 向面板窗口发送数据 */
  private async sendPanelData(): Promise<void> {
    const profile = this.memory.getProfile();
    const snapshot = this.memory.getSnapshot();

    // 计算总番茄数
    const totalPomodoros = profile.dailySummaries.reduce((sum, d) => sum + d.pomodoroCount, 0);

    const tier =
      AFFINITY_THRESHOLDS.find((t) => t.level === snapshot.affinityLevel) ?? AFFINITY_THRESHOLDS[0];

    const panelData = {
      affinityLevel: snapshot.affinityLevel,
      affinityLabel: AFFINITY_NAMES[snapshot.affinityLevel] ?? '初识',
      totalInteractions: profile.totalInteractions,
      nextAffinityAt: tier.next,
      streak: snapshot.streak,
      daysSinceMet: calcDaysSinceMet(this.metDate),
      sleepPattern: snapshot.sleepPattern,
      dominantApp: snapshot.dominantApp,
      workloadTrend: snapshot.workloadTrend,
      dailySummaries: profile.dailySummaries.map((s) => ({
        date: s.date,
        interactionCount: s.interactionCount,
        pomodoroCount: s.pomodoroCount,
        dominantContext: s.dominantContext,
        activeHours: s.activeHours,
      })),
      totalPomodoros,
    };

    try {
      await emitTo('memory-panel', 'memory-panel:show', panelData);
    } catch (e) {
      console.warn('发送面板数据失败:', e);
    }
  }

  /** 清理资源 */
  async dispose(): Promise<void> {
    if (this.creatingPromise) {
      try {
        await this.creatingPromise;
      } catch {
        // ignore
      }
    }
    try {
      await this.panelWin?.close();
    } catch {
      /* ignore */
    }
    this.panelWin = null;
  }
}
