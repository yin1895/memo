/**
 * 回忆面板管理器
 *
 * v1.0.0 新增。
 * 从托盘菜单"查看回忆"打开一个 WebviewWindow，
 * 展示亲密度进度、统计数字、7 天活动热力图和洞察列表。
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';
import type { MemorySystem } from '../core/memory';
import type { PetOwnerProfile } from '../core/storage';

/** 亲密度中文名 */
const AFFINITY_NAMES: Record<number, string> = {
  1: '初识',
  2: '熟悉',
  3: '亲密',
  4: '挚友',
};

/** 面板窗口尺寸 */
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 520;

export class MemoryPanelManager {
  private memory: MemorySystem;
  private daysSinceMet: number;
  private panelWin: WebviewWindow | null = null;

  constructor(memory: MemorySystem, _petOwner: PetOwnerProfile, daysSinceMet: number) {
    this.memory = memory;
    this.daysSinceMet = daysSinceMet;
  }

  /** 打开或聚焦回忆面板 */
  async showPanel(): Promise<void> {
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

    // 延迟一点发送数据，等 JS 初始化
    setTimeout(() => this.sendPanelData(), 300);
  }

  /** 向面板窗口发送数据 */
  private async sendPanelData(): Promise<void> {
    const profile = this.memory.getProfile();
    const snapshot = this.memory.getSnapshot();

    // 计算总番茄数
    const totalPomodoros = profile.dailySummaries.reduce(
      (sum, d) => sum + d.pomodoroCount, 0,
    );

    // 下一亲密度阈值
    const THRESHOLDS = [
      { level: 1, min: 0, next: 50 },
      { level: 2, min: 50, next: 200 },
      { level: 3, min: 200, next: 500 },
      { level: 4, min: 500, next: Infinity },
    ];

    const tier = THRESHOLDS.find(t => t.level === snapshot.affinityLevel) ?? THRESHOLDS[0];

    const panelData = {
      affinityLevel: snapshot.affinityLevel,
      affinityLabel: AFFINITY_NAMES[snapshot.affinityLevel] ?? '初识',
      totalInteractions: profile.totalInteractions,
      nextAffinityAt: tier.next,
      streak: snapshot.streak,
      daysSinceMet: this.daysSinceMet,
      sleepPattern: snapshot.sleepPattern,
      dominantApp: snapshot.dominantApp,
      workloadTrend: snapshot.workloadTrend,
      dailySummaries: profile.dailySummaries.map(s => ({
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
  dispose(): void {
    try {
      this.panelWin?.close();
    } catch { /* ignore */ }
  }
}
