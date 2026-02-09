/**
 * 闲置关怀调度器
 *
 * 跟踪用户在电脑前的活动状态：
 * - 久坐提醒：每 30 分钟提醒一次伸展
 * - 低频正能量：长时间闲置时偶尔鼓励
 */
import type { AppEvents } from '../types';
import type { EventBus } from '../events';
import type { BubbleManager } from '../core/bubble-manager';
import { randomLine, IDLE_CARE_LINES, AFFIRMATION_LINES } from './messages';

/** 久坐提醒间隔（毫秒）= 30 分钟 */
const SEDENTARY_INTERVAL = 30 * 60 * 1000;
/** 正能量触发间隔（毫秒）= 2 小时 */
const AFFIRMATION_INTERVAL = 2 * 60 * 60 * 1000;
/** 正能量触发概率 */
const AFFIRMATION_PROBABILITY = 0.6;

export class IdleCareScheduler {
  private bus: EventBus<AppEvents>;
  private bubble: BubbleManager;

  private sedentaryTimer: number | null = null;
  private affirmationTimer: number | null = null;
  private lastActivity = Date.now();

  constructor(bus: EventBus<AppEvents>, bubble: BubbleManager) {
    this.bus = bus;
    this.bubble = bubble;
  }

  /** 启动调度 */
  start(): void {
    // 监听用户活动事件，重置计时
    this.bus.on('pet:clicked', () => this.recordActivity());
    this.bus.on('pet:dragged', () => this.recordActivity());
    this.bus.on('menu:opened', () => this.recordActivity());

    // 久坐提醒定时器
    this.sedentaryTimer = window.setInterval(() => {
      const elapsed = Date.now() - this.lastActivity;
      if (elapsed >= SEDENTARY_INTERVAL) {
        this.bubble.say({
          text: randomLine(IDLE_CARE_LINES),
          priority: 'normal',
          duration: 5000,
        });
        // 提醒后重置，避免连续触发
        this.lastActivity = Date.now();
      }
    }, 60 * 1000); // 每分钟检查一次

    // 正能量定时器
    this.affirmationTimer = window.setInterval(() => {
      if (Math.random() < AFFIRMATION_PROBABILITY) {
        this.bubble.say({
          text: randomLine(AFFIRMATION_LINES),
          priority: 'low',
          duration: 5000,
        });
      }
    }, AFFIRMATION_INTERVAL);
  }

  /** 停止调度 */
  stop(): void {
    if (this.sedentaryTimer !== null) {
      clearInterval(this.sedentaryTimer);
      this.sedentaryTimer = null;
    }
    if (this.affirmationTimer !== null) {
      clearInterval(this.affirmationTimer);
      this.affirmationTimer = null;
    }
  }

  private recordActivity(): void {
    this.lastActivity = Date.now();
  }
}
