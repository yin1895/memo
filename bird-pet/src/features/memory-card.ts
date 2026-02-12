/**
 * 回忆卡片管理器
 *
 * v1.0.0 新增。
 * 每天首次启动展示一张"回忆卡片"WebviewWindow，
 * 展示连续天数、距认识日天数、亲密度等级、里程碑等。
 * 同时负责里程碑检测与 memory:milestone 事件发射。
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';
import type { EventBus } from '../events';
import type { AppEvents, MemorySnapshot, UserProfile } from '../types';
import type { MemorySystem } from '../core/memory';
import type { PetOwnerProfile } from '../core/storage';

/** 亲密度等级名称 */
const AFFINITY_NAMES: Record<number, string> = {
  1: '初识',
  2: '熟悉',
  3: '亲密',
  4: '挚友',
};

/** 里程碑阈值 */
const STREAK_MILESTONES = [7, 14, 30, 50, 100, 200, 365];
const INTERACTION_MILESTONES = [100, 500, 1000, 2000, 5000];

export class MemoryCardManager {
  private bus: EventBus<AppEvents>;
  private memory: MemorySystem;
  private petOwner: PetOwnerProfile;
  private daysSinceMet: number;
  private cardWindow: WebviewWindow | null = null;

  constructor(
    bus: EventBus<AppEvents>,
    memory: MemorySystem,
    petOwner: PetOwnerProfile,
    daysSinceMet: number,
  ) {
    this.bus = bus;
    this.memory = memory;
    this.petOwner = petOwner;
    this.daysSinceMet = daysSinceMet;
  }

  /**
   * 展示回忆卡片（每天首次启动时调用）
   */
  async showDailyCard(): Promise<void> {
    try {
      const snapshot = this.memory.getSnapshot();
      const profile = this.memory.getProfile();
      const milestone = this.detectMilestone(snapshot, profile);

      // 发射里程碑事件
      if (milestone) {
        this.bus.emit('memory:milestone', {
          kind: milestone.kind,
          value: milestone.value,
          message: milestone.message,
        });
      }

      // 获取昨日数据
      const summaries = profile.dailySummaries;
      const yesterday = summaries.length > 0 ? summaries[summaries.length - 1] : null;

      const nickname = this.petOwner.nicknames[
        Math.floor(Math.random() * this.petOwner.nicknames.length)
      ];

      const cardData = {
        streak: snapshot.streak,
        daysSinceMet: this.daysSinceMet,
        totalInteractions: profile.totalInteractions,
        affinityName: AFFINITY_NAMES[snapshot.affinityLevel] || '初识',
        affinityLevel: snapshot.affinityLevel,
        yesterdayContext: yesterday?.dominantContext || 'unknown',
        yesterdayInteractions: yesterday?.interactionCount || 0,
        milestone: milestone?.message || '',
        nickname,
      };

      // 创建或获取卡片窗口
      await this.ensureCardWindow();

      // 等待窗口就绪后发送数据
      setTimeout(async () => {
        try {
          await emitTo('memory-card', 'memory-card:show', cardData);
        } catch {
          // 窗口可能还没就绪，再等一下
          setTimeout(async () => {
            try {
              await emitTo('memory-card', 'memory-card:show', cardData);
            } catch (e) {
              console.warn('回忆卡片发送数据失败:', e);
            }
          }, 1000);
        }
      }, 500);
    } catch (e) {
      console.warn('回忆卡片展示失败:', e);
    }
  }

  /**
   * 检测里程碑
   */
  private detectMilestone(
    snapshot: MemorySnapshot,
    profile: Readonly<UserProfile>,
  ): { kind: string; value: number; message: string } | null {
    // 连续天数里程碑
    for (const threshold of STREAK_MILESTONES) {
      if (snapshot.streak === threshold) {
        return {
          kind: 'streak',
          value: threshold,
          message: `连续陪伴 ${threshold} 天！`,
        };
      }
    }

    // 交互次数里程碑
    for (const threshold of INTERACTION_MILESTONES) {
      if (
        profile.totalInteractions >= threshold &&
        profile.totalInteractions < threshold + 10
      ) {
        return {
          kind: 'interaction',
          value: threshold,
          message: `累计互动突破 ${threshold} 次！`,
        };
      }
    }

    // 认识天数里程碑
    const metMilestones = [30, 50, 100, 200, 365];
    for (const threshold of metMilestones) {
      if (this.daysSinceMet === threshold) {
        return {
          kind: 'met_days',
          value: threshold,
          message: `认识第 ${threshold} 天！`,
        };
      }
    }

    return null;
  }

  private async ensureCardWindow(): Promise<void> {
    if (this.cardWindow) {
      try {
        await this.cardWindow.show();
        return;
      } catch {
        this.cardWindow = null;
      }
    }

    this.cardWindow = new WebviewWindow('memory-card', {
      url: 'memory-card.html',
      title: '回忆卡片',
      width: 300,
      height: 320,
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      center: true,
    });
  }

  dispose(): void {
    try {
      this.cardWindow?.close();
    } catch {
      // ignore
    }
    this.cardWindow = null;
  }
}
