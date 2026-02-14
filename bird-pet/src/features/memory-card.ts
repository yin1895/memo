/**
 * 回忆卡片管理器
 *
 * v1.0.0 新增。
 * 每天首次启动展示一张"回忆卡片"WebviewWindow，
 * 展示连续天数、距认识日天数、亲密度等级、里程碑等。
 * 同时负责里程碑检测与 memory:milestone 事件发射。
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import type { EventBus } from '../events';
import type { AppEvents, MemorySnapshot, UserProfile } from '../types';
import type { MemorySystem } from '../core/memory';
import type { PetOwnerProfile, StorageService } from '../core/storage';
import { AFFINITY_NAMES } from '../constants';
import { calcDaysSinceMet } from '../utils';

/** 里程碑阈值 */
const STREAK_MILESTONES = [7, 14, 30, 50, 100, 200, 365];
const INTERACTION_MILESTONES = [100, 500, 1000, 2000, 5000];

export class MemoryCardManager {
  private bus: EventBus<AppEvents>;
  private memory: MemorySystem;
  private storage: StorageService;
  private petOwner: PetOwnerProfile;
  private metDate: string;
  private cardWindow: WebviewWindow | null = null;
  private unlistenReady: (() => void) | null = null;

  constructor(
    bus: EventBus<AppEvents>,
    memory: MemorySystem,
    storage: StorageService,
    petOwner: PetOwnerProfile,
    metDate: string,
  ) {
    this.bus = bus;
    this.memory = memory;
    this.storage = storage;
    this.petOwner = petOwner;
    this.metDate = metDate;
  }

  /**
   * 展示回忆卡片（每天首次启动时调用）
   */
  async showDailyCard(): Promise<void> {
    try {
      const snapshot = this.memory.getSnapshot();
      const profile = this.memory.getProfile();
      const milestone = await this.detectMilestone(snapshot, profile);
      const daysSinceMet = calcDaysSinceMet(this.metDate);

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

      const nickname =
        this.petOwner.nicknames[Math.floor(Math.random() * this.petOwner.nicknames.length)];

      const cardData = {
        streak: snapshot.streak,
        daysSinceMet,
        totalInteractions: profile.totalInteractions,
        affinityName: AFFINITY_NAMES[snapshot.affinityLevel] || '初识',
        affinityLevel: snapshot.affinityLevel,
        yesterdayContext: yesterday?.dominantContext || 'unknown',
        yesterdayInteractions: yesterday?.interactionCount || 0,
        milestone: milestone?.message || '',
        nickname,
      };

      // 创建或获取卡片窗口
      // 先注册 ready 监听，再创建窗口，消除 emit 先于 listen 的竞态
      // （参照 BubbleManager.init() 正确模式）

      // 释放旧的 ready 监听（防止重复调用 showDailyCard 时泄漏）
      if (this.unlistenReady) {
        this.unlistenReady();
        this.unlistenReady = null;
      }

      // 等待子窗口发射 ready 事件后再发送数据
      await new Promise<void>((resolve, reject) => {
        const READY_TIMEOUT = 5000;
        let settled = false;
        let readyUnsub: (() => void) | null = null;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            console.warn('回忆卡片窗口就绪超时，尝试强制发送');
            emitTo('memory-card', 'memory-card:show', cardData).catch(() => {});
            resolve();
          }
        }, READY_TIMEOUT);

        // 先注册监听
        listen('memory-card:ready', async () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try {
            await emitTo('memory-card', 'memory-card:show', cardData);
            resolve();
          } catch (e) {
            reject(e);
          }
        }).then((unlisten) => {
          readyUnsub = unlisten;
          // 保存 unlisten，在 dispose 中释放
          this.unlistenReady = unlisten;
          // 若在 .then() 执行前已 settle，立即释放
          if (settled) {
            unlisten();
            this.unlistenReady = null;
          }
        });

        // 再创建窗口（确保 listen 先于子窗口 emit）
        this.ensureCardWindow().catch((e) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            readyUnsub?.();
            reject(e);
          }
        });
      });
    } catch (e) {
      console.warn('回忆卡片展示失败:', e);
    }
  }

  /**
   * 检测里程碑（持久化去重）
   */
  private async detectMilestone(
    snapshot: MemorySnapshot,
    profile: Readonly<UserProfile>,
  ): Promise<{ kind: string; value: number; message: string } | null> {
    const triggered = await this.storage.getTriggeredMilestones();
    const daysSinceMet = calcDaysSinceMet(this.metDate);

    // 连续天数里程碑（降序遍历，优先返回最高阶里程碑）
    for (const threshold of [...STREAK_MILESTONES].reverse()) {
      const key = `streak:${threshold}`;
      if (snapshot.streak >= threshold && !triggered.includes(key)) {
        await this.storage.addTriggeredMilestone(key);
        return {
          kind: 'streak',
          value: threshold,
          message: `连续陪伴 ${threshold} 天！`,
        };
      }
    }

    // 交互次数里程碑（降序遍历，优先返回最高阶里程碑）
    for (const threshold of [...INTERACTION_MILESTONES].reverse()) {
      const key = `interaction:${threshold}`;
      if (profile.totalInteractions >= threshold && !triggered.includes(key)) {
        await this.storage.addTriggeredMilestone(key);
        return {
          kind: 'interaction',
          value: threshold,
          message: `累计互动突破 ${threshold} 次！`,
        };
      }
    }

    // 认识天数里程碑（降序遍历，优先返回最高阶里程碑）
    const metMilestones = [30, 50, 100, 200, 365];
    for (const threshold of [...metMilestones].reverse()) {
      const key = `met_days:${threshold}`;
      if (daysSinceMet >= threshold && !triggered.includes(key)) {
        await this.storage.addTriggeredMilestone(key);
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

    await new Promise<void>((resolve, reject) => {
      this.cardWindow!.once('tauri://created', () => resolve());
      this.cardWindow!.once('tauri://error', (e) => reject(e));
    });
  }

  dispose(): void {
    try {
      if (this.unlistenReady) {
        this.unlistenReady();
        this.unlistenReady = null;
      }
      this.cardWindow?.close();
    } catch {
      // ignore
    }
    this.cardWindow = null;
  }
}
