/**
 * 时段问候管理器
 *
 * v0.5.0 新增。
 * 在每天首次启动时根据当前时段发送贴心问候。
 * 每个时段（早安/午安/傍晚/晚安/深夜）每天只触发一次。
 *
 * 触发条件：今日首次启动 + 当前处于某个时段。
 * 不补发错过的时段（自然一些）。
 */
import type { BubbleManager } from '../core/bubble-manager';
import type { DialogueEngine, DialogueScene } from './dialogue-engine';
import type { EffectsManager } from '../core/effects';

/** 时段定义 */
type TimePeriod = 'morning' | 'noon' | 'evening' | 'night' | 'latenight';

/** 时段配置：起止小时（24h 制）和对应场景 */
interface PeriodConfig {
  period: TimePeriod;
  scene: DialogueScene;
  /** 起始小时（含） */
  start: number;
  /** 结束小时（不含） */
  end: number;
}

/**
 * 时段划分
 *
 * - 深夜关怀：1:00 - 5:00
 * - 早安：6:00 - 10:00
 * - 午安：12:00 - 14:00
 * - 傍晚：17:00 - 19:00
 * - 晚安：22:00 - 次日 1:00（跨午夜）
 *
 * 10:00-12:00、14:00-17:00、19:00-22:00 不触发问候。
 */
const TIME_PERIODS: PeriodConfig[] = [
  { period: 'latenight', scene: 'greeting_latenight', start: 1, end: 5 },
  { period: 'morning', scene: 'greeting_morning', start: 6, end: 10 },
  { period: 'noon', scene: 'greeting_noon', start: 12, end: 14 },
  { period: 'evening', scene: 'greeting_evening', start: 17, end: 19 },
  { period: 'night', scene: 'greeting_night', start: 22, end: 25 }, // 25 = 次日 1 点
];

export class GreetingManager {
  private bubble: BubbleManager;
  private dialogue: DialogueEngine;
  private effects: EffectsManager;
  /** 已触发的时段（内存级，重启后重置） */
  private triggeredPeriods: Set<TimePeriod> = new Set();

  constructor(
    bubble: BubbleManager,
    dialogue: DialogueEngine,
    effects: EffectsManager,
  ) {
    this.bubble = bubble;
    this.dialogue = dialogue;
    this.effects = effects;
  }

  /**
   * 检查并发送时段问候
   *
   * @param isFirstLaunchToday - 是否为今日首次启动
   */
  checkGreeting(isFirstLaunchToday: boolean): void {
    if (!isFirstLaunchToday) return;

    const hour = new Date().getHours();
    const matched = this.getCurrentPeriod(hour);

    if (!matched) return;
    if (this.triggeredPeriods.has(matched.period)) return;

    this.triggeredPeriods.add(matched.period);

    const line = this.dialogue.getLine(matched.scene);
    this.bubble.say({ text: line, priority: 'high', duration: 5000 });

    // 时段氛围特效
    if (matched.period === 'morning') {
      setTimeout(() => this.effects.playSunshine(), 300);
    } else if (matched.period === 'night' || matched.period === 'latenight') {
      setTimeout(() => this.effects.playZzz(), 300);
    }
  }

  // ─── 内部 ───

  /**
   * 判断当前小时落在哪个时段
   * 使用 25 小时制处理跨午夜：22:00-25:00（即 22:00-1:00）
   */
  private getCurrentPeriod(hour: number): PeriodConfig | null {
    // 对 0 点的特殊处理：映射到 24（属于"晚安"时段 22-25）
    const normalizedHour = hour === 0 ? 24 : hour;

    for (const tp of TIME_PERIODS) {
      if (normalizedHour >= tp.start && normalizedHour < tp.end) {
        return tp;
      }
    }
    return null;
  }
}
