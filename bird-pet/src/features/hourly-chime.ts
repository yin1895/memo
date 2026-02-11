/**
 * 整点报时
 *
 * 每到整点，小鸟弹出一条与当前时间相关的元气台词。
 * 使用精确的整点对齐算法，避免漂移。
 */
import type { BubbleManager } from '../core/bubble-manager';
import type { DialogueEngine } from './dialogue-engine';
import type { StorageService } from '../core/storage';

export class HourlyChime {
  private bubble: BubbleManager;
  private dialogue: DialogueEngine;
  private storage: StorageService | null;
  private timer: number | null = null;
  private enabled = true;

  constructor(bubble: BubbleManager, dialogue: DialogueEngine, storage?: StorageService) {
    this.bubble = bubble;
    this.dialogue = dialogue;
    this.storage = storage ?? null;
  }

  /** 启动整点报时 */
  async start(): Promise<void> {
    if (this.storage) {
      const prefs = await this.storage.getPreferences();
      if (!prefs.hourlyChimeEnabled) return;
    }
    this.scheduleNext();
  }

  /** 停止整点报时 */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 暂停/恢复（番茄钟专注时可暂停以减少干扰） */
  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  private scheduleNext(): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(now.getHours() + 1, 0, 0, 0);
    const delay = next.getTime() - now.getTime();

    this.timer = window.setTimeout(() => {
      if (this.enabled) {
        this.chime();
      }
      // 递归调度下一个整点
      this.scheduleNext();
    }, delay);
  }

  private chime(): void {
    const hour = new Date().getHours();
    const text = this.dialogue.getLine('hourly', { hour });
    this.bubble.say({
      text,
      priority: 'normal',
      duration: 4000,
    });
  }
}
