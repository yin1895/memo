/**
 * 番茄钟
 *
 * 25 分钟专注 → 5 分钟休息，循环运作。
 * 通过气泡通知用户状态切换，
 * 通过 EventBus 广播状态供其他模块响应。
 */
import type { AppEvents } from '../types';
import type { EventBus } from '../events';
import type { BubbleManager } from '../core/bubble-manager';
import { STORE_KEYS, type StorageService } from '../core/storage';
import type { HourlyChime } from './hourly-chime';
import type { DialogueEngine } from './dialogue-engine';
import { getLocalDateKey } from '../utils';

/** 专注时长（毫秒）= 25 分钟 */
const FOCUS_DURATION = 25 * 60 * 1000;
/** 休息时长（毫秒）= 5 分钟 */
const BREAK_DURATION = 5 * 60 * 1000;

export type PomodoroState = 'idle' | 'focus' | 'break';

export class PomodoroTimer {
  private _bus: EventBus<AppEvents>;
  private bubble: BubbleManager;
  private hourlyChime: HourlyChime;
  private dialogue: DialogueEngine;
  private storage: StorageService;

  private _state: PomodoroState = 'idle';
  private timer: number | null = null;
  private startedAt = 0;
  private completedCount = 0;

  /** 当前状态 */
  get state(): PomodoroState {
    return this._state;
  }

  /** 已完成的番茄数 */
  get completed(): number {
    return this.completedCount;
  }

  /** 当前阶段剩余毫秒数 */
  get remainingMs(): number {
    if (this._state === 'idle' || !this.startedAt) return 0;
    const duration = this._state === 'focus' ? FOCUS_DURATION : BREAK_DURATION;
    const elapsed = Date.now() - this.startedAt;
    return Math.max(0, duration - elapsed);
  }

  constructor(
    bus: EventBus<AppEvents>,
    bubble: BubbleManager,
    hourlyChime: HourlyChime,
    dialogue: DialogueEngine,
    storage: StorageService,
  ) {
    this._bus = bus;
    this.bubble = bubble;
    this.hourlyChime = hourlyChime;
    this.dialogue = dialogue;
    this.storage = storage;
  }

  /** 开始/重启番茄钟 */
  async start(): Promise<void> {
    await this.loadPersistedCount();
    this.clearTimer();
    this._state = 'focus';
    this.startedAt = Date.now();
    this._bus.emit('pomodoro:focus');
    this.hourlyChime.setEnabled(false); // 专注时暂停整点报时
    this.bubble.say({
      text: this.dialogue.getLine('pomodoro_start'),
      priority: 'high',
      duration: 3000,
    });
    this.timer = setTimeout(() => this.onFocusEnd(), FOCUS_DURATION);
  }

  /** 停止番茄钟 */
  async stop(): Promise<void> {
    this.clearTimer();
    this._state = 'idle';
    this._bus.emit('pomodoro:stop');
    this.hourlyChime.setEnabled(true); // 恢复整点报时
    this.bubble.sayText('番茄钟已停止！今天完成了 ' + this.completedCount + ' 个 🍅');
    await this.persistState();
  }

  /** 获取状态标签（用于菜单显示） */
  getStatusLabel(): string {
    if (this._state === 'idle') return '🍅 番茄钟';
    if (this._state === 'focus') {
      const min = Math.ceil(this.remainingMs / 60000);
      return `🍅 专注中（${min} 分钟）`;
    }
    const min = Math.ceil(this.remainingMs / 60000);
    return `☕ 休息中（${min} 分钟）`;
  }

  // ─── 内部 ───

  private onFocusEnd(): void {
    this.completedCount++;
    void this.persistState();
    this._state = 'break';
    this.startedAt = Date.now();
    this._bus.emit('pomodoro:break');
    this.hourlyChime.setEnabled(true); // 休息时恢复整点报时
    this.bubble.say({
      text: this.dialogue.getLine('pomodoro_break'),
      priority: 'high',
      duration: 4000,
    });
    this.timer = setTimeout(() => this.onBreakEnd(), BREAK_DURATION);
  }

  private onBreakEnd(): void {
    this._state = 'focus';
    this.startedAt = Date.now();
    this._bus.emit('pomodoro:focus');
    this.hourlyChime.setEnabled(false); // 专注时暂停整点报时
    this.bubble.say({
      text: this.dialogue.getLine('pomodoro_resume'),
      priority: 'high',
      duration: 3000,
    });
    this.timer = setTimeout(() => this.onFocusEnd(), FOCUS_DURATION);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async loadPersistedCount(): Promise<void> {
    try {
      const today = getLocalDateKey();
      const persistedDate = await this.storage.get<string>(STORE_KEYS.POMODORO_DATE, '');

      if (persistedDate !== today) {
        this.completedCount = 0;
        await this.storage.set(STORE_KEYS.POMODORO_DATE, today);
        await this.storage.set(STORE_KEYS.POMODORO_COUNT, 0);
        return;
      }

      this.completedCount = await this.storage.get<number>(STORE_KEYS.POMODORO_COUNT, 0);
    } catch (e) {
      this.completedCount = 0;
      console.warn('读取番茄持久化状态失败，使用默认值:', e);
    }
  }

  private async persistState(): Promise<void> {
    try {
      const today = getLocalDateKey();
      await this.storage.set(STORE_KEYS.POMODORO_DATE, today);
      await this.storage.set(STORE_KEYS.POMODORO_COUNT, this.completedCount);
    } catch (e) {
      console.warn('保存番茄持久化状态失败:', e);
    }
  }
}
